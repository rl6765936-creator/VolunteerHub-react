import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildApp,
  createUser,
  resetDb,
  TEST_JWT_SECRET,
  TEST_PASSWORD,
  testPrisma,
} from './helpers/setup.js';

const app = buildApp();

beforeEach(resetDb);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('VoiceUp frontend auth contract', () => {
  it('register returns { data: { user, accessToken, tokenType, expiresIn } } with status 201', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dana', email: 'dana@example.com', password: 'longenough1' });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body)).toEqual(['data']);
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['accessToken', 'expiresIn', 'tokenType', 'user'].sort(),
    );
    expect(Object.keys(res.body.data.user).sort()).toEqual(
      ['createdAt', 'email', 'id', 'name', 'role', 'updatedAt'].sort(),
    );
    expect(res.body.data).toMatchObject({ tokenType: 'Bearer', expiresIn: 7200 });
    expect(res.body.data.user.createdAt).toMatch(ISO_DATE);
  });

  it('login returns the same shape with status 200', async () => {
    const user = await createUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['accessToken', 'expiresIn', 'tokenType', 'user'].sort(),
    );
    expect(res.body.data.user).toMatchObject({ id: user.id, email: user.email, role: 'USER' });
  });

  it('issues a JWT with sub, iss and exp claims the client can read', async () => {
    const user = await createUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    const payload = jwt.decode(res.body.data.accessToken as string) as jwt.JwtPayload;

    expect(payload.sub).toBe(user.id);
    expect(payload.iss).toBe('volunteerhub');
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(7200);
  });

  it('GET /api/users/me returns { data: User } and 401 without a token', async () => {
    const user = await createUser();
    const me = await request(app).get('/api/users/me').set(user.auth);

    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ id: user.id, name: user.name, email: user.email });
    for (const key of ['id', 'name', 'email', 'role', 'createdAt', 'updatedAt']) {
      expect(me.body.data).toHaveProperty(key);
    }
    const anonymous = await request(app).get('/api/users/me');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication is required.' },
    });
  });

  it('has no refresh or server-side logout endpoints (stateless access tokens)', async () => {
    expect((await request(app).post('/api/auth/refresh')).status).toBe(404);
    expect((await request(app).post('/api/auth/logout')).status).toBe(404);
  });
});

describe('POST /api/auth/register', () => {
  it('creates an ACTIVE USER without leaking the password hash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dana', email: '  Dana@Example.COM ', password: 'longenough1' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      name: 'Dana',
      email: 'dana@example.com',
      role: 'USER',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    const stored = await testPrisma().user.findUniqueOrThrow({
      where: { email: 'dana@example.com' },
    });
    expect(stored.status).toBe('ACTIVE');
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('ignores a role sent in the body', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Eve', email: 'eve@example.com', password: 'longenough1', role: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('USER');
  });

  it('rejects a duplicate email with EMAIL_TAKEN', async () => {
    const body = { name: 'Dana', email: 'dana@example.com', password: 'longenough1' };
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...body, email: 'DANA@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates the input', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'D', email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = (res.body.error.details as { path: string }[]).map((detail) => detail.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('accepts Hebrew names', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'דנה כהן', email: 'dana@example.com', password: 'longenough1' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.name).toBe('דנה כהן');
  });
});

describe('POST /api/auth/login', () => {
  it('gives the same error for a wrong password and an unknown email', async () => {
    const user = await createUser();
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPassword1' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'WrongPassword1' });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('refuses blocked accounts, but only after the correct password', async () => {
    const user = await createUser();
    await testPrisma().user.update({ where: { id: user.id }, data: { status: 'BLOCKED' } });

    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPassword1' });
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

    const right = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(right.status).toBe(403);
    expect(right.body.error.code).toBe('ACCOUNT_BLOCKED');
  });

  it('is rate limited separately from the rest of the API', async () => {
    const limited = buildApp({ AUTH_RATE_LIMIT_MAX: '2' });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(limited).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' });
    }
    const res = await request(limited)
      .post('/api/auth/login')
      .send({ email: 'a@b.co', password: 'x' });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('access tokens', () => {
  it('rejects tampered, expired, foreign-issuer, foreign-secret and unsigned tokens', async () => {
    const user = await createUser();
    const expired = jwt.sign({}, TEST_JWT_SECRET, {
      subject: user.id,
      issuer: 'volunteerhub',
      expiresIn: -10,
    });
    const foreignSecret = jwt.sign({}, 'another-secret-that-is-also-32-characters', {
      subject: user.id,
      issuer: 'volunteerhub',
    });
    const voiceUpToken = jwt.sign({}, TEST_JWT_SECRET, { subject: user.id, issuer: 'voiceup' });
    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: user.id, iss: 'volunteerhub' }),
    ).toString('base64url')}.`;

    for (const token of [
      `${user.token}x`,
      expired,
      foreignSecret,
      voiceUpToken,
      noneAlg,
      'garbage',
    ]) {
      const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    }
  });

  it('stops working when the user no longer exists', async () => {
    const user = await createUser();
    await testPrisma().user.delete({ where: { id: user.id } });
    const res = await request(app).get('/api/users/me').set(user.auth);
    expect(res.status).toBe(401);
  });

  it('stops working immediately when the account is blocked', async () => {
    const user = await createUser();
    await testPrisma().user.update({ where: { id: user.id }, data: { status: 'BLOCKED' } });
    const res = await request(app).get('/api/users/me').set(user.auth);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_BLOCKED');
  });

  it('applies role changes immediately, without a new token', async () => {
    const admin = await createUser('ADMIN');
    const user = await createUser();
    expect((await request(app).get('/api/admin/users').set(user.auth)).status).toBe(403);

    await request(app).patch(`/api/admin/users/${user.id}`).set(admin.auth).send({ role: 'ADMIN' });
    expect((await request(app).get('/api/admin/users').set(user.auth)).status).toBe(200);
  });
});

describe('current user', () => {
  it('updates the display name and phone, but never role or email', async () => {
    const user = await createUser();
    const res = await request(app)
      .patch('/api/users/me')
      .set(user.auth)
      .send({ name: 'New Name', phone: '+972 50-123-4567' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'New Name', phone: '+972 50-123-4567' });

    const cleared = await request(app).patch('/api/users/me').set(user.auth).send({ phone: null });
    expect(cleared.body.data.phone).toBeNull();

    for (const body of [{ role: 'ADMIN' }, { email: 'x@example.com' }, {}, { phone: 'abc' }]) {
      const rejected = await request(app).patch('/api/users/me').set(user.auth).send(body);
      expect(rejected.status).toBe(400);
    }
  });

  it('changes the password after checking the current one', async () => {
    const user = await createUser();
    const wrong = await request(app)
      .post('/api/users/me/password')
      .set(user.auth)
      .send({ currentPassword: 'nope', newPassword: 'BrandNewPass1' });
    expect(wrong.status).toBe(401);

    const ok = await request(app)
      .post('/api/users/me/password')
      .set(user.auth)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'BrandNewPass1' });
    expect(ok.status).toBe(204);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'BrandNewPass1' });
    expect(login.status).toBe(200);
  });
});

describe('admin user management', () => {
  it('is admin-only', async () => {
    const user = await createUser();
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    expect((await request(app).get('/api/admin/users').set(user.auth)).status).toBe(403);
  });

  it('lists users without password hashes and filters by role and status', async () => {
    const admin = await createUser('ADMIN');
    const blocked = await createUser();
    await createUser();
    await testPrisma().user.update({ where: { id: blocked.id }, data: { status: 'BLOCKED' } });

    const users = await request(app).get('/api/admin/users?role=USER').set(admin.auth);
    expect(users.status).toBe(200);
    expect(users.body.meta.total).toBe(2);
    expect(JSON.stringify(users.body)).not.toContain('passwordHash');

    const onlyBlocked = await request(app).get('/api/admin/users?status=BLOCKED').set(admin.auth);
    expect(onlyBlocked.body.data.map((u: { id: string }) => u.id)).toEqual([blocked.id]);
  });

  it('changes roles and blocks users with audit entries, but never your own account', async () => {
    const admin = await createUser('ADMIN');
    const user = await createUser();

    const self = await request(app)
      .patch(`/api/admin/users/${admin.id}`)
      .set(admin.auth)
      .send({ status: 'BLOCKED' });
    expect(self.status).toBe(409);

    const res = await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set(admin.auth)
      .send({ status: 'BLOCKED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('BLOCKED');
    expect((await request(app).get('/api/users/me').set(user.auth)).status).toBe(403);

    const audit = await testPrisma().auditLog.findFirst({
      where: { action: 'USER_STATUS_CHANGED' },
    });
    expect(audit).toMatchObject({
      actorId: admin.id,
      entityId: user.id,
      metadata: { from: 'ACTIVE', to: 'BLOCKED' },
    });

    await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set(admin.auth)
      .send({ status: 'ACTIVE' });
    expect((await request(app).get('/api/users/me').set(user.auth)).status).toBe(200);
  });

  it('returns 400 for a malformed id and 404 for an unknown one', async () => {
    const admin = await createUser('ADMIN');
    expect((await request(app).get('/api/admin/users/not-a-uuid').set(admin.auth)).status).toBe(
      400,
    );
    expect(
      (
        await request(app)
          .get('/api/admin/users/00000000-0000-4000-8000-000000000000')
          .set(admin.auth)
      ).status,
    ).toBe(404);
  });
});
