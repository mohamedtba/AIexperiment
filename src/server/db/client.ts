import 'server-only';

import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '../env';
import { SCHEMA_STATEMENTS } from './schema';

/**
 * PostgreSQL connection management (Neon, Render, Supabase, local server…).
 *
 * The pool is cached on `globalThis` so Next.js hot reloads and serverless
 * invocations reuse the same set of connections instead of opening a new one on
 * every request.
 */

declare global {
  var __atelierPool: Pool | undefined;
  var __atelierSchema: Promise<void> | undefined;
}

const globalForPool = globalThis as typeof globalThis & {
  __atelierPool?: Pool;
  __atelierSchema?: Promise<void>;
};

/** A dropped connection is retried a couple of times before giving up. */
const MAX_RETRY = 2;
const RETRY_DELAY_MS = 150;

function createPool(): Pool {
  const pool = new Pool({
    // The TLS behaviour is entirely driven by `DATABASE_URL`
    // (`sslmode=verify-full`, `require` or `disable`): the pool never overrides
    // it, so a managed provider such as Neon keeps its verified certificate.
    connectionString: env.databaseUrl,
    max: 5,
    // Serverless PostgreSQL (Neon, Supabase) closes idle connections on its own
    // schedule and when the compute scales to zero, so a socket can be dead by
    // the time the pool hands it out. Recycling ours proactively keeps that rare;
    // the retry below covers the rest.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    // Detect a peer that vanished without a TCP FIN (scale-to-zero, NAT timeout).
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  // A connection killed by the provider surfaces here instead of surfacing on the
  // next query: the pool discards it, so the next call reconnects.
  pool.on('error', (error: Error) => {
    console.warn('[postgresql] Connexion fermee par le serveur :', error.message);
  });

  return pool;
}

export function getPool(): Pool {
  if (!globalForPool.__atelierPool) {
    globalForPool.__atelierPool = createPool();
  }
  return globalForPool.__atelierPool;
}

/**
 * Applies the schema exactly once per server instance. The statements are
 * idempotent (`if not exists`), so running them again is harmless: an existing
 * deployment is never altered.
 *
 * The memo lives on `globalThis` so a Next.js recompilation in development does
 * not replay the whole DDL on the next request.
 */
export function ensureSchemaOnce(): Promise<void> {
  if (!globalForPool.__atelierSchema) {
    globalForPool.__atelierSchema = runSchema().catch((error: unknown) => {
      globalForPool.__atelierSchema = undefined;
      console.error(
        '[postgresql] Creation du schema impossible :',
        error instanceof Error ? error.message : error,
      );
    });
  }
  return globalForPool.__atelierSchema;
}

async function runSchema(): Promise<void> {
  // Every statement is `if not exists`, so replaying them after a dropped
  // connection is harmless and simply re-establishes the guarantees.
  const apply = async () => {
    const client = await getPool().connect();
    try {
      for (const statement of SCHEMA_STATEMENTS) {
        await client.query(statement);
      }
    } finally {
      client.release();
    }
  };

  try {
    await apply();
  } catch (error) {
    if (!isDeadConnection(error)) throw error;
    await apply();
  }
}

/** Wording emitted by `pg` (and by the socket layer) for a connection that died. */
const DEAD_CONNECTION_SIGNATURES = [
  'Connection terminated unexpectedly',
  'Connection terminated due to connection timeout',
  'Connection terminated',
  'Connection ended',
  'server closed the connection unexpectedly',
  'Client has encountered a connection error',
  'Connection reset by peer',
  'socket hang up',
  'EPIPE',
  'ECONNRESET',
  // Every pooled connection was unreachable: the provider is unreachable or
  // still waking up, but the statement itself never ran.
  'timeout exceeded when trying to connect',
];

/**
 * True when the failure is a connection that died before the statement could
 * run (serverless compute scaled to zero, idle socket reaped, network reset).
 *
 * Such a statement never reached PostgreSQL, so retrying it on a fresh
 * connection is safe: this is NOT the case of a constraint violation or of any
 * other server-side error, which is never retried.
 */
function isDeadConnection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  // `pg` wraps the socket failure in `cause` (`{ cause: [Error] }` for pooled
  // clients), and the outer wording alone is not always conclusive.
  const candidates = [error, (error as { cause?: unknown }).cause];
  return candidates.some((candidate) => {
    if (!candidate) return false;
    const message = candidate instanceof Error ? candidate.message : String(candidate);
    return DEAD_CONNECTION_SIGNATURES.some((needle) => message.includes(needle));
  });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a query, retrying on a fresh connection when the pooled connection had
 * been closed by the provider in the meantime. A class experiment must not fail
 * because a background socket expired between two requests.
 *
 * The short pause lets the pool discard its dead clients before the retry, so
 * the second attempt opens a new connection instead of picking the same corpse.
 */
async function runWithRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isDeadConnection(error) || attempt >= MAX_RETRY) throw error;
      await delay(RETRY_DELAY_MS * (attempt + 1));
    }
  }
}

/** Runs a parameterised query and returns every row. */
export async function query<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await runWithRetry(() => getPool().query<T>(text, params as unknown[]));
  return result.rows;
}

/** Runs a parameterised query expected to return at most one row. */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Runs a parameterised command and returns the number of affected rows. */
export async function execute(text: string, params: readonly unknown[] = []): Promise<number> {
  const result = await runWithRetry(() => getPool().query(text, params as unknown[]));
  return result.rowCount ?? 0;
}

/**
 * Executes `work` inside a transaction: it is committed on success and rolled
 * back on any error, so a failed operation never leaves partial data behind.
 */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  // `begin` is retried on a dead connection: nothing has been written yet, so
  // the transaction can safely start again on a fresh one. Once `work` has run,
  // any failure is reported as-is (the rollback below restores the data).
  const client = await runWithRetry(async () => {
    const acquired = await getPool().connect();
    try {
      await acquired.query('begin');
      return acquired;
    } catch (error) {
      acquired.release();
      throw error;
    }
  });

  try {
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Explicit close, used by scripts and tests. */
export async function closeDatabase(): Promise<void> {
  const pool = globalForPool.__atelierPool;
  if (pool) {
    await pool.end();
    globalForPool.__atelierPool = undefined;
    globalForPool.__atelierSchema = undefined;
  }
}