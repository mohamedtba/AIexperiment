import 'server-only';

import type { ObjectId } from 'mongodb';
import type {
  AIMessage,
  AIMessageRole,
  AccessSettings,
  AdminPublic,
  Experiment,
  ExperimentStatus,
  ExpressionVersion,
  StudentPublic,
} from '@/types';

export interface AdminDocument {
  _id: ObjectId;
  username: string;
  passwordHash: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface StudentDocument {
  _id: ObjectId;
  username: string;
  passwordHash: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface ExperimentDocument {
  _id: ObjectId;
  sequence: number;
  question: string;
  status: ExperimentStatus;
  createdAt: Date;
  startedAt: Date;
  archivedAt: Date | null;
}

export interface AIMessageDocument {
  _id: ObjectId;
  studentId: ObjectId;
  experimentId: ObjectId;
  role: AIMessageRole;
  content: string;
  createdAt: Date;
  model: string | null;
  latencyMs: number | null;
  errorCode: string | null;
}

export interface ExpressionVersionDocument {
  _id: ObjectId;
  studentId: ObjectId;
  experimentId: ObjectId;
  content: string;
  versionNumber: number;
  createdAt: Date;
  clientRequestId: string | null;
}

export interface SystemSettingsDocument {
  _id: ObjectId;
  key: 'global';
  studentAccessEnabled: boolean;
  accessEpoch: number;
  updatedAt: Date;
  disabledAt: Date | null;
}

export interface CounterDocument {
  _id: ObjectId;
  key: string;
  value: number;
}

/* ------------------------------- mappers -------------------------------- */

export function mapAdmin(doc: AdminDocument): AdminPublic {
  return {
    id: doc._id.toHexString(),
    username: doc.username,
    createdAt: doc.createdAt,
    lastLoginAt: doc.lastLoginAt,
  };
}

export function mapStudent(doc: StudentDocument): StudentPublic {
  return {
    id: doc._id.toHexString(),
    username: doc.username,
    createdAt: doc.createdAt,
    lastLoginAt: doc.lastLoginAt,
  };
}

export function mapExperiment(doc: ExperimentDocument): Experiment {
  return {
    id: doc._id.toHexString(),
    sequence: doc.sequence,
    question: doc.question,
    status: doc.status,
    createdAt: doc.createdAt,
    startedAt: doc.startedAt,
    archivedAt: doc.archivedAt,
  };
}

export function mapAIMessage(doc: AIMessageDocument): AIMessage {
  return {
    id: doc._id.toHexString(),
    studentId: doc.studentId.toHexString(),
    experimentId: doc.experimentId.toHexString(),
    role: doc.role,
    content: doc.content,
    createdAt: doc.createdAt,
    model: doc.model,
    latencyMs: doc.latencyMs,
    errorCode: doc.errorCode,
  };
}

export function mapExpressionVersion(doc: ExpressionVersionDocument): ExpressionVersion {
  return {
    id: doc._id.toHexString(),
    studentId: doc.studentId.toHexString(),
    experimentId: doc.experimentId.toHexString(),
    content: doc.content,
    versionNumber: doc.versionNumber,
    createdAt: doc.createdAt,
    clientRequestId: doc.clientRequestId,
  };
}

export function mapAccessSettings(doc: SystemSettingsDocument): AccessSettings {
  return {
    studentAccessEnabled: doc.studentAccessEnabled,
    accessEpoch: doc.accessEpoch,
    updatedAt: doc.updatedAt,
    disabledAt: doc.disabledAt,
  };
}