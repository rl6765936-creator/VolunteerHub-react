import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testPrisma } from './helpers/setup.js';
import { TEST_DATABASE_URL } from './helpers/testDatabase.js';

const run = promisify(execFile);
const seed = (extra: Record<string, string> = {}) =>
  run('npx', ['tsx', 'prisma/seed.ts'], {
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      SEED_ADMIN_EMAIL: 'Admin@Example.com',
      SEED_ADMIN_PASSWORD: 'seed-test-password-123',
      ...extra,
    },
  });

beforeEach(resetDb);

describe('seed', () => {
  it('creates the admin and categories, and is idempotent without overwriting the password', async () => {
    await seed();
    const admin = await testPrisma().user.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
    });
    expect(admin).toMatchObject({ role: 'ADMIN', status: 'ACTIVE', name: 'VolunteerHub Admin' });
    expect(admin.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await testPrisma().category.count()).toBe(8);

    const second = await seed({ SEED_ADMIN_PASSWORD: 'a-different-password-456' });
    expect(second.stdout).toContain('existing');
    const again = await testPrisma().user.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
    });
    expect(again.passwordHash).toBe(admin.passwordHash);
    expect(await testPrisma().category.count()).toBe(8);
  });

  it('refuses a short admin password without printing it', async () => {
    await expect(seed({ SEED_ADMIN_PASSWORD: 'shortpw' })).rejects.toMatchObject({
      stderr: expect.not.stringContaining('shortpw') as unknown,
    });
    expect(await testPrisma().user.count()).toBe(0);
  });
});
