import 'server-only';

import type { AIMessage, AIMessageRole, AccessSettings, Experiment, ExperimentStatus, ExpressionVersion } from '@/types';

/**
 * Rows returned by PostgreSQL.
 *
 * Identifiers are UUIDs produced by `gen_random_uuid()`; dates are
 * `timestamptz` and therefore always come back as JavaScript `Date` objects.
 * There is no mapper for the raw snake_case row of `admins` and `students`
 * because the repositories expose the hash-free `AdminPublic` / `StudentPublic`
 * shapes directly.
 */

export interface AdminAuthRow {
  id: string;
  username: string;
  password_hash: string;
  password_version: number;
  created_at: Date;
  last_login_at: Date | null;
}

export interface ExperimentRow {
  id: string;
  sequence: number;
  question: string;
  status: ExperimentStatus;
  created_at: Date;
  started_at: Date;
  archived_at: Date | null;
}

export interface AIMessageRow {
  id: string;
  student_id: string;
  experiment_id: string;
  role: AIMessageRole;
  content: string;
  created_at: Date;
  model: string | null;
  latency_ms: number | null;
  error_code: string | null;
}

export interface ExpressionVersionRow {
  id: string;
  student_id: string;
  experiment_id: string;
  content: string;
  version_number: number;
  created_at: Date;
  client_request_id: string | null;
}

export interface AccessSettingsRow {
  student_access_enabled: boolean;
  access_epoch: number;
  updated_at: Date;
  disabled_at: Date | null;
  login_ai_libre?: boolean | null;
  login_ai_guidee?: boolean | null;
}

/* ------------------------------- mappers -------------------------------- */

export function mapExperiment(row: ExperimentRow): Experiment {
  return {
    id: row.id,
    sequence: row.sequence,
    question: row.question,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    archivedAt: row.archived_at,
  };
}

export function mapAIMessage(row: AIMessageRow): AIMessage {
  return {
    id: row.id,
    studentId: row.student_id,
    experimentId: row.experiment_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    model: row.model,
    latencyMs: row.latency_ms,
    errorCode: row.error_code,
  };
}

export function mapExpressionVersion(row: ExpressionVersionRow): ExpressionVersion {
  return {
    id: row.id,
    studentId: row.student_id,
    experimentId: row.experiment_id,
    content: row.content,
    versionNumber: row.version_number,
    createdAt: row.created_at,
    clientRequestId: row.client_request_id,
  };
}

export function mapAccessSettings(row: AccessSettingsRow): AccessSettings {
  return {
    studentAccessEnabled: row.student_access_enabled,
    accessEpoch: row.access_epoch,
    updatedAt: row.updated_at,
    disabledAt: row.disabled_at,
    loginAiLibre: row.login_ai_libre ?? true,
    loginAiGuidee: row.login_ai_guidee ?? true,
  };
}