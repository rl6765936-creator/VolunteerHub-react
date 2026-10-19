import { z } from 'zod';
import { RegistrationStatus, TaskStatus } from '../../generated/prisma/enums.js';
import { queryBoolean, text } from '../../lib/http.js';
import { paginationQuery } from '../../lib/pagination.js';
import { moderationStatusQuery } from '../moderation/moderation.schemas.js';

const futureDate = z.coerce
  .date()
  .refine((date) => date.getTime() > Date.now(), 'must be in the future');

export const MAX_CAPACITY = 1000;
const capacity = z.coerce.number().int().min(1).max(MAX_CAPACITY);

/**
 * Material fields: changing any of them on a published task requires re-moderation and
 * notifies registered volunteers. Capacity is not material (but can never drop below the
 * number of confirmed registrations).
 */
export const MATERIAL_TASK_FIELDS = [
  'title',
  'description',
  'categoryId',
  'region',
  'location',
  'startsAt',
  'endsAt',
] as const;

export const createTaskBody = z
  .object({
    title: text(3, 120),
    description: text(10, 4000),
    categoryId: z.uuid(),
    region: text(2, 80),
    location: text(2, 300),
    startsAt: futureDate,
    endsAt: z.coerce.date(),
    capacity,
  })
  .strict()
  .refine((body) => body.endsAt > body.startsAt, {
    message: 'must be after startsAt',
    path: ['endsAt'],
  });

export const updateTaskBody = z
  .object({
    title: text(3, 120),
    description: text(10, 4000),
    categoryId: z.uuid(),
    region: text(2, 80),
    location: text(2, 300),
    startsAt: futureDate,
    endsAt: z.coerce.date(),
    capacity,
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update.');

export const taskSort = z.enum(['startsAt', 'newest']).default('startsAt');

export const listTasksQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  categoryId: z.uuid().optional(),
  region: z.string().trim().max(80).optional(),
  status: z.enum(TaskStatus).default('OPEN'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Only tasks that still have free places. */
  availableOnly: queryBoolean,
  /** Include tasks that already started (default: upcoming only). */
  includePast: queryBoolean,
  sort: taskSort,
});

export const myTasksQuery = paginationQuery.extend({
  status: z.enum(TaskStatus).optional(),
  moderationStatus: moderationStatusQuery,
});

export const adminListTasksQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  moderationStatus: moderationStatusQuery,
  status: z.enum(TaskStatus).optional(),
  sort: taskSort,
});

export const registrationsQuery = z.object({
  status: z.enum(RegistrationStatus).optional(),
});

export const myRegistrationsQuery = paginationQuery.extend({
  status: z.enum(RegistrationStatus).optional(),
  /** Only registrations for tasks that have not started yet. */
  upcomingOnly: queryBoolean,
});
