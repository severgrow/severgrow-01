// Push configuration — ONE switch, read from the environment (or Edge secrets).
//
// The feature is OFF unless `PUSH_ENABLED` is truthy AND both VAPID keys are present. Unset/partial
// config means every push route answers 404 and `/v1/health` does not carry a `push` block, so a
// page never offers the Settings switch. That is the owner's kill switch: remove the variable (or
// set it to 0) and the whole feature is dark without a code change.
import { readEnv } from '../config.js';

export const PUSH_FEATURE = 'push-notifications';

export type PushConfig = Readonly<{
  enabled: boolean;
  /** The public key a page subscribes with. Public by design; never in the repo. */
  publicKey: string | null;
  privateKey: string | null;
  /** A `mailto:` or `https://` contact for the push service (VAPID `sub`). */
  subject: string;
  /** Optional. When set, `/v1/push/dispatch` requires `x-futasaku-push` to match it. */
  dispatchToken: string | null;
  ttlSeconds: number;
  /** Nudges a player's own page may trigger per hour (a cheap check, never a send loop). */
  nudgePerPlayerPerHour: number;
  /** Reminder sweeps from one address per hour. */
  dispatchPerIpPerHour: number;
  /** How many pending challenges one sweep may look at. */
  dispatchLimit: number;
}>;

const flag = (value: string | undefined): boolean => {
  const v = (value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
};

const int = (value: string | undefined, fallback: number, min: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
};

/** Does this string decode to exactly `length` bytes of base64url? A typo must keep the feature dark. */
const decodesTo = (value: string, length: number): boolean => {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return false;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return atob(padded).length === length;
  } catch {
    return false;
  }
};

/** The public half must be an uncompressed P-256 point (0x04 + 64 bytes); the private a 32-byte scalar. */
export const validVapidPair = (publicKey: string | null, privateKey: string | null): boolean => {
  if (!publicKey || !privateKey || !decodesTo(publicKey, 65) || !decodesTo(privateKey, 32)) return false;
  try {
    const normalized = publicKey.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return atob(padded).charCodeAt(0) === 0x04;
  } catch {
    return false;
  }
};

export const pushConfigFromEnv = (env: (name: string) => string | undefined = readEnv): PushConfig => {
  const publicKey = (env('VAPID_PUBLIC_KEY') ?? '').trim() || null;
  const privateKey = (env('VAPID_PRIVATE_KEY') ?? '').trim() || null;
  const subject = (env('VAPID_SUBJECT') ?? '').trim() || 'https://futasaku.com';
  return {
    // Deliberately the AND: a half-configured deployment stays dark instead of failing every send.
    // The pair is also decoded here, so a typo in a secret reads as "off", never as silent failures.
    enabled: flag(env('PUSH_ENABLED')) && validVapidPair(publicKey, privateKey) && subject.length > 0,
    publicKey,
    privateKey,
    subject,
    dispatchToken: (env('PUSH_DISPATCH_TOKEN') ?? '').trim() || null,
    ttlSeconds: int(env('PUSH_TTL_SECONDS'), 60 * 60 * 24, 60),
    // One nudge is a cheap state read; a page at most asks every ~20 s. The cap is a flood stop.
    nudgePerPlayerPerHour: int(env('RATE_PUSH_NUDGE_PER_PLAYER_PER_HOUR'), 180, 1),
    dispatchPerIpPerHour: int(env('RATE_PUSH_DISPATCH_PER_IP_PER_HOUR'), 240, 1),
    dispatchLimit: int(env('PUSH_DISPATCH_LIMIT'), 200, 1),
  };
};

/** The dark default: what a server with no push configuration uses. */
export const PUSH_DISABLED: PushConfig = Object.freeze({
  enabled: false,
  publicKey: null,
  privateKey: null,
  subject: 'https://futasaku.com',
  dispatchToken: null,
  ttlSeconds: 60 * 60 * 24,
  nudgePerPlayerPerHour: 180,
  dispatchPerIpPerHour: 240,
  dispatchLimit: 200,
});

/**
 * The public half only: what `/v1/health` may say. A page needs the key to subscribe; it needs
 * nothing else, and the private key never leaves the sender.
 */
export const pushHealth = (config: PushConfig): { enabled: true; publicKey: string } | null =>
  config.enabled && config.publicKey ? { enabled: true, publicKey: config.publicKey } : null;
