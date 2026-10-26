import type { Express } from 'express';
import request from 'supertest';
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

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_SECRET: TEST_JWT_SECRET,
    RATE_LIMIT_MAX: '100000',
    AUTH_RATE_LIMIT_MAX: '100000',
    WRITE_RATE_LIMIT_MAX: '100000',
    ...overrides,
  });
}

let prismaSingleton: Db | undefined;

export function testPrisma(): Db {
  assertTestDatabase(TEST_DATABASE_URL);
  prismaSingleton ??= createPrisma(TEST_DATABASE_URL);
  return prismaSingleton;
}

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

let categoryCounter = 0;

export async function createCategory(name?: string) {
  categoryCounter += 1;
  return testPrisma().category.create({
    data: { name: name ?? `Category ${categoryCounter}`, slug: `category-${categoryCounter}` },
  });
}

export const futureDate = (days = 7, hour = 9) => {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};

export interface RequestOptions {
  approve?: TestUser;
  body?: Record<string, unknown>;
}

export async function createHelpRequest(
  app: Express,
  owner: TestUser,
  categoryId: string,
  options: RequestOptions = {},
): Promise<string> {
  const res = await request(app)
    .post('/api/requests')
    .set(owner.auth)
    .send({
      title: 'Groceries for an elderly neighbour',
      description: 'Weekly shopping for a neighbour who cannot leave home.',
      categoryId,
      region: 'Jerusalem',
      addressDetails: 'Herzl 10, apartment 4',
      ...options.body,
    });
  if (res.status !== 201) {
    throw new Error(`createHelpRequest failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const id = res.body.data.id as string;
  if (options.approve) {
    const approved = await request(app)
      .post(`/api/admin/requests/${id}/approve`)
      .set(options.approve.auth)
      .send({});
    if (approved.status !== 200) throw new Error(`approve failed: ${approved.status}`);
  }
  return id;
}

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export interface TaskOptions {
  approve?: TestUser;
  body?: Record<string, unknown>;
}

export async function createTask(
  app: Express,
  creator: TestUser,
  categoryId: string,
  options: TaskOptions = {},
): Promise<string> {
  const res = await request(app)
    .post('/api/tasks')
    .set(creator.auth)
    .send({
      title: 'Food bank packing',
      description: 'Packing food boxes for families before the holiday.',
      categoryId,
      region: 'Jerusalem',
      location: 'Community center, Jaffa St 1',
      startsAt: futureDate(7, 8).toISOString(),
      endsAt: futureDate(7, 12).toISOString(),
      capacity: 3,
      ...options.body,
    });
  if (res.status !== 201) {
    throw new Error(`createTask failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const id = res.body.data.id as string;
  if (options.approve) {
    const approved = await request(app)
      .post(`/api/admin/tasks/${id}/approve`)
      .set(options.approve.auth)
      .send({});
    if (approved.status !== 200) throw new Error(`approve task failed: ${approved.status}`);
  }
  return id;
}

export async function moveTaskToPast(taskId: string): Promise<void> {
  await testPrisma().volunteerTask.update({
    where: { id: taskId },
    data: {
      startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() - 60 * 60 * 1000),
    },
  });
}
