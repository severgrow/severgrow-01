// Nicknames: 3-14 characters (letters, numbers, space, _ and -), unique ignoring case
// and look-alikes, a basic blocklist, changeable once per 30 days.
import { DEFAULT_WORLD_CONFIG } from './config.js';
import type { WorldConfig } from './config.js';
import type { Account, Fail } from './types.js';

const SHAPE = /^[A-Za-z0-9_-](?:[A-Za-z0-9_-]| (?! ))*[A-Za-z0-9_-]$/;
const LOOKALIKE: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', $: 's', '7': 't', '8': 'b', '9': 'g', v: 'u', l: 'i' };

/** Lower case, look-alikes folded, spaces and _ - removed: "F u_c-k" and "fvck" both become "fuck"-like. */
export const normalizeNickname = (name: string): string =>
  [...name.toLowerCase()].map((ch) => LOOKALIKE[ch] ?? ch).filter((ch) => /[a-z]/.test(ch)).join('');

// A short, basic list (folded the same way). Matches anywhere in the name.
const BLOCKED = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'rape', 'nazi', 'hitier', 'whore', 'siut', 'dick', 'cock', 'pussy', 'penis', 'porn', 'kkk', 'retard'].map(normalizeNickname);
// Names that could pretend to be staff.
const RESERVED = ['admin', 'moderator', 'mod', 'severgrow', 'official', 'support'].map(normalizeNickname);

export const validateNickname = (name: string): { ok: true } | Fail => {
  if (typeof name !== 'string' || name.length < 3 || name.length > 14) return { ok: false, reason: 'Use 3 to 14 characters.' };
  if (!SHAPE.test(name)) return { ok: false, reason: 'Use letters, numbers, single spaces, _ or -.' };
  const n = normalizeNickname(name);
  if (n.length < 2) return { ok: false, reason: 'Use some letters in your name.' };
  if (BLOCKED.some((b) => n.includes(b))) return { ok: false, reason: 'Please pick a different name.' };
  if (RESERVED.some((b) => n === b || n.startsWith(b))) return { ok: false, reason: 'That name is reserved.' };
  return { ok: true };
};

export const changeNickname = (
  account: Account,
  name: string,
  taken: ReadonlySet<string>,
  now: number,
  cfg: WorldConfig = DEFAULT_WORLD_CONFIG,
): { ok: true; account: Account } | Fail => {
  const v = validateNickname(name);
  if (!v.ok) return v;
  if (account.nicknameChangedAt !== null && now - account.nicknameChangedAt < cfg.nicknameChangeEvery) return { ok: false, reason: 'You can change your name once every 30 days.' };
  if (taken.has(normalizeNickname(name)) && normalizeNickname(account.nickname ?? '') !== normalizeNickname(name)) return { ok: false, reason: 'That name is taken.' };
  return { ok: true, account: { ...account, nickname: name, nicknameChangedAt: now } };
};
