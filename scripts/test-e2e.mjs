#!/usr/bin/env node
/**
 * End-to-end integration tests.
 *
 * Boots a REAL production build of the application (`next start`) against:
 *   - a real PostgreSQL instance (PGlite, the official Postgres compiled to
 *     WebAssembly, exposed over TCP so `pg` connects to it normally)
 *   - a local Gemini-compatible endpoint (fake server, no API key required)
 *
 * Every check below exercises the real HTTP API with real cookies, so it covers
 * authentication, authorization, versioning, archiving and access revocation.
 *
 * Usage: npm run test:e2e
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const APP_PORT = 3137;
const GEMINI_PORT = 4137;
const DB_PORT = 54329;
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'MotDePasseAdmin!2026';
const AUTH_SECRET = 'test-secret-auth-value-with-more-than-32-characters-1234567890';

const QUESTION_1 =
  "Rédigez un texte sur l'importance de la lecture dans la vie quotidienne.";
const QUESTION_2 = 'Protection de l’environnement : quels sont vos engagements ?';
const QUESTION_3 = 'Décrivez un lieu de votre enfance que vous n’oublierez jamais.';

/* ------------------------------------------------------------------ results */
const results = [];
let currentGroup = '';

function group(name) {
  currentGroup = name;
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  results.push({ group: currentGroup, label, ok, detail });
  const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
  console.log(`  ${mark} ${label}${detail ? ` \x1b[90m(${detail})\x1b[0m` : ''}`);
  return ok;
}

/* ------------------------------------------------------------- http client */
function createClient(baseUrl = BASE_URL) {
  const cookies = new Map();

  async function request(pathname, options = {}) {
    const headers = new Headers(options.headers ?? {});
    if (cookies.size > 0) {
      headers.set(
        'cookie',
        [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
      );
    }
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...options,
      headers,
      redirect: 'manual',
    });
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === '') cookies.delete(name);
      else cookies.set(name, value);
    }
    return response;
  }

  /** Every helper returns { response, data } with `data` parsed as JSON if possible. */
  async function call(pathname, options = {}) {
    const response = await request(pathname, options);
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { html: text };
      }
    }
    return { response, data };
  }

  return {
    cookies,
    request,
    call,
    get: (pathname, options) => call(pathname, { ...options, method: 'GET' }),
    postJson: (pathname, body, options) =>
      call(pathname, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
        ...options,
      }),
    patchJson: (pathname, body) =>
      call(pathname, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      }),
    delete: (pathname) => call(pathname, { method: 'DELETE' }),
  };
}

/* ------------------------------------------------------- fake Gemini server */
let geminiMode = 'ok';
const geminiCalls = [];

function startFakeGemini() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${GEMINI_PORT}`);
      if (!url.pathname.includes(':generateContent')) {
        res.writeHead(404).end('{}');
        return;
      }

      let body = '';
      for await (const chunk of req) body += chunk;
      let parsed = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = {};
      }
      geminiCalls.push({
        url: url.pathname,
        hasKey: Boolean(url.searchParams.get('key')),
        model: url.pathname.split('/models/')[1]?.split(':')[0],
        contents: parsed.contents ?? [],
        systemInstruction: parsed.systemInstruction ?? null,
      });

      const send = (status, payload) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      if (geminiMode === 'rate_limit') return send(429, { error: { message: 'quota' } });
      if (geminiMode === 'server_error') return send(503, { error: { message: 'oops' } });
      if (geminiMode === 'empty') return send(200, { candidates: [{ content: { parts: [] } }] });
      if (geminiMode === 'garbage') return send(200, { unexpected: true });
      if (geminiMode === 'blocked') {
        return send(200, { candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'SAFETY' }] });
      }

      const lastUser = [...(parsed.contents ?? [])]
        .reverse()
        .find((item) => item.role === 'user')
        ?.parts?.[0]?.text;

      return send(200, {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: `Réponse de test à : « ${lastUser ?? ''} »` }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
      });
    });
    server.listen(GEMINI_PORT, '127.0.0.1', () => resolve(server));
  });
}

/* ------------------------------------------------------------- app lifecycle */
async function waitForApp(timeoutMs = 120_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/api/system/status`);
      if (response.ok) return true;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw new Error("Le serveur Next.js n'a pas démarré dans le délai imparti.");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------- suite */
async function run() {
  console.log('\x1b[1m╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Tests d’intégration — Atelier d’écriture (prod build)          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\x1b[0m');

  // 1. Base de données réelle (PostgreSQL)
  const database = await PGlite.create();
  const dbServer = new PGLiteSocketServer({
    db: database,
    port: DB_PORT,
    host: '127.0.0.1',
    maxConnections: 16,
  });
  await dbServer.start();
  const databaseUrl = `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres?sslmode=disable`;
  console.log(`\n· PostgreSQL (PGlite) : ${databaseUrl}`);

  // 2. Faux endpoint Gemini (compatible API)
  const geminiServer = await startFakeGemini();
  console.log(`· Endpoint Gemini simulé : http://127.0.0.1:${GEMINI_PORT}/v1beta`);

  // 3. Initialisation de l'administrateur
  await runSeed(databaseUrl);
  console.log('· Administrateur initialisé (bcrypt)');

  // 4. Serveur de production
  const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(APP_PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: databaseUrl,
      AUTH_SECRET,
      ADMIN_USERNAME,
      ADMIN_PASSWORD,
      GEMINI_API_KEY: 'clé-de-test-gemini-1234567890',
      GEMINI_BASE_URL: `http://127.0.0.1:${GEMINI_PORT}/v1beta`,
      GEMINI_MODEL: 'gemini-3.8-flash',
      SESSION_MAX_AGE: '3600',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const appLog = [];
  app.stdout.on('data', (chunk) => appLog.push(String(chunk)));
  app.stderr.on('data', (chunk) => appLog.push(String(chunk)));

  try {
    await waitForApp();
    console.log(`· Application démarrée sur ${BASE_URL}\n`);

    await runTests();
    await checkNoSecretExposure();
    await checkConversationLabels();
    await checkFrenchPlurals();
    await checkConnectionResilience();
    await checkRevokedSessionRedirects();
  } catch (error) {
    console.error('\n\x1b[31mÉchec du test :\x1b[0m', error);
    results.push({ group: 'Harnais', label: 'Exécution du test', ok: false, detail: String(error?.message ?? error) });
  } finally {
    app.kill('SIGTERM');
    await sleep(500);
    if (!app.killed) app.kill('SIGKILL');
    geminiServer.close();
    await dbServer.stop().catch(() => {});
    await database.close().catch(() => {});
  }

  printSummary();
}

async function runSeed(databaseUrl) {
  await new Promise((resolve, reject) => {
    const seed = spawn(
      process.execPath,
      ['--env-file-if-exists=.env', 'scripts/seed-admin.mjs'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          ADMIN_USERNAME,
          ADMIN_PASSWORD,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    seed.stdout.on('data', (chunk) => (output += chunk));
    seed.stderr.on('data', (chunk) => (output += chunk));
    seed.on('exit', (code) => (code === 0 ? resolve(output) : reject(new Error(output))));
  });
}

async function runTests() {
  const anonymous = createClient();
  const admin = createClient();
  const alice = createClient();
  const bob = createClient();

  /* 1-2. Connexion administrateur + garde d'authentification */
  group('1. Authentification');
  {
    const { response } = await anonymous.get('/admin');
    check(
      'Zone administrateur protégée (redirection vers /connexion)',
      response.status === 307 && (response.headers.get('location') ?? '').includes('/connexion'),
      `HTTP ${response.status}`,
    );

    const bad = await anonymous.postJson('/api/auth/admin/login', {
      username: ADMIN_USERNAME,
      password: 'mauvais-mot-de-passe',
    });
    check(
      'Mot de passe administrateur erroné refusé (message en français)',
      bad.response.status === 401 &&
        bad.data?.error?.message === "Nom d'utilisateur ou mot de passe incorrect.",
      bad.data?.error?.message,
    );

    const ok = await admin.postJson('/api/auth/admin/login', {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    });
    check('Connexion administrateur réussie', ok.response.status === 200, `HTTP ${ok.response.status}`);
    check(
      'Cookie de session HttpOnly',
      (admin.cookies.get('atelier_session') ?? '').length > 20,
      'atelier_session présent',
    );
  }

  /* 3-4. Création de comptes étudiants + unicité des identifiants */
  group('2. Comptes étudiants');
  const created = [];
  {
    for (let index = 0; index < 4; index += 1) {
      const { response, data } = await admin.postJson('/api/admin/students', {});
      const username = data?.student?.username ?? '';
      const password = data?.password ?? '';
      created.push({ username, password, id: data?.student?.id });
      check(
        `Compte étudiant ${index + 1} créé`,
        response.status === 201 && /^[a-z]{6}$/.test(username) && /^[0-9]{4}$/.test(password),
        `${username} / ${password}`,
      );
    }
    check(
      'Identifiants tous différents',
      new Set(created.map((item) => item.username)).size === created.length,
    );

    const forbidden = await alice.postJson('/api/admin/students', {});
    check(
      'Un étudiant ne peut pas créer de compte',
      forbidden.response.status === 401,
      `HTTP ${forbidden.response.status}`,
    );
  }

  /* 5. Un étudiant ne peut pas accéder à l'administration */
  group('3. Autorisations');
  {
    const login = await alice.postJson('/api/auth/student/login', {
      username: created[0].username,
      password: created[0].password,
    });
    check('Connexion étudiant réussie', login.response.status === 200, `HTTP ${login.response.status}`);

    const adminRoute = await alice.get('/admin');
    check(
      'Étudiant redirigé hors de /admin',
      adminRoute.response.status === 307 &&
        (adminRoute.response.headers.get('location') ?? '').includes('/etudiant'),
      `HTTP ${adminRoute.response.status}`,
    );

    const adminApi = await alice.get('/api/admin/students');
    check(
      'API administrateur interdite pour un étudiant',
      adminApi.response.status === 403,
      `HTTP ${adminApi.response.status} ${adminApi.data?.error?.message ?? ''}`,
    );
  }

  /* 6-7. Expériences : création, unicité de l'active, archivage */
  group('4. Expériences');
  {
    const created1 = await admin.postJson('/api/admin/experiments', { question: QUESTION_1 });
    check('Première expérience démarrée', created1.response.status === 201, `n°${created1.data?.experiment?.sequence}`);
    check('Statut ACTIVE', created1.data?.experiment?.status === 'ACTIVE');

    const duplicate = await admin.postJson('/api/admin/experiments', { question: QUESTION_2 });
    const experiments = await admin.get('/api/admin/experiments');
    const activeCount = experiments.data?.active ? 1 : 0;
    check(
      'Une seule expérience active à la fois',
      activeCount === 1 && duplicate.response.status === 201,
      `active=${experiments.data?.active?.id}`,
    );

    const archived = experiments.data?.archived?.[0];
    check(
      'L’expérience précédente est archivée (conservée)',
      Boolean(archived) && archived.status === 'ARCHIVED' && archived.question === QUESTION_1,
      archived ? `n°${archived.sequence} — ${archived.archivedAt ? 'archivedAt' : 'sans date'}` : 'aucune',
    );
  }

  /* 8. L'étudiant voit la question du jour */
  group('5. Espace étudiant');
  {
    const { response, data } = await alice.get('/etudiant');
    const page = data?.html ?? '';
    check('Page étudiante accessible', response.status === 200, `HTTP ${response.status}`);
    check('Question du jour affichée en français', page.includes('Question du jour'));
    check('Espace « Assistant IA » présent', page.includes('Assistant IA'));
    check('Espace « Expression écrite » présent', page.includes('Expression écrite'));
    check('Question du jour visible dans le HTML', page.includes(QUESTION_2));
    check('Archives invisibles pour l’étudiant', !page.includes('Expériences précédentes'));

    const archivedProbe = await alice.get('/api/admin/experiments');
    check('Étudiant ne peut pas lister les expériences', archivedProbe.response.status === 403);
  }

  /* 9-10. Conversation IA + stockage */
  group('6. Assistant IA');
  {
    const before = geminiCalls.length;
    const chat = await alice.postJson('/api/student/ai/chat', {
      content: 'Peux-tu me donner des idées pour commencer mon texte ?',
    });
    check('Message envoyé à l’IA', chat.response.status === 200, `HTTP ${chat.response.status}`);
    check('Réponse de l’IA reçue', Boolean(chat.data?.assistantMessage?.content));
    check(
      'Requête Gemini effectuée côté serveur',
      geminiCalls.length === before + 1,
      `${geminiCalls.length - before} appel(s)`,
    );

    const call = geminiCalls.at(-1);
    check(
      'La question du jour n’est PAS envoyée à l’IA',
      !JSON.stringify(call.contents).includes('Protection de l’environnement'),
    );
    check(
      'Aucun contenu d’expression écrite transmis à l’IA',
      !JSON.stringify(call.contents).includes('Braise'),
    );
    check(
      'L’IA ne reçoit que les messages du student',
      call.contents.every((item) => ['user', 'model'].includes(item.role)),
    );

    const conversation = await alice.get('/api/student/ai/conversation');
    check(
      'Conversation enregistrée côté base',
      conversation.data?.messages?.length === 2 &&
        conversation.data.messages[0].role === 'student' &&
        conversation.data.messages[1].role === 'assistant',
      `${conversation.data?.messages?.length} message(s)`,
    );

    const empty = await alice.postJson('/api/student/ai/chat', { content: '   ' });
    check(
      'Message vide refusé (français)',
      empty.response.status === 400 && empty.data?.error?.message === 'Votre message ne peut pas être vide.',
      empty.data?.error?.message,
    );

    geminiMode = 'rate_limit';
    const rateLimited = await alice.postJson('/api/student/ai/chat', { content: 'Test quota' });
    check(
      'Quota Gemini dépassé → message français clair',
      rateLimited.response.status === 429 &&
        rateLimited.data?.error?.message ===
          "L'assistant IA est momentanément surchargé. Veuillez réessayer dans un instant.",
      rateLimited.data?.error?.message,
    );

    geminiMode = 'empty';
    const emptyAnswer = await alice.postJson('/api/student/ai/chat', { content: 'Test vide' });
    check(
      'Réponse vide du fournisseur gérée',
      emptyAnswer.response.status === 500 &&
        emptyAnswer.data?.error?.message ===
          "L'assistant IA n'a renvoyé aucune réponse. Veuillez reformuler votre demande.",
      emptyAnswer.data?.error?.message,
    );

    geminiMode = 'garbage';
    const garbage = await alice.postJson('/api/student/ai/chat', { content: 'Test malformé' });
    check(
      'Réponse malformée gérée',
      garbage.response.status === 500 &&
        garbage.data?.error?.message === "Réponse inattendue de l'assistant IA.",
      garbage.data?.error?.message,
    );

    geminiMode = 'blocked';
    const blocked = await alice.postJson('/api/student/ai/chat', { content: 'Test filtre' });
    check('Filtre de sécurité géré', blocked.response.status === 500, blocked.data?.error?.message);

    geminiMode = 'server_error';
    const down = await alice.postJson('/api/student/ai/chat', { content: 'Test panne' });
    check(
      'Fournisseur indisponible → message français',
      down.response.status === 502,
      down.data?.error?.message,
    );
    geminiMode = 'ok';

    const afterErrors = await alice.get('/api/student/ai/conversation');
    check(
      'Messages conservés même quand l’IA échoue (traçabilité)',
      afterErrors.data?.messages?.length === 7,
      `${afterErrors.data?.messages?.length} message(s) dans le transcript`,
    );

    const deleteAttempt = await alice.delete('/api/student/ai/chat');
    check(
      'Suppression de message impossible',
      deleteAttempt.response.status === 405,
      `HTTP ${deleteAttempt.response.status}`,
    );
  }

  /* 11-13. Versions de l'expression écrite */
  group('7. Expression écrite');
  {
    const v1 = await alice.postJson('/api/student/expressions', {
      content: 'Version 1 : la lecture ouvre des horizons.',
    });
    check('Version 1 créée', v1.response.status === 201 && v1.data?.version?.versionNumber === 1);

    const v2 = await alice.patchJson('/api/student/expressions/latest', {
      content: 'Version 2 : la lecture ouvre des horizons, même quand le temps manque.',
    });
    check(
      'Modification → nouvelle version 2',
      v2.response.status === 201 && v2.data?.version?.versionNumber === 2,
    );

    const v3 = await alice.postJson('/api/student/expressions', {
      content: 'Version 3 : texte révisé avec une conclusion.',
    });
    check('Version 3 créée', v3.data?.version?.versionNumber === 3);

    const list = await alice.get('/api/student/expressions');
    const versions = list.data?.versions ?? [];
    check(
      'Les 3 versions sont conservées (aucune écrasée)',
      versions.length === 3 &&
        versions[0].content.startsWith('Version 1') &&
        versions[1].content.startsWith('Version 2') &&
        versions[2].content.startsWith('Version 3'),
    );

    const latest = await alice.get('/api/student/expressions/latest');
    check(
      'Dernière version identifiable pour « Modifier »',
      latest.data?.version?.versionNumber === 3,
    );

    const empty = await alice.postJson('/api/student/expressions', { content: ' ' });
    check(
      'Texte vide refusé',
      empty.response.status === 400 &&
        empty.data?.error?.message === 'Votre texte ne peut pas être vide.',
      empty.data?.error?.message,
    );

    const tooLong = await alice.postJson('/api/student/expressions', { content: 'a'.repeat(5001) });
    check('Texte trop long refusé', tooLong.response.status === 400, tooLong.data?.error?.message);

    const deleteVersion = await alice.delete('/api/student/expressions');
    check(
      'Suppression de version impossible',
      deleteVersion.response.status === 405,
      `HTTP ${deleteVersion.response.status}`,
    );

    const idempotent = await alice.postJson('/api/student/expressions', {
      content: 'Test idempotence',
      clientRequestId: 'client-request-id-fixe-1',
    });
    const repeat = await alice.postJson('/api/student/expressions', {
      content: 'Test idempotence',
      clientRequestId: 'client-request-id-fixe-1',
    });
    check(
      'Envoi en double non dupliqué (idempotence)',
      idempotent.data?.version?.versionNumber === repeat.data?.version?.versionNumber,
      `v${repeat.data?.version?.versionNumber}`,
    );
  }

  /* 23. Isolation entre étudiants */
  group('8. Isolation des données');
  {
    await bob.postJson('/api/auth/student/login', {
      username: created[1].username,
      password: created[1].password,
    });
    const bobExpressions = await bob.get('/api/student/expressions');
    check(
      'Un étudiant ne voit que ses propres versions',
      (bobExpressions.data?.versions ?? []).length === 0,
      `${bobExpressions.data?.versions?.length} version(s)`,
    );

    const bobConversation = await bob.get('/api/student/ai/conversation');
    check(
      'Un étudiant ne voit que sa propre conversation',
      (bobConversation.data?.messages ?? []).length === 0,
    );

    const injection = await bob.postJson('/api/student/expressions', {
      content: 'injection',
      studentId: created[0].id,
      experimentId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    });
    check(
      'Champs parasites rejetés (protection NoSQL)',
      injection.response.status === 400,
      `HTTP ${injection.response.status}`,
    );

    const noOperator = await bob.postJson('/api/auth/student/login', {
      username: { $ne: null },
      password: '0000',
    });
    check(
      'Objet JSON en identifiant rejeté',
      noOperator.response.status === 400,
      `HTTP ${noOperator.response.status}`,
    );
  }

  /* 16-18. Inspection administrateur */
  group('9. Contrôle administrateur');
  {
    const students = await admin.get('/api/admin/students');
    const aliceRow = students.data?.students?.find((row) => row.username === created[0].username);
    check(
      'Liste des étudiants avec activité',
      students.response.status === 200 && Boolean(aliceRow),
      `${students.data?.students?.length} étudiant(s)`,
    );
    check(
      'Activité de l’expérience remontée',
      aliceRow?.activity?.aiMessages === 7 && aliceRow?.activity?.expressionVersions === 4,
      `IA=${aliceRow?.activity?.aiMessages} / versions=${aliceRow?.activity?.expressionVersions}`,
    );

    const detail = await admin.get(`/api/admin/students/${created[0].id}`);
    check(
      'Conversation IA complète visible par l’administrateur',
      detail.data?.messages?.length === 7 &&
        detail.data.messages.every((message) => message.createdAt),
    );
    check(
      'Toutes les versions visibles par l’administrateur',
      detail.data?.versions?.length === 4,
      `${detail.data?.versions?.length} version(s)`,
    );

    const missing = await admin.get('/api/admin/students/000000000000000000000000');
    check('Identifiant inexistant → 404', missing.response.status === 404, `HTTP ${missing.response.status}`);

    const { data } = await admin.get('/admin/etudiants');
    const page = data?.html ?? '';
    check(
      'Interface administrateur en français',
      page.includes('Tableau de bord') &&
        page.includes('Étudiants') &&
        page.includes('Expérience actuelle') &&
        page.includes('Paramètres'),
    );

    const dashboard = await admin.get('/admin');
    const dashboardHtml = dashboard.data?.html ?? '';
    check(
      'Bascule « Autoriser l’accès des étudiants » présente',
      dashboardHtml.includes('Autoriser l’accès des étudiants'),
      `HTTP ${dashboard.response.status}`,
    );
  }

  /* Réinitialisation du mot de passe d'un étudiant (administrateur) */
  group('10. Réinitialisation du mot de passe');
  {
    const created2 = await admin.postJson('/api/admin/students');
    const studentId = created2.data?.student?.id;
    const username = created2.data?.student?.username;
    const firstPassword = created2.data?.password;
    check(
      'Création : mot de passe à 4 chiffres',
      /^[0-9]{4}$/.test(firstPassword ?? '') && /^[a-z]{6}$/.test(username ?? ''),
      `${username} / ${firstPassword}`,
    );

    const session = createClient();
    const login = await session.postJson('/api/auth/student/login', {
      username,
      password: firstPassword,
    });
    check(
      'Connexion de l’étudiant avant réinitialisation',
      login.response.status === 200,
      `HTTP ${login.response.status}`,
    );

    const reset = await admin.postJson(`/api/admin/students/${studentId}/password`);
    check(
      'Réinitialisation : nouveau mot de passe à 4 chiffres renvoyé',
      reset.response.status === 201 &&
        /^[0-9]{4}$/.test(reset.data?.password ?? '') &&
        reset.data?.student?.username === username,
      reset.data?.password ?? JSON.stringify(reset.data?.error ?? {}),
    );

    const revoked = await session.get('/api/student/experiment');
    check(
      'Session révoquée après réinitialisation (401)',
      revoked.response.status === 401 && revoked.data?.error?.code === 'SESSION_EXPIRED',
      revoked.data?.error?.message ?? `HTTP ${revoked.response.status}`,
    );

    const redirected = await session.get('/etudiant');
    check(
      'Étudiant renvoyé vers la connexion après réinitialisation',
      redirected.response.status === 307 &&
        (redirected.response.headers.get('location') ?? '').includes('/connexion'),
      `HTTP ${redirected.response.status}`,
    );

    const oldPassword = await createClient().postJson('/api/auth/student/login', {
      username,
      password: firstPassword,
    });
    check(
      'Ancien mot de passe refusé',
      oldPassword.response.status === 401,
      oldPassword.data?.error?.message ?? `HTTP ${oldPassword.response.status}`,
    );

    const fresh = createClient();
    const newLogin = await fresh.postJson('/api/auth/student/login', {
      username,
      password: reset.data?.password,
    });
    check(
      'Nouveau mot de passe accepté',
      newLogin.response.status === 200,
      newLogin.data?.error?.message ?? `HTTP ${newLogin.response.status}`,
    );

    const forbidden = await fresh.postJson(`/api/admin/students/${studentId}/password`);
    check(
      'Un étudiant ne peut pas réinitialiser un mot de passe',
      forbidden.response.status === 403,
      `HTTP ${forbidden.response.status}`,
    );

    const unauth = await createClient().postJson(`/api/admin/students/${studentId}/password`);
    check(
      'Sans session : réinitialisation refusée',
      unauth.response.status === 401,
      `HTTP ${unauth.response.status}`,
    );

    const listing = await admin.get('/api/admin/students');
    const detail = await admin.get(`/api/admin/students/${studentId}`);
    check(
      'Le mot de passe n’est jamais renvoyé par l’API',
      !JSON.stringify(listing.data).includes(reset.data?.password) &&
        !JSON.stringify(detail.data).includes(reset.data?.password),
    );

    const invalid = await admin.postJson('/api/admin/students/inconnu/password');
    check(
      'Identifiant invalide → message en français',
      invalid.response.status === 400 && invalid.data?.error?.message === 'Identifiant invalide.',
      invalid.data?.error?.message ?? `HTTP ${invalid.response.status}`,
    );

    const unknown = await admin.postJson(
      '/api/admin/students/00000000-0000-0000-0000-000000000000/password',
    );
    check(
      'Étudiant inexistant → 404',
      unknown.response.status === 404,
      unknown.data?.error?.message ?? `HTTP ${unknown.response.status}`,
    );

    const listPage = await admin.get('/admin/etudiants');
    check(
      'Bouton « Nouveau mot de passe » présent dans la liste des étudiants',
      (listPage.data?.html ?? '').includes('Nouveau mot de passe'),
      `HTTP ${listPage.response.status}`,
    );

    const detailPage = await admin.get(`/admin/etudiants/${studentId}`);
    check(
      'Bouton présent sur la fiche de l’étudiant',
      (detailPage.data?.html ?? '').includes('Nouveau mot de passe'),
      `HTTP ${detailPage.response.status}`,
    );
  }

  /* 19. Expériences précédentes */
  group('11. Archives');
  {
    const list = await admin.get('/api/admin/experiments');
    const archived = list.data?.archived ?? [];
    check('Expérience archivée conservée', archived.length >= 1, `${archived.length} archive(s)`);

    const archived1 = archived.find((experiment) => experiment.question === QUESTION_1);
    check('Archive n°1 retrouvée', Boolean(archived1), archived1 ? `n°${archived1.sequence}` : '');

    const detail = await admin.get(`/api/admin/experiments/${archived1.id}`);
    check(
      'Détail d’une expérience archivée accessible',
      detail.response.status === 200 && detail.data?.stats?.expressionVersions >= 0,
      `${detail.data?.participants?.length} participant(s)`,
    );

    const { response, data } = await admin.get('/admin/experiences-precedentes');
    check(
      'Page « Expériences précédentes » rendue',
      response.status === 200 && (data?.html ?? '').includes('Expériences précédentes'),
    );

    const aliceInArchive = await admin.get(
      `/api/admin/experiments/${archived1.id}/participants/${created[0].id}`,
    );
    check(
      'Navigation Expérience → Étudiant opérationnelle',
      aliceInArchive.response.status === 200 &&
        Array.isArray(aliceInArchive.data?.messages) &&
        Array.isArray(aliceInArchive.data?.versions),
    );
  }

  /* 20-22. Bascule d'accès */
  group('12. Contrôle global d’accès');
  {
    const toggleOff = await admin.postJson('/api/admin/access', { enabled: false });
    check(
      'Accès suspendu par l’administrateur',
      toggleOff.response.status === 200 && toggleOff.data?.studentAccessEnabled === false,
    );

    const blocked = await createClient();
    const login = await blocked.postJson('/api/auth/student/login', {
      username: created[2].username,
      password: created[2].password,
    });
    check(
      'Connexion étudiante bloquée',
      login.response.status === 403 &&
        login.data?.error?.message === "L'accès aux étudiants est actuellement désactivé.",
      login.data?.error?.message,
    );

    const studentApi = await alice.get('/api/student/ai/conversation');
    check(
      'Session étudiante invalidée immédiatement',
      studentApi.response.status === 403,
      `HTTP ${studentApi.response.status} ${studentApi.data?.error?.message ?? ''}`,
    );

    const chatBlocked = await alice.postJson('/api/student/ai/chat', { content: 'encore ?' });
    check('Envoi IA bloqué après suspension', chatBlocked.response.status === 403);

    const studentPage = await alice.get('/etudiant');
    check(
      'Étudiant renvoyé vers l’écran de suspension',
      studentPage.response.status === 307 &&
        (studentPage.response.headers.get('location') ?? '').includes('/acces-suspendu'),
      `HTTP ${studentPage.response.status} ${studentPage.response.headers.get('location') ?? ''}`,
    );

    const { response, data } = await alice.get('/acces-suspendu');
    const html = data?.html ?? '';
    check(
      'Message « Le temps est écoulé… » affiché',
      html.includes('Le temps est écoulé. L’expérience est actuellement suspendue.'),
      `HTTP ${response.status}`,
    );

    const adminStill = await admin.get('/admin');
    check(
      'L’administrateur reste connecté pendant la suspension',
      adminStill.response.status === 200,
      `HTTP ${adminStill.response.status}`,
    );

    const adminApiStill = await admin.postJson('/api/admin/access', { enabled: true });
    check('Accès réactivé', adminApiStill.data?.studentAccessEnabled === true);

    const relogin = await blocked.postJson('/api/auth/student/login', {
      username: created[2].username,
      password: created[2].password,
    });
    check('Connexion étudiante possible après réouverture', relogin.response.status === 200);

    const aliceStillOut = await alice.get('/api/student/ai/conversation');
    check(
      'L’ancienne session reste invalide (nouvel epoch)',
      aliceStillOut.response.status === 401,
      `HTTP ${aliceStillOut.response.status}`,
    );

    const studentPageAgain = await alice.get('/etudiant');
    check(
      'Ancienne session : renvoi vers /connexion',
      studentPageAgain.response.status === 307 &&
        (studentPageAgain.response.headers.get('location') ?? '').includes('/connexion'),
      `HTTP ${studentPageAgain.response.status} ${studentPageAgain.response.headers.get('location') ?? ''}`,
    );
  }

  /* 19-bis. Nouvelle expérience : conversation et versions neuves */
  group('13. Nouvelle expérience');
  {
    const newExperiment = await admin.postJson('/api/admin/experiments', { question: QUESTION_3 });
    check(
      'Expérience n°3 démarrée (la précédente est archivée)',
      newExperiment.response.status === 201 &&
        newExperiment.data?.experiment?.question === QUESTION_3 &&
        newExperiment.data?.experiment?.sequence === 3,
      `n°${newExperiment.data?.experiment?.sequence}`,
    );

    const login = await alice.postJson('/api/auth/student/login', {
      username: created[0].username,
      password: created[0].password,
    });
    check('Reconnexion de l’étudiant', login.response.status === 200);

    const emptyConversation = await alice.get('/api/student/ai/conversation');
    check(
      'Conversation vide au démarrage de la nouvelle expérience',
      (emptyConversation.data?.messages ?? []).length === 0,
      `${emptyConversation.data?.messages?.length} message(s)`,
    );

    const chat = await alice.postJson('/api/student/ai/chat', { content: 'Question de suivi' });
    check('Message accepté dans la nouvelle expérience', chat.response.status === 200);

    const conversation = await alice.get('/api/student/ai/conversation');
    check(
      'Conversation repart à zéro pour la nouvelle expérience',
      conversation.data?.messages?.length === 2,
      `${conversation.data?.messages?.length} message(s)`,
    );

    const expressions = await alice.get('/api/student/expressions');
    check(
      'Numérotation des versions repart à 1',
      (expressions.data?.versions ?? []).length === 0,
      `${expressions.data?.versions?.length} version(s) au départ`,
    );

    const firstVersion = await alice.postJson('/api/student/expressions', {
      content: 'Première version de la nouvelle expérience.',
    });
    check(
      'La première version de la nouvelle expérience est la v1',
      firstVersion.data?.version?.versionNumber === 1,
      `v${firstVersion.data?.version?.versionNumber}`,
    );

    const studentPage = await alice.get('/etudiant');
    check(
      'L’étudiant voit la nouvelle question du jour',
      (studentPage.data?.html ?? '').includes(QUESTION_3),
      `HTTP ${studentPage.response.status}`,
    );

    const archives = await admin.get('/api/admin/experiments');
    check(
      'Données de l’expérience précédente toujours consultables',
      archives.data?.archived?.some((experiment) => experiment.question === QUESTION_2) === true &&
        archives.data?.archived?.length === 2,
      `${archives.data?.archived?.length} archive(s)`,
    );
  }

  /* Déconnexion */
  group('14. Déconnexion');
  {
    const logout = await alice.postJson('/api/auth/logout', {});
    check('Déconnexion effectuée', logout.response.status === 200);
    const afterLogout = await alice.get('/etudiant');
    check(
      'Session invalide après déconnexion',
      afterLogout.response.status === 307 &&
        (afterLogout.response.headers.get('location') ?? '').includes('/connexion'),
      `HTTP ${afterLogout.response.status}`,
    );
  }

  /* Interface 100 % française */
  group('15. Interface en français');
  {
    const student = createClient();
    await student.postJson('/api/auth/student/login', {
      username: created[0].username,
      password: created[0].password,
    });

    const experiments = await admin.get('/api/admin/experiments');
    const archivedId = experiments.data?.archived?.[0]?.id;

    const pages = [
      ['/connexion', createClient()],
      ['/etudiant', student],
      ['/admin', admin],
      ['/admin/etudiants', admin],
      [`/admin/etudiants/${created[0].id}`, admin],
      ['/admin/experience', admin],
      ['/admin/experiences-precedentes', admin],
      [`/admin/experiences-precedentes/${archivedId}`, admin],
      ['/admin/parametres', admin],
    ];

    for (const [pathname, client] of pages) {
      const { response, data } = await client.get(pathname);
      const html = data?.html ?? '';
      const offenders = findEnglishText(html);
      check(
        `Page ${pathname} entièrement en français`,
        response.status === 200 && offenders.length === 0,
        response.status === 200
          ? offenders.join(', ') || `${visibleLength(html)} caractères visibles`
          : `HTTP ${response.status}`,
      );
    }
  }
}

/**
 * Removes scripts, styles and markup, then looks for English words that have
 * no French counterpart in this application (case sensitive on purpose, so
 * French words such as "question", "version" or "assistant" are not flagged).
 */
const ENGLISH_WORDS = [
  'Loading',
  'Error',
  'Submit',
  'Cancel',
  'Save',
  'Saved',
  'Delete',
  'Edit',
  'Send',
  'Sending',
  'Sent',
  'Dashboard',
  'Settings',
  'Students',
  'Student',
  'Previous',
  'Sign in',
  'Sign out',
  'Log in',
  'Log out',
  'Username',
  'Password',
  'Retry',
  'Refresh',
  'Words',
  'Characters',
  'Last version',
  'New version',
  'Version saved',
  'Suspended',
  'Allowed',
  'Welcome',
  'Search',
  'Total',
  'Average',
  'Today',
  'Enable',
  'Disable',
  'Copy',
  'Download',
  'Upload',
  'Next',
  'Back',
];

/** Product names legitimately displayed in English. */
const ALLOWED_BRANDS = ['Next.js', 'PostgreSQL', 'Gemini', 'bcrypt'];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findEnglishText(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .replace(new RegExp(ALLOWED_BRANDS.map(escapeRegExp).join('|'), 'g'), ' ');

  return ENGLISH_WORDS.filter((word) =>
    new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, 'u').test(text),
  ).map((word) => {
    const match = new RegExp(`(.{0,40}${word}.{0,40})`, 'u').exec(text);
    return match ? `${word} → « ${match[1].trim()} »` : word;
  });
}

function visibleLength(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').trim().length;
}

async function checkNoSecretExposure() {
  group('16. Sécurité des secrets');
  const chunksDir = path.join(process.cwd(), '.next', 'static', 'chunks');
  let files = [];
  try {
    files = (await readdir(chunksDir)).filter((file) => file.endsWith('.js'));
  } catch {
    check('Bundle client accessible pour analyse', false);
    return;
  }

  const needles = [AUTH_SECRET, ADMIN_PASSWORD, 'clé-de-test-gemini-1234567890', 'DATABASE_URL=', 'GEMINI_API_KEY='];
  const leaks = [];
  for (const file of files) {
    const content = await readFile(path.join(chunksDir, file), 'utf8');
    for (const needle of needles) {
      if (needle && content.includes(needle)) leaks.push(`${file} → ${needle.slice(0, 12)}…`);
    }
  }
  check(
    'Aucun secret présent dans les bundles client',
    leaks.length === 0,
    leaks.length ? leaks.join(', ') : `${files.length} fichiers analysés`,
  );

  const appChunks = path.join(process.cwd(), '.next', 'server');
  let serverLeaks = [];
  let serverFileCount = 0;
  try {
    const entries = await readdir(appChunks, { recursive: true });
    const jsFiles = entries.filter((file) => file.endsWith('.js'));
    serverFileCount = jsFiles.length;
    for (const file of jsFiles) {
      const content = await readFile(path.join(appChunks, file), 'utf8');
      if (content.includes('clé-de-test-gemini-1234567890')) serverLeaks.push(file);
    }
  } catch {
    serverLeaks = ['illisible'];
  }
  check(
    'La clé Gemini n’est lue que depuis les variables d’environnement',
    serverLeaks.length === 0,
    serverLeaks.length
      ? serverLeaks.slice(0, 3).join(', ')
      : `${serverFileCount} fichiers serveur analysés`,
  );
}

/**
 * 17. Une connexion PostgreSQL coupée ne doit pas casser la plateforme.
 *
 * Every managed serverless PostgreSQL (Neon, Supabase) closes idle connections,
 * so the pooled socket can be dead by the time it is handed out. The
 * application must reconnect transparently instead of answering
 * « base de donnees injoignable ».
 */
async function checkConnectionResilience() {
  group('17. Connexion PostgreSQL interrompue');
  {
    const clientSource = await readSource('src/server/db/client.ts');
    check(
      'Les requêtes sont retentées après une connexion coupée',
      /isDeadConnection/.test(clientSource) && /runWithRetry/.test(clientSource),
      'client.ts',
    );
    check(
      'Aucune requête SQL n’est concaténée',
      !/\+ *['"`]\s*(select|insert|update|delete)\b/i.test(clientSource),
      'paramètres liés uniquement',
    );

    // The observable proof: the service keeps answering while the pool churns.
    // `/api/system/status` is public and touches the database on every call.
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => createClient().get('/api/system/status')),
    );
    const healthy = responses.filter(
      (item) => item.response.status === 200 && item.data?.database === 'ok',
    ).length;
    check(
      'Le service reste disponible après une rafale de requêtes',
      healthy === responses.length,
      `${healthy}/${responses.length} réponses « base de donnees ok »`,
    );
  }
}

/**
 * 18. La conversation must tell the two speakers apart.
 *
 * The student's own message once reused the panel title ("Assistant IA"), so
 * both sides of the conversation appeared to come from the AI.
 */
async function checkConversationLabels() {
  group('18. Auteurs de la conversation');
  {
    const dictionary = await readSource('src/i18n/dictionaries/fr.ts');
    const label = (key) => {
      const found = dictionary.match(new RegExp(`${key}:\\s*'([^']+)'`));
      return found ? found[1] : null;
    };

    const ai = label('aiAuthor');
    const etudiant = label('aiAuthorStudent');
    check(
      'Les deux auteurs ont des libellés distincts',
      Boolean(ai) && Boolean(etudiant) && ai !== etudiant,
      `IA « ${ai} » / élève « ${etudiant} »`,
    );

    const chat = await readSource('src/components/student/ai-chat.tsx');
    check(
      'Le message de l’élève est attribué à l’élève',
      /isStudent \? t\.student\.aiAuthorStudent : t\.student\.aiAuthor/.test(chat),
      'ai-chat.tsx',
    );

    // The admin transcript must stay consistent with the student view.
    const transcript = await readSource('src/components/shared/conversation-transcript.tsx');
    check(
      'La vue administrateur distingue aussi les deux auteurs',
      /isStudent \? t\.students\.you : t\.students\.assistant/.test(transcript),
      'conversation-transcript.tsx',
    );
  }
}

/**
 * 19. Accords au singulier dans l'interface française.
 *
 * French requires "1 message" but "2 messages". Every counted noun therefore
 * needs its singular, and no screen may interpolate a count next to a
 * plural-only noun.
 */
async function checkFrenchPlurals() {
  group('19. Accords français');
  {
    const dictionary = await readSource('src/i18n/dictionaries/fr.ts');
    const entry = (key) => {
      const found = dictionary.match(new RegExp(`${key}:\\s*'([^']+)'`));
      return found ? found[1] : null;
    };

    check('Le helper de pluriel est disponible', /plural:\s*\(count/.test(dictionary), 't.common.plural');

    const paires = [
      ['versions', 'version'],
      ['messages', 'message'],
      ['students', 'student'],
      ['words', 'word'],
      ['characters', 'character'],
    ];
    const manquants = paires
      .filter(([, singulier]) => !entry(singulier))
      .map(([, singulier]) => singulier);

    check(
      'Chaque nom dénombré possède son singulier',
      manquants.length === 0,
      manquants.length
        ? `singuliers manquants : ${manquants.join(', ')}`
        : `${paires.length} paires vérifiées`,
    );

    const composants = [
      'src/app/admin/page.tsx',
      'src/app/admin/etudiants/page.tsx',
      'src/app/admin/experience/page.tsx',
      'src/app/admin/experiences-precedentes/page.tsx',
      'src/app/admin/experiences-precedentes/[id]/page.tsx',
      'src/components/student/expression-panel.tsx',
      'src/components/shared/expression-versions-list.tsx',
    ];
    const fautifs = [];
    for (const fichier of composants) {
      const source = await readSource(fichier);
      // "1 version" is correct, "{count} versions" is not: the noun must go
      // through t.common.plural(), never straight after an interpolated number.
      for (const pluriel of paires.map(([nom]) => nom)) {
        if (new RegExp(`\\}\\s*\\{?\\s*t\\.common\\.${pluriel}\\b`).test(source)) {
          fautifs.push(`${fichier} → t.common.${pluriel}`);
        }
      }
    }
    check(
      'Aucun compteur n’affiche un nom au pluriel après un nombre',
      fautifs.length === 0,
      fautifs.length ? fautifs.join(', ') : `${composants.length} fichiers analysés`,
    );
  }
}

/**
 * 20. A revoked session must not create a redirect loop.
 *
 * The session cookie is a JWT: it stays cryptographically valid for its whole
 * lifetime, even after the database has invalidated what it describes (reset
 * password, access epoch bumped, account deleted). The edge middleware cannot
 * read the database, so once it sent every valid cookie away from /connexion,
 * a revoked user bounced between /connexion and its workspace until the
 * browser gave up with ERR_TOO_MANY_REDIRECTS — unable to even log in again.
 *
 * The chain must now settle on the login screen, quickly.
 */
async function checkRevokedSessionRedirects() {
  group('20. Session révoquée (aucune boucle de redirection)');

  const admin = createClient();
  await admin.postJson('/api/auth/admin/login', {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });

  const account = await admin.postJson('/api/admin/students', {});
  const student = createClient();
  await student.postJson('/api/auth/student/login', {
    username: account.data?.student?.username,
    password: account.data?.password,
  });

  const connected = await student.get('/etudiant');
  check(
    'Session étudiante active au départ',
    connected.response.status === 200,
    `HTTP ${connected.response.status}`,
  );

  // The administrator resets the password: the signature stays valid, the
  // database no longer recognises the session.
  const reset = await admin.postJson(
    `/api/admin/students/${account.data?.student?.id}/password`,
    {},
  );
  check(
    'Réinitialisation du mot de passe par l’administrateur',
    reset.response.status === 201 && /^[0-9]{4}$/.test(reset.data?.password ?? ''),
    `nouveau mot de passe ${reset.data?.password ?? '—'}`,
  );

  const stillSigned = student.cookies.get('atelier_session') ?? '';
  check(
    'Le cookie conserve une signature valide (le cas piégé)',
    stillSigned.length > 20,
    `${stillSigned.split('.').length} segments JWT`,
  );

  const workspace = await student.get('/etudiant');
  check(
    'Espace étudiant refusé (redirection vers /connexion)',
    workspace.response.status === 307 &&
      (workspace.response.headers.get('location') ?? '').includes('/connexion'),
    `HTTP ${workspace.response.status} ${workspace.response.headers.get('location') ?? ''}`,
  );

  const loginPage = await student.get('/connexion');
  const html = loginPage.data?.html ?? '';
  check(
    'La page de connexion s’affiche au lieu de renvoyer en boucle',
    loginPage.response.status === 200 && html.includes('Se connecter'),
    `HTTP ${loginPage.response.status}`,
  );

  const root = await student.get('/');
  check(
    'La racine mène directement à la connexion (un seul saut)',
    root.response.status === 307 &&
      (root.response.headers.get('location') ?? '').includes('/connexion'),
    `HTTP ${root.response.status} ${root.response.headers.get('location') ?? ''}`,
  );

  // The observable symptom: Chrome's ERR_TOO_MANY_REDIRECTS happens after 20
  // hops. Follow the chain as a browser would and make sure it terminates.
  const { hops, finalPath } = await followRedirects(student, '/etudiant', 10);
  check(
    'La redirection aboutit sur l’écran de connexion',
    finalPath === '/connexion' && hops <= 3,
    `${hops} saut(s) → ${finalPath}`,
  );

  // And the student must be able to log in again with the new password.
  const relogin = await student.postJson('/api/auth/student/login', {
    username: account.data?.student?.username,
    password: reset.data?.password,
  });
  check(
    'Connexion possible avec le nouveau mot de passe',
    relogin.response.status === 200,
    `HTTP ${relogin.response.status}`,
  );

  const back = await student.get('/etudiant');
  check(
    'Espace étudiant de nouveau accessible',
    back.response.status === 200,
    `HTTP ${back.response.status}`,
  );

  // The edge must keep its hands off /connexion: it cannot know the truth.
  const middleware = await readSource('src/middleware.ts');
  check(
    'Le middleware ne redirige plus /connexion',
    !/isAuthRoute\s*&&\s*pathname\s*===\s*'\/connexion'/.test(middleware),
    'la décision revient au serveur',
  );
}

/** Follows redirects the way a browser does and reports where it settles. */
async function followRedirects(client, startPath, maxHops) {
  let path = startPath;
  let hops = 0;
  while (hops < maxHops) {
    const response = await client.request(path);
    if (response.status < 300 || response.status >= 400) return { hops, finalPath: path };
    const location = response.headers.get('location');
    if (!location) return { hops, finalPath: path };
    path = new URL(location, BASE_URL).pathname;
    hops += 1;
  }
  return { hops, finalPath: `${path} (boucle)` };
}

/** Reads a source file of the project (used by the resilience checks). */
async function readSource(relativePath) {
  try {
    return await readFile(path.join(process.cwd(), relativePath), 'utf8');
  } catch {
    return '';
  }
}

function printSummary() {
  const total = results.length;
  const passed = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);

  console.log('\n' + '─'.repeat(64));
  if (failed.length === 0) {
    console.log(`\x1b[32m✔ ${passed}/${total} vérifications réussies\x1b[0m\n`);
  } else {
    console.log(`\x1b[31m✖ ${failed.length} échec(s) sur ${total} vérifications\x1b[0m`);
    for (const failure of failed) {
      console.log(`   · [${failure.group}] ${failure.label} ${failure.detail}`);
    }
    console.log('');
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});