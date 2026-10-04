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
  get aiProvider(): string {
    return read('AI_PROVIDER') ?? 'gemini';
  },
  get geminiApiKey(): string | undefined {
    return read('GEMINI_API_KEY');
  },
  get geminiModel(): string {
    return read('GEMINI_MODEL') ?? 'gemini-2.0-flash';
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