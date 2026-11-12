// THE RESUME TOKEN of a sliced proof check (2026-11-12, seeds/verify.ts `stepOfflineMatch`).
//
// It says "for THIS player and THIS exact proof, opening `opening` is proven up to bot move `at`",
// signed by the server (HMAC-SHA-256 with a server secret), so the page can carry it but never
// forge or move it. It expires after RESUME_TTL_MS. Format: base64url(JSON body) + '.' + hex MAC.
import { sha256Hex } from '../sha256.js';

export const RESUME_TTL_MS = 15 * 60_000;

export type ResumePoint = { opening: number; at: number };
type Body = { p: string; d: string; o: number; a: number; e: number };

const b64url = (text: string): string => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (text: string): string => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

const mac = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
};

/** The exact proof a token belongs to: its source, its moves and its bot version. */
export const proofDigest = (source: unknown, actions: unknown, botVersion: string): string =>
  sha256Hex(JSON.stringify({ source, actions, botVersion }));

export const signResume = async (secret: string, playerId: string, digest: string, point: ResumePoint, now: number): Promise<string> => {
  const body = b64url(JSON.stringify({ p: playerId, d: digest, o: point.opening, a: point.at, e: now + RESUME_TTL_MS } satisfies Body));
  return `${body}.${await mac(secret, body)}`;
};

/** The resume point, or null when the token is not this server's, not this player's, not this proof's, or expired. */
export const readResume = async (secret: string, token: string, playerId: string, digest: string, now: number): Promise<ResumePoint | null> => {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = await mac(secret, body);
  // Constant-time comparison of two hex strings of the same length.
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return null;
  let parsed: Body;
  try { parsed = JSON.parse(fromB64url(body)) as Body; } catch { return null; }
  if (parsed.p !== playerId || parsed.d !== digest || !(parsed.e >= now)) return null;
  if (!Number.isSafeInteger(parsed.o) || !Number.isSafeInteger(parsed.a) || parsed.o < 0 || parsed.a < 0) return null;
  return { opening: parsed.o, at: parsed.a };
};
