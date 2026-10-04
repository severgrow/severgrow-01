import { coordKey } from './board.js';
import { deadwood } from './deadwood.js';
import { rotCount } from './rot.js';
import { leftoverRulesOn } from './phases.js';
import type { Action, Event, Player, State } from './types.js';

const other = (p: Player): Player => (p === 0 ? 1 : 0);

/** Sever, Strangle, refill-draw and GameEnd events for a resolution that just finished. */
const settleEvents = (before: State, after: State, p: Player, refill: boolean): Event[] => {
  const out: Event[] = [];
  const res = after.lastResolution;
  for (const cut of res?.severed ?? []) out.push({ t: 'Sever', player: cut.player, coords: cut.coords.map((c) => ({ ...c })) });
  if (after.phase === 'GAME_OVER' && before.phase !== 'GAME_OVER' && after.result) {
    if (after.result.reason === 'double_strangle') out.push({ t: 'Strangle', player: 0 }, { t: 'Strangle', player: 1 });
    if (after.result.reason === 'strangle') out.push({ t: 'Strangle', player: other(after.result.winner!) });
  }
  if (refill) {
    const had = new Set(before.hands[p].map((c) => c.id));
    for (const c of after.hands[p]) if (!had.has(c.id)) out.push({ t: 'Draw', player: p, from: 'deck', card: c.id });
  }
  return out;
};

/**
 * The events one action produced (spec 12), derived from the states before and after
 * it. Every board change is covered: placements (Bloom, Sprout), Overgrow, Fruit cards,
 * Rot, RotPick and Sever.
 */
export const eventsOf = (before: State, a: Action, after: State): Event[] => {
  const p = before.turnPlayer;
  const out: Event[] = [];
  const res = after.lastResolution;
  switch (a.t) {
    case 'Draw': {
      const card = a.from === 'deck' ? before.deck[0]! : before.discard.at(-1)!;
      out.push({ t: 'Draw', player: p, from: a.from, card: card.id });
      break;
    }
    case 'Bloom': {
      const b = res!.bloom!;
      out.push({ t: 'Bloom', player: p, cards: [...b.cards], hexes: b.hexes.map((c) => ({ ...c })) });
      for (const c of res?.overgrown ?? []) {
        const old = before.board[coordKey(c)]!;
        out.push({
          t: 'Overgrow',
          player: p,
          coord: { ...c },
          oldOwner: old.owner,
          oldStrength: old.strength,
          newStrength: after.board[coordKey(c)]!.strength,
        });
      }
      out.push(...settleEvents(before, after, p, false));
      break;
    }
    case 'Sprout': {
      if (res?.strengthen) {
        const st = res.strengthen;
        out.push({ t: 'Strengthen', player: p, card: a.card, coord: { ...st.coord }, oldStrength: st.from, newStrength: st.to });
        out.push(...settleEvents(before, after, p, false));
        break;
      }
      out.push({ t: 'Sprout', player: p, card: a.card, coord: { ...res!.sprout! } });
      for (const c of res?.overgrown ?? []) {
        const old = before.board[coordKey(c)]!;
        out.push({ t: 'Overgrow', player: p, coord: { ...c }, oldOwner: old.owner, oldStrength: old.strength, newStrength: after.board[coordKey(c)]!.strength });
      }
      out.push(...settleEvents(before, after, p, false));
      break;
    }
    case 'PlayFruit':
      out.push({ t: 'FruitCard', player: p, card: res!.fruit!.card, target: { ...res!.fruit!.target }, strength: res!.fruit!.strength });
      out.push(...settleEvents(before, after, p, false));
      break;
    case 'Discard':
      out.push({ t: 'Discard', player: p, card: a.card });
      // v0.4: with Rot and Knock off the turn finishes inside the discard.
      if (!before.finalTurn && !leftoverRulesOn(before)) out.push(...settleEvents(before, after, p, true));
      break;
    case 'Knock':
      out.push({ t: 'Knock', player: p });
      if (after.finalTurn && after.phase === 'DRAW') out.push({ t: 'FinalTurnStart', player: after.turnPlayer });
      break;
    case 'Continue': {
      const dw = deadwood(before.hands[p]);
      out.push({ t: 'RotCount', player: p, deadwood: dw, count: rotCount(dw, before.config) });
      const rotted = res?.rotted ?? [];
      if (rotted.length > 0 && res !== before.lastResolution) out.push({ t: 'Rot', player: p, coords: rotted.map((c) => ({ ...c })) });
      if (after.phase !== 'ROT_PICK') out.push(...settleEvents(before, after, p, true));
      break;
    }
    case 'RotPick':
      out.push({ t: 'RotPick', picker: before.actor, coord: { q: a.coord.q + 0, r: a.coord.r + 0 } });
      if (after.phase !== 'ROT_PICK') out.push(...settleEvents(before, after, p, true));
      break;
    case 'EndAct':
      // v0.4: an empty hand skips the discard; the turn may finish right here.
      if (before.hands[p].length === 0 && !before.finalTurn && !leftoverRulesOn(before)) out.push(...settleEvents(before, after, p, true));
      break;
  }
  if (after.phase === 'GAME_OVER' && before.phase !== 'GAME_OVER' && after.result) out.push({ t: 'GameEnd', result: after.result });
  return out;
};

/** The history as `player` may see it: the opponent's deck draws hide the card. */
export const eventsFor = (state: State, player: Player): Event[] =>
  (state.history ?? []).map((e) =>
    e.t === 'Draw' && e.from === 'deck' && e.player !== player ? { t: 'Draw', player: e.player, from: 'deck' } : e,
  );
