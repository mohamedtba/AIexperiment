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
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

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

  const client = new MongoClient(databaseUrl, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();

  try {
    const db = client.db(process.env.DATABASE_NAME || undefined);
    await db.collection('admins').createIndex({ username: 1 }, { unique: true, name: 'admins_username_unique' });

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();

    const result = await db.collection('admins').findOneAndUpdate(
      { username },
      {
        $set: { username, passwordHash, updatedAt: now },
        $setOnInsert: { createdAt: now, lastLoginAt: null },
      },
      { upsert: true, returnDocument: 'after' },
    );

    const doc = 'value' in result && result.value ? result.value : null;

    // Valeurs par défaut du paramètre global d'accès.
    await db.collection('systemSettings').updateOne(
      { key: 'global' },
      {
        $setOnInsert: {
          studentAccessEnabled: true,
          accessEpoch: 1,
          updatedAt: now,
          disabledAt: null,
        },
      },
      { upsert: true },
    );

    const created = doc && doc.createdAt && Math.abs(doc.createdAt.getTime() - now.getTime()) < 5000;

    console.log('\n✔ Administrateur initialisé');
    console.log(`  Identifiant : ${username}`);
    console.log(`  Mot de passe : ${password}`);
    console.log(`  ${created ? 'Compte créé' : 'Mot de passe mis à jour'}`);
    console.log('  Connectez-vous sur /connexion → onglet « Administrateur ».\n');
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('\n✖ Échec de l’initialisation :', error?.message ?? error, '\n');
  process.exit(1);
});