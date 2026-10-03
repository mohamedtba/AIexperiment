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

const PROVIDER_NAME = 'gemini';
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 2;

/**
 * Gemini implementation, using the official REST endpoint (server-side only).
 * The API key is read from the environment and never leaves the server.
 */
export class GeminiProvider implements AIProvider {
  readonly name = PROVIDER_NAME;
  readonly model: string;

  constructor(model: string = env.geminiModel) {
    this.model = model;
  }

  isConfigured(): boolean {
    return Boolean(env.geminiApiKey);
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const apiKey = env.geminiApiKey;
    if (!apiKey) {
      throw new AIProviderError(PROVIDER_NAME, 'AI_NOT_CONFIGURED');
    }

    const startedAt = Date.now();
    const payload = {
      systemInstruction: { parts: [{ text: AI_SYSTEM_INSTRUCTION }] },
      contents: request.messages.map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.content }],
      })),
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        topP: 0.95,
        maxOutputTokens: request.maxOutputTokens ?? 2048,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    };

    const response = await this.requestWithRetry(payload, apiKey, request.signal);
    const data = await parseJsonBody(response);

    const candidate = data.candidates[0];
    const finishReason: string | null = candidate?.finishReason ?? null;
    const text = extractText(candidate?.content?.parts);

    if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT' ||
        finishReason === 'BLOCKLIST' || finishReason === 'SPII') {
      throw new AIProviderError(PROVIDER_NAME, 'AI_BLOCKED');
    }
    if (!text) {
      throw new AIProviderError(PROVIDER_NAME, 'AI_EMPTY_RESPONSE');
    }

    const usage: AIUsage | null = data?.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          candidatesTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        }
      : null;

    return {
      content: text.trim(),
      model: this.model,
      provider: PROVIDER_NAME,
      finishReason,
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
          `${env.geminiBaseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
          // 4xx other than 429: invalid key, quota, malformed request.
          const details = await safeText(response);
          console.error('[gemini] Requete refusee', response.status, details.slice(0, 500));
          throw new AIProviderError(
            PROVIDER_NAME,
            response.status === 400 || response.status === 403
              ? 'AI_GENERIC_ERROR'
              : 'AI_UNAVAILABLE',
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

      if (attempt < MAX_ATTEMPTS && lastError?.code === 'AI_RATE_LIMIT') {
        await delay(700 * attempt);
      } else if (attempt < MAX_ATTEMPTS) {
        await delay(400 * attempt);
      }
    }

    throw lastError ?? new AIProviderError(PROVIDER_NAME, 'AI_UNAVAILABLE');
  }
}

function extractText(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => {
      if (part && typeof part === 'object' && 'text' in part) {
        const value = (part as { text?: unknown }).text;
        return typeof value === 'string' ? value : '';
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

async function parseJsonBody(response: Response): Promise<GeminiResponse> {
  try {
    const data = (await response.json()) as GeminiResponse;
    // A structurally valid JSON that does not contain any candidate is a
    // malformed response, not an empty answer.
    if (!data || typeof data !== 'object' || !Array.isArray(data.candidates)) {
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

interface GeminiResponse {
  candidates: Array<{
    content?: { parts?: unknown };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}