import argon2 from 'argon2';

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

export async function verifyAgainstDummy(plain: string): Promise<void> {
  dummyHash ??= hashPassword('volunteerhub-dummy-password-for-timing');
  await verifyPassword(await dummyHash, plain);
}
