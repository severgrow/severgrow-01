// The forecast (UI overhaul items 8 and 10): what a move would do before it is played, and
// whether it should ask for a Confirm. Read-only: everything is computed on copies through
// the engine's public planning functions (via the shared simulate), never changing the view.
import { allNeighbors, coordKey, homeCoord, onBoard, parseKey } from '../../../src/engine/index.js';
import type { Action, Player, Terrain, Tile, View } from '../../../src/engine/index.js';
import { simulate, threats } from '../../../src/bots/evaluate.js';
import { OPP } from '../../../src/strings.js';

export type Forecast = {
  kind: 'grow' | 'strengthen' | 'fruit' | 'throw';
  /** tiles this move places (not counting a strengthen) */
  tiles: number;
  /** my score change */
  points: number;
  /** opponent tiles replaced by my new tiles */
  replaced: number;
  /** opponent tiles cut off by the move (not the replaced ones) */
  cutTheirs: string[];
  /** my tiles this move cuts off (a Fruit card never costs me a tile) */
  cutMine: string[];
  /** the opponent's best cut of my network after the move (the weak tile and how many it takes) */
  atRisk: { key: string; loss: number } | null;
  /** the same before the move, so a forecast can say whether the move made it worse */
  atRiskBefore: number;
  wins: boolean;
  /** this move plays or throws my last card */
  lastCard: boolean;
  /** after the move my root is easy to strangle: 4+ of its 6 neighbours blocked, one by an opponent tile */
  rootDanger: boolean;
};

/** When a Smart confirmation asks: thresholds are config values. */
export type ConfirmRules = { atRisk: number; rootBlocked: number };
export const CONFIRM_RULES: Readonly<ConfirmRules> = Object.freeze({ atRisk: 3, rootBlocked: 4 });
export type ConfirmMode = 'smart' | 'always' | 'never';
export const CONFIRM_MODES: readonly ConfirmMode[] = ['smart', 'always', 'never'];

type Ctx = { config: View['config']; terrain: Record<string, Terrain>; board: Record<string, Tile | null> };

/** How many of my root's six neighbours are blocked (off-board, rock or an opponent tile), and whether one is an opponent tile. */
export const rootBlocked = (ctx: Ctx, me: Player): { blocked: number; byEnemy: boolean } => {
  let blocked = 0;
  let byEnemy = false;
  for (const n of allNeighbors(homeCoord(me, ctx.config))) {
    const key = coordKey(n);
    const t = ctx.board[key];
    if (!onBoard(n, ctx.config) || ctx.terrain[key] === 'rock') blocked++;
    else if (t && t.owner !== me) {
      blocked++;
      byEnemy = true;
    }
  }
  return { blocked, byEnemy };
};

const danger = (ctx: Ctx, me: Player, rules = CONFIRM_RULES) => {
  const r = rootBlocked(ctx, me);
  return r.byEnemy && r.blocked >= rules.rootBlocked;
};

/** The forecast for a move, or null for moves with nothing to forecast (draws, ending the Grow step). */
export const forecastMove = (v: View, a: Action, rules = CONFIRM_RULES): Forecast | null => {
  const me = v.player;
  const opp: Player = me === 0 ? 1 : 0;
  const atRiskBefore = threats(v, me)[0]?.loss ?? 0;
  if (a.t === 'Discard') {
    return { kind: 'throw', tiles: 0, points: 0, replaced: 0, cutTheirs: [], cutMine: [], atRisk: null, atRiskBefore, wins: false, lastCard: v.hand.length === 1, rootDanger: false };
  }
  const sim = simulate(v, a);
  if (!sim) return null;
  const after: Ctx = { config: v.config, terrain: v.terrain, board: sim.board };
  const isStrengthen = a.t === 'Sprout' && v.board[coordKey(a.coord)]?.owner === me;
  const placedKeys = new Set<string>(a.t === 'Sprout' ? [coordKey(a.coord)] : a.t === 'Bloom' ? a.hexes.map(coordKey) : []);
  const cutTheirs = Object.keys(v.board).filter((k) => v.board[k]?.owner === opp && !v.board[k]!.root && !placedKeys.has(k) && !sim.board[k] && !(a.t === 'PlayFruit' && coordKey(a.target) === k));
  const cutMine = Object.keys(v.board).filter((k) => v.board[k]?.owner === me && !v.board[k]!.root && sim.board[k]?.owner !== me).sort();
  const worst = threats(after, me)[0] ?? null;
  const cards = a.t === 'Sprout' || a.t === 'PlayFruit' ? 1 : a.t === 'Bloom' || a.t === 'MegaBomb' ? a.cards.length : 0;
  return {
    kind: a.t === 'PlayFruit' ? 'fruit' : isStrengthen ? 'strengthen' : 'grow',
    tiles: isStrengthen ? 0 : sim.placed,
    points: sim.points,
    replaced: isStrengthen ? 0 : sim.taken - (a.t === 'PlayFruit' ? 1 : 0),
    cutTheirs: cutTheirs.sort(),
    cutMine,
    atRisk: worst ? { key: worst.key, loss: worst.loss } : null,
    atRiskBefore,
    wins: sim.wins,
    lastCard: cards > 0 && cards === v.hand.length,
    rootDanger: danger(after, me, rules) && !danger(v, me, rules),
  };
};

/** Why a move is risky (empty when it is safe), in plain words for the forecast bar. */
export const riskReasons = (f: Forecast, rules = CONFIRM_RULES): ('atRisk' | 'cutsOwn' | 'fruit' | 'lastCard' | 'root')[] => {
  const out: ('atRisk' | 'cutsOwn' | 'fruit' | 'lastCard' | 'root')[] = [];
  if (f.wins) return out;
  if (f.atRisk && f.atRisk.loss >= rules.atRisk && f.atRisk.loss > f.atRiskBefore) out.push('atRisk');
  if (f.kind !== 'fruit' && f.cutMine.length > 0) out.push('cutsOwn');
  if (f.kind === 'fruit') out.push('fruit');
  if (f.lastCard) out.push('lastCard');
  if (f.rootDanger) out.push('root');
  return out;
};

export type RiskReason = ReturnType<typeof riskReasons>[number];

/** The forecast bar's risk lines: an icon and a short plain sentence each. */
export const riskLines = (f: Forecast, rules = CONFIRM_RULES): { reason: RiskReason; icon: string; text: string }[] =>
  riskReasons(f, rules).map((reason) => {
    const n = f.cutMine.length;
    switch (reason) {
      case 'atRisk':
        return { reason, icon: '⚠', text: `${OPP.The} could cut ${f.atRisk!.loss} of yours` };
      case 'cutsOwn':
        return { reason, icon: '✂', text: `Cuts off ${n} of your tiles` };
      case 'fruit':
        return { reason, icon: '✿', text: 'Uses a Fruit card' };
      case 'lastCard':
        return { reason, icon: '▢', text: 'Uses your last card' };
      case 'root':
        return { reason, icon: '◉', text: 'Your home gets boxed in' };
    }
  });

/**
 * Does this move need a Confirm? Smart: only risky moves (see riskReasons). Always: every
 * move on the board, and throwing the last card. Never: nothing.
 */
export const needsConfirm = (mode: ConfirmMode, f: Forecast | null, rules = CONFIRM_RULES): boolean => {
  if (!f || mode === 'never') return false;
  if (mode === 'always') return f.kind !== 'throw' || f.lastCard;
  return riskReasons(f, rules).length > 0;
};

/**
 * The veins a move would grow (item 10): each new tile linked to my neighbouring tiles and to
 * the other new tiles. Pairs are sorted and listed once. Read-only.
 */
export const ghostLinks = (board: Record<string, Tile | null>, me: Player, ghosts: readonly string[]): [string, string][] => {
  const g = new Set(ghosts);
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const k of ghosts) {
    for (const n of allNeighbors(parseKey(k))) {
      const nk = coordKey(n);
      if (!g.has(nk) && board[nk]?.owner !== me) continue;
      const pair: [string, string] = k < nk ? [k, nk] : [nk, k];
      const id = pair.join('|');
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(pair);
    }
  }
  return out.sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1));
};
