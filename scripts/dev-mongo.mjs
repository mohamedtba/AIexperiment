/**
 * Local MongoDB for development (no Atlas needed).
 *
 * Starts a persistent `mongod` on 127.0.0.1:27017 with the data stored in
 * `.mongo-data/` (git-ignored), using the `mongodb-memory-server` binary that
 * the test suite already downloads.
 *
 * Usage:
 *   npm run db:local                  # terminal 1
 *   DATABASE_URL=mongodb://127.0.0.1:27017/atelier_ecriture npm run dev   # terminal 2
 *
 * Stop it with Ctrl+C. The data survives restarts; delete `.mongo-data/` to
 * start from an empty database.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const PORT = Number(process.env.LOCAL_MONGO_PORT ?? 27017);
const DB_NAME = process.env.LOCAL_MONGO_DB ?? 'atelier_ecriture';
const dbPath = resolve(process.cwd(), '.mongo-data');

if (!existsSync(dbPath)) mkdirSync(dbPath, { recursive: true });

/**
 * True when something already listens on the port. Checked before starting,
 * because `mongod` otherwise fails with a raw `DBPathInUse` stack trace.
 */
function isPortBusy(port) {
  return new Promise((resolveBusy) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (busy) => {
      socket.destroy();
      resolveBusy(busy);
    };
    socket.setTimeout(1000, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

if (await isPortBusy(PORT)) {
  console.error(
    `\n  Le port ${PORT} est déjà utilisé : un MongoDB est probablement déjà démarré` +
      `\n  (dossier ${dbPath}). Fermez l’autre terminal, ou changez LOCAL_MONGO_PORT.\n`,
  );
  process.exit(1);
}

/** Starts the instance, or explains why it cannot start. */
async function start() {
  try {
    return await MongoMemoryServer.create({
      instance: {
        port: PORT,
        dbPath,
        storageEngine: 'wiredTiger',
      },
    });
  } catch (error) {
    const details = String(error?.message ?? error);
    const alreadyRunning =
      details.includes('DBPathInUse') || details.includes('Address already in use');
    console.error(
      alreadyRunning
        ? `\n  Un MongoDB est déjà démarré sur le port ${PORT} (dossier ${dbPath}).\n  Fermez l’autre terminal, ou changez LOCAL_MONGO_PORT.\n`
        : `\n  Démarrage impossible : ${details}\n`,
    );
    process.exitCode = 1;
    return null;
  }
}

const server = await start();

if (server) {
  console.log(`\n  MongoDB local démarré sur le port ${PORT}`);
  console.log(`  Données : ${dbPath}`);
  console.log(`  DATABASE_URL=mongodb://127.0.0.1:${PORT}/${DB_NAME}`);
  console.log('  Arrêter : Ctrl+C\n');

  let stopping = false;
  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n  Arrêt (${signal})…`);
    await server.stop().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));

  // Keeps the process alive.
  setInterval(() => {}, 1 << 30);
}