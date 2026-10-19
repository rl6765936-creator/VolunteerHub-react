# VolunteerHub Backend

REST API for VolunteerHub, a community platform where every registered user can both request
help and volunteer. Built with Node.js, Express 5, strict TypeScript, PostgreSQL, Prisma 7 and
Zod, using the same architecture and conventions as the VoiceUp backend (independent project,
database and configuration).

> **VolunteerHub is not a substitute for emergency services.** In an emergency, contact the
> relevant emergency number.

## What it does

- **Accounts:** register, log in, current user (same contract as VoiceUp, so the VoiceUp React
  `AuthContext`, Login, Register and ProtectedRoute work unchanged). Two roles only: `USER` and
  `ADMIN`. Admins can block users.
- **Volunteer profile:** skills, region, interest categories and availability (private).
- **Help requests:** any user creates one; an admin approves it before it is public. Other
  users offer help; the owner accepts exactly one offer, then marks the request completed.
  Up to 5 images per request.
- **Volunteer tasks:** any user creates one (date, location, capacity); an admin approves it
  before it is public. Registration is automatic while places are free.
- **Notifications** (in-app), **status history**, **audit log** of admin actions, **admin
  dashboard** with the success metrics, **personal dashboard** and rule-based **matching** by
  region, category and available weekdays (no AI).

## Windows: quick setup

Requirements: Node.js 22 LTS or newer and PostgreSQL (14+) installed locally.

1. Double-click `setup\setup-volunteerhub.bat`. It asks for:
   - the password of the `postgres` user (from the PostgreSQL install);
   - a new password for the `volunteerhub` database user;
   - the first admin's email and password (12+ characters);
   - a JWT secret (32+ characters).

   It then creates the `volunteerhub` user and the `volunteerhub_dev` and `volunteerhub_test`
   databases (only if missing, nothing is dropped), writes `.env`, runs `npm install`, applies
   the migrations, seeds the admin and categories, and runs the tests. A log without secrets is
   written to `setup\setup-volunteerhub.txt`. If `.env` already exists it is kept.

2. Start the server: double-click `setup\start-volunteerhub.bat` (or run `npm run dev`).
3. Open <http://localhost:3001/api/docs>.

## Manual setup (any OS)

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then set DATABASE_URL, JWT_SECRET and the SEED_ADMIN_* values
npm run db:deploy           # apply migrations to the database in DATABASE_URL
npm run db:seed             # first admin and categories (idempotent, never deletes data)
npm run dev                 # http://localhost:3001
```

- API docs (Swagger UI): <http://localhost:3001/api/docs>
- OpenAPI JSON: <http://localhost:3001/api/docs/openapi.json>
- Health: `GET /api/health` (liveness), `GET /api/health/ready` (database)

## Scripts

| Script                                    | Purpose                                              |
| ----------------------------------------- | ---------------------------------------------------- |
| `npm run dev`                             | Run with auto-reload (reads `.env`)                  |
| `npm run build` / `npm start`             | Compile to `dist/` / run the compiled server         |
| `npm run check`                           | Typecheck, lint, format check and all tests          |
| `npm run typecheck`                       | Type-check sources and tests                         |
| `npm run lint` / `npm run lint:fix`       | ESLint (type-aware)                                  |
| `npm run format` / `npm run format:check` | Prettier                                             |
| `npm test` / `npm run test:watch`         | Vitest + Supertest against a real PostgreSQL test DB |
| `npm run db:migrate`                      | Create/apply a migration in development              |
| `npm run db:deploy`                       | Apply migrations (production, CI)                    |
| `npm run db:seed` / `npm run db:reset`    | Seed / reset the development database                |

## Tests

The tests run against a real PostgreSQL database named in `DATABASE_URL_TEST` (from the
environment or the `.env` file; default
`postgresql://volunteerhub:volunteerhub@localhost:5432/volunteerhub_test`). Before the run, the
schema is dropped and rebuilt from the migrations in `prisma/migrations`; tables are truncated
before each test. For safety, the suite refuses to run against a database whose name does not
end in `_test`.

They cover the VoiceUp auth contract, authorization and privacy rules, moderation and
re-moderation, database constraints, concurrency (the last free place of a task, capacity
changes during registrations, accepting offers at the same time), the seed, end-to-end
workflows, and that every route is documented in OpenAPI.

## Configuration

All configuration comes from environment variables, validated at startup with Zod. The server
refuses to start on invalid configuration and prints which variables are wrong (never their
values). See `.env.example` for the complete list.

| Variable                 | Default                   | Description                                         |
| ------------------------ | ------------------------- | --------------------------------------------------- |
| `DATABASE_URL`           | required                  | PostgreSQL connection string                        |
| `JWT_SECRET`             | required (32+ characters) | Access token signing secret                         |
| `JWT_EXPIRES_IN_SECONDS` | `7200`                    | Access token lifetime                               |
| `NODE_ENV`, `PORT`       | `development`, `3001`     | 3001 so it can run next to VoiceUp (3000)           |
| `LOG_LEVEL`              | depends on `NODE_ENV`     | `debug`, `info`, `warn`, `error` or `silent`        |
| `CORS_ORIGINS`           | empty                     | Comma-separated allowed browser origins             |
| `TRUST_PROXY`            | `0`                       | Reverse-proxy hops to trust for client IPs          |
| `RATE_LIMIT_*`           | 300 req / 15 min          | Global per-IP limit (health is exempt)              |
| `AUTH_RATE_LIMIT_MAX`    | `20`                      | Register/login per IP per window                    |
| `WRITE_RATE_LIMIT_MAX`   | `30`                      | New requests, offers, tasks and uploads per IP/hour |
| `UPLOAD_DIR`             | `uploads`                 | Image storage directory (must be persistent)        |
| `TIME_ZONE`              | `Asia/Jerusalem`          | Used to match task days with available weekdays     |

## Project structure

```
prisma/
  schema.prisma          11 entities and enums
  migrations/            init + hand-written CHECK constraints and partial unique indexes
  seed.ts                idempotent seed (admin, categories)
setup/                   Windows setup and start scripts
src/
  server.ts              process entry: config, HTTP server, graceful shutdown
  app.ts                 builds the Express app (tests import it directly)
  routes.ts              mounts feature routers under /api
  config/env.ts          environment validation
  docs/                  OpenAPI document (built from the Zod schemas) and Swagger UI
  lib/                   errors, logger, prisma, row locks, jwt, password, pagination, storage
  middleware/            auth, security (helmet, CORS, rate limits), logging, error handler
  modules/
    auth/ users/ profiles/ categories/ moderation/ requests/ offers/ attachments/
    tasks/ registrations/ notifications/ history/ dashboard/ matches/ audit/ admin/ health/
tests/                   integration tests (Supertest) and unit tests
```

## Data model

`User` (role, status, optional phone) · `VolunteerProfile` (skills, region, available days,
interests) · `Category` · `HelpRequest` → `HelpOffer` · `MediaAttachment` (request images) ·
`VolunteerTask` → `TaskRegistration` · `StatusHistory` · `Notification` · `AuditLog`.

Requests and tasks have two separate status fields: `moderationStatus` (`PENDING_REVIEW`,
`APPROVED`, `REJECTED`) for publication, and `status` for execution (requests: `OPEN`,
`IN_PROGRESS`, `COMPLETED`, `CANCELLED`; tasks: `OPEN`, `COMPLETED`, `CANCELLED`).

## API conventions

- Success: `{ "data": ..., "meta"?: ... }`. Lists accept `page` and `pageSize` (max 50) and return
  `meta: { page, pageSize, total, totalPages }`.
- Error: `{ "error": { "code": "STABLE_CODE", "message": "English text", "details"?: ... } }`.
  Clients should depend on `error.code`, not on the message.
- Authentication: `Authorization: Bearer <accessToken>` from `POST /api/auth/login` or
  `/register`. Stateless: no refresh or logout endpoint; the client discards the token.
- User content may be Hebrew (UTF-8). API messages and documentation are English.
- Resources that are not visible to you return `404`, never `403`, so their existence is not
  leaked. `403` means you can see it but may not do that action.

## Business rules

**Roles.** `USER` and `ADMIN` only. Ownership decides who manages a request or task. Self
registration always creates an active `USER`. Blocked accounts cannot log in and their tokens
stop working immediately (`403 ACCOUNT_BLOCKED`). Admins cannot change their own role or status.

**Moderation.** New requests and tasks are `PENDING_REVIEW` and not public. Admins approve them
(the first approval sets `publishedAt`) or reject them with a reason shown to the owner; admins
can also take down a published item. Every decision writes the status history and the audit
log and notifies the owner.

**Re-moderation.** A material edit of a published item sends it back to `PENDING_REVIEW`
(`underReModeration: true`). It is then hidden from the public but stays visible to its owner,
admins and participants (users with an offer or a registration). For requests every field is
material (including adding an image); for tasks the material fields are title, description,
category, region, location, start and end. Participants are notified of what changed.

**Help requests.** Editable by the owner only while `OPEN`. Offers are possible only on
approved, open requests, never on your own, and one active offer per volunteer (also enforced
by a partial unique index). The owner accepts exactly one offer under a row lock (and a partial
unique index): other pending offers are declined, the request becomes `IN_PROGRESS`, and both
sides are notified. Volunteers can withdraw a pending offer. The owner completes an in-progress
request; the owner or an admin can cancel it (pending offers are declined, offerers notified).

**Contact privacy.** The request's address and the requester's email and phone are shown only to
the owner, admins and the volunteer whose offer was accepted. The accepted volunteer's contact
details are shown only to the owner and admins. Public lists never contain them.

**Tasks and registrations.** Registration is automatic (no approval, no pending state) while the
task is approved, open, upcoming and not full. The task row is locked (`SELECT ... FOR UPDATE`)
before counting confirmed registrations, so capacity is never exceeded, even under concurrent
requests (`409 TASK_FULL`). One confirmed registration per user and task (partial unique index);
you cannot register for your own task. Volunteers cancel their own registration before the task
starts; the row is kept as `CANCELLED` and they may register again. Capacity changes need no
re-moderation but never go below the confirmed registrations (`409 CAPACITY_TOO_LOW`). A
schedule or location change keeps registrations, notifies volunteers and blocks new
registrations until an admin re-approves the task. The creator or an admin cancels a task
(volunteers notified) or completes it after it started. Creators and admins see registrants'
name and email, never their availability. No waitlist.

**Availability.** Volunteer availability is visible only to the volunteer and admins.

**Dashboard metrics.** Handled requests rate = completed ÷ published (not cancelled); filled
tasks rate = published, non-cancelled tasks whose places are all taken; time to match = hours
from a request's publication to the accepted offer (average and median). Labelled as computed
from VolunteerHub records.

## Security

- Argon2id password hashing; equal responses and timing for wrong password and unknown email.
- HS256 JWT with issuer `volunteerhub` and short expiry; the user, role and status are loaded
  from the database on every request.
- Zod validation of every body, query and path parameter; unknown fields are rejected on writes.
- Explicit `select` lists: password hashes, emails, phones and availability never appear in
  public responses.
- Helmet headers, CORS allowlist, 100 KB JSON limit, global/auth/write rate limits.
- Uploads: images only, detected from file bytes (the client's type and name are ignored), 5 MB,
  random file names, served only through a permission-checked endpoint with `nosniff`.
- Database CHECK constraints and partial unique indexes back the main rules.
- Generic 500 responses; details go to the server log only. Logs never contain bodies or tokens.

## Known limitations (by design for this version)

- Access tokens cannot be revoked before they expire, except by blocking the account.
- Rate limits are in-memory, suitable for a single server instance.
- Notifications are in-app only (no email or reminders).
- Uploaded files are stored on local disk; production hosting needs a persistent disk.
- Accepted offers cannot be withdrawn by the volunteer; the owner can cancel the request.
- Organizations, coordinators, attendance tracking and waitlists are out of scope.
