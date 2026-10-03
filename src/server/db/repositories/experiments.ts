import 'server-only';

import { ObjectId, type Filter } from 'mongodb';
import { COLLECTIONS, collectionReady } from '../mongodb';
import { counterRepository } from './settings';
import { mapExperiment, type ExperimentDocument } from '../documents';
import type { Experiment } from '@/types';

/** Data access for experiments. A single partial unique index guarantees
 *  that at most one experiment can be ACTIVE at any time. */
export const experimentRepository = {
  async findActive(): Promise<Experiment | null> {
    const doc = await collectionReady<ExperimentDocument>(COLLECTIONS.experiments).findOne({
      status: 'ACTIVE',
    });
    return doc ? mapExperiment(doc) : null;
  },

  async findById(id: string): Promise<Experiment | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await collectionReady<ExperimentDocument>(COLLECTIONS.experiments).findOne({
      _id: new ObjectId(id),
    });
    return doc ? mapExperiment(doc) : null;
  },

  async listAll(limit = 200): Promise<Experiment[]> {
    const docs = await collectionReady<ExperimentDocument>(COLLECTIONS.experiments)
      .find({})
      .sort({ startedAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map(mapExperiment);
  },

  async listArchived(limit = 200): Promise<Experiment[]> {
    const docs = await collectionReady<ExperimentDocument>(COLLECTIONS.experiments)
      .find({ status: 'ARCHIVED' })
      .sort({ archivedAt: -1, startedAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map(mapExperiment);
  },

  async listArchivedBefore(limit = 200): Promise<Experiment[]> {
    const filter: Filter<ExperimentDocument> = { status: 'ARCHIVED' };
    const active = await this.findActive();
    if (active) filter._id = { $ne: new ObjectId(active.id) };
    const docs = await collectionReady<ExperimentDocument>(COLLECTIONS.experiments)
      .find(filter)
      .sort({ archivedAt: -1, startedAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map(mapExperiment);
  },

  async count(): Promise<number> {
    return collectionReady<ExperimentDocument>(COLLECTIONS.experiments).countDocuments({});
  },

  /**
   * Starts a new ACTIVE experiment. The previously active experiment is
   * archived (never deleted). If the creation fails, the previous experiment is
   * restored so the platform never ends up without an active experiment.
   */
  async startNew(question: string): Promise<Experiment> {
    const collection = collectionReady<ExperimentDocument>(COLLECTIONS.experiments);
    const previous = await collection.findOne({ status: 'ACTIVE' });

    if (previous) {
      await collection.updateOne(
        { _id: previous._id },
        { $set: { status: 'ARCHIVED', archivedAt: new Date() } },
      );
    }

    const now = new Date();
    const doc: ExperimentDocument = {
      _id: new ObjectId(),
      sequence: await counterRepository.nextValue('experiments'),
      question,
      status: 'ACTIVE',
      createdAt: now,
      startedAt: now,
      archivedAt: null,
    };

    try {
      await collection.insertOne(doc);
    } catch (error) {
      if (previous) {
        await collection.updateOne(
          { _id: previous._id },
          { $set: { status: 'ACTIVE', archivedAt: null } },
        );
      }
      throw error;
    }

    return mapExperiment(doc);
  },
};