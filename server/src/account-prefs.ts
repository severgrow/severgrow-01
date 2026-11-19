// SETTINGS, LESSON PROGRESS AND TIPS FOLLOW THE ACCOUNT (owner decision 2026-11-18, accounts pass:
// "These follow the account to every device: SETTINGS (sound, left-hand, guide, reduced motion,
// Blitz preferences), STATS, LESSON PROGRESS, TIPS ALREADY SEEN. Server-stored, cached on the
// device, work offline, merged safely.") Stats already follow the account (`offline_stats`, per
// device, summed); this is the rest. Shared by the server and the page (pure, no I/O).
//
// Merge rules, chosen so no device can ever take another's progress back:
//   fields   one value per setting with the time it was chosen; per field the NEWER choice wins, and
//            a time is never later than the server's clock (a wrong device clock cannot win for ever)
//   tips     the tips already seen: union
//   lessons  lesson progress: per action the higher count, spotlights first-kept, hellos union;
//            a newer lesson version replaces an older one (as the device itself does)
import { ApiError } from './errors.js';

/** Advertised on `/v1/health` so a page can skip the route on an older server. */
export const ACCOUNT_PREFS_FEATURE = 'account-prefs';

/** The settings that follow the account: exactly the owner's list. Everything else stays per device. */
export const SYNCED_FIELDS = Object.freeze(['sound', 'vibration', 'reduceMotion', 'handSide', 'thumbLayout', 'guide', 'blitz'] as const);
export type SyncedField = (typeof SYNCED_FIELDS)[number];

export type PrefField = { v: unknown; at: number };
export type LessonProgress = { version: number; counts: Record<string, number>; spotlights: Record<string, string>; hellos: string[] };
export type PrefsDoc = { fields: Partial<Record<SyncedField, PrefField>>; tips: string[]; lessons: LessonProgress | null };

export const EMPTY_PREFS: PrefsDoc = Object.freeze({ fields: {}, tips: [], lessons: null }) as PrefsDoc;

const MAX_VALUE = 200; // characters of JSON per setting
const NAME = /^[a-z][a-zA-Z-]{0,23}$/;
const MAX_LIST = 32;
const isField = (k: string): k is SyncedField => (SYNCED_FIELDS as readonly string[]).includes(k);
const okTime = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
const names = (raw: unknown): string[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((x): x is string => typeof x === 'string' && NAME.test(x)))].sort().slice(0, MAX_LIST) : [];

const parseLessons = (raw: unknown): LessonProgress | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.version !== 'number' || !Number.isInteger(r.version) || r.version < 0) return null;
  const counts: Record<string, number> = {};
  if (r.counts && typeof r.counts === 'object') {
    for (const [k, n] of Object.entries(r.counts as Record<string, unknown>)) {
      if (NAME.test(k) && typeof n === 'number' && Number.isFinite(n) && n > 0) counts[k] = Math.min(1_000_000, Math.floor(n));
    }
  }
  const spotlights: Record<string, string> = {};
  if (r.spotlights && typeof r.spotlights === 'object') {
    for (const [lvl, kind] of Object.entries(r.spotlights as Record<string, unknown>)) {
      if (/^\d{1,3}$/.test(lvl) && typeof kind === 'string' && NAME.test(kind)) spotlights[lvl] = kind;
    }
  }
  return { version: r.version, counts: sortKeys(counts), spotlights: sortKeys(spotlights), hellos: names(r.hellos) };
};

const sortKeys = <T>(o: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** Read a device's or a stored document defensively: unknown fields and odd values are dropped. */
export const parsePrefs = (body: Record<string, unknown>): PrefsDoc => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('INVALID_REQUEST', 'Preferences must be an object.');
  const fields: PrefsDoc['fields'] = {};
  const raw = body.fields;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, f] of Object.entries(raw as Record<string, unknown>)) {
      if (!isField(k) || !f || typeof f !== 'object') continue;
      const v = (f as { v?: unknown }).v;
      if (v === undefined) continue;
      let json: string;
      try { json = JSON.stringify(v); } catch { continue; }
      if (json === undefined || json.length > MAX_VALUE) continue;
      fields[k] = { v: JSON.parse(json) as unknown, at: okTime((f as { at?: unknown }).at) };
    }
  }
  return { fields: sortKeys(fields), tips: names(body.tips), lessons: parseLessons(body.lessons) };
};

const mergeLessons = (a: LessonProgress | null, b: LessonProgress | null): LessonProgress | null => {
  if (!a || !b) return a ?? b;
  if (a.version !== b.version) return a.version > b.version ? a : b;
  const counts: Record<string, number> = { ...a.counts };
  for (const [k, n] of Object.entries(b.counts)) counts[k] = Math.max(counts[k] ?? 0, n);
  // A spotlight is spent once per level: whichever device spent it first keeps it. With no order
  // between devices, the lower-sorting kind is kept, so the merge is the same in either order.
  const spotlights: Record<string, string> = { ...a.spotlights };
  for (const [lvl, kind] of Object.entries(b.spotlights)) {
    const have = spotlights[lvl];
    spotlights[lvl] = have === undefined || kind < have ? kind : have;
  }
  return { version: a.version, counts: sortKeys(counts), spotlights: sortKeys(spotlights), hellos: [...new Set([...a.hellos, ...b.hellos])].sort() };
};

/** Two copies join. Same result in either order; merging twice changes nothing. */
export const mergePrefs = (a: PrefsDoc, b: PrefsDoc, now: number): PrefsDoc => {
  const fields: PrefsDoc['fields'] = {};
  for (const k of SYNCED_FIELDS) {
    const x = a.fields[k];
    const y = b.fields[k];
    const pick = (f: PrefField): PrefField => ({ v: f.v, at: Math.min(f.at, now) });
    if (x && y) {
      const fx = pick(x), fy = pick(y);
      // Newer wins; on the same moment the larger JSON wins, only so the order never matters.
      fields[k] = fx.at !== fy.at ? (fx.at > fy.at ? fx : fy) : (JSON.stringify(fx.v) >= JSON.stringify(fy.v) ? fx : fy);
    } else if (x || y) {
      fields[k] = pick((x ?? y)!);
    }
  }
  return { fields, tips: [...new Set([...a.tips, ...b.tips])].sort(), lessons: mergeLessons(a.lessons, b.lessons) };
};

export const samePrefs = (a: PrefsDoc, b: PrefsDoc): boolean => JSON.stringify(a) === JSON.stringify(b);
