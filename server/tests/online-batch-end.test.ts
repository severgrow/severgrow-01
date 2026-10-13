// Regression: a turn batch that ENDS the game must keep the winning move.
//
// The browser submits one turn as `[...draft, EndAct]`. A Strangle-winning Bloom is a draft action,
// so the very next action in the batch (EndAct) lands on a finished game. Before the fix the whole
// batch was rejected with MATCH_FINISHED, the winning move was rolled back and the match stayed
// active forever — the client retried the same batch and never progressed.
//
// The fix lives in the storage commit loop (memory.ts and postgres.ts): once the game is over
// inside the batch, apply what ended it and drop the rest of the turn. A batch that *starts* on a
// finished match is still rejected.
import { describe, expect, it } from 'vitest';

import { CURRENT_RULES_VERSION, apply, legalActions, newMatch, viewFor } from '../../src/engine/index.js';
import type { Action, Player, State } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { ApiError } from '../src/errors.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import type { MatchRecord, PlayerRecord } from '../src/storage/types.js';

const withoutHistory = (state: State): State => {
  const { history: _discarded, ...rest } = state;
  return rest as State;
};

/** A position where a legal ACT action (a Bloom/Sprout/Fruit, never EndAct) ends the game at once. */
const findWinningDraft = (): { seed: number; state: State; win: Action } | null => {
  for (let seed = 1; seed < 4_000; seed++) {
    let state = newMatch(seed);
    let guard = 0;
    while (state.phase !== 'GAME_OVER' && guard++ < 800) {
      const view = viewFor(state, state.actor);
      if (state.phase === 'ACT') {
        const win = legalActions(view).find((a) => a.t !== 'EndAct' && apply(state, a).phase === 'GAME_OVER');
        if (win) return { seed, state, win };
      }
      state = apply(state, GreedyBot.chooseAction(view));
    }
  }
  return null;
};

const setup = async (
  position: { seed: number; state: State; win: Action },
): Promise<{ service: MatchService; storage: MemoryStorage; matchId: string; submitter: PlayerRecord }> => {
  const storage = new MemoryStorage();
  const now = 1_700_000_000_000;
  const service = new MatchService({ storage, config: { ...DEFAULT_SERVER_CONFIG }, now: () => now });
  const a = await service.createGuest();
  const b = await service.createGuest();
  const pa = await service.authenticate(a.token);
  const pb = await service.authenticate(b.token);
  const actor: Player = position.state.actor;
  const match: MatchRecord = {
    id: 'batch-end-match',
    inviteCode: 'BATCHEnd1',
    rulesVersion: CURRENT_RULES_VERSION,
    seed: position.seed,
    config: position.state.config,
    startingPlayer: position.state.startingPlayer ?? 0,
    status: 'active',
    revision: 0,
    state: withoutHistory(position.state),
    result: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    turnDeadlineAt: now + 86_400_000,
    turnTimeoutMs: 86_400_000,
    graceUsed: [0, 0],
    gracePeriods: 1,
    graceExtensionMs: 86_400_000,
    turnStartRevision: 0,
    turnStartState: withoutHistory(position.state),
    expiresAt: null,
    openQueue: false,
  };
  const created = await storage.createMatch(match);
  if (!created.ok) throw new Error('could not create the regression match');
  await storage.addParticipant({ matchId: match.id, playerId: pa.id, seat: 0, joinedAt: now, lastSeenAt: now });
  await storage.addParticipant({ matchId: match.id, playerId: pb.id, seat: 1, joinedAt: now, lastSeenAt: now });
  return { service, storage, matchId: match.id, submitter: actor === 0 ? pa : pb };
};

describe('online batch that ends the game', () => {
  it('keeps the winning move and drops the trailing EndAct instead of rejecting the batch', async () => {
    const found = findWinningDraft();
    expect(found, 'a Strangle-winning draft move must exist in the first seeds').not.toBeNull();
    const position = found!;
    const expected = apply(position.state, position.win).result!;

    const { service, storage, matchId, submitter } = await setup(position);
    const res = await service.submitAction(submitter, matchId, {
      expectedRevision: 0,
      requestId: 'end-1',
      actions: [position.win, { t: 'EndAct' }],
    });

    expect(res.player.status).toBe('finished');
    expect(res.player.result?.reason).toBe(expected.reason);
    expect(res.player.result?.winner).toBe(expected.winner);
    // Only the move that ended the game was applied; the trailing EndAct was dropped.
    expect(res.player.revision).toBe(1);
    const row = await storage.matchById(matchId);
    expect(row?.status).toBe('finished');
    expect(row?.revision).toBe(1);
  });

  it('still rejects a batch that starts on a finished match', async () => {
    const position = findWinningDraft()!;
    const { service, matchId, submitter } = await setup(position);
    await service.submitAction(submitter, matchId, { expectedRevision: 0, requestId: 'first', actions: [position.win] });
    await expect(
      service.submitAction(submitter, matchId, { expectedRevision: 1, requestId: 'after-end', actions: [{ t: 'EndAct' }] }),
    ).rejects.toMatchObject({ code: 'MATCH_FINISHED' satisfies ApiError['code'] });
  });

  it('replays the same request id after a mid-batch finish instead of applying a second time', async () => {
    const position = findWinningDraft()!;
    const { service, storage, matchId, submitter } = await setup(position);
    const request = { expectedRevision: 0, requestId: 'replay-end', actions: [position.win, { t: 'EndAct' } as Action] };
    const first = await service.submitAction(submitter, matchId, request);
    expect(first.replayed).toBe(false);
    const replay = await service.submitAction(submitter, matchId, request);
    expect(replay.replayed).toBe(true);
    expect(replay.player.revision).toBe(first.player.revision);
    const row = await storage.matchById(matchId);
    expect(row?.revision).toBe(first.player.revision);
  });
});
