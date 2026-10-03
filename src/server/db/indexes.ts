import 'server-only';

import type { Db, IndexDescription } from 'mongodb';

/**
 * Index bootstrap.
 *
 * Important guarantees:
 *  - `students.username` is unique (identite de l'etudiant).
 *  - a partial unique index on `experiments.status` makes it impossible, even
 *    at the database level, to have two ACTIVE experiments at the same time.
 *  - `expressionVersions` is unique per (student, experiment, version number)
 *    and per idempotency key, which protects against duplicated submissions.
 */
const INDEXES: Record<string, IndexDescription[]> = {
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
    {
      key: { studentId: 1, experimentId: 1, createdAt: 1 },
      name: 'aiMessages_student_experiment',
    },
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

export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all(
    Object.entries(INDEXES).map(async ([name, indexes]) => {
      try {
        await db.collection(name).createIndexes(indexes);
      } catch (error) {
        // An index can only be created once; conflicts on an existing
        // deployment must not break the application.
        console.warn(`[mongodb] Index non cree pour ${name}:`, errorMessage(error));
      }
    }),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}