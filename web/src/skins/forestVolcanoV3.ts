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
  worldUnits: 240,
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
    empty: { base: ['textures/empty_ground.webp'], proxy: { base: '#262a28' }, clarity: 0 },
    gold: { base: ['textures/gold_ground.webp'], proxy: { base: '#4a3d24' }, clarity: 0 },
    // blocked hexes: the empty ground with a boulder cluster on top (props.rock)
    rock: { base: ['textures/empty_ground.webp'], proxy: { base: '#57534c' }, clarity: 0 },
    forest: {
      base: ['textures/forest_ground_a.webp', 'textures/forest_ground_b.webp'],
      overlay: 'textures/forest_lush.webp',
      proxy: { base: '#2f5a32', overlay: '#4f8a3c' },
      clarity: 0.7,
      cutoff: 'states/forest_cutoff_tint.json',
    },
    volcano: {
      base: ['textures/volcano_ground_a.webp', 'textures/volcano_ground_b.webp'],
      overlay: 'textures/volcano_hot.webp',
      proxy: { base: '#2c2523', overlay: '#8f2212' },
      clarity: 0.8,
      cutoff: 'states/volcano_cutoff_tint.json',
    },
  },
  // every sprite in these folders is used (any file names); rules by name fragment
  props: {
    forest: {
      dir: 'props/forest/',
      size: 13,
      anim: 'sway',
      rules: [
        { match: 'flower', minStrength: 3, size: 11 },
        { match: 'mushroom', minStrength: 4, size: 10, anim: null },
        { match: 'berry', minStrength: 5 },
        { match: 'sapling', minStrength: 6, size: 15 },
      ],
    },
    volcano: {
      dir: 'props/volcano/',
      size: 13,
      rules: [
        { match: 'cinder', minStrength: 3, size: 11 },
        { match: 'vent', minStrength: 5, size: 12, anim: 'pulse' },
      ],
    },
    rock: { dir: 'props/rock/', size: 46 },
  },
  networkStyle: 'network/style.json',
  // built-in values (network/style.json in the tier overrides them)
  network: [
    { key: 'forest', outline: '#1f2b1e', body: '#587843', highlight: '#b8d173', shadow: '#172019', widths: { thin: 2.6, normal: 4.4, heavy: 6.8 }, strip: 'network/forest_vine_strip.webp', scroll: false },
    { key: 'volcano', outline: '#211b19', body: '#8f2212', highlight: '#f47a26', hot_core: '#ffd46a', glow: '#d2481a', widths: { thin: 2.6, normal: 4.2, heavy: 6.6 }, strip: 'network/lava_flow_strip.webp', scroll: true },
  ],
  homes: [
    [
      { src: 'homes/forest_tree_shadow.png', size: 44, dx: 1.5, dy: 2 },
      { src: 'homes/forest_tree_canopy.png', size: 42 },
      { src: 'homes/forest_tree_leaves_layer.png', size: 42, anim: 'sway' },
    ],
    [
      { src: 'homes/volcano_crater.png', size: 42 },
      { src: 'homes/volcano_crater_glow.png', size: 42, anim: 'pulse' },
      { src: 'homes/volcano_smoke_01.png', size: 20, dx: 4, dy: -8, anim: 'drift', opacity: 0.8 },
    ],
  ],
  scars: ['fx/forest_scar.png', 'fx/volcano_scar.png'],
  numbers: [
    { ink: '#0b1a14', plate: '#eef6dc', plateAlpha: 0.78 },
    { ink: '#fff4ee', plate: '#1a0f0c', plateAlpha: 0.78 },
  ],
};
