import 'server-only';

/**
 * Schema definition (PostgreSQL).
 *
 * Every statement is idempotent, so the application can apply them on boot
 * without any migration tool and without touching an existing database.
 *
 * Important guarantees:
 *  - `admins.username` and `students.username` are unique (account identity).
 *  - the partial unique index `experiments_single_active` makes it impossible,
 *    even at the database level, to have two ACTIVE experiments at the same time.
 *  - `expression_versions` is unique per (student, experiment, version number)
 *    and per idempotency key, which protects against duplicated submissions.
 *  - `students.study_group` records the study group (IA libre / IA guidée) so the
 *    teacher can compare the two groups afterwards. It is a label only: the
 *    assistant behaves identically for both groups.
 *
 * No foreign key is declared on purpose: the transcripts and the writing
 * versions are experiment archives that must survive the deletion of an
 * account, and no screen ever deletes an account.
 */
export const SCHEMA_STATEMENTS: readonly string[] = [
  `create table if not exists admins (
     id            uuid primary key default gen_random_uuid(),
     username      text not null,
     password_hash text not null,
     created_at    timestamptz not null default now(),
     last_login_at timestamptz
   )`,
  `create unique index if not exists admins_username_unique on admins (username)`,

  `create table if not exists students (
     id               uuid primary key default gen_random_uuid(),
     username         text not null,
     password_hash    text not null,
     password_version integer not null default 1,
     created_at       timestamptz not null default now(),
     updated_at       timestamptz,
     last_login_at    timestamptz
   )`,
  `create unique index if not exists students_username_unique on students (username)`,
  `create index if not exists students_created_at on students (created_at desc)`,

  /**
   * Study group of the student: IA_LIBRE or IA_GUIDEE.
   *
   * Added after the table was first created, so the statement is idempotent and
   * an existing database simply gains the column, defaulting to IA_LIBRE. This is
   * purely an administrative label: it is displayed and exported, but it never
   * changes how the assistant answers.
   */
  `alter table students
       add column if not exists study_group text not null default 'AI_LIBRE'
       check (study_group in ('AI_LIBRE', 'AI_GUIDEE'))`,
  `create index if not exists students_study_group on students (study_group)`,

  `create table if not exists experiments (
     id          uuid primary key default gen_random_uuid(),
     sequence    integer not null,
     question    text not null,
     status      text not null check (status in ('ACTIVE', 'ARCHIVED')),
     created_at  timestamptz not null default now(),
     started_at  timestamptz not null default now(),
     archived_at timestamptz
   )`,
  `create unique index if not exists experiments_single_active
     on experiments (status) where status = 'ACTIVE'`,
  `create index if not exists experiments_started_at on experiments (started_at desc)`,

  `create table if not exists ai_messages (
     id            uuid primary key default gen_random_uuid(),
     student_id    uuid not null,
     experiment_id uuid not null,
     role          text not null check (role in ('student', 'assistant')),
     content       text not null,
     created_at    timestamptz not null default now(),
     model         text,
     latency_ms    integer,
     error_code    text
   )`,
  `create index if not exists ai_messages_student_experiment
     on ai_messages (student_id, experiment_id, created_at)`,
  `create index if not exists ai_messages_experiment_recent
     on ai_messages (experiment_id, created_at desc)`,
  `create index if not exists ai_messages_recent on ai_messages (created_at desc)`,

  `create table if not exists expression_versions (
     id               uuid primary key default gen_random_uuid(),
     student_id       uuid not null,
     experiment_id    uuid not null,
     content          text not null,
     version_number   integer not null,
     created_at       timestamptz not null default now(),
     client_request_id text
   )`,
  `create unique index if not exists expression_versions_unique_version
     on expression_versions (student_id, experiment_id, version_number)`,
  `create unique index if not exists expression_versions_idempotency
     on expression_versions (client_request_id) where client_request_id is not null`,
  `create index if not exists expression_versions_experiment
     on expression_versions (experiment_id, created_at desc)`,

  `create table if not exists system_settings (
     key                   text primary key,
     student_access_enabled boolean not null default true,
     access_epoch          integer not null default 1,
     updated_at            timestamptz not null default now(),
     disabled_at           timestamptz
   )`,

  `create table if not exists counters (
     key   text primary key,
     value integer not null default 0
   )`,
];

/** Tables created by the schema, in creation order (used by the tests and docs). */
export const SCHEMA_TABLES: readonly string[] = [
  'admins',
  'students',
  'experiments',
  'ai_messages',
  'expression_versions',
  'system_settings',
  'counters',
];