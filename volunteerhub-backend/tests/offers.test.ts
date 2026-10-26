import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildApp,
  createCategory,
  createHelpRequest,
  createUser,
  resetDb,
  testPrisma,
  type TestUser,
} from './helpers/setup.js';

const app = buildApp();

let admin: TestUser;
let owner: TestUser;
let volunteer: TestUser;
let second: TestUser;
let categoryId: string;
let requestId: string;

beforeEach(async () => {
  await resetDb();
  admin = await createUser('ADMIN');
  owner = await createUser('USER', 'Requester');
  volunteer = await createUser('USER', 'Volunteer One');
  second = await createUser('USER', 'Volunteer Two');
  categoryId = (await createCategory()).id;
  await testPrisma().user.update({ where: { id: owner.id }, data: { phone: '050-0000001' } });
  await testPrisma().user.update({ where: { id: volunteer.id }, data: { phone: '050-0000002' } });
  requestId = await createHelpRequest(app, owner, categoryId, { approve: admin });
});

const offer = async (user: TestUser, id = requestId, message = 'I can help on Sunday morning.') =>
  request(app).post(`/api/requests/${id}/offers`).set(user.auth).send({ message });

const offerId = async (user: TestUser) => {
  const res = await offer(user);
  if (res.status !== 201) throw new Error(`offer failed: ${res.status}`);
  return res.body.data.id as string;
};

describe('making offers', () => {
  it('creates a pending offer and notifies the owner', async () => {
    const res = await offer(volunteer);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'PENDING',
      requestId,
      volunteer: { id: volunteer.id, name: 'Volunteer One' },
      contact: null,
    });
    expect(await testPrisma().notification.findMany({ where: { userId: owner.id } })).toMatchObject(
      [{ type: 'REQUEST_APPROVED' }, { type: 'OFFER_RECEIVED', entityId: requestId }],
    );
  });

  it('prevents offering on your own request, twice, or on unpublished requests', async () => {
    expect((await offer(owner)).status).toBe(403);

    expect((await offer(volunteer)).status).toBe(201);
    const duplicate = await offer(volunteer);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ALREADY_EXISTS');

    const pending = await createHelpRequest(app, owner, categoryId);
    expect((await offer(volunteer, pending)).status).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/requests/${requestId}/offers`)
          .send({ message: 'Hello there' })
      ).status,
    ).toBe(401);
  });

  it('never creates two active offers for one volunteer, even concurrently', async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => offer(volunteer)));
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(results.filter((res) => res.status === 409)).toHaveLength(3);
    expect(await testPrisma().helpOffer.count()).toBe(1);
  });

  it('lets the volunteer withdraw a pending offer and offer again later', async () => {
    const id = await offerId(volunteer);
    expect((await request(app).post(`/api/offers/${id}/withdraw`).set(owner.auth)).status).toBe(
      403,
    );
    const res = await request(app).post(`/api/offers/${id}/withdraw`).set(volunteer.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('WITHDRAWN');
    expect((await offer(volunteer)).status).toBe(201);
    expect(
      await testPrisma().notification.findFirst({ where: { type: 'OFFER_WITHDRAWN' } }),
    ).toMatchObject({ userId: owner.id });
  });
});

describe('viewing offers', () => {
  it('shows all offers to the owner, but only their own to each volunteer', async () => {
    await offerId(volunteer);
    await offerId(second);

    const ownerView = await request(app).get(`/api/requests/${requestId}/offers`).set(owner.auth);
    expect(ownerView.body.data).toHaveLength(2);
    const volunteerView = await request(app)
      .get(`/api/requests/${requestId}/offers`)
      .set(volunteer.auth);
    expect(
      volunteerView.body.data.map((o: { volunteer: { id: string } }) => o.volunteer.id),
    ).toEqual([volunteer.id]);
    expect((await request(app).get(`/api/requests/${requestId}/offers`)).status).toBe(401);
  });

  it('never exposes volunteer availability or contact details before acceptance', async () => {
    await request(app)
      .put('/api/users/me/volunteer-profile')
      .set(volunteer.auth)
      .send({ skills: ['driving'], availableDays: ['MON'], availabilityNotes: 'Secret schedule' });
    await offerId(volunteer);

    const res = await request(app).get(`/api/requests/${requestId}/offers`).set(owner.auth);
    expect(res.body.data[0].volunteer).toEqual({
      id: volunteer.id,
      name: 'Volunteer One',
      skills: ['driving'],
      region: null,
    });
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('Secret schedule');
    expect(body).not.toContain('availableDays');
    expect(body).not.toContain(volunteer.email);
    expect(body).not.toContain('050-0000002');
  });

  it('lists my offers with their request', async () => {
    await offerId(volunteer);
    const res = await request(app).get('/api/users/me/offers').set(volunteer.auth);
    expect(res.body.data).toMatchObject([
      { status: 'PENDING', request: { id: requestId, status: 'OPEN' } },
    ]);
    expect(res.body.meta.total).toBe(1);
  });
});

describe('accepting offers', () => {
  it('accepts one offer: others declined, request in progress, contacts revealed', async () => {
    const accepted = await offerId(volunteer);
    const declined = await offerId(second);

    expect(
      (await request(app).post(`/api/offers/${accepted}/accept`).set(volunteer.auth)).status,
    ).toBe(403);
    const res = await request(app).post(`/api/offers/${accepted}/accept`).set(owner.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'ACCEPTED',
      contact: { email: volunteer.email, phone: '050-0000002' },
    });

    expect(
      await testPrisma().helpOffer.findUniqueOrThrow({ where: { id: declined } }),
    ).toMatchObject({ status: 'DECLINED' });
    const detail = await request(app).get(`/api/requests/${requestId}`).set(owner.auth);
    expect(detail.body.data).toMatchObject({
      status: 'IN_PROGRESS',
      acceptedVolunteer: { id: volunteer.id, email: volunteer.email },
    });

    const asVolunteer = await request(app).get(`/api/requests/${requestId}`).set(volunteer.auth);
    expect(asVolunteer.body.data.privateDetails).toEqual({
      addressDetails: 'Herzl 10, apartment 4',
      contact: { name: 'Requester', email: owner.email, phone: '050-0000001' },
    });
    const asDeclined = await request(app).get(`/api/requests/${requestId}`).set(second.auth);
    expect(asDeclined.body.data.privateDetails).toBeNull();
    expect(asDeclined.body.data.acceptedVolunteer).toBeNull();
    expect(
      (await request(app).get(`/api/requests/${requestId}`)).body.data.privateDetails,
    ).toBeNull();

    const types = await testPrisma().notification.findMany({
      where: { userId: { in: [volunteer.id, second.id] } },
      select: { userId: true, type: true },
    });
    expect(types).toEqual(
      expect.arrayContaining([
        { userId: volunteer.id, type: 'OFFER_ACCEPTED' },
        { userId: second.id, type: 'OFFER_DECLINED' },
      ]),
    );
  });

  it('accepts at most one offer per request, even when accepted concurrently', async () => {
    const volunteers = [volunteer, second, await createUser(), await createUser()];
    const ids = [];
    for (const user of volunteers) ids.push(await offerId(user));

    const results = await Promise.all(
      ids.map((id) => request(app).post(`/api/offers/${id}/accept`).set(owner.auth)),
    );
    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(results.filter((res) => res.status === 409)).toHaveLength(3);
    expect(await testPrisma().helpOffer.count({ where: { status: 'ACCEPTED' } })).toBe(1);
    expect(await testPrisma().helpOffer.count({ where: { status: 'DECLINED' } })).toBe(3);
  });

  it('refuses offers and acceptance when the request is not approved and open', async () => {
    const id = await offerId(volunteer);
    await request(app)
      .patch(`/api/requests/${requestId}`)
      .set(owner.auth)
      .send({ title: 'Groceries and pharmacy pickup' });

    const res = await request(app).post(`/api/offers/${id}/accept`).set(owner.auth);
    expect(res.status).toBe(409);
    expect((await offer(second)).status).toBe(404);
  });

  it('lets the owner decline a pending offer, and completes after acceptance', async () => {
    const declined = await offerId(volunteer);
    const res = await request(app).post(`/api/offers/${declined}/decline`).set(owner.auth);
    expect(res.body.data.status).toBe('DECLINED');
    expect((await request(app).post(`/api/offers/${declined}/accept`).set(owner.auth)).status).toBe(
      409,
    );

    const accepted = await offerId(second);
    await request(app).post(`/api/offers/${accepted}/accept`).set(owner.auth);
    expect(
      (await request(app).post(`/api/offers/${accepted}/withdraw`).set(second.auth)).status,
    ).toBe(409);
    const completed = await request(app)
      .post(`/api/requests/${requestId}/complete`)
      .set(owner.auth);
    expect(completed.status).toBe(200);
    expect(completed.body.data.status).toBe('COMPLETED');
    expect(
      await testPrisma().notification.findFirst({ where: { type: 'REQUEST_COMPLETED' } }),
    ).toMatchObject({ userId: second.id });
  });

  it('records the full offer and request history', async () => {
    const id = await offerId(volunteer);
    await request(app).post(`/api/offers/${id}/accept`).set(owner.auth);
    const history = await request(app).get(`/api/requests/${requestId}/history`).set(owner.auth);
    expect(
      (history.body.data as { entityType: string; toStatus: string }[]).map(
        (h) => `${h.entityType}:${h.toStatus}`,
      ),
    ).toEqual([
      'HELP_REQUEST:PENDING_REVIEW',
      'HELP_REQUEST:APPROVED',
      'HELP_OFFER:PENDING',
      'HELP_OFFER:ACCEPTED',
      'HELP_REQUEST:IN_PROGRESS',
    ]);
  });

  it('hides offers from unrelated users', async () => {
    const id = await offerId(volunteer);
    const stranger = await createUser();
    expect((await request(app).post(`/api/offers/${id}/withdraw`).set(stranger.auth)).status).toBe(
      404,
    );
    expect(
      (
        await request(app)
          .post('/api/offers/00000000-0000-4000-8000-000000000000/accept')
          .set(owner.auth)
      ).status,
    ).toBe(404);
  });
});
