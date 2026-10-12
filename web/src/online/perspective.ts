// Phase 3b — one mapping between engine coords and screen coords (P-10).
// Seat 0 / offline: identity. Seat 1 online: 180° rotate (q,r)→(-q,-r).
// Text, numbers and icons never rotate. Server always gets engine coords.
// Me is always moss/tree/bottom; Opponent always lava/volcano/top.

import {
  boardCoords,
  coordKey,
  homeCoord,
  mirror,
  opponent,
  parseKey,
} from '../../../src/engine/index.js';
import type {
  Action,
  Coord,
  Event,
  Player,
  ResolutionSummary,
  RulesConfig,
  State,
  Terrain,
  Tile,
  View,
} from '../../../src/engine/index.js';
import { centerOf } from '../ui/geom.js';

/** Fields both seats must see the same (public match facts). */
export const SHARED_FIELDS = [
  'tiles',
  'scores',
  'throw',
  'deckCount',
  'turnsLeft',
  'starter',
] as const;

/** Fields private to one seat's device mid-turn. */
export const PRIVATE_FIELDS = ['hand', 'draft', 'selection', 'undo'] as const;

/** Personal settings that stay per device and never sync. */
export const PERSONAL_SETTINGS = [
  'theme',
  'sound',
  'handSide',
  'animationSpeed',
  'largeText',
  'bloomHints',
] as const;

export type SharedField = (typeof SHARED_FIELDS)[number];
export type PrivateField = (typeof PRIVATE_FIELDS)[number];
export type PersonalSetting = (typeof PERSONAL_SETTINGS)[number];

export type PerspectiveLabels = {
  me: 'Me';
  opponent: 'Opponent';
  you: 'You';
  /** Score bar labels: Me left, Opponent right. */
  scoreMe: 'Me';
  scoreOpponent: 'Opponent';
  /** "12:8" style pair; captions use You / Opponent separately. */
  scorePair: (meScore: number, oppScore: number) => string;
  captionWho: (enginePlayer: Player) => 'You' | 'Opponent';
  homeKind: (enginePlayer: Player) => 'tree' | 'volcano';
  material: (enginePlayer: Player) => 'moss' | 'lava';
};

export type Perspective = {
  /** Engine seat of the local viewer. Offline is always 0. */
  me: Player;
  opp: Player;
  /** True only for online seat 1. */
  rotated: boolean;
  online: boolean;
  /** Tutorial coach is off online. */
  coachEnabled: boolean;
  /** Hints that need the hidden deck are off online. */
  hiddenDeckHintsEnabled: boolean;
  labels: PerspectiveLabels;
  shared: readonly SharedField[];
  private: readonly PrivateField[];
  personalSettings: readonly PersonalSetting[];

  mapCoord(engine: Coord): Coord;
  unmapCoord(screen: Coord): Coord;
  mapKey(engineKey: string): string;
  unmapKey(screenKey: string): string;

  /** Paint owner: me → 0 (moss), opponent → 1 (lava). */
  displayOwner(engineOwner: Player): 0 | 1;
  engineOwner(displayOwner: 0 | 1): Player;
  isMe(player: Player): boolean;
  isOpp(player: Player): boolean;

  mapActionToScreen(action: Action): Action;
  mapActionToEngine(screenAction: Action): Action;
  mapEventToScreen(event: Event): Event;
  mapResolutionToScreen(res: ResolutionSummary | null): ResolutionSummary | null;

  /** Board/terrain for paint + taps (owners remapped for moss/lava). */
  mapBoardToScreen(board: Record<string, Tile | null>): Record<string, Tile | null>;
  mapBoardToEngine(board: Record<string, Tile | null>): Record<string, Tile | null>;
  mapTerrainToScreen(terrain: Record<string, Terrain>): Record<string, Terrain>;
  mapTerrainToEngine(terrain: Record<string, Terrain>): Record<string, Terrain>;

  /**
   * Remap a View's public board slice for the existing paint path (me=moss bottom).
   * Hand / scores stay viewer-relative; player stays the engine seat.
   */
  toScreenView(view: View): View;

  /**
   * Full State remapped so the existing offline paint path (HUMAN=0 moss bottom)
   * shows this seat's perspective. For screenshots / camera checks only — never
   * submit remapped actions to the server.
   */
  toDisplayState(state: State): State;

  /** Camera tiles in screen board-units; owner is display owner (0=me). */
  cameraTiles(board: Record<string, Tile | null>): { key: string; x: number; y: number; owner: 0 | 1 }[];
};

const mapAction = (action: Action, map: (c: Coord) => Coord): Action => {
  switch (action.t) {
    case 'Bloom':
      return { ...action, hexes: action.hexes.map(map) };
    case 'Sprout':
      return { ...action, coord: map(action.coord) };
    case 'PlayFruit':
      return { ...action, target: map(action.target) };
    case 'MegaBomb':
      return { ...action, target: map(action.target) };
    case 'RotPick':
      return { ...action, coord: map(action.coord) };
    default:
      return action;
  }
};

const mapEvent = (event: Event, map: (c: Coord) => Coord, mapPlayer: (p: Player) => Player): Event => {
  switch (event.t) {
    case 'Bloom':
      return { ...event, player: mapPlayer(event.player), hexes: event.hexes.map(map) };
    case 'Sprout':
      return { ...event, player: mapPlayer(event.player), coord: map(event.coord) };
    case 'Strengthen':
      return { ...event, player: mapPlayer(event.player), coord: map(event.coord) };
    case 'Overgrow':
      return {
        ...event,
        player: mapPlayer(event.player),
        oldOwner: mapPlayer(event.oldOwner),
        coord: map(event.coord),
      };
    case 'FruitCard':
      return { ...event, player: mapPlayer(event.player), target: map(event.target) };
    case 'MegaBomb':
      return {
        ...event,
        player: mapPlayer(event.player),
        target: map(event.target),
        destroyed: event.destroyed.map(map),
      };
    case 'RotPick':
      return { ...event, picker: mapPlayer(event.picker), coord: map(event.coord) };
    case 'Rot':
      return { ...event, player: mapPlayer(event.player), coords: event.coords.map(map) };
    case 'Sever':
      return { ...event, player: mapPlayer(event.player), coords: event.coords.map(map) };
    case 'Draw':
    case 'Discard':
    case 'Knock':
    case 'FinalTurnStart':
    case 'RotCount':
    case 'Strangle':
      return { ...event, player: mapPlayer(event.player) };
    case 'GameEnd': {
      const r = event.result;
      const scores: [number, number] = [r.scores[mapPlayer(0)], r.scores[mapPlayer(1)]];
      const deadwood = r.deadwood
        ? ([r.deadwood[mapPlayer(0)], r.deadwood[mapPlayer(1)]] as [number, number])
        : undefined;
      const strengths = r.strengths
        ? ([r.strengths[mapPlayer(0)], r.strengths[mapPlayer(1)]] as [number, number])
        : undefined;
      return {
        ...event,
        result: {
          ...r,
          winner: r.winner === null ? null : mapPlayer(r.winner),
          scores,
          ...(deadwood ? { deadwood } : {}),
          ...(strengths ? { strengths } : {}),
        },
      };
    }
    default:
      return event;
  }
};

const mapResolution = (
  res: ResolutionSummary,
  map: (c: Coord) => Coord,
  mapPlayer: (p: Player) => Player,
): ResolutionSummary => {
  const out: ResolutionSummary = {
    placed: res.placed.map(map),
    overgrown: res.overgrown.map(map),
    rotted: res.rotted.map(map),
    severed: res.severed.map((s) => ({ player: mapPlayer(s.player), coords: s.coords.map(map) })),
  };
  if (res.bloom) out.bloom = { cards: [...res.bloom.cards], hexes: res.bloom.hexes.map(map) };
  if (res.fruit) out.fruit = { ...res.fruit, target: map(res.fruit.target) };
  if (res.megaBomb) {
    out.megaBomb = {
      ...res.megaBomb,
      target: map(res.megaBomb.target),
      destroyed: res.megaBomb.destroyed.map(map),
    };
  }
  if (res.sprout) out.sprout = map(res.sprout);
  if (res.strengthen) out.strengthen = { ...res.strengthen, coord: map(res.strengthen.coord) };
  if (res.strangled !== undefined) out.strangled = mapPlayer(res.strangled);
  return out;
};

const remapBoard = (
  board: Record<string, Tile | null>,
  mapKey: (k: string) => string,
  mapOwner: (p: Player) => Player,
): Record<string, Tile | null> => {
  const out: Record<string, Tile | null> = {};
  for (const [key, tile] of Object.entries(board)) {
    const next = mapKey(key);
    out[next] = tile ? { ...tile, owner: mapOwner(tile.owner) } : null;
  }
  return out;
};

const remapTerrain = (
  terrain: Record<string, Terrain>,
  mapKey: (k: string) => string,
): Record<string, Terrain> => {
  const out: Record<string, Terrain> = {};
  for (const [key, t] of Object.entries(terrain)) out[mapKey(key)] = t;
  return out;
};

export type PerspectiveOptions = {
  /** Engine seat of the local viewer. */
  me: Player;
  /** Online duel: coach and hidden-deck hints off. Offline leaves them to settings. */
  online?: boolean;
};

/** Build the one mapping for a viewer. Offline must use me=0. */
export const createPerspective = (options: PerspectiveOptions): Perspective => {
  const me = options.me;
  const online = options.online ?? false;
  if (!online && me !== 0) {
    throw new Error('Offline perspective must use seat 0 (identity mapping).');
  }
  const opp = opponent(me);
  const rotated = online && me === 1;
  const mapC = (c: Coord): Coord => (rotated ? mirror(c) : { q: c.q, r: c.r });
  // 180° is its own inverse.
  const unmapC = mapC;
  const mapK = (key: string): string => coordKey(mapC(parseKey(key)));
  const unmapK = mapK;
  const displayOwner = (engineOwner: Player): 0 | 1 => (engineOwner === me ? 0 : 1);
  const engineOwner = (display: 0 | 1): Player => (display === 0 ? me : opp);
  // For display-state player fields: engine seat → paint seat (me→0, opp→1).
  const toDisplayPlayer = displayOwner;
  // Inverse for completeness (display seat → engine).
  const fromDisplayPlayer = engineOwner;

  const labels: PerspectiveLabels = {
    me: 'Me',
    opponent: 'Opponent',
    you: 'You',
    scoreMe: 'Me',
    scoreOpponent: 'Opponent',
    scorePair: (meScore, oppScore) => `${meScore}:${oppScore}`,
    captionWho: (enginePlayer) => (enginePlayer === me ? 'You' : 'Opponent'),
    homeKind: (enginePlayer) => (enginePlayer === me ? 'tree' : 'volcano'),
    material: (enginePlayer) => (enginePlayer === me ? 'moss' : 'lava'),
  };

  const self: Perspective = {
    me,
    opp,
    rotated,
    online,
    coachEnabled: !online,
    hiddenDeckHintsEnabled: !online,
    labels,
    shared: SHARED_FIELDS,
    private: PRIVATE_FIELDS,
    personalSettings: PERSONAL_SETTINGS,

    mapCoord: mapC,
    unmapCoord: unmapC,
    mapKey: mapK,
    unmapKey: unmapK,
    displayOwner,
    engineOwner,
    isMe: (p) => p === me,
    isOpp: (p) => p === opp,

    mapActionToScreen: (a) => mapAction(a, mapC),
    mapActionToEngine: (a) => mapAction(a, unmapC),
    mapEventToScreen: (e) => mapEvent(e, mapC, (p) => p),
    mapResolutionToScreen: (res) => (res ? mapResolution(res, mapC, (p) => p) : null),

    mapBoardToScreen: (board) => remapBoard(board, mapK, displayOwner),
    mapBoardToEngine: (board) => remapBoard(board, unmapK, fromDisplayPlayer),
    mapTerrainToScreen: (terrain) => remapTerrain(terrain, mapK),
    mapTerrainToEngine: (terrain) => remapTerrain(terrain, unmapK),

    toScreenView(view) {
      return {
        ...view,
        board: self.mapBoardToScreen(view.board),
        terrain: self.mapTerrainToScreen(view.terrain),
        lastResolution: self.mapResolutionToScreen(view.lastResolution),
        rotPick: view.rotPick
          ? {
              ...view.rotPick,
              candidates: view.rotPick.candidates.map(mapC),
            }
          : null,
      };
    },

    toDisplayState(state) {
      if (!rotated) {
        // Identity: already me=0 moss bottom. Shallow copy is enough for callers.
        return {
          ...state,
          board: { ...state.board },
          terrain: { ...state.terrain },
          hands: [[...state.hands[0]], [...state.hands[1]]],
          deck: [...state.deck],
          discard: [...state.discard],
          strengthenUsed: [...state.strengthenUsed] as [number, number],
          fruitKnown: [...state.fruitKnown] as [number, number],
        };
      }
      const board = remapBoard(state.board, mapK, toDisplayPlayer);
      const terrain = remapTerrain(state.terrain, mapK);
      const hands: State['hands'] = [[...state.hands[me]], [...state.hands[opp]]];
      const strengthenUsed: [number, number] = [state.strengthenUsed[me], state.strengthenUsed[opp]];
      const fruitKnown: [number, number] = [state.fruitKnown[me], state.fruitKnown[opp]];
      let config = state.config;
      if (config.board) {
        const b = config.board;
        config = {
          ...config,
          board: {
            cells: b.cells.map(mapK).sort(),
            rock: b.rock.map(mapK).sort(),
            gold: b.gold.map(mapK).sort(),
            // After rotate+owner remap, display seat 0 home is at engine me's home mapped.
            homes: [mapK(b.homes[me]), mapK(b.homes[opp])],
          },
        };
      }
      const result = state.result
        ? {
            ...state.result,
            winner:
              state.result.winner === null ? null : toDisplayPlayer(state.result.winner),
            scores: [state.result.scores[me], state.result.scores[opp]] as [number, number],
            ...(state.result.deadwood
              ? {
                  deadwood: [state.result.deadwood[me], state.result.deadwood[opp]] as [
                    number,
                    number,
                  ],
                }
              : {}),
            ...(state.result.strengths
              ? {
                  strengths: [state.result.strengths[me], state.result.strengths[opp]] as [
                    number,
                    number,
                  ],
                }
              : {}),
          }
        : null;
      return {
        ...state,
        config,
        board,
        terrain,
        hands,
        deck: [...state.deck],
        discard: [...state.discard],
        turnPlayer: toDisplayPlayer(state.turnPlayer),
        actor: toDisplayPlayer(state.actor),
        strengthenUsed,
        fruitKnown,
        finalTurn: state.finalTurn
          ? { knocker: toDisplayPlayer(state.finalTurn.knocker) }
          : null,
        deckFinal: state.deckFinal
          ? { ...state.deckFinal, first: toDisplayPlayer(state.deckFinal.first) }
          : null,
        rotPick: state.rotPick
          ? { ...state.rotPick, candidates: state.rotPick.candidates.map(mapC) }
          : null,
        result,
        lastResolution: state.lastResolution
          ? mapResolution(state.lastResolution, mapC, toDisplayPlayer)
          : null,
        ...(state.startingPlayer !== undefined
          ? { startingPlayer: toDisplayPlayer(state.startingPlayer) }
          : {}),
      };
    },

    cameraTiles(board) {
      const tiles: { key: string; x: number; y: number; owner: 0 | 1 }[] = [];
      for (const [key, tile] of Object.entries(board)) {
        if (!tile) continue;
        const screenKey = mapK(key);
        const { x, y } = centerOf(screenKey);
        tiles.push({ key: screenKey, x, y, owner: displayOwner(tile.owner) });
      }
      return tiles;
    },
  };

  return self;
};

/** Offline / local PvE: identity mapping, coach left to settings. */
export const offlinePerspective = (): Perspective => createPerspective({ me: 0, online: false });

/** Online duel viewer for a seat. */
export const onlinePerspective = (seat: Player): Perspective =>
  createPerspective({ me: seat, online: true });

/** My home should sit lower on screen (larger y) than the opponent's for every seat. */
export const homesOnScreen = (
  p: Perspective,
  config: Pick<RulesConfig, 'boardRadius' | 'rootStyle' | 'board'>,
): { me: { key: string; x: number; y: number }; opp: { key: string; x: number; y: number } } => {
  const meKey = p.mapKey(coordKey(homeCoord(p.me, config)));
  const oppKey = p.mapKey(coordKey(homeCoord(p.opp, config)));
  return {
    me: { key: meKey, ...centerOf(meKey) },
    opp: { key: oppKey, ...centerOf(oppKey) },
  };
};

/**
 * Pure camera framing preview (no DOM): prefer my tiles, then recent/near opponent tiles,
 * at a minimum tile size derived from a classic default. Used to prove both seats frame
 * the same way at phone and desktop widths.
 */
export const previewCameraFrame = (input: {
  tiles: { key: string; x: number; y: number; owner: 0 | 1 }[];
  me: 0 | 1;
  width: number;
  height: number;
  /** CSS px for one hex at the classic whole-map fit; default scales with width. */
  defaultTile?: number;
  under?: number;
}): { cx: number; cy: number; tile: number; whole: boolean; framedKeys: string[] } => {
  const S = 30;
  const HEXW = Math.sqrt(3) * S;
  const minFactor = 1.0;
  const maxFactor = 1.4;
  const margin = 2;
  const under = input.under ?? Math.round(input.height * 0.28);
  const winH = Math.max(1, input.height - under);
  const defaultTile = input.defaultTile ?? Math.min(input.width, winH) / 14;
  const minT = defaultTile * minFactor;
  const maxT = defaultTile * maxFactor;

  const xs = input.tiles.map((t) => t.x);
  const ys = input.tiles.map((t) => t.y);
  if (!xs.length) {
    return { cx: 0, cy: 0, tile: minT, whole: true, framedKeys: [] };
  }
  const padWhole = margin * HEXW + S;
  const base = {
    x: Math.min(...xs) - padWhole,
    y: Math.min(...ys) - padWhole,
    w: Math.max(...xs) - Math.min(...xs) + 2 * padWhole,
    h: Math.max(...ys) - Math.min(...ys) + 2 * padWhole,
  };
  const fitTile = (w: number, h: number) => HEXW * Math.min(input.width / w, winH / h);
  const tW = fitTile(base.w, base.h);
  if (tW >= minT - 0.01) {
    return {
      cx: base.x + base.w / 2,
      cy: base.y + base.h / 2,
      tile: Math.min(tW, maxT),
      whole: true,
      framedKeys: input.tiles.map((t) => t.key),
    };
  }

  const bbox = (ps: { x: number; y: number }[], pad: number) => {
    const x0 = Math.min(...ps.map((p) => p.x)) - pad;
    const y0 = Math.min(...ps.map((p) => p.y)) - pad;
    return {
      x: x0,
      y: y0,
      w: Math.max(...ps.map((p) => p.x)) + pad - x0,
      h: Math.max(...ps.map((p) => p.y)) + pad - y0,
    };
  };
  const fits = (r: { w: number; h: number }) =>
    (r.w * minT) / HEXW <= input.width && (r.h * minT) / HEXW <= winH;

  const mine = input.tiles.filter((t) => t.owner === input.me);
  const theirs = input.tiles.filter((t) => t.owner !== input.me);
  let set = [...mine];
  const pad = S + 6;
  if (!fits(bbox(set, pad))) {
    const r = bbox(set, pad);
    return {
      cx: r.x + r.w / 2,
      cy: r.y + r.h / 2,
      tile: minT,
      whole: false,
      framedKeys: set.map((t) => t.key),
    };
  }
  const near = (p: { x: number; y: number }) =>
    Math.min(...mine.map((q) => Math.hypot(p.x - q.x, p.y - q.y)), Infinity);
  for (const p of theirs.sort((a, b) => near(a) - near(b))) {
    const next = [...set, p];
    if (fits(bbox(next, pad))) set = next;
  }
  const m = margin * HEXW + S;
  const roomy = bbox(set, m);
  const r = fits(roomy) ? roomy : bbox(set, pad);
  return {
    cx: r.x + r.w / 2,
    cy: r.y + r.h / 2,
    tile: minT,
    whole: false,
    framedKeys: set.map((t) => t.key),
  };
};

/** Every classic-board hex key (for roundtrip tests). */
export const classicHexKeys = (radius = 3): string[] =>
  boardCoords({ boardRadius: radius, rootStyle: 'ring2', board: null }).map(coordKey);
