import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildApp,
  createCategory,
  createHelpRequest,
  createUser,
  PNG,
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
  owner = await createUser();
  other = await createUser();
  categoryId = (await createCategory()).id;
});

const upload = (requestId: string, user: TestUser, file: Buffer = PNG, name = 'photo.png') =>
  request(app)
    .post(`/api/requests/${requestId}/attachments`)
    .set(user.auth)
    .attach('file', file, name);

describe('request images', () => {
  it('lets the owner upload images detected from their bytes', async () => {
    const id = await createHelpRequest(app, owner, categoryId);
    const res = await upload(id, owner);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      requestId: id,
      mimeType: 'image/png',
      sizeBytes: PNG.length,
    });
    expect(res.body.data.url).toBe(`/api/attachments/${res.body.data.id as string}/file`);
    expect(res.body.meta).toEqual({ reModeration: false });

    const file = await request(app)
      .get(res.body.data.url as string)
      .set(owner.auth);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(file.body as Buffer).equals(PNG)).toBe(true);

    // The image is stored in the database, and lists never include the bytes.
    const stored = await testPrisma().mediaAttachment.findFirstOrThrow();
    expect(Buffer.from(stored.data).equals(PNG)).toBe(true);
    expect(res.body.data).not.toHaveProperty('data');
  });

  it('rejects non-images (even with an image name) and other users', async () => {
    const id = await createHelpRequest(app, owner, categoryId, { approve: admin });
    const fake = await upload(id, owner, Buffer.from('<script>alert(1)</script>'), 'x.png');
    expect(fake.status).toBe(415);
    expect(fake.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect((await upload(id, other)).status).toBe(403);
    expect(
      (await request(app).post(`/api/requests/${id}/attachments`).attach('file', PNG, 'a.png'))
        .status,
    ).toBe(401);
    const missing = await request(app).post(`/api/requests/${id}/attachments`).set(owner.auth);
    expect(missing.status).toBe(400);
  });

  it('enforces the size limit and at most 5 images', async () => {
    const id = await createHelpRequest(app, owner, categoryId);
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const tooBig = await upload(id, owner, big);
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe('PAYLOAD_TOO_LARGE');

    for (let i = 0; i < 5; i += 1) expect((await upload(id, owner)).status).toBe(201);
    const sixth = await upload(id, owner);
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe('LIMIT_REACHED');
    expect(await testPrisma().mediaAttachment.count()).toBe(5);
  });

  it('sends a published request back to moderation when an image is added', async () => {
    const id = await createHelpRequest(app, owner, categoryId, { approve: admin });
    const res = await upload(id, owner);
    expect(res.body.meta).toEqual({ reModeration: true });
    const stored = await testPrisma().helpRequest.findUniqueOrThrow({ where: { id } });
    expect(stored.moderationStatus).toBe('PENDING_REVIEW');
    expect((await request(app).get(`/api/requests/${id}`)).status).toBe(404);
  });

  it('serves files with the same visibility as the request', async () => {
    const id = await createHelpRequest(app, owner, categoryId);
    const url = (await upload(id, owner)).body.data.url as string;

    expect((await request(app).get(url)).status).toBe(404);
    expect((await request(app).get(url).set(other.auth)).status).toBe(404);
    expect((await request(app).get(`/api/requests/${id}/attachments`)).status).toBe(404);
    expect((await request(app).get(url).set(admin.auth)).status).toBe(200);

    await request(app).post(`/api/admin/requests/${id}/approve`).set(admin.auth).send({});
    expect((await request(app).get(url)).status).toBe(200);
    const list = await request(app).get(`/api/requests/${id}/attachments`);
    expect(list.body.data).toHaveLength(1);
    expect((await request(app).get(`/api/requests/${id}`)).body.data.imageCount).toBe(1);
  });

  it('lets the owner remove images while open, and admins at any time with an audit entry', async () => {
    const id = await createHelpRequest(app, owner, categoryId);
    const first = (await upload(id, owner)).body.data.id as string;
    const second = (await upload(id, owner)).body.data.id as string;
    await request(app).post(`/api/admin/requests/${id}/approve`).set(admin.auth).send({});

    expect((await request(app).delete(`/api/attachments/${first}`).set(other.auth)).status).toBe(
      403,
    );
    expect((await request(app).delete(`/api/attachments/${first}`).set(owner.auth)).status).toBe(
      204,
    );

    await request(app).post(`/api/requests/${id}/cancel`).set(owner.auth).send({});
    expect((await request(app).delete(`/api/attachments/${second}`).set(owner.auth)).status).toBe(
      409,
    );
    expect((await request(app).delete(`/api/attachments/${second}`).set(admin.auth)).status).toBe(
      204,
    );
    expect(
      await testPrisma().auditLog.findFirst({ where: { action: 'ATTACHMENT_DELETED' } }),
    ).toMatchObject({ actorId: admin.id, entityId: second });
    expect(await testPrisma().mediaAttachment.count()).toBe(0);
  });
});
