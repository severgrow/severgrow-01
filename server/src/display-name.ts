// Free-text display names: the one place that decides what a signed-in player may call themselves.
//
// The earlier rule was "nature names only — no free-text moderation surface". Once accounts existed
// the owner deliberately reversed that: a name is now chosen by the player and STORED. What a name
// may be is decided HERE, on the server, once. The client's own filter is a courtesy for a nicer
// error, never the authority (the API re-checks everything).
//
// A display name is NOT a unique key and does not have to be: `src/player-tag.ts` still derives the
// permanent #tag from the player id, so renaming never moves it and two players may share a name.
//
// What this refuses, and why:
//   * empty after trimming;
//   * longer than DISPLAY_NAME_MAX (or shorter than DISPLAY_NAME_MIN) once normalised;
//   * control or format characters (newlines, tabs, zero-width joiners, bidi overrides) — refused
//     outright rather than silently squashed, because they only ever exist to spoof;
//   * anything outside letters (accents included), digits, spaces and - _ ' ;
//   * a name that is only punctuation/whitespace (it must carry at least one letter or digit);
//   * a short, normalised blocklist, matched against a form that survives leetspeak and spacing.

import { ApiError } from './errors.js';

export const DISPLAY_NAME_MIN = 1;
/**
 * THE OWNER'S LIMIT (2026-10-30): "make the account names be max 8 characters".
 *
 * "Existing longer names are LEFT ALONE; enforce 8 only on NEW names and RENAMES." That is why the
 * length check runs only when the candidate actually DIFFERS from the name already stored: a
 * legacy player may re-save their own long name unchanged, and nothing ever re-validates a name
 * that is already in the database. Guests' generated nature names are not chosen names and are
 * untouched by this rule.
 */
export const DISPLAY_NAME_MAX = 8;

/**
 * Letters (any script, accents included), digits, space and the small punctuation set `- _ '`.
 * Everything else — emoji too — is refused. Emoji are excluded on purpose for v1: they widen the
 * spoofing surface (a name that is only a picture) and the blocklist cannot reason about them.
 */
const ALLOWED = /^[\p{L}\p{N} '_-]+$/u;

/** Control (`\p{Cc}`) or format (`\p{Cf}`) characters: newline, tab, NUL, ZWJ, RTL overrides. */
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;

/** A name must carry at least one letter or digit — "..." or "   " is not a name. */
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Trim the ends, collapse every run of whitespace to one space, and fold the typographic
 * apostrophes people actually type into the ASCII one the charset allows.
 */
export const normalizeDisplayName = (raw: string): string =>
  raw
    .normalize('NFC')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .trim()
    .replace(/\s+/g, ' ');

/**
 * Short, deliberately imperfect list. A blocklist cannot be complete and WILL need upkeep; it is a
 * v1 speed bump, not a moderation system. Kept short so it does not start refusing innocent names
 * (the classic "Scunthorpe" problem is real: any substring list has false positives).
 */
const BLOCKED_WORDS: readonly string[] = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'dick',
  'cock',
  'pussy',
  'bastard',
  'whore',
  'slut',
  'faggot',
  'nigger',
  'nigga',
  'kike',
  'retard',
  'hitler',
  'nazi',
  'tranny',
];

/** Leetspeak / symbol substitutes, so "@" reads as "a" and "0" as "o" before matching. */
const LEET: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '8': 'b',
  '3': 'e',
  '£': 'e',
  '6': 'g',
  '9': 'g',
  '1': 'i',
  '!': 'i',
  '|': 'l',
  '0': 'o',
  '5': 's',
  $: 's',
  '7': 't',
  '+': 't',
};

/**
 * The form the blocklist is matched against. Accents are folded away, leetspeak is spelled out,
 * EVERY separator is dropped (so "s p a c e d" reads as one word) and runs of one character are
 * collapsed (so "fuuuck" reads as "fuck"). The same function runs over the blocklist at start-up,
 * so both sides are compared in the same shape.
 */
export const filterForm = (raw: string): string => {
  let out = '';
  for (const ch of raw.normalize('NFKD').toLowerCase()) {
    if (/\p{M}/u.test(ch)) continue; // a combining accent: the base letter is already there
    out += LEET[ch] ?? ch;
  }
  return out
    .replace(/[^a-z0-9]+/g, '')
    .replace(/(.)\1+/g, '$1');
};

const BLOCKED_FORMS: readonly string[] = BLOCKED_WORDS.map(filterForm).filter((w) => w.length > 0);

/** True when the filtered form contains any blocked word. */
export const isBlockedName = (raw: string): boolean => {
  const form = filterForm(raw);
  return BLOCKED_FORMS.some((word) => form.includes(word));
};

/** Why a name was refused. The API answers INVALID_REQUEST; the message names the actual problem. */
export type NameProblem = 'empty' | 'length' | 'chars' | 'blocked';

export type DisplayNameCheck = { ok: true; value: string } | { ok: false; problem: NameProblem };

/** The one decision. Returns the NORMALISED name to store, or the problem to report. */
export const checkDisplayName = (
  raw: unknown,
  options: {
    /**
     * The name already stored for this player. A candidate that normalises to exactly this value is
     * not a NEW name, so a legacy name longer than `DISPLAY_NAME_MAX` can be kept as it is. Every
     * other check (characters, blocklist, non-empty) still applies.
     */
    current?: string | null;
  } = {},
): DisplayNameCheck => {
  if (typeof raw !== 'string') return { ok: false, problem: 'empty' };
  if (CONTROL_OR_FORMAT.test(raw)) return { ok: false, problem: 'chars' };
  const value = normalizeDisplayName(raw);
  if (value.length < DISPLAY_NAME_MIN) return { ok: false, problem: 'empty' };
  const unchanged = typeof options.current === 'string'
    && options.current.length > 0
    && value === normalizeDisplayName(options.current);
  if (!unchanged && value.length > DISPLAY_NAME_MAX) return { ok: false, problem: 'length' };
  if (!ALLOWED.test(value)) return { ok: false, problem: 'chars' };
  if (!HAS_LETTER_OR_DIGIT.test(value)) return { ok: false, problem: 'chars' };
  if (isBlockedName(value)) return { ok: false, problem: 'blocked' };
  return { ok: true, value };
};

const MESSAGES: Record<NameProblem, string> = {
  empty: `Pick a name of ${DISPLAY_NAME_MIN} to ${DISPLAY_NAME_MAX} characters.`,
  length: `A name can be at most ${DISPLAY_NAME_MAX} characters.`,
  chars: "Use letters, numbers, spaces or - _ ' only.",
  blocked: 'That name cannot be used.',
};

/** The service's entry point: the normalised name, or an ApiError the route already knows how to send. */
export const assertDisplayName = (raw: unknown, current: string | null = null): string => {
  const checked = checkDisplayName(raw, { current });
  if (checked.ok) return checked.value;
  throw new ApiError('INVALID_REQUEST', MESSAGES[checked.problem]);
};
