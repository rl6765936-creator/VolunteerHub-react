import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildApp,
  createCategory,
  createTask,
  createUser,
  futureDate,
  moveTaskToPast,
  resetDb,
  testPrisma,
  type TestUser,
} from './helpers/setup.js';

const app = buildApp();

let admin: TestUser;
let creator: TestUser;
let volunteer: TestUser;
let categoryId: string;

beforeEach(async () => {
  await resetDb();
  admin = await createUser('ADMIN');
  creator = await createUser('USER', 'Task Creator');
  volunteer = await createUser('USER', 'Volunteer');
  categoryId = (await createCategory('Food')).id;
});

const get = (id: string, user?: TestUser) => {
  const req = request(app).get(`/api/tasks/${id}`);
  return user ? req.set(user.auth) : req;
};
const registerAs = (id: string, user: TestUser) =>
  request(app).post(`/api/tasks/${id}/registrations`).set(user.auth);
const cancelAs = (id: string, user: TestUser) =>
  request(app).delete(`/api/tasks/${id}/registrations/me`).set(user.auth);
const patch = (id: string, user: TestUser, body: object) =>
  request(app).patch(`/api/tasks/${id}`).set(user.auth).send(body);

describe('creating tasks', () => {
  it('lets any user create a task, which is hidden until an admin approves it', async () => {
    const id = await createTask(app, creator, categoryId);

    const own = await get(id, creator);
    expect(own.body.data).toMatchObject({
      moderationStatus: 'PENDING_REVIEW',
      status: 'OPEN',
      capacity: 3,
      registeredCount: 0,
      spotsLeft: 3,
      registrationOpen: false,
      createdBy: { id: creator.id, name: 'Task Creator' },
    });
    expect((await get(id)).status).toBe(404);
    expect((await get(id, volunteer)).status).toBe(404);
    expect((await request(app).get('/api/tasks')).body.data).toHaveLength(0);
    expect((await registerAs(id, volunteer)).status).toBe(404);

    await request(app).post(`/api/admin/tasks/${id}/approve`).set(admin.auth).send({});
    const published = await get(id);
    expect(published.status).toBe(200);
    expect(published.body.data).toMatchObject({
      moderationStatus: 'APPROVED',
      registrationOpen: true,
    });
    expect((await request(app).get('/api/tasks')).body.data).toHaveLength(1);
    expect(
      await testPrisma().notification.findFirst({ where: { type: 'TASK_APPROVED' } }),
    ).toMatchObject({ userId: creator.id, entityType: 'VolunteerTask', entityId: id });
  });

  it('validates the schedule, capacity and fields', async () => {
    const base = {
      title: 'Beach cleanup',
      description: 'Cleaning the beach after the weekend.',
      categoryId,
      region: 'Tel Aviv',
      location: 'Gordon beach',
      startsAt: futureDate(2, 7).toISOString(),
      endsAt: futureDate(2, 9).toISOString(),
      capacity: 10,
    };
    expect((await request(app).post('/api/tasks').send(base)).status).toBe(401);
    for (const body of [
      { ...base, endsAt: futureDate(2, 6).toISOString() },
      { ...base, startsAt: new Date(Date.now() - 60_000).toISOString() },
      { ...base, capacity: 0 },
      { ...base, capacity: 1001 },
      { ...base, capacity: 2.5 },
      { ...base, createdById: volunteer.id },
      { ...base, organizationId: categoryId },
    ]) {
      const res = await request(app).post('/api/tasks').set(creator.auth).send(body);
      expect(res.status).toBe(400);
    }
  });

  it('lets admins reject with a reason and lists the queue', async () => {
    const id = await createTask(app, creator, categoryId);
    expect(
      (await request(app).post(`/api/admin/tasks/${id}/approve`).set(creator.auth).send({})).status,
    ).toBe(403);
    await request(app)
      .post(`/api/admin/tasks/${id}/reject`)
      .set(admin.auth)
      .send({ reason: 'Please add the exact meeting point.' });
    expect((await get(id, creator)).body.data).toMatchObject({
      moderationStatus: 'REJECTED',
      rejectionReason: 'Please add the exact meeting point.',
    });
    const queue = await request(app)
      .get('/api/admin/tasks?moderationStatus=REJECTED')
      .set(admin.auth);
    expect(queue.body.meta.total).toBe(1);
    expect(
      await testPrisma().auditLog.findFirst({ where: { action: 'TASK_REJECTED' } }),
    ).toMatchObject({ actorId: admin.id, entityId: id });
  });
});

describe('automatic registration', () => {
  it('registers immediately as CONFIRMED and notifies the creator', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    const res = await registerAs(id, volunteer);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ taskId: id, status: 'CONFIRMED', cancelledAt: null });
    expect((await get(id, volunteer)).body.data).toMatchObject({
      registeredCount: 1,
      spotsLeft: 2,
      viewer: { isOwner: false, myRegistration: { status: 'CONFIRMED' } },
    });
    expect(
      await testPrisma().notification.findFirst({ where: { type: 'REGISTRATION_CREATED' } }),
    ).toMatchObject({ userId: creator.id });
  });

  it('prevents registering for your own task and duplicate registrations', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    expect((await registerAs(id, creator)).status).toBe(403);
    expect((await registerAs(id, volunteer)).status).toBe(201);
    const again = await registerAs(id, volunteer);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_EXISTS');
    expect((await request(app).post(`/api/tasks/${id}/registrations`)).status).toBe(401);
  });

  it('never registers the same user twice, even concurrently', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => registerAs(id, volunteer)));
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(await testPrisma().taskRegistration.count({ where: { taskId: id } })).toBe(1);
  });

  it('blocks registration when the task is full', async () => {
    const id = await createTask(app, creator, categoryId, {
      approve: admin,
      body: { capacity: 1 },
    });
    expect((await registerAs(id, volunteer)).status).toBe(201);
    const late = await registerAs(id, await createUser());
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('TASK_FULL');
    expect((await get(id)).body.data).toMatchObject({ spotsLeft: 0, registrationOpen: false });
  });

  it('gives the last place to exactly one of many simultaneous volunteers', async () => {
    const id = await createTask(app, creator, categoryId, {
      approve: admin,
      body: { capacity: 3 },
    });
    // Two places are taken; eight volunteers race for the last one.
    await registerAs(id, volunteer);
    await registerAs(id, await createUser());
    const racers = await Promise.all(Array.from({ length: 8 }, () => createUser()));

    const results = await Promise.all(racers.map((user) => registerAs(id, user)));
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    const rejected = results.filter((res) => res.status === 409);
    expect(rejected).toHaveLength(7);
    expect(rejected.every((res) => res.body.error.code === 'TASK_FULL')).toBe(true);
    expect(
      await testPrisma().taskRegistration.count({ where: { taskId: id, status: 'CONFIRMED' } }),
    ).toBe(3);
  });

  it('never exceeds capacity when every place is contested at once', async () => {
    const id = await createTask(app, creator, categoryId, {
      approve: admin,
      body: { capacity: 5 },
    });
    const racers = await Promise.all(Array.from({ length: 15 }, () => createUser()));
    const results = await Promise.all(racers.map((user) => registerAs(id, user)));
    expect(results.filter((res) => res.status === 201)).toHaveLength(5);
    expect(
      await testPrisma().taskRegistration.count({ where: { taskId: id, status: 'CONFIRMED' } }),
    ).toBe(5);
  });

  it('refuses registration for tasks that started, were cancelled or are under review', async () => {
    const started = await createTask(app, creator, categoryId, { approve: admin });
    await moveTaskToPast(started);
    expect((await registerAs(started, volunteer)).status).toBe(409);

    const cancelled = await createTask(app, creator, categoryId, { approve: admin });
    await request(app).post(`/api/tasks/${cancelled}/cancel`).set(creator.auth).send({});
    expect((await registerAs(cancelled, volunteer)).status).toBe(409);

    const edited = await createTask(app, creator, categoryId, { approve: admin });
    await patch(edited, creator, { title: 'Food bank packing and delivery' });
    expect((await registerAs(edited, volunteer)).status).toBe(404);
  });
});

describe('cancelling a registration', () => {
  it('keeps the history, frees the place and allows registering again', async () => {
    const id = await createTask(app, creator, categoryId, {
      approve: admin,
      body: { capacity: 1 },
    });
    await registerAs(id, volunteer);

    const res = await cancelAs(id, volunteer);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.cancelledAt).not.toBeNull();
    expect((await get(id)).body.data.spotsLeft).toBe(1);
    expect(
      await testPrisma().notification.findFirst({ where: { type: 'REGISTRATION_CANCELLED' } }),
    ).toMatchObject({ userId: creator.id });

    expect((await cancelAs(id, volunteer)).status).toBe(404);
    expect((await registerAs(id, volunteer)).status).toBe(201);
    const rows = await testPrisma().taskRegistration.findMany({
      where: { taskId: id, userId: volunteer.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((row) => row.status)).toEqual(['CANCELLED', 'CONFIRMED']);
  });

  it('is not possible after the task starts', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    await registerAs(id, volunteer);
    await moveTaskToPast(id);
    const res = await cancelAs(id, volunteer);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });
});

describe('viewing registrations', () => {
  it('shows registrants (name and email, never availability) to the creator and admins only', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    await request(app)
      .put('/api/users/me/volunteer-profile')
      .set(volunteer.auth)
      .send({ availableDays: ['SUN'], availabilityNotes: 'Private schedule' });
    await registerAs(id, volunteer);

    const res = await request(app).get(`/api/tasks/${id}/registrations`).set(creator.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: expect.any(String) as unknown,
        status: 'CONFIRMED',
        createdAt: expect.any(String) as unknown,
        cancelledAt: null,
        user: { id: volunteer.id, name: 'Volunteer', email: volunteer.email },
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain('Private schedule');
    expect((await request(app).get(`/api/tasks/${id}/registrations`).set(admin.auth)).status).toBe(
      200,
    );
    expect(
      (await request(app).get(`/api/tasks/${id}/registrations`).set(volunteer.auth)).status,
    ).toBe(403);
    expect(JSON.stringify((await get(id)).body)).not.toContain(volunteer.email);
  });

  it('lists my registrations and my created tasks', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    await registerAs(id, volunteer);
    const mine = await request(app).get('/api/users/me/registrations').set(volunteer.auth);
    expect(mine.body.data).toMatchObject([
      { status: 'CONFIRMED', task: { id, title: 'Food bank packing', status: 'OPEN' } },
    ]);
    const created = await request(app).get('/api/users/me/tasks').set(creator.auth);
    expect(created.body.data).toMatchObject([{ id, registeredCount: 1 }]);
    expect((await request(app).get('/api/users/me/registrations')).status).toBe(401);
  });
});

describe('editing tasks', () => {
  it('lets only the creator edit (403 for other viewers, 404 when hidden)', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    const hidden = await createTask(app, creator, categoryId);
    expect((await patch(id, volunteer, { title: 'Hijacked task' })).status).toBe(403);
    expect((await patch(id, admin, { title: 'Hijacked task' })).status).toBe(403);
    expect((await patch(hidden, volunteer, { title: 'Hijacked task' })).status).toBe(404);
    expect((await get(id)).body.data.title).toBe('Food bank packing');
  });

  it('never lowers capacity below the confirmed registrations, and needs no re-moderation', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    await registerAs(id, volunteer);
    await registerAs(id, await createUser());

    const tooLow = await patch(id, creator, { capacity: 1 });
    expect(tooLow.status).toBe(409);
    expect(tooLow.body.error).toMatchObject({
      code: 'CAPACITY_TOO_LOW',
      details: { confirmedRegistrations: 2 },
    });

    const ok = await patch(id, creator, { capacity: 2 });
    expect(ok.status).toBe(200);
    expect(ok.body.meta).toEqual({ changedFields: ['capacity'], reModeration: false });
    expect(ok.body.data).toMatchObject({ capacity: 2, moderationStatus: 'APPROVED', spotsLeft: 0 });
  });

  it('serializes capacity reduction against concurrent registrations', async () => {
    const id = await createTask(app, creator, categoryId, {
      approve: admin,
      body: { capacity: 10 },
    });
    await registerAs(id, volunteer);
    const racers = await Promise.all(Array.from({ length: 6 }, () => createUser()));

    const [shrink, ...registrations] = await Promise.all([
      patch(id, creator, { capacity: 3 }),
      ...racers.map((user) => registerAs(id, user)),
    ]);
    const confirmed = await testPrisma().taskRegistration.count({
      where: { taskId: id, status: 'CONFIRMED' },
    });
    const task = await testPrisma().volunteerTask.findUniqueOrThrow({ where: { id } });
    // Whatever the interleaving, the invariant holds.
    expect(confirmed).toBeLessThanOrEqual(task.capacity);
    expect(confirmed).toBe(1 + registrations.filter((res) => res.status === 201).length);
    if (shrink?.status === 200) expect(task.capacity).toBe(3);
    else expect(shrink?.body.error.code).toBe('CAPACITY_TOO_LOW');
  });

  it('sends a material edit back to moderation, keeping registrations and notifying volunteers', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    await registerAs(id, volunteer);

    const res = await patch(id, creator, { location: 'New hall, Herzl St 5' });
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ changedFields: ['location'], reModeration: true });
    expect(res.body.data).toMatchObject({
      moderationStatus: 'PENDING_REVIEW',
      underReModeration: true,
      registeredCount: 1,
      registrationOpen: false,
    });

    // Hidden publicly, still visible to the registered volunteer.
    expect((await get(id)).status).toBe(404);
    expect((await get(id, volunteer)).body.data.viewer.myRegistration.status).toBe('CONFIRMED');
    const notification = await testPrisma().notification.findFirst({
      where: { userId: volunteer.id, type: 'TASK_UPDATED' },
    });
    expect(notification?.message).toContain('location');
    expect((await registerAs(id, await createUser())).status).toBe(404);
  });

  it('keeps registrations and notifies volunteers when the schedule changes', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    await registerAs(id, volunteer);
    const startsAt = futureDate(9, 10);
    const endsAt = futureDate(9, 14);

    const res = await patch(id, creator, {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    });
    expect(res.body.meta.changedFields).toEqual(['startsAt', 'endsAt']);
    expect(
      await testPrisma().taskRegistration.count({ where: { taskId: id, status: 'CONFIRMED' } }),
    ).toBe(1);
    const notification = await testPrisma().notification.findFirst({
      where: { userId: volunteer.id, type: 'TASK_UPDATED' },
    });
    expect(notification?.message).toContain('start time');
    expect(notification?.message).toContain('Your registration is kept');

    // New registrations stay blocked until an admin re-approves the task.
    const newcomer = await createUser();
    expect((await registerAs(id, newcomer)).status).toBe(404);
    await request(app).post(`/api/admin/tasks/${id}/approve`).set(admin.auth).send({});
    expect((await registerAs(id, newcomer)).status).toBe(201);
    const stored = await testPrisma().volunteerTask.findUniqueOrThrow({ where: { id } });
    expect(stored.startsAt.toISOString()).toBe(startsAt.toISOString());
  });

  it('validates a schedule change against the existing times', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    const res = await patch(id, creator, { endsAt: futureDate(7, 6).toISOString() });
    expect(res.status).toBe(400);
  });

  it('is not possible once the task started or closed', async () => {
    const started = await createTask(app, creator, categoryId, { approve: admin });
    await moveTaskToPast(started);
    expect((await patch(started, creator, { capacity: 5 })).status).toBe(409);
  });
});

describe('cancelling and completing tasks', () => {
  it('notifies registered volunteers on cancellation and records history', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    await registerAs(id, volunteer);
    expect(
      (await request(app).post(`/api/tasks/${id}/cancel`).set(volunteer.auth).send({})).status,
    ).toBe(403);

    const res = await request(app)
      .post(`/api/tasks/${id}/cancel`)
      .set(creator.auth)
      .send({ reason: 'The hall is unavailable' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'The hall is unavailable',
    });

    const notification = await testPrisma().notification.findFirst({
      where: { userId: volunteer.id, type: 'TASK_CANCELLED' },
    });
    expect(notification?.message).toContain('The hall is unavailable');
    // The registration row is preserved as history.
    expect(await testPrisma().taskRegistration.count({ where: { taskId: id } })).toBe(1);

    const history = await request(app).get(`/api/tasks/${id}/history`).set(creator.auth);
    expect(
      (history.body.data as { entityType: string; toStatus: string }[]).map(
        (h) => `${h.entityType}:${h.toStatus}`,
      ),
    ).toEqual([
      'VOLUNTEER_TASK:PENDING_REVIEW',
      'VOLUNTEER_TASK:APPROVED',
      'TASK_REGISTRATION:CONFIRMED',
      'VOLUNTEER_TASK:CANCELLED',
    ]);
    expect((await request(app).get(`/api/tasks/${id}/history`).set(volunteer.auth)).status).toBe(
      403,
    );
    expect(
      (await request(app).post(`/api/tasks/${id}/cancel`).set(creator.auth).send({})).status,
    ).toBe(409);
  });

  it('lets admins cancel with an audit entry and notifies the creator', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    await request(app).post(`/api/tasks/${id}/cancel`).set(admin.auth).send({ reason: 'Unsafe' });
    expect(
      await testPrisma().auditLog.findFirst({ where: { action: 'TASK_CANCELLED' } }),
    ).toMatchObject({ actorId: admin.id, entityId: id });
    expect(
      await testPrisma().notification.findFirst({
        where: { userId: creator.id, type: 'TASK_CANCELLED' },
      }),
    ).not.toBeNull();
  });

  it('completes a task only after it started, notifying volunteers', async () => {
    const id = await createTask(app, creator, categoryId, { approve: admin });
    await registerAs(id, volunteer);
    const early = await request(app).post(`/api/tasks/${id}/complete`).set(creator.auth);
    expect(early.status).toBe(409);

    await moveTaskToPast(id);
    const res = await request(app).post(`/api/tasks/${id}/complete`).set(creator.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(
      await testPrisma().notification.findFirst({
        where: { userId: volunteer.id, type: 'TASK_COMPLETED' },
      }),
    ).not.toBeNull();
  });
});

describe('search and filters', () => {
  it('filters published upcoming tasks by text, category, region, dates and free places', async () => {
    const other = (await createCategory('Environment')).id;
    const a = await createTask(app, creator, categoryId, {
      approve: admin,
      body: { title: 'Soup kitchen', capacity: 1 },
    });
    const b = await createTask(app, creator, other, {
      approve: admin,
      body: {
        title: 'Tree planting',
        region: 'Galilee',
        startsAt: futureDate(20, 8).toISOString(),
        endsAt: futureDate(20, 11).toISOString(),
      },
    });
    const past = await createTask(app, creator, categoryId, {
      approve: admin,
      body: { title: 'Past' },
    });
    await moveTaskToPast(past);
    await createTask(app, creator, categoryId, { body: { title: 'Pending task' } });
    await registerAs(a, volunteer);

    const ids = async (query: string) =>
      ((await request(app).get(`/api/tasks?${query}`)).body.data as { id: string }[]).map(
        (t) => t.id,
      );
    expect(await ids('')).toEqual([a, b]);
    expect(await ids('q=tree')).toEqual([b]);
    expect(await ids(`categoryId=${other}`)).toEqual([b]);
    expect(await ids('region=galil')).toEqual([b]);
    expect(await ids(`from=${futureDate(10).toISOString()}`)).toEqual([b]);
    expect(await ids(`to=${futureDate(10).toISOString()}`)).toEqual([a]);
    expect(await ids('availableOnly=true')).toEqual([b]);
    expect(await ids('includePast=true')).toEqual([past, a, b]);
    expect(await ids('sort=newest&pageSize=1')).toHaveLength(1);
  });
});
