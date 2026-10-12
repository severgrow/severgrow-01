// Phase B/C regression — the online turn must actually COMPLETE, and the shared-engine
// starting-player contract must reach both seats.
//
// Live bug caught by the 30-game simulation: an online turn is Draw (committed) → Grow (draft)
// → Throw (batch ending in EndAct) → Discard (finishes the turn). The client only ever sent the
// EndAct batch, so the discard sat in the local draft and the turn never handed over to the
// opponent: both players waited forever on a board stuck in the DISCARD step.
//
// These tests drive the REAL MatchService through the REAL DuelClient + OnlineSession (no mock
// rules), so they fail loudly if a turn cannot complete or if the starting seat is not surfaced.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike, KeyValue } from '../../server/src/client.js';
import { createFetchApp } from '../../server/src/fetch-app.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { OnlineSession, createOnlineDriver } from '../src/online/index.js';

const memoryStore = (): KeyValue => {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
};

/** A FetchLike that serves the real Fetch app (same MatchService the Edge runs). */
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

describe('online turn completion (real service)', () => {
  it('Draw → Grow draft → Throw(EndAct) → Discard hands the turn to the opponent', async () => {
    const client = new DuelClient({ baseUrl: 'https://api.test', fetch: serviceFetch(), storage: memoryStore() });
    const a = await client.createGuest();
    const b = await client.createGuest();
    const created = await client.createMatch(a.token);
    const joined = await client.joinMatch(b.token, created.match.inviteCode);

    // Drive the seat that actually starts (seat differences must not matter). The create-time
    // payload is still 'waiting', so pull the ACTIVE view after the join.
    const starterIsCreator = created.player.startingPlayer === created.player.seat;
    const starterToken = starterIsCreator ? a.token : b.token;
    const starterSeat = starterIsCreator ? created.player.seat : joined.player.seat;
    const starterView = (await client.getState(starterToken, created.match.matchId)).player;
    expect(starterView.status).toBe('active');
    const driver = createOnlineDriver({
      client,
      token: starterToken,
      matchId: created.match.matchId,
      initial: starterView,
      ...noTimers,
    });
    const os = new OnlineSession(driver);
    expect(os.myTurn, `starter seat ${starterSeat} startingPlayer ${created.player.startingPlayer} status ${driver.snapshot().status} actor ${driver.snapshot().view.actor}`).toBe(true);

    const draw = os.legal.find((x) => x.t === 'Draw');
    expect(draw, 'starter must be able to Draw').toBeTruthy();
    const drawRes = await os.play(draw!);
    expect(drawRes.ok, `Draw failed: ${JSON.stringify(drawRes)}`).toBe(true);
    expect(os.myTurn, `after Draw: actor ${driver.snapshot().view.actor} seat ${driver.snapshot().seat} status ${driver.snapshot().status}`).toBe(true);

    const grow = os.legal.find((x) => x.t === 'Sprout' || x.t === 'Bloom' || x.t === 'PlayFruit' || x.t === 'MegaBomb');
    if (grow) {
      const growRes = await os.play(grow);
      expect(growRes.ok, `Grow failed: ${JSON.stringify(growRes)}`).toBe(true);
    }

    const end = os.legal.find((x) => x.t === 'EndAct');
    expect(end, 'EndAct ends the Grow step').toBeTruthy();
    const endRes = await os.play(end!);
    expect(endRes.ok, `EndAct failed: ${JSON.stringify(endRes)}`).toBe(true);

    // The turn is not over: the DISCARD step is offered and MUST be committed.
    const discard = os.legal.find((x) => x.t === 'Discard');
    expect(discard, 'Discard must be offered after EndAct').toBeTruthy();
    const discardRes = await os.play(discard!);
    expect(discardRes.ok, `Discard failed: ${JSON.stringify(discardRes)}`).toBe(true);

    const snap = driver.snapshot();
    expect(snap.view.turnPlayer, 'turn handed over').toBe((1 - snap.seat) as 0 | 1);
    expect(snap.view.phase).toBe('DRAW');
    expect(snap.hasDraft, 'draft cleared after the throw').toBe(false);

    // Authoritative check: the SERVER advanced past the discard (both submits landed).
    const authoritative = await client.getState(starterToken, created.match.matchId);
    expect(authoritative.player.view.turnPlayer, 'server handed the turn over').toBe((1 - snap.seat) as 0 | 1);
    expect(authoritative.player.view.phase).toBe('DRAW');
    // Draw (+1), EndAct (+1), Discard (+1): three committed revisions past the opening.
    expect(authoritative.player.revision).toBeGreaterThanOrEqual(3);
  });
});

describe('starting-player contract is surfaced to both seats', () => {
  it('exposes a starting seat that both players agree on and matches the first turn', async () => {
    const client = new DuelClient({ baseUrl: 'https://api.test', fetch: serviceFetch(), storage: memoryStore() });
    const a = await client.createGuest();
    const b = await client.createGuest();
    const created = await client.createMatch(a.token);
    const joined = await client.joinMatch(b.token, created.match.inviteCode);

    for (const payload of [created.player, joined.player]) {
      expect(payload.startingPlayer === 0 || payload.startingPlayer === 1, `startingPlayer=${String(payload.startingPlayer)}`).toBe(true);
      expect(payload.startingPlayer, 'first-turn seat equals the starting seat').toBe(payload.view.turnPlayer);
    }
    expect(created.player.startingPlayer).toBe(joined.player.startingPlayer);
  });
});
