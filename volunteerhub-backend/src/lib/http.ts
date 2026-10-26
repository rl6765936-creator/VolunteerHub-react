import { z } from 'zod';

export const uuidParam = z.uuid();

export const idParams = z.object({ id: uuidParam });

export function parseId(value: unknown): string {
  return uuidParam.parse(value);
}

export const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

export const queryBoolean = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((value) => value === 'true' || value === '1');
