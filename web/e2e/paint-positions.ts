// Positions for the browser tests and screenshots (deterministic: found by
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

const isRun = (s: State, a: Action) => a.t === 'Bloom' && new Set(a.cards.map((id) => s.hands[0].find((c) => c.id === id)?.rank)).size > 1;

/** My Grow step with a run of 3 that can bloom in several ways. */
export const runChoice = (): { state: State } => ({
  state: firstAct((st, legal) => count(st, 0) >= 4 && legal.filter((a) => a.t === 'Bloom' && a.cards.length === 3 && isRun(st, a)).length >= 3),
});

/** My Grow step with a set of 3 that can bloom in several ways. */
export const setChoice = (): { state: State } => ({
  state: firstAct((st, legal) => count(st, 0) >= 4 && legal.filter((a) => a.t === 'Bloom' && a.cards.length === 3 && !isRun(st, a)).length >= 3),
});
