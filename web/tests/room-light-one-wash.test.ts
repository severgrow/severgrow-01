// THE OWNER'S RECTANGLE (owner, 2026-11-20 evening): "every time when opp grows, the background
// lits up a bit or changing opacity. but on desktop, since cockpit is on the right rather than below
// board like mobile, you can see the border of this highlight/change. its like a pulse. doesnt have
// color. i like it, but looks ugly when you can see its border".
//
// The cause was commit 92107d54: while `futa04-room-lit` was held on <html> it set four local light
// patches to `opacity:0 !important`. Those patches are shaped boxes (.play, .board-wrap, .dock), so
// the change snapped off and back at their edges — a rectangle whose border is the board's own right
// edge on the side layout. Measured at 1440x900 with the wash held still (`/tmp` probe): the changed
// pixels are confined to `#board-wrap` (right edge x=722) and `#dock` (x=871..1291), and each box's
// top candidate is an element whose `::before` opacity went to 0.
//
// The fix is to stop hiding them: the outcome wash is already one full-viewport layer, so removing
// the shaped second light removes the border at its source. The pulse itself must survive — these
// tests pin that, so a future cleanup cannot quietly delete the light either.
//
// The pixel proof (the light is present, and no hard neighbour step along rows of pure background at
// 1440x900 and 393x852 during a real opponent grow) is `web/e2e/room-light.ts`.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const playerCss = read('../src/player/player-css.ts');
/** The declaration text only — a comment may name a class or a selector without painting anything. */
const cssOnly = playerCss.replace(/\/\*[\s\S]*?\*\//g, '');
const atmosphere = read('../src/player/atmosphere.ts');

describe('the room is one wash, never a shaped highlight with a border (owner, 2026-11-20)', () => {
  it('no rule hides a local patch for a beat', () => {
    // The old build failed exactly here: `html.futa04-information.futa04-room-lit ... { opacity:0 !important }`.
    // (The comment explaining WHY it must not come back is allowed to name the class.)
    expect(cssOnly).not.toMatch(/\.futa04-room-lit/);
    expect(cssOnly).not.toMatch(/\.play::before[^{]*\{[^}]*opacity:0/);
    expect(cssOnly).not.toMatch(/\.board-wrap::before[^{]*\{[^}]*opacity:0/);
    expect(cssOnly).not.toMatch(/\.dock::before[^{]*\{[^}]*opacity:0/);
  });

  it('the room-light window module is gone, not merely unwired', () => {
    expect(existsSync(fileURLToPath(new URL('../src/ui/room-light.ts', import.meta.url)))).toBe(false);
    expect(atmosphere).not.toContain('holdRoomLight');
  });

  it('the four local patches still exist at rest — the fix must not delete the room', () => {
    for (const selector of ['#game::before', '#game .play::before', '#game .board-wrap::before', '#game .dock::before']) {
      expect(playerCss).toContain(selector);
    }
  });

  it('the pulse survives: a real outcome beat still paints one full-viewport wash', () => {
    expect(atmosphere).toContain("outcome.id = 'futa04-outcome-light'");
    expect(atmosphere).toContain('outcome.dataset.tone = tone');
    expect(atmosphere).toContain('outcome.animate(');
    // One flat wash, never a pool behind the board half (feel-085).
    const rule = atmosphere.slice(
      atmosphere.indexOf("#futa04-outcome-light[data-tone='good']"),
      atmosphere.indexOf('#futa04-map-rim'),
    );
    expect(rule).toMatch(/linear-gradient/);
    expect(rule).not.toMatch(/radial-gradient/);
  });
});
