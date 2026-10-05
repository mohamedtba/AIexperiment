import 'server-only';

import { query, queryOne } from '../client';
import { isUuid } from '../ids';
import { mapAIMessage, type AIMessageRow } from '../rows';
import type { AIMessage, AIMessageRole } from '@/types';

const COLUMNS = `id, student_id, experiment_id, role, content, created_at,
                model, latency_ms, error_code`;

/** Data access for the AI conversation transcript (immutable: never deleted). */
export const aiMessageRepository = {
  async insert(input: {
    studentId: string;
    experimentId: string;
    role: AIMessageRole;
    content: string;
    model?: string | null;
    latencyMs?: number | null;
    errorCode?: string | null;
  }): Promise<AIMessage> {
    const row = await queryOne<AIMessageRow>(
      `insert into ai_messages (student_id, experiment_id, role, content, model, latency_ms, error_code)
            values ($1, $2, $3, $4, $5, $6, $7)
         returning ${COLUMNS}`,
      [
        input.studentId,
        input.experimentId,
        input.role,
        input.content,
        input.model ?? null,
        input.latencyMs ?? null,
        input.errorCode ?? null,
      ],
    );
    if (!row) throw new Error("Enregistrement du message impossible.");
    return mapAIMessage(row);
  },

  async listByStudentAndExperiment(
    studentId: string,
    experimentId: string,
    limit = 500,
  ): Promise<AIMessage[]> {
    if (!isUuid(studentId) || !isUuid(experimentId)) return [];
    const rows = await query<AIMessageRow>(
      `select ${COLUMNS}
         from ai_messages
        where student_id = $1 and experiment_id = $2
        order by created_at asc, id asc
        limit $3`,
      [studentId, experimentId, limit],
    );
    return rows.map(mapAIMessage);
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
      'select count(distinct student_id)::text as total from ai_messages where experiment_id = $1',
      [experimentId],
    );
    return Number(row?.total ?? 0);
  },

  async distinctStudentIdsByExperiment(experimentId: string): Promise<string[]> {
    if (!isUuid(experimentId)) return [];
    const rows = await query<{ student_id: string }>(
      'select distinct student_id from ai_messages where experiment_id = $1',
      [experimentId],
    );
    return rows.map((row) => row.student_id);
  },

  /** Latest student messages of an experiment (most recent first). */
  async listRecentByExperiment(experimentId: string, limit = 12): Promise<AIMessage[]> {
    if (!isUuid(experimentId)) return [];
    const rows = await query<AIMessageRow>(
      `select ${COLUMNS}
         from ai_messages
        where experiment_id = $1 and role = 'student'
        order by created_at desc, id desc
        limit $2`,
      [experimentId, limit],
    );
    return rows.map(mapAIMessage);
  },

  /** Total number of stored messages, across every experiment. */
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
         from ai_messages
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
};

async function count(where: string, params: readonly unknown[]): Promise<number> {
  const row = await queryOne<{ total: string }>(
    `select count(*)::text as total from ai_messages where ${where}`,
    params,
  );
  return Number(row?.total ?? 0);
}