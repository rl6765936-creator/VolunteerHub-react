import type { Prisma } from '../../generated/prisma/client.js';
import type { Weekday } from '../../generated/prisma/enums.js';
import type { Db } from '../../lib/prisma.js';
import { requestSummaryInclude, serializeRequestSummary } from '../requests/requests.serializer.js';
import { taskDetailInclude } from '../tasks/taskAccess.js';
import { serializeTask } from '../tasks/tasks.serializer.js';
import { fullTaskIds } from '../tasks/tasks.service.js';

const WEEKDAYS: Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const CANDIDATES = 200;
export const MATCH_LIMIT = 20;

/** The weekday of a date in the configured time zone. */
export function weekdayIn(date: Date, timeZone: string): Weekday {
  const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(date);
  return WEEKDAYS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short)] ?? 'SUN';
}

/**
 * Rule-based matching (no AI): published, open tasks and requests that fit the volunteer's
 * profile. Each filter applies only when the profile sets it:
 * region (contains), interest categories, and available weekdays (tasks only).
 * Own items, full tasks and items the user already registered for or offered on are excluded.
 */
export async function getMatches(prisma: Db, userId: string, timeZone: string) {
  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId },
    select: { region: true, availableDays: true, interests: { select: { id: true } } },
  });
  if (!profile) {
    return { profileComplete: false, criteria: null, tasks: [], requests: [] };
  }
  const categoryIds = profile.interests.map((category) => category.id);
  const region = profile.region
    ? { region: { contains: profile.region, mode: 'insensitive' as const } }
    : {};
  const categories = categoryIds.length > 0 ? { categoryId: { in: categoryIds } } : {};

  const full = await fullTaskIds(prisma);
  const taskWhere: Prisma.VolunteerTaskWhereInput = {
    moderationStatus: 'APPROVED',
    status: 'OPEN',
    startsAt: { gt: new Date() },
    createdById: { not: userId },
    registrations: { none: { userId, status: 'CONFIRMED' } },
    ...(full.length > 0 && { id: { notIn: full } }),
    ...region,
    ...categories,
  };
  const requestWhere: Prisma.HelpRequestWhereInput = {
    moderationStatus: 'APPROVED',
    status: 'OPEN',
    ownerId: { not: userId },
    offers: { none: { volunteerId: userId, status: { in: ['PENDING', 'ACCEPTED'] } } },
    ...region,
    ...categories,
  };
  const [tasks, requests] = await Promise.all([
    prisma.volunteerTask.findMany({
      where: taskWhere,
      include: taskDetailInclude,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: CANDIDATES,
    }),
    prisma.helpRequest.findMany({
      where: requestWhere,
      include: requestSummaryInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: MATCH_LIMIT,
    }),
  ]);
  const days = new Set(profile.availableDays);
  const fitting =
    days.size > 0 ? tasks.filter((task) => days.has(weekdayIn(task.startsAt, timeZone))) : tasks;

  return {
    profileComplete: true,
    criteria: {
      region: profile.region,
      categoryIds,
      availableDays: profile.availableDays,
      timeZone,
    },
    tasks: fitting.slice(0, MATCH_LIMIT).map((task) => serializeTask(task)),
    requests: requests.map((row) => serializeRequestSummary(row)),
  };
}
