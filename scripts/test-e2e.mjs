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
import { inflateSync } from 'node:zlib';

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
const QUESTION_4 = 'Expliquez pourquoi la lecture compte dans la vie quotidienne.';
const QUESTION_5 = 'Racontez une rencontre qui a changé votre façon de voir les choses.';
const QUESTION_6 = 'Décrivez un souvenir marquant de votre année dernière.';

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
      // Accept both the OpenAI Chat Completions route and the legacy Gemini one.
      const isOpenAI = url.pathname.includes('/chat/completions');
      const isGemini = url.pathname.includes(':generateContent');
      if (!isOpenAI && !isGemini) {
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
      const parsedMessages = isOpenAI ? (parsed.messages ?? []) : [];
      const geminiContents = !isOpenAI ? (parsed.contents ?? []) : [];

      geminiCalls.push({
        url: url.pathname,
        hasKey: Boolean(url.searchParams.get('key')),
        model: isOpenAI ? parsed.model : url.pathname.split('/models/')[1]?.split(':')[0],
        contents: geminiContents,
        systemInstruction: parsed.systemInstruction ?? parsedMessages[0]?.content ?? null,
        messages: parsedMessages,
      });

      // Requests from the OpenAI provider are chat/completions with a message list.
      const lastUserText = isOpenAI
        ? [...parsedMessages].reverse().find((m) => m.role === 'user')?.content
        : [...geminiContents].reverse().find((item) => item.role === 'user')?.parts?.[0]?.text;

      const send = (status, payload) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      if (geminiMode === 'rate_limit') return send(429, { error: { message: 'quota' } });
      if (geminiMode === 'server_error') return send(503, { error: { message: 'oops' } });
      if (geminiMode === 'garbage') return send(200, { unexpected: true });

      if (isOpenAI) {
        if (geminiMode === 'empty') {
          return send(200, { choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }] });
        }
        if (geminiMode === 'blocked') {
          return send(200, { choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'content_filter' }] });
        }
        return send(200, {
          choices: [
            {
              message: { role: 'assistant', content: `Réponse de test à : « ${lastUserText ?? ''} »` },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        });
      }

      if (geminiMode === 'empty') return send(200, { candidates: [{ content: { parts: [] } }] });
      if (geminiMode === 'blocked') {
        return send(200, { candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'SAFETY' }] });
      }

      return send(200, {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: `Réponse de test à : « ${lastUserText ?? ''} »` }],
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
      OPENAI_API_KEY: 'clé-de-test-openai-1234567890',
      OPENAI_BASE_URL: `http://127.0.0.1:${GEMINI_PORT}/v1`,
      OPENAI_MODEL: 'gpt-4o-mini',
      AI_PROVIDER: 'openai',
      SESSION_MAX_AGE: '3600',
      // The whole suite shares one IP, so it would otherwise exhaust the
      // production brake (12/minute) long before the last group runs.
      LOGIN_ATTEMPTS_PER_MINUTE: '500',
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
    await checkSingleScreenWorkspace();
    await checkExperimentStartStop();
    await checkStudentGroups();
    await checkPdfExport();
    await checkWipeData();
    await checkLoginRateLimit();
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
      const { response, data } = await admin.postJson('/api/admin/students', {
        group: 'AI_LIBRE',
        quantity: 1,
      });
      // One request creates `quantity` accounts; here always a single one.
      const account = data?.accounts?.[0] ?? {};
      const username = account.username ?? '';
      const password = account.password ?? '';
      created.push({ username, password, id: account.id, group: account.group });
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

    const forbidden = await alice.postJson('/api/admin/students', {
      group: 'AI_LIBRE',
      quantity: 1,
    });
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
      'Requête IA effectuée côté serveur',
      geminiCalls.length === before + 1,
      `${geminiCalls.length - before} appel(s)`,
    );

    const call = geminiCalls.at(-1);
    const callTranscript = JSON.stringify(call.contents) + JSON.stringify(call.messages ?? []);
    const sentMessages = call.messages?.length ? call.messages : call.contents;
    check(
      'La question du jour n’est PAS envoyée à l’IA',
      !callTranscript.includes('Protection de l’environnement'),
    );
    check(
      'Aucun contenu d’expression écrite transmis à l’IA',
      !callTranscript.includes('Braise'),
    );
    check(
      'L’IA ne reçoit que les messages du student',
      sentMessages.every((item) => ['user', 'assistant', 'model', 'system'].includes(item.role)) &&
        sentMessages.some((item) => item.role === 'user'),
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
      'Quota du fournisseur IA dépassé → message français clair',
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
    const created2 = await admin.postJson('/api/admin/students', {
      group: 'AI_LIBRE',
      quantity: 1,
    });
    const account2 = created2.data?.accounts?.[0] ?? {};
    const studentId = account2.id;
    const username = account2.username;
    const firstPassword = account2.password;
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

  const needles = [AUTH_SECRET, ADMIN_PASSWORD, 'clé-de-test-openai-1234567890', 'DATABASE_URL=', 'OPENAI_API_KEY='];
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

  const account = (await admin.postJson('/api/admin/students', {
    group: 'AI_LIBRE',
    quantity: 1,
  })).data?.accounts?.[0] ?? {};
  const student = createClient();
  await student.postJson('/api/auth/student/login', {
    username: account.username,
    password: account.password,
  });

  const connected = await student.get('/etudiant');
  check(
    'Session étudiante active au départ',
    connected.response.status === 200,
    `HTTP ${connected.response.status}`,
  );

  // The administrator resets the password: the signature stays valid, the
  // database no longer recognises the session.
  const reset = await admin.postJson(`/api/admin/students/${account.id}/password`, {});
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
    username: account.username,
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

/**
 * 21. The two areas live on one single screen.
 *
 * The Assistant IA and the Expression écrite used to sit behind two tabs, so a
 * student had to switch back and forth to reason with the AI and then write.
 * Both must now be delivered by the same HTML document, without any tab switcher.
 */
async function checkSingleScreenWorkspace() {
  group('21. Espace unique (IA + Expression sur la même page)');

  const admin = createClient();
  await admin.postJson('/api/auth/admin/login', {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });
  await admin.postJson('/api/admin/experiments', { question: QUESTION_3 });

  const account = (await admin.postJson('/api/admin/students', {
    group: 'AI_LIBRE',
    quantity: 1,
  })).data?.accounts?.[0] ?? {};
  const student = createClient();
  await student.postJson('/api/auth/student/login', {
    username: account.username,
    password: account.password,
  });

  const { response, data } = await student.get('/etudiant');
  const page = data?.html ?? '';

  check(
    'Espace étudiant servi en une seule page',
    response.status === 200,
    `HTTP ${response.status}`,
  );

  const zoneIA = page.indexOf('aria-label="Assistant IA"');
  const zoneExpression = page.indexOf('aria-label="Expression écrite');
  check(
    'Les deux espaces sont livrés dans le même document',
    zoneIA !== -1 && zoneExpression !== -1 && zoneIA < zoneExpression,
    `IA à ${zoneIA}, Expression à ${zoneExpression}`,
  );

  // Both inputs must be present at the same time: that is the whole point.
  check(
    'Le champ de discussion et l’éditeur sont affichés ensemble',
    page.includes('name="message"') && page.includes('name="expression"'),
    'deux zones de saisie visibles',
  );

  check(
    'Aucun sélecteur d’onglets ne subsiste',
    !page.includes('role="tablist"') && !page.includes('Espaces de travail'),
    'plus de navigation entre les espaces',
  );

  check(
    'Les deux boutons d’envoi sont disponibles',
    (page.match(/>\s*Envoyer\s*</g) ?? []).length >= 2,
    'un envoi par espace',
  );

  // The privacy guarantee is explicit on screen and structurally enforced.
  check(
    'L’indépendance des deux espaces reste annoncée',
    page.includes('n’est jamais transmise à l’Assistant IA'),
  );

  const source = await readSource('src/components/student/student-workspace.tsx');
  check(
    'Les deux espaces sont côte à côte sur grand écran',
    /lg:grid-cols-2/.test(source),
    'grid responsive, empilés sur mobile',
  );
  check(
    'Aucun état d’onglet dans l’espace de travail',
    !/WorkspaceTab|setTab|role="tab"/.test(source),
    'student-workspace.tsx',
  );
}

/**
 * 22. The administrator starts and stops the experiment with one button.
 *
 * Stopping must archive without ever deleting: the whole conversation and every
 * written version stay readable in « Expériences précédentes », while students
 * are locked out of both the AI and the editor.
 */
async function checkExperimentStartStop() {
  group('22. Démarrage et arrêt de l’expérience');

  const admin = createClient();
  await admin.postJson('/api/auth/admin/login', {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });

  const account = await admin.postJson('/api/admin/students', {
    group: 'AI_LIBRE',
    quantity: 1,
  });
  const created = account.data?.accounts?.[0] ?? {};
  check(
    'Compte étudiant créé pour la vérification',
    account.response.status === 201 && Boolean(created.username),
    `${created.username ?? '—'} / ${created.password ?? '—'}`,
  );

  const student = createClient();
  const studentLogin = await student.postJson('/api/auth/student/login', {
    username: created.username,
    password: created.password,
  });
  check(
    'Connexion étudiante réussie',
    studentLogin.response.status === 200,
    `HTTP ${studentLogin.response.status} ${studentLogin.data?.error?.message ?? ''}`,
  );

  const started = await admin.postJson('/api/admin/experiments', { question: QUESTION_1 });
  const experimentId = started.data?.experiment?.id;
  check(
    'Expérience démarrée',
    started.response.status === 201 && started.data?.experiment?.status === 'ACTIVE',
    `n°${started.data?.experiment?.sequence}`,
  );

  // The student works for a moment, so we can prove nothing is lost on stop.
  const chat = await student.postJson('/api/student/ai/chat', { content: 'Une question avant l’arrêt' });
  check('Message envoyé avant l’arrêt', chat.response.status === 200);

  const expression = await student.postJson('/api/student/expressions', {
    content: 'Une version écrite avant l’arrêt de l’expérience.',
  });
  check('Version déposée avant l’arrêt', expression.response.status === 201);

  const beforeStop = await student.get('/etudiant');
  check(
    'Espace étudiant ouvert avant l’arrêt',
    beforeStop.response.status === 200,
    `HTTP ${beforeStop.response.status}`,
  );

  const stopped = await admin.postJson('/api/admin/experiments/stop', {});
  check(
    'Expérience arrêtée par l’administrateur',
    stopped.response.status === 200 && stopped.data?.stopped?.status === 'ARCHIVED',
    stopped.data?.stopped ? `archivée le ${stopped.data.stopped.archivedAt}` : 'rien à arrêter',
  );
  check(
    'La date d’archivage est enregistrée',
    Boolean(stopped.data?.stopped?.archivedAt),
    stopped.data?.stopped?.archivedAt ?? '—',
  );
  check(
    'L’expérience arrêtée est bien celle qui tournait',
    stopped.data?.stopped?.id === experimentId,
  );

  // Idempotent: pressing the button twice must not fail.
  const again = await admin.postJson('/api/admin/experiments/stop', {});
  check(
    'Arrêter deux fois reste sans effet',
    again.response.status === 200 && again.data?.stopped === null,
    `HTTP ${again.response.status}`,
  );

  const activeAfter = await admin.get('/api/admin/experiments');
  check(
    'Plus aucune expérience active',
    activeAfter.data?.active === null,
    activeAfter.data?.active ? `n°${activeAfter.data.active.sequence}` : 'aucune',
  );

  const archived = (activeAfter.data?.archived ?? []).find(
    (item) => item.id === experimentId,
  );
  check(
    'L’expérience apparaît dans les archives',
    Boolean(archived) && archived.status === 'ARCHIVED',
    archived ? `n°${archived.sequence}` : 'absente',
  );

  const chatBlocked = await student.postJson('/api/student/ai/chat', { content: 'encore ?' });
  check(
    'Envoi à l’IA refusé après l’arrêt (message en français)',
    chatBlocked.response.status === 404 &&
      chatBlocked.data?.error?.message ===
        'Aucune expérience active : l’accès à l’Assistant IA et à l’expression écrite est fermé pour le moment.',
    chatBlocked.data?.error?.message,
  );

  const expressionBlocked = await student.postJson('/api/student/expressions', {
    content: 'Une tentative après l’arrêt.',
  });
  check('Dépôt d’une version refusé après l’arrêt', expressionBlocked.response.status === 404);

  const screen = await student.get('/etudiant');
  const html = screen.data?.html ?? '';
  check(
    'L’étudiant voit l’écran « expérience terminée »',
    screen.response.status === 200 && html.includes('L’expérience est terminée'),
    `HTTP ${screen.response.status}`,
  );
  check(
    'L’étudiant ne voit pas le message « pas encore démarré »',
    !html.includes('n’a pas encore démarré'),
  );

  // Everything written before the stop is still there.
  const detail = await admin.get(`/api/admin/experiments/${experimentId}`);
  const participants = detail.data?.participants ?? [];
  check(
    'Les données de l’arrêt sont conservées',
    participants.length === 1 &&
      participants[0].aiMessages === 2 &&
      participants[0].expressionVersions === 1,
    participants.length
      ? `${participants[0].aiMessages} messages, ${participants[0].expressionVersions} version`
      : 'aucun participant',
  );

  // Restarting works and leaves exactly one active experiment.
  const restarted = await admin.postJson('/api/admin/experiments', { question: QUESTION_2 });
  check(
    'Redémarrage possible après l’arrêt',
    restarted.response.status === 201 && restarted.data?.experiment?.status === 'ACTIVE',
    `n°${restarted.data?.experiment?.sequence}`,
  );

  const listing = await admin.get('/api/admin/experiments');
  const actives = (listing.data?.archived ?? []).filter((item) => item.status === 'ACTIVE');
  check(
    'Une seule expérience active après redémarrage',
    Boolean(listing.data?.active) && actives.length === 0,
    `n°${listing.data?.active?.sequence}`,
  );

  const back = await student.get('/etudiant');
  check(
    'L’étudiant retrouve son espace',
    back.response.status === 200,
    `HTTP ${back.response.status}`,
  );

  const forbidden = await student.postJson('/api/admin/experiments/stop', {});
  check('Un étudiant ne peut pas arrêter l’expérience', forbidden.response.status === 403);

  const anonymous = createClient();
  const anonymousStop = await anonymous.postJson('/api/admin/experiments/stop', {});
  check(
    'Un visiteur non connecté ne peut pas arrêter l’expérience',
    anonymousStop.response.status === 401,
    `HTTP ${anonymousStop.response.status}`,
  );

  const page = await readSource('src/app/admin/experience/page.tsx');
  check(
    'Le bouton d’arrêt est présent sur la page de l’expérience',
    /StopExperimentButton/.test(page),
    'src/app/admin/experience/page.tsx',
  );
}

/**
 * 24. The class is split into two groups, and a group can be corrected.
 *
 * The groups exist so the teacher can compare the written results between "IA
 * libre" and "IA guidée". They are labels only, and this group proves the
 * important half of that: the label never changes what the student sees or what
 * the assistant answers.
 */
async function checkStudentGroups() {
  group('24. Groupes d’étudiants (IA libre / IA guidée)');

  const admin = createClient();
  await admin.postJson('/api/auth/admin/login', {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });
  await admin.postJson('/api/admin/experiments', { question: QUESTION_4 });

  /* --- création groupée ------------------------------------------------- */

  const libre = await admin.postJson('/api/admin/students', {
    group: 'AI_LIBRE',
    quantity: 3,
  });
  const libreAccounts = libre.data?.accounts ?? [];
  check(
    'Trois comptes créés d’un coup en IA libre',
    libre.response.status === 201 &&
      libreAccounts.length === 3 &&
      libreAccounts.every((a) => a.group === 'AI_LIBRE'),
    `${libreAccounts.length} comptes`,
  );
  check(
    'Chaque compte a ses propres identifiants',
    new Set(libreAccounts.map((a) => a.username)).size === 3 &&
      libreAccounts.every((a) => /^[a-z]{6}$/.test(a.username) && /^[0-9]{4}$/.test(a.password)),
    libreAccounts.map((a) => `${a.username}/${a.password}`).join(', '),
  );

  const guidee = await admin.postJson('/api/admin/students', {
    group: 'AI_GUIDEE',
    quantity: 2,
  });
  const guideeAccounts = guidee.data?.accounts ?? [];
  check(
    'Deux comptes créés en IA guidée',
    guidee.response.status === 201 &&
      guideeAccounts.length === 2 &&
      guideeAccounts.every((a) => a.group === 'AI_GUIDEE'),
    `${guideeAccounts.length} comptes`,
  );
  check(
    'Les deux groupes ne partagent aucun identifiant',
    libreAccounts.every(
      (a) => !guideeAccounts.some((b) => b.username === a.username),
    ),
  );

  /* --- bornes et validation --------------------------------------------- */

  const zero = await admin.postJson('/api/admin/students', {
    group: 'AI_LIBRE',
    quantity: 0,
  });
  check(
    'Zéro étudiant refusé (message en français)',
    zero.response.status === 400 && /au moins un/i.test(zero.data?.error?.message ?? ''),
    zero.data?.error?.message,
  );

  const tooMany = await admin.postJson('/api/admin/students', {
    group: 'AI_LIBRE',
    quantity: 51,
  });
  check(
    'Plus de 50students refusé',
    tooMany.response.status === 400 && /50/.test(tooMany.data?.error?.message ?? ''),
    tooMany.data?.error?.message,
  );

  const badGroup = await admin.postJson('/api/admin/students', {
    group: 'IA_AUTRE',
    quantity: 1,
  });
  check(
    'Groupe inconnu refusé',
    badGroup.response.status === 400 && /groupe invalide/i.test(badGroup.data?.error?.message ?? ''),
    badGroup.data?.error?.message,
  );

  const noGroup = await admin.postJson('/api/admin/students', { quantity: 1 });
  check(
    'Groupe manquant refusé',
    noGroup.response.status === 400,
    `HTTP ${noGroup.response.status}`,
  );

  const beforeBadRequest = await admin.get('/api/admin/students');
  check(
    'Aucun compte fantôme créé par les requêtes refusées',
    (beforeBadRequest.data?.counts?.AI_LIBRE ?? 0) >= 3,
    `${beforeBadRequest.data?.counts?.AI_LIBRE ?? 0} en IA libre`,
  );

  /* --- le groupe est renvoyé par l'API ----------------------------------- */

  const listing = await admin.get('/api/admin/students');
  const guidedRow = (listing.data?.students ?? []).find(
    (row) => row.username === guideeAccounts[0]?.username,
  );
  check(
    'Le groupe accompagne le compte dans la liste',
    guidedRow?.group === 'AI_GUIDEE',
    `${guidedRow?.username ?? '—'} : ${guidedRow?.group ?? '—'}`,
  );
  check(
    'Le décompte par groupe est renvoyé',
    (listing.data?.counts?.AI_GUIDEE ?? 0) >= 2 &&
      (listing.data?.counts?.AI_LIBRE ?? 0) >= 3,
    `${listing.data?.counts?.AI_LIBRE ?? 0} libre / ${listing.data?.counts?.AI_GUIDEE ?? 0} guidée`,
  );

  /* --- correction d'un groupe ------------------------------------------- */

  const target = guidedRow ?? { id: '', username: '' };
  const moved = await admin.patchJson(`/api/admin/students/${target.id}`, {
    group: 'AI_LIBRE',
  });
  check(
    'Un étudiant peut être déplacé dans l’autre groupe',
    moved.response.status === 200 && moved.data?.student?.group === 'AI_LIBRE',
    moved.data?.student?.group ?? '—',
  );

  const movedBack = await admin.patchJson(`/api/admin/students/${target.id}`, {
    group: 'AI_GUIDEE',
  });
  check(
    'Le déplacement inverse fonctionne aussi',
    movedBack.response.status === 200 && movedBack.data?.student?.group === 'AI_GUIDEE',
  );

  const badMove = await admin.patchJson(`/api/admin/students/${target.id}`, {
    group: 'N_IMPORTE_QUOI',
  });
  check(
    'Groupe inconnu refusé à la correction',
    badMove.response.status === 400,
    badMove.data?.error?.message,
  );

  const ghost = await admin.patchJson(
    '/api/admin/students/00000000-0000-4000-8000-000000000000',
    { group: 'AI_LIBRE' },
  );
  check(
    'Compte inexistant refusé (404)',
    ghost.response.status === 404,
    `HTTP ${ghost.response.status}`,
  );

  /* --- le groupe ne change rien pour l'étudiant -------------------------- */

  const guided = guideeAccounts[0];
  const client = createClient();
  await client.postJson('/api/auth/student/login', {
    username: guided.username,
    password: guided.password,
  });

  const workspace = await client.get('/etudiant');
  const guidedHtml = workspace.data?.html ?? '';
  check(
    'L’étudiant IA guidée utilise l’Assistant IA normalement',
    workspace.response.status === 200 &&
      guidedHtml.includes('textarea') &&
      !guidedHtml.includes('aria-disabled="true"'),
    `HTTP ${workspace.response.status}`,
  );

  const chat = await client.postJson('/api/student/ai/chat', {
    content: 'Par où commencer mon texte ?',
  });
  check(
    'Le groupe ne bloque pas l’échange avec l’IA',
    chat.response.status === 200 && Boolean(chat.data?.assistantMessage?.content),
    `HTTP ${chat.response.status} ${
      chat.data?.assistantMessage?.content?.slice(0, 40) ?? chat.data?.error?.message ?? ''
    }`,
  );

  // Same input, same assistant: the group is not part of the prompt. The question
// itself must not mention the group either, or the check would be meaningless.
  await client.postJson('/api/student/ai/chat', {
    content: 'Une autre question, sans rien demander de particulier',
  });
  const lastPrompt = JSON.stringify(geminiCalls[geminiCalls.length - 1] ?? {});
  check(
    'Le groupe n’apparaît pas dans la requête envoyée au modèle',
    !/AI_GUIDEE|AI_GUID|guid[ée]e|IA guid/i.test(lastPrompt),
    'aucune mention du groupe dans le prompt',
  );

  const stillGuided = await admin.get(`/api/admin/students/${guided.id}`);
  check(
    'Le compte garde son groupe après les échanges',
    stillGuided.data?.student?.group === 'AI_GUIDEE',
    stillGuided.data?.student?.group ?? '—',
  );

  const forbidden = await client.patchJson(`/api/admin/students/${guided.id}`, {
    group: 'AI_LIBRE',
  });
  check(
    'Un étudiant ne peut pas changer son groupe',
    forbidden.response.status === 403,
    `HTTP ${forbidden.response.status}`,
  );

  /* --- le commutateur d’accès par groupe ---------------------------------- */

  async function setGroupAccess(group, allowed) {
    const response = await admin.request('/api/admin/access', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ group, allowed }),
    });
    return response;
  }

  const disableLibre = await setGroupAccess('AI_LIBRE', false);
  const libreState = await admin.get('/api/admin/access');
  check(
    'Suspension d’un groupe renvoyée par l’API',
    disableLibre.status === 200 &&
      libreState.data?.loginAiLibre === false &&
      libreState.data?.loginAiGuidee === true,
    `libre=${libreState.data?.loginAiLibre} guidée=${libreState.data?.loginAiGuidee}`,
  );

  const blockedLogin = await createClient().postJson('/api/auth/student/login', {
    username: libreAccounts[0].username,
    password: libreAccounts[0].password,
  });
  check(
    'Un étudiant du groupe suspendu ne peut plus se connecter',
    blockedLogin.response.status === 403 &&
      /suspendue/.test(blockedLogin.data?.error?.message ?? ''),
    blockedLogin.data?.error?.message,
  );

  const guidedStill = await client.get('/etudiant');
  check(
    'Un étudiant du groupe autorisé garde son accès',
    guidedStill.response.status === 200,
    `HTTP ${guidedStill.response.status}`,
  );

  const studentPatch = await client.request('/api/admin/access', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ group: 'AI_LIBRE', allowed: false }),
  });
  check(
    'Un étudiant ne peut pas modifier l’accès par groupe',
    studentPatch.status === 403,
    `HTTP ${studentPatch.status}`,
  );

  await setGroupAccess('AI_LIBRE', true);
  const backLogin = await createClient().postJson('/api/auth/student/login', {
    username: libreAccounts[0].username,
    password: libreAccounts[0].password,
  });
  check(
    'Réouverture d’un groupe : la connexion fonctionne à nouveau',
    backLogin.response.status === 200,
    `HTTP ${backLogin.response.status}`,
  );

  /* --- interface --------------------------------------------------------- */

  const studentsPage = await readSource('src/app/admin/etudiants/page.tsx');
  check(
    'Le groupe est affiché dans la liste des étudiants',
    /GroupBadge/.test(studentsPage) && /students\.group/.test(studentsPage),
    'src/app/admin/etudiants/page.tsx',
  );
  check(
    'Un filtre par groupe est proposé',
    /GroupFilter/.test(studentsPage) && /searchParams/.test(studentsPage),
    'filtre dans l’URL',
  );

  const dialog = await readSource('src/components/admin/create-student-dialog.tsx');
  check(
    'La création propose les deux groupes et un nombre',
    /AI_LIBRE/.test(dialog) && /AI_GUIDEE/.test(dialog) && /quantity/.test(dialog),
    'create-student-dialog.tsx',
  );

  const rendered = await admin.get('/admin/etudiants');
  const pageHtml = rendered.data?.html ?? '';
  check(
    'Les libellés des groupes sont en français',
    pageHtml.includes('IA libre') && pageHtml.includes('IA guidée'),
    'IA libre · IA guidée',
  );
}

/**
 * 25. The teacher downloads a real PDF of what a student produced.
 *
 * This is the artefact the whole experiment produces, so the check is on the file
 * itself: it must be a valid PDF, it must name the student and the experiment, and
 * the bytes must actually contain the words the student wrote — a page of French
 * labels with an empty body would pass a naive content check.
 */
/**
 * Characters of the WinAnsi block that differ from Latin-1 (bytes 0x80–0x9F).
 *
 * pdfkit encodes text with the WinAnsi encoding of the standard PDF fonts, where
 * byte 0x92 is the curly apostrophe a reader sees. Node's TextDecoder does not
 * ship windows-1252 in a minimal build and falls back to Latin-1, which would turn
 * it into a control character and silently drop every French sentence containing
 * one. The table is written out so the assertions below test the text a teacher
 * really reads.
 */
const WIN_ANSI_EXTRAS = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ',
  0x9e: 'ž', 0x9f: 'Ÿ',
};

function fromWinAnsi(hex) {
  let out = '';
  for (const byte of Buffer.from(hex, 'hex')) {
    out += WIN_ANSI_EXTRAS[byte] ?? String.fromCharCode(byte);
  }
  return out;
}

/**
 * Extracts the visible text of a PDF produced by pdfkit.
 *
 * pdfkit compresses the page content into a Flate stream and writes every string
 * as hexadecimal, one byte per character, split at every kerning pair. A plain
 * text search over the raw file therefore finds nothing, which would let the
 * assertions below pass vacuously on a PDF whose body is empty. Both layers are
 * decoded here — the Flate stream, then WinAnsi — and the fragments are
 * concatenated, since pdfkit cuts a sentence wherever the kerning table asks.
 */
function extractPdfText(bytes) {
  const raw = bytes.toString('latin1');
  let decoded = raw;

  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      decoded += inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      // Not a compressed stream: the raw bytes already carry the content.
    }
  }

  let text = '';
  for (const match of decoded.matchAll(/<([0-9a-fA-F]{2,})>/g)) {
    if (match[1].length % 2 !== 0) continue;
    const value = fromWinAnsi(match[1]);
    // Keep only runs free of control characters, so a binary blob is never read
    // as a word.
    if (value.trim().length > 0 && !/[\u0000-\u001f\u007f-\u009f]/.test(value)) {
      text += value;
    }
  }

  return text;
}

async function checkPdfExport() {
  group('25. Export PDF d’un étudiant');

  const admin = createClient();
  await admin.postJson('/api/auth/admin/login', {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });
  await admin.postJson('/api/admin/experiments', { question: QUESTION_5 });

  const account = (
    await admin.postJson('/api/admin/students', { group: 'AI_GUIDEE', quantity: 1 })
  ).data?.accounts?.[0] ?? {};

  const client = createClient();
  await client.postJson('/api/auth/student/login', {
    username: account.username,
    password: account.password,
  });

  const phrase = 'Les livres m’ont appris à regarder le monde autrement';
  await client.postJson('/api/student/ai/chat', { content: 'Par quoi commencer ?' });
  await client.postJson('/api/student/expressions', {
    content: `${phrase}. Première version.`,
  });
  await client.postJson('/api/student/expressions', {
    content: `${phrase}. Deuxième version, un peu plus développée.`,
  });

  const response = await admin.request(`/api/admin/students/${account.id}/export`);
  const bytes = Buffer.from(await response.arrayBuffer());

  check(
    'Le fichier exporté est un PDF',
    response.status === 200 &&
      response.headers.get('content-type') === 'application/pdf' &&
      bytes.subarray(0, 5).toString('latin1') === '%PDF-',
    `${bytes.byteLength} octets`,
  );

  const disposition = response.headers.get('content-disposition') ?? '';
  check(
    'Le téléchargement porte le nom de l’étudiant et de l’expérience',
    disposition.startsWith('attachment') &&
      disposition.includes(account.username) &&
      disposition.includes('AI_GUIDEE'),
    disposition,
  );

  const text = extractPdfText(bytes);
  check(
    'Le PDF contient l’identifiant de l’étudiant',
    text.includes(account.username),
    account.username,
  );
  check(
    'Le PDF contient le libellé du groupe en français',
    text.includes('IA guidée'),
    'IA guidée',
  );
  check(
    'Le PDF contient la question de l’expérience',
    text.includes('rencontre qui a changé votre façon de voir'),
    'question posée aux élèves',
  );
  check(
    'Le PDF contient les titres des deux sections',
    text.includes('Conversation IA') && text.includes('Expression écrite'),
    'conversation + expression écrite',
  );

  const hasStudentText = text.includes('Les livres m’ont appris');
  check(
    'Le texte rédigé par l’étudiant figure bien dans le PDF',
    hasStudentText,
    hasStudentText ? 'texte retrouvé' : 'texte absent du fichier',
  );
  check(
    'Les deux versions rédigées sont exportées',
    text.includes('Première version') && text.includes('Deuxième version'),
    'version 1 et version 2',
  );
  check(
    'Les accents français sont préservés',
    text.includes('Atelier d’écriture') &&
      text.includes('Première version') &&
      text.includes('développée'),
    'encodage WinAnsi intact',
  );
  check(
    'L’échange avec l’IA est exporté avec ses deux auteurs',
    text.includes('Par quoi commencer') &&
      text.includes('Réponse de test à'),
    'message de l’élève et réponse du modèle',
  );

  const emptyExport = await admin.request(
    `/api/admin/students/${account.id}/export?experimentId=00000000-0000-4000-8000-000000000000`,
  );
  check(
    'Expérience inconnue refusée (404)',
    emptyExport.status === 404,
    `HTTP ${emptyExport.status}`,
  );

  const badId = await admin.request(
    '/api/admin/students/pas-un-uuid/export',
  );
  check('Identifiant mal formé refusé', badId.status === 404, `HTTP ${badId.status}`);

  const forbidden = await client.get(`/api/admin/students/${account.id}/export`);
  check(
    'Un étudiant ne peut pas exporter un PDF',
    forbidden.response.status === 403,
    `HTTP ${forbidden.response.status}`,
  );

  const anonymous = createClient();
  const anonymousExport = await anonymous.get(`/api/admin/students/${account.id}/export`);
  check(
    'Un visiteur non connecté ne peut pas exporter un PDF',
    anonymousExport.response.status === 401,
    `HTTP ${anonymousExport.response.status}`,
  );
}

/**
 * 26. The teacher can empty the collected data, and only that.
 *
 * The permanent deletion has to be exactly what it promises: the transcripts and
 * the writings go, the accounts stay usable. Getting that wrong in either
 * direction is serious — losing a class's logins, or leaving the data in place
 * while telling the teacher it is gone.
 */
async function checkWipeData() {
  group('26. Suppression des données collectées');

  const admin = createClient();
  await admin.postJson('/api/auth/admin/login', {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });
  await admin.postJson('/api/admin/experiments', { question: QUESTION_6 });

  const survivors = [];
  for (const group of ['AI_LIBRE', 'AI_GUIDEE']) {
    const batch = await admin.postJson('/api/admin/students', { group, quantity: 2 });
    survivors.push(...(batch.data?.accounts ?? []));
  }

  const clients = [];
  for (const account of survivors) {
    const client = createClient();
    await client.postJson('/api/auth/student/login', {
      username: account.username,
      password: account.password,
    });
    await client.postJson('/api/student/ai/chat', { content: 'Une question de test' });
    await client.postJson('/api/student/expressions', {
      content: 'Une expression écrite de test pour la suppression.',
    });
    clients.push(client);
  }

  const before = await admin.get('/api/admin/data');
  const beforeCounts = before.data?.counts ?? {};
  check(
    'Les données à supprimer sont comptées',
    (beforeCounts.aiMessages ?? 0) >= 8 &&
      (beforeCounts.expressionVersions ?? 0) >= 4 &&
      (beforeCounts.accounts ?? 0) >= 4,
    `${beforeCounts.aiMessages ?? 0} messages · ${beforeCounts.expressionVersions ?? 0} expressions · ${beforeCounts.accounts ?? 0} comptes`,
  );

  /* --- le mot de confirmation protège contre une fausse manipulation ------- */

  const noWord = await admin.postJson('/api/admin/data', { confirm: 'oui', experiments: false });
  check(
    'Sans le mot de confirmation, rien n’est supprimé',
    noWord.response.status === 400,
    noWord.data?.error?.message,
  );

  const wrongCase = await admin.postJson('/api/admin/data', {
    confirm: 'supprimer',
    experiments: false,
  });
  check(
    'Le mot de confirmation est sensible à la casse',
    wrongCase.response.status === 400,
    `HTTP ${wrongCase.response.status}`,
  );

  const untouched = await admin.get('/api/admin/data');
  check(
    'Les données sont toujours là après les refus',
    (untouched.data?.counts?.aiMessages ?? 0) === (beforeCounts.aiMessages ?? 0) &&
      (untouched.data?.counts?.expressionVersions ?? 0) ===
        (beforeCounts.expressionVersions ?? 0),
    `${untouched.data?.counts?.aiMessages ?? 0} messages intacts`,
  );

  /* --- suppression réelle ------------------------------------------------ */

  const wiped = await admin.postJson('/api/admin/data', {
    confirm: 'SUPPRIMER',
    experiments: false,
  });
  const deleted = wiped.data?.deleted ?? {};
  check(
    'Les messages et les expressions sont supprimés',
    wiped.response.status === 200 &&
      deleted.aiMessages === (beforeCounts.aiMessages ?? 0) &&
      deleted.expressionVersions === (beforeCounts.expressionVersions ?? 0),
    `${deleted.aiMessages ?? 0} messages · ${deleted.expressionVersions ?? 0} expressions`,
  );

  const after = await admin.get('/api/admin/data');
  check(
    'La base ne contient plus aucune conversation',
    (after.data?.counts?.aiMessages ?? -1) === 0 &&
      (after.data?.counts?.expressionVersions ?? -1) === 0,
    `${after.data?.counts?.aiMessages ?? '?'} message(s), ${after.data?.counts?.expressionVersions ?? '?'} expression(s)`,
  );
  check(
    'Les comptes sont conservés',
    (after.data?.counts?.accounts ?? 0) >= 4,
    `${after.data?.counts?.accounts ?? 0} comptes`,
  );
  check(
    'L’expérience est conservée par défaut',
    (after.data?.counts?.experiments ?? 0) >= 1,
    `${after.data?.counts?.experiments ?? 0} expérience(s)`,
  );

  /* --- les comptes fonctionnent toujours ---------------------------------- */

  const relogin = await clients[0].get('/etudiant');
  const html = relogin.data?.html ?? '';
  check(
    'Un compte survit à la suppression et rouvre son espace',
    relogin.response.status === 200 && html.includes('textarea'),
    `HTTP ${relogin.response.status}`,
  );

  const firstVersion = await clients[0].postJson('/api/student/expressions', {
    content: 'Une nouvelle version après le vidage des données.',
  });
  check(
    'La première version repart bien à 1',
    firstVersion.response.status === 201 && firstVersion.data?.version?.versionNumber === 1,
    `version ${firstVersion.data?.version?.versionNumber ?? '—'}`,
  );

  const newChat = await clients[0].postJson('/api/student/ai/chat', {
    content: 'Une question après le vidage',
  });
  check(
    'La conversation repart d’un historique vide',
    newChat.response.status === 200,
    `HTTP ${newChat.response.status}`,
  );

  const conversations = await clients[0].get('/api/auth/session');
  check(
    'La session reste valide après la suppression',
    conversations.response.status === 200,
    `HTTP ${conversations.response.status}`,
  );

  /* --- suppression des expériences en option ----------------------------- */

  const withExperiments = await admin.postJson('/api/admin/data', {
    confirm: 'SUPPRIMER',
    experiments: true,
  });
  check(
    'Les expériences peuvent être supprimées explicitement',
    withExperiments.response.status === 200 && withExperiments.data?.deleted?.experiments >= 1,
    `${withExperiments.data?.deleted?.experiments ?? 0} expérience(s)`,
  );

  const finalCounts = await admin.get('/api/admin/data');
  check(
    'Plus aucune expérience ne subsiste',
    (finalCounts.data?.counts?.experiments ?? -1) === 0,
    `${finalCounts.data?.counts?.experiments ?? '?'} expérience(s)`,
  );
  check(
    'Les comptes survivent à la suppression des expériences',
    (finalCounts.data?.counts?.accounts ?? 0) >= 4,
    `${finalCounts.data?.counts?.accounts ?? 0} comptes`,
  );

  const stopped = await clients[0].get('/etudiant');
  const stoppedHtml = stopped.data?.html ?? '';
  check(
    'L’étudiant ne voit pas d’erreur une fois les expériences supprimées',
    stopped.response.status === 200 &&
      stoppedHtml.includes('pas encore démarré') &&
      !stoppedHtml.includes('terminée'),
    'écran « pas encore démarré »',
  );

  /* --- autorisations ----------------------------------------------------- */

  const forbidden = await clients[0].postJson('/api/admin/data', {
    confirm: 'SUPPRIMER',
    experiments: false,
  });
  check(
    'Un étudiant ne peut pas vider les données',
    forbidden.response.status === 403,
    `HTTP ${forbidden.response.status}`,
  );

  const anonymous = createClient();
  const anonymousWipe = await anonymous.postJson('/api/admin/data', {
    confirm: 'SUPPRIMER',
    experiments: false,
  });
  check(
    'Un visiteur non connecté ne peut pas vider les données',
    anonymousWipe.response.status === 401,
    `HTTP ${anonymousWipe.response.status}`,
  );

  /* --- le dernier groupe doit repartir ----------------------------------- */

  const restarted = await admin.postJson('/api/admin/experiments', { question: QUESTION_1 });
  check(
    'Une nouvelle expérience peut démarrer après le vidage',
    restarted.response.status === 201,
    `n°${restarted.data?.experiment?.sequence ?? '—'}`,
  );

  const schema = await readSource('src/server/db/schema.ts');
  check(
    'La colonne du groupe existe avec ses deux valeurs',
    /add column if not exists study_group/.test(schema) &&
      /AI_LIBRE/.test(schema) &&
      /AI_GUIDEE/.test(schema),
    'students.study_group',
  );
  check(
    'La colonne évite le mot réservé GROUP de PostgreSQL',
    !/\bgroup\s+(text|integer|varchar)/.test(schema),
    'study_group, pas group',
  );
}

/**
 * 23. The login brake must stay a real brake.
 *
 * The per-IP attempt limit became configurable so a whole class can log in
 * together behind one school IP. It must never be silently dropped: the default
 * has to stay low, and both login paths have to go through it.
 */
async function checkLoginRateLimit() {
  group('23. Limite des tentatives de connexion');

  const envSource = await readSource('src/server/env.ts');
  check(
    'La limite est configurable par variable d’environnement',
    /loginAttemptsPerMinute/.test(envSource) && /LOGIN_ATTEMPTS_PER_MINUTE/.test(envSource),
    'LOGIN_ATTEMPTS_PER_MINUTE',
  );
  check(
    'La valeur par défaut reste basse (12 par minute)',
    /:\s*12\s*;/.test(envSource.match(/get loginAttemptsPerMinute[\s\S]*?\n  },/)?.[0] ?? ''),
    'protection contre le forcage brutal',
  );

  const authSource = await readSource('src/server/services/authService.ts');
  const appels = [
    ...authSource.matchAll(/rateLimit\(`login:(student|admin):\$\{ip\}`,\s*(\w+),\s*[\d_]+\)/g),
  ];
  check(
    'Les deux chemins de connexion passent par la limite',
    appels.length === 2 &&
      new Set(appels.map((m) => m[1])).size === 2 &&
      appels.every((m) => m[2] === 'attempts'),
    'étudiant et administrateur',
  );
  check(
    'La valeur vient de la configuration serveur',
    (authSource.match(/= env\.loginAttemptsPerMinute;/g) ?? []).length === 2,
    'env.loginAttemptsPerMinute',
  );
  check(
    'Aucune limite codée en dur ne subsiste',
    !/rateLimit\(`login:(student|admin)[^)]*,\s*\d+\s*,/.test(authSource),
    'plus de « 12 » ou « 8 » figés dans le service',
  );

  const example = await readSource('.env.example');
  check(
    'La variable est documentée dans .env.example',
    example.includes('LOGIN_ATTEMPTS_PER_MINUTE'),
  );
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