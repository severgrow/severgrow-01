// A page-wide :has() whose condition can match ANY element makes the browser re-check the whole
// page every time any element is added anywhere (each board tile, each SVG piece), then restyle all
// ~600 elements. Measured 2026-11-10: ~100 full restyles while an online game opened, enough to push
// CI's presence journey over its limit. This guard keeps such rules out of the source.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : /\.(ts|css)$/.test(n) ? [p] : [];
});

/** The text inside the parentheses that open at `start` (balanced). */
const inside = (s: string, start: number): string => {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return s.slice(start + 1, i);
  }
  return '';
};

/** Split on `sep` outside any parentheses. */
const topLevel = (s: string, sep: string): string[] => {
  const out: string[] = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
};

/** Rules whose :has() subject is the whole page and whose condition's last part is "any element". */
const pageWideAnyHas = (src: string): string[] => {
  const found: string[] = [];
  for (const m of src.matchAll(/:has\(/g)) {
    const at = m.index!;
    const before = src.slice(Math.max(0, at - 80), at).split(/[{},;]/).pop()!.trim();
    const subject = before.split(/[\s>+~]+/).pop() ?? '';
    if (!/^(html|:root|body)\b/.test(subject)) continue;
    const arg = inside(src, at + 4);
    for (const alt of topLevel(arg, ',')) {
      const last = topLevel(alt.trim(), ' ').pop()?.replace(/^[>+~]/, '') ?? '';
      // "any element": a universal, or only pseudo-classes/attributes with no tag, id or class
      // (`:is(#a, #b)` names elements, so it is fine)
      // Every page-wide :has() re-checks the whole page on any insertion (measured: 200 inserts,
      // 200 page re-checks, even for `#game:not([hidden])`), so none is allowed: use ui/root-flags.ts.
      void last;
      found.push(`${before}:has(${arg})`);
    }
  }
  return found;
};

describe('no page-wide :has() (ui/root-flags.ts gives the same answers without restyling the page)', () => {
  it('the guard catches the old rail rule', () => {
    expect(pageWideAnyHas(':root:has(#hud-rail > *:not([hidden])) .corner-tools {}')).toHaveLength(1);
    expect(pageWideAnyHas('html:has(#sheet-profile:not([hidden])) #menu {}')).toHaveLength(1);
    expect(pageWideAnyHas('html.v075 body:has(#gameover:not([hidden])) #game {}')).toHaveLength(1);
    expect(pageWideAnyHas('#logo:has(> :is(svg, img)) {}')).toHaveLength(0);
  });
  it('no source file has one', () => {
    const bad = files('web/src').flatMap((f) => pageWideAnyHas(readFileSync(f, 'utf8')).map((r) => `${f}: ${r}`));
    expect(bad).toEqual([]);
  });
});
