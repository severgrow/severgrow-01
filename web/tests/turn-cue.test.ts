// Turn hand-off (owner, 2026-10-24): when the turn comes back to me, a soft light runs round the
// board's edge and the display says YOUR TURN — once per hand-off, never in lessons or the
// tutorial, and with reduced motion the display word alone. The display also names a held move
// (GROW 1 / BLOOM 3 / BOMB) instead of CANCEL.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const main = read('../src/main.ts');
const css = read('../src/style.css');
const cockpit = read('../src/player/smart-cockpit.ts');

describe('the turn hand-off cue', () => {
  const fn = main.slice(main.indexOf('function cueTurnHandOff'), main.indexOf('function render() {'));
  it('fires only on the change from their turn to mine, after their turn has been shown', () => {
    expect(fn).toMatch(/if \(busy\(\)\) return;/);
    expect(fn).toMatch(/if \(was !== false \|\| !turnWasMine/);
    expect(main).toMatch(/function beginSession\([^)]*\) \{\n  turnWasMine = null;/);
    expect(main).toMatch(/syncFreePlayBulbNudge\(\);\n  cueTurnHandOff\(v\);/);
  });
  it('stays out of lessons and the tutorial, and reduced motion keeps only the display word', () => {
    expect(fn).toMatch(/lessonActive\(\) \|\| coach\.tutorial\) return;/);
    expect(fn.indexOf("message: 'YOUR TURN'")).toBeLessThan(fn.indexOf('reduce-motion'));
    expect(css).toMatch(/html\.reduce-motion #turn-cue \{ display: none; \}/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ html\.futasaku-product #turn-cue \{ display: none; \} \}/);
  });
  it('is light: opacity only, pointer-transparent', () => {
    const block = css.slice(css.indexOf('html.futasaku-product #turn-cue {'), css.indexOf('html.reduce-motion #turn-cue'));
    expect(block).toMatch(/pointer-events: none/);
    expect(block.match(/@keyframes turn-cue \{[\s\S]*?\n\}/)![0]).not.toMatch(/transform|filter|box-shadow/);
  });
});

describe('the display names the held move', () => {
  it('asks main for the word, and keeps CANCEL only as the fallback', () => {
    expect(cockpit).toMatch(/first\?\.icon === 'cancel' \? options\.heldMove\?\.\(\) \?\? 'CANCEL'/);
    expect(main).toMatch(/heldMove: \(\) => session \? heldMoveWord\(session\.sel,/);
  });
});
