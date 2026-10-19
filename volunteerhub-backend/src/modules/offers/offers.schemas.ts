import { z } from 'zod';
import { HelpOfferStatus } from '../../generated/prisma/enums.js';
import { text } from '../../lib/http.js';
import { paginationQuery } from '../../lib/pagination.js';

export const createOfferBody = z.object({ message: text(5, 1000) }).strict();

export const myOffersQuery = paginationQuery.extend({
  status: z.enum(HelpOfferStatus).optional(),
});
