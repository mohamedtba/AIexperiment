#!/usr/bin/env node
/**
 * Initialisation du compte administrateur unique.
 *
 * Usage :
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD='...securise...' npm run seed:admin
 *
 * - Le mot de passe est lu depuis la variable d'environnement ADMIN_PASSWORD
 *   (jamais écrit dans le dépôt).
 * - Le mot de passe est haché avec bcrypt avant d'être stocké.
 * - La commande est idempotente : relancer la mise à jour change le mot de passe.
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';

const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/i;

function fail(message, code = 1) {
  console.error(`\n✖ ${message}\n`);
  process.exit(code);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const username = (process.env.ADMIN_USERNAME ?? '').trim();
  const password = process.env.ADMIN_PASSWORD ?? '';

  if (!databaseUrl) fail('La variable DATABASE_URL est absente (fichier .env manquant ?).');
  if (!username) fail('La variable ADMIN_USERNAME est absente.');
  if (!USERNAME_PATTERN.test(username)) {
    fail('ADMIN_USERNAME doit contenir 3 à 64 caractères (lettres, chiffres, . _ -).');
  }
  if (password.length < 8) {
    fail('ADMIN_PASSWORD doit contenir au moins 8 caractères.');
  }

  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000 });
  await client.connect();

  try {
    await client.query(`create table if not exists admins (
      id            uuid primary key default gen_random_uuid(),
      username      text not null,
      password_hash text not null,
      created_at    timestamptz not null default now(),
      last_login_at timestamptz
    )`);
    await client.query('create unique index if not exists admins_username_unique on admins (username)');

    const passwordHash = await bcrypt.hash(password, 12);

    // `xmax = 0` distinguishes an insertion from an update.
    const result = await client.query(
      `insert into admins (username, password_hash)
            values ($1, $2)
       on conflict (username) do update
              set password_hash = excluded.password_hash,
                  last_login_at = null
         returning created_at, (xmax = 0) as created`,
      [username, passwordHash],
    );
    const created = Boolean(result.rows[0]?.created);

    // The student access switch keeps its default value ("enabled"): the row in
    // `system_settings` is created by the application on first read.

    console.log('\n✔ Administrateur initialisé');
    console.log(`  Identifiant : ${username}`);
    console.log(`  Mot de passe : ${password}`);
    console.log(`  ${created ? 'Compte créé' : 'Mot de passe mis à jour'}`);
    console.log('  Connectez-vous sur /connexion → onglet « Administrateur ».\n');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('\n✖ Échec de l’initialisation :', error?.message ?? error, '\n');
  process.exit(1);
});