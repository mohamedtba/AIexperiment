/**
 * Domain types shared by the server layer and the React components.
 * PostgreSQL rows are mapped to these camelCase shapes by `src/server/db/rows.ts`.
 */

export type ExperimentStatus = 'ACTIVE' | 'ARCHIVED';

export type AIMessageRole = 'student' | 'assistant';

export interface Experiment {
  id: string;
  sequence: number;
  question: string;
  status: ExperimentStatus;
  createdAt: Date;
  startedAt: Date;
  archivedAt: Date | null;
}

export interface AIMessage {
  id: string;
  studentId: string;
  experimentId: string;
  role: AIMessageRole;
  content: string;
  createdAt: Date;
  /** Present only for assistant messages. */
  model?: string | null;
  latencyMs?: number | null;
  errorCode?: string | null;
}

export interface ExpressionVersion {
  id: string;
  studentId: string;
  experimentId: string;
  content: string;
  versionNumber: number;
  createdAt: Date;
  clientRequestId?: string | null;
}

export interface StudentPublic {
  id: string;
  username: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface AdminPublic {
  id: string;
  username: string;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface AccessSettings {
  studentAccessEnabled: boolean;
  /** Incremented each time the switch is toggled: invalidates student sessions. */
  accessEpoch: number;
  updatedAt: Date;
  disabledAt: Date | null;
}

/** Activity counters used by the admin dashboard and experiment pages. */
export interface ExperimentStats {
  experimentId: string;
  participants: number;
  aiMessages: number;
  aiStudents: number;
  expressionVersions: number;
  expressionStudents: number;
}

export type ActivityKind = 'ai_message' | 'expression' | 'login';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  studentUsername: string;
  studentId: string;
  experimentId: string | null;
  experimentSequence: number | null;
  detail: string | null;
  createdAt: Date;
}

export interface StudentExperimentActivity {
  experimentId: string;
  experimentSequence: number | null;
  aiMessages: number;
  expressionVersions: number;
  lastActivityAt: Date | null;
}

export interface StudentWithActivity extends StudentPublic {
  activity: StudentExperimentActivity | null;
}

export interface ExperimentParticipantRow {
  studentId: string;
  username: string;
  aiMessages: number;
  expressionVersions: number;
  lastActivityAt: Date | null;
}