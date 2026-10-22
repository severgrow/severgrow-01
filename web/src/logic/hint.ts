// The dock's hint line (UI overhaul item 13): one short line saying what to do next, with a
// tiny arrow toward where to do it (up: the board; down: the hand and the piles). It also says
// why a move is not available. Pure: the page passes a small summary of the moment.
import { BLOOM, FRUIT, OPP } from '../../../src/strings.js';
import { t } from '../../../src/i18n/index.js';
import type { MoveWords } from '../../../src/strings.js';

/** The longest hint allowed: it must fit one line on a 360px-wide phone. */
export const HINT_MAX = 28;

export type HintArrow = 'up' | 'down' | null;
export type Hint = {
  text: string;
  arrow: HintArrow;
  /** Everyday wording the player has already learned, so the dock can go quiet. Never a language test. */
  routine?: boolean;
};

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
  /** v0.8: a Fruit card in my hand can be played now (offered next to the sprout) */
  fruitReady?: boolean;
  /** v0.8: what used the turn's sprout so far (a Fruit card uses it too), or null */
  grew?: null | 'sprout' | 'fruit';
};

const h = (text: string, arrow: HintArrow = null, routine = false): Hint => ({ text, arrow, routine });

export const hintFor = (c: HintCtx): Hint => {
  if (c.phase === 'GAME_OVER') return h(c.busy ? '' : t('ui.hint.gameOver', 'Game over.'));
  if (!c.myTurn) return h(c.busy ? t('ui.hint.watchMove', 'Watch {opp} move', { opp: OPP.theirs }) : t('ui.hint.thinking', '{opp} is thinking…', { opp: OPP.The }));
  if (c.busy) return h('');
  switch (c.phase) {
    case 'DRAW': {
      const low = c.deckCount === 1 ? t('ui.hint.drawLastCard', 'Draw: last card in deck') : t('ui.hint.drawLeft', 'Draw: {n} left in deck', { n: c.deckCount });
      if (!c.canTakeThrow) return h(c.deckCount <= 3 ? low : t('ui.hint.drawDeck', 'Draw: tap the deck'), 'down', true);
      return h(c.deckCount <= 3 ? low : t('ui.hint.drawEither', 'Draw: deck or throw pile'), 'down', true);
    }
    case 'ACT': {
      if (c.fruit?.reason) return h(c.fruit.reason);
      if (c.fruit && !c.pending) return h(c.fruit.firstTime ? FRUIT.anyStrength : FRUIT.tapTarget, 'up');
      if (c.pending === 'strengthen') return h(t('ui.hint.strengthen', 'Strengthen: the higher wins'), 'down');
      if (c.pending === 'drawn') return h(t('ui.hint.confirmOrDraw', 'Confirm, or draw it again'), 'down');
      if (c.pending) return h(t('ui.hint.confirmOrTap', 'Confirm, or tap it again'), 'down');
      if (c.drawing) {
        if (c.drawing.fine) return h(t('ui.hint.clickThenFinish', 'Click, then click to finish'), 'up');
        return h(t('ui.hint.paintHexes', 'Paint {n} touching hexes', { n: c.drawing.n }), 'up');
      }
      if (c.card) {
        const { grow, replace, strengthen } = c.card;
        if (!grow && !replace && !strengthen) return h(t('ui.hint.cardCantGrow', "That card can't grow now"));
        if (!c.card.single) return h(t('ui.hint.tapGlow', 'Tap a glowing hex'), 'up');
        if (replace && strengthen) return h(t('ui.hint.tapOvergrowStrengthen', 'Tap: ⇆ overgrow + strengthen'), 'up');
        if (replace) return h(t('ui.hint.tapOvergrow', 'Tap a hex · ⇆ overgrows'), 'up');
        if (strengthen) return h(t('ui.hint.tapStrengthen', 'Tap a hex · + strengthens'), 'up');
        return h('Tap a glowing hex', 'up');
      }
      if (c.kindPicked) return h(t('ui.hint.tapGlow', 'Tap a glowing hex'), 'up');
      if (c.hexWithNoMove) return h(t('ui.hint.nothingGrowsThere', 'Nothing grows there now'));
      if (c.handEmpty) return h(t('ui.hint.noCardsEndTurn', 'No cards: tap “End turn”'), 'down');
      // the Grow (or a Bomb) is used: say so, and point at the throw
      if (c.grew && !c.canSprout) {
        const done = c.grew === 'fruit' ? t('ui.hint.bombUsed', 'Bomb used') : t('ui.hint.grewWord', 'Grew');
        return h(c.canCombo ? t('ui.hint.grewBloomThrow', '{done} · Bloom or Throw', { done }) : t('ui.hint.grewThrow', '{done} · Throw a card', { done }), 'down');
      }
      if (!c.canCombo && c.bloomBlocked) return h(BLOOM.tooFew(c.bloomBlocked));
      if (c.canSprout && c.fruitReady) return h(FRUIT.orSprout, 'down', true);
      if (c.canSprout) return h(c.words.tapHint, 'down', true);
      if (c.canCombo) return h(t('ui.hint.bloomOrThrow', 'Bloom, or Throw a card'), 'down');
      return h(t('ui.hint.nothingGrowsThrow', 'Nothing can grow: Throw'), 'down');
    }
    case 'DISCARD':
      return h(c.throwEndsTurn ? t('ui.hint.throwEnd', 'Throw 1 card to end turn') : t('ui.hint.throwOne', 'Throw 1 card'), 'down', true);
    case 'KNOCK':
      return h(t('ui.hint.knockEnd', 'Knock, or end your turn'), 'down');
    case 'ROT_PICK':
      return h(t('ui.hint.rotPick', 'Pick their tile that rots'), 'up');
    default:
      return h('');
  }
};

/** Positioning pass: the everyday hints (the draw, the sprout, the throw), quiet once learned. */
export const isRoutineHint = (hint: Hint) => hint.routine === true;

/** Full weight for the first 3 turns; then quiet, unless the player seems stuck or it's unusual. */
export const STUCK_MS = 6000;
export const hintWeight = (o: { myTurns: number; idleMs: number; routine: boolean }): 'full' | 'quiet' =>
  o.myTurns <= 3 || !o.routine || o.idleMs >= STUCK_MS ? 'full' : 'quiet';
