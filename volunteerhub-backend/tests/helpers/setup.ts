import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import type { UserRole } from '../../src/generated/prisma/enums.js';
import { signAccessToken } from '../../src/lib/jwt.js';
import { createLogger } from '../../src/lib/logger.js';
import { hashPassword } from '../../src/lib/password.js';
import { createPrisma, type Db } from '../../src/lib/prisma.js';
import { assertTestDatabase, TEST_DATABASE_URL } from './testDatabase.js';

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
export const TEST_PASSWORD = 'Password123!';

const uploadDir = mkdtempSync(path.join(tmpdir(), 'volunteerhub-test-uploads-'));

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET: TEST_JWT_SECRET,
    RATE_LIMIT_MAX: '100000',
    AUTH_RATE_LIMIT_MAX: '100000',
    WRITE_RATE_LIMIT_MAX: '100000',
    UPLOAD_DIR: uploadDir,
    ...overrides,
  });
}

let prismaSingleton: Db | undefined;

export function testPrisma(): Db {
  assertTestDatabase(TEST_DATABASE_URL);
  prismaSingleton ??= createPrisma(TEST_DATABASE_URL);
  return prismaSingleton;
}

/** Builds an isolated app (fresh rate-limit counters) with test configuration plus overrides. */
export function buildApp(overrides: Record<string, string> = {}): Express {
  return createApp({
    env: testEnv(overrides),
    logger: createLogger('silent'),
    prisma: testPrisma(),
  });
}

const TABLES = [
  'AuditLog',
  'Notification',
  'StatusHistory',
  'MediaAttachment',
  'TaskRegistration',
  'VolunteerTask',
  'HelpOffer',
  'HelpRequest',
  '_CategoryToVolunteerProfile',
  'VolunteerProfile',
  'Category',
  'User',
];

export async function resetDb(): Promise<void> {
  const list = TABLES.map((table) => `"${table}"`).join(', ');
  await testPrisma().$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let passwordHash: Promise<string> | undefined;

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  token: string;
  auth: { Authorization: string };
}

let counter = 0;

export async function createUser(role: UserRole = 'USER', name?: string): Promise<TestUser> {
  counter += 1;
  passwordHash ??= hashPassword(TEST_PASSWORD);
  const user = await testPrisma().user.create({
    data: {
      name: name ?? `${role === 'ADMIN' ? 'Admin' : 'User'} ${counter}`,
      email: `user${counter}-${Date.now()}@example.com`,
      passwordHash: await passwordHash,
      role,
    },
  });
  const token = signAccessToken(user.id, { secret: TEST_JWT_SECRET, expiresInSeconds: 3600 });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    token,
    auth: { Authorization: `Bearer ${token}` },
  };
}
