// BLITZ: EVERY MOVE IS SEEN AS IT LANDS (owner, 2026-11-06: "the moves should be shown as soon as
// they're done"; 2026-11-09: "if opp draws - i see it - he grows - i see it - he blooms - i see it -
// like in real time ... it's not working atm"). The page already commits each Blitz move at once; the
// server must also SHOW it to the other seat (no turn-start gate) and PING them for each one.
// An ordinary (24-hour) duel keeps its gate: the opponent sees a turn only when it is handed over.
import { describe, expect, it } from 'vitest';
import { makeLiveHarness } from './live-harness.js';

describe('Blitz streams each move to the opponent', () => {
  it('in a live duel the watcher sees the mover\'s Draw at once, and is pinged for it', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const mover = await h.actorOf(matchId, a, b);
    const watcher = mover === a ? b : a;
    const before = await h.service.viewPayload(watcher, matchId);
    const pings = h.broadcaster.published.length;
    await h.draw(mover, matchId);
    const after = await h.service.viewPayload(watcher, matchId);
    const truth = (await h.memory.matchById(matchId))!;
    expect(after.revision).toBe(truth.revision);
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.view.phase).toBe(truth.state.phase); // ACT, not the gated DRAW
    expect(after.legalActions).toEqual([]); // still not the watcher's move
    const ping = h.broadcaster.published.slice(pings).find((p) => p.matchId === matchId);
    expect(ping?.ping.revision).toBe(truth.revision);
  });

  it('the watcher never sees the mover\'s hand or the drawn card', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const mover = await h.actorOf(matchId, a, b);
    const watcher = mover === a ? b : a;
    await h.draw(mover, matchId);
    const mine = await h.service.viewPayload(mover, matchId);
    const theirs = await h.service.viewPayload(watcher, matchId);
    const draw = (events: readonly unknown[]) => events.find((e) => (e as { t?: string }).t === 'Draw') as { card?: unknown } | undefined;
    // the watcher sees THAT a card was drawn (the move lands), never WHICH card
    expect(draw(mine.events)?.card).toBeDefined();
    expect(draw(theirs.events)).toBeDefined();
    expect(draw(theirs.events)?.card).toBeUndefined();
    const hand = (mine.view as unknown as { hand: { id: number }[] }).hand.map((c) => c.id);
    expect(hand.length).toBeGreaterThan(0);
    expect(JSON.stringify(theirs.view)).not.toContain(JSON.stringify((mine.view as unknown as { hand: unknown }).hand));
  });

  it('an ordinary duel keeps the turn gate: no mid-turn view, no mid-turn ping', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    const mover = await h.actorOf(matchId, a, b);
    const watcher = mover === a ? b : a;
    const before = await h.service.viewPayload(watcher, matchId);
    const pings = h.broadcaster.published.length;
    await h.draw(mover, matchId);
    const after = await h.service.viewPayload(watcher, matchId);
    expect(after.revision).toBe(before.revision);
    expect(after.view.phase).toBe(before.view.phase);
    expect(h.broadcaster.published.length).toBe(pings);
  });
});
