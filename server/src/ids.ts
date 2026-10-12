// Identity primitives: opaque ids, bearer tokens (hashed at rest) and private invite codes.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();

/** A fresh bearer token. Shown to the player once; only its hash is ever stored. */
export const newToken = (): string => randomBytes(32).toString('base64url');

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Crockford base32 without I, L, O, U (no look-alike confusion). 32 divides 256 exactly, so
 * mapping a random byte to a character has no modulo bias.
 */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const newInviteCode = (length: number): string => {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
};

/** Matches are normalised before lookup so case and stray spaces never produce a false miss. */
export const normalizeInviteCode = (code: string): string => code.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');

/** A server-chosen match seed (32-bit unsigned). The deal follows from it, so a player must never choose it. */
export const newSeed = (): number => randomBytes(4).readUInt32BE(0);
