import type { UserRole } from '../../generated/prisma/enums.js';

export const privateUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const meSelect = { ...privateUserSelect, phone: true } as const;

export const adminUserSelect = { ...meSelect, status: true } as const;

export const publicUserSelect = { id: true, name: true } as const;

export const contactUserSelect = { id: true, name: true, email: true, phone: true } as const;

export interface PrivateUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}
