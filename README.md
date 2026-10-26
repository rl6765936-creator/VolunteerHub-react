# VolunteerHub

A community volunteering platform. Users post help requests, an admin approves or rejects them, and volunteers offer help. The request owner accepts one volunteer and marks the request as completed.

## Repository structure

| Folder | Contents |
| --- | --- |
| [`volunteerhub-backend/`](volunteerhub-backend) | Server: Node.js 22, Express 5, TypeScript, Prisma, PostgreSQL, JWT, Zod, Vitest |
| [`volunteerhub-frontend/`](volunteerhub-frontend) | Client: React 19, TypeScript, Vite, React Router, React Hook Form + Yup, TanStack React Query, Context API |

## Features

- Registration and login with JWT, and two roles with different permissions: regular user and admin (`ADMIN`).
- The main object is a help request. Its fields are title, description, category, region, address, due date and images. Each request has a status (`OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`) and a moderation status (`PENDING_REVIEW`, `APPROVED`, `REJECTED`).
- A list of requests with a status filter and pagination. Users can create requests and edit them.
- "My requests", help offers, and choosing a volunteer.
- An admin screen for approving and rejecting requests, with a rejection reason.
- All data comes from the server and is stored in a PostgreSQL database.

## Running locally

Requirements: Node.js 22 and PostgreSQL.

### Server

```bash
cd volunteerhub-backend
cp .env.example .env      # fill in real values; this file is not committed
npm install
npm run db:deploy         # apply the database migrations
npm run db:seed           # create the default categories and the first admin account
npm run dev               # http://localhost:3001/api
```

The API documentation (Swagger) is at `http://localhost:3001/api/docs`. See the [backend README](volunteerhub-backend/README.md) for more details.

### Client

```bash
cd volunteerhub-frontend
echo "VITE_API_URL=http://localhost:3001/api" > .env
npm install
npm run dev               # http://localhost:5173
```

## Deploying to the cloud (Render)

1. **Database:** create a PostgreSQL instance on Render and copy its Internal Database URL.
2. **Server:** create a Web Service with Root Directory `volunteerhub-backend`.
   - Build: `npm install && npm run build && npm run db:deploy`
   - Start: `npm start`
   - Environment variables: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` (at least 32 characters), `CORS_ORIGINS` (the client URL), `TRUST_PROXY=1`
3. **Client:** create a Static Site with Root Directory `volunteerhub-frontend`.
   - Build: `npm install && npm run build`
   - Publish directory: `dist`
   - Environment variable: `VITE_API_URL=https://<server-url>/api`
   - Rewrite rule: `/*` to `/index.html`, so that React Router routes work.

## Security

`.env` files, `node_modules`, uploaded files and database backups are not committed (see the `.gitignore` files). `.env.example` contains placeholder values only.
