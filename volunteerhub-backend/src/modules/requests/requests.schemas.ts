import { z } from 'zod';
import { HelpRequestStatus } from '../../generated/prisma/enums.js';
import { optionalText, text } from '../../lib/http.js';
import { paginationQuery } from '../../lib/pagination.js';
import { moderationStatusQuery } from '../moderation/moderation.schemas.js';

const futureDate = z.coerce
  .date()
  .refine((date) => date.getTime() > Date.now(), 'must be in the future');

/** Every editable field is material content, so any change to a published request is re-moderated. */
export const createRequestBody = z
  .object({
    title: text(3, 120),
    description: text(10, 4000),
    categoryId: z.uuid(),
    region: text(2, 80),
    addressDetails: optionalText(300),
    neededBy: futureDate.optional(),
  })
  .strict();

export const updateRequestBody = z
  .object({
    title: text(3, 120),
    description: text(10, 4000),
    categoryId: z.uuid(),
    region: text(2, 80),
    addressDetails: optionalText(300).nullable(),
    neededBy: futureDate.nullable(),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update.');

export const requestSort = z.enum(['newest', 'oldest', 'neededBy']).default('newest');

export const listRequestsQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  categoryId: z.uuid().optional(),
  region: z.string().trim().max(80).optional(),
  status: z.enum(HelpRequestStatus).default('OPEN'),
  sort: requestSort,
});

export const myRequestsQuery = paginationQuery.extend({
  status: z.enum(HelpRequestStatus).optional(),
  moderationStatus: moderationStatusQuery,
});

export const adminListRequestsQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  moderationStatus: moderationStatusQuery,
  status: z.enum(HelpRequestStatus).optional(),
  sort: requestSort,
});
