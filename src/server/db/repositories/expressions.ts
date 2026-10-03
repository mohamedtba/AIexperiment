import 'server-only';

import { ObjectId } from 'mongodb';
import { COLLECTIONS, collectionReady } from '../mongodb';
import { counterRepository } from './settings';
import { mapExpressionVersion, type ExpressionVersionDocument } from '../documents';
import type { ExpressionVersion } from '@/types';

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
    const collection = collectionReady<ExpressionVersionDocument>(
      COLLECTIONS.expressionVersions,
    );

    if (input.clientRequestId) {
      const existing = await collection.findOne({
        clientRequestId: input.clientRequestId,
      });
      if (existing) return mapExpressionVersion(existing);
    }

    const doc: ExpressionVersionDocument = {
      _id: new ObjectId(),
      studentId: new ObjectId(input.studentId),
      experimentId: new ObjectId(input.experimentId),
      content: input.content,
      versionNumber: await counterRepository.nextValue(
        `expression:${input.studentId}:${input.experimentId}`,
      ),
      createdAt: new Date(),
      clientRequestId: input.clientRequestId ?? null,
    };

    try {
      await collection.insertOne(doc);
    } catch (error) {
      if (input.clientRequestId && isDuplicateKeyError(error)) {
        const existing = await collection.findOne({
          clientRequestId: input.clientRequestId,
        });
        if (existing) return mapExpressionVersion(existing);
      }
      throw error;
    }

    return mapExpressionVersion(doc);
  },

  async listByStudentAndExperiment(
    studentId: string,
    experimentId: string,
    limit = 500,
  ): Promise<ExpressionVersion[]> {
    if (!ObjectId.isValid(studentId) || !ObjectId.isValid(experimentId)) return [];
    const docs = await collectionReady<ExpressionVersionDocument>(
      COLLECTIONS.expressionVersions,
    )
      .find({
        studentId: new ObjectId(studentId),
        experimentId: new ObjectId(experimentId),
      })
      .sort({ versionNumber: 1 })
      .limit(limit)
      .toArray();
    return docs.map(mapExpressionVersion);
  },

  async listByExperiment(experimentId: string, limit = 2000): Promise<ExpressionVersion[]> {
    if (!ObjectId.isValid(experimentId)) return [];
    const docs = await collectionReady<ExpressionVersionDocument>(
      COLLECTIONS.expressionVersions,
    )
      .find({ experimentId: new ObjectId(experimentId) })
      .sort({ createdAt: 1, versionNumber: 1 })
      .limit(limit)
      .toArray();
    return docs.map(mapExpressionVersion);
  },

  async getLatest(
    studentId: string,
    experimentId: string,
  ): Promise<ExpressionVersion | null> {
    if (!ObjectId.isValid(studentId) || !ObjectId.isValid(experimentId)) return null;
    const doc = await collectionReady<ExpressionVersionDocument>(
      COLLECTIONS.expressionVersions,
    ).findOne(
      {
        studentId: new ObjectId(studentId),
        experimentId: new ObjectId(experimentId),
      },
      { sort: { versionNumber: -1 } },
    );
    return doc ? mapExpressionVersion(doc) : null;
  },

  async getById(id: string): Promise<ExpressionVersion | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await collectionReady<ExpressionVersionDocument>(
      COLLECTIONS.expressionVersions,
    ).findOne({ _id: new ObjectId(id) });
    return doc ? mapExpressionVersion(doc) : null;
  },

  async countByExperiment(experimentId: string): Promise<number> {
    if (!ObjectId.isValid(experimentId)) return 0;
    return collectionReady<ExpressionVersionDocument>(
      COLLECTIONS.expressionVersions,
    ).countDocuments({ experimentId: new ObjectId(experimentId) });
  },

  async countByStudentAndExperiment(
    studentId: string,
    experimentId: string,
  ): Promise<number> {
    if (!ObjectId.isValid(studentId) || !ObjectId.isValid(experimentId)) return 0;
    return collectionReady<ExpressionVersionDocument>(
      COLLECTIONS.expressionVersions,
    ).countDocuments({
      studentId: new ObjectId(studentId),
      experimentId: new ObjectId(experimentId),
    });
  },

  async countDistinctStudentsByExperiment(experimentId: string): Promise<number> {
    if (!ObjectId.isValid(experimentId)) return 0;
    const docs = await collectionReady<ExpressionVersionDocument>(
      COLLECTIONS.expressionVersions,
    ).distinct('studentId', { experimentId: new ObjectId(experimentId) });
    return docs.length;
  },

  /** Per-student counters for one experiment (dashboard / participants table). */
  async aggregateByStudent(experimentId: string): Promise<
    Array<{ studentId: string; count: number; lastActivityAt: Date }>
  > {
    if (!ObjectId.isValid(experimentId)) return [];
    const rows = await collectionReady<ExpressionVersionDocument>(
      COLLECTIONS.expressionVersions,
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

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}