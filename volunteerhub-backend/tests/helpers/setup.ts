import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import { createLogger } from '../../src/lib/logger.js';
import { createPrisma, type Db } from '../../src/lib/prisma.js';
import { assertTestDatabase, TEST_DATABASE_URL } from './testDatabase.js';

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    RATE_LIMIT_MAX: '100000',
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
