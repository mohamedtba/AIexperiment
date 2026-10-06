import 'server-only';

import { env } from '../env';
import {
  AIProviderError,
  AI_SYSTEM_INSTRUCTION,
  type AICompletionRequest,
  type AICompletionResult,
  type AIProvider,
  type AIUsage,
} from './AIProvider';

const PROVIDER_NAME = 'openai';
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 2;

/**
 * OpenAI implementation, using the official Chat Completions endpoint
 * (server-side only). The API key is read from the environment and never
 * leaves the server.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = PROVIDER_NAME;
  readonly model: string;

  constructor(model: string = env.openaiModel) {
    this.model = model;
  }

  isConfigured(): boolean {
    return Boolean(env.openaiApiKey);
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const apiKey = env.openaiApiKey;
    if (!apiKey) {
      throw new AIProviderError(PROVIDER_NAME, 'AI_NOT_CONFIGURED');
    }

    const startedAt = Date.now();
    const payload = {
      model: this.model,
      messages: [
        { role: 'system', content: AI_SYSTEM_INSTRUCTION },
        ...request.messages.map((turn) => ({
          role: turn.role === 'assistant' ? 'assistant' : 'user',
          content: turn.content,
        })),
      ],
      temperature: request.temperature ?? 0.7,
      top_p: 0.95,
      max_tokens: request.maxOutputTokens ?? 2048,
    };

    const response = await this.requestWithRetry(payload, apiKey, request.signal);
    const data = await parseJsonBody(response);

    const choice = data.choices?.[0];
    const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';

    if (data.error && typeof data.error === 'object' && 'message' in data.error) {
      throw new AIProviderError(PROVIDER_NAME, 'AI_INVALID_RESPONSE', String(data.error.message));
    }
    if (!text.trim()) {
      throw new AIProviderError(PROVIDER_NAME, 'AI_EMPTY_RESPONSE');
    }

    const usage: AIUsage | null = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          candidatesTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : null;

    return {
      content: text.trim(),
      model: this.model,
      provider: PROVIDER_NAME,
      finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
      usage,
      latencyMs: Date.now() - startedAt,
    };
  }

  /** Handles timeouts, rate limits (429) and temporary server errors (5xx). */
  private async requestWithRetry(
    payload: unknown,
    apiKey: string,
    externalSignal?: AbortSignal,
  ): Promise<Response> {
    let lastError: AIProviderError | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const onExternalAbort = () => controller.abort();
      externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

      try {
        const response = await fetch(
          `${env.openaiBaseUrl}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
            cache: 'no-store',
          },
        );

        if (response.ok) return response;

        if (response.status === 429) {
          lastError = new AIProviderError(PROVIDER_NAME, 'AI_RATE_LIMIT');
        } else if (response.status >= 500) {
          lastError = new AIProviderError(PROVIDER_NAME, 'AI_UNAVAILABLE');
        } else {
          const details = await safeText(response);
          console.error('[openai] Requête refusée', response.status, details.slice(0, 500));
          throw new AIProviderError(
            PROVIDER_NAME,
            isKeyRejected(details)
              ? 'AI_INVALID_KEY'
              : isModelUnavailable(details)
                ? 'AI_MODEL_UNAVAILABLE'
                : 'AI_GENERIC_ERROR',
          );
        }
      } catch (error) {
        if (error instanceof AIProviderError) throw error;
        if (isAbortError(error)) {
          throw new AIProviderError(
            PROVIDER_NAME,
            externalSignal?.aborted ? 'AI_GENERIC_ERROR' : 'AI_TIMEOUT',
          );
        }
        lastError = new AIProviderError(PROVIDER_NAME, 'AI_UNAVAILABLE');
      } finally {
        clearTimeout(timeout);
        externalSignal?.removeEventListener('abort', onExternalAbort);
      }

      if (attempt < MAX_ATTEMPTS) {
        await delay(lastError?.code === 'AI_RATE_LIMIT' ? 700 * attempt : 400 * attempt);
      }
    }

    throw lastError ?? new AIProviderError(PROVIDER_NAME, 'AI_UNAVAILABLE');
  }
}

async function parseJsonBody(response: Response): Promise<OpenAIResponse> {
  try {
    const data = (await response.json()) as OpenAIResponse;
    if (!data || typeof data !== 'object' || !Array.isArray(data.choices)) {
      throw new AIProviderError(PROVIDER_NAME, 'AI_INVALID_RESPONSE');
    }
    return data;
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    throw new AIProviderError(PROVIDER_NAME, 'AI_INVALID_RESPONSE');
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function isKeyRejected(body: string): boolean {
  return [
    'invalid_api_key',
    'Incorrect API key',
    'Incorrect API key provided',
    'invalid api key',
    'unauthorized',
    '401',
  ].some((needle) => body.toLowerCase().includes(needle.toLowerCase()));
}

function isModelUnavailable(body: string): boolean {
  return ['model_not_found', 'not found', 'does not exist'].some((n) =>
    body.toLowerCase().includes(n),
  );
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('name' in error ? (error as { name?: string }).name === 'AbortError' : false)
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface OpenAIResponse {
  choices?: Array<{
    message?: { role?: string; content?: unknown };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}
