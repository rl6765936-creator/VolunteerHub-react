import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testPrisma } from './helpers/setup.js';

const db = () => testPrisma();

async function seedBase() {
  const owner = await db().user.create({
    data: { name: 'Owner', email: 'owner@example.com', passwordHash: 'x' },
  });
  const volunteer = await db().user.create({
    data: { name: 'Volunteer', email: 'volunteer@example.com', passwordHash: 'x' },
  });
  const category = await db().category.create({ data: { name: 'Elderly', slug: 'elderly' } });
  return { owner, volunteer, category };
}

const taskData = (createdById: string, categoryId: string) => ({
  createdById,
  categoryId,
  title: 'Food packing',
  description: 'Packing food boxes',
  region: 'Jerusalem',
  location: 'Community center',
  startsAt: new Date('2030-01-01T08:00:00Z'),
  endsAt: new Date('2030-01-01T12:00:00Z'),
  capacity: 2,
});

const requestData = (ownerId: string, categoryId: string) => ({
  ownerId,
  categoryId,
  title: 'Groceries',
  description: 'Help with shopping',
  region: 'Haifa',
});

beforeEach(resetDb);

describe('task constraints', () => {
  it('rejects capacity outside 1..1000', async () => {
    const { owner, category } = await seedBase();
    for (const capacity of [0, -1, 1001]) {
      await expect(
        db().volunteerTask.create({ data: { ...taskData(owner.id, category.id), capacity } }),
      ).rejects.toThrow();
    }
  });

  it('rejects a task that ends before it starts', async () => {
    const { owner, category } = await seedBase();
    await expect(
      db().volunteerTask.create({
        data: { ...taskData(owner.id, category.id), endsAt: new Date('2029-12-31T00:00:00Z') },
      }),
    ).rejects.toThrow();
  });

  it('requires a reason for rejection and dates for terminal states', async () => {
    const { owner, category } = await seedBase();
    const base = taskData(owner.id, category.id);
    await expect(
      db().volunteerTask.create({ data: { ...base, moderationStatus: 'REJECTED' } }),
    ).rejects.toThrow();
    await expect(
      db().volunteerTask.create({ data: { ...base, status: 'CANCELLED' } }),
    ).rejects.toThrow();
    await expect(
      db().volunteerTask.create({ data: { ...base, status: 'COMPLETED' } }),
    ).rejects.toThrow();
  });
});

describe('registration constraints', () => {
  it('allows only one confirmed registration per user and task, keeping cancelled history', async () => {
    const { owner, volunteer, category } = await seedBase();
    const task = await db().volunteerTask.create({ data: taskData(owner.id, category.id) });

    await db().taskRegistration.create({ data: { taskId: task.id, userId: volunteer.id } });
    await expect(
      db().taskRegistration.create({ data: { taskId: task.id, userId: volunteer.id } }),
    ).rejects.toThrow();

    await db().taskRegistration.updateMany({
      where: { taskId: task.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await db().taskRegistration.create({ data: { taskId: task.id, userId: volunteer.id } });
    expect(await db().taskRegistration.count({ where: { taskId: task.id } })).toBe(2);
  });

  it('requires a cancellation date on cancelled registrations', async () => {
    const { owner, volunteer, category } = await seedBase();
    const task = await db().volunteerTask.create({ data: taskData(owner.id, category.id) });
    await expect(
      db().taskRegistration.create({
        data: { taskId: task.id, userId: volunteer.id, status: 'CANCELLED' },
      }),
    ).rejects.toThrow();
  });
});

describe('help offer constraints', () => {
  it('allows at most one accepted offer per request', async () => {
    const { owner, volunteer, category } = await seedBase();
    const other = await db().user.create({
      data: { name: 'Other', email: 'other@example.com', passwordHash: 'x' },
    });
    const request = await db().helpRequest.create({ data: requestData(owner.id, category.id) });
    const accepted = { status: 'ACCEPTED' as const, decidedAt: new Date(), message: 'I can help' };

    await db().helpOffer.create({
      data: { requestId: request.id, volunteerId: volunteer.id, ...accepted },
    });
    await expect(
      db().helpOffer.create({
        data: { requestId: request.id, volunteerId: other.id, ...accepted },
      }),
    ).rejects.toThrow();
  });

  it('allows one active offer per volunteer per request, but new offers after withdrawal', async () => {
    const { owner, volunteer, category } = await seedBase();
    const request = await db().helpRequest.create({ data: requestData(owner.id, category.id) });
    const offer = { requestId: request.id, volunteerId: volunteer.id, message: 'I can help' };

    const first = await db().helpOffer.create({ data: offer });
    await expect(db().helpOffer.create({ data: offer })).rejects.toThrow();

    await db().helpOffer.update({
      where: { id: first.id },
      data: { status: 'WITHDRAWN', withdrawnAt: new Date() },
    });
    await expect(db().helpOffer.create({ data: offer })).resolves.toBeDefined();
  });

  it('requires decision and withdrawal dates', async () => {
    const { owner, volunteer, category } = await seedBase();
    const request = await db().helpRequest.create({ data: requestData(owner.id, category.id) });
    const offer = { requestId: request.id, volunteerId: volunteer.id, message: 'I can help' };
    await expect(
      db().helpOffer.create({ data: { ...offer, status: 'ACCEPTED' } }),
    ).rejects.toThrow();
    await expect(
      db().helpOffer.create({ data: { ...offer, status: 'WITHDRAWN' } }),
    ).rejects.toThrow();
  });
});

describe('help request constraints', () => {
  it('requires a rejection reason and dates for terminal states', async () => {
    const { owner, category } = await seedBase();
    const base = requestData(owner.id, category.id);
    await expect(
      db().helpRequest.create({ data: { ...base, moderationStatus: 'REJECTED' } }),
    ).rejects.toThrow();
    await expect(
      db().helpRequest.create({ data: { ...base, status: 'CANCELLED' } }),
    ).rejects.toThrow();
    await expect(
      db().helpRequest.create({ data: { ...base, status: 'COMPLETED' } }),
    ).rejects.toThrow();
  });

  it('refuses to delete a category or user that is still referenced', async () => {
    const { owner, category } = await seedBase();
    await db().helpRequest.create({ data: requestData(owner.id, category.id) });
    await expect(db().category.delete({ where: { id: category.id } })).rejects.toThrow();
    await expect(db().user.delete({ where: { id: owner.id } })).rejects.toThrow();
  });
});

describe('test database safety', () => {
  it('refuses to reset a database whose name does not end in _test', async () => {
    const { assertTestDatabase } = await import('./helpers/testDatabase.js');
    expect(() => assertTestDatabase('postgresql://u:p@localhost:5432/volunteerhub_dev')).toThrow(
      /_test/,
    );
  });
});
