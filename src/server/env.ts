import 'server-only';

/**
 * Centralised, server-only access to environment variables.
 * Secrets are validated lazily so that the app can boot (and show a clear
 * message) even when a variable is missing.
 */

class MissingEnvError extends Error {
  constructor(name: string) {
    super(`La variable d'environnement ${name} est manquante.`);
    this.name = 'MissingEnvError';
  }
}

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function requireEnv(name: string): string {
  const value = read(name);
  if (!value) throw new MissingEnvError(name);
  return value;
}

export const env = {
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
  get databaseUrl(): string {
    const url = requireEnv('DATABASE_URL');
    if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
      throw new MissingEnvError(
        "DATABASE_URL doit commencer par « postgres:// » ou « postgresql:// ».",
      );
    }
    return url;
  },
  get authSecret(): string {
    const secret = read('AUTH_SECRET');
    if (!secret) {
      throw new MissingEnvError('AUTH_SECRET');
    }
    if (secret.length < 32 && process.env.NODE_ENV === 'production') {
      throw new Error(
        'AUTH_SECRET doit contenir au moins 32 caractères en production.',
      );
    }
    return secret;
  },
  get sessionMaxAgeSeconds(): number {
    const raw = read('SESSION_MAX_AGE');
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 300 ? parsed : 43200;
  },
  /**
   * Login attempts allowed per minute and per IP address.
   *
   * The default (12) is a brute-force brake: passwords are four digits, so the
   * limit has to stay low. It is configurable because a whole class shares one
   * public IP behind the school network, and twelve simultaneous connections
   * would lock most of the room out. Raising it does not make guessing easier
   * per account, it only lets a legitimate class log in together.
   */
  get loginAttemptsPerMinute(): number {
    const raw = read('LOGIN_ATTEMPTS_PER_MINUTE');
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 12;
  },
  get aiProvider(): string {
    // OpenAI is the active provider; `gemini` remains registered for legacy
    // deployments that still set GEMINI_API_KEY.
    return read('AI_PROVIDER') ?? 'openai';
  },
  get openaiApiKey(): string | undefined {
    return read('OPENAI_API_KEY');
  },
  get openaiModel(): string {
    return read('OPENAI_MODEL') ?? 'gpt-4o-mini';
  },
  get openaiBaseUrl(): string {
    return read('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1';
  },
  get geminiApiKey(): string | undefined {
    return read('GEMINI_API_KEY');
  },
  get geminiModel(): string {
    // `gemini-2.0-flash` has been retired by Google: the API answers 404 and
    // names the replacement in the error, so it must not be the default.
    return read('GEMINI_MODEL') ?? 'gemini-3.8-flash';
  },
  get geminiBaseUrl(): string {
    return read('GEMINI_BASE_URL') ?? 'https://generativelanguage.googleapis.com/v1beta';
  },
  get adminUsername(): string | undefined {
    return read('ADMIN_USERNAME');
  },
  get adminPassword(): string | undefined {
    return read('ADMIN_PASSWORD');
  },
};

export function isMissingEnvError(error: unknown): boolean {
  return error instanceof MissingEnvError;
}