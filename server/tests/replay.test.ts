// A FINISHED DUEL'S REPLAY (owner brief, 2026-10-25).
//
// Three things are pinned here:
//   * the payload is enough to rebuild the match — the deterministic engine replays the returned
//     action log to the very board the server holds;
//   * it is a PLAYER's own duel: the other participant may read it, anybody else is refused;
//   * an unfinished duel has no replay yet.
import { describe, expect, it } from 'vitest';
import { replayMatch } from '../../src/engine/index.js';
import { makeLiveHarness, serverTestConfig } from './live-harness.js';
import { buildReplay } from '../../web/src/replay/timeline.js';
import { createFetchApp } from '../src/fetch-app.js';
import { ApiError } from '../src/errors.js';

const h = makeLiveHarness();

/** Whoever the match says must act, and play out their turn (draw, grow-skip, throw). */
const playTurns = async (a: Parameters<typeof h.actorOf>[1], b: Parameters<typeof h.actorOf>[2], matchId: string, turns: number): Promise<void> => {
  for (let i = 0; i < turns; i++) await h.playTurn(await h.actorOf(matchId, a, b), matchId);
};

describe('a finished duel replay', () => {
  it('refuses a match that is still being played', async () => {
    const { a, matchId } = await h.pair();
    await expect(h.service.replayOf(a, matchId)).rejects.toMatchObject({ code: 'MATCH_NOT_FINISHED' });
  });

  it('gives both players the whole action log, and rebuilding it reproduces the server board', async () => {
    const { a, b, matchId } = await h.pair();
    // A handful of real committed moves from both seats (draw, grow-skip, throw).
    await playTurns(a, b, matchId, 3);
    const before = (await h.memory.matchById(matchId))!;
    const moves = await h.memory.movesOf(matchId, 0);
    expect(moves.length).toBeGreaterThan(3);
    // B resigns: the match is finished, and its moves stay.
    await h.service.resign(b, matchId);
    const finished = (await h.memory.matchById(matchId))!;
    expect(finished.status).toBe('finished');

    const replay = await h.service.replayOf(a, matchId);
    expect(replay.matchId).toBe(matchId);
    expect(replay.status).toBe('finished');
    expect(replay.seat).toBe(0);
    expect(replay.seed).toBe(finished.seed);
    expect(replay.startingPlayer).toBe(finished.startingPlayer);
    expect(replay.rulesVersion).toBe(finished.rulesVersion);
    expect(replay.actions).toEqual(moves.map((m) => m.action));
    expect(replay.revisions).toEqual(moves.map((m) => m.revision));
    expect(replay.seats.map((s) => s.seat)).toEqual([0, 1]);
    expect(replay.seats.every((s) => typeof s.playerId === 'string' && s.playerId.length > 0)).toBe(true);
    // The resigning seat sees the same log, with its own seat reported.
    const other = await h.service.replayOf(b, matchId);
    expect(other.seat).toBe(1);
    expect(other.actions).toEqual(replay.actions);

    // THE PROOF: the payload alone rebuilds the authoritative position, deterministically.
    const rebuilt = replayMatch(
      { seed: replay.seed, rulesVersion: replay.rulesVersion, config: replay.config, startingPlayer: replay.startingPlayer },
      replay.actions,
    );
    expect(rebuilt.board).toEqual(finished.state.board);
    expect(rebuilt.board).toEqual(before.state.board); // resigning moves no tile
  });

  it('refuses anyone who is not in the match (403), and hides whether it exists', async () => {
    const { a, b, matchId } = await h.pair();
    await playTurns(a, b, matchId, 1);
    await h.service.resign(b, matchId);
    const outsider = await h.guest();
    const error = await h.service.replayOf(outsider.player, matchId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('NOT_A_PARTICIPANT');
    expect((error as ApiError).status).toBe(403);
  });

  it('the client timeline builder accepts the payload unchanged and lands on the final board', async () => {
    const { a, b, matchId } = await h.pair();
    await playTurns(a, b, matchId, 2);
    await h.service.resign(b, matchId);
    const replay = await h.service.replayOf(a, matchId);
    const names: [string, string] = [
      replay.seats.find((s) => s.seat === 0)?.displayName ?? 'Seat 0',
      replay.seats.find((s) => s.seat === 1)?.displayName ?? 'Seat 1',
    ];
    const model = buildReplay({
      seed: replay.seed,
      rulesVersion: replay.rulesVersion,
      config: replay.config,
      startingPlayer: replay.startingPlayer,
      actions: replay.actions,
      names,
      result: replay.result
        ? { winner: replay.result.winner, scores: replay.result.scores, reason: replay.result.reason }
        : null,
    });
    expect(model.frames.length).toBeGreaterThan(0);
    const final = (await h.memory.matchById(matchId))!;
    expect(model.frames.at(-1)!.board).toEqual(final.state.board);
    // A resignation records its result even though no GameEnd event was ever played.
    expect(model.result?.title ?? '').toMatch(/wins by resignation$/);
  });
});

describe('the replay route over HTTP', () => {
  it('serves a player their own finished duel, and refuses a cross-player read (403)', async () => {
    const { a, b, matchId, ta, tb } = await h.pair();
    await playTurns(a, b, matchId, 2);
    await h.service.resign(b, matchId);
    const app = createFetchApp({ service: h.service, config: serverTestConfig() });
    const read = (token: string | null) =>
      app(
        new Request(`http://replay.test/v1/matches/${matchId}/replay`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        }),
      );

    // Both seats may read it, each with their OWN seat in the payload.
    const seatA = await read(ta);
    expect(seatA.status).toBe(200);
    const bodyA = (await seatA.json()) as { ok: true; replay: { seat: number; actions: unknown[]; result: { reason: string } | null } };
    expect(bodyA.ok).toBe(true);
    expect(bodyA.replay.seat).toBe(0);
    expect(bodyA.replay.actions.length).toBeGreaterThan(0);
    expect(bodyA.replay.result?.reason).toBe('resigned');
    const seatB = await read(tb);
    expect(seatB.status).toBe(200);
    expect(((await seatB.json()) as { replay: { seat: number } }).replay.seat).toBe(1);

    // A signed-in stranger is refused, and the refusal does not distinguish "wrong player" from
    // "no such match".
    const outsider = await h.guest();
    const denied = await read(outsider.token);
    expect(denied.status).toBe(403);
    const deniedBody = (await denied.json()) as { ok: false; code: string };
    expect(deniedBody.code).toBe('NOT_A_PARTICIPANT');

    // No token at all is a 401, and the route is authenticated like every other match read.
    expect((await read(null)).status).toBe(401);
  });

  it('refuses an unfinished duel over HTTP', async () => {
    const app = createFetchApp({ service: h.service, config: serverTestConfig() });
    const { a, b, matchId, ta } = await h.pair();
    await playTurns(a, b, matchId, 1);
    const live = await app(
      new Request(`http://replay.test/v1/matches/${matchId}/replay`, { headers: { authorization: `Bearer ${ta}` } }),
    );
    expect(live.status).toBe(409);
    expect(((await live.json()) as { code: string }).code).toBe('MATCH_NOT_FINISHED');
  });
});

describe('the replay move log is the match', () => {
  it('an unfinished duel keeps its moves, so the replay is complete the moment it ends', async () => {
    const { a, b, matchId } = await h.pair();
    // Whoever the seeded lottery made first plays a turn (the draw/grow/throw path).
    await h.playTurn(await h.actorOf(matchId, a, b), matchId);
    const mid = await h.memory.movesOf(matchId, 0);
    expect(mid.length).toBeGreaterThan(0);
    // Reading the view never rewrites the log.
    await h.service.viewPayload(a, matchId);
    expect(await h.memory.movesOf(matchId, 0)).toEqual(mid);
  });
});
