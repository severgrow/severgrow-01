// The dock's hint line (UI overhaul item 13): one short line saying what to do next, with a
// tiny arrow toward where to do it (up: the board; down: the hand and the piles). It also says
// why a move is not available. Pure: the page passes a small summary of the moment.
import { BLOOM, FRUIT, OPP } from '../../../src/strings.js';
import type { MoveWords } from '../../../src/strings.js';

/** The longest hint allowed: it must fit one line on a 360px-wide phone. */
export const HINT_MAX = 46;

export type HintArrow = 'up' | 'down' | null;
export type Hint = { text: string; arrow: HintArrow };

export type HintCtx = {
  phase: string;
  myTurn: boolean;
  busy: boolean;
  words: Pick<MoveWords, 'tapHint'>;
  deckCount: number;
  /** Draw step: can I take the throw pile's top card? */
  canTakeThrow: boolean;
  /** v0.6: a Fruit card is picked (`firstTime`: the "any strength" note has not been shown yet) */
  fruit: null | { firstTime: boolean; reason?: string | null };
  pending: null | 'strengthen' | 'drawn' | 'board';
  drawing: null | { n: number; fine: boolean };
  /** a card is picked: what it can do (empty: nothing) and whether it is a single-card move */
  card: null | { single: boolean; grow: boolean; replace: boolean; strengthen: boolean };
  kindPicked: boolean;
  hexWithNoMove: boolean;
  handEmpty: boolean;
  /** a single card can still grow a tile this turn */
  canSprout: boolean;
  /** a Bloom can still be played */
  canCombo: boolean;
  /** v0.7: I hold cards that can bloom, but no Bloom fits on the board (the smallest group's size) */
  bloomBlocked?: number | null;
  throwEndsTurn: boolean;
};

const h = (text: string, arrow: HintArrow = null): Hint => ({ text, arrow });

export const hintFor = (c: HintCtx): Hint => {
  if (c.phase === 'GAME_OVER') return h(c.busy ? '' : 'Game over.');
  if (!c.myTurn) return h(c.busy ? `Watch ${OPP.theirs} move` : `${OPP.The} is thinking…`);
  if (c.busy) return h('');
  switch (c.phase) {
    case 'DRAW': {
      if (!c.canTakeThrow) return h(c.deckCount <= 3 ? `Draw from the deck: ${c.deckCount} left` : 'Draw: tap the deck', 'down');
      return h(c.deckCount <= 3 ? `Draw a card: ${c.deckCount === 1 ? 'last one in the deck' : `${c.deckCount} left in the deck`}` : 'Draw: tap the deck or the throw pile', 'down');
    }
    case 'ACT': {
      if (c.fruit?.reason) return h(c.fruit.reason);
      if (c.fruit && !c.pending) return h(c.fruit.firstTime ? FRUIT.anyStrength : FRUIT.tapTarget, 'up');
      if (c.pending === 'strengthen') return h('Strengthen: your tile takes the higher number', 'down');
      if (c.pending === 'drawn') return h('Confirm, or draw it again', 'down');
      if (c.pending) return h('Confirm, or tap the spot again', 'down');
      if (c.drawing) {
        if (c.drawing.fine) return h("Click to start your bloom, click to finish", "up");
        return h(`Paint ${c.drawing.n} touching hexes for your bloom`, 'up');
      }
      if (c.card) {
        const { grow, replace, strengthen } = c.card;
        if (!grow && !replace && !strengthen) return h("That card can't grow anywhere now");
        if (!c.card.single) return h('Tap a glowing hex to grow there', 'up');
        return h(['Tap a glowing hex', replace ? '⇆ replaces' : '', strengthen ? '+ strengthens' : ''].filter(Boolean).join(' · '), 'up');
      }
      if (c.kindPicked) return h('Tap a glowing hex', 'up');
      if (c.hexWithNoMove) return h('Nothing grows there right now');
      if (c.handEmpty) return h('No cards left. Tap “End turn”', 'down');
      if (!c.canCombo && c.bloomBlocked) return h(BLOOM.tooFew(c.bloomBlocked));
      if (c.canSprout) return h(c.words.tapHint, 'down');
      if (c.canCombo) return h('Bloom, or “Throw a card”', 'down');
      return h('Nothing can grow. Tap “Throw a card”', 'down');
    }
    case 'DISCARD':
      return h(c.throwEndsTurn ? 'Throw 1 card to end your turn' : 'Throw 1 card', 'down');
    case 'KNOCK':
      return h('Knock to end the game soon, or end turn', 'down');
    case 'ROT_PICK':
      return h(`Tap ${OPP.theirs} tile that rots`, 'up');
    default:
      return h('');
  }
};
