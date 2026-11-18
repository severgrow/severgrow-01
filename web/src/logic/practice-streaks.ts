// PRACTICE STREAKS ON THIS DEVICE (owner, 2026-11-18): the four Practice keys show their current and
// best streak, the numbers move the moment a game ends, they work offline, and they follow the account.
//
// This is the CACHE and the QUEUE; the account (server/src/streaks) is the record. Every finished game
// gets an id when it STARTS (kept with the game, so closing the app and resuming finishes the same
// game), is counted here at once by the shared rule (server/src/streaks/rules.ts), queued, and sent;
// the server counts each id once, so a retry, a second tab or the offline queue can never count a
// game twice. The account's answer then replaces the cached numbers, with any game finished while the
// answer was on its way applied on top, so nothing is lost and nothing is counted twice.
//
// Kept per player: another account signed in on this device never sees or sends these numbers.
// Games finished before this device had any identity are kept under '' and join the first account
// that syncs.
import type { KeyValue } from '../../../server/src/client.js';
import type { PracticeStreaks, PracticeTier, StreakResult } from '../../../server/src/streaks/rules.js';
import { applyGame, emptyPracticeStreaks, isPracticeTier, isStreakResult } from '../../../server/src/streaks/rules.js';

/** `severgrow.*`: the channel prefixes it. */
export const PRACTICE_STREAKS_KEY = 'severgrow.practice.streaks.v1';
/** The practice game in progress (one per device: the saved offline game is one too). */
export const PRACTICE_OPEN_KEY = 'severgrow.practice.open.v1';
/** How many recent game ids each account remembers, to refuse a repeat without asking the server. */
const COUNTED_KEEP = 200;
/** The account answer carries at most this many games per request (server: MAX_GAMES_PER_POST). */
const SEND_BATCH = 50;

export type PracticeGameReport = { id: string; tier: PracticeTier; result: StreakResult };
type Bucket = { tiers: PracticeStreaks; pending: PracticeGameReport[]; counted: string[] };
type Saved = { v: 1; players: Record<string, Bucket> };
type Open = { id: string; tier: PracticeTier; seed: number };

export type StreakSync = {
  /** Send queued games; the account's practice streaks after counting them. */
  send: (games: PracticeGameReport[]) => Promise<PracticeStreaks>;
  /** Read the account's practice streaks. */
  read: () => Promise<PracticeStreaks>;
};

const validStreaks = (raw: unknown): PracticeStreaks => {
  const out = emptyPracticeStreaks();
  const r = raw as Record<string, { current?: unknown; best?: unknown }> | null;
  for (const tier of Object.keys(out) as PracticeTier[]) {
    const s = r?.[tier];
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    if (s) out[tier] = { current: n(s.current), best: Math.max(n(s.best), n(s.current)) };
  }
  return out;
};

export const createPracticeStreaks = (deps: {
  store: KeyValue | null;
  /** The player this device is playing as now, or null before any identity exists. */
  playerId: () => string | null;
  newId?: () => string;
}) => {
  const newId = deps.newId ?? (() => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9:_.-]/g, ''));
  const listeners = new Set<() => void>();
  const who = () => deps.playerId() ?? '';

  const read = (): Saved => {
    try {
      const raw = JSON.parse(deps.store?.get(PRACTICE_STREAKS_KEY) ?? 'null') as Saved | null;
      if (raw && raw.v === 1 && raw.players && typeof raw.players === 'object') {
        const players: Record<string, Bucket> = {};
        for (const [id, b] of Object.entries(raw.players)) {
          players[id] = {
            tiers: validStreaks(b?.tiers),
            pending: Array.isArray(b?.pending) ? b.pending.filter((g) => g && typeof g.id === 'string' && isPracticeTier(g.tier) && isStreakResult(g.result)) : [],
            counted: Array.isArray(b?.counted) ? b.counted.filter((x): x is string => typeof x === 'string').slice(-COUNTED_KEEP) : [],
          };
        }
        return { v: 1, players };
      }
    } catch { /* a damaged save is no save */ }
    return { v: 1, players: {} };
  };
  const write = (saved: Saved) => {
    try { deps.store?.set(PRACTICE_STREAKS_KEY, JSON.stringify(saved)); } catch { /* private mode: this visit only */ }
    for (const listener of listeners) { try { listener(); } catch { /* a repaint never breaks the count */ } }
  };
  const bucketOf = (saved: Saved, id: string): Bucket => (saved.players[id] ??= { tiers: emptyPracticeStreaks(), pending: [], counted: [] });

  const readOpen = (): Open | null => {
    try {
      const o = JSON.parse(deps.store?.get(PRACTICE_OPEN_KEY) ?? 'null') as Open | null;
      return o && typeof o.id === 'string' && isPracticeTier(o.tier) ? o : null;
    } catch { return null; }
  };
  const setOpen = (open: Open | null) => {
    try { if (open) deps.store?.set(PRACTICE_OPEN_KEY, JSON.stringify(open)); else deps.store?.remove(PRACTICE_OPEN_KEY); } catch { /* blocked */ }
  };

  /** Count one game for the current player, once. */
  const count = (game: PracticeGameReport) => {
    const saved = read();
    const bucket = bucketOf(saved, who());
    if (bucket.counted.includes(game.id)) return;
    bucket.tiers[game.tier] = applyGame(bucket.tiers[game.tier], game.result);
    bucket.pending.push(game);
    bucket.counted = [...bucket.counted, game.id].slice(-COUNTED_KEEP);
    write(saved);
  };

  const api = {
    /** The four keys' numbers for whoever plays on this device now. */
    view: (): PracticeStreaks => {
      const b = read().players[who()];
      return b ? b.tiers : emptyPracticeStreaks();
    },
    pendingCount: (): number => read().players[who()]?.pending.length ?? 0,
    onChange: (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** A game that replaces an unfinished one abandons it (owner: "Restart / start a new game ... reset to 0"). */
    abandonOpen: (): void => {
      const open = readOpen();
      if (!open) return;
      setOpen(null);
      count({ id: open.id, tier: open.tier, result: 'abandon' });
    },
    /** A practice game begins (a new one, never a resumed one). */
    started: (tier: PracticeTier, seed: number): void => {
      api.abandonOpen();
      setOpen({ id: newId(), tier, seed });
    },
    /** The open practice game ended (win, loss, draw or resign). A second report is ignored. */
    finished: (tier: PracticeTier, result: StreakResult): void => {
      const open = readOpen();
      if (!open || open.tier !== tier) return;
      setOpen(null);
      count({ id: open.id, tier, result });
    },
    /**
     * Send the queue and take the account's numbers (any game finished meanwhile stays queued and is
     * applied on top). With nothing queued it only reads. A failure leaves the queue for next time.
     */
    sync: async (remote: StreakSync): Promise<void> => {
      const id = deps.playerId();
      if (!id) return;
      // Games from before this device had an identity join the first account that syncs.
      const early = read();
      if (early.players['']?.pending.length) {
        const mine = bucketOf(early, id);
        for (const g of early.players['']!.pending) if (!mine.counted.includes(g.id)) { mine.pending.push(g); mine.counted.push(g.id); mine.tiers[g.tier] = applyGame(mine.tiers[g.tier], g.result); }
        delete early.players[''];
        write(early);
      }
      const batch = (read().players[id]?.pending ?? []).slice(0, SEND_BATCH);
      const account = batch.length ? await remote.send(batch) : await remote.read();
      if (deps.playerId() !== id) return; // another account took over meanwhile: never cross the streams
      const saved = read();
      const bucket = bucketOf(saved, id);
      const sent = new Set(batch.map((g) => g.id));
      bucket.pending = bucket.pending.filter((g) => !sent.has(g.id));
      let tiers = validStreaks(account);
      for (const g of bucket.pending) tiers = { ...tiers, [g.tier]: applyGame(tiers[g.tier], g.result) };
      bucket.tiers = tiers;
      write(saved);
    },
  };
  return api;
};

export type PracticeStreaksStore = ReturnType<typeof createPracticeStreaks>;
