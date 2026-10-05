// SEVEROR V3 (forest vs volcano) as a board skin: data only (the renderer is ui/skin/).
// Files live in web/public/design-v3/{lo,hi}/ with the V3 pack's names; the runtime manifest
// (npm run skin:manifest) lists which ones exist. Until the painted art is approved and dropped
// in, the board runs on the pack's real masks with flat greybox colours from the V3 palette.
import type { SkinDef } from '../ui/skin/types.js';

export const FOREST_VOLCANO_V3: SkinDef = {
  id: 'forest-volcano-v3',
  label: 'V3',
  root: 'design-v3',
  // a 2048 (hi) or 1024 (lo) texture spans about four hexes
  worldUnits: 360,
  tiers: { lo: { hexPx: 256, texPx: 1024 }, hi: { hexPx: 512, texPx: 2048 } },
  policy: { upgradeAt: 280, downgradeBelow: 200 },
  masks: {
    coverage: (n, o) => `masks/${o}/coverage_${String(n).padStart(2, '0')}.png`,
    clarityNumber: (o) => `masks/${o}/clarity_number_zone.png`,
    clarityGold: (o) => `masks/${o}/clarity_gold_zone.png`,
  },
  owners: ['forest', 'volcano'],
  cells: { normal: 'empty', rich: 'gold', rock: 'rock' },
  materials: {
    // five painted slate textures, mixed in soft patches across the board
    empty: { base: [1, 2, 3, 4, 5].map((n) => `textures/empty_ground_0${n}.webp`), proxy: { base: '#262a28' }, clarity: 0 },
    // gold (x2) hexes: the empty ground with a pile of gold nuggets on top (props.gold)
    gold: { base: [1, 2, 3, 4, 5].map((n) => `textures/empty_ground_0${n}.webp`), proxy: { base: '#262a28' }, clarity: 0 },
    // blocked hexes: the empty ground with a boulder cluster on top (props.rock)
    rock: { base: [1, 2, 3, 4, 5].map((n) => `textures/empty_ground_0${n}.webp`), proxy: { base: '#57534c' }, clarity: 0 },
    forest: {
      base: ['textures/forest_ground_a.webp', 'textures/forest_ground_b.webp'],
      overlay: 'textures/forest_lush.webp',
      proxy: { base: '#2f5a32', overlay: '#4f8a3c' },
      // the forest painting is the busiest: shown bigger, so its leaves read as shapes, not noise
      worldUnits: 480,
      clarity: 0.7,
      cutoff: 'states/forest_cutoff_tint.json',
      cutoffProps: { dir: 'states/forest_wilt_props/', size: 12 },
    },
    volcano: {
      base: ['textures/volcano_ground_a.webp', 'textures/volcano_ground_b.webp'],
      overlay: 'textures/volcano_hot.webp',
      proxy: { base: '#2c2523', overlay: '#8f2212' },
      clarity: 0.8,
      cutoff: 'states/volcano_cutoff_tint.json',
      cutoffProps: { dir: 'states/volcano_ash_props/', size: 12 },
    },
  },
  // every sprite in these folders is used (any file names); rules by name fragment
  props: {
    forest: {
      dir: 'props/forest/',
      size: 19,
      anim: 'sway',
      rules: [
        { match: 'sprout', size: 13 },
        { match: 'log', minStrength: 4, size: 22, anim: null },
        { match: 'flower', minStrength: 3, size: 16 },
        { match: 'mushroom', minStrength: 4, size: 15, anim: null },
        { match: 'berry', minStrength: 5 },
        { match: 'sapling', minStrength: 6, size: 20 },
      ],
    },
    volcano: {
      dir: 'props/volcano/',
      size: 18,
      rules: [
        { match: 'obsidian_hot', minStrength: 5, size: 16 },
        { match: 'obsidian', size: 15 },
        { match: 'cinder', minStrength: 3, size: 15 },
        { match: 'vent', minStrength: 5, size: 18, anim: 'pulse' },
      ],
    },
    // painted to the hex: the image is the hex's corner-to-corner size (the ground reaches 1.035 S)
    rock: { dir: 'props/rock/', size: 62 },
    // big, so the pile fills the hex (a little dimmer than the raw art, under the owned tiles)
    gold: { dir: 'props/gold/', size: 64 },
    // lost tiles (scars): one burnt stump or log on the empty ground, when the folder has sprites
    dead: { dir: 'props/dead/', size: 54 },
  },
  networkStyle: 'network/style.json',
  // built-in values (network/style.json in the tier overrides them)
  network: [
    { key: 'forest', outline: '#1f2b1e', body: '#587843', highlight: '#b8d173', shadow: '#172019', widths: { thin: 2.6, normal: 4.4, heavy: 6.8 }, strip: 'network/forest_vine_strip.webp', scroll: false },
    { key: 'volcano', outline: '#211b19', body: '#8f2212', highlight: '#f47a26', hot_core: '#ffd46a', glow: '#d2481a', widths: { thin: 2.6, normal: 4.2, heavy: 6.6 }, strip: 'network/lava_flow_strip.webp', scroll: true },
  ],
  homes: [
    [
      { src: 'homes/forest_tree_shadow.webp', size: 56, dx: 2, dy: 2.6 },
      // two looks: the fruit tree (its loose outer leaves sway) or the blossom tree
      { src: 'homes/forest_tree_canopy.webp', size: 54, variant: 0 },
      { src: 'homes/forest_tree_leaves_layer.webp', size: 54, anim: 'sway', variant: 0 },
      { src: 'homes/forest_tree_canopy_blossom.webp', size: 54, variant: 1 },
    ],
    [
      { src: 'homes/volcano_crater.webp', size: 52 },
      // the molten glow, inside the crater's ring of rock
      { src: 'homes/volcano_crater_glow.webp', size: 32, anim: 'pulse', opacity: 0.75 },
      // three puffs drifting up one after another (one 6 s cycle, 2 s apart)
      { src: 'homes/volcano_smoke_01.webp', size: 20, dx: 4, dy: -8, anim: 'drift', opacity: 0.8 },
      { src: 'homes/volcano_smoke_02.webp', size: 17, dx: 1, dy: -9, anim: 'drift', opacity: 0.75, delay: 2 },
      { src: 'homes/volcano_smoke_03.webp', size: 15, dx: 6, dy: -7, anim: 'drift', opacity: 0.7, delay: 4 },
    ],
  ],
  scars: ['fx/forest_scar.webp', 'fx/volcano_scar.webp'],
  // a few embers rise off hot volcano tiles, a few leaves drift off lush forest (never many)
  ambient: {
    max: 2,
    motes: [
      { material: 'volcano', src: 'fx/ember_mote.webp', minStrength: 6, kind: 'rise', size: 5 },
      { material: 'forest', src: 'fx/leaf_mote.webp', minStrength: 7, kind: 'fall', size: 5.5 },
    ],
  },
  numbers: [
    { ink: '#0b1a14', plate: '#eef6dc', plateAlpha: 0.55 },
    { ink: '#fff4ee', plate: '#1a0f0c', plateAlpha: 0.6 },
  ],
};
