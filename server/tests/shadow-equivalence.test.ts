// Phase 0 SPIKE P-7 — Shadow-state legalActions / mid-turn apply equivalence.
//
// Authoritative State vs a client-shaped "shadow" State: real actor hand+board,
// opaque placeholder cards for deck and opponent hand (correct counts only).
//
// Run: PATH="$HOME/.local/node22/bin:$PATH" npx vitest run server/tests/shadow-equivalence.test.ts
import { describe, expect, it } from 'vitest';
import {
  applyAs,
  createCards,
  legalActionsForState,
  newGame,
  opponent,
  viewFor,
} from '../../src/engine/index.js';
import type { Action, Card, Player, State } from '../../src/engine/index.js';

/** Seeded LCG outside the engine (scripts/tests may PRNG; engine stays deterministic). */
const lcg = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

const pick = <T>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

/**
 * Opaque placeholder ids must never collide with real deck ids (createCards uses 0..n-1).
 * Suit/rank are decoys: legalActions must not choose them because they are not in the actor hand.
 */
const PLACEHOLDER_ID_BASE = 50_000;

const placeholderCard = (slot: number): Card => ({
  id: PLACEHOLDER_ID_BASE + slot,
  suit: 0,
  rank: 1,
});

/** Shadow State visible to `actor`: real hand/board/discard; fake deck + opponent hand by count. */
export const shadowFrom = (state: State, actor: Player): State => {
  const opp = opponent(actor);
  const deck = state.deck.map((_, i) => placeholderCard(i));
  const oppHand = state.hands[opp].map((_, i) => placeholderCard(10_000 + i));
  const hands: [Card[], Card[]] = [state.hands[0].map((c) => ({ ...c })), state.hands[1].map((c) => ({ ...c }))];
  hands[opp] = oppHand;
  const { history: _dropHistory, ...base } = state;
  return {
    ...base,
    // Fresh copies of public/actor-known fields; hidden zones replaced.
    board: structuredClone(state.board),
    terrain: structuredClone(state.terrain),
    discard: state.discard.map((c) => ({ ...c })),
    hands,
    deck,
    fruitKnown: [...state.fruitKnown] as [number, number],
    strengthenUsed: [...(state.strengthenUsed ?? [0, 0])] as [number, number],
    finalTurn: state.finalTurn ? { ...state.finalTurn } : null,
    deckFinal: state.deckFinal ? { ...state.deckFinal } : null,
    rotPick: state.rotPick ? structuredClone(state.rotPick) : null,
    lastResolution: state.lastResolution ? structuredClone(state.lastResolution) : null,
    result: state.result ? structuredClone(state.result) : null,
  };
};

const midTurnActions = (legal: readonly Action[]): Action[] =>
  legal.filter((a) => a.t === 'Bloom' || a.t === 'Sprout' || a.t === 'PlayFruit' || a.t === 'MegaBomb');

/** Public actor-facing fields that must match after a mid-turn Grow/Bomb/Blast/Strengthen. */
const publicActorSlice = (state: State, actor: Player) => {
  const v = viewFor(state, actor);
  return {
    board: v.board,
    hand: v.hand,
    score: v.score,
    opponentScore: v.opponentScore,
    discard: v.discard,
    deckCount: v.deckCount,
    opponentHandCount: v.opponentHandCount,
    phase: v.phase,
    actor: v.actor,
    turnPlayer: v.turnPlayer,
    sproutsThisTurn: v.sproutsThisTurn,
    strengthenUsed: v.strengthenUsed,
    fruitPlayed: v.fruitPlayed,
    fruitUnseen: v.fruitUnseen,
    result: v.result,
    lastResolution: v.lastResolution,
  };
};

const actionsEqual = (a: Action[], b: Action[]): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Play a full game with a seeded random bot; yield every late / deck-end ACT position for the actor. */
const collectLateTurns = (gameSeed: number, randSeed: number): State[] => {
  const rand = lcg(randSeed);
  let s = newGame(gameSeed);
  const out: State[] = [];
  let steps = 0;
  while (s.phase !== 'GAME_OVER' && steps < 500) {
    const legal = legalActionsForState(s);
    if (legal.length === 0) break;

    const deckEnd = s.deck.length === 0 || s.deckFinal != null;
    const late = s.deck.length <= 18 || s.turnNumber >= 20 || deckEnd;
    if (s.phase === 'ACT' && late) out.push(structuredClone(s));

    // Prefer mid-turn Grow when available so we sample Bloom/Blast positions; else random legal.
    const mid = midTurnActions(legal);
    const choice = mid.length > 0 && rand() < 0.55 ? pick(rand, mid) : pick(rand, legal);
    s = applyAs(s, s.actor, choice);
    steps++;
  }
  // Always include a deck-empty / deckFinal sample if the game produced one mid-flight.
  return out;
};

describe('shadow-state equivalence (P-7)', () => {
  it('legalActions and mid-turn apply match on 200 seeded late turns (incl. deck-end)', () => {
    const maxRealId = createCards(newGame(1).config).reduce((m, c) => Math.max(m, c.id), 0);
    expect(PLACEHOLDER_ID_BASE).toBeGreaterThan(maxRealId);

    let passed = 0;
    let failed = 0;
    const failures: string[] = [];
    const target = 200;
    let game = 0;
    let deckEndSamples = 0;

    while (passed + failed < target && game < 2000) {
      const gameSeed = 900_000 + game;
      const randSeed = 1_100_000 + game * 17;
      const turns = collectLateTurns(gameSeed, randSeed);
      game++;

      for (const auth of turns) {
        if (passed + failed >= target) break;
        const actor = auth.actor;
        if (auth.deck.length === 0 || auth.deckFinal != null) deckEndSamples++;

        const shadow = shadowFrom(auth, actor);
        // Placeholders must not appear in the actor hand.
        for (const c of shadow.hands[actor]) {
          expect(c.id).toBeLessThan(PLACEHOLDER_ID_BASE);
        }
        expect(shadow.deck.every((c) => c.id >= PLACEHOLDER_ID_BASE)).toBe(true);
        expect(shadow.hands[opponent(actor)].every((c) => c.id >= PLACEHOLDER_ID_BASE)).toBe(true);
        expect(shadow.deck.length).toBe(auth.deck.length);
        expect(shadow.hands[opponent(actor)].length).toBe(auth.hands[opponent(actor)].length);

        const legalAuth = legalActionsForState(auth);
        const legalShadow = legalActionsForState(shadow);

        if (!actionsEqual(legalAuth, legalShadow)) {
          failed++;
          failures.push(
            `LEGAL seed=${gameSeed} turn=${auth.turnNumber} phase=${auth.phase} actor=${actor} deck=${auth.deck.length}\n` +
              `  auth=${JSON.stringify(legalAuth).slice(0, 200)}\n` +
              `  shad=${JSON.stringify(legalShadow).slice(0, 200)}`,
          );
          continue;
        }

        const mid = midTurnActions(legalAuth);
        if (mid.length === 0) {
          // Still a valid late turn (e.g. only EndAct): legal match counts as pass.
          passed++;
          continue;
        }

        let turnOk = true;
        for (const action of mid) {
          const afterAuth = applyAs(auth, actor, action);
          const afterShadow = applyAs(shadow, actor, action);
          const pubAuth = publicActorSlice(afterAuth, actor);
          const pubShadow = publicActorSlice(afterShadow, actor);
          if (JSON.stringify(pubAuth) !== JSON.stringify(pubShadow)) {
            turnOk = false;
            failed++;
            failures.push(
              `APPLY seed=${gameSeed} turn=${auth.turnNumber} action=${JSON.stringify(action)}\n` +
                `  auth=${JSON.stringify(pubAuth).slice(0, 240)}\n` +
                `  shad=${JSON.stringify(pubShadow).slice(0, 240)}`,
            );
            break;
          }
        }
        if (turnOk) passed++;
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `shadow-equivalence: passed=${passed} failed=${failed} games_scanned=${game} deck_end_samples≈${deckEndSamples}`,
    );
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error('First failures:\n' + failures.slice(0, 5).join('\n\n'));
    }

    expect(passed + failed).toBeGreaterThanOrEqual(target);
    expect(failed, `STOP: shadow equivalence unreliable — ${failed} mismatch(es). First: ${failures[0] ?? ''}`).toBe(0);
    expect(passed).toBeGreaterThanOrEqual(target);
    expect(deckEndSamples, 'need some deck-end / fair-last-turn samples').toBeGreaterThan(0);
  });
});
