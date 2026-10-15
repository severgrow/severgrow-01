// Beta feedback — the pure parts: what a report carries, which crashes are worth sending, and the
// offline-safe send queue. No DOM here; everything is unit-tested.
import type { KeyValue } from '../../../server/src/client.js';

export type FeedbackKind = 'report' | 'crash';
export type FeedbackPayload = { kind: FeedbackKind; message: string; build: string | null; context: Record<string, unknown> };

/** A plain snapshot of where the player is. Only public, non-identifying facts. */
export type ContextSources = {
  channel: string;
  path: string;
  screen: string; // 'menu' | 'levels' | 'game' | 'online' | 'other'
  viewport: { w: number; h: number; dpr: number };
  standalone: boolean;
  touch: boolean;
  lang: string;
  online: boolean;
  settings: Record<string, unknown> | null;
  game: Record<string, string | number | undefined> | null;
  duel: Record<string, unknown> | null;
  matchId: string | null;
  recent: unknown[];
  errors: string[];
  uptimeMs: number;
};

const SETTINGS_KEEP = ['reduceMotion', 'largeText', 'speed', 'sound', 'vibration', 'effects', 'materialDetail'];

export const buildContext = (s: ContextSources): Record<string, unknown> => ({
  channel: s.channel,
  path: s.path,
  screen: s.screen,
  viewport: s.viewport,
  standalone: s.standalone,
  touch: s.touch,
  lang: s.lang,
  online: s.online,
  settings: s.settings ? Object.fromEntries(SETTINGS_KEEP.filter((k) => k in s.settings!).map((k) => [k, s.settings![k]])) : null,
  game: s.game,
  duel: s.duel,
  matchId: s.matchId,
  recent: s.recent.slice(-15),
  errors: s.errors.slice(-3),
  uptimeMs: Math.round(s.uptimeMs),
});

/** The path without query or hash (a join link's hash carries the invite code). */
export const safePath = (pathname: string): string => pathname.split('?')[0]!.split('#')[0]!.slice(0, 120);

/** Strip the site origin and query strings out of a stack so it is short and reveals nothing. */
export const cleanStack = (stack: string, origin: string): string =>
  stack
    .split(origin)
    .join('')
    .replace(/\?[^\s):]*/g, '')
    .slice(0, 2000);

const NOISE = [/^Script error\.?$/i, /ResizeObserver loop/i, /^Load failed$/i, /AbortError/i, /The operation was aborted/i];

/** Decides which errors to send: drops noise and duplicates, at most `max` per page load. */
export const createCrashGate = (max = 5) => {
  const seen = new Set<string>();
  let sent = 0;
  return (message: string, _stack: string): boolean => {
    if (!message || NOISE.some((r) => r.test(message))) return false;
    const key = message; // one bug = one report, whichever line threw it
    if (seen.has(key) || sent >= max) return false;
    seen.add(key);
    sent += 1;
    return true;
  };
};

export const QUEUE_KEY = 'futasaku.feedback.queue.v1';
const QUEUE_MAX = 10;

/** Reports that could not be sent (offline) wait here and go out on the next chance. */
export const createQueue = (kv: KeyValue | null) => {
  const read = (): FeedbackPayload[] => {
    try {
      const v = JSON.parse(kv?.get(QUEUE_KEY) ?? '[]') as unknown;
      return Array.isArray(v) ? (v as FeedbackPayload[]) : [];
    } catch {
      return [];
    }
  };
  const write = (items: FeedbackPayload[]) => {
    try {
      if (items.length) kv?.set(QUEUE_KEY, JSON.stringify(items.slice(-QUEUE_MAX)));
      else kv?.remove(QUEUE_KEY);
    } catch {
      /* storage full or blocked */
    }
  };
  return {
    items: read,
    push(p: FeedbackPayload) {
      write([...read(), p]);
    },
    /** Try to send everything waiting; keeps what still fails. Returns how many went out. */
    async flush(send: (p: FeedbackPayload) => Promise<'ok' | 'retry' | 'drop'>): Promise<number> {
      const waiting = read();
      const keep: FeedbackPayload[] = [];
      let ok = 0;
      for (const p of waiting) {
        const r = await send(p).catch(() => 'retry' as const);
        if (r === 'ok') ok += 1;
        else if (r === 'retry') keep.push(p);
      }
      write(keep);
      return ok;
    },
  };
};
