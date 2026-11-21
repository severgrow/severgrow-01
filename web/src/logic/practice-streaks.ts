// PRACTICE STREAKS ON THIS DEVICE (owner, 2026-11-18): the Practice keys show their current and
// best streak, the numbers move the moment a game ends, they work offline, and they follow the account.
// Since 2026-11-20 only HARD and BLITZ carry a streak; EASY and MEDIUM games are still queued and
// counted as finished games, but never applied to a streak.
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
import { applyGame, emptyPracticeStreaks, isCompletedResult, isPracticeTier, isStreakResult, isStreakTier } from '../../../server/src/streaks/rules.js';

/** `severgrow.*`: the channel prefixes it. */
export const PRACTICE_STREAKS_KEY = 'severgrow.practice.streaks.v1';
/** The practice game in progress (one per device: the saved offline game is one too). */
export const PRACTICE_OPEN_KEY = 'severgrow.practice.open.v1';
/** How many recent game ids each account remembers, to refuse a repeat without asking the server. */
const COUNTED_KEEP = 200;
/** The account answer carries at most this many games per request (server: MAX_GAMES_PER_POST). */
const SEND_BATCH = 50;

export type PracticeGameReport = { id: string; tier: PracticeTier; result: StreakResult };
type Bucket = {
  tiers: PracticeStreaks;
  pending: PracticeGameReport[];
  counted: string[];
  /**
   * FULLY COMPLETED practice games (win, loss or draw) for this account. It starts as this device's
   * own record and is replaced by the account's number whenever an answer carries one, so it follows
   * the account and a retry (or a second tab) can never count the same game twice. Abandons,
   * resignations, forfeits and timeouts never increment it.
   */
  completed: number;
};
type Saved = { v: 1; players: Record<string, Bucket> };
type Open = { id: string; tier: PracticeTier; seed: number };

/** The account's answer. `completed` is absent on an older server; the device's own count stands. */
export type PracticeAccount = { practice: PracticeStreaks; completed?: number | null };
/** Backwards-compatible with a plain streaks answer (the unit tests and an old caller). */
export type PracticeAccountAnswer = PracticeStreaks | PracticeAccount;

export type StreakSync = {
  /** Send queued games; the account's practice streaks after counting them. */
  send: (games: PracticeGameReport[]) => Promise<PracticeAccountAnswer>;
  /** Read the account's practice streaks. */
  read: () => Promise<PracticeAccountAnswer>;
};

/** Accept either the account shape or the old plain-streaks answer. */
const accountAnswer = (answer: PracticeAccountAnswer): { practice: PracticeStreaks; completed: number | null } => {
  if (answer && typeof answer === 'object' && 'practice' in answer) {
    return { practice: answer.practice, completed: typeof answer.completed === 'number' ? answer.completed : null };
  }
  return { practice: answer as PracticeStreaks, completed: null };
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
          const completed = typeof b?.completed === 'number' && Number.isFinite(b.completed) && b.completed > 0 ? Math.floor(b.completed) : 0;
          players[id] = {
            tiers: validStreaks(b?.tiers),
            pending: Array.isArray(b?.pending) ? b.pending.filter((g) => g && typeof g.id === 'string' && isPracticeTier(g.tier) && isStreakResult(g.result)) : [],
            counted: Array.isArray(b?.counted) ? b.counted.filter((x): x is string => typeof x === 'string').slice(-COUNTED_KEEP) : [],
            completed,
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
  const bucketOf = (saved: Saved, id: string): Bucket => (saved.players[id] ??= { tiers: emptyPracticeStreaks(), pending: [], counted: [], completed: 0 });

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
    // Only HARD and BLITZ carry a streak (owner, 2026-11-20). An EASY/MEDIUM game is still kept and
    // queued (its completed count and its id), never applied to a streak.
    if (isStreakTier(game.tier)) bucket.tiers[game.tier] = applyGame(bucket.tiers[game.tier], game.result);
    // The reveal counts games that ran to their end (win/loss/draw); a restart, an abandon or a
    // resignation is a finished game too, but never one of the three that unlocks the numbers.
    if (isCompletedResult(game.result)) bucket.completed += 1;
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
    /** Fully completed Practice games (win/loss/draw) for whoever plays on this device now. */
    completedCount: (): number => read().players[who()]?.completed ?? 0,
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
        for (const g of early.players['']!.pending) if (!mine.counted.includes(g.id)) { mine.pending.push(g); mine.counted.push(g.id); if (isStreakTier(g.tier)) mine.tiers[g.tier] = applyGame(mine.tiers[g.tier], g.result); }
        mine.completed += early.players['']!.completed;
        delete early.players[''];
        write(early);
      }
      const batch = (read().players[id]?.pending ?? []).slice(0, SEND_BATCH);
      const answer = batch.length ? await remote.send(batch) : await remote.read();
      if (deps.playerId() !== id) return; // another account took over meanwhile: never cross the streams
      const saved = read();
      const bucket = bucketOf(saved, id);
      const sent = new Set(batch.map((g) => g.id));
      bucket.pending = bucket.pending.filter((g) => !sent.has(g.id));
      const account = accountAnswer(answer);
      let tiers = validStreaks(account.practice);
      for (const g of bucket.pending) if (isStreakTier(g.tier)) tiers = { ...tiers, [g.tier]: applyGame(tiers[g.tier], g.result) };
      bucket.tiers = tiers;
      // The account's number already includes the batch just sent. Games finished while that answer
      // was on its way are still queued, so they are added on top, never double-counted on a retry.
      if (typeof account.completed === 'number') {
        const queued = bucket.pending.reduce((n, g) => n + (isCompletedResult(g.result) ? 1 : 0), 0);
        // The ACCOUNT is the record: its number already includes the batch just sent, and the games
        // still queued are added on top. A local count from before the answer never overrules it.
        bucket.completed = account.completed + queued;
      }
      write(saved);
    },
  };
  return api;
};

export type PracticeStreaksStore = ReturnType<typeof createPracticeStreaks>;

/**
 * Move this device's Practice streak bucket from one player id to another (guest → account on
 * Google sign-in). Mirrors `retagSeedProofs`: a guest who earned HARD/BLITZ games offline must not
 * leave them stranded under the dead guest id once the account takes over.
 *
 * Games already known on the destination (by id) are never double-counted. Pending reports move
 * across so the next sync can still POST them. Stored choice numbers are kept as the better of the
 * two buckets' bests and the destination's current (then pending still-unsent games re-apply on sync).
 */
export const retagPracticeStreaks = (store: KeyValue | null, from: string, to: string): void => {
  if (!store || !from || !to || from === to) return;
  let saved: Saved;
  try {
    const raw = JSON.parse(store.get(PRACTICE_STREAKS_KEY) ?? 'null') as Saved | null;
    if (!raw || raw.v !== 1 || !raw.players || typeof raw.players !== 'object') return;
    saved = raw;
  } catch {
    return;
  }
  const src = saved.players[from];
  if (!src) return;
  const dst = saved.players[to] ?? { tiers: emptyPracticeStreaks(), pending: [], counted: [], completed: 0 };
  const known = new Set(dst.counted);
  for (const game of src.pending) {
    if (known.has(game.id)) continue;
    dst.pending.push(game);
    known.add(game.id);
  }
  for (const id of src.counted) {
    if (!known.has(id)) {
      dst.counted.push(id);
      known.add(id);
    }
  }
  dst.counted = dst.counted.slice(-COUNTED_KEEP);
  // Best-of both buckets for the two streak tiers; current comes from the destination (account)
  // unless it had none — then take the guest's, so an empty account inherits the guest's run.
  for (const tier of ['hard', 'blitz'] as const) {
    const a = dst.tiers[tier];
    const b = src.tiers[tier];
    const best = Math.max(a.best, b.best, a.current, b.current);
    const current = a.best > 0 || a.current > 0 ? a.current : b.current;
    dst.tiers[tier] = { current, best: Math.max(best, current) };
  }
  dst.completed = Math.max(dst.completed, src.completed);
  saved.players[to] = dst;
  delete saved.players[from];
  try {
    store.set(PRACTICE_STREAKS_KEY, JSON.stringify(saved));
  } catch {
    /* private mode: this visit only */
  }
};
