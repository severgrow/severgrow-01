import { allNeighbors, boardCoords, coordKey, homeCoord, onBoard } from './board.js';
import { isFruitCard } from './cards.js';
import { IllegalActionError } from './errors.js';
import type { IllegalActionCode } from './errors.js';
import type { BoardCtx } from './overgrow.js';
import { assertCoord } from './placement.js';
import type { Card, Coord, Player } from './types.js';

const fail = (code: IllegalActionCode, message: string): never => { throw new IllegalActionError(code,message); };

/** Only territory reachable from its own home may launch a Mega Bomb. */
const connectedKeys = (ctx: BoardCtx, player: Player): Set<string> => {
  const home = homeCoord(player,ctx.config);
  const homeKey = coordKey(home);
  const seen = new Set<string>();
  if (ctx.board[homeKey]?.owner !== player) return seen;
  const stack = [home]; seen.add(homeKey);
  while (stack.length) for (const neighbor of allNeighbors(stack.pop()!)) {
    const key = coordKey(neighbor);
    if (!seen.has(key) && ctx.board[key]?.owner === player) { seen.add(key); stack.push(neighbor); }
  }
  return seen;
};

export const megaBombTargetBlocker = (ctx: BoardCtx, player: Player, target: Coord, network = connectedKeys(ctx,player)): IllegalActionCode | null => {
  if (!onBoard(target,ctx.config)) return 'OFF_BOARD';
  const tile = ctx.board[coordKey(target)];
  if (!tile || tile.owner === player) return 'MEGA_BOMB_TARGET_NOT_ENEMY';
  if (tile.root) return 'MEGA_BOMB_TARGET_ROOT';
  if (!allNeighbors(target).some(neighbor=>network.has(coordKey(neighbor)))) return 'MEGA_BOMB_NOT_CONNECTED';
  return null;
};

export const megaBombTargets = (ctx: BoardCtx, player: Player): Coord[] => {
  const network = connectedKeys(ctx,player);
  return boardCoords(ctx.config).filter(target=>megaBombTargetBlocker(ctx,player,target,network)===null);
};

/** Validates the two Bombs and returns only enemy non-home tiles inside the seven-hex area. */
export const planMegaBomb = (ctx: BoardCtx, player: Player, hand: readonly Card[], ids: readonly number[], target: unknown) => {
  if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1]) fail('MEGA_BOMB_NEEDS_TWO','Mega Bomb requires two distinct Bomb cards');
  const cards = ids.map(id=>hand.find(card=>card.id===id));
  if (cards.some(card=>!card)) fail('CARD_NOT_IN_HAND','both Bomb cards must be in hand');
  if (cards.some(card=>!isFruitCard(card!))) fail('NOT_A_FRUIT_CARD','Mega Bomb uses two Bomb cards');
  const coord = assertCoord(target);
  const blocker = megaBombTargetBlocker(ctx,player,coord);
  if (blocker) fail(blocker,`cannot launch Mega Bomb at ${coordKey(coord)}`);
  const destroyed = [coord,...allNeighbors(coord)].filter(cell=>{
    const tile = ctx.board[coordKey(cell)];
    return onBoard(cell,ctx.config) && !!tile && tile.owner !== player && !tile.root;
  });
  return { cards: cards as Card[], target: coord, destroyed };
};
