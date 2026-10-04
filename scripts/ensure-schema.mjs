#!/usr/bin/env node
/**
 * Création (ou vérification) du schéma PostgreSQL.
 * Utile après un déploiement sur une base vide ; l'application applique aussi le
 * schéma au premier accès, cette commande est donc facultative.
 *
 * Usage : npm run db:schema
 */
import pg from 'pg';

const TABLES = [
  `create table if not exists admins (
     id            uuid primary key default gen_random_uuid(),
     username      text not null,
     password_hash text not null,
     created_at    timestamptz not null default now(),
     last_login_at timestamptz
   )`,
  'create unique index if not exists admins_username_unique on admins (username)',
  `create table if not exists students (
     id               uuid primary key default gen_random_uuid(),
     username         text not null,
     password_hash    text not null,
     password_version integer not null default 1,
     created_at       timestamptz not null default now(),
     updated_at       timestamptz,
     last_login_at    timestamptz
   )`,
  'create unique index if not exists students_username_unique on students (username)',
  'create index if not exists students_created_at on students (created_at desc)',
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
  'create index if not exists experiments_started_at on experiments (started_at desc)',
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
  'create index if not exists ai_messages_recent on ai_messages (created_at desc)',
  `create table if not exists expression_versions (
     id                uuid primary key default gen_random_uuid(),
     student_id        uuid not null,
     experiment_id     uuid not null,
     content           text not null,
     version_number    integer not null,
     created_at        timestamptz not null default now(),
     client_request_id text
   )`,
  `create unique index if not exists expression_versions_unique_version
     on expression_versions (student_id, experiment_id, version_number)`,
  `create unique index if not exists expression_versions_idempotency
     on expression_versions (client_request_id) where client_request_id is not null`,
  `create index if not exists expression_versions_experiment
     on expression_versions (experiment_id, created_at desc)`,
  `create table if not exists system_settings (
     key                    text primary key,
     student_access_enabled boolean not null default true,
     access_epoch           integer not null default 1,
     updated_at             timestamptz not null default now(),
     disabled_at            timestamptz
   )`,
  `create table if not exists counters (
     key   text primary key,
     value integer not null default 0
   )`,
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('\n✖ La variable DATABASE_URL est absente.\n');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000 });
  await client.connect();

  try {
    for (const statement of TABLES) await client.query(statement);

    const { rows } = await client.query(
      `select table_name from information_schema.tables
        where table_schema = current_schema()
        order by table_name`,
    );
    console.log('\n✔ Schéma appliqué.');
    for (const row of rows) console.log(`  · ${row.table_name}`);
    console.log('');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('\n✖ Échec :', error?.message ?? error, '\n');
  process.exit(1);
});