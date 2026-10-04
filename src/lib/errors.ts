/**
 * Application error taxonomy.
 * Every message is written in French because it is displayed to end users.
 */

export const ERROR_MESSAGES = {
  // Authentification
  INVALID_CREDENTIALS: "Nom d'utilisateur ou mot de passe incorrect.",
  STUDENT_ACCESS_DISABLED: "L'accès aux étudiants est actuellement désactivé.",
  SESSION_EXPIRED: 'Votre session a expiré. Veuillez vous reconnecter.',
  FORBIDDEN: "Vous n'avez pas accès à cette ressource.",
  UNAUTHORIZED: "Vous devez être connecté pour accéder à cette page.",
  LOGIN_RATE_LIMIT: 'Trop de tentatives. Veuillez patienter une minute avant de réessayer.',
  USERNAME_TAKEN: "Ce nom d'utilisateur existe déjà. Veuillez réessayer.",
  MISSING_CREDENTIALS: "Veuillez renseigner votre nom d'utilisateur et votre mot de passe.",
  INVALID_USERNAME_FORMAT:
    "Le nom d'utilisateur doit contenir exactement 6 lettres minuscules (a-z).",
  INVALID_PASSWORD_FORMAT: 'Le mot de passe doit contenir exactement 4 chiffres.',

  // Expérience
  NO_ACTIVE_EXPERIMENT:
    "Aucune expérience active : l’accès à l’Assistant IA et à l’expression écrite est fermé pour le moment.",
  EXPERIMENT_QUESTION_REQUIRED: 'Veuillez saisir une question pour la nouvelle expérience.',
  EXPERIMENT_ALREADY_ACTIVE: 'Une expérience est déjà active. Veuillez en archiver une.',
  EXPERIMENT_NOT_FOUND: "Cette expérience n'existe pas.",
  STUDENT_NOT_FOUND: "Cet étudiant n'existe pas.",
  ADMIN_NOT_CONFIGURED:
    "Le compte administrateur n'est pas encore initialisé. Exécutez « npm run seed:admin ».",

  // Assistant IA
  AI_MESSAGE_EMPTY: 'Votre message ne peut pas être vide.',
  AI_RATE_LIMIT: "L'assistant IA est momentanément surchargé. Veuillez réessayer dans un instant.",
  AI_TIMEOUT: "L'assistant IA met trop de temps à répondre. Veuillez réessayer.",
  AI_UNAVAILABLE: "Impossible de contacter l'assistant IA.",
  AI_EMPTY_RESPONSE: "L'assistant IA n'a renvoyé aucune réponse. Veuillez reformuler votre demande.",
  AI_INVALID_RESPONSE: "Réponse inattendue de l'assistant IA.",
  AI_BLOCKED: "La demande a été bloquée par le filtre de sécurité de l'assistant IA.",
  AI_NOT_CONFIGURED: "L'assistant IA n'est pas configuré sur le serveur.",
  AI_INVALID_KEY:
    "La clé API de l'assistant IA est refusée par Google. Vérifiez la variable GEMINI_API_KEY et l'activation de l'API Generative Language.",
  AI_MODEL_UNAVAILABLE:
    "Le modèle d'assistant IA configuré n'est plus disponible. Vérifiez la variable GEMINI_MODEL.",
  AI_GENERIC_ERROR: "Une erreur est survenue. Veuillez réessayer.",

  // Expression écrite
  EXPRESSION_EMPTY: 'Votre texte ne peut pas être vide.',
  EXPRESSION_TOO_LONG: 'Votre texte est trop long (5000 caractères maximum).',
  EXPRESSION_NOT_FOUND: "Aucune version trouvée.",

  // Générique
  VALIDATION_ERROR: 'Certaines informations sont invalides. Veuillez vérifier le formulaire.',
  RATE_LIMIT: 'Trop de requêtes. Veuillez patienter un instant.',
  DATABASE_UNAVAILABLE:
    'Connexion à la base de données impossible. Vérifiez la variable DATABASE_URL et les identifiants PostgreSQL.',
  SERVER_ERROR: 'Une erreur est survenue. Veuillez réessayer.',
  NOT_FOUND: "Cette ressource n'existe pas.",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

/** Error carrying an HTTP status code and a French, user facing message. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(code: ErrorCode, status?: number, customMessage?: string) {
    super(customMessage ?? ERROR_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = status ?? defaultStatusForCode(code);
  }
}

/**
 * French fallbacks for structural Zod issues that carry no explicit message.
 * Schemas provide their own wording for the rules that matter (empty text,
 * length limits…); this map guarantees no English default ever reaches a user.
 */
const ZOD_ISSUE_FALLBACKS: Record<string, string> = {
  invalid_type: 'Un champ obligatoire est manquant ou contient un type invalide.',
  invalid_string: 'Le format de la valeur saisie est invalide.',
  invalid_enum_value: 'Cette valeur ne fait pas partie des valeurs autorisées.',
  invalid_arguments: 'Les paramètres fournis sont invalides.',
  invalid_date: 'La date fournie est invalide.',
  invalid_literal: 'La valeur fournie est incorrecte.',
  invalid_union: 'La valeur fournie est incorrecte.',
  invalid_union_discriminator: 'Cette valeur fournie est incorrecte.',
  invalid_intersection_types: 'La valeur fournie est incorrecte.',
  too_small: 'La valeur saisie est trop courte.',
  too_big: 'La valeur saisie est trop longue.',
  too_small_for_datetime: 'La date saisie est trop ancienne.',
  too_big_for_datetime: 'La date saisie est trop récente.',
  not_multiple_of: 'La valeur saisie doit être un multiple.',
  not_finite: 'Un nombre fini est attendu.',
  unrecognized_keys: 'Données non autorisées : certains champs sont inattendus.',
};

/** First user facing message of a ZodError, guaranteed to be French. */export function zodIssueMessage(error: unknown): string {
  const issues = (error as { issues?: Array<{ code?: string; message?: string }> })?.issues;
  const first = issues?.[0];
  const explicit = typeof first?.message === 'string' ? first.message.trim() : '';
  if (explicit.length > 0) return explicit;
  const fallback = first?.code ? ZOD_ISSUE_FALLBACKS[first.code] : undefined;
  return fallback ?? ERROR_MESSAGES.VALIDATION_ERROR;
}

function defaultStatusForCode(code: ErrorCode): number {
  switch (code) {
    case 'UNAUTHORIZED':
    case 'SESSION_EXPIRED':
    case 'ADMIN_NOT_CONFIGURED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
    case 'EXPERIMENT_NOT_FOUND':
    case 'STUDENT_NOT_FOUND':
    case 'EXPRESSION_NOT_FOUND':
      return 404;
    case 'LOGIN_RATE_LIMIT':
    case 'RATE_LIMIT':
    case 'AI_RATE_LIMIT':
      return 429;
    case 'STUDENT_ACCESS_DISABLED':
    case 'EXPERIMENT_ALREADY_ACTIVE':
    case 'USERNAME_TAKEN':
      return 409;
    case 'AI_TIMEOUT':
    case 'AI_UNAVAILABLE':
    case 'AI_NOT_CONFIGURED':
    case 'AI_INVALID_KEY':
    case 'AI_MODEL_UNAVAILABLE':
      return 502;
    case 'AI_INVALID_RESPONSE':
    case 'AI_BLOCKED':
    case 'AI_EMPTY_RESPONSE':
    case 'SERVER_ERROR':
    case 'AI_GENERIC_ERROR':
      return 500;
    case 'DATABASE_UNAVAILABLE':
      return 503;
    default:
      return 400;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Detects a PostgreSQL failure (wrong credentials, unreachable host, rejected
 * IP, TLS mismatch, invalid connection string…). These are deployment problems,
 * not user mistakes, so they get an explicit message instead of a generic error.
 */
export function isDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const name = 'name' in error ? String((error as { name?: unknown }).name ?? '') : '';
  if (name.startsWith('AggregateError')) return true;

  const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
  if (typeof code === 'string') {
    // Network: host unreachable / DNS failure / TLS handshake refused.
    if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNRESET', 'EPROTO'].includes(code)) {
      return true;
    }
    // 28xxx = class 28 (system administration): authentication / authorisation.
    // 3D000 = invalid_catalog_name, 53300 = too_many_connections.
    if (/^28/.test(code) || code === '3D000' || code === '53300') return true;
  }

  const message = 'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
  return [
    'password authentication failed',
    'no pg_hba.conf entry',
    'self-signed certificate',
    'unable to verify the first certificate',
    'certificate has expired',
    'server closed the connection',
    'the database system is starting up',
    'timeout exceeded when trying to connect',
  ].some((needle) => message.includes(needle));
}

/** Convert any thrown value into a French message + HTTP status. */
export function toErrorResponse(error: unknown): {
  status: number;
  body: { error: { code: string; message: string } };
} {
  if (isAppError(error)) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message } },
    };
  }

  if (error instanceof Error && error.name === 'ZodError') {
    return {
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          // The schemas use French messages, they are safe to display.
          message: zodIssueMessage(error),
        },
      },
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  // 23505 = unique_violation. `students_username_unique` is the only constraint a
  // client can collide with on purpose; the others are handled in the repositories.
  const constraint =
    typeof error === 'object' && error !== null && 'constraint' in error
      ? String((error as { constraint?: unknown }).constraint ?? '')
      : '';
  const uniqueViolation =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code === '23505'
      : false;
  if (uniqueViolation && constraint.includes('username')) {
    return {
      status: 409,
      body: {
        error: { code: 'USERNAME_TAKEN', message: ERROR_MESSAGES.USERNAME_TAKEN },
      },
    };
  }

  if (isDatabaseError(error)) {
    // Deployment issue (DATABASE_URL, credentials, IP allowlist, DNS…): the
    // message points the administrator to the configuration instead of showing
    // a generic failure.
    console.error('[base de donnees injoignable]', message);
    return {
      status: 503,
      body: {
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: ERROR_MESSAGES.DATABASE_UNAVAILABLE,
        },
      },
    };
  }

  console.error('[erreur non geree]', error);
  return {
    status: 500,
    body: { error: { code: 'SERVER_ERROR', message: ERROR_MESSAGES.SERVER_ERROR } },
  };
}