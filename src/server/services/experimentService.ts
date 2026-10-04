import 'server-only';

import { AppError } from '@/lib/errors';
import { experimentRepository } from '../db/repositories/experiments';
import { aiMessageRepository } from '../db/repositories/aiMessages';
import { expressionRepository } from '../db/repositories/expressions';
import { studentRepository } from '../db/repositories/accounts';
import type {
  AIMessage,
  Experiment,
  ExperimentParticipantRow,
  ExperimentStats,
  ExpressionVersion,
} from '@/types';

export async function getCurrentExperiment(): Promise<Experiment | null> {
  return experimentRepository.findActive();
}

export async function getExperimentById(id: string): Promise<Experiment | null> {
  return experimentRepository.findById(id);
}

/**
 * Starts a new experiment. The previous ACTIVE experiment is archived (its data
 * is kept), every student automatically sees the new question and gets a brand
 * new AI conversation for that experiment.
 */
export async function startExperiment(question: string): Promise<Experiment> {
  return experimentRepository.startNew(question.trim());
}

/**
 * Stops the running experiment, at the administrator's request.
 *
 * Nothing is ever deleted: the experiment becomes ARCHIVED and stays fully
 * readable in « Expériences précédentes ». Students immediately see the
 * end-of-experiment screen and can no longer send a message nor submit a
 * version, which is exactly what `NO_ACTIVE_EXPERIMENT` already enforces.
 *
 * Returns null when no experiment was running, so the button is idempotent.
 */
export async function stopCurrentExperiment(): Promise<Experiment | null> {
  return experimentRepository.stopActive();
}

/**
 * True as soon as one experiment exists, whatever its status. Lets the student
 * screen tell "not started yet" apart from "stopped by the administrator".
 */
export async function hasAnyExperiment(): Promise<boolean> {
  return (await experimentRepository.count()) > 0;
}

export async function getExperimentStats(experimentId: string): Promise<ExperimentStats> {
  const [aiMessages, aiStudents, expressionVersions, expressionStudents] =
    await Promise.all([
      aiMessageRepository.countByExperiment(experimentId),
      aiMessageRepository.countDistinctStudentsByExperiment(experimentId),
      expressionRepository.countByExperiment(experimentId),
      expressionRepository.countDistinctStudentsByExperiment(experimentId),
    ]);

  const participants = Math.max(aiStudents, expressionStudents);

  return {
    experimentId,
    participants,
    aiMessages,
    aiStudents,
    expressionVersions,
    expressionStudents,
  };
}

export async function listArchivedExperiments(): Promise<Experiment[]> {
  return experimentRepository.listArchivedBefore();
}

export interface ExperimentParticipantDetail {
  studentId: string;
  username: string;
  createdAt: Date;
  aiMessages: number;
  expressionVersions: number;
  lastActivityAt: Date | null;
  messages: AIMessage[];
  versions: ExpressionVersion[];
}

/** Full view of an experiment for the administrator (any status). */
export async function getExperimentOverview(id: string): Promise<{
  experiment: Experiment;
  stats: ExperimentStats;
  participants: ExperimentParticipantRow[];
}> {
  const experiment = await experimentRepository.findById(id);
  if (!experiment) throw new AppError('EXPERIMENT_NOT_FOUND', 404);

  const [stats, aiRows, expressionRows] = await Promise.all([
    getExperimentStats(id),
    aiMessageRepository.aggregateByStudent(id),
    expressionRepository.aggregateByStudent(id),
  ]);

  const rows = new Map<string, ExperimentParticipantRow>();
  for (const row of aiRows) {
    rows.set(row.studentId, {
      studentId: row.studentId,
      username: '',
      aiMessages: row.count,
      expressionVersions: 0,
      lastActivityAt: row.lastActivityAt,
    });
  }
  for (const row of expressionRows) {
    const existing = rows.get(row.studentId);
    if (existing) {
      existing.expressionVersions = row.count;
      existing.lastActivityAt = maxDate(existing.lastActivityAt, row.lastActivityAt);
    } else {
      rows.set(row.studentId, {
        studentId: row.studentId,
        username: '',
        aiMessages: 0,
        expressionVersions: row.count,
        lastActivityAt: row.lastActivityAt,
      });
    }
  }

  const students = await studentRepository.listByIds([...rows.keys()]);
  const usernames = new Map(students.map((student) => [student.id, student.username]));
  const participants = [...rows.values()]
    .map((row) => ({ ...row, username: usernames.get(row.studentId) ?? 'compte supprimé' }))
    .sort((a, b) => {
      const diff = (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0);
      return diff !== 0 ? diff : a.username.localeCompare(b.username);
    });

  return { experiment, stats, participants };
}

/** Complete transcript + versions of one student inside one experiment. */
export async function getExperimentParticipantDetail(
  experimentId: string,
  studentId: string,
): Promise<ExperimentParticipantDetail> {
  const [experiment, student] = await Promise.all([
    experimentRepository.findById(experimentId),
    studentRepository.findById(studentId),
  ]);
  if (!experiment) throw new AppError('EXPERIMENT_NOT_FOUND', 404);
  if (!student) throw new AppError('STUDENT_NOT_FOUND', 404);

  const [messages, versions] = await Promise.all([
    aiMessageRepository.listByStudentAndExperiment(studentId, experimentId),
    expressionRepository.listByStudentAndExperiment(studentId, experimentId),
  ]);

  const lastActivityAt = [messages.at(-1)?.createdAt, versions.at(-1)?.createdAt]
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return {
    studentId: student.id,
    username: student.username,
    createdAt: student.createdAt,
    aiMessages: messages.length,
    expressionVersions: versions.length,
    lastActivityAt,
    messages,
    versions,
  };
}

function maxDate(current: Date | null, next: Date): Date {
  if (!current) return next;
  return next.getTime() > current.getTime() ? next : current;
}