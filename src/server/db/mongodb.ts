import 'server-only';

import { MongoClient, type Collection, type Db, type Document } from 'mongodb';
import { env } from '../env';
import { ensureIndexes } from './indexes';

/**
 * MongoDB connection management.
 *
 * The client is cached on `globalThis` so Next.js hot reloads and serverless
 * invocations reuse a single connection pool (Atlas recommends it).
 */

declare global {
  var __atelierMongo: {
    client: MongoClient;
    db: Db;
    indexesEnsured: boolean;
  } | undefined;
}

const globalForMongo = globalThis as typeof globalThis & {
  __atelierMongo?: { client: MongoClient; db: Db; indexesEnsured: boolean };
};

/** Memoised index creation (one attempt per instance, retried on failure). */
let indexPromise: Promise<void> | null = null;

function connect(): { client: MongoClient; db: Db } {
  const client = new MongoClient(env.databaseUrl, {
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 8000,
    retryWrites: true,
  });

  return { client, db: client.db(env.databaseName) };
}

export function getDatabase(): Db {
  const cached = globalForMongo.__atelierMongo;
  if (cached) return cached.db;

  const { client, db } = connect();
  globalForMongo.__atelierMongo = { client, db, indexesEnsured: false };
  // Fire and forget: indexes are created once, in the background.
  void ensureIndexesOnce();
  return db;
}

/**
 * Creates the indexes exactly once per server instance.
 * Called (and awaited) on the first authenticated request, which guarantees the
 * database level rules before any write happens.
 */
export function ensureIndexesOnce(): Promise<void> {
  const state = globalForMongo.__atelierMongo;
  if (state?.indexesEnsured) return Promise.resolve();
  if (!indexPromise) {
    indexPromise = ensureIndexes(getDatabase())
      .then(() => {
        if (globalForMongo.__atelierMongo) {
          globalForMongo.__atelierMongo.indexesEnsured = true;
        }
      })
      .catch((error: unknown) => {
        indexPromise = null;
        console.error(
          '[mongodb] Création des index impossible :',
          error instanceof Error ? error.message : error,
        );
      });
  }
  return indexPromise;
}

/** Returns the database and makes sure the indexes exist (idempotent, cached). */
export async function getReadyDatabase(): Promise<Db> {
  await ensureIndexesOnce();
  return getDatabase();
}

export function collection<T extends Document>(name: string): Collection<T> {
  return getDatabase().collection<T>(name);
}

export function collectionReady<T extends Document>(name: string): Collection<T> {
  return getDatabase().collection<T>(name);
}

/** Explicit close, used by scripts and tests. */
export async function closeDatabase(): Promise<void> {
  const state = globalForMongo.__atelierMongo;
  if (state) {
    await state.client.close();
    globalForMongo.__atelierMongo = undefined;
  }
}

export const COLLECTIONS = {
  admins: 'admins',
  students: 'students',
  experiments: 'experiments',
  aiMessages: 'aiMessages',
  expressionVersions: 'expressionVersions',
  systemSettings: 'systemSettings',
  counters: 'counters',
} as const;