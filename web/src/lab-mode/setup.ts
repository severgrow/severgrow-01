// The Lab (test copy only): one experiment = a map, a deck, a game length and an opponent level.
// It turns into ordinary engine config overrides; "Classic" gives no overrides at all, so the
// classic game is untouched. Experiments travel in share links (versioned, decoded safely).
import { DEFAULT_CONFIG, allCoords, coordKey, hexDistance, parseKey } from '../../../src/engine/index.js';
import type { RulesConfig } from '../../../src/engine/index.js';
import { SHAPE_LIMITS, buildMap } from './boardgen.js';
import type { HomesMode, MapResult, ShapeKind } from './boardgen.js';

export type LabSetup = {
  name: string;
  /** 'classic' keeps the classic board (radius 3, its own terrain generation) */
  map: 'classic' | ShapeKind;
  a: number;
  b: number;
  rockPct: number;
  goldPct: number;
  homes: HomesMode;
  mapSeed: number;
  handSize: number;
  copies: number;
  maxRank: number;
  fruit: number;
  sprout: boolean;
  strengthen: boolean;
  reshuffle: boolean;
  /** turns per player; 0 = until the deck runs out (not allowed with reshuffle) */
  turns: number;
  level: number;
};

export const CLASSIC: LabSetup = {
  name: 'Classic',
  map: 'classic',
  a: 3,
  b: 3,
  rockPct: 11,
  goldPct: 14,
  homes: 'auto',
  mapSeed: 1,
  handSize: DEFAULT_CONFIG.handSize,
  copies: DEFAULT_CONFIG.copiesPerCard,
  maxRank: DEFAULT_CONFIG.maxRank,
  fruit: DEFAULT_CONFIG.fruitCardCount,
  sprout: DEFAULT_CONFIG.sproutsPerTurn > 0,
  strengthen: DEFAULT_CONFIG.allowStrengthen,
  reshuffle: false,
  turns: DEFAULT_CONFIG.maxTurnsPerPlayer,
  level: 7,
};

const P = (name: string, x: Partial<LabSetup>): LabSetup => ({ ...CLASSIC, name, ...x });
export const PRESETS: LabSetup[] = [
  CLASSIC,
  P('Big hex', { map: 'hexagon', a: 4, reshuffle: true, turns: 40 }),
  P('Huge hex', { map: 'hexagon', a: 6, reshuffle: true, turns: 60 }),
  P('Rhombus 7x7', { map: 'rhombus', a: 7, b: 7, reshuffle: true, turns: 40 }),
  P('Tall rectangle 6x10', { map: 'rectangle', a: 6, b: 10, reshuffle: true, turns: 40 }),
  P('Ring', { map: 'ring', a: 5, b: 2, reshuffle: true, turns: 40 }),
  P('Triangle', { map: 'triangle', a: 9, reshuffle: true, turns: 40 }),
  P('Long game', { reshuffle: true, turns: 50 }),
];

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : dflt;
  return Math.min(hi, Math.max(lo, n));
};

/** Every value inside its range (used on anything from a link or storage). */
export const sanitize = (x: Partial<Record<keyof LabSetup, unknown>>): LabSetup => {
  const map = (['classic', ...Object.keys(SHAPE_LIMITS)] as const).includes(x.map as never) ? (x.map as LabSetup['map']) : 'classic';
  const lim = map === 'classic' ? null : SHAPE_LIMITS[map];
  const reshuffle = x.reshuffle === true;
  return {
    name: typeof x.name === 'string' ? x.name.replace(/[<>&"]/g, '').slice(0, 40) || 'Experiment' : 'Experiment',
    map,
    a: lim ? clampInt(x.a, lim.a[0], lim.a[1], lim.a[0]) : 3,
    b: lim?.b ? clampInt(x.b, lim.b[0], lim.b[1], lim.b[0]) : clampInt(x.b, 1, 16, 3),
    rockPct: clampInt(x.rockPct, 0, 40, 11),
    goldPct: clampInt(x.goldPct, 0, 40, 14),
    homes: x.homes === 'corners' || x.homes === 'centre' ? x.homes : 'auto',
    mapSeed: clampInt(x.mapSeed, 1, 999_999, 1),
    handSize: clampInt(x.handSize, 4, 10, CLASSIC.handSize),
    copies: clampInt(x.copies, 1, 3, CLASSIC.copies),
    maxRank: clampInt(x.maxRank, 5, 9, CLASSIC.maxRank),
    fruit: clampInt(x.fruit, 0, 8, CLASSIC.fruit),
    sprout: x.sprout !== false,
    strengthen: x.strengthen !== false,
    reshuffle,
    // with reshuffle the turn limit is the only clock, so it can't be "until the deck runs out"
    turns: clampInt(x.turns, reshuffle ? 10 : 0, 200, CLASSIC.turns),
    level: clampInt(x.level, 1, 9, 7),
  };
};

export const mapOf = (s: LabSetup): MapResult | null =>
  s.map === 'classic' ? null : buildMap({ shape: s.map, a: s.a, b: s.b, rockPct: s.rockPct, goldPct: s.goldPct, homes: s.homes, seed: s.mapSeed });

/** The engine overrides for an experiment (only what differs from the classic game). */
export const toOverrides = (s: LabSetup, m: MapResult | null = mapOf(s)): Partial<RulesConfig> => {
  const o: Partial<RulesConfig> = {};
  if (m) {
    // the radius the rest of the game uses for names and sizes: how far the board reaches
    const R = Math.max(1, ...m.spec.cells.map((k) => hexDistance(parseKey(k), { q: 0, r: 0 })));
    o.board = m.spec;
    o.boardRadius = R;
  }
  if (s.handSize !== CLASSIC.handSize) o.handSize = s.handSize;
  if (s.copies !== CLASSIC.copies) o.copiesPerCard = s.copies;
  if (s.maxRank !== CLASSIC.maxRank) o.maxRank = s.maxRank;
  if (s.fruit !== CLASSIC.fruit) o.fruitCardCount = s.fruit;
  if (!s.sprout) o.sproutsPerTurn = 0;
  if (!s.strengthen) o.allowStrengthen = false;
  if (s.reshuffle) o.reshuffleDiscard = true;
  if (s.turns !== CLASSIC.turns) o.maxTurnsPerPlayer = s.turns;
  return o;
};

export const isClassic = (s: LabSetup) => Object.keys(toOverrides(s, null)).length === 0 && s.map === 'classic';

// ---------- share links: #lab=1.<base64url JSON of the changed fields> ----------

const VERSION = 1;
const KEYS = Object.keys(CLASSIC) as (keyof LabSetup)[];

export const encodeSetup = (s: LabSetup): string => {
  const diff: Record<string, unknown> = {};
  for (const k of KEYS) if (s[k] !== CLASSIC[k]) diff[k] = s[k];
  const json = JSON.stringify(diff);
  const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${VERSION}.${b64}`;
};

/** null when the code is broken or from an unknown version (never throws). */
export const decodeSetup = (code: string): LabSetup | null => {
  try {
    const m = /^(\d+)\.([A-Za-z0-9_-]{0,2000})$/.exec(code);
    if (!m || Number(m[1]) !== VERSION) return null;
    const b64 = m[2]!.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4))));
    const raw: unknown = JSON.parse(json);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return sanitize({ ...CLASSIC, ...(raw as object) });
  } catch {
    return null;
  }
};

/** A short code for the menu line ("Ring · 5a2f"). */
export const shortCode = (s: LabSetup): string => {
  let h = 2166136261;
  for (const ch of encodeSetup(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).slice(0, 4);
};

export const classicCellCount = () => allCoords(CLASSIC.a).length;
export { coordKey };
