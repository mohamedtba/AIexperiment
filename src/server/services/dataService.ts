import 'server-only';

import { experimentRepository } from '../db/repositories/experiments';
import { aiMessageRepository } from '../db/repositories/aiMessages';
import { expressionRepository } from '../db/repositories/expressions';
import { studentRepository } from '../db/repositories/accounts';
import { withTransaction } from '../db/client';

/**
 * Permanent deletion of what the students produced.
 *
 * This is the only place in the application that deletes anything, and it is
 * deliberately narrow: the teacher chose to keep the accounts, so the accounts
 * and their credentials always survive. The experiments (and their questions)
 * are only deleted when explicitly asked for, because they describe the class
 * work rather than the students' words.
 *
 * The counters are cleared in the same transaction: `expression_versions` uses a
 * counter to number the versions, and leaving a stale counter behind would make
 * the next submission jump from version 30 to version 213.
 */
export interface DataCounts {
  aiMessages: number;
  expressionVersions: number;
  experiments: number;
  /** Accounts that survive the wipe: the whole point of keeping them. */
  accounts: number;
}

export interface WipeResult extends DataCounts {
  /** Experiments that were left in place. */
  experimentsKept: number;
}

export async function getDataCounts(): Promise<DataCounts> {
  const [aiMessages, expressionVersions, experiments, accounts] = await Promise.all([
    aiMessageRepository.countAll(),
    expressionRepository.countAll(),
    experimentRepository.count(),
    studentRepository.count(),
  ]);
  return { aiMessages, expressionVersions, experiments, accounts };
}

/**
 * Deletes every AI message and every written version, in a single transaction.
 *
 * Returns the number of rows actually removed, so the administrator sees the
 * real figures instead of a blind "done".
 */
export async function wipeCollectedData(deleteExperiments: boolean): Promise<WipeResult> {
  return withTransaction(async (client) => {
    const before = await countInTransaction(client);

    await client.query('delete from ai_messages');
    await client.query('delete from expression_versions');
    // A counter left behind would make the next version jump.
    await client.query(`delete from counters where key like 'expression:%'`);

    if (deleteExperiments) {
      await client.query('delete from experiments');
    }

    const after = await countInTransaction(client);

    return {
      aiMessages: before.aiMessages - after.aiMessages,
      expressionVersions: before.expressionVersions - after.expressionVersions,
      experiments: before.experiments - after.experiments,
      experimentsKept: after.experiments,
      // The class keeps its logins: this is the guarantee the teacher relies on.
      accounts: after.accounts,
    };
  });
}

async function countInTransaction(client: {
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }>;
}): Promise<DataCounts> {
  const result = await client.query(
    `select
       (select count(*)::int from ai_messages) as ai_messages,
       (select count(*)::int from expression_versions) as expression_versions,
       (select count(*)::int from experiments) as experiments,
       (select count(*)::int from students) as accounts`,
  );
  const row = (result.rows[0] ?? {}) as Partial<{
    ai_messages: number;
    expression_versions: number;
    experiments: number;
    accounts: number;
  }>;
  return {
    aiMessages: row.ai_messages ?? 0,
    expressionVersions: row.expression_versions ?? 0,
    experiments: row.experiments ?? 0,
    accounts: row.accounts ?? 0,
  };
}

