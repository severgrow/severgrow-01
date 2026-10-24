// A LOST LIFT MUST NOT BREAK THE MAP (owner report 2026-10-23, iPhone: "it breaks after closing
// menu sometimes" — the map came back zoomed out and pushed down). On the iPhone a touch stays on
// the node it started on; when the board redraws that node away mid-touch (opening the pause menu
// does), the lift goes to a detached element and never reaches the map. The camera then kept a
// ghost finger: it froze, and the next one-finger drag became a pinch against the ghost.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pointerBook } from '../src/player/camera.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('the camera\'s finger book heals itself', () => {
  it('counts fingers down and lifted', () => {
    const b = pointerBook();
    b.down(1, true);
    b.down(2, false); // a second finger: a pinch
    expect(b.count).toBe(2);
    expect(b.up(2)).toBe(true);
    expect(b.up(1)).toBe(true);
    expect(b.count).toBe(0);
    expect(b.up(9)).toBe(false); // a lift that was never ours
  });

  it('a lost lift leaves a ghost, and the next first finger clears it (never a pinch with a ghost)', () => {
    const b = pointerBook();
    b.down(11, true); // the lift of 11 is lost
    expect(b.count).toBe(1);
    // the next touch is a new sequence: the browser marks its first finger primary
    expect(b.down(12, true)).toBe(true);
    expect(b.count).toBe(1);
  });

  it('a real second finger is never mistaken for a new sequence', () => {
    const b = pointerBook();
    b.down(1, true);
    expect(b.down(2, false)).toBe(false);
    expect(b.count).toBe(2);
  });

  it('release forgets everything', () => {
    const b = pointerBook();
    b.down(1, true);
    b.down(2, false);
    b.release();
    expect(b.count).toBe(0);
  });
});

describe('every surface that covers the board releases it', () => {
  const camera = read('../src/player/camera.ts');
  const main = read('../src/main.ts');
  it('the camera hears a lift anywhere, and lets go on blur and when the page hides', () => {
    expect(camera).toMatch(/window\.addEventListener\('pointerup', endElsewhere, true\)/);
    expect(camera).toMatch(/window\.addEventListener\('pointercancel', endElsewhere, true\)/);
    expect(camera).toMatch(/window\.addEventListener\('blur', release\)/);
    expect(camera).toMatch(/if \(document\.hidden\) release\(\)/);
    expect(camera).not.toMatch(/touching/);
  });
  it('a sheet opening and the result appearing release the map, the tile press and the stroke', () => {
    expect(main).toMatch(/if \(next\) \{[\s\S]{0,400}camera\?\.release\(\);\s*board\.releasePress\(\);\s*if \(draw\.ptr\) draw\.ptr = null;/);
    expect(main).toMatch(/function presentResult\(go: HTMLElement, wasHidden: boolean\): void \{\s*putAwaySheetsForResult\(\);[\s\S]{0,200}camera\?\.release\(\);\s*board\.releasePress\(\);/);
  });
});
