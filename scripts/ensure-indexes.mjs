#!/usr/bin/env node
/**
 * Création (ou vérification) des index MongoDB.
 * Utile après un déploiement sur une base vide ; l'application crée aussi les
 * index au premier accès, cette commande est donc facultative.
 *
 * Usage : npm run db:indexes
 */
import { MongoClient } from 'mongodb';

const INDEXES = {
  admins: [{ key: { username: 1 }, name: 'admins_username_unique', unique: true }],
  students: [
    { key: { username: 1 }, name: 'students_username_unique', unique: true },
    { key: { createdAt: -1 }, name: 'students_createdAt' },
  ],
  experiments: [
    {
      key: { status: 1 },
      name: 'experiments_single_active',
      unique: true,
      partialFilterExpression: { status: 'ACTIVE' },
    },
    { key: { startedAt: -1 }, name: 'experiments_startedAt' },
  ],
  aiMessages: [
    { key: { studentId: 1, experimentId: 1, createdAt: 1 }, name: 'aiMessages_student_experiment' },
    { key: { experimentId: 1, createdAt: -1 }, name: 'aiMessages_experiment_recent' },
    { key: { createdAt: -1 }, name: 'aiMessages_recent' },
  ],
  expressionVersions: [
    {
      key: { studentId: 1, experimentId: 1, versionNumber: 1 },
      name: 'expressionVersions_unique_version',
      unique: true,
    },
    {
      key: { clientRequestId: 1 },
      name: 'expressionVersions_idempotency',
      unique: true,
      partialFilterExpression: { clientRequestId: { $type: 'string' } },
    },
    { key: { experimentId: 1, createdAt: -1 }, name: 'expressionVersions_experiment' },
  ],
  systemSettings: [{ key: { key: 1 }, name: 'systemSettings_key_unique', unique: true }],
  counters: [{ key: { key: 1 }, name: 'counters_key_unique', unique: true }],
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('\n✖ La variable DATABASE_URL est absente.\n');
    process.exit(1);
  }

  const client = new MongoClient(databaseUrl, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();

  try {
    const db = client.db(process.env.DATABASE_NAME || undefined);
    for (const [collection, indexes] of Object.entries(INDEXES)) {
      const names = await db.collection(collection).createIndexes(indexes);
      console.log(`✔ ${collection} : ${names.join(', ')}`);
    }
    console.log('\n✔ Index créés.\n');
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('\n✖ Échec :', error?.message ?? error, '\n');
  process.exit(1);
});