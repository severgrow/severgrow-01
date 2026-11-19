// SETTINGS, LESSON PROGRESS AND TIPS FOLLOW THE ACCOUNT (owner decision 2026-11-18, accounts pass:
// "server-stored, cached on the device, work offline, merged safely"). The page half of
// server/src/account-prefs.ts.
//
// The device keeps its own copy in the keys it always used (it works offline exactly as before).
// When signed into an ACCOUNT, it sends that copy and takes the merged one back:
//   * a setting carries the time it was chosen. A value changed since this device last synced is
//     stamped "now" (on the server's clock); an unchanged one keeps its synced time; and a device
//     syncing an account for the FIRST time stamps everything 0, so its defaults never overwrite the
//     account's real choices.
//   * tips seen and lesson progress only ever grow.
// When: at start-up, when the page comes back into view (at most every 30 s), when Settings opens,
// and on the way out if something changed. No timer, no polling, nothing while hidden.
import type { KeyValue } from '../../../server/src/client.js';
import { EMPTY_PREFS, SYNCED_FIELDS, type PrefsDoc, type SyncedField, type LessonProgress } from '../../../server/src/account-prefs.js';
import { readAccountIdentity } from '../logic/account-progress.js';
import { duelApiUrl, duelRegion } from '../online/config.js';

export const PREFS_SYNC_KEY = 'severgrow.prefs.sync.v1';
const SETTINGS_KEY = 'severgrow.settings.v1';
const THUMB_KEY = 'severgrow-thumb';
const GUIDE_KEY = 'severgrow-guide';
const BLITZ_KEY = 'severgrow.blitz.v1';
const TIPS_KEY = 'severgrow.tips.v1';
const LESSONS_KEY = 'severgrow.lesson.mastery.v1';
/** The event the game listens for to re-read what a sync changed. */
export const PREFS_APPLIED_EVENT = 'futasaku:prefs-applied';

type Meta = { player: string; base: Partial<Record<SyncedField, string>>; at: Partial<Record<SyncedField, number>>; offset: number };
export type PrefsApi = (method: 'GET' | 'POST', token: string, body?: Record<string, unknown>) => Promise<{ prefs: PrefsDoc | null; serverNow: number } | null>;

const json = (kv: KeyValue, key: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(kv.get(key) ?? 'null') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** This device's current values of the synced settings (only those it has a value for). */
const readFields = (kv: KeyValue): Partial<Record<SyncedField, unknown>> => {
  const out: Partial<Record<SyncedField, unknown>> = {};
  const s = json(kv, SETTINGS_KEY);
  for (const k of ['sound', 'vibration', 'reduceMotion'] as const) if (typeof s?.[k] === 'boolean') out[k] = s[k];
  const t = json(kv, THUMB_KEY);
  if (t?.side === 'left' || t?.side === 'right') out.handSide = t.side;
  if (typeof t?.thumb === 'boolean') out.thumbLayout = t.thumb;
  const g = kv.get(GUIDE_KEY);
  if (g === 'full' || g === 'subtle' || g === 'off') out.guide = g;
  const b = json(kv, BLITZ_KEY);
  if (b) out.blitz = b;
  return out;
};

/** Write one merged setting back into the key it lives in; true if the stored value changed. */
const writeField = (kv: KeyValue, k: SyncedField, v: unknown): boolean => {
  const patch = (key: string, field: string, value: unknown) => {
    const cur = json(kv, key) ?? {};
    if (JSON.stringify(cur[field]) === JSON.stringify(value)) return false;
    kv.set(key, JSON.stringify({ ...cur, [field]: value }));
    return true;
  };
  if (k === 'sound' || k === 'vibration' || k === 'reduceMotion') {
    if (typeof v !== 'boolean') return false;
    // Settings are saved with a `soundOn` mirror (logic/settings.ts saveableSettings).
    const changed = patch(SETTINGS_KEY, k, v);
    if (changed && k === 'sound') patch(SETTINGS_KEY, 'soundOn', v);
    return changed;
  }
  if (k === 'handSide') return v === 'left' || v === 'right' ? patch(THUMB_KEY, 'side', v) : false;
  if (k === 'thumbLayout') return typeof v === 'boolean' ? patch(THUMB_KEY, 'thumb', v) : false;
  if (k === 'guide') {
    if (v !== 'full' && v !== 'subtle' && v !== 'off') return false;
    if (kv.get(GUIDE_KEY) === v) return false;
    kv.set(GUIDE_KEY, v);
    return true;
  }
  if (k === 'blitz') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    if (kv.get(BLITZ_KEY) === JSON.stringify(v)) return false;
    kv.set(BLITZ_KEY, JSON.stringify(v));
    return true;
  }
  return false;
};

const readTips = (kv: KeyValue): string[] => Object.entries(json(kv, TIPS_KEY) ?? {}).filter(([, on]) => on === true).map(([k]) => k).sort();
const readLessons = (kv: KeyValue): LessonProgress | null => {
  const m = json(kv, LESSONS_KEY);
  return m && typeof m.version === 'number'
    ? { version: m.version, counts: (m.counts as Record<string, number>) ?? {}, spotlights: (m.spotlights as Record<string, string>) ?? {}, hellos: Array.isArray(m.hellos) ? (m.hellos as string[]) : [] }
    : null;
};

const readMeta = (kv: KeyValue, player: string): Meta | null => {
  const m = json(kv, PREFS_SYNC_KEY) as Meta | null;
  return m && m.player === player && m.base && m.at ? m : null;
};

/**
 * One round trip. Returns true when this device's stored settings, tips or lessons changed (the game
 * then re-reads them). Never throws; offline, a guest, or a server without the route change nothing.
 */
export const syncPrefs = async (kv: KeyValue | null, api: PrefsApi, now: () => number = Date.now): Promise<boolean> => {
  if (!kv) return false;
  const identity = readAccountIdentity(kv);
  if (!identity || identity.kind !== 'account') return false;
  try {
    const meta = readMeta(kv, identity.playerId);
    const clock = () => now() + (meta?.offset ?? 0);
    const local = readFields(kv);
    const fields: Record<string, { v: unknown; at: number }> = {};
    for (const k of SYNCED_FIELDS) {
      if (!(k in local)) continue;
      const v = local[k];
      const same = meta?.base[k] === JSON.stringify(v);
      fields[k] = { v, at: !meta ? 0 : same ? meta.at[k] ?? 0 : clock() };
    }
    const res = await api('POST', identity.token, { fields, tips: readTips(kv), lessons: readLessons(kv) });
    if (!res?.prefs) return false;
    // The identity may have changed while the request was out (sign-out, another account): drop it.
    if (readAccountIdentity(kv)?.playerId !== identity.playerId) return false;
    const merged: PrefsDoc = { ...EMPTY_PREFS, ...res.prefs };
    let changed = false;
    const base: Meta['base'] = {};
    const at: Meta['at'] = {};
    for (const k of SYNCED_FIELDS) {
      const f = merged.fields[k];
      if (!f) continue;
      if (writeField(kv, k, f.v)) changed = true;
      base[k] = JSON.stringify(readFields(kv)[k] ?? f.v);
      at[k] = f.at;
    }
    const tips = readTips(kv);
    if (merged.tips.some((t) => !tips.includes(t))) {
      const cur = json(kv, TIPS_KEY) ?? {};
      kv.set(TIPS_KEY, JSON.stringify({ ...cur, ...Object.fromEntries(merged.tips.map((t) => [t, true])) }));
      changed = true;
    }
    if (merged.lessons && JSON.stringify(merged.lessons) !== JSON.stringify(readLessons(kv))) {
      const mine = readLessons(kv);
      // Only a lesson version this page knows (the same as its own record, or none yet) is written.
      if (!mine || mine.version === merged.lessons.version) {
        kv.set(LESSONS_KEY, JSON.stringify(merged.lessons));
        changed = true;
      }
    }
    kv.set(PREFS_SYNC_KEY, JSON.stringify({ player: identity.playerId, base, at, offset: res.serverNow - now() } satisfies Meta));
    return changed;
  } catch {
    return false;
  }
};

/** True when this device holds a synced setting it has not sent yet (used on the way out). */
export const prefsPending = (kv: KeyValue | null): boolean => {
  if (!kv) return false;
  const identity = readAccountIdentity(kv);
  if (!identity || identity.kind !== 'account') return false;
  const meta = readMeta(kv, identity.playerId);
  if (!meta) return true;
  const local = readFields(kv);
  return SYNCED_FIELDS.some((k) => k in local && meta.base[k] !== JSON.stringify(local[k]));
};

/** The real API: one bounded request (8 s), keepalive so a sync on the way out still lands. */
export const prefsApi = (keepalive = false): PrefsApi => async (method, token, body) => {
  const base = duelApiUrl();
  if (!base) return null;
  const region = duelRegion();
  const url = `${base}/v1/players/me/prefs${region ? `?forceFunctionRegion=${encodeURIComponent(region)}` : ''}`;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), 8_000);
  try {
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(ctl ? { signal: ctl.signal } : {}),
      keepalive,
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { prefs?: PrefsDoc | null; serverNow?: number };
    return { prefs: j.prefs ?? null, serverNow: typeof j.serverNow === 'number' ? j.serverNow : Date.now() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Wire it into the page: start-up, back into view (at most every 30 s), Settings opening, and on the
 * way out. The game re-reads what changed through PREFS_APPLIED_EVENT.
 */
export const mountPrefsSync = (hooks: { kv: () => KeyValue | null; ready: Promise<unknown> }): { now: () => void } => {
  let last = 0;
  let running: Promise<void> | null = null;
  const run = (force = false): void => {
    if (running || document.hidden) return;
    if (!force && Date.now() - last < 30_000) return;
    last = Date.now();
    running = syncPrefs(hooks.kv(), prefsApi()).then((changed) => {
      if (changed) window.dispatchEvent(new Event(PREFS_APPLIED_EVENT));
    }).finally(() => { running = null; });
  };
  void hooks.ready.then(() => run(true));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) run();
    else if (prefsPending(hooks.kv())) void syncPrefs(hooks.kv(), prefsApi(true));
  });
  window.addEventListener('futasaku:identity', () => run(true));
  return { now: () => run(true) };
};
