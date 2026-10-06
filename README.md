# Atelier d’écriture IA — AI-assisted writing workshop platform

A production-ready educational experiment platform built with **Next.js (App Router)**, **TypeScript**, **PostgreSQL** and **OpenAI** (Gemini remains as a legacy provider option).

A single administrator creates student accounts and runs writing experiments. Every student gets:

- the **question of the day** for the active experiment;
- an **AI assistant** (chat) that is completely independent from the writing area;
- a **versioned writing area** where each submission creates a new immutable version.

The administrator can suspend student access globally, browse every conversation and every version, and inspect archived experiments.

> **The entire user interface is in French.** Identifiers, file names and code comments in the README are in English; all UI strings live in `src/i18n/dictionaries/fr.ts`.

---

## Table of contents

1. [Feature overview](#feature-overview)
2. [Technical stack](#technical-stack)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Environment variables](#environment-variables)
6. [PostgreSQL setup](#postgresql-setup)
7. [OpenAI API key](#openai-api-key)
8. [Database initialisation](#database-initialisation)
9. [Local development](#local-development)
10. [Production build](#production-build)
11. [Deployment on Render](#deployment-on-render)
12. [Automated test suite](#automated-test-suite)
13. [Manual test checklist (28 checks)](#manual-test-checklist-28-checks)
14. [Project structure](#project-structure)
15. [Security notes](#security-notes)

---

## Feature overview

### Administrator

- **Tableau de bord** — statistics of the active experiment (students, AI messages, versions), recent activity, quick access to the access switch.
- **Étudiants** — generates student accounts. Each username is exactly **6 lowercase letters**, each password exactly **4 digits**; uniqueness is verified at the database level (unique index) and in the service. Accounts are created in batches of 1–50 and assigned to one of the two study groups.
- **Groupes (IA libre / IA guidée)** — every account belongs to one of two groups, chosen at creation and changeable afterwards. The group is a **label only**: it is displayed on the student list, shown on the student sheet and included in the PDF export, but it does **not** change how the AI assistant answers.
- **Export PDF** (per student, in the list and on the student sheet) — downloads a real PDF of that student for the current experiment: identity, group, question, the full AI conversation and every writing version, French accents preserved. Passing `?experimentId=` exports an archived experiment instead.
- **Vider les données collectées** (Paramètres) — permanently deletes every AI message and every writing version in one transaction. The student accounts always survive, and experiments are only deleted when the administrator explicitly checks the box. A typed `SUPPRIMER` confirmation and the exact figures are required before anything is removed.
- **Nouveau mot de passe** (per student, in the list and on the student sheet) — generates a **new 4-digit password**, displayed once, for a student who lost theirs. Passwords are bcrypt hashes and can never be read back, so this generates a new one instead of showing the old one. The sessions opened with the previous password are revoked immediately (`passwordVersion` claim), the student is returned to the login screen and must re-authenticate.
- **Étudiant (detail)** — full AI conversation and all writing versions of that student for a given experiment.
- **Expérience actuelle** — starts a new experiment (the “question of the day”). Starting a new one **archives** the previous experiment; all of its data is preserved.
- **Expériences précédentes** — list and detail of every archived experiment, including per-student navigation.
- **Paramètres** — global switch **“Autoriser l’accès des étudiants”** and server information.
- **Autoriser l’accès des étudiants** — when switched **off**:
  - new student logins are refused;
  - all live student sessions are **invalidated immediately** (epoch revocation);
  - students are redirected to a screen displaying *« Le temps est écoulé. L’expérience est actuellement suspendue. »*;
  - **no data is deleted**; the administrator keeps full access.

### Student

- **Connexion** — username (6 letters) + password (4 digits). Students cannot change their password.
- **Question du jour** — the question of the active experiment.
- **Assistant IA** — an independent chat. The question of the day and the student’s writing are **never** sent to the AI. Every message is stored and can never be deleted (not even by the administrator).
- **Expression écrite** — a chronological feed of every submitted version. **Envoyer** creates version *n+1*, **Modifier** loads the latest version and creates a new one. The most recent version carries the **“Dernière version”** badge. No “previous versions” tab: history *is* the feed.
- A new experiment starts with an **empty conversation** and version numbering back to **1**.

### Rules enforced by the code

- Exactly **one ACTIVE experiment** at a time (partial unique index `experiments_single_active`).
- Students never see archived experiments.
- Identities come from the session cookie only — a client-supplied `studentId` or `experimentId` is rejected (NoSQL injection protection: every schema is `.strict()`).
- All API payloads are validated with Zod, all error messages are in French.

---

## Technical stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, React 19, Turbopack-compatible build) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + shadcn-style components (Radix UI + CVA) |
| Icons | lucide-react |
| Database | PostgreSQL with the official driver (`pg`) behind a repository layer |
| Authentication | JWT (`jose`) in an **HttpOnly** cookie, bcrypt password hashing |
| AI | Provider abstraction (`AIProvider`) with OpenAI (Chat Completions) active by default; Gemini registered as a legacy option via the REST API |
| Tests | Custom end-to-end harness (PGlite - real PostgreSQL compiled to WebAssembly, exposed over TCP + real production build + fake OpenAI-compatible endpoint) |

All data access is centralised in `src/server/db/repositories/`, behind a small query layer (`src/server/db/client.ts`). The schema is created by the application itself on the first authenticated request, with idempotent statements and no migration tool.

---

## Prerequisites

- **Node.js ≥ 20.9** (22 LTS recommended)
- A PostgreSQL database: [Neon](https://neon.tech) (free tier), Supabase, Render, or a local PostgreSQL ≥ 14
- An OpenAI API key - [platform.openai.com](https://platform.openai.com/api-keys)

---

## Installation

```bash
git clone <your-repository-url>
cd atelier-ecriture-ia
npm install
cp .env.example .env.local   # then fill in the values (see next section)
```

`.env.local` is used by `next dev` / `next build`. The Node scripts (`npm run seed:admin`, `npm run db:schema`) read `.env` — either create a `.env` file with the same values, or export the variables in your shell:

```bash
# PowerShell
$env:DATABASE_URL="postgresql://user:password@host/neondb?sslmode=verify-full"
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string, e.g. `postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=verify-full`. TLS is driven by `sslmode` (`verify-full` recommended, `require`, `disable`); URL-encode the password if it contains `@ : / ? # % &`. |
| `AUTH_SECRET` | yes | HMAC-SHA256 signing secret for session cookies. **Minimum 32 characters in production** (the app refuses to boot otherwise). Generate with `openssl rand -base64 48`. Changing it invalidates all sessions. |
| `ADMIN_USERNAME` | yes (for the seed) | Username of the single administrator (default `admin`). Used only by `npm run seed:admin`. |
| `ADMIN_PASSWORD` | yes (for the seed) | Administrator password. Used only by `npm run seed:admin`, then read by nothing at runtime. |
| `AI_PROVIDER` | no | Provider registry key, `openai` (default) or `gemini`. |
| `OPENAI_API_KEY` | yes (for the AI) | Server-side only. Obtained from platform.openai.com/api-keys. |
| `OPENAI_MODEL` | no | Default `gpt-4o-mini`. |
| `OPENAI_BASE_URL` | no | Override the OpenAI endpoint (useful for tests or a proxy). Default: official OpenAI API. |
| `GEMINI_API_KEY` | no | Legacy: used only when `AI_PROVIDER=gemini`. |
| `GEMINI_MODEL` | no | Default `gemini-3.8-flash`. |
| `GEMINI_BASE_URL` | no | Override the Gemini endpoint (useful for tests or a proxy). |
| `SESSION_MAX_AGE` | no | Session lifetime in seconds, default `43200` (12 h). |
| `APP_URL` | no | Public URL of the deployment, used for metadata. |

**Never commit a real `.env` / `.env.local`** — both are already listed in `.gitignore`, and `.env.example` is the documented template.

---

## PostgreSQL setup

1. Create a free database on [Neon](https://neon.tech) (or Supabase / Render / a local PostgreSQL ≥ 14).
2. Copy the **pooled** connection string and keep `sslmode=verify-full` (or `require`):

```
postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=verify-full
```

3. Paste it into `DATABASE_URL`. **No migration step is required**: the schema (`src/server/db/schema.ts`) is applied by the application on the first authenticated request, with idempotent `create table if not exists` statements. `npm run db:schema` does the same thing explicitly.
4. Run the seed once: `npm run seed:admin`.

---

## OpenAI API key

1. Open [platform.openai.com](https://platform.openai.com/api-keys).
2. Create an API key. It starts with `sk-` (e.g. `sk-proj-…`).
3. Put it in `OPENAI_API_KEY` (server-side only) in `.env`.

The key is read exclusively on the server (`src/server/env.ts`). A test in the suite (`Sécurité des secrets`) scans the client bundles and the server build output to make sure it never leaks.

Two server-configuration mistakes are reported with a dedicated French message instead of a generic failure:

| Message | Cause |
| --- | --- |
| « La clé API de l'assistant IA est refusée par OpenAI. » | `OPENAI_API_KEY` is missing, truncated, mistyped, revoked, or refers to another OpenAI credential. |
| « Le modèle d'assistant IA configuré n'est plus disponible. » | `OPENAI_MODEL` designates a model OpenAI no longer serves. Pick a current one (e.g. `gpt-4o-mini`). |

---

## Database initialisation

```bash
npm run seed:admin    # creates the single administrator (bcrypt hash)
npm run db:schema     # optional: creates the tables and indexes ahead of the first request
```

- `seed:admin` is **idempotent**: if the administrator already exists, only the password is updated. There is **no admin registration page** — this script is the only way to create the account.
- The schema is also created automatically (memoised, executed on the first authenticated request): every statement uses `create table if not exists`, so `db:schema` is only a convenience for production restarts.

---

## Local development

```bash
npm run dev       # http://localhost:3000
```

Other scripts:

```bash
npm run typecheck # tsc --noEmit
npm run lint      # eslint (flat config, Next.js core-web-vitals + TypeScript)
npm run build     # production build
npm run start     # serve the production build
npm run test:e2e  # full integration suite (boots its own server + database)
```

### Using a local PostgreSQL (optional)

If you prefer not to create a hosted database, any local PostgreSQL ≥ 14 works.
With Docker:

```bash
docker run -d --name atelier-postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=atelier postgres:16
```

```bash
# .env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/atelier?sslmode=disable
npm run seed:admin
npm run dev
```

TLS is controlled by `sslmode`, so a local server must use `sslmode=disable`.

---

## Production build

```bash
npm ci
npm run build
npm run start
```

The build requires `DATABASE_URL`, `AUTH_SECRET` (≥ 32 chars) to be present at runtime, and the OpenAI variables for the AI features.

---

## Deployment on Render

1. Push the repository to GitHub.
2. In Render, create a **Web Service** connected to the repository.
3. Settings:
   - **Build command:** `npm ci && npm run build`
   - **Start command:** `npm run start`
   - **Environment:** add every variable of the table above (`APP_URL` = the Render URL).
4. After the first deploy, run the administrator initialisation once (Render shell or locally against the same database):

   ```bash
   npm run seed:admin
   ```

5. Open the site, go to **Connexion**, sign in with the administrator credentials, and:
   - create the student accounts (write down the generated credentials — they are displayed once),
   - start the first experiment,
   - keep **Autoriser l’accès des étudiants** switched on.

> On the free plan the service spins down when idle, so the first request after a period of inactivity can take up to ~1 minute to answer.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Login screen shows a yellow **“Base de données injoignable”** banner, API answers `503 DATABASE_UNAVAILABLE` | `DATABASE_URL` is wrong, the password contains unencoded special characters (`@ : / ? # %`), the host is suspended, or the IP is not allowed by the provider | Check the connection string (Neon → *Connection string*, or *Databases* on other providers) and the IP allow-list |
| `password authentication failed for user "…"` | Wrong username or password in `DATABASE_URL` | Copy the exact user from the provider dashboard; never keep a `<username>` placeholder. With Neon, keep the `-pooler` hostname as given |
| `self-signed certificate in certificate chain` | The provider’s certificate is not trusted by Node.js | Use `sslmode=verify-full` (recommended); for a self-signed server, point `NODE_EXTRA_CA_CERTS` at the CA file |
| `the database system is starting up` / `ECONNREFUSED` | The server is cold-starting or unreachable | Wait a few seconds and retry; on Neon, a scale-to-zero project wakes up on the first connection |
| “L’assistant IA n’est pas configuré sur le serveur.” | `OPENAI_API_KEY` is empty | Set the key from <https://platform.openai.com/api-keys> and restart the server |
| “La clé API de l’assistant IA est refusée par OpenAI.” | `OPENAI_API_KEY` is invalid | Must match an active OpenAI key from <https://platform.openai.com/api-keys> |
| “Le modèle d’assistant IA configuré n’est plus disponible.” | `OPENAI_MODEL` refers to a retired model | Set `OPENAI_MODEL` to a current model such as `gpt-4o-mini` |

---

## Automated test suite

```bash
npm run test:e2e
```

The harness is not a mock: it starts a **real production build** (`next start`) against

- a **real PostgreSQL** ([PGlite](https://pglite.dev), the official Postgres compiled to WebAssembly and exposed over TCP, so `pg` connects to it exactly as it would to Neon — no Docker and no local server required),
- a **local OpenAI-compatible endpoint** (no API key, no internet required),

then exercises the HTTP API with real cookies, plus a static scan of the built bundles. Current result: **226/226 checks green**, in 26 groups: authentication, student accounts, permissions, experiments, student area, AI assistant (success, quota, empty, malformed, safety filter, outage), writing versions, data isolation, admin inspection, password reset, archives, global access switch, workspace layout, experiment start/stop, student groups, PDF export, data wipe, login rate limit, new experiment, logout, French-only UI, and secret exposure.

---

## Manual test checklist (28 checks)

Run through this list once after the deployment, on a phone and on a computer.

### Administrator

1. **Access `/admin` without being signed in** → redirect to `/connexion`.
2. **Sign in with a wrong password** → French error message, no session created.
3. **Sign in with the credentials from `npm run seed:admin`** → *Tableau de bord*.
4. **Check the session cookie** in the browser devtools → `HttpOnly`, `SameSite=Lax`, `Path=/` (and `Secure` in production).
5. **Create 4 student accounts** (Étudiants → *Créer un compte*) → usernames of exactly 6 lowercase letters, passwords of exactly 4 digits, **all different**.
6. **Check the credentials carefully** (write them down immediately): 6 lowercase letters, 4 digits, and all different between accounts.
7. **Sign in as a student** with the generated credentials → *Question du jour*, *Assistant IA* and *Expression écrite*.
8. **Start an experiment** (Expérience actuelle) → the question becomes the *question du jour*.
9. **Start a second experiment** → the first one is **archived** and still listed in *Expériences précédentes*.
10. **Browse an archived experiment** → detail page, statistics and per-student drill-down are accessible.
11. **Reset a student password** (Étudiants → *Nouveau mot de passe*, or the student sheet) → a new 4-digit password is displayed once, the username is unchanged, and the old password is not recoverable.
12. **Sign in as that student with the previous password** → refused; the new password works.
13. **With the student connected, reset their password again** → their open session stops working immediately and they land on the login screen; their conversation and versions are preserved.
14. **Switch “Autoriser l’accès des étudiants” off** → confirmation dialog in French.
15. **Try to sign in as a student while access is off** → refused: *« L'accès aux étudiants est actuellement désactivé. »*
16. **Use an already-open student session while access is off** → immediately sent to *Le temps est écoulé. L’expérience est actuellement suspendue.*, and sending a message is refused.
17. **Switch access back on** → the administrator stays connected throughout; students can sign in again.
18. **Confirm no data was lost** after the suspension: previous messages and versions are still there.

### Student

19. **Open `/etudiant`** → the question of the day is displayed, in French.
20. **Send a message to the AI** → an answer arrives; the exchange is stored.
21. **Check independence of the two spaces** → the question of the day and the written text are **never** sent to the AI provider (verify in the network panel: the payload only contains your messages).
22. **Refresh the page** → the conversation and the versions are still there.
23. **Submit a text** (*Envoyer*) → version 1 appears with the *Dernière version* badge.
24. **Click *Modifier*** → the latest text is loaded; saving creates **version 2**, version 1 is preserved above it.
25. **Submit again a few times** → the feed shows all versions in chronological order, never overwritten.
26. **Start a new experiment as the administrator**, then reconnect as the student → conversation empty, version numbering back to 1.
27. **Sign out** → the session is closed, and going back to `/etudiant` redirects to `/connexion`.
28. **Mobile (375 px)** → navigation, chat, and writing area remain usable; the layout never overflows horizontally. Then **read every screen in French** → no English word appears anywhere in the interface (validated automatically by the suite, group 15).

---

## Project structure

```
scripts/
  seed-admin.mjs         # creates the single administrator
  ensure-indexes.mjs     # creates the indexes
  test-e2e.mjs           # integration suite (real build + real DB + fake AI)
src/
  app/
    connexion/           # login page
    acces-suspendu/      # "Le temps est écoulé…" screen
    admin/               # dashboard, students, experiments, archives, settings
    etudiant/            # student workspace (question, AI, writing)
    api/                 # REST routes (auth, admin, student, system)
  components/
    admin/ student/ auth/ ui/
  i18n/dictionaries/fr.ts # every French string
  lib/                    # api helpers, error taxonomy, validation schemas, types
  middleware.ts           # edge guard (signature check only, no database)
  server/
    ai/                   # AIProvider abstraction + OpenAI/Gemini providers
    auth/                 # session, guards, password hashing, rate limiting
    db/                   # PostgreSQL pool, schema, row mappers, repositories
    services/             # use cases (admin, student, access)
```

---

## Security notes

- Passwords hashed with **bcrypt**; no plaintext credential is ever logged.
- Sessions are **JWT signed (HS256)** and stored in an **HttpOnly** cookie; `AUTH_SECRET` lives only on the server.
- **Server-side authorisation**: `requireAdmin()` / `requireStudent()` derive the identity from the cookie. The role, the *access epoch* and the student *password version* are verified on every request; the epoch is incremented on each access toggle (revoking every student session instantly) and the password version on each password reset (revoking that student's sessions only).
- Passwords can only be **regenerated**, never read back: the reset endpoint returns the new plaintext password exactly once, and no endpoint ever returns a password afterwards.
- The **edge middleware** only verifies the signature (no database in the Edge runtime); real authorisation happens in the layouts, pages and API routes.
- **SQL injection**: every payload schema is `.strict()`, identifiers are validated against the UUID format before reaching PostgreSQL, `studentId` / `experimentId` sent by a client are rejected, and **every query uses bound parameters** (`$1`, `$2`, …) — no value is ever concatenated into SQL.
- **Rate limiting** on logins (per IP) and AI messages (per student).
- All secrets are server-only (`server-only` + `next.config.ts` → `serverExternalPackages`); the test suite verifies no secret reaches the client bundles.
- API responses are sent with `Cache-Control: no-store`.

---

## License

Private project — all rights reserved.