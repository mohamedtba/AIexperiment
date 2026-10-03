import 'server-only';

import { ObjectId } from 'mongodb';
import { COLLECTIONS, collectionReady } from '../mongodb';
import { mapAdmin, mapStudent, type AdminDocument, type StudentDocument } from '../documents';
import type { AdminPublic, StudentPublic } from '@/types';

/** Data access for the single administrator account. */
export const adminRepository = {
  async findByUsername(username: string): Promise<AdminDocument | null> {
    const doc = await collectionReady<AdminDocument>(COLLECTIONS.admins).findOne({
      username,
    });
    return doc ?? null;
  },

  async findById(id: string): Promise<AdminPublic | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await collectionReady<AdminDocument>(COLLECTIONS.admins).findOne({
      _id: new ObjectId(id),
    });
    return doc ? mapAdmin(doc) : null;
  },

  async count(): Promise<number> {
    return collectionReady<AdminDocument>(COLLECTIONS.admins).countDocuments();
  },

  async upsertByUsername(username: string, passwordHash: string): Promise<AdminPublic> {
    const collection = collectionReady<AdminDocument>(COLLECTIONS.admins);
    const existing = await collection.findOne({ username });
    if (existing) {
      await collection.updateOne(
        { _id: existing._id },
        { $set: { passwordHash } },
      );
      return mapAdmin({ ...existing, passwordHash });
    }
    const doc: AdminDocument = {
      _id: new ObjectId(),
      username,
      passwordHash,
      createdAt: new Date(),
      lastLoginAt: null,
    };
    await collection.insertOne(doc);
    return mapAdmin(doc);
  },

  async touchLastLogin(id: string): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await collectionReady<AdminDocument>(COLLECTIONS.admins).updateOne(
      { _id: new ObjectId(id) },
      { $set: { lastLoginAt: new Date() } },
    );
  },
};

/** Data access for student accounts (created by the administrator only). */
export const studentRepository = {
  async findByUsername(username: string): Promise<StudentDocument | null> {
    const doc = await collectionReady<StudentDocument>(COLLECTIONS.students).findOne({
      username,
    });
    return doc ?? null;
  },

  async findById(id: string): Promise<StudentPublic | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await collectionReady<StudentDocument>(COLLECTIONS.students).findOne({
      _id: new ObjectId(id),
    });
    return doc ? mapStudent(doc) : null;
  },

  async existsByUsername(username: string): Promise<boolean> {
    const doc = await collectionReady<StudentDocument>(COLLECTIONS.students).findOne(
      { username },
      { projection: { _id: 1 } },
    );
    return doc !== null;
  },

  async insert(username: string, passwordHash: string): Promise<StudentPublic> {
    const doc: StudentDocument = {
      _id: new ObjectId(),
      username,
      passwordHash,
      createdAt: new Date(),
      lastLoginAt: null,
    };
    await collectionReady<StudentDocument>(COLLECTIONS.students).insertOne(doc);
    return mapStudent(doc);
  },

  async list(limit = 500, offset = 0): Promise<StudentPublic[]> {
    const docs = await collectionReady<StudentDocument>(COLLECTIONS.students)
      .find({})
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();
    return docs.map(mapStudent);
  },

  async listByIds(ids: string[]): Promise<StudentPublic[]> {
    const validIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    if (validIds.length === 0) return [];
    const docs = await collectionReady<StudentDocument>(COLLECTIONS.students)
      .find({ _id: { $in: validIds } })
      .toArray();
    return docs.map(mapStudent);
  },

  async count(): Promise<number> {
    return collectionReady<StudentDocument>(COLLECTIONS.students).countDocuments();
  },

  async touchLastLogin(id: string): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await collectionReady<StudentDocument>(COLLECTIONS.students).updateOne(
      { _id: new ObjectId(id) },
      { $set: { lastLoginAt: new Date() } },
    );
  },
};