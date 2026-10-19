import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';
import { fullTaskIds } from '../tasks/tasks.service.js';

const HOUR_MS = 60 * 60 * 1000;
const round1 = (value: number) => Math.round(value * 10) / 10;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : sorted[middle];
  return value ?? null;
}

const ratio = (part: number, whole: number) => (whole === 0 ? null : round1((part / whole) * 100));

/** Ever published (approved at least once), which includes items under re-moderation. */
const PUBLISHED_REQUEST: Prisma.HelpRequestWhereInput = { publishedAt: { not: null } };
const PUBLISHED_TASK: Prisma.VolunteerTaskWhereInput = { publishedAt: { not: null } };

function countBy<K extends string>(rows: { key: K; count: number }[], keys: readonly K[]) {
  return Object.fromEntries(
    keys.map((key) => [key, rows.find((row) => row.key === key)?.count ?? 0]),
  ) as Record<K, number>;
}

/**
 * Admin dashboard, computed from VolunteerHub's own records. Success metrics of the
 * specification: handled requests rate, filled tasks rate and average time to match
 * (request publication → accepted offer).
 */
export async function getAdminDashboard(prisma: Db) {
  const now = new Date();
  const [
    users,
    blockedUsers,
    pendingRequests,
    pendingTasks,
    requestStatuses,
    taskStatuses,
    publishedRequests,
    publishedTasks,
    acceptedOffers,
    pendingOffers,
    registrations,
    full,
    upcomingOpenTasks,
    requestCategories,
    taskCategories,
    categories,
    topRegions,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'BLOCKED' } }),
    prisma.helpRequest.count({ where: { moderationStatus: 'PENDING_REVIEW', status: 'OPEN' } }),
    prisma.volunteerTask.count({ where: { moderationStatus: 'PENDING_REVIEW', status: 'OPEN' } }),
    prisma.helpRequest.groupBy({
      by: ['status'],
      where: PUBLISHED_REQUEST,
      _count: { _all: true },
    }),
    prisma.volunteerTask.groupBy({ by: ['status'], where: PUBLISHED_TASK, _count: { _all: true } }),
    prisma.helpRequest.count({ where: PUBLISHED_REQUEST }),
    prisma.volunteerTask.findMany({
      where: PUBLISHED_TASK,
      select: { id: true, status: true },
    }),
    prisma.helpOffer.findMany({
      where: { status: 'ACCEPTED', request: PUBLISHED_REQUEST },
      select: { decidedAt: true, request: { select: { publishedAt: true } } },
    }),
    prisma.helpOffer.count({ where: { status: 'PENDING' } }),
    prisma.taskRegistration.groupBy({ by: ['status'], _count: { _all: true } }),
    fullTaskIds(prisma),
    prisma.volunteerTask.findMany({
      where: { moderationStatus: 'APPROVED', status: 'OPEN', startsAt: { gt: now } },
      select: {
        id: true,
        title: true,
        startsAt: true,
        capacity: true,
        _count: { select: { registrations: { where: { status: 'CONFIRMED' } } } },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.helpRequest.groupBy({
      by: ['categoryId'],
      where: PUBLISHED_REQUEST,
      _count: { _all: true },
    }),
    prisma.volunteerTask.groupBy({
      by: ['categoryId'],
      where: PUBLISHED_TASK,
      _count: { _all: true },
    }),
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.helpRequest.groupBy({
      by: ['region'],
      where: PUBLISHED_REQUEST,
      _count: { _all: true },
      orderBy: { _count: { region: 'desc' } },
      take: 10,
    }),
  ]);

  const requestsByStatus = countBy(
    requestStatuses.map((row) => ({ key: row.status, count: row._count._all })),
    ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const,
  );
  const tasksByStatus = countBy(
    taskStatuses.map((row) => ({ key: row.status, count: row._count._all })),
    ['OPEN', 'COMPLETED', 'CANCELLED'] as const,
  );
  const registrationsByStatus = countBy(
    registrations.map((row) => ({ key: row.status, count: row._count._all })),
    ['CONFIRMED', 'CANCELLED'] as const,
  );

  const matchHours = acceptedOffers
    .filter((offer) => offer.decidedAt && offer.request.publishedAt)
    .map(
      (offer) =>
        ((offer.decidedAt?.getTime() ?? 0) - (offer.request.publishedAt?.getTime() ?? 0)) / HOUR_MS,
    );
  const fullSet = new Set(full);
  const nonCancelledTasks = publishedTasks.filter((task) => task.status !== 'CANCELLED');
  const unfilled = upcomingOpenTasks
    .map((task) => ({
      id: task.id,
      title: task.title,
      startsAt: task.startsAt,
      capacity: task.capacity,
      registeredCount: task._count.registrations,
      spotsLeft: task.capacity - task._count.registrations,
    }))
    .filter((task) => task.spotsLeft > 0);
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const categoryIds = [
    ...new Set([...requestCategories, ...taskCategories].map((row) => row.categoryId)),
  ];

  return {
    users: { total: users, blocked: blockedUsers },
    moderation: { pendingRequests, pendingTasks },
    requests: {
      published: publishedRequests,
      byStatus: requestsByStatus,
      pendingOffers,
      /** Completed ÷ published requests that were not cancelled, in percent. */
      handledRatePercent: ratio(
        requestsByStatus.COMPLETED,
        publishedRequests - requestsByStatus.CANCELLED,
      ),
      timeToMatchHours: {
        average:
          matchHours.length > 0
            ? round1(matchHours.reduce((sum, hours) => sum + hours, 0) / matchHours.length)
            : null,
        median: (() => {
          const value = median(matchHours);
          return value === null ? null : round1(value);
        })(),
        sampleSize: matchHours.length,
      },
    },
    tasks: {
      published: publishedTasks.length,
      byStatus: tasksByStatus,
      /** Published, non-cancelled tasks whose places are all taken, in percent. */
      filledRatePercent: ratio(
        nonCancelledTasks.filter((task) => fullSet.has(task.id)).length,
        nonCancelledTasks.length,
      ),
      upcomingOpen: upcomingOpenTasks.length,
      unfilledUpcoming: { count: unfilled.length, next: unfilled.slice(0, 10) },
    },
    registrations: registrationsByStatus,
    byCategory: categoryIds
      .map((id) => ({
        categoryId: id,
        name: categoryName.get(id) ?? null,
        requests: requestCategories.find((row) => row.categoryId === id)?._count._all ?? 0,
        tasks: taskCategories.find((row) => row.categoryId === id)?._count._all ?? 0,
      }))
      .sort((a, b) => b.requests + b.tasks - (a.requests + a.tasks)),
    topRequestRegions: topRegions.map((row) => ({ region: row.region, requests: row._count._all })),
    labels: {
      source: 'Computed from VolunteerHub records.',
      timeToMatch: 'Hours from a request being published until an offer was accepted.',
    },
  };
}

/** Personal dashboard ("my area"): my requests, offers, tasks and upcoming registrations. */
export async function getMyDashboard(prisma: Db, userId: string) {
  const now = new Date();
  const [requests, offers, tasks, upcoming, unread] = await Promise.all([
    prisma.helpRequest.groupBy({
      by: ['status'],
      where: { ownerId: userId },
      _count: { _all: true },
    }),
    prisma.helpOffer.groupBy({
      by: ['status'],
      where: { volunteerId: userId },
      _count: { _all: true },
    }),
    prisma.volunteerTask.groupBy({
      by: ['status'],
      where: { createdById: userId },
      _count: { _all: true },
    }),
    prisma.taskRegistration.findMany({
      where: { userId, status: 'CONFIRMED', task: { startsAt: { gt: now }, status: 'OPEN' } },
      select: {
        id: true,
        task: { select: { id: true, title: true, startsAt: true, endsAt: true, location: true } },
      },
      orderBy: [{ task: { startsAt: 'asc' } }, { id: 'asc' }],
      take: 5,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    requests: countBy(
      requests.map((row) => ({ key: row.status, count: row._count._all })),
      ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const,
    ),
    offers: countBy(
      offers.map((row) => ({ key: row.status, count: row._count._all })),
      ['PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'] as const,
    ),
    tasksCreated: countBy(
      tasks.map((row) => ({ key: row.status, count: row._count._all })),
      ['OPEN', 'COMPLETED', 'CANCELLED'] as const,
    ),
    upcomingRegistrations: upcoming,
    unreadNotifications: unread,
  };
}
