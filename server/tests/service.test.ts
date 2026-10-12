// The core match service: identity, joining, the authoritative action pipeline, and the
// concurrency/idempotency guarantees. Everything runs against the in-memory storage.
import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/index.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { ApiError } from '../src/errors.js';
import { hashToken } from '../src/ids.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import type { PlayerRecord } from '../src/storage/types.js';

const makeHarness = () => {
  const storage = new MemoryStorage();
  let now = 1_000_000;
  const service = new MatchService({ storage, config: DEFAULT_SERVER_CONFIG, now: () => now });
  return { storage, service, tick: () => (now += 1_000) };
};

/** Two guests, one match, both seated (status active). */
const twoPlayers = async () => {
  const h = makeHarness();
  const a = await h.service.createGuest('A');
  const b = await h.service.createGuest('B');
  const pa = await h.service.authenticate(a.token);
  const pb = await h.service.authenticate(b.token);
  const created = await h.service.createMatch(pa);
  const joined = await h.service.joinMatch(pb, created.match.inviteCode);
  return { ...h, pa, pb, tokenA: a.token, tokenB: b.token, matchId: created.match.matchId, inviteCode: created.match.inviteCode, created, joined };
};

/** The acting seat's view and identity, or null when nobody can act (finished/not active). */
const actor = async (
  service: MatchService,
  pa: PlayerRecord,
  pb: PlayerRecord,
  matchId: string,
): Promise<{ player: PlayerRecord; revision: number; legal: Action[] } | null> => {
  const va = await service.viewPayload(pa, matchId);
  if (va.legalActions.length > 0) return { player: pa, revision: va.revision, legal: va.legalActions };
  const vb = await service.viewPayload(pb, matchId);
  if (vb.legalActions.length > 0) return { player: pb, revision: vb.revision, legal: vb.legalActions };
  return null;
};

const expectCode = async (promise: Promise<unknown>, code: string): Promise<void> => {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected a rejection with code ${code}`).toBeInstanceOf(ApiError);
  expect((caught as ApiError).code).toBe(code);
};

describe('identity', () => {
  it('creates a guest and resolves it from its token', async () => {
    const { service } = makeHarness();
    const { player, token } = await service.createGuest('Guest One');
    expect(player.kind).toBe('guest');
    expect(player.displayName).toBe('Guest One');
    expect(token.length).toBeGreaterThan(20);
    const resolved = await service.authenticate(token);
    expect(resolved.id).toBe(player.id);
  });

  it('stores only the token hash, never the token itself', async () => {
    const { storage, service } = makeHarness();
    const { player, token } = await service.createGuest();
    expect(await storage.playerByTokenHash(token)).toBeNull();
    expect((await storage.playerByTokenHash(hashToken(token)))?.id).toBe(player.id);
  });

  it('rejects missing, short and unknown tokens', async () => {
    const { service } = makeHarness();
    await expectCode(service.authenticate(null), 'UNAUTHORIZED');
    await expectCode(service.authenticate('short'), 'UNAUTHORIZED');
    await expectCode(service.authenticate('a'.repeat(40)), 'UNAUTHORIZED');
  });

  it('upgrades a guest to an account without changing its id', async () => {
    const { service } = makeHarness();
    const { token } = await service.createGuest();
    const guest = await service.authenticate(token);
    const upgraded = await service.upgradePlayer(guest, 'Real Name');
    expect(upgraded.kind).toBe('account');
    expect(upgraded.id).toBe(guest.id);
    expect((await service.authenticate(token)).kind).toBe('account');
  });
});

describe('match creation and joining', () => {
  it('creates a waiting match in seat 0 with a private invite code and revision 0', async () => {
    const h = makeHarness();
    const { token } = await h.service.createGuest();
    const player = await h.service.authenticate(token);
    const { match, player: view } = await h.service.createMatch(player);
    expect(match.status).toBe('waiting');
    expect(match.revision).toBe(0);
    expect(match.inviteCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(match.seats).toHaveLength(1);
    expect(view.seat).toBe(0);
    // Waiting for an opponent: no legal actions yet.
    expect(view.legalActions).toEqual([]);
    // The first mover is the engine's seeded lottery, not assumed.
    expect([0, 1]).toContain(view.turnPlayer);
  });

  it('activates the match when the second player joins with the code (ignoring case/spaces)', async () => {
    const h = makeHarness();
    const { token } = await h.service.createGuest();
    const player = await h.service.authenticate(token);
    const { match } = await h.service.createMatch(player);
    const b = await h.service.createGuest();
    const pb = await h.service.authenticate(b.token);
    const spaced = ` ${match.inviteCode.slice(0, 4).toLowerCase()} ${match.inviteCode.slice(4)} `;
    const { match: joined, player: view } = await h.service.joinMatch(pb, spaced);
    expect(joined.status).toBe('active');
    expect(view.seat).toBe(1);
    expect(joined.seats).toHaveLength(2);
  });

  it('is idempotent when the same player joins twice', async () => {
    const { service, pb, inviteCode } = await twoPlayers();
    const again = await service.joinMatch(pb, inviteCode);
    expect(again.player.seat).toBe(1);
    expect(again.match.seats).toHaveLength(2);
    expect(again.match.status).toBe('active');
  });

  it('refuses a third player and an unknown code', async () => {
    const { service, inviteCode } = await twoPlayers();
    const c = await service.createGuest();
    const pc = await service.authenticate(c.token);
    await expectCode(service.joinMatch(pc, inviteCode), 'MATCH_FULL');
    await expectCode(service.joinMatch(pc, 'ZZZZZZZZ'), 'MATCH_NOT_FOUND');
  });
});

describe('hidden information', () => {
  it('never exposes the seed, the deck, or the opponent hand through a player view', async () => {
    const h = await twoPlayers();
    const authoritative = (await h.storage.matchById(h.matchId))!;
    const deckIds = authoritative.state.deck.map((c) => c.id);
    const opponentHand = authoritative.state.hands[1]; // viewer is seat 0

    const viewA = await h.service.viewPayload(h.pa, h.matchId);
    const text = JSON.stringify(viewA);
    // Structural: the projection has no slot for the seed, the deck or either hand.
    for (const key of ['seed', 'deck', 'hands', 'history', 'fruitKnown', 'reshuffles']) {
      expect(Object.keys(viewA.view), `view must not expose ${key}`).not.toContain(key);
    }
    expect(Object.keys(viewA)).not.toContain('state');

    // Exact id comparison: parse the ids out of the payload, never substring-match.
    const seenIds = new Set([...text.matchAll(/"id":(\d+)/g)].map((m) => Number(m[1])));
    for (const card of authoritative.state.deck) expect(seenIds.has(card.id), `deck card ${card.id} leaked`).toBe(false);
    for (const card of opponentHand) expect(seenIds.has(card.id), `opponent card ${card.id} leaked`).toBe(false);

    // The viewer's own hand is present; the opponent's is only a count.
    const mine = new Set(viewA.view.hand.map((c) => c.id));
    for (const card of opponentHand) expect(mine.has(card.id)).toBe(false);
    expect(viewA.view.opponentHandCount).toBe(opponentHand.length);
    // Exactly the viewer's hand, plus the face-up opening discard, is public as card objects.
    expect(seenIds.size).toBe(mine.size + viewA.view.discard.length);
    expect(deckIds.length).toBeGreaterThan(0);
  });

  it('hides the opponent deck draws in the event stream but keeps the public ones', async () => {
    const h = await twoPlayers();
    await playOnce(h.service, h.pa, h.pb, h.matchId, 'r0');
    const viewA = await h.service.viewPayload(h.pa, h.matchId);
    const viewB = await h.service.viewPayload(h.pb, h.matchId);
    const drawsA = viewA.events.filter((e) => e.t === 'Draw');
    const drawsB = viewB.events.filter((e) => e.t === 'Draw');
    // Every deck draw of the opponent has no card; one's own draws keep the card.
    for (const e of drawsA) if (e.t === 'Draw' && e.from === 'deck' && e.player !== viewA.seat) expect(e.card).toBeUndefined();
    for (const e of drawsB) if (e.t === 'Draw' && e.from === 'deck' && e.player !== viewB.seat) expect(e.card).toBeUndefined();
  });
});

/** Plays one legal move for whichever seat is to act. Returns the committed revision. */
const playOnce = async (
  service: MatchService,
  pa: PlayerRecord,
  pb: PlayerRecord,
  matchId: string,
  requestId: string,
): Promise<{ revision: number; replayed: boolean }> => {
  const next = await actor(service, pa, pb, matchId);
  if (!next) throw new Error('nobody can act');
  const action = next.legal[0]!;
  const result = await service.submitAction(next.player, matchId, {
    expectedRevision: next.revision,
    requestId,
    action,
  });
  return { revision: result.player.revision, replayed: result.replayed };
};

describe('submitting actions', () => {
  it('accepts a legal move, advances the revision by exactly one and returns the new view', async () => {
    const h = await twoPlayers();
    const next = (await actor(h.service, h.pa, h.pb, h.matchId))!;
    const result = await h.service.submitAction(next.player, h.matchId, {
      expectedRevision: 0,
      requestId: 'req-1',
      action: next.legal[0]!,
    });
    expect(result.ok).toBe(true);
    expect(result.replayed).toBe(false);
    expect(result.player.revision).toBe(1);
    expect(result.player.matchId).toBe(h.matchId);
  });

  it('rejects a move from the player who is not to act', async () => {
    const h = await twoPlayers();
    const next = (await actor(h.service, h.pa, h.pb, h.matchId))!;
    const waiting = next.player === h.pa ? h.pb : h.pa;
    await expectCode(
      h.service.submitAction(waiting, h.matchId, { expectedRevision: 0, requestId: 'wrong-turn', action: { t: 'EndAct' } }),
      'NOT_YOUR_TURN',
    );
  });

  it('rejects an unshaped action and a bad request id', async () => {
    const h = await twoPlayers();
    const next = (await actor(h.service, h.pa, h.pb, h.matchId))!;
    await expectCode(
      h.service.submitAction(next.player, h.matchId, { expectedRevision: 0, requestId: 'x', action: {} as never }),
      'INVALID_REQUEST',
    );
    await expectCode(
      h.service.submitAction(next.player, h.matchId, { expectedRevision: 0, requestId: '', action: { t: 'EndAct' } }),
      'INVALID_REQUEST',
    );
    await expectCode(
      h.service.submitAction(next.player, h.matchId, { expectedRevision: -1, requestId: 'x', action: { t: 'EndAct' } }),
      'INVALID_REQUEST',
    );
  });

  it('never trusts a client seat: only the authenticated participant can act', async () => {
    const h = await twoPlayers();
    const c = await h.service.createGuest();
    const pc = await h.service.authenticate(c.token);
    await expectCode(
      h.service.submitAction(pc, h.matchId, { expectedRevision: 0, requestId: 'intruder', action: { t: 'EndAct' } }),
      'NOT_A_PARTICIPANT',
    );
    await expectCode(h.service.viewPayload(pc, h.matchId), 'NOT_A_PARTICIPANT');
  });

  it('applies a repeated request id exactly once (idempotent retry)', async () => {
    const h = await twoPlayers();
    const next = (await actor(h.service, h.pa, h.pb, h.matchId))!;
    const request = { expectedRevision: 0, requestId: 'retry-me', action: next.legal[0]! };
    const first = await h.service.submitAction(next.player, h.matchId, request);
    expect(first.replayed).toBe(false);
    const second = await h.service.submitAction(next.player, h.matchId, request);
    expect(second.replayed).toBe(true);
    expect(second.player.revision).toBe(first.player.revision);
    const moves = await h.storage.movesOf(h.matchId, 0);
    expect(moves.filter((m) => m.requestId === 'retry-me')).toHaveLength(1);
  });

  it('rejects a stale revision and leaves the match untouched', async () => {
    const h = await twoPlayers();
    await playOnce(h.service, h.pa, h.pb, h.matchId, 'first');
    const next = (await actor(h.service, h.pa, h.pb, h.matchId))!;
    await expectCode(
      h.service.submitAction(next.player, h.matchId, { expectedRevision: 0, requestId: 'stale', action: next.legal[0]! }),
      'STALE_REVISION',
    );
    const match = (await h.storage.matchById(h.matchId))!;
    expect(match.revision).toBe(1);
  });

  it('cannot be acted on before an opponent joins', async () => {
    const h = makeHarness();
    const { token } = await h.service.createGuest();
    const player = await h.service.authenticate(token);
    const { match } = await h.service.createMatch(player);
    await expectCode(
      h.service.submitAction(player, match.matchId, { expectedRevision: 0, requestId: 'early', action: { t: 'EndAct' } }),
      'MATCH_NOT_ACTIVE',
    );
  });

  it('counts only events newer than the requested revision', async () => {
    const h = await twoPlayers();
    await playOnce(h.service, h.pa, h.pb, h.matchId, 'a');
    const afterOne = await h.service.viewPayload(h.pa, h.matchId);
    await playOnce(h.service, h.pa, h.pb, h.matchId, 'b');
    const afterTwo = await h.service.viewPayload(h.pa, h.matchId);
    expect(afterTwo.events.length).toBeGreaterThan(afterOne.events.length);
    // since=1 returns exactly the events of move 2 (moves with revision > 1).
    const delta = await h.service.viewPayload(h.pa, h.matchId, 1);
    expect(delta.events).toEqual(afterTwo.events.slice(afterOne.events.length));
    const match = (await h.storage.matchById(h.matchId))!;
    expect(delta.revision).toBe(match.revision);
  });

  it('plays a whole game to a finished, verifiable result and then refuses more moves', async () => {
    const h = await twoPlayers();
    let moves = 0;
    // A deliberately dull policy (draw, skip Grow, throw) so the game races to the deck end.
    for (; moves < 400; moves++) {
      const next = await actor(h.service, h.pa, h.pb, h.matchId);
      if (!next) break;
      const action =
        next.legal.find((a) => a.t === 'Draw' && a.from === 'deck') ??
        next.legal.find((a) => a.t === 'EndAct') ??
        next.legal.find((a) => a.t === 'Discard') ??
        next.legal[0]!;
      await h.service.submitAction(next.player, h.matchId, { expectedRevision: next.revision, requestId: `m${moves}`, action });
    }
    const match = (await h.storage.matchById(h.matchId))!;
    expect(match.status).toBe('finished');
    expect(match.result).not.toBeNull();
    expect(match.revision).toBeGreaterThan(20);

    // The finished view still hides the opponent's cards, and no further move is accepted.
    const viewA = await h.service.viewPayload(h.pa, h.matchId);
    expect(viewA.status).toBe('finished');
    expect(viewA.legalActions).toEqual([]);
    const oppHand = match.state.hands[viewA.seat === 0 ? 1 : 0];
    const text = JSON.stringify(viewA);
    for (const card of oppHand) expect(text).not.toContain(`"id":${card.id}`);

    await expectCode(
      h.service.submitAction(h.pa, h.matchId, { expectedRevision: match.revision, requestId: 'after-end', action: { t: 'EndAct' } }),
      'MATCH_FINISHED',
    );
    await expectCode(h.service.joinMatch(h.pb, h.inviteCode), 'MATCH_FINISHED');
  });
});

describe('concurrent submissions', () => {
  it('applies exactly one of two racing moves (same revision, different request ids)', async () => {
    const h = await twoPlayers();
    const next = (await actor(h.service, h.pa, h.pb, h.matchId))!;
    const results = await Promise.allSettled([
      h.service.submitAction(next.player, h.matchId, { expectedRevision: 0, requestId: 'race-1', action: next.legal[0]! }),
      h.service.submitAction(next.player, h.matchId, { expectedRevision: 0, requestId: 'race-2', action: next.legal[0]! }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ApiError);
    expect(((rejected[0] as PromiseRejectedResult).reason as ApiError).code).toBe('STALE_REVISION');
    const match = (await h.storage.matchById(h.matchId))!;
    expect(match.revision).toBe(1);
    expect((await h.storage.movesOf(h.matchId, 0)).length).toBe(1);
  });
});
