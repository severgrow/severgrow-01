// The transport itself: a VAPID token that verifies with the public key, and an aes128gcm body that
// the BROWSER's private key can actually decrypt. A fake push service collects the request; nothing
// leaves the process. This is the test that catches a broken HKDF order before a phone shows nothing.
import { describe, expect, it } from 'vitest';
import type { webcrypto } from 'node:crypto';
import { b64uDecode, createWebPushSender, encryptPayload } from '../src/push/webpush.js';
import type { PushPayload } from '../src/push/types.js';

type CryptoKeyPair = webcrypto.CryptoKeyPair;
type JsonWebKey = webcrypto.JsonWebKey;

const enc = new TextEncoder();
const b64u = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};
const hmac = async (key: Uint8Array, message: Uint8Array): Promise<Uint8Array> => {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, message));
};
const hkdf = async (prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> => {
  const k = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const out = new Uint8Array(length);
  let previous = new Uint8Array(0);
  let offset = 0;
  for (let counter = 1; offset < length; counter++) {
    const block = new Uint8Array(await crypto.subtle.sign('HMAC', k, concat(previous, info, new Uint8Array([counter]))));
    out.set(block.subarray(0, Math.min(block.length, length - offset)), offset);
    previous = block;
    offset += block.length;
  }
  return out;
};

const uaKeys = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, publicRaw, auth, p256dh: b64u(publicRaw), authB64: b64u(auth) };
};

const vapidKeys = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey;
  return { pair, publicKey: b64u(publicRaw), privateKey: String(jwk.d), publicRaw };
};

/** Unwrap one RFC 8291 record exactly as a browser does. */
const decrypt = async (
  body: Uint8Array,
  ua: Awaited<ReturnType<typeof uaKeys>>,
): Promise<string> => {
  const salt = body.subarray(0, 16);
  const idLength = body[20]!;
  const senderPublic = body.subarray(21, 21 + idLength);
  const header = body.subarray(0, 21 + idLength);
  const ciphertext = body.subarray(21 + idLength);
  const senderKey = await crypto.subtle.importKey('raw', senderPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: senderKey }, ua.pair.privateKey, 256));
  const prkKey = await hmac(ua.auth, shared);
  const ikm = await hkdf(prkKey, concat(enc.encode('WebPush: info\0'), ua.publicRaw, senderPublic), 32);
  const prk = await hmac(salt, ikm);
  const cek = await hkdf(prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(prk, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: header, tagLength: 128 },
    aes,
    ciphertext,
  ));
  return new TextDecoder().decode(plain.subarray(0, plain.length - 1));
};

const payload: PushPayload = { title: 'Your turn', body: 'RYK played.', url: './', tag: 'match:m1', kind: 'turn' };

describe('web push transport', () => {
  it('signs a VAPID token for the endpoint origin and the browser can decrypt the payload', async () => {
    const ua = await uaKeys();
    const vapid = await vapidKeys();
    const calls: { url: string; headers: Record<string, string>; body?: Uint8Array }[] = [];
    const sender = createWebPushSender({
      vapid: { publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: 'mailto:owner@example.test', ttlSeconds: 3600 },
      now: () => 1_700_000_000_000,
      fetch: async (url, init) => { calls.push({ url, ...init }); return { ok: true, status: 201 }; },
    });

    const target = { endpoint: 'https://push.example.test/send/abc', p256dh: ua.p256dh, auth: ua.authB64 };
    expect(await sender.send(target, payload)).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.headers['content-encoding']).toBe('aes128gcm');
    expect(call.headers.ttl).toBe('3600');

    const match = /^vapid t=([^,]+), k=(.+)$/.exec(call.headers.authorization!)!;
    const jwt = match[1]!;
    expect(match[2]).toBe(vapid.publicKey);
    const [header, claims, signature] = jwt.split('.');
    const verifyKey = await crypto.subtle.importKey('raw', vapid.publicRaw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      b64uDecode(signature!)!,
      enc.encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
    const parsed = JSON.parse(new TextDecoder().decode(b64uDecode(claims!)!)) as { aud: string; exp: number; sub: string };
    expect(parsed.aud).toBe('https://push.example.test'); // bound to the push service, not a bearer token
    expect(parsed.sub).toBe('mailto:owner@example.test');
    expect(parsed.exp).toBeGreaterThan(1_700_000_000);

    expect(JSON.parse(await decrypt(call.body!, ua))).toEqual(payload);
  });

  it('a 410 is a gone subscription; a refused fetch is never an exception', async () => {
    const ua = await uaKeys();
    const vapid = await vapidKeys();
    const target = { endpoint: 'https://push.example.test/send/abc', p256dh: ua.p256dh, auth: ua.authB64 };
    const gone = createWebPushSender({
      vapid: { publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: 'https://futasaku.com' },
      fetch: async () => ({ ok: false, status: 410 }),
    });
    expect(await gone.send(target, payload)).toEqual({ ok: false, gone: true });

    const broken = createWebPushSender({
      vapid: { publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: 'https://futasaku.com' },
      fetch: async () => { throw new Error('offline'); },
    });
    await expect(broken.send(target, payload)).resolves.toEqual({ ok: false });
  });

  it('malformed subscription keys and a malformed VAPID pair send nothing', async () => {
    const sender = createWebPushSender({
      vapid: { publicKey: 'AAAA', privateKey: 'BBBB', subject: 'https://futasaku.com' },
      fetch: async () => ({ ok: true, status: 201 }),
    });
    expect(await sender.send({ endpoint: 'https://push.example.test/x', p256dh: 'AAAA', auth: 'AAAA' }, payload)).toEqual({ ok: false });
    expect(await encryptPayload(payload, { p256dh: 'AAAA', auth: 'AAAA' })).toBeNull();
  });
});
