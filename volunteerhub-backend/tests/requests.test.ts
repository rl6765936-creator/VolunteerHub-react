import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildApp,
  createCategory,
  createHelpRequest,
  createUser,
  futureDate,
  resetDb,
  testPrisma,
  type TestUser,
} from './helpers/setup.js';

const app = buildApp();

let admin: TestUser;
let owner: TestUser;
let other: TestUser;
let categoryId: string;

beforeEach(async () => {
  await resetDb();
  admin = await createUser('ADMIN');
  owner = await createUser('USER', 'Requester');
  other = await createUser('USER', 'Neighbour');
  categoryId = (await createCategory('Elderly support')).id;
});

const get = (id: string, user?: TestUser) => {
  const req = request(app).get(`/api/requests/${id}`);
  return user ? req.set(user.auth) : req;
};

/** An offer inserted directly, to make `user` a participant without the offers API. */
const offerFrom = (requestId: string, user: TestUser) =>
  testPrisma().helpOffer.create({
    data: { requestId, volunteerId: user.id, message: 'I can help on Sunday.' },
  });

describe('creating help requests', () => {
  it('starts as PENDING_REVIEW, hidden from the public until approved', async () => {
    const id = await createHelpRequest(app, owner, categoryId);

    const own = await get(id, owner);
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({
      moderationStatus: 'PENDING_REVIEW',
      status: 'OPEN',
      underReModeration: false,
      publishedAt: null,
      owner: { id: owner.id, name: 'Requester' },
    });

    expect((await get(id)).status).toBe(404);
    expect((await get(id, other)).status).toBe(404);
    expect((await get(id, admin)).status).toBe(200);
    expect((await request(app).get('/api/requests')).body.data).toHaveLength(0);

    const history = await testPrisma().statusHistory.findMany({ where: { entityId: id } });
    expect(history).toMatchObject([
      { field: 'MODERATION', fromStatus: null, toStatus: 'PENDING_REVIEW', actorId: owner.id },
    ]);
  });

  it('requires authentication and validates input', async () => {
    const valid = {
      title: 'Need a ride',
      description: 'A ride to the clinic on Monday morning.',
      categoryId,
      region: 'Haifa',
    };
    expect((await request(app).post('/api/requests').send(valid)).status).toBe(401);

    const inactive = await createCategory('Closed');
    await testPrisma().category.update({ where: { id: inactive.id }, data: { isActive: false } });
    for (const body of [
      { ...valid, title: 'x' },
      { ...valid, categoryId: inactive.id },
      { ...valid, categoryId: '00000000-0000-4000-8000-000000000000' },
      { ...valid, neededBy: new Date(Date.now() - 60_000).toISOString() },
      { ...valid, ownerId: other.id },
      { ...valid, moderationStatus: 'APPROVED' },
    ]) {
      const res = await request(app).post('/api/requests').set(owner.auth).send(body);
      expect(res.status).toBe(400);
    }
  });
});

describe('moderation', () => {
  it('lets admins approve: published, owner notified, history and audit written', async () => {
    const id = await createHelpRequest(app, owner, categoryId);
    expect(
      (await request(app).post(`/api/admin/requests/${id}/approve`).set(owner.auth).send({}))
        .status,
    ).toBe(403);

    const res = await request(app)
      .post(`/api/admin/requests/${id}/approve`)
      .set(admin.auth)
      .send({ note: 'Looks good' });
    expect(res.status).toBe(200);
    expect(res.body.data.moderationStatus).toBe('APPROVED');
    expect(res.body.data.publishedAt).not.toBeNull();

    expect((await get(id)).status).toBe(200);
    const list = await request(app).get('/api/requests');
    expect(list.body.data.map((r: { id: string }) => r.id)).toEqual([id]);

    expect(await testPrisma().notification.findMany({ where: { userId: owner.id } })).toMatchObject(
      [{ type: 'REQUEST_APPROVED', entityType: 'HelpRequest', entityId: id }],
    );
    expect(await testPrisma().auditLog.findFirst({ where: { entityId: id } })).toMatchObject({
      action: 'REQUEST_APPROVED',
      actorId: admin.id,
    });
    const again = await request(app)
      .post(`/api/admin/requests/${id}/approve`)
      .set(admin.auth)
      .send({});
    expect(again.status).toBe(409);
  });

  it('rejects with a reason shown only to the owner and admins; editing resubmits', async () => {
    const id = await createHelpRequest(app, owner, categoryId);
    const noReason = await request(app)
      .post(`/api/admin/requests/${id}/reject`)
      .set(admin.auth)
      .send({});
    expect(noReason.status).toBe(400);

    await request(app)
      .post(`/api/admin/requests/${id}/reject`)
      .set(admin.auth)
      .send({ reason: 'Please remove the phone number from the text.' });

    const own = await get(id, owner);
    expect(own.body.data).toMatchObject({
      moderationStatus: 'REJECTED',
      rejectionReason: 'Please remove the phone number from the text.',
    });
    expect((await get(id, other)).status).toBe(404);

    const edited = await request(app)
      .patch(`/api/requests/${id}`)
      .set(owner.auth)
      .send({ description: 'Weekly shopping, contact me through the platform.' });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      moderationStatus: 'PENDING_REVIEW',
      rejectionReason: null,
    });
  });

  it('lets admins take down an approved request', async () => {
    const id = await createHelpRequest(app, owner, categoryId, { approve: admin });
    const res = await request(app)
      .post(`/api/admin/requests/${id}/reject`)
      .set(admin.auth)
      .send({ reason: 'Contains personal details of a third party.' });
    expect(res.status).toBe(200);
    expect((await get(id)).status).toBe(404);
  });

  it('lists the moderation queue for admins only', async () => {
    await createHelpRequest(app, owner, categoryId);
    await createHelpRequest(app, owner, categoryId, {
      approve: admin,
      body: { title: 'Approved one' },
    });
    expect((await request(app).get('/api/admin/requests').set(owner.auth)).status).toBe(403);
    const queue = await request(app)
      .get('/api/admin/requests?moderationStatus=PENDING_REVIEW')
      .set(admin.auth);
    expect(queue.body.meta.total).toBe(1);
  });
});

describe('contact privacy', () => {
  it('never shows the address or contact details publicly or to other users', async () => {
    await testPrisma().user.update({ where: { id: owner.id }, data: { phone: '050-1234567' } });
    const id = await createHelpRequest(app, owner, categoryId, { approve: admin });

    for (const viewer of [undefined, other]) {
      const res = await get(id, viewer);
      expect(res.body.data.privateDetails).toBeNull();
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(owner.email);
      expect(body).not.toContain('050-1234567');
      expect(body).not.toContain('Herzl 10');
    }
    const list = JSON.stringify((await request(app).get('/api/requests')).body);
    expect(list).not.toContain(owner.email);
    expect(list).not.toContain('Herzl 10');

    const own = await get(id, owner);
    expect(own.body.data.privateDetails).toEqual({
      addressDetails: 'Herzl 10, apartment 4',
      contact: { name: 'Requester', email: owner.email, phone: '050-1234567' },
    });
    expect((await get(id, admin)).body.data.privateDetails).not.toBeNull();
  });
});

describe('editing', () => {
  it('lets only the owner edit (403 for others who can see it, 404 if hidden)', async () => {
    const id = await createHelpRequest(app, owner, categoryId, { approve: admin });
    const hidden = await createHelpRequest(app, owner, categoryId);
    const patch = (requestId: string, user: TestUser) =>
      request(app).patch(`/api/requests/${requestId}`).set(user.auth).send({ title: 'Hijacked' });

    expect((await patch(id, other)).status).toBe(403);
    expect((await patch(id, admin)).status).toBe(403);
    expect((await patch(hidden, other)).status).toBe(404);
    expect((await request(app).patch(`/api/requests/${id}`).send({ title: 'Anon' })).status).toBe(
      401,
    );
    expect((await get(id, owner)).body.data.title).toBe('Groceries for an elderly neighbour');
  });

  it('sends a material edit of a published request back to moderation', async () => {
    const id = await createHelpRequest(app, owner, categoryId, { approve: admin });
    await offerFrom(id, other);

    const res = await request(app)
      .patch(`/api/requests/${id}`)
      .set(owner.auth)
      .send({ region: 'Tel Aviv', neededBy: futureDate(3).toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ changedFields: ['region', 'neededBy'], reModeration: true });
    expect(res.body.data).toMatchObject({
      moderationStatus: 'PENDING_REVIEW',
      underReModeration: true,
      region: 'Tel Aviv',
    });

    // Hidden publicly, still visible to the owner, admins and the user who offered help.
    expect((await get(id)).status).toBe(404);
    expect((await request(app).get('/api/requests')).body.data).toHaveLength(0);
    const stranger = await createUser();
    expect((await get(id, stranger)).status).toBe(404);
    expect((await get(id, other)).status).toBe(200);
    expect((await get(id, admin)).status).toBe(200);

    expect(await testPrisma().notification.findMany({ where: { userId: other.id } })).toMatchObject(
      [{ type: 'REQUEST_UPDATED', entityId: id }],
    );
    const history = await testPrisma().statusHistory.findMany({
      where: { entityId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => h.toStatus)).toEqual([
      'PENDING_REVIEW',
      'APPROVED',
      'PENDING_REVIEW',
    ]);

    // Re-approval keeps the original publication date.
    const published = (await testPrisma().helpRequest.findUniqueOrThrow({ where: { id } }))
      .publishedAt;
    await request(app).post(`/api/admin/requests/${id}/approve`).set(admin.auth).send({});
    const after = await testPrisma().helpRequest.findUniqueOrThrow({ where: { id } });
    expect(after.publishedAt).toEqual(published);
    expect(after.moderationStatus).toBe('APPROVED');
  });

  it('does nothing when no field actually changes', async () => {
    const id = await createHelpRequest(app, owner, categoryId, { approve: admin });
    const res = await request(app)
      .patch(`/api/requests/${id}`)
      .set(owner.auth)
      .send({ region: 'Jerusalem' });
    expect(res.body.meta).toEqual({ changedFields: [], reModeration: false });
    expect(res.body.data.moderationStatus).toBe('APPROVED');
  });

  it('is allowed only while the request is open', async () => {
    const id = await createHelpRequest(app, owner, categoryId, { approve: admin });
    await request(app).post(`/api/requests/${id}/cancel`).set(owner.auth).send({});
    const res = await request(app)
      .patch(`/api/requests/${id}`)
      .set(owner.auth)
      .send({ title: 'Too late' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });
});

describe('cancelling and completing', () => {
  it('lets the owner cancel, declining pending offers and notifying offerers', async () => {
    const id = await createHelpRequest(app, owner, categoryId, { approve: admin });
    const offer = await offerFrom(id, other);

    const res = await request(app)
      .post(`/api/requests/${id}/cancel`)
      .set(owner.auth)
      .send({ reason: 'Family will help' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'CANCELLED' });
    expect(res.body.data.cancelledAt).not.toBeNull();

    expect(
      await testPrisma().helpOffer.findUniqueOrThrow({ where: { id: offer.id } }),
    ).toMatchObject({ status: 'DECLINED' });
    expect(await testPrisma().notification.findMany({ where: { userId: other.id } })).toMatchObject(
      [{ type: 'REQUEST_CANCELLED', entityId: id }],
    );
    expect(
      (await request(app).post(`/api/requests/${id}/cancel`).set(owner.auth).send({})).status,
    ).toBe(409);
  });

  it('lets admins cancel with an audit entry and notifies the owner', async () => {
    const id = await createHelpRequest(app, owner, categoryId, { approve: admin });
    expect(
      (await request(app).post(`/api/requests/${id}/cancel`).set(other.auth).send({})).status,
    ).toBe(403);
    await request(app).post(`/api/requests/${id}/cancel`).set(admin.auth).send({ reason: 'Spam' });

    expect(
      await testPrisma().auditLog.findFirst({ where: { action: 'REQUEST_CANCELLED' } }),
    ).toMatchObject({ actorId: admin.id, entityId: id });
    expect(
      await testPrisma().notification.findFirst({
        where: { userId: owner.id, type: 'REQUEST_CANCELLED' },
      }),
    ).not.toBeNull();
  });

  it('completes only requests with an accepted offer', async () => {
    const id = await createHelpRequest(app, owner, categoryId, { approve: admin });
    const res = await request(app).post(`/api/requests/${id}/complete`).set(owner.auth);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });
});

describe('search, filters and pagination', () => {
  it('filters approved requests by text, category, region and status', async () => {
    const food = (await createCategory('Food')).id;
    const a = await createHelpRequest(app, owner, categoryId, {
      approve: admin,
      body: { title: 'Ride to the clinic', region: 'Haifa' },
    });
    const b = await createHelpRequest(app, owner, food, {
      approve: admin,
      body: { title: 'Cooking for a family', description: 'Hot meals for a family in need.' },
    });
    await createHelpRequest(app, owner, food, { body: { title: 'Pending cooking' } });
    const ids = async (query: string) =>
      ((await request(app).get(`/api/requests?${query}`)).body.data as { id: string }[]).map(
        (r) => r.id,
      );

    expect(await ids('q=CLINIC')).toEqual([a]);
    expect(await ids('q=meals')).toEqual([b]);
    expect(await ids(`categoryId=${food}`)).toEqual([b]);
    expect(await ids('region=hai')).toEqual([a]);
    expect(await ids('status=CANCELLED')).toEqual([]);
    expect((await request(app).get('/api/requests?status=WHATEVER')).status).toBe(400);

    const page = await request(app).get('/api/requests?page=2&pageSize=1&sort=oldest');
    expect(page.body.meta).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    expect(page.body.data.map((r: { id: string }) => r.id)).toEqual([b]);
    expect((await request(app).get('/api/requests?pageSize=51')).status).toBe(400);
  });

  it('sorts by the needed-by date with undated requests last', async () => {
    const late = await createHelpRequest(app, owner, categoryId, {
      approve: admin,
      body: { neededBy: futureDate(10).toISOString() },
    });
    const undated = await createHelpRequest(app, owner, categoryId, { approve: admin });
    const soon = await createHelpRequest(app, owner, categoryId, {
      approve: admin,
      body: { neededBy: futureDate(1).toISOString() },
    });
    const res = await request(app).get('/api/requests?sort=neededBy');
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([soon, late, undated]);
  });

  it('lists my own requests in every state, including the rejection reason', async () => {
    const id = await createHelpRequest(app, owner, categoryId);
    await request(app)
      .post(`/api/admin/requests/${id}/reject`)
      .set(admin.auth)
      .send({ reason: 'Not a volunteering request.' });
    await createHelpRequest(app, other, categoryId);

    const mine = await request(app).get('/api/users/me/requests').set(owner.auth);
    expect(mine.body.data).toMatchObject([
      { id, moderationStatus: 'REJECTED', rejectionReason: 'Not a volunteering request.' },
    ]);
    expect((await request(app).get('/api/users/me/requests')).status).toBe(401);
  });
});

describe('history', () => {
  it('is visible to the owner and admins only', async () => {
    const id = await createHelpRequest(app, owner, categoryId, { approve: admin });
    const own = await request(app).get(`/api/requests/${id}/history`).set(owner.auth);
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject([
      { field: 'MODERATION', toStatus: 'PENDING_REVIEW', actor: { id: owner.id } },
      { field: 'MODERATION', toStatus: 'APPROVED', actor: { id: admin.id } },
    ]);
    expect(JSON.stringify(own.body)).not.toContain(admin.email);
    expect((await request(app).get(`/api/requests/${id}/history`).set(other.auth)).status).toBe(
      403,
    );
    expect((await request(app).get(`/api/requests/${id}/history`).set(admin.auth)).status).toBe(
      200,
    );
  });
});
