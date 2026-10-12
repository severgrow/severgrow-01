// Identity primitives: opaque ids, bearer tokens (hashed at rest) and private invite codes.
// Uses Web Crypto + a pure SHA-256 so the same module runs on Node 20+ and Deno Edge.
import { sha256Hex } from './sha256.js';

const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

const base64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  // `btoa` exists on Node 20+ and Deno Edge — avoid `Buffer` so the Edge bundle stays isomorphic.
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const newId = (): string => globalThis.crypto.randomUUID();

/** A fresh bearer token. Shown to the player once; only its hash is ever stored. */
export const newToken = (): string => base64Url(randomBytes(32));

export const hashToken = (token: string): string => sha256Hex(token);

/**
 * Crockford base32 without I, L, O, U (no look-alike confusion). 32 divides 256 exactly, so
 * mapping a random byte to a character has no modulo bias.
 */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const newInviteCode = (length: number): string => {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!;
  return out;
};

/** Matches are normalised before lookup so case and stray spaces never produce a false miss. */
export const normalizeInviteCode = (code: string): string => code.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');

/** A server-chosen match seed (32-bit unsigned). The deal follows from it, so a player must never choose it. */
export const newSeed = (): number => {
  const bytes = randomBytes(4);
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
};
