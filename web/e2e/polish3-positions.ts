// Positions for the UI polish pass 3 screenshots and browser tests (deterministic: found by
// letting GreedyBot play itself from fixed seeds).
import { coordKey, isFruitCard, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { playGame } from '../tests/ui-helpers.js';

const count = (s: State, p: number) => Object.values(s.board).filter((t) => t && t.owner === p).length;
/** v0.6: my hand gets a Fruit card (one moved from the deck or the throw pile, so every card still exists once). */
const withFruit = (s: State): State => {
  if (s.hands[0].some(isFruitCard)) return s;
  const i = s.deck.findIndex(isFruitCard);
  if (i >= 0) return { ...s, hands: [[...s.hands[0], s.deck[i]!], s.hands[1]], deck: s.deck.filter((_, j) => j !== i) };
  const j = s.discard.findIndex(isFruitCard);
  if (j >= 0) return { ...s, hands: [[...s.hands[0], s.discard[j]!], s.hands[1]], discard: s.discard.filter((_, k) => k !== j) };
  return s;
};
const firstAct = (want: (s: State, legal: Action[]) => boolean, from = 1, to = 400, fruit = false): State => {
  for (let seed = from; seed <= to; seed++) {
    let found: State | null = null;
    playGame(seed, ({ after }) => {
      if (found || after.actor !== 0 || after.phase !== 'ACT') return;
      const s = fruit ? withFruit(after) : after;
      if (want(s, legalActions(viewFor(s, 0)))) found = s;
    });
    if (found) return found;
  }
  throw new Error('no such position');
};

/** My Grow step holding a Fruit card that can remove one of the opponent's top-rank tiles. */
export const fruitOnTop = (): { state: State; target: string } => {
  const s = firstAct(
    (st, legal) => count(st, 0) >= 6 && count(st, 1) >= 8 && legal.some((a) => a.t === 'PlayFruit' && st.board[coordKey(a.target)]?.strength === st.config.maxRank),
    1,
    400,
    true,
  );
  const a = legalActions(viewFor(s, 0)).find((x) => x.t === 'PlayFruit' && s.board[coordKey(x.target)]?.strength === s.config.maxRank) as Extract<Action, { t: 'PlayFruit' }>;
  return { state: s, target: coordKey(a.target) };
};

/** My Grow step with a line of 3 that can be placed in several ways. */
export const lineChoice = (): { state: State } => ({
  state: firstAct((st, legal) => count(st, 0) >= 4 && legal.filter((a) => a.t === 'MeldRun' && a.cards.length === 3).length >= 3),
});

/** My Grow step with a clump of 3 that can be placed in several ways. */
export const clumpChoice = (): { state: State } => ({
  state: firstAct((st, legal) => count(st, 0) >= 4 && legal.filter((a) => a.t === 'MeldSet' && a.cards.length === 3).length >= 3),
});
