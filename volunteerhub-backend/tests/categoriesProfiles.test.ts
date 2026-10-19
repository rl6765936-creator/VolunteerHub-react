import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp, createCategory, createUser, resetDb, testPrisma } from './helpers/setup.js';

const app = buildApp();

beforeEach(resetDb);

describe('categories', () => {
  it('lists active categories publicly; admins may include inactive ones', async () => {
    const admin = await createUser('ADMIN');
    const user = await createUser();
    await createCategory('Elderly support');
    const inactive = await createCategory('Old category');
    await testPrisma().category.update({ where: { id: inactive.id }, data: { isActive: false } });

    const publicList = await request(app).get('/api/categories?includeInactive=true');
    expect(publicList.status).toBe(200);
    expect(publicList.body.data.map((c: { name: string }) => c.name)).toEqual(['Elderly support']);

    const asUser = await request(app).get('/api/categories?includeInactive=true').set(user.auth);
    expect(asUser.body.data).toHaveLength(1);
    const asAdmin = await request(app).get('/api/categories?includeInactive=true').set(admin.auth);
    expect(asAdmin.body.data).toHaveLength(2);
  });

  it('lets admins create and update categories with audit entries', async () => {
    const admin = await createUser('ADMIN');
    const created = await request(app)
      .post('/api/admin/categories')
      .set(admin.auth)
      .send({ name: 'סיוע לקשישים', slug: 'Elderly' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'סיוע לקשישים', slug: 'elderly' });

    const duplicate = await request(app)
      .post('/api/admin/categories')
      .set(admin.auth)
      .send({ name: 'Another', slug: 'elderly' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ALREADY_EXISTS');

    const updated = await request(app)
      .patch(`/api/admin/categories/${created.body.data.id as string}`)
      .set(admin.auth)
      .send({ isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body.data.isActive).toBe(false);

    const actions = await testPrisma().auditLog.findMany({ select: { action: true } });
    expect(actions.map((a) => a.action).sort()).toEqual(['CATEGORY_CREATED', 'CATEGORY_UPDATED']);
  });

  it('is admin-only for writes and validates input', async () => {
    const user = await createUser();
    const admin = await createUser('ADMIN');
    expect(
      (
        await request(app)
          .post('/api/admin/categories')
          .set(user.auth)
          .send({ name: 'X', slug: 'x' })
      ).status,
    ).toBe(403);
    const bad = await request(app)
      .post('/api/admin/categories')
      .set(admin.auth)
      .send({ name: 'Bad slug', slug: 'not a slug!' });
    expect(bad.status).toBe(400);
    const missing = await request(app)
      .patch('/api/admin/categories/00000000-0000-4000-8000-000000000000')
      .set(admin.auth)
      .send({ name: 'Whatever' });
    expect(missing.status).toBe(404);
  });
});

describe('volunteer profile', () => {
  it('is null until filled in, then fully replaced by PUT', async () => {
    const user = await createUser();
    const category = await createCategory('Food');

    const empty = await request(app).get('/api/users/me/volunteer-profile').set(user.auth);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toBeNull();

    const saved = await request(app)
      .put('/api/users/me/volunteer-profile')
      .set(user.auth)
      .send({
        bio: 'Retired teacher',
        skills: ['driving', 'cooking', 'driving'],
        region: 'ירושלים',
        availableDays: ['SUN', 'TUE'],
        availabilityNotes: 'Mornings only',
        interestCategoryIds: [category.id],
      });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({
      bio: 'Retired teacher',
      skills: ['driving', 'cooking'],
      region: 'ירושלים',
      availableDays: ['SUN', 'TUE'],
      availabilityNotes: 'Mornings only',
      interests: [{ id: category.id, name: 'Food' }],
    });

    const replaced = await request(app)
      .put('/api/users/me/volunteer-profile')
      .set(user.auth)
      .send({ skills: ['first aid'] });
    expect(replaced.body.data).toMatchObject({
      bio: null,
      skills: ['first aid'],
      availableDays: [],
      interests: [],
    });
  });

  it('validates days, unknown fields and inactive interest categories', async () => {
    const user = await createUser();
    const inactive = await createCategory('Inactive');
    await testPrisma().category.update({ where: { id: inactive.id }, data: { isActive: false } });
    const put = (body: object) =>
      request(app).put('/api/users/me/volunteer-profile').set(user.auth).send(body);

    expect((await put({ availableDays: ['MON', 'MON'] })).status).toBe(400);
    expect((await put({ availableDays: ['FUNDAY'] })).status).toBe(400);
    expect((await put({ userId: user.id })).status).toBe(400);
    expect((await put({ interestCategoryIds: [inactive.id] })).status).toBe(400);
  });

  it('requires authentication and is visible to admins in user details', async () => {
    expect((await request(app).get('/api/users/me/volunteer-profile')).status).toBe(401);
    const user = await createUser();
    const admin = await createUser('ADMIN');
    await request(app)
      .put('/api/users/me/volunteer-profile')
      .set(user.auth)
      .send({ availableDays: ['FRI'], availabilityNotes: 'After 10' });
    const details = await request(app).get(`/api/admin/users/${user.id}`).set(admin.auth);
    expect(details.body.data.volunteerProfile).toMatchObject({
      availableDays: ['FRI'],
      availabilityNotes: 'After 10',
    });
  });
});
