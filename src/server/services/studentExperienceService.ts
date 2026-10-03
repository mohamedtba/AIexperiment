import 'server-only';

import { AppError } from '@/lib/errors';
import { experimentRepository } from '../db/repositories/experiments';
import { aiMessageRepository } from '../db/repositories/aiMessages';
import { expressionRepository } from '../db/repositories/expressions';
import { generateReply } from '../ai/aiService';
import { rateLimit } from '../auth/rate-limit';
import type { AIMessage, Experiment, ExpressionVersion } from '@/types';

/**
 * Student side of the experiment.
 *
 * Hard rules implemented here:
 *  - the student only ever works on the ACTIVE experiment;
 *  - the AI conversation is never initialised with the question or the writing;
 *  - a new experiment implies a brand new conversation and new versions.
 */

export interface StudentWorkspace {
  experiment: Experiment;
  messages: AIMessage[];
  versions: ExpressionVersion[];
  latestVersion: ExpressionVersion | null;
}

export async function getStudentWorkspace(
  studentId: string,
): Promise<StudentWorkspace> {
  const experiment = await experimentRepository.findActive();
  if (!experiment) throw new AppError('NO_ACTIVE_EXPERIMENT', 404);

  const [messages, versions] = await Promise.all([
    aiMessageRepository.listByStudentAndExperiment(studentId, experiment.id),
    expressionRepository.listByStudentAndExperiment(studentId, experiment.id),
  ]);

  return {
    experiment,
    messages,
    versions,
    latestVersion: versions.at(-1) ?? null,
  };
}

export interface ChatExchange {
  studentMessage: AIMessage;
  assistantMessage: AIMessage;
}

/**
 * Stores the student message, asks the AI for an answer using only the chat
 * history of the current experiment, then stores the reply. Messages are never
 * modified or deleted.
 */
export async function sendChatMessage(
  studentId: string,
  content: string,
  request?: Request,
): Promise<ChatExchange> {
  const experiment = await experimentRepository.findActive();
  if (!experiment) throw new AppError('NO_ACTIVE_EXPERIMENT', 404);

  if (request) {
    const limit = rateLimit(`chat:${studentId}`, 40, 60_000);
    if (!limit.allowed) throw new AppError('RATE_LIMIT', 429);
  }

  const studentMessage = await aiMessageRepository.insert({
    studentId,
    experimentId: experiment.id,
    role: 'student',
    content: content.trim(),
  });

  const history = await aiMessageRepository.listByStudentAndExperiment(
    studentId,
    experiment.id,
  );

  const reply = await generateReply({
    history: history
      .filter((message) => message.id !== studentMessage.id)
      .map((message) => ({ role: message.role, content: message.content })),
    userMessage: studentMessage.content,
  });

  const assistantMessage = await aiMessageRepository.insert({
    studentId,
    experimentId: experiment.id,
    role: 'assistant',
    content: reply.content,
    model: reply.model,
    latencyMs: reply.latencyMs,
  });

  return { studentMessage, assistantMessage };
}

/**
 * Creates a new version of the student's writing. Previous versions are never
 * modified or removed: "Modifier" simply submits a new version.
 */
export async function submitExpression(
  studentId: string,
  content: string,
  clientRequestId?: string | null,
): Promise<ExpressionVersion> {
  const experiment = await experimentRepository.findActive();
  if (!experiment) throw new AppError('NO_ACTIVE_EXPERIMENT', 404);

  return expressionRepository.insertVersion({
    studentId,
    experimentId: experiment.id,
    content: content.trim(),
    clientRequestId: clientRequestId ?? null,
  });
}

export async function getStudentLatestVersion(
  studentId: string,
): Promise<ExpressionVersion | null> {
  const experiment = await experimentRepository.findActive();
  if (!experiment) return null;
  return expressionRepository.getLatest(studentId, experiment.id);
}