import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Allowed image types, identified by their magic bytes (the client's Content-Type is ignored). */
const SIGNATURES: { mimeType: string; extension: string; matches: (b: Buffer) => boolean }[] = [
  {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    extension: 'png',
    matches: (b) =>
      b.length >= 8 &&
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mimeType: 'image/webp',
    extension: 'webp',
    matches: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

export function detectImageType(buffer: Buffer): { mimeType: string; extension: string } | null {
  const match = SIGNATURES.find((signature) => signature.matches(buffer));
  return match ? { mimeType: match.mimeType, extension: match.extension } : null;
}

const STORAGE_KEY = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * Local-disk file storage. Files get random names (never the client's file name) and are
 * only served through a permission-checked endpoint, never as static files.
 */
export class LocalStorage {
  readonly root: string;

  constructor(dir: string) {
    this.root = path.resolve(dir);
  }

  async save(buffer: Buffer, extension: string): Promise<string> {
    await mkdir(this.root, { recursive: true });
    const key = `${randomUUID()}.${extension}`;
    await writeFile(this.pathFor(key), buffer, { flag: 'wx' });
    return key;
  }

  /** Resolves a stored key to an absolute path; rejects anything that is not one of our keys. */
  pathFor(key: string): string {
    if (!STORAGE_KEY.test(key)) throw new Error('Invalid storage key');
    return path.join(this.root, key);
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.pathFor(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
