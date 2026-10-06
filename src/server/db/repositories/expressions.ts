import 'server-only';

import { execute, query, queryOne } from '../client';
import { isUniqueViolation, isUuid } from '../ids';
import { counterRepository } from './settings';
import { mapExpressionVersion, type ExpressionVersionRow } from '../rows';
import type { ExpressionVersion } from '@/types';

const COLUMNS = `id, student_id, experiment_id, content, version_number, created_at,
                client_request_id`;

/**
 * Data access for the writing submissions.
 * Every submission creates a new immutable version: nothing is ever updated or
 * deleted, which is the core requirement of the experiment.
 */
export const expressionRepository = {
  async insertVersion(input: {
    studentId: string;
    experimentId: string;
    content: string;
    clientRequestId?: string | null;
  }): Promise<ExpressionVersion> {
    // Idempotency: a retried request must not create a second version.
    if (input.clientRequestId) {
      const existing = await findByClientRequestId(input.clientRequestId);
      if (existing) return existing;
    }

    const versionNumber = await counterRepository.nextValue(
      `expression:${input.studentId}:${input.experimentId}`,
    );

    try {
      const row = await queryOne<ExpressionVersionRow>(
        `insert into expression_versions (student_id, experiment_id, content, version_number, client_request_id)
              values ($1, $2, $3, $4, $5)
           returning ${COLUMNS}`,
        [
          input.studentId,
          input.experimentId,
          input.content,
          versionNumber,
          input.clientRequestId ?? null,
        ],
      );
      if (!row) throw new Error("Enregistrement de la version impossible.");
      return mapExpressionVersion(row);
    } catch (error) {
      // Concurrent retry of the same request: the unique index caught it.
      if (input.clientRequestId && isUniqueViolation(error)) {
        const existing = await findByClientRequestId(input.clientRequestId);
        if (existing) return existing;
      }
      throw error;
    }
  },

  async listByStudentAndExperiment(
    studentId: string,
    experimentId: string,
    limit = 500,
  ): Promise<ExpressionVersion[]> {
    if (!isUuid(studentId) || !isUuid(experimentId)) return [];
    const rows = await query<ExpressionVersionRow>(
      `select ${COLUMNS}
         from expression_versions
        where student_id = $1 and experiment_id = $2
        order by version_number asc
        limit $3`,
      [studentId, experimentId, limit],
    );
    return rows.map(mapExpressionVersion);
  },

  async listByExperiment(experimentId: string, limit = 2000): Promise<ExpressionVersion[]> {
    if (!isUuid(experimentId)) return [];
    const rows = await query<ExpressionVersionRow>(
      `select ${COLUMNS}
         from expression_versions
        where experiment_id = $1
        order by created_at asc, version_number asc
        limit $2`,
      [experimentId, limit],
    );
    return rows.map(mapExpressionVersion);
  },

  async getLatest(
    studentId: string,
    experimentId: string,
  ): Promise<ExpressionVersion | null> {
    if (!isUuid(studentId) || !isUuid(experimentId)) return null;
    const row = await queryOne<ExpressionVersionRow>(
      `select ${COLUMNS}
         from expression_versions
        where student_id = $1 and experiment_id = $2
        order by version_number desc
        limit 1`,
      [studentId, experimentId],
    );
    return row ? mapExpressionVersion(row) : null;
  },

  async getById(id: string): Promise<ExpressionVersion | null> {
    if (!isUuid(id)) return null;
    const row = await queryOne<ExpressionVersionRow>(
      `select ${COLUMNS} from expression_versions where id = $1`,
      [id],
    );
    return row ? mapExpressionVersion(row) : null;
  },

  async countByExperiment(experimentId: string): Promise<number> {
    if (!isUuid(experimentId)) return 0;
    return count('experiment_id = $1', [experimentId]);
  },

  async countByStudentAndExperiment(
    studentId: string,
    experimentId: string,
  ): Promise<number> {
    if (!isUuid(studentId) || !isUuid(experimentId)) return 0;
    return count('student_id = $1 and experiment_id = $2', [studentId, experimentId]);
  },

  async countDistinctStudentsByExperiment(experimentId: string): Promise<number> {
    if (!isUuid(experimentId)) return 0;
    const row = await queryOne<{ total: string }>(
      'select count(distinct student_id)::text as total from expression_versions where experiment_id = $1',
      [experimentId],
    );
    return Number(row?.total ?? 0);
  },

  /** Total number of stored versions, across every experiment. */
  async countAll(): Promise<number> {
    return count('true', []);
  },

  /** Per-student counters for one experiment (dashboard / participants table). */
  async aggregateByStudent(experimentId: string): Promise<
    Array<{ studentId: string; count: number; lastActivityAt: Date }>
  > {
    if (!isUuid(experimentId)) return [];
    const rows = await query<{ student_id: string; count: number; last_activity_at: Date }>(
      `select student_id, count(*)::int as count, max(created_at) as last_activity_at
         from expression_versions
        where experiment_id = $1
        group by student_id`,
      [experimentId],
    );
    return rows.map((row) => ({
      studentId: row.student_id,
      count: row.count,
      lastActivityAt: row.last_activity_at,
    }));
  },

  /** Removes every written version of a student (used when the account is deleted). */
  async deleteForStudent(studentId: string): Promise<number> {
    if (!isUuid(studentId)) return 0;
    return execute('delete from expression_versions where student_id = $1', [studentId]);
  },
};

async function count(where: string, params: readonly unknown[]): Promise<number> {
  const row = await queryOne<{ total: string }>(
    `select count(*)::text as total from expression_versions where ${where}`,
    params,
  );
  return Number(row?.total ?? 0);
}

async function findByClientRequestId(clientRequestId: string): Promise<ExpressionVersion | null> {
  const row = await queryOne<ExpressionVersionRow>(
    `select ${COLUMNS} from expression_versions where client_request_id = $1`,
    [clientRequestId],
  );
  return row ? mapExpressionVersion(row) : null;
}