# VolunteerHub Backend

REST API for VolunteerHub, a community platform where every registered user can request help and
volunteer. Built with Node.js, Express 5, strict TypeScript and Zod. PostgreSQL and Prisma are
added in Phase 2.

> **VolunteerHub is not a substitute for emergency services.** In an emergency, contact the
> relevant emergency number.

## Status

Phase 1 (project foundation): configuration, logging, security middleware, error handling,
health check, OpenAPI docs and tests. Feature endpoints arrive in later phases.

## Requirements

- Node.js 22.12 or newer (LTS), npm 10+

## Setup

```bash
npm install
cp .env.example .env
npm run dev                 # http://localhost:3001
```

- Health: `GET /api/health`
- API docs (Swagger UI): <http://localhost:3001/api/docs>
- OpenAPI JSON: <http://localhost:3001/api/docs/openapi.json>

## Scripts

| Script                                    | Purpose                                      |
| ----------------------------------------- | -------------------------------------------- |
| `npm run dev`                             | Run with auto-reload (reads `.env`)          |
| `npm run build` / `npm start`             | Compile to `dist/` / run the compiled server |
| `npm run check`                           | Typecheck, lint, format check and all tests  |
| `npm run typecheck`                       | Type-check sources and tests                 |
| `npm run lint` / `npm run lint:fix`       | ESLint (type-aware)                          |
| `npm run format` / `npm run format:check` | Prettier                                     |
| `npm test` / `npm run test:watch`         | Vitest + Supertest                           |

## Configuration

All configuration comes from environment variables, validated at startup with Zod. The server
refuses to start on invalid configuration and prints which variables are wrong (never their
values). See `.env.example`.

| Variable           | Default               | Description                                  |
| ------------------ | --------------------- | -------------------------------------------- |
| `NODE_ENV`, `PORT` | `development`, `3001` |                                              |
| `LOG_LEVEL`        | depends on `NODE_ENV` | `debug`, `info`, `warn`, `error` or `silent` |
| `CORS_ORIGINS`     | empty                 | Comma-separated allowed browser origins      |
| `TRUST_PROXY`      | `0`                   | Reverse-proxy hops to trust for client IPs   |
| `RATE_LIMIT_*`     | 300 req / 15 min      | Global per-IP limit (health is exempt)       |

## Project structure

```
src/
  server.ts              process entry: config, HTTP server, graceful shutdown
  app.ts                 builds the Express app (tests import it directly)
  deps.ts                dependencies passed to feature routers
  routes.ts              mounts feature routers under /api
  config/env.ts          environment validation
  docs/                  OpenAPI document and Swagger UI
  lib/                   errors, logger, HTTP helpers, pagination
  middleware/            security (helmet, CORS, rate limit), logging, error handler
  modules/health/        liveness check
tests/                   Supertest and unit tests
```

## API conventions

- Success: `{ "data": ..., "meta"?: ... }`. Lists accept `page` and `pageSize` (max 50) and return
  `meta: { page, pageSize, total, totalPages }`.
- Error: `{ "error": { "code": "STABLE_CODE", "message": "English text", "details"?: ... } }`.
  Clients should depend on `error.code`, not on the message.
- User content may be Hebrew (UTF-8). API messages and documentation are English.
- Resources that are not visible to the caller return `404`, never `403`.
