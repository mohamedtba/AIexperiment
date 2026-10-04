import 'server-only';

import { query, queryOne, withTransaction } from '../client';
import { isUuid } from '../ids';
import { mapExperiment, type ExperimentRow } from '../rows';
import type { Experiment } from '@/types';

/**
 * Data access for experiments.
 *
 * The partial unique index `experiments_single_active` guarantees, at the
 * database level, that at most one experiment can be ACTIVE at any time; the
 * transaction below additionally makes sure the previous experiment is only
 * archived if the new one is actually created.
 */
export const experimentRepository = {
  async findActive(): Promise<Experiment | null> {
    const row = await queryOne<ExperimentRow>(
      `select id, sequence, question, status, created_at, started_at, archived_at
         from experiments
        where status = 'ACTIVE'
        limit 1`,
    );
    return row ? mapExperiment(row) : null;
  },

  async findById(id: string): Promise<Experiment | null> {
    if (!isUuid(id)) return null;
    const row = await queryOne<ExperimentRow>(
      `select id, sequence, question, status, created_at, started_at, archived_at
         from experiments
        where id = $1`,
      [id],
    );
    return row ? mapExperiment(row) : null;
  },

  async listAll(limit = 200): Promise<Experiment[]> {
    const rows = await query<ExperimentRow>(
      `select id, sequence, question, status, created_at, started_at, archived_at
         from experiments
        order by started_at desc
        limit $1`,
      [limit],
    );
    return rows.map(mapExperiment);
  },

  async listArchived(limit = 200): Promise<Experiment[]> {
    const rows = await query<ExperimentRow>(
      `select id, sequence, question, status, created_at, started_at, archived_at
         from experiments
        where status = 'ARCHIVED'
        order by archived_at desc nulls last, started_at desc
        limit $1`,
      [limit],
    );
    return rows.map(mapExperiment);
  },

  /** Archived experiments, the current ACTIVE one excluded. */
  async listArchivedBefore(limit = 200): Promise<Experiment[]> {
    const rows = await query<ExperimentRow>(
      `select id, sequence, question, status, created_at, started_at, archived_at
         from experiments
        where status = 'ARCHIVED'
          and id <> coalesce((select id from experiments where status = 'ACTIVE' limit 1), '00000000-0000-0000-0000-000000000000'::uuid)
        order by archived_at desc nulls last, started_at desc
        limit $1`,
      [limit],
    );
    return rows.map(mapExperiment);
  },

  async count(): Promise<number> {
    const row = await queryOne<{ total: string }>(
      'select count(*)::text as total from experiments',
    );
    return Number(row?.total ?? 0);
  },

  /**
   * Starts a new ACTIVE experiment. The previously active experiment is archived
   * (never deleted). The whole operation runs in a transaction, so a failure
   * leaves the previous experiment active: the platform never ends up without an
   * active experiment.
   */
  async startNew(question: string): Promise<Experiment> {
    return withTransaction(async (client) => {
      // Locks the current ACTIVE row so two concurrent starts are serialised.
      await client.query(`select id from experiments where status = 'ACTIVE' for update`);
      await client.query(
        `update experiments set status = 'ARCHIVED', archived_at = now() where status = 'ACTIVE'`,
      );

      const counter = await client.query<{ value: number }>(
        `insert into counters (key, value) values ($1, 1)
           on conflict (key) do update set value = counters.value + 1
         returning value`,
        ['experiments'],
      );

      const inserted = await client.query<ExperimentRow>(
        `insert into experiments (sequence, question, status)
              values ($1, $2, 'ACTIVE')
           returning id, sequence, question, status, created_at, started_at, archived_at`,
        [counter.rows[0]?.value ?? 1, question],
      );

      const row = inserted.rows[0];
      if (!row) throw new Error("Creation de l'experience impossible.");
      return mapExperiment(row);
    });
  },
};