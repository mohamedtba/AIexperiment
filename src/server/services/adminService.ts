import 'server-only';

import { AppError } from '@/lib/errors';
import { studentRepository } from '../db/repositories/accounts';
import { experimentRepository } from '../db/repositories/experiments';
import { aiMessageRepository } from '../db/repositories/aiMessages';
import { expressionRepository } from '../db/repositories/expressions';
import { getAIProviderInfo } from '../ai/aiService';
import { getAccessSettings } from './accessService';
import type {
  AccessSettings,
  ActivityEvent,
  AIMessage,
  Experiment,
  ExperimentStats,
  ExpressionVersion,
  StudentExperimentActivity,
  StudentGroup,
  StudentPublic,
  StudentWithActivity,
} from '@/types';

/* ------------------------------ students -------------------------------- */

export interface AdminStudentDetail {
  student: StudentPublic;
  experiment: Experiment | null;
  messages: AIMessage[];
  versions: ExpressionVersion[];
  aiMessages: number;
  expressionVersions: number;
  lastActivityAt: Date | null;
  stats: ExperimentStats | null;
}

/** Student list with their activity on the active experiment. */
export type StudentActivityRow = Omit<StudentWithActivity, 'activity'> & {
  activity: StudentExperimentActivity;
};

export async function listStudentsWithActivity(): Promise<StudentActivityRow[]> {
  const [students, experiment] = await Promise.all([
    studentRepository.list(),
    experimentRepository.findActive(),
  ]);

  if (!experiment) {
    return students.map((student) => ({
      ...student,
      activity: {
        experimentId: '',
        experimentSequence: null,
        aiMessages: 0,
        expressionVersions: 0,
        lastActivityAt: null,
      },
    }));
  }

  const [aiRows, expressionRows] = await Promise.all([
    aiMessageRepository.aggregateByStudent(experiment.id),
    expressionRepository.aggregateByStudent(experiment.id),
  ]);

  const aiByStudent = new Map(aiRows.map((row) => [row.studentId, row]));
  const expressionsByStudent = new Map(
    expressionRows.map((row) => [row.studentId, row]),
  );

  return students.map((student) => {
    const ai = aiByStudent.get(student.id);
    const expression = expressionsByStudent.get(student.id);
    const candidates = [ai?.lastActivityAt, expression?.lastActivityAt].filter(
      (value): value is Date => Boolean(value),
    );
    const lastActivityAt = candidates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    return {
      ...student,
      activity: {
        experimentId: experiment.id,
        experimentSequence: experiment.sequence,
        aiMessages: ai?.count ?? 0,
        expressionVersions: expression?.count ?? 0,
        lastActivityAt,
      },
    };
  });
}

/** Complete view of a student for the administrator. */
/**
 * Per-group totals, used by the group filter of the student list so the teacher
 * sees the size of each group without counting rows.
 */
export async function getGroupCounts(): Promise<Record<StudentGroup, number>> {
  return studentRepository.countByGroup();
}

export async function getStudentDetail(
  studentId: string,
  experimentId?: string,
): Promise<AdminStudentDetail> {
  const student = await studentRepository.findById(studentId);
  if (!student) throw new AppError('STUDENT_NOT_FOUND', 404);

  const experiment = experimentId
    ? await experimentRepository.findById(experimentId)
    : await experimentRepository.findActive();

  if (!experiment) {
    return {
      student,
      experiment: null,
      messages: [],
      versions: [],
      aiMessages: 0,
      expressionVersions: 0,
      lastActivityAt: null,
      stats: null,
    };
  }

  const [messages, versions, stats] = await Promise.all([
    aiMessageRepository.listByStudentAndExperiment(student.id, experiment.id),
    expressionRepository.listByStudentAndExperiment(student.id, experiment.id),
    getStatsForExperiment(experiment),
  ]);

  const candidates = [messages.at(-1)?.createdAt, versions.at(-1)?.createdAt].filter(
    (value): value is Date => Boolean(value),
  );

  return {
    student,
    experiment,
    messages,
    versions,
    aiMessages: messages.length,
    expressionVersions: versions.length,
    lastActivityAt: candidates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    stats,
  };
}

async function getStatsForExperiment(experiment: Experiment): Promise<ExperimentStats> {
  const [aiMessages, aiStudents, expressionVersions, expressionStudents] =
    await Promise.all([
      aiMessageRepository.countByExperiment(experiment.id),
      aiMessageRepository.countDistinctStudentsByExperiment(experiment.id),
      expressionRepository.countByExperiment(experiment.id),
      expressionRepository.countDistinctStudentsByExperiment(experiment.id),
    ]);
  return {
    experimentId: experiment.id,
    participants: Math.max(aiStudents, expressionStudents),
    aiMessages,
    aiStudents,
    expressionVersions,
    expressionStudents,
  };
}

/* ------------------------------ dashboard ------------------------------- */

export interface AdminDashboardData {
  access: AccessSettings;
  experiment: Experiment | null;
  stats: ExperimentStats | null;
  totalStudents: number;
  recentActivity: ActivityEvent[];
  aiProvider: ReturnType<typeof getAIProviderInfo>;
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const [access, experiment, totalStudents, aiProvider] = await Promise.all([
    getAccessSettings(),
    experimentRepository.findActive(),
    studentRepository.count(),
    Promise.resolve(getAIProviderInfo()),
  ]);

  const [stats, recentActivity] = experiment
    ? await Promise.all([
        getStatsForExperiment(experiment),
        getRecentActivity(experiment.id, 12),
      ])
    : [null, []];

  return { access, experiment, stats, totalStudents, recentActivity, aiProvider };
}

/**
 * Recent activity of the active experiment: AI messages, submitted writings and
 * student logins, merged into a single chronological feed.
 */
export async function getRecentActivity(
  experimentId: string,
  limit = 12,
): Promise<ActivityEvent[]> {
  const [messages, versions] = await Promise.all([
    aiMessageRepository.listRecentByExperiment(experimentId, limit),
    expressionRepository.listByExperiment(experimentId),
  ]);

  const studentIds = [
    ...new Set([
      ...messages.filter((m) => m.role === 'student').map((m) => m.studentId),
      ...versions.map((v) => v.studentId),
    ]),
  ];
  const students = await studentRepository.listByIds(studentIds);
  const usernames = new Map(students.map((student) => [student.id, student.username]));

  const events: ActivityEvent[] = [
    ...messages
      .filter((message) => message.role === 'student')
      .map((message) => ({
        id: message.id,
        kind: 'ai_message' as const,
        studentUsername: usernames.get(message.studentId) ?? 'compte supprimé',
        studentId: message.studentId,
        experimentId: message.experimentId,
        experimentSequence: null,
        detail: message.content.slice(0, 90),
        createdAt: message.createdAt,
      })),
    ...versions.map((version) => ({
      id: version.id,
      kind: 'expression' as const,
      studentUsername: usernames.get(version.studentId) ?? 'compte supprimé',
      studentId: version.studentId,
      experimentId: version.experimentId,
      experimentSequence: null,
      detail: `Version ${version.versionNumber}`,
      createdAt: version.createdAt,
    })),
  ];

  return events
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}