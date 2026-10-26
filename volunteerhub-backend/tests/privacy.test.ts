import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildApp,
  createCategory,
  createHelpRequest,
  createTask,
  createUser,
  PNG,
  resetDb,
  testPrisma,
  type TestUser,
} from './helpers/setup.js';

const app = buildApp();

const SECRETS = {
  ownerPhone: '052-7777777',
  volunteerPhone: '053-8888888',
  address: 'Secret Street 42',
  availability: 'Only Tuesday evenings',
};

let stranger: TestUser;
let owner: TestUser;
let volunteer: TestUser;
let requestId: string;
let taskId: string;
let pendingRequestId: string;

beforeEach(async () => {
  await resetDb();
  const admin = await createUser('ADMIN');
  owner = await createUser('USER', 'Owner');
  volunteer = await createUser('USER', 'Volunteer');
  stranger = await createUser('USER', 'Stranger');
  await testPrisma().user.update({ where: { id: owner.id }, data: { phone: SECRETS.ownerPhone } });
  await testPrisma().user.update({
    where: { id: volunteer.id },
    data: { phone: SECRETS.volunteerPhone },
  });
  const categoryId = (await createCategory()).id;
  await request(app)
    .put('/api/users/me/volunteer-profile')
    .set(volunteer.auth)
    .send({ skills: ['cooking'], availabilityNotes: SECRETS.availability, availableDays: ['TUE'] });

  requestId = await createHelpRequest(app, owner, categoryId, {
    approve: admin,
    body: { addressDetails: SECRETS.address },
  });
  await request(app)
    .post(`/api/requests/${requestId}/attachments`)
    .set(owner.auth)
    .attach('file', PNG, 'a.png');
  await request(app).post(`/api/admin/requests/${requestId}/approve`).set(admin.auth).send({});
  const offer = await request(app)
    .post(`/api/requests/${requestId}/offers`)
    .set(volunteer.auth)
    .send({ message: 'I can cook for you.' });
  await request(app)
    .post(`/api/offers/${offer.body.data.id as string}/accept`)
    .set(owner.auth);
  pendingRequestId = await createHelpRequest(app, owner, categoryId, {
    body: { title: 'Pending secret request' },
  });

  taskId = await createTask(app, owner, categoryId, { approve: admin });
  await request(app).post(`/api/tasks/${taskId}/registrations`).set(volunteer.auth);
});

function assertClean(body: unknown, label: string) {
  const text = JSON.stringify(body);
  for (const value of [
    owner.email,
    volunteer.email,
    SECRETS.ownerPhone,
    SECRETS.volunteerPhone,
    SECRETS.address,
    SECRETS.availability,
    'passwordHash',
    'argon2',
    'availableDays',
    'storageKey',
    'Pending secret request',
  ]) {
    expect(text, `${label} leaks ${value}`).not.toContain(value);
  }
}

describe('privacy sweep', () => {
  it('leaks no private data to anonymous visitors or unrelated users', async () => {
    const paths = [
      '/api/requests',
      '/api/requests?status=IN_PROGRESS',
      `/api/requests/${requestId}`,
      `/api/requests/${requestId}/attachments`,
      '/api/tasks',
      `/api/tasks/${taskId}`,
      '/api/categories',
    ];
    for (const viewer of [undefined, stranger]) {
      for (const path of paths) {
        const req = request(app).get(path);
        const res = viewer ? await req.set(viewer.auth) : await req;
        expect(res.status, path).toBe(200);
        assertClean(res.body, `${viewer ? 'stranger' : 'anonymous'} GET ${path}`);
      }
    }
    for (const path of [
      `/api/requests/${requestId}/offers`,
      '/api/users/me/matches',
      '/api/users/me/dashboard',
      '/api/notifications',
    ]) {
      const res = await request(app).get(path).set(stranger.auth);
      assertClean(res.body, `stranger GET ${path}`);
    }
    for (const path of [
      `/api/requests/${requestId}/history`,
      `/api/tasks/${taskId}/registrations`,
      `/api/tasks/${taskId}/history`,
      `/api/requests/${pendingRequestId}`,
      '/api/admin/users',
      '/api/admin/dashboard',
    ]) {
      const res = await request(app).get(path).set(stranger.auth);
      expect([403, 404], path).toContain(res.status);
    }
  });
});
