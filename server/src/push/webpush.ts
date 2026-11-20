// WEB PUSH TRANSPORT — VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291), on Web Crypto.
//
// Why hand-written: the Edge runtime is Deno, and the usual `web-push` package is Node-only
// (http/https sockets). Everything here is WebCrypto + `fetch`, so the SAME code runs on Node and on
// Supabase Edge. No dependency is added.
//
// A failed send is a NOTHING: it returns `{ ok: false }` and never throws, because a push is never
// on the path of a game, a turn or a render. A 404/410 means the browser dropped the subscription
// and the caller removes the row.
import type { PushSender, PushTarget } from './types.js';
import type { PushPayload } from './types.js';
import type { webcrypto } from 'node:crypto';

// The Web Crypto key types live in the DOM lib, which the server does not load. These aliases are
// type-only (erased at build time), so the same code stays runnable on Deno Edge.
type CryptoKey = webcrypto.CryptoKey;
type CryptoKeyPair = webcrypto.CryptoKeyPair;
type JsonWebKey = webcrypto.JsonWebKey;

export type VapidOptions = Readonly<{
  /** Uncompressed P-256 public key (base64url, 65 bytes, starts 0x04). */
  publicKey: string;
  /** The 32-byte private scalar (base64url). Never logged. */
  privateKey: string;
  /** VAPID `sub`: a `mailto:` or `https://` contact. */
  subject: string;
  ttlSeconds?: number;
}>;

type FetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body?: Uint8Array;
}) => Promise<{ ok: boolean; status: number }>;

const enc = new TextEncoder();

const b64u = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

/** Strict base64url decode. Returns null for anything that is not a whole number of bytes. */
export const b64uDecode = (value: unknown): Uint8Array | null => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return null;
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
};

const concat = (...parts: readonly Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const u32 = (value: number): Uint8Array => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
};

/** HKDF-Expand only (RFC 5869 §2.3); the extract step is the HMAC the caller already made. */
const hkdfExpand = async (prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const out = new Uint8Array(length);
  let previous = new Uint8Array(0);
  let offset = 0;
  let counter = 1;
  while (offset < length && counter <= 255) {
    const block = new Uint8Array(await crypto.subtle.sign('HMAC', key, concat(previous, info, new Uint8Array([counter]))));
    const take = Math.min(block.length, length - offset);
    out.set(block.subarray(0, take), offset);
    previous = block;
    offset += take;
    counter += 1;
  }
  return out;
};

const hmac = async (keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
};

/** The private VAPID key as a signing key, or null when the pair does not decode. */
const importVapidPrivateKey = async (publicKey: string, privateKey: string): Promise<CryptoKey | null> => {
  const pub = b64uDecode(publicKey);
  const priv = b64uDecode(privateKey);
  if (!pub || pub.length !== 65 || pub[0] !== 0x04) return null;
  if (!priv || priv.length !== 32) return null;
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: b64u(pub.subarray(1, 33)),
    y: b64u(pub.subarray(33, 65)),
    d: b64u(priv),
    ext: true,
  };
  try {
    return await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  } catch {
    return null;
  }
};

/**
 * The `Authorization: vapid …` value. ES256 over the JWTs; `aud` is the ENDPOINT's origin, so a
 * token minted for one push service is useless against another (the reason VAPID is safe to sign).
 */
export const vapidAuthorization = async (
  endpoint: string,
  options: VapidOptions,
  nowMs: number,
  key: CryptoKey,
): Promise<string | null> => {
  let origin: string;
  try {
    origin = new URL(endpoint).origin;
  } catch {
    return null;
  }
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({
    aud: origin,
    exp: Math.floor(nowMs / 1000) + 12 * 60 * 60,
    sub: options.subject,
  })));
  const signingInput = enc.encode(`${header}.${claims}`);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput));
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${options.publicKey}`;
};

export type EncryptOptions = Readonly<{
  /** Test seam: a fixed ephemeral key pair, so a test can decrypt what it sent. */
  ephemeral?: CryptoKeyPair;
  /** Test seam: a fixed 16-byte salt. */
  salt?: Uint8Array;
}>;

/**
 * RFC 8291 aes128gcm for one subscription. Returns the complete request body (header + ciphertext),
 * or null when the subscription's keys are malformed (a browser that produced garbage; never ours).
 */
export const encryptPayload = async (
  payload: PushPayload,
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  options: EncryptOptions = {},
): Promise<Uint8Array | null> => {
  const uaPublicRaw = b64uDecode(target.p256dh);
  const authSecret = b64uDecode(target.auth);
  if (!uaPublicRaw || uaPublicRaw.length !== 65 || uaPublicRaw[0] !== 0x04) return null;
  if (!authSecret || authSecret.length !== 16) return null;
  try {
    const ephemeral = options.ephemeral ??
      (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair);
    const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
    const uaPublic = await crypto.subtle.importKey('raw', uaPublicRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublic }, ephemeral.privateKey, 256),
    );
    // HKDF-Extract(auth_secret, ecdh_secret), then Expand with the "WebPush: info" context.
    const prkKey = await hmac(authSecret, shared);
    const ikm = await hkdfExpand(prkKey, concat(enc.encode('WebPush: info\0'), uaPublicRaw, asPublicRaw), 32);
    const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
    if (salt.length !== 16) return null;
    const prk = await hmac(salt, ikm);
    const cek = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\0'), 12);
    // One record, no padding: the plaintext ends with the 0x02 "last record" delimiter.
    const plaintext = concat(enc.encode(JSON.stringify(payload)), new Uint8Array([0x02]));
    const header = concat(salt, u32(4096), new Uint8Array([asPublicRaw.length]), asPublicRaw);
    const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: header, tagLength: 128 },
      aesKey,
      plaintext,
    ));
    return concat(header, ciphertext);
  } catch {
    return null;
  }
};

export type WebPushSenderOptions = Readonly<{
  vapid: VapidOptions;
  now?: () => number;
  fetch?: FetchLike;
}>;

/**
 * A sender bound to one VAPID pair. `send` never throws: every failure is a `{ ok: false }` and a
 * 404/410 also says `gone` so the caller can drop the dead subscription.
 */
export const createWebPushSender = (options: WebPushSenderOptions): PushSender => {
  const now = options.now ?? (() => Date.now());
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const ttl = options.vapid.ttlSeconds ?? 60 * 60 * 24;
  let signingKey: Promise<CryptoKey | null> | null = null;
  const key = (): Promise<CryptoKey | null> => {
    signingKey ??= importVapidPrivateKey(options.vapid.publicKey, options.vapid.privateKey);
    return signingKey;
  };

  return {
    async send(target, payload) {
      try {
        const keyOrNull = await key();
        if (!keyOrNull) return { ok: false };
        const authorization = await vapidAuthorization(target.endpoint, options.vapid, now(), keyOrNull);
        if (!authorization) return { ok: false };
        const body = await encryptPayload(payload, target);
        if (!body) return { ok: false };
        const response = await doFetch(target.endpoint, {
          method: 'POST',
          headers: {
            authorization,
            'content-encoding': 'aes128gcm',
            'content-type': 'application/octet-stream',
            ttl: String(ttl),
            urgency: 'normal',
          },
          body,
        });
        if (response.ok) return { ok: true };
        return { ok: false, ...(response.status === 404 || response.status === 410 ? { gone: true } : {}) };
      } catch {
        return { ok: false };
      }
    },
  };
};
