// Turn filtered server Events into AnimQueue Steps (catch-up / opponent replay).
import { coordKey } from '../../../src/engine/index.js';
import type { Card, Event, GameResult, Player, Tile } from '../../../src/engine/index.js';
import type { Board, Step } from '../logic/anim.js';
import type { Perspective } from './perspective.js';

const mapKey = (key: string, p: Perspective | null): string => (p ? p.mapKey(key) : key);
const mapCoordKey = (c: { q: number; r: number }, p: Perspective | null): string =>
  mapKey(coordKey(c), p);
const mapPlayer = (player: Player, p: Perspective | null): Player =>
  p ? p.displayOwner(player) : player;

/** Convert one public Event into zero or more Steps (coords optionally screen-mapped). */
export const stepsFromEvent = (e: Event, perspective: Perspective | null = null): Step[] => {
  const p = perspective;
  switch (e.t) {
    case 'Draw':
      return [{ k: 'draw', player: mapPlayer(e.player, p), from: e.from }];
    case 'Bloom': {
      const tiles = e.hexes.map((c, i) => ({
        key: mapCoordKey(c, p),
        strength: 1,
        replaced: false,
        _rankHint: i,
      }));
      return [
        {
          k: 'grow',
          style: 'bloom',
          player: mapPlayer(e.player, p),
          tiles: tiles.map(({ key, strength, replaced }) => ({ key, strength, replaced })),
        },
      ];
    }
    case 'Sprout':
      return [
        {
          k: 'grow',
          style: 'sprout',
          player: mapPlayer(e.player, p),
          tiles: [{ key: mapCoordKey(e.coord, p), strength: 1, replaced: false }],
        },
      ];
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
): Step[] => events.flatMap((e) => stepsFromEvent(e, perspective));

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
