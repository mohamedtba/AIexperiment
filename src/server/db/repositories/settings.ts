import 'server-only';

import { ObjectId } from 'mongodb';
import { COLLECTIONS, collectionReady } from '../mongodb';
import { mapAccessSettings, type CounterDocument, type SystemSettingsDocument } from '../documents';
import type { AccessSettings } from '@/types';

const SETTINGS_KEY = 'global';

/** Global application settings (currently the student access switch). */
export const settingsRepository = {
  async getAccessSettings(): Promise<AccessSettings> {
    const collection = collectionReady<SystemSettingsDocument>(COLLECTIONS.systemSettings);
    let doc = await collection.findOne({ key: SETTINGS_KEY });
    if (!doc) {
      try {
        const initial: SystemSettingsDocument = {
          _id: new ObjectId(),
          key: SETTINGS_KEY,
          studentAccessEnabled: true,
          accessEpoch: 1,
          updatedAt: new Date(),
          disabledAt: null,
        };
        await collection.insertOne(initial);
        doc = initial;
      } catch {
        doc = await collection.findOne({ key: SETTINGS_KEY });
      }
    }
    return mapAccessSettings(doc as SystemSettingsDocument);
  },

  /**
   * Enables or disables student access. Every change increments the epoch,
   * which instantly invalidates all previously issued student sessions.
   */
  async setStudentAccessEnabled(enabled: boolean): Promise<AccessSettings> {
    const collection = collectionReady<SystemSettingsDocument>(COLLECTIONS.systemSettings);
    const now = new Date();
    await collection.updateOne(
      { key: SETTINGS_KEY },
      {
        $set: {
          studentAccessEnabled: enabled,
          updatedAt: now,
          disabledAt: enabled ? null : now,
        },
        $inc: { accessEpoch: 1 },
      },
      { upsert: true },
    );
    const updated = await collection.findOne({ key: SETTINGS_KEY });
    return mapAccessSettings(
      updated ??
        ({
          key: SETTINGS_KEY,
          studentAccessEnabled: enabled,
          accessEpoch: 1,
          updatedAt: now,
          disabledAt: enabled ? null : now,
        } as SystemSettingsDocument),
    );
  },
};

/** Atomic counters (used for expression version numbering). */
export const counterRepository = {
  async nextValue(key: string): Promise<number> {
    const collection = collectionReady<CounterDocument>(COLLECTIONS.counters);
    await collection.updateOne(
      { key },
      { $inc: { value: 1 }, $setOnInsert: { key } },
      { upsert: true },
    );
    const doc = await collection.findOne({ key });
    return doc?.value ?? 1;
  },
};