// Regression — the opponent's completed turn must arrive as a REPLAY (AnimQueue steps) and the
// waiting player must not be able to act until that replay has drained and the board shows the
// true final state. Drives the REAL MatchService through the REAL DuelClient + OnlineSession.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike, KeyValue } from '../../server/src/client.js';
import { createFetchApp } from '../../server/src/fetch-app.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { OnlineSession, createOnlineDriver } from '../src/online/index.js';
import { createFakeChannel } from '../src/online/channel.js';
import { displayEventForPlay } from '../src/player/display-readout.js';
import { replayedByOpponent } from '../src/player/replay-display.js';
import { CURRENT_RULES_VERSION, applyAs, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Event, State } from '../../src/engine/index.js';
import type { MatchViewPayload } from '../../server/src/protocol.js';

const memoryStore = (): KeyValue => {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
};

const serviceFetch = (): FetchLike => {
  const service = new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG });
  const app = createFetchApp({ service, config: DEFAULT_SERVER_CONFIG });
  return async (url, init) => {
    const response = await app(
      new Request(url, {
        method: init.method,
        headers: init.headers,
        ...(init.body !== undefined ? { body: init.body } : {}),
      }),
    );
    return { status: response.status, ok: response.ok, json: () => response.json() as Promise<unknown> };
  };
};

const noTimers = { setTimer: () => 1, clearTimer: () => undefined };

/** Play one whole turn (Draw → optional Grow → Throw/EndAct → Discard) for the acting session. */
const playWholeTurn = async (os: OnlineSession): Promise<void> => {
  const draw = os.legal.find((a) => a.t === 'Draw');
  expect(draw, 'actor can Draw').toBeTruthy();
  expect((await os.play(draw!)).ok).toBe(true);

  const grow = os.legal.find((a) => a.t === 'Sprout' || a.t === 'Bloom');
  if (grow) expect((await os.play(grow)).ok).toBe(true);

  const end = os.legal.find((a) => a.t === 'EndAct');
  expect(end, 'actor can EndAct').toBeTruthy();
  expect((await os.play(end!)).ok).toBe(true);

  const discard = os.legal.find((a) => a.t === 'Discard');
  if (discard) expect((await os.play(discard)).ok).toBe(true);
};

describe('online opponent replay + input gating', () => {
  it('a completed opponent turn arrives as AnimQueue steps and gates input until it drains', async () => {
    const client = new DuelClient({ baseUrl: 'https://api.test', fetch: serviceFetch(), storage: memoryStore() });
    const a = await client.createGuest();
    const b = await client.createGuest();
    const created = await client.createMatch(a.token);
    await client.joinMatch(b.token, created.match.inviteCode);
    const matchId = created.match.matchId;

    // Work out which seat starts; the OTHER seat is the one that watches the replay.
    const starterIsCreator = created.player.startingPlayer === created.player.seat;
    const actSeat = starterIsCreator ? 0 : 1;
    const waitSeat = actSeat === 0 ? 1 : 0;
    const actToken = actSeat === 0 ? a.token : b.token;
    const waitToken = waitSeat === 0 ? a.token : b.token;

    const actView = (await client.getState(actToken, matchId)).player;
    const waitView = (await client.getState(waitToken, matchId)).player;

    const actDriver = createOnlineDriver({ client, token: actToken, matchId, initial: actView, ...noTimers });
    const waitChannel = createFakeChannel();
    const waitDriver = createOnlineDriver({
      client,
      token: waitToken,
      matchId,
      initial: waitView,
      channel: waitChannel.channel,
      ...noTimers,
    });
    const act = new OnlineSession(actDriver);
    const wait = new OnlineSession(waitDriver);
    await waitDriver.start();
    expect(act.myTurn).toBe(true);
    expect(wait.myTurn).toBe(false);

    // Acting seat completes a whole turn.
    await playWholeTurn(act);

    // The waiting seat learns about it — via the realtime ping (primary) routed to a fetch.
    await waitDriver.sync().refresh();

    // The completed turn must be available as a replay, ending with a sync to the final board.
    const steps = wait.consumeCatchUp();
    expect(steps.length, 'the opponent turn produced replay steps').toBeGreaterThan(1);
    const last = steps.at(-1)!;
    expect(last.k).toBe('sync');
    // A public event from the opponent's turn must be represented, not silently swallowed.
    expect(steps.some((s) => s.k === 'draw' || s.k === 'grow' || s.k === 'discard')).toBe(true);

    // While the replay is still queued, the waiting player must not be able to act.
    expect(wait.isRevealing, 'input is gated while the replay drains').toBe(true);
    expect(wait.myTurn, 'not their turn until the replay finishes').toBe(false);
    expect(wait.legal, 'no legal actions while mid-replay').toEqual([]);
    const blocked = await wait.play({ t: 'Draw', from: 'deck' });
    expect(blocked.ok).toBe(false);

    // Let the replay drain (the page calls this when the AnimQueue empties).
    wait.endReveal();
    expect(wait.isRevealing).toBe(false);
    expect(wait.myTurn, 'their turn once the replay drains').toBe(true);
    expect(wait.legal.length).toBeGreaterThan(0);
  });
});

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

describe('replay gating — both seats, both perspectives', () => {
  for (const seat of [0, 1] as const) {
    it(`seat ${seat} watching: the opponent's turn is mapped into screen steps and gated`, async () => {
      const state = stateForSeat(seat, 7 + seat);
      const opp = seat === 0 ? 1 : 0;
      const view = viewFor(state, seat);
      const coord = { q: 0, r: 0 };
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
        // Initial state mid-opponent-turn: the waiting seat has no legal actions.
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
      const events: Event[] = [{ t: 'Sprout', player: opp, card: 3, coord }];
      const next: MatchViewPayload = {
        ...base,
        revision: 2,
        turnStartRevision: 2,
        view,
        actor: seat,
        turnPlayer: seat,
        legalActions: legalActions(view),
        events,
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
      expect(os.myTurn, 'waiting at first').toBe(false);

      await driver.sync().refresh();
      const steps = os.consumeCatchUp();
      expect(steps.length).toBeGreaterThan(0);
      const grow = steps.find((s) => s.k === 'grow');
      expect(grow, 'the opponent grow is a replay step').toBeTruthy();
      // The replay is in SCREEN coordinates for this seat (identity for 0, rotated for 1).
      if (grow && grow.k === 'grow') {
        expect(grow.tiles[0]!.key).toBe(driver.perspective().mapKey(coordKey(coord)));
        expect(grow.player, 'the opponent paints as the lava side (display 1)').toBe(1);
      }
      expect(os.isRevealing).toBe(true);
      expect(os.myTurn).toBe(false);
      expect(os.legal).toEqual([]);
      os.endReveal();
      expect(os.myTurn).toBe(true);
      expect(os.legal.length).toBeGreaterThan(0);
    });
  }
});

describe('catch-up after a gap (return, backgrounded tab, refresh)', () => {
  it('replays the missed turns from a resume payload and gates input until it drains', async () => {
    const seat = 1 as const;
    const opp = 0 as const;
    const state = stateForSeat(seat, 3);
    const view = viewFor(state, seat);
    // A resume payload carries ONLY the turns missed while away (the client asks with `since`).
    const resume: MatchViewPayload = {
      matchId: 'm',
      rulesVersion: CURRENT_RULES_VERSION,
      status: 'active',
      revision: 9,
      turnStartRevision: 9,
      seat,
      startingPlayer: opp,
      turnPlayer: seat,
      actor: seat,
      view,
      legalActions: legalActions(view),
      events: [
        { t: 'Sprout', player: opp, card: 5, coord: { q: 0, r: 0 } },
        { t: 'Discard', player: opp, card: 6 },
      ],
      turnDeadlineAt: null,
      graceUsed: [0, 0],
      gracePeriods: 1,
      opponent: { seat: opp, playerId: 'opp', displayName: 'Fern' },
      result: null,
      serverNow: Date.now(),
    };
    const fetchImpl: FetchLike = async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, player: resume, serverNow: Date.now() }),
    });
    const driver = createOnlineDriver({
      client: new DuelClient({ baseUrl: 'https://api.test', fetch: fetchImpl, storage: memoryStore() }),
      token: 't',
      matchId: 'm',
      initial: resume,
      ...noTimers,
    });
    const os = new OnlineSession(driver);
    const steps = os.consumeCatchUp();
    expect(steps.some((s) => s.k === 'grow'), 'the missed opponent turn replays').toBe(true);
    expect(steps.at(-1)!.k, 'and ends on the true final board').toBe('sync');
    expect(os.isRevealing).toBe(true);
    expect(os.legal).toEqual([]);
  });

  it('resume() asks for the gap since the last-seen revision and keeps its events', async () => {
    const store = memoryStore();
    store.set(
      'severgrow.duel.session.v1',
      JSON.stringify({ token: 'tok', matchId: 'm1', seat: 0, revision: 12 }),
    );
    const calls: { path: string; body: unknown }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ path: `${init.method} ${new URL(url).pathname}`, body: init.body ? JSON.parse(init.body) : null });
      return {
        status: 200,
        ok: true,
        json: async () => ({
          ok: true,
          player: { matchId: 'm1', seat: 0, revision: 14, view: {}, events: [{ t: 'Draw', player: 1, from: 'deck' }] },
          serverNow: Date.now(),
        }),
      };
    };
    const client = new DuelClient({ baseUrl: 'https://api.test', fetch: fetchImpl, storage: store });
    const resumed = await client.resume();
    expect(calls[0]!.path).toBe('POST /v1/matches/m1/reconnect');
    // The reconnect body carries the last-seen revision, so only the gap comes back.
    expect(calls[0]!.body).toEqual({ sinceRevision: 12 });
    expect(resumed?.player.revision).toBe(14);
    // Newly stored sessions remember the revision for the next resume.
    expect(JSON.parse(store.get('severgrow.duel.session.v1') ?? '{}')).toMatchObject({ revision: 14 });
  });
});

describe('a replayed opponent turn reaches the cockpit (personality + "not ours")', () => {
  // The preview the page composes in its online `onChange`: the enemy's committed turn arrives as
  // replay steps, and the cockpit gets the SAME DisplayEvent the player's own moves get — with the
  // "theirs" flag the display dims on. Without the wiring the game stayed silent and identical.
  it('yields a cockpit DisplayEvent and reads as theirs, through the real driver + session', async () => {
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
      view: { ...view, actor: opp, turnPlayer: opp }, // the waiting seat, mid-opponent-turn
      legalActions: [],
      events: [],
      turnDeadlineAt: null,
      graceUsed: [0, 0],
      gracePeriods: 1,
      opponent: { seat: opp, playerId: 'opp', displayName: 'Fern' },
      result: null,
      serverNow: Date.now(),
    };
    // The enemy's finished turn: a MegaBomb that clears four tiles — a moment worth a banner.
    const events: Event[] = [
      {
        t: 'MegaBomb',
        player: opp,
        cards: [1, 2],
        target: { q: 0, r: 0 },
        destroyed: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }],
      },
    ];
    const next: MatchViewPayload = {
      ...base,
      revision: 2,
      turnStartRevision: 2,
      view,
      actor: seat,
      turnPlayer: seat,
      legalActions: legalActions(view),
      events,
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
    // The state the replay starts from — the page reads this before rebuilding the display state.
    const before = os.state;
    await driver.sync().refresh();
    const pending = [...driver.pendingEvents()];
    os.refresh(); // what the page's onChange does before it consumes
    const steps = os.consumeCatchUp();
    const after = os.state;

    expect(replayedByOpponent(pending, os.seat), 'the enemy authored this replay').toBe(true);
    const event = displayEventForPlay(before, after, steps, 0);
    expect(event, 'the enemy’s MegaBomb is a cockpit moment, not silence').toBeTruthy();
    expect(event!.message).toBe('-4'); // the enemy's blast: minus four of my tiles
    expect(event!.mode).toBe('red');
    // And the player's own replay of the same shape is NOT theirs.
    expect(replayedByOpponent([{ t: 'MegaBomb', player: seat, cards: [1, 2], target: { q: 0, r: 0 }, destroyed: [] }], os.seat)).toBe(false);
  });
});


