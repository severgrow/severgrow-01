// A board skin: everything the skinned board (SkinBoardView) needs to know about one art set,
// as data. The renderer never names a material ("grass", "lava"): a skin maps each player and
// each kind of empty hex to one of its own materials, and gives the files, sizes and colours.
// Paths are relative to `${root}/${tier}/`; a file the runtime manifest doesn't list is treated
// as missing, and the renderer falls back (greybox colours, the board's own homes, no props).
import type { Orient } from '../../logic/orient.js';

export type Tier = 'lo' | 'hi';

export type MaterialDef = {
  /** seamless opaque ground textures; with two, the second is blended in at world scale */
  base: string[];
  /** a seamless texture shown through the strength coverage masks (lush, hot) */
  overlay?: string;
  /** flat greybox colours used while the textures are missing (never final art) */
  proxy: { base: string; overlay?: string };
  /** how much of the overlay the clarity masks take away under the number and gold badge (0-1) */
  clarity: number;
  /** cut-off look: a tint JSON (desaturate, darken, warm/cool shift, dryness/ash, magma reduction) */
  cutoff?: string;
  /** a folder of props for cut-off tiles and what severed tiles leave (wilted plants, ash) */
  cutoffProps?: { dir: string; size: number };
};

export type PropDef = {
  src: string;
  /** drawn size, board units (a hex is 60 across its corners) */
  size: number;
  /** the lowest strength (1-9 scale) it can appear on */
  minStrength?: number;
  /** a CSS idle motion for this sprite */
  anim?: 'sway' | 'pulse';
};

/** A folder of prop sprites: every image the tier has under `dir` is used, with these rules
 *  (the first rule whose `match` is in the file name wins). */
export type PropSet = {
  dir: string;
  size: number;
  anim?: 'sway' | 'pulse';
  rules?: { match: string; minStrength?: number; size?: number; anim?: 'sway' | 'pulse' | null }[];
};

export type HomeLayer = {
  src: string;
  /** drawn size, board units, centred on the home tile */
  size: number;
  dx?: number;
  dy?: number;
  anim?: 'sway' | 'pulse' | 'drift';
  opacity?: number;
};

/** One player's network look (values from network/style.json override these). */
export type NetworkLook = {
  outline: string;
  body: string;
  highlight?: string;
  shadow?: string;
  hot_core?: string;
  glow?: string;
  widths: { thin: number; normal: number; heavy: number };
  /** a strip texture (tiles along the path) */
  strip?: string;
  /** scroll the strip / hot core along the path (flow) */
  scroll?: boolean;
};

export type NumberLook = { ink: string; plate: string; plateAlpha: number };

export type SkinDef = {
  id: string;
  label: string;
  /** folder under web/public (served next to the page) */
  root: string;
  /** board units one seamless texture spans (the same in every tier) */
  worldUnits: number;
  /** nominal pixels per hex (60 board units) and texture size per tier */
  tiers: Record<Tier, { hexPx: number; texPx: number }>;
  /** tier choice: upgrade at, downgrade below (effective px per hex, with hysteresis) */
  policy: { upgradeAt: number; downgradeBelow: number };
  masks: {
    coverage: (n: number, o: Orient) => string;
    clarityNumber: (o: Orient) => string;
    clarityGold: (o: Orient) => string;
  };
  /** the material each player owns (index = player) */
  owners: [string, string];
  /** the material of empty, gold and rock hexes */
  cells: { normal: string; rich: string; rock: string };
  materials: Record<string, MaterialDef>;
  /** props by material id */
  props: Record<string, PropSet>;
  /** the network style file and the built-in values for each player */
  networkStyle: string;
  network: [NetworkLook & { key: string }, NetworkLook & { key: string }];
  homes: [HomeLayer[], HomeLayer[]];
  /** ambient life: small motes drifting off strong tiles (only with motion on and big enough tiles) */
  ambient?: { max: number; motes: { material: string; src: string; minStrength: number; kind: 'rise' | 'fall'; size: number }[] };
  /** sever scar decals by player */
  scars?: [string, string];
  numbers: [NumberLook, NumberLook];
};
