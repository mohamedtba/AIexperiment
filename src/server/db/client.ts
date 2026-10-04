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
}

const globalForPool = globalThis as typeof globalThis & {
  __atelierPool?: Pool;
};

/** Memoised schema creation (one attempt per server instance, retried on failure). */
let schemaPromise: Promise<void> | null = null;

function createPool(): Pool {
  return new Pool({
    // The TLS behaviour is entirely driven by `DATABASE_URL`
    // (`sslmode=verify-full`, `require` or `disable`): the pool never overrides
    // it, so a managed provider such as Neon keeps its verified certificate.
    connectionString: env.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
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
 */
export function ensureSchemaOnce(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = runSchema().catch((error: unknown) => {
      schemaPromise = null;
      console.error(
        '[postgresql] Creation du schema impossible :',
        error instanceof Error ? error.message : error,
      );
    });
  }
  return schemaPromise;
}

async function runSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    for (const statement of SCHEMA_STATEMENTS) {
      await client.query(statement);
    }
  } finally {
    client.release();
  }
}

/** Runs a parameterised query and returns every row. */
export async function query<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as unknown[]);
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
  const result = await getPool().query(text, params as unknown[]);
  return result.rowCount ?? 0;
}

/**
 * Executes `work` inside a transaction: it is committed on success and rolled
 * back on any error, so a failed operation never leaves partial data behind.
 */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
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
    schemaPromise = null;
  }
}