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
