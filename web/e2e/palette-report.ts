// Prints the contrast and colour-blind table for every palette (Markdown).
//   npx tsx web/e2e/palette-report.ts
import { THEMES, THEME_IDS, contrast, resolveColors } from '../src/logic/themes.js';
import { CVD_KINDS, distinguishReport } from '../src/logic/colorcheck.js';

const pass = (v: number, min: number) => `${v.toFixed(1)} ${v >= min ? 'PASS' : 'FAIL'}`;
console.log('| Palette | Text on page (AA 4.5) | Hints on page | Button text | Suit numbers on cards (lowest) | Closest pair, normal vision | Deuteranopia | Protanopia | Tritanopia |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const id of THEME_IDS) {
  const c = resolveColors(THEMES[id]);
  const suits = Math.min(...(['dew', 'ash', 'moss', 'ember'] as const).map((s) => contrast(c[s], c.card)));
  const r = distinguishReport(c);
  const cvd = (k: 'normal' | (typeof CVD_KINDS)[number]) => `${r[k].min.toFixed(0)} (${r[k].pair}) ${r[k].min >= 12 ? 'PASS' : 'FAIL'}`;
  console.log(`| ${THEMES[id].name} | ${pass(contrast(c.text, c.bg), 4.5)} | ${pass(contrast(c.muted, c.bg), 4.5)} | ${pass(contrast(c.accentInk, c.accent), 4.5)} | ${pass(suits, 4.5)} | ${cvd('normal')} | ${cvd('deuteranopia')} | ${cvd('protanopia')} | ${cvd('tritanopia')} |`);
}

// Materials: numbers on every material, and the two players under colour-blind simulation.
import { materialsOf } from '../src/logic/materials.js';
import { deltaE, simulate } from '../src/logic/colorcheck.js';
console.log('\n| Palette | Number on moss (dark ink) | Number on lava (light ink) | "2" on gold | Grass vs lava edge: normal / deut / prot / trit | Grass vs molten crack: normal / deut / prot / trit |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const id of THEME_IDS) {
  const c = resolveColors(THEMES[id]);
  const m = materialsOf(id).colors;
  const kinds = ['normal', ...CVD_KINDS] as const;
  const d = (a: string, b: string) => kinds.map((k) => (k === 'normal' ? deltaE(a, b) : deltaE(simulate(a, k), simulate(b, k))).toFixed(0)).join(' / ');
  const minMoss = Math.min(contrast(c.youInk, m.moss), contrast(c.youInk, m.mossTop));
  const minLava = Math.min(contrast(m.fireInk, m.fireCrust), contrast(m.fireInk, m.fireDeep));
  console.log(`| ${THEMES[id].name} | ${pass(minMoss, 4.5)} | ${pass(minLava, 4.5)} | ${pass(contrast(c.goldInk, c.gold), 4.5)} | ${d(m.moss, m.fireDeep)} | ${d(m.moss, m.fire)} |`);
}
console.log('Markers: you = ring, bot = diamond (shape). Materials: grass lawn vs dark cracked crust (texture and lightness).');
