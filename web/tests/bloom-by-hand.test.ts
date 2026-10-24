// BLOOM BY HAND AND BLOOM'S OWN COLOUR (owner, 2026-10-23). A card that can bloom is first only
// picked; the same card again is a one-tile Grow; another card that blooms with it is held with it,
// and the moment the picked cards are a Bloom it is painted. On the board a Bloom is aqua, never the
// cream of a one-tile Grow (nor the green of Strengthen); a Blast reads as its target first.
// Verified end to end in a real browser game; these lock the source that produces it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const main = read('../src/main.ts');
const cockpit = read('../src/player/smart-cockpit.ts');
const info = read('../src/player/information.ts');

describe('bloom by hand', () => {
  it('the first tap only picks; the same card again is a plain Grow', () => {
    expect(main).toMatch(/if \(bloomPick\.length === 1 && bloomPick\[0\] === id\) \{[\s\S]{0,200}bloomPick = \[\];\s*\}/);
  });
  it('picked cards that ARE a Bloom start painting it; copies of a face are interchangeable', () => {
    expect(main).toMatch(/const exact = fits\.length && next\.length >= 3 \? fits\.find\(\(k\) => kindCards\(k\.kind\)\.length === next\.length\) : undefined;/);
    expect(main).toMatch(/beginBloomKind\(exact\.kind, sameFaceIn\(exact\.kind, next\[0\]!\)\)/);
    expect(main).toMatch(/const faceOf = \(id: number\): string =>/);
  });
  it('while painting: a card that makes it longer extends it, a card of it puts it down', () => {
    expect(main).toMatch(/const longer = bloomKindsWith\(\[\.\.\.group, id\]\)\.find\(\(k\) => kindCards\(k\.kind\)\.length === group\.length \+ 1\);/);
    expect(main).toMatch(/if \(group\.includes\(id\)\) \{\s*clearPaint\(\);/);
  });
  it('the display counts what is left to pick', () => {
    expect(main).toMatch(/smartCockpit\?\.hint\(`PICK \$\{left\} MORE`\)/);
  });
  it('nothing stays held after a move, a new game, the Bloom button, a cancel, or outside my Grow step', () => {
    expect(main).toMatch(/function humanPlay\(a: Action\) \{\s*bloomPick = \[\];/);
    expect(main).toMatch(/session = new Session\(state, HUMAN, log, base\);\s*bloomPick = \[\];/);
    expect(main).toMatch(/bloomMenu = false;\s*bloomPick = \[\];/);
    expect(main).toMatch(/function cancelSel\(\) \{\s*bloomPick = \[\];/);
    expect(main).toMatch(/if \(bloomPick\.length && !\(IS_FUTA04 && myTurn\(\) && !busy\(\) && v\.phase === 'ACT' && bloomKindsWith\(bloomPick\)\.length\)\) bloomPick = \[\];/);
  });
  it('after a grow, tapping a picked card twice still goes to Throw', () => {
    expect(main).toMatch(/const sameAgain = session\.sel\.card === id \|\| \(bloomPick\.length === 1 && bloomPick\[0\] === id\);/);
  });
});

describe('Bloom has its own colour', () => {
  it('aqua on the board: targets, their breath, the shape painted, the preview', () => {
    expect(cockpit).toMatch(/\.target\.kind-bloom \{ fill:#9adbd2;/);
    expect(cockpit).toMatch(/\.target-invite\.kind-bloom \{ fill:#9adbd2; \}/);
    expect(cockpit).toMatch(/\.receptive-well\.kind-bloom \{ fill:rgba\(120,204,194,\.12\); \}/);
    expect(cockpit).toMatch(/:is\(\.selected,\.ghost-tile\)\.kind-bloom \{\s*fill:#9adbd2;/);
    expect(cockpit).toMatch(/\.l-draw \.ghost-tile \{\s*fill:#9adbd2;/);
    // never the green of Strengthen, never the cream of a one-tile Grow
    expect(cockpit).not.toMatch(/:is\(\.kind-strengthen,\.kind-bloom\)/);
  });
  it('the cards picked for it glow the same aqua in the hand', () => {
    expect(info).toMatch(/\.card\.futa04-bloom-pick \{\s*border-color: #8fd3c9;/);
    expect(main).toMatch(/b\.classList\.toggle\('futa04-bloom-pick', IS_FUTA04 && inBloom\);/);
  });
  it('every card of the Bloom is lifted, all by the same height (owner, 2026-10-24)', () => {
    expect(main).toMatch(/const lifted = sel\.card === c\.id \|\| picked\.has\(c\.id\) \|\| bloomPick\.includes\(c\.id\) \|\| inBloom;/);
    expect(main).toMatch(/const liftWeight = inBloom \? BLOOM_LIFT_WEIGHT : weight;/);
    expect(main).toMatch(/b\.style\.setProperty\('--lift', `\$\{liftOf\(liftWeight\)\.toFixed\(1\)\}px`\);/);
    expect(main).toMatch(/const lift = THUMB\.lift \* \(liftOf\(liftWeight\) \/ 22\);/);
  });
});

describe('a Blast reads as its target first', () => {
  it('the neighbours it destroys are clearly fainter than the tile it lands on', () => {
    const n = /\.blast-affected \{ fill-opacity:([\d.]+); stroke-opacity:([\d.]+); \}/.exec(cockpit)!;
    const t = /\.selected\.blast-selected \{[^}]*fill-opacity:([\d.]+);[^}]*stroke-opacity:([\d.]+);/.exec(cockpit)!;
    expect(Number(n[1])).toBeLessThan(Number(t[1]) / 2);
    expect(Number(n[2])).toBeLessThan(Number(t[2]) * 0.6);
  });
});
