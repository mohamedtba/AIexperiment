import 'server-only';

import { AppError } from '@/lib/errors';
import { env } from '../env';
import { OpenAIProvider } from './OpenAIProvider';
import { GeminiProvider } from './GeminiProvider';
import {
  AIProviderError,
  type AIChatTurn,
  type AICompletionResult,
  type AIProvider,
} from './AIProvider';

/**
 * Single entry point used by the application.
 * Adding a provider = implement `AIProvider` + register it in the factory.
 */
const providers: Record<string, () => AIProvider> = {
  openai: () => new OpenAIProvider(),
  gemini: () => new GeminiProvider(),
};

let instance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  const name = env.aiProvider.toLowerCase();
  const factory = providers[name];
  if (!factory) {
    throw new AppError('AI_NOT_CONFIGURED', 500);
  }
  if (!instance || instance.name !== name) {
    instance = factory();
  }
  return instance;
}

export function getAIProviderInfo(): {
  provider: string;
  model: string;
  configured: boolean;
} {
  try {
    const provider = getAIProvider();
    return {
      provider: provider.name,
      model: provider.model,
      configured: provider.isConfigured(),
    };
  } catch {
    return {
      provider: env.aiProvider,
      model: env.aiProvider === 'openai' ? env.openaiModel : env.geminiModel,
      configured: false,
    };
  }
}

export function isAIConfigured(): boolean {
  return getAIProviderInfo().configured;
}

export interface GenerateReplyInput {
  /** Previous messages of the current experiment conversation, oldest first. */
  history: Array<{ role: 'student' | 'assistant'; content: string }>;
  /** The new student message. */
  userMessage: string;
  signal?: AbortSignal;
}

export interface GenerateReplyOutput {
  content: string;
  model: string;
  provider: string;
  latencyMs: number;
}

/** Keeps the request small and predictable for the model. */
const MAX_HISTORY_MESSAGES = 20;

export async function generateReply(
  input: GenerateReplyInput,
): Promise<GenerateReplyOutput> {
  const provider = getAIProvider();

  const history: AIChatTurn[] = input.history
    .filter((message) => message.content.trim() !== '')
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }));

  const messages: AIChatTurn[] = [
    ...history,
    { role: 'user', content: input.userMessage },
  ];

  let result: AICompletionResult;
  try {
    result = await provider.complete({ messages, signal: input.signal });
  } catch (error) {
    throw toAppError(error, provider.name);
  }

  return {
    content: result.content,
    model: result.model,
    provider: result.provider,
    latencyMs: result.latencyMs,
  };
}

/** Converts provider failures into French, user facing application errors. */
export function toAppError(error: unknown, providerName = 'ia'): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof AIProviderError) {
    return new AppError(error.code);
  }
  console.error(`[ai:${providerName}] erreur inattendue`, error);
  return new AppError('AI_GENERIC_ERROR', 500);
}