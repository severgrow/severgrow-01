// THE TURN GUIDE — the page half (owner, 2026-11-11: "once the guide ? button is pressed until the end
// of current turn - until throw - we use the big highlight we have ... So we don't say anything but
// clearly guide step by step through the round. ? button lives in context button now, match intel
// stays match intel").
//
// One switch, one turn: "?" in the context key turns it on; the rest of THIS turn is lit one step at
// a time with the lesson glow (logic/turn-guide.ts says what); it switches itself off when the turn
// ends, the game ends, or "?" is pressed again. No window, no words, nothing stored, nothing sent.
import type { Action, View } from '../../../src/engine/index.js';
import { turnGuideStep } from '../logic/turn-guide.js';

export type TurnGuideHooks = {
  /** The player's view and the moves legal right now, or null when no game is on screen. */
  position(): { view: View; legal: readonly Action[] } | null;
  /** The card picked in the hand right now, or null. */
  selectedCard(): number | null;
  /** Something else owns the teaching (the Tutorial, a level's lesson, a replay). */
  busy(): boolean;
  /** Light these elements (the levels' glow), or clear the light with an empty list. */
  light(selectors: string[]): void;
  /** The context key's state changed (pressed / available): repaint it. */
  changed(): void;
};

export type TurnGuide = {
  /** "?" can be offered now (the player's own move in a normal game). */
  available(): boolean;
  /** The guide is lighting this turn. */
  on(): boolean;
  /** "?" pressed: on for the rest of the turn, or off again. */
  toggle(): void;
  /** Called on every render: move the light to the current step, or end with the turn. */
  update(): void;
  /** A new game, the menu, a lesson: off, no light. */
  reset(): void;
};

/** The "?" key's spoken name (the same words the old help key used). */
export const TURN_GUIDE_LABEL = 'How to play';

const cardSel = (id: number) => `#hand .card[data-card="${id}"]`;
const hexSel = (key: string) => `#board .hex-cell[data-key="${key}"]`;

export const mountTurnGuide = (hooks: TurnGuideHooks): TurnGuide => {
  let active = false;
  /** The turn the guide was switched on for (its view's turn number): another turn switches it off. */
  let turnOf: number | null = null;
  let lastLit = '';

  const myStep = () => {
    if (hooks.busy()) return null;
    const p = hooks.position();
    if (!p) return null;
    return { p, step: turnGuideStep(p.view, p.legal, hooks.selectedCard()) };
  };
  const paint = (selectors: string[]) => {
    const key = selectors.join(',');
    if (key === lastLit) return;
    lastLit = key;
    hooks.light(selectors);
  };
  const off = () => {
    const was = active;
    active = false;
    turnOf = null;
    paint([]);
    if (was) hooks.changed();
  };

  const update = () => {
    if (!active) return;
    const now = myStep();
    // The turn is over (their move, game over, a lesson took over) or a new turn began: off.
    if (!now?.step || (turnOf !== null && now.p.view.turnNumber !== turnOf)) { off(); return; }
    const { step } = now;
    const selectors = [
      ...step.piles.map((p) => `#${p} .pile-card`),
      ...step.cards.map(cardSel),
      ...step.hexes.map(hexSel),
      ...(step.bloom ? ['#smart-bloom-button'] : []),
      ...(step.skip ? ['#smart-context'] : []),
    ];
    paint(selectors);
  };

  return {
    available: () => !!myStep()?.step,
    on: () => active,
    toggle() {
      if (active) { off(); return; }
      const now = myStep();
      if (!now?.step) return;
      active = true;
      turnOf = now.p.view.turnNumber;
      lastLit = '';
      hooks.changed();
      update();
    },
    update,
    reset: off,
  };
};
