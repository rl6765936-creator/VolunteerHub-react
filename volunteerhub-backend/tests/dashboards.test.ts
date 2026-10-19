import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { weekdayIn } from '../src/modules/matches/matches.service.js';
import {
  buildApp,
  createCategory,
  createHelpRequest,
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
let owner: TestUser;
let volunteer: TestUser;
let categoryId: string;

beforeEach(async () => {
  await resetDb();
  admin = await createUser('ADMIN');
  owner = await createUser('USER', 'Owner');
  volunteer = await createUser('USER', 'Volunteer');
  categoryId = (await createCategory('Elderly')).id;
});

describe('notifications', () => {
  it('lists only my notifications, with unread count, and marks them read', async () => {
    await createHelpRequest(app, owner, categoryId, { approve: admin });
    await createTask(app, owner, categoryId, { approve: admin });

    const mine = await request(app).get('/api/notifications').set(owner.auth);
    expect(mine.status).toBe(200);
    expect(mine.body.meta).toMatchObject({ total: 2, unreadCount: 2 });
    expect(mine.body.data.map((n: { type: string }) => n.type).sort()).toEqual([
      'REQUEST_APPROVED',
      'TASK_APPROVED',
    ]);
    expect((await request(app).get('/api/notifications').set(volunteer.auth)).body.data).toEqual(
      [],
    );

    const first = mine.body.data[0].id as string;
    expect(
      (await request(app).patch(`/api/notifications/${first}/read`).set(volunteer.auth)).status,
    ).toBe(404);
    expect(
      (await request(app).patch(`/api/notifications/${first}/read`).set(owner.auth)).status,
    ).toBe(204);
    const unread = await request(app).get('/api/notifications?unreadOnly=true').set(owner.auth);
    expect(unread.body.meta).toMatchObject({ total: 1, unreadCount: 1 });

    const all = await request(app).post('/api/notifications/read-all').set(owner.auth);
    expect(all.body.data).toEqual({ updated: 1 });
    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });

  it('never notifies users about their own actions', async () => {
    const taskId = await createTask(app, owner, categoryId, { approve: admin });
    await request(app).post(`/api/tasks/${taskId}/registrations`).set(volunteer.auth);
    await request(app).delete(`/api/tasks/${taskId}/registrations/me`).set(volunteer.auth);
    expect(await testPrisma().notification.count({ where: { userId: volunteer.id } })).toBe(0);
  });
});

describe('admin dashboard', () => {
  it('is admin-only', async () => {
    expect((await request(app).get('/api/admin/dashboard')).status).toBe(401);
    expect((await request(app).get('/api/admin/dashboard').set(owner.auth)).status).toBe(403);
  });

  it('computes moderation, activity and success metrics', async () => {
    // Requests: one completed through an accepted offer, one open, one pending, one cancelled.
    const completed = await createHelpRequest(app, owner, categoryId, { approve: admin });
    const offer = await request(app)
      .post(`/api/requests/${completed}/offers`)
      .set(volunteer.auth)
      .send({ message: 'Happy to help.' });
    await request(app)
      .post(`/api/offers/${offer.body.data.id as string}/accept`)
      .set(owner.auth);
    await request(app).post(`/api/requests/${completed}/complete`).set(owner.auth);
    await createHelpRequest(app, owner, categoryId, { approve: admin });
    await createHelpRequest(app, owner, categoryId);
    const cancelled = await createHelpRequest(app, owner, categoryId, { approve: admin });
    await request(app).post(`/api/requests/${cancelled}/cancel`).set(owner.auth).send({});

    // Tasks: one full, one with free places, one pending.
    const full = await createTask(app, owner, categoryId, {
      approve: admin,
      body: { capacity: 1 },
    });
    await request(app).post(`/api/tasks/${full}/registrations`).set(volunteer.auth);
    const open = await createTask(app, owner, categoryId, {
      approve: admin,
      body: { title: 'Needs people' },
    });
    await createTask(app, owner, categoryId);

    const res = await request(app).get('/api/admin/dashboard').set(admin.auth);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.users).toEqual({ total: 3, blocked: 0 });
    expect(data.moderation).toEqual({ pendingRequests: 1, pendingTasks: 1 });
    expect(data.requests).toMatchObject({
      published: 3,
      byStatus: { OPEN: 1, IN_PROGRESS: 0, COMPLETED: 1, CANCELLED: 1 },
      handledRatePercent: 50,
      timeToMatchHours: { sampleSize: 1 },
    });
    expect(data.requests.timeToMatchHours.average).toBeGreaterThanOrEqual(0);
    expect(data.tasks).toMatchObject({
      published: 2,
      filledRatePercent: 50,
      upcomingOpen: 2,
      unfilledUpcoming: { count: 1, next: [{ id: open, spotsLeft: 3 }] },
    });
    expect(data.registrations).toEqual({ CONFIRMED: 1, CANCELLED: 0 });
    expect(data.byCategory).toEqual([{ categoryId, name: 'Elderly', requests: 3, tasks: 2 }]);
    expect(data.topRequestRegions).toEqual([{ region: 'Jerusalem', requests: 3 }]);
  });
});

describe('audit log', () => {
  it('lists admin actions with filters, admin-only', async () => {
    const id = await createHelpRequest(app, owner, categoryId, { approve: admin });
    await request(app)
      .patch(`/api/admin/users/${owner.id}`)
      .set(admin.auth)
      .send({ status: 'BLOCKED' });

    const all = await request(app).get('/api/admin/audit-logs').set(admin.auth);
    expect(all.body.meta.total).toBe(2);
    expect(all.body.data[0]).toMatchObject({
      action: 'USER_STATUS_CHANGED',
      actor: { id: admin.id, name: admin.name },
    });
    const filtered = await request(app).get(`/api/admin/audit-logs?entityId=${id}`).set(admin.auth);
    expect(filtered.body.data).toMatchObject([
      { action: 'REQUEST_APPROVED', entityType: 'HelpRequest' },
    ]);
    expect((await request(app).get('/api/admin/audit-logs').set(volunteer.auth)).status).toBe(403);
  });
});

describe('my dashboard', () => {
  it('summarizes my requests, offers, tasks and upcoming registrations', async () => {
    const requestId = await createHelpRequest(app, owner, categoryId, { approve: admin });
    await request(app)
      .post(`/api/requests/${requestId}/offers`)
      .set(volunteer.auth)
      .send({ message: 'I can help you.' });
    const taskId = await createTask(app, owner, categoryId, { approve: admin });
    await request(app).post(`/api/tasks/${taskId}/registrations`).set(volunteer.auth);

    const mine = await request(app).get('/api/users/me/dashboard').set(volunteer.auth);
    expect(mine.body.data).toMatchObject({
      offers: { PENDING: 1, ACCEPTED: 0 },
      requests: { OPEN: 0 },
      upcomingRegistrations: [{ task: { id: taskId } }],
      unreadNotifications: 0,
    });
    const theirs = await request(app).get('/api/users/me/dashboard').set(owner.auth);
    expect(theirs.body.data).toMatchObject({
      requests: { OPEN: 1 },
      tasksCreated: { OPEN: 1 },
      unreadNotifications: 4,
    });
  });
});

describe('matches', () => {
  it('converts dates to weekdays in the configured time zone', () => {
    // Sunday 22:30 UTC is already Monday 00:30 in Jerusalem (UTC+2 in January).
    expect(weekdayIn(new Date('2030-01-06T22:30:00Z'), 'Asia/Jerusalem')).toBe('MON');
    expect(weekdayIn(new Date('2030-01-06T22:30:00Z'), 'UTC')).toBe('SUN');
  });

  it('reports an incomplete profile instead of guessing', async () => {
    const res = await request(app).get('/api/users/me/matches').set(volunteer.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { tasks: [], requests: [] },
      meta: { profileComplete: false, criteria: null },
    });
  });

  it('matches by region, interests and available weekdays, excluding own, full and joined items', async () => {
    const otherCategory = (await createCategory('Environment')).id;
    const start = futureDate(8, 9);
    const day = weekdayIn(start, 'Asia/Jerusalem');
    const taskBody = (title: string, extra: Record<string, unknown> = {}) => ({
      title,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      ...extra,
    });

    const match = await createTask(app, owner, categoryId, {
      approve: admin,
      body: taskBody('Matching task'),
    });
    await createTask(app, owner, categoryId, {
      approve: admin,
      body: taskBody('Wrong region', { region: 'Eilat' }),
    });
    await createTask(app, owner, otherCategory, {
      approve: admin,
      body: taskBody('Wrong category'),
    });
    const nextDay = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    await createTask(app, owner, categoryId, {
      approve: admin,
      body: {
        title: 'Wrong day',
        startsAt: nextDay.toISOString(),
        endsAt: new Date(nextDay.getTime() + 60 * 60 * 1000).toISOString(),
      },
    });
    const full = await createTask(app, owner, categoryId, {
      approve: admin,
      body: taskBody('Full task', { capacity: 1 }),
    });
    await request(app)
      .post(`/api/tasks/${full}/registrations`)
      .set(await createUser().then((u) => u.auth));
    const joined = await createTask(app, owner, categoryId, {
      approve: admin,
      body: taskBody('Already joined'),
    });
    await request(app).post(`/api/tasks/${joined}/registrations`).set(volunteer.auth);
    await createTask(app, volunteer, categoryId, { approve: admin, body: taskBody('My own task') });
    const past = await createTask(app, owner, categoryId, {
      approve: admin,
      body: taskBody('Past'),
    });
    await moveTaskToPast(past);

    const requestMatch = await createHelpRequest(app, owner, categoryId, { approve: admin });
    await createHelpRequest(app, owner, categoryId, {
      approve: admin,
      body: { region: 'Eilat', title: 'Far away request' },
    });
    await createHelpRequest(app, owner, categoryId, { body: { title: 'Unpublished request' } });

    await request(app)
      .put('/api/users/me/volunteer-profile')
      .set(volunteer.auth)
      .send({ region: 'jerusalem', availableDays: [day], interestCategoryIds: [categoryId] });

    const res = await request(app).get('/api/users/me/matches').set(volunteer.auth);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({
      profileComplete: true,
      criteria: { region: 'jerusalem', availableDays: [day], timeZone: 'Asia/Jerusalem' },
    });
    expect(res.body.data.tasks.map((t: { id: string }) => t.id)).toEqual([match]);
    expect(res.body.data.requests.map((r: { id: string }) => r.id)).toEqual([requestMatch]);
    expect(JSON.stringify(res.body)).not.toContain('Herzl 10');
  });
});
