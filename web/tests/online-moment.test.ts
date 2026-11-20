// Regression — an ONLINE opponent's big move must arrive with the SAME build-up the offline game
// gives it: the anticipation beat and the "big moment" banner. docs/ONLINE.md listed this as open
// ("the opponent's replayed turn carries less cockpit personality online than offline"): the
// catch-up steps were queued for the shared AnimQueue without `markMoment()`, so the page never
// knew which steps were a moment. The decision is pure (`replayMomentPlan` → `momentPlan`), so it
// is pinned here without touching the DOM.
import { describe, expect, it } from 'vitest';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike, KeyValue } from '../../server/src/client.js';
import { createOnlineDriver } from '../src/online/index.js';
import type { MatchViewPayload } from '../../server/src/protocol.js';
import { OnlineSession } from '../src/online/index.js';
import type { Step } from '../src/logic/anim.js';
import { momentPlan } from '../src/logic/juice.js';
import type { Effects } from '../src/logic/settings.js';
import { replayMomentPlan } from '../src/player/replay-display.js';
import { CURRENT_RULES_VERSION, applyAs, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';

const grow = (n: number, player: 0 | 1 = 1): Step => ({
  k: 'grow',
  style: 'bloom',
  player,
  tiles: Array.from({ length: n }, (_, i) => ({ key: `${i},0`, strength: 3, replaced: false })),
});
const cut = (n: number): Step => ({
  k: 'sever',
  player: 0,
  by: 1,
  keys: Array.from({ length: n }, (_, i) => `${i},1`),
  origin: '0,1',
});
const strangle: Step = { k: 'strangle', loser: 0 };
const bomb: Step = { k: 'fruit', player: 1, card: { id: 1, suit: null, rank: 0 }, target: '0,0', strength: 3 };
const drawOnly: Step[] = [
  { k: 'draw', player: 1, from: 'deck' },
  { k: 'sync', board: {}, scores: [0, 0] },
];

const noGold = () => false;
/** What the OFFLINE path decides for the same steps (main.ts `markMoment`). */
const offlinePlan = (steps: readonly Step[], effects: Effects = 'normal', reduceMotion = false) =>
  momentPlan(steps, noGold, effects, reduceMotion);
/** What the ONLINE catch-up decides for the opponent's replayed turn. */
const onlinePlan = (steps: readonly Step[], theirs = true, effects: Effects = 'normal', reduceMotion = false) =>
  replayMomentPlan(steps, { theirs, isGold: noGold, intensity: effects, reduceMotion });

describe("an opponent's replayed turn gets the offline moment plan", () => {
  it('a Strangle: the same plan, with the anticipation beat and its banner', () => {
    const plan = onlinePlan([strangle]);
    expect(plan).toEqual(offlinePlan([strangle]));
    expect(plan!.tier).toBe('big');
    expect(plan!.budget.anticipationMs).toBeGreaterThan(0);
    expect(plan!.banner).toBe('Strangled!');
  });

  it('a wide cut: the same plan the offline game gives that move', () => {
    const steps = [grow(3), cut(6)];
    const plan = onlinePlan(steps);
    expect(plan).toEqual(offlinePlan(steps));
    expect(plan!.tier).toBe('big');
    expect(plan!.budget.anticipationMs).toBeGreaterThan(0);
  });

  it('a Bomb: the beat, but no second banner (its burst speaks for itself offline too)', () => {
    const plan = onlinePlan([grow(2), bomb]);
    expect(plan).toEqual(offlinePlan([grow(2), bomb]));
    expect(plan!.budget.anticipationMs).toBeGreaterThan(0);
    expect(plan!.banner).toBeNull();
  });

  it('a big grow: the same words the offline game says', () => {
    const plan = onlinePlan([grow(5)]);
    expect(plan).toEqual(offlinePlan([grow(5)]));
    expect(plan!.banner).toBe('Big grow!');
  });
});

describe('the same thresholds as offline, and never where offline would not fire', () => {
  it('a small move never gets a build-up', () => {
    const plan = onlinePlan([grow(1)]);
    expect(plan).toEqual(offlinePlan([grow(1)]));
    expect(plan!.tier).toBe('small');
    expect(plan!.budget.anticipationMs).toBe(0);
    expect(plan!.banner).toBeNull();
  });

  it('a draw-only replay is no moment at all', () => {
    expect(onlinePlan(drawOnly)).toBeNull();
  });

  it("the player's own committed move is not marked a second time by the replay path", () => {
    // `humanPlayOnline` already marks that play (main.ts, the `result.played` branch); the catch-up
    // carries the player's own aftermath too, so the replay path must stand down for it.
    expect(onlinePlan([grow(5)], false)).toBeNull();
    expect(offlinePlan([grow(5)])!.banner).toBe('Big grow!'); // …while offline still speaks
  });

  it('Reduce motion and Effects Low take the beat away, exactly as offline', () => {
    for (const [effects, reduce] of [['normal', true], ['low', false], ['low', true]] as const) {
      const plan = onlinePlan([strangle], true, effects, reduce);
      expect(plan).toEqual(offlinePlan([strangle], effects, reduce));
      expect(plan!.budget.anticipationMs).toBe(0);
    }
  });
});

// ---- the caught-up turn is consumed once, so its moment cannot speak twice ---------------------

const memoryStore = (): KeyValue => {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
};

const noTimers = { setTimer: () => 1, clearTimer: () => undefined };

/** Advance a fresh game until `seat` is to act, so a real View exists for that seat. */
const stateForSeat = (seat: 0 | 1, seed: number): State => {
  let s = newGame(seed);
  for (let i = 0; i < 200; i++) {
    if (s.actor === seat && s.phase === 'ACT') return s;
    const a =
      legalActions(viewFor(s, s.actor)).find((x) => x.t === 'Draw') ??
      legalActions(viewFor(s, s.actor)).find((x) => x.t === 'EndAct') ??
      legalActions(viewFor(s, s.actor))[0];
    if (!a) break;
    s = applyAs(s, s.actor, a);
  }
  throw new Error(`seed ${seed} never reached seat ${seat} ACT`);
};

describe('the replayed turn drains once (no second moment)', () => {
  it('a second consume of the same catch-up yields no steps', async () => {
    const seat = 0 as const;
    const opp = 1 as const;
    const state = stateForSeat(seat, 21);
    const view = viewFor(state, seat);
    const base: MatchViewPayload = {
      matchId: 'm',
      rulesVersion: CURRENT_RULES_VERSION,
      status: 'active',
      revision: 1,
      turnStartRevision: 1,
      seat,
      startingPlayer: opp,
      turnPlayer: opp,
      actor: opp,
      view: { ...view, actor: opp, turnPlayer: opp },
      legalActions: [],
      events: [],
      turnDeadlineAt: null,
      graceUsed: [0, 0],
      gracePeriods: 1,
      opponent: { seat: opp, playerId: 'opp', displayName: 'Fern' },
      result: null,
      serverNow: Date.now(),
    };
    const next: MatchViewPayload = {
      ...base,
      revision: 2,
      turnStartRevision: 2,
      view,
      actor: seat,
      turnPlayer: seat,
      legalActions: legalActions(view),
      events: [{ t: 'Strangle', player: seat }],
    };
    let fetches = 0;
    const fetchImpl: FetchLike = async () => {
      fetches += 1;
      const player = fetches === 1 ? base : next;
      return { status: 200, ok: true, json: async () => ({ ok: true, player, serverNow: Date.now() }) };
    };
    const driver = createOnlineDriver({
      client: new DuelClient({ baseUrl: 'https://api.test', fetch: fetchImpl, storage: memoryStore() }),
      token: 't',
      matchId: 'm',
      initial: base,
      ...noTimers,
    });
    const os = new OnlineSession(driver);
    await driver.start();
    await driver.sync().refresh();
    const first = os.consumeCatchUp();
    expect(first.length).toBeGreaterThan(0);
    expect(os.consumeCatchUp()).toEqual([]);
  });
});
