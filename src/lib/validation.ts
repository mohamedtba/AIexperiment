import { z } from 'zod';

/**
 * All API payloads are validated with these schemas.
 * Schemas are `.strict()` so unknown keys (query operators such as
 * `{ "$ne": null }`) are rejected instead of being forwarded to PostgreSQL.
 *
 * Every rule below carries its own French message. Issues without explicit
 * wording are translated by `zodIssueMessage()` in `src/lib/errors.ts`, so an
 * English default from Zod is never returned to the client.
 */

export const USERNAME_PATTERN = /^[a-z]{6}$/;
export const PASSWORD_PATTERN = /^[0-9]{4}$/;

export const studentLoginSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(1, 'Champ requis')
      .max(32, 'Champ trop long')
      .transform((value) => value.toLowerCase()),
    password: z
      .string()
      .trim()
      .min(1, 'Champ requis')
      .max(32, 'Champ trop long'),
  })
  .strict();

export const adminLoginSchema = z
  .object({
    username: z.string().trim().min(1, 'Champ requis').max(64, 'Champ trop long'),
    password: z.string().min(1, 'Champ requis').max(128, 'Champ trop long'),
  })
  .strict();

/**
 * Bulk creation of student accounts.
 *
 * A class is created in two groups (IA libre / IA guidée), so the teacher needs
 * to create several accounts at once and to say which group they belong to. The
 * quantity is bounded so a single request cannot flood the database.
 */
export const createStudentsSchema = z
  .object({
    group: z.enum(['AI_LIBRE', 'AI_GUIDEE'], {
      errorMap: () => ({ message: 'Groupe invalide.' }),
    }),
    quantity: z
      .number({
        required_error: 'Nombre d’étudiants manquant.',
        invalid_type_error: 'Nombre d’étudiants invalide.',
      })
      .int('Nombre d’étudiants invalide.')
      .min(1, 'Créez au moins un étudiant.')
      .max(50, 'Vous pouvez créer au maximum 50 étudiants à la fois.'),
  })
  .strict();

export const createExperimentSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(10, 'La question doit contenir au moins 10 caractères.')
      .max(1000, 'La question ne peut pas dépasser 1000 caractères.'),
  })
  .strict();

export const toggleAccessSchema = z
  .object({
    enabled: z.boolean({
      required_error: 'Valeur manquante.',
      invalid_type_error: 'Valeur invalide.',
    }),
  })
  .strict();

/** Enables or disables login for one student group. */
export const toggleGroupAccessSchema = z
  .object({
    group: z.enum(['AI_LIBRE', 'AI_GUIDEE']),
    allowed: z.boolean({ required_error: 'Valeur manquante.' }),
  })
  .strict();

/** Exports the credentials of just-created accounts as a PDF. */
export const credentialsPdfSchema = z
  .object({
    accounts: z
      .array(
        z.object({
          username: z.string().regex(/^[a-z]{6}$/, 'Identifiant invalide.'),
          password: z.string().regex(/^[0-9]{4}$/, 'Mot de passe invalide.'),
          group: z.enum(['AI_LIBRE', 'AI_GUIDEE']),
        }),
      )
      .min(1)
      .max(50),
  })
  .strict();

/** Moves a student to the other group. */
export const updateStudentGroupSchema = z
  .object({
    group: z.enum(['AI_LIBRE', 'AI_GUIDEE'], {
      errorMap: () => ({ message: 'Groupe invalide.' }),
    }),
  })
  .strict();

/**
 * Permanent deletion of the collected data.
 *
 * The teaching transcripts and the writings are the only thing the teacher can
 * no longer get back, so the request has to be explicit about the scope: the
 * accounts always survive, the experiments only when `experiments` is true.
 */
export const wipeDataSchema = z
  .object({
    /** Confirmation word, checked by the schema before anything is deleted. */
    confirm: z.literal('SUPPRIMER', {
      errorMap: () => ({ message: 'Saisissez SUPPRIMER pour confirmer.' }),
    }),
    /** Also delete the experiments (questions) themselves. Off by default. */
    experiments: z.boolean({
      required_error: 'Valeur manquante.',
      invalid_type_error: 'Valeur invalide.',
    }),
  })
  .strict();

export const chatMessageSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, 'Votre message ne peut pas être vide.')
      .max(4000, 'Votre message ne peut pas dépasser 4000 caractères.'),
  })
  .strict();

export const submitExpressionSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, 'Votre texte ne peut pas être vide.')
      .max(5000, 'Votre texte ne peut pas dépasser 5000 caractères.'),
    clientRequestId: z
      .string()
      .trim()
      .min(1, 'Identifiant de requête invalide.')
      .max(64, 'Identifiant de requête trop long.')
      .optional(),
    baseVersionNumber: z
      .number({
        required_error: 'Numéro de version invalide.',
        invalid_type_error: 'Numéro de version invalide.',
      })
      .int('Numéro de version invalide.')
      .positive('Numéro de version invalide.')
      .optional(),
  })
  .strict();

/** Parses a UUID route parameter, answering 404 instead of throwing. */
export const isUuidParam = (value: string): boolean => idParamSchema.safeParse(value).success;

/** Identifiers are UUIDs generated by PostgreSQL. */
export const idParamSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Identifiant invalide.',
  );

export const paginationSchema = z.object({
  limit: z.coerce
    .number({ invalid_type_error: 'Nombre de résultats invalide.' })
    .int('Nombre de résultats invalide.')
    .min(1, 'Nombre de résultats invalide.')
    .max(200, 'Nombre de résultats invalide.')
    .default(50),
  offset: z.coerce
    .number({ invalid_type_error: 'Décalage invalide.' })
    .int('Décalage invalide.')
    .min(0, 'Décalage invalide.')
    .max(100000, 'Décalage invalide.')
    .default(0),
});

export type StudentLoginInput = z.infer<typeof studentLoginSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type CreateStudentsInput = z.infer<typeof createStudentsSchema>;
export type UpdateStudentGroupInput = z.infer<typeof updateStudentGroupSchema>;
export type WipeDataInput = z.infer<typeof wipeDataSchema>;
export type CreateExperimentInput = z.infer<typeof createExperimentSchema>;
export type ToggleAccessInput = z.infer<typeof toggleAccessSchema>;
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type SubmitExpressionInput = z.infer<typeof submitExpressionSchema>;