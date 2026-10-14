// Turn filtered server Events into AnimQueue Steps (catch-up / opponent replay).
import { coordKey, createCards } from '../../../src/engine/index.js';
import type { Card, Event, GameResult, Player, RulesConfig, Tile, View } from '../../../src/engine/index.js';
import type { Board, Step } from '../logic/anim.js';
import type { Perspective } from './perspective.js';

const mapKey = (key: string, p: Perspective | null): string => (p ? p.mapKey(key) : key);
const mapCoordKey = (c: { q: number; r: number }, p: Perspective | null): string =>
  mapKey(coordKey(c), p);
const mapPlayer = (player: Player, p: Perspective | null): Player =>
  p ? p.displayOwner(player) : player;

/**
 * Everything a reveal needs to draw the RIGHT numbers. `eventsOf` writes a Bloom's cards and hexes
 * as PAIRS (`hexes[i]` receives `cards[i]`), so the number a new tile carries is the rank of the
 * card played on it — and the engine's own deck order (`createCards`) turns a card id into that
 * rank, with no hidden information and no protocol change (the ids are already public in the
 * event). `board` (the board the reveal ends on) is the fallback when an id cannot be resolved.
 *
 * Without this the reveal drew every new tile as a `1` and only the turn-ending sync corrected it —
 * the owner's report: "the tiles first show up all as '1' strenght and then change to the actual
 * strenght of the card that was used". The offline game never flashed, because it reads the same
 * value off the state the action produced; this makes the online reveal match it.
 */
export type StepContext = {
  rankById?: ReadonlyMap<number, number>;
  board?: Board;
};

/** The card-id → rank map for a rules config, from the engine's own card order. */
export const stepContextFor = (view: View | null | undefined): StepContext => {
  if (!view) return {};
  return { rankById: rankMap(view.config), board: view.board };
};

const rankMaps = new WeakMap<RulesConfig, Map<number, number>>();
const rankMap = (config: RulesConfig): Map<number, number> => {
  let map = rankMaps.get(config);
  if (!map) {
    map = new Map(createCards(config).map((c) => [c.id, c.rank]));
    rankMaps.set(config, map);
  }
  return map;
};

/** The number a played card gives its tile: its rank, else the board's word, else 1. */
const placedStrength = (context: StepContext, cardId: number | undefined, key: string): number => {
  if (cardId !== undefined) {
    const rank = context.rankById?.get(cardId);
    if (rank !== undefined && rank > 0) return rank;
  }
  return context.board?.[key]?.strength ?? 1;
};

/** Convert one public Event into zero or more Steps (coords optionally screen-mapped). */
export const stepsFromEvent = (
  e: Event,
  perspective: Perspective | null = null,
  context: StepContext = {},
): Step[] => {
  const p = perspective;
  switch (e.t) {
    case 'Draw':
      return [{ k: 'draw', player: mapPlayer(e.player, p), from: e.from }];
    case 'Bloom': {
      const tiles = e.hexes.map((c, i) => {
        const key = mapCoordKey(c, p);
        return {
          key,
          strength: placedStrength(context, e.cards[i], key),
          replaced: false,
        };
      });
      return [
        {
          k: 'grow',
          style: 'bloom',
          player: mapPlayer(e.player, p),
          tiles: tiles.map(({ key, strength, replaced }) => ({ key, strength, replaced })),
        },
      ];
    }
    case 'Sprout': {
      const key = mapCoordKey(e.coord, p);
      return [
        {
          k: 'grow',
          style: 'sprout',
          player: mapPlayer(e.player, p),
          tiles: [{ key, strength: placedStrength(context, e.card, key), replaced: false }],
        },
      ];
    }
    case 'Strengthen':
      return [
        {
          k: 'strengthen',
          player: mapPlayer(e.player, p),
          key: mapCoordKey(e.coord, p),
          from: e.oldStrength,
          to: e.newStrength,
        },
      ];
    case 'Overgrow':
      return [
        {
          k: 'grow',
          style: 'sprout',
          player: mapPlayer(e.player, p),
          tiles: [{ key: mapCoordKey(e.coord, p), strength: e.newStrength, replaced: true }],
        },
      ];
    case 'FruitCard':
      return [
        {
          k: 'fruit',
          player: mapPlayer(e.player, p),
          card: { id: e.card, suit: null, rank: 0 } as Card,
          target: mapCoordKey(e.target, p),
          strength: e.strength,
        },
      ];
    case 'MegaBomb':
      return [
        {
          k: 'megaBomb',
          player: mapPlayer(e.player, p),
          target: mapCoordKey(e.target, p),
          destroyed: e.destroyed.map((c) => mapCoordKey(c, p)),
        },
      ];
    case 'Discard':
      return []; // no card body without hand knowledge
    case 'Sever':
      return [
        {
          k: 'sever',
          player: mapPlayer(e.player, p),
          by: mapPlayer(e.player === 0 ? 1 : 0, p),
          keys: e.coords.map((c) => mapCoordKey(c, p)),
          origin: mapCoordKey(e.coords[0]!, p),
        },
      ];
    case 'Rot':
      return [{ k: 'remove', reason: 'rot', keys: e.coords.map((c) => mapCoordKey(c, p)) }];
    case 'Strangle':
      return [{ k: 'strangle', loser: mapPlayer(e.player, p) }];
    case 'GameEnd':
      return [{ k: 'end', result: mapResult(e.result, p) }];
    default:
      return [];
  }
};

export const stepsFromEvents = (
  events: readonly Event[],
  perspective: Perspective | null = null,
  view?: View | null,
): Step[] => {
  const context = stepContextFor(view);
  return events.flatMap((e) => stepsFromEvent(e, perspective, context));
};

export const syncStep = (board: Board, scores: [number, number]): Step => ({
  k: 'sync',
  board: Object.fromEntries(
    Object.entries(board).map(([k, t]) => [k, t ? ({ ...t } as Tile) : null]),
  ),
  scores,
});

const mapResult = (r: GameResult, p: Perspective | null): GameResult => {
  if (!p || !p.rotated) return r;
  return {
    ...r,
    winner: r.winner === null ? null : p.displayOwner(r.winner),
    scores: [r.scores[p.me], r.scores[p.opp]] as [number, number],
    ...(r.deadwood
      ? { deadwood: [r.deadwood[p.me], r.deadwood[p.opp]] as [number, number] }
      : {}),
    ...(r.strengths
      ? { strengths: [r.strengths[p.me], r.strengths[p.opp]] as [number, number] }
      : {}),
  };
};
