import 'server-only';

import type { ErrorCode } from '@/lib/errors';

/**
 * Provider agnostic AI contract.
 *
 * The rest of the application only depends on this interface: switching from
 * Gemini to OpenAI, Anthropic or a local model is a matter of adding a new
 * implementation and registering it in `aiService.ts`.
 */

export type AIErrorCode = Extract<
  ErrorCode,
  | 'AI_RATE_LIMIT'
  | 'AI_TIMEOUT'
  | 'AI_UNAVAILABLE'
  | 'AI_INVALID_RESPONSE'
  | 'AI_EMPTY_RESPONSE'
  | 'AI_BLOCKED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_INVALID_KEY'
  | 'AI_MODEL_UNAVAILABLE'
  | 'AI_GENERIC_ERROR'
>;

export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly provider: string;

  constructor(provider: string, code: AIErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AIProviderError';
    this.provider = provider;
    this.code = code;
  }
}

export interface AIChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AICompletionRequest {
  /** Conversation history, oldest first. Must contain at least one user turn. */
  messages: AIChatTurn[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface AIUsage {
  promptTokens?: number;
  candidatesTokens?: number;
  totalTokens?: number;
}

export interface AICompletionResult {
  content: string;
  model: string;
  provider: string;
  finishReason: string | null;
  usage: AIUsage | null;
  latencyMs: number;
}

export interface AIProvider {
  /** Stable identifier, e.g. "gemini". */
  readonly name: string;
  /** Model identifier currently used by the provider. */
  readonly model: string;
  /** True when the provider has everything it needs (API key present...). */
  isConfigured(): boolean;
  /** Sends a completion request. Throws AIProviderError on any failure. */
  complete(request: AICompletionRequest): Promise<AICompletionResult>;
}

/**
 * System instruction of the AI assistant.
 *
 * It deliberately contains NO experiment context: the current question and the
 * student's writing are never sent automatically. The assistant only receives
 * what the student explicitly typed in the chat.
 */
export const AI_SYSTEM_INSTRUCTION = [
  "Tu es un assistant pedagogique francophone, servant dans un outil d'experimentation universitaire.",
  'Tu reponds en francais, de maniere claire, structuree et honnete.',
  "Tu peux expliquer des concepts, proposer des idees, donner des exemples, corriger un texte que l'etudiant te soumet explicitement et, si l'etudiant te le demande, rediger une reponse complete.",
  "Tu ne connais pas le sujet de l'experience et tu ne dois ni le deviner ni le supposer : si l'etudiant ne precise pas, tu le lui demandes.",
  'Tu ne pretends jamais avoir acces a un texte que l\'etudiant ne t\'a pas montre.',
  'Tes reponses restent concises et directement utilisables.',
].join(' ');