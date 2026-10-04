// Ambient life (UI overhaul item 16): what moves on its own while nothing happens. Gold glints,
// nutrients pulsing out from my root along connected veins, lava bubbles and embers, moss sway.
// Pure and deterministic (a hash of the hex, never Math.random), with a hard cap, and nothing
// at all with Effects Low or Reduce motion.
import { allNeighbors, coordKey, homeCoord, parseKey } from '../../../src/engine/index.js';
import type { Player, RulesConfig, Terrain, Tile } from '../../../src/engine/index.js';
import { connectedKeys } from '../../../src/engine/index.js';

/** The most ambient elements on the board at once (each is one small animated shape). */
export const AMBIENT_CAP = 24;
export const AMBIENT_LIMITS = Object.freeze({ glints: 4, pulses: 8, bubbles: 6, embers: 6 });
/** A gold glint comes round every this many seconds (each gold hex at its own moment). */
export const GLINT_PERIOD = 9;

/** A repeatable number in [0, 1) from a string. */
export const hash01 = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

export type AmbientPlan = {
  sway: boolean;
  glints: { key: string; delay: number }[];
  /** veins carrying a nutrient pulse: from the hex nearer my root to the one further out; delay grows with the distance */
  pulses: { from: string; to: string; delay: number }[];
  bubbles: { key: string; dx: number; dy: number; delay: number }[];
  embers: { key: string; dx: number; delay: number }[];
};

const NONE: AmbientPlan = { sway: false, glints: [], pulses: [], bubbles: [], embers: [] };

export type AmbientInput = {
  board: Record<string, Tile | null>;
  terrain: Record<string, Terrain>;
  config: RulesConfig;
  me: Player;
  effects: 'low' | 'normal' | 'high';
  reduceMotion: boolean;
};

export const ambientPlan = (a: AmbientInput): AmbientPlan => {
  if (a.effects === 'low' || a.reduceMotion) return NONE;
  const L = AMBIENT_LIMITS;
  const keys = Object.keys(a.terrain).sort();
  const pick = <T>(xs: T[], n: number, k: (x: T) => string) => [...xs].sort((x, y) => hash01(k(x)) - hash01(k(y))).slice(0, n);

  const gold = keys.filter((k) => a.terrain[k] === 'rich');
  const glints = pick(gold, L.glints, (k) => `g${k}`).map((key) => ({ key, delay: +(hash01(`glint${key}`) * GLINT_PERIOD).toFixed(2) }));

  // nutrient pulses: breadth-first from my root over my connected tiles
  const pulses: AmbientPlan['pulses'] = [];
  let joined: Set<string> = new Set();
  try {
    joined = connectedKeys(a.board, a.config, a.me);
  } catch {
    joined = new Set();
  }
  const root = coordKey(homeCoord(a.me, a.config));
  if (joined.has(root)) {
    const depth = new Map([[root, 0]]);
    const queue = [root];
    while (queue.length && pulses.length < L.pulses) {
      const k = queue.shift()!;
      for (const n of allNeighbors(parseKey(k)).map(coordKey).sort()) {
        if (!joined.has(n) || depth.has(n)) continue;
        depth.set(n, depth.get(k)! + 1);
        queue.push(n);
        if (pulses.length < L.pulses) pulses.push({ from: k, to: n, delay: +(depth.get(k)! * 0.35).toFixed(2) });
      }
    }
  }

  const lava = keys.filter((k) => a.board[k] && a.board[k]!.owner !== a.me && !a.board[k]!.root);
  const bubbles = pick(lava, L.bubbles, (k) => `b${k}`).map((key) => ({ key, dx: +(hash01(`bx${key}`) * 0.8 - 0.4).toFixed(2), dy: +(hash01(`by${key}`) * 0.6 - 0.3).toFixed(2), delay: +(hash01(`bd${key}`) * 4).toFixed(2) }));
  const embers = pick(lava, L.embers, (k) => `e${k}`).map((key) => ({ key, dx: +(hash01(`ex${key}`) * 0.6 - 0.3).toFixed(2), delay: +(hash01(`ed${key}`) * 6).toFixed(2) }));

  const plan: AmbientPlan = { sway: true, glints, pulses, bubbles, embers };
  // the hard cap, in order of importance: pulses (my network), glints, embers, bubbles
  let room = AMBIENT_CAP;
  for (const k of ['pulses', 'glints', 'embers', 'bubbles'] as const) {
    (plan[k] as unknown[]) = (plan[k] as unknown[]).slice(0, Math.max(0, room));
    room -= plan[k].length;
  }
  return plan;
};

/** How many animated elements a plan adds. */
export const ambientCount = (p: AmbientPlan) => p.glints.length + p.pulses.length + p.bubbles.length + p.embers.length;
