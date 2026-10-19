import { z } from 'zod';
import { ModerationStatus } from '../../generated/prisma/enums.js';
import { optionalText, text } from '../../lib/http.js';

/** Shared by help requests and volunteer tasks. */
export const approveBody = z.object({ note: optionalText(500) }).strict();
export const rejectBody = z.object({ reason: text(5, 500) }).strict();
export const cancelBody = z.object({ reason: optionalText(500) }).strict();

export const moderationStatusQuery = z.enum(ModerationStatus).optional();

/** Approved once and now pending again: hidden publicly until an admin re-approves it. */
export function isUnderReModeration(item: {
  moderationStatus: ModerationStatus;
  publishedAt: Date | null;
}): boolean {
  return item.moderationStatus === 'PENDING_REVIEW' && item.publishedAt !== null;
}
