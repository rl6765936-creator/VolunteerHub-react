import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildApp,
  createCategory,
  futureDate,
  moveTaskToPast,
  resetDb,
  testPrisma,
} from './helpers/setup.js';

const app = buildApp();

beforeEach(resetDb);

async function signUp(name: string, email: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password: 'Str0ngPassword!' });
  expect(res.status).toBe(201);
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'Str0ngPassword!' });
  expect(login.status).toBe(200);
  return {
    id: login.body.data.user.id as string,
    auth: { Authorization: `Bearer ${login.body.data.accessToken as string}` },
  };
}

describe('end-to-end workflows', () => {
  it('help request: create → admin approves → volunteer offers → owner accepts → completed', async () => {
    const categoryId = (await createCategory('Shopping')).id;
    const citizen = await signUp('Citizen', 'citizen@example.com');
    const helper = await signUp('Helper', 'helper@example.com');
    const adminUser = await signUp('Admin', 'admin@example.com');
    await testPrisma().user.update({ where: { id: adminUser.id }, data: { role: 'ADMIN' } });

    const created = await request(app).post('/api/requests').set(citizen.auth).send({
      title: 'Pharmacy pickup',
      description: 'Picking up medicine from the pharmacy on Ben Yehuda.',
      categoryId,
      region: 'Tel Aviv',
      addressDetails: 'Dizengoff 100',
    });
    const requestId = created.body.data.id as string;
    expect((await request(app).get('/api/requests')).body.meta.total).toBe(0);

    const queue = await request(app)
      .get('/api/admin/requests?moderationStatus=PENDING_REVIEW')
      .set(adminUser.auth);
    expect(queue.body.data.map((r: { id: string }) => r.id)).toEqual([requestId]);
    await request(app)
      .post(`/api/admin/requests/${requestId}/approve`)
      .set(adminUser.auth)
      .send({});

    const found = await request(app).get('/api/requests?q=pharmacy&region=tel');
    expect(found.body.data.map((r: { id: string }) => r.id)).toEqual([requestId]);
    const offer = await request(app)
      .post(`/api/requests/${requestId}/offers`)
      .set(helper.auth)
      .send({ message: 'I live nearby and can go today.' });
    expect(offer.status).toBe(201);

    const ownerNotifications = await request(app).get('/api/notifications').set(citizen.auth);
    expect(ownerNotifications.body.data.map((n: { type: string }) => n.type)).toContain(
      'OFFER_RECEIVED',
    );
    expect(
      (await request(app).get(`/api/requests/${requestId}`).set(helper.auth)).body.data
        .privateDetails,
    ).toBeNull();

    const accepted = await request(app)
      .post(`/api/offers/${offer.body.data.id as string}/accept`)
      .set(citizen.auth);
    expect(accepted.status).toBe(200);
    const helperView = await request(app).get(`/api/requests/${requestId}`).set(helper.auth);
    expect(helperView.body.data.privateDetails.addressDetails).toBe('Dizengoff 100');

    const done = await request(app).post(`/api/requests/${requestId}/complete`).set(citizen.auth);
    expect(done.body.data.status).toBe('COMPLETED');
    const dashboard = await request(app).get('/api/admin/dashboard').set(adminUser.auth);
    expect(dashboard.body.data.requests).toMatchObject({ handledRatePercent: 100 });
    expect(dashboard.body.data.requests.timeToMatchHours.sampleSize).toBe(1);
  });

  it('volunteer task: create → approve → fill capacity → over-capacity blocked → edit → re-approve → complete', async () => {
    const categoryId = (await createCategory('Food')).id;
    const creator = await signUp('Creator', 'creator@example.com');
    const adminUser = await signUp('Admin', 'admin@example.com');
    await testPrisma().user.update({ where: { id: adminUser.id }, data: { role: 'ADMIN' } });
    const volunteers = await Promise.all(
      ['a', 'b', 'c'].map((letter) => signUp(`Volunteer ${letter}`, `${letter}@example.com`)),
    );

    const created = await request(app)
      .post('/api/tasks')
      .set(creator.auth)
      .send({
        title: 'Holiday food packing',
        description: 'Packing 200 food boxes for families.',
        categoryId,
        region: 'Haifa',
        location: 'Hadar community center',
        startsAt: futureDate(5, 7).toISOString(),
        endsAt: futureDate(5, 11).toISOString(),
        capacity: 2,
      });
    const taskId = created.body.data.id as string;
    await request(app).post(`/api/admin/tasks/${taskId}/approve`).set(adminUser.auth).send({});

    const [first, second, third] = volunteers;
    if (!first || !second || !third) throw new Error('volunteers missing');
    expect(
      (await request(app).post(`/api/tasks/${taskId}/registrations`).set(first.auth)).status,
    ).toBe(201);
    expect(
      (await request(app).post(`/api/tasks/${taskId}/registrations`).set(second.auth)).status,
    ).toBe(201);
    const blocked = await request(app).post(`/api/tasks/${taskId}/registrations`).set(third.auth);
    expect(blocked.body.error.code).toBe('TASK_FULL');

    await request(app).delete(`/api/tasks/${taskId}/registrations/me`).set(second.auth);
    expect(
      (await request(app).post(`/api/tasks/${taskId}/registrations`).set(third.auth)).status,
    ).toBe(201);

    const edited = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(creator.auth)
      .send({ startsAt: futureDate(6, 7).toISOString(), endsAt: futureDate(6, 11).toISOString() });
    expect(edited.body.meta.reModeration).toBe(true);
    const thirdNotifications = await request(app).get('/api/notifications').set(third.auth);
    expect(thirdNotifications.body.data[0].type).toBe('TASK_UPDATED');
    await request(app).post(`/api/admin/tasks/${taskId}/approve`).set(adminUser.auth).send({});

    const registrations = await request(app)
      .get(`/api/tasks/${taskId}/registrations?status=CONFIRMED`)
      .set(creator.auth);
    expect(registrations.body.data.map((r: { user: { id: string } }) => r.user.id).sort()).toEqual(
      [first.id, third.id].sort(),
    );

    await moveTaskToPast(taskId);
    const completed = await request(app).post(`/api/tasks/${taskId}/complete`).set(creator.auth);
    expect(completed.body.data.status).toBe('COMPLETED');
    const dashboard = await request(app).get('/api/admin/dashboard').set(adminUser.auth);
    expect(dashboard.body.data.tasks).toMatchObject({ published: 1, byStatus: { COMPLETED: 1 } });
    const mine = await request(app).get('/api/users/me/registrations').set(first.auth);
    expect(mine.body.data[0].task.status).toBe('COMPLETED');
  });
});
