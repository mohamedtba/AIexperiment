import 'server-only';

import { ObjectId } from 'mongodb';
import { COLLECTIONS, collectionReady } from '../mongodb';
import { mapAIMessage, type AIMessageDocument } from '../documents';
import type { AIMessage, AIMessageRole } from '@/types';

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
    const doc: AIMessageDocument = {
      _id: new ObjectId(),
      studentId: new ObjectId(input.studentId),
      experimentId: new ObjectId(input.experimentId),
      role: input.role,
      content: input.content,
      createdAt: new Date(),
      model: input.model ?? null,
      latencyMs: input.latencyMs ?? null,
      errorCode: input.errorCode ?? null,
    };
    await collectionReady<AIMessageDocument>(COLLECTIONS.aiMessages).insertOne(doc);
    return mapAIMessage(doc);
  },

  async listByStudentAndExperiment(
    studentId: string,
    experimentId: string,
    limit = 500,
  ): Promise<AIMessage[]> {
    if (!ObjectId.isValid(studentId) || !ObjectId.isValid(experimentId)) return [];
    const docs = await collectionReady<AIMessageDocument>(COLLECTIONS.aiMessages)
      .find({
        studentId: new ObjectId(studentId),
        experimentId: new ObjectId(experimentId),
      })
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit)
      .toArray();
    return docs.map(mapAIMessage);
  },

  async countByExperiment(experimentId: string): Promise<number> {
    if (!ObjectId.isValid(experimentId)) return 0;
    return collectionReady<AIMessageDocument>(COLLECTIONS.aiMessages).countDocuments({
      experimentId: new ObjectId(experimentId),
    });
  },

  async countByStudentAndExperiment(
    studentId: string,
    experimentId: string,
  ): Promise<number> {
    if (!ObjectId.isValid(studentId) || !ObjectId.isValid(experimentId)) return 0;
    return collectionReady<AIMessageDocument>(COLLECTIONS.aiMessages).countDocuments({
      studentId: new ObjectId(studentId),
      experimentId: new ObjectId(experimentId),
    });
  },

  async countDistinctStudentsByExperiment(experimentId: string): Promise<number> {
    if (!ObjectId.isValid(experimentId)) return 0;
    const docs = await collectionReady<AIMessageDocument>(COLLECTIONS.aiMessages)
      .distinct('studentId', { experimentId: new ObjectId(experimentId) });
    return docs.length;
  },

  async distinctStudentIdsByExperiment(experimentId: string): Promise<string[]> {
    if (!ObjectId.isValid(experimentId)) return [];
    const docs = await collectionReady<AIMessageDocument>(COLLECTIONS.aiMessages)
      .distinct('studentId', { experimentId: new ObjectId(experimentId) });
    return docs.map((id) => id.toHexString());
  },

  /** Latest student messages of an experiment (most recent first). */
  async listRecentByExperiment(
    experimentId: string,
    limit = 12,
  ): Promise<AIMessage[]> {
    if (!ObjectId.isValid(experimentId)) return [];
    const docs = await collectionReady<AIMessageDocument>(COLLECTIONS.aiMessages)
      .find({ experimentId: new ObjectId(experimentId), role: 'student' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map(mapAIMessage);
  },

  /** Per-student counters for one experiment (dashboard / participants table). */
  async aggregateByStudent(experimentId: string): Promise<
    Array<{ studentId: string; count: number; lastActivityAt: Date }>
  > {
    if (!ObjectId.isValid(experimentId)) return [];
    const rows = await collectionReady<AIMessageDocument>(
      COLLECTIONS.aiMessages,
    )
      .aggregate<{ _id: ObjectId; count: number; lastActivityAt: Date }>([
        { $match: { experimentId: new ObjectId(experimentId) } },
        {
          $group: {
            _id: '$studentId',
            count: { $sum: 1 },
            lastActivityAt: { $max: '$createdAt' },
          },
        },
      ])
      .toArray();

    return rows.map((row) => ({
      studentId: row._id.toHexString(),
      count: row.count,
      lastActivityAt: row.lastActivityAt,
    }));
  },
};