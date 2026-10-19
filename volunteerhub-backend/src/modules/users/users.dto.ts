import type { UserRole } from '../../generated/prisma/enums.js';

/**
 * The user object of the auth responses (register, login). Same fields as VoiceUp, so the
 * VoiceUp React auth code works unchanged. passwordHash is never selected, so it cannot leak.
 */
export const privateUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** GET/PATCH /api/users/me: the auth fields plus the user's own contact phone. */
export const meSelect = { ...privateUserSelect, phone: true } as const;

/** Admin views also show the account status. */
export const adminUserSelect = { ...meSelect, status: true } as const;

/** What other users may see about a person: their display name only, never the email. */
export const publicUserSelect = { id: true, name: true } as const;

/** Contact details, revealed only to an accepted counterpart, the owner and admins. */
export const contactUserSelect = { id: true, name: true, email: true, phone: true } as const;

export interface PrivateUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}
