// The real-time RECONNECT copy and the SHARED animated-ellipsis treatment.
//
// These are cheap pins on the owner's rules, so a later change cannot quietly break them:
//   * the strip's words state the fact and nothing more — the dots are the ANIMATION, never text;
//   * the header copy standard holds (<= 24 target, 32 hard cap);
//   * the one dots implementation is shared and stops animating under Reduce motion.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIVE } from '../../src/strings.js';
import { WAIT_DOTS_CLASS, WAIT_DOTS_CSS } from '../src/online/live/wait-dots.js';

describe('the reconnecting copy', () => {
  it('states the fact, inside the header copy standard, with the dots left to the animation', () => {
    expect(LIVE.opponentReconnecting).toBe('Opponent reconnecting');
    expect(LIVE.opponentReconnecting.length).toBeLessThanOrEqual(24); // the target
    expect(LIVE.opponentReconnecting.length).toBeLessThanOrEqual(32); // the hard cap
    // The ellipsis is an animation, not characters: no dots, no ellipsis character, no emoji.
    expect(LIVE.opponentReconnecting).not.toMatch(/\./);
    expect(LIVE.opponentReconnecting).not.toMatch(/[\u2026\u{1F300}-\u{1FAFF}]/u);
  });

  it('the forfeit warning is short too, with the longer explanation as its own line', () => {
    expect(LIVE.leaveWarning.length).toBeLessThanOrEqual(24);
    expect(LIVE.leaveConfirm).toBe('Leave and lose this real-time duel?');
    // The help line explains BOTH ways a real-time duel is lost, and the reconnect grace.
    expect(LIVE.leaveWarningHelp).toContain('loses the whole match');
    expect(LIVE.leaveWarningHelp).toContain('10 seconds');
    expect(LIVE.leaveWarningHelp).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});

describe('the shared wait-dots treatment', () => {
  it('is ONE reusable class, with three dots revealed in sequence by CSS only', () => {
    expect(WAIT_DOTS_CLASS).toBe('futasaku-wait-dots');
    expect(WAIT_DOTS_CSS).toContain(`.${WAIT_DOTS_CLASS}`);
    // Three dots, staggered.
    expect(WAIT_DOTS_CSS).toContain(':nth-child(2)');
    expect(WAIT_DOTS_CSS).toContain(':nth-child(3)');
    expect(WAIT_DOTS_CSS).toContain('@keyframes futasaku-wait-dot');
    // CSS only: no JavaScript animation hook.
    expect(WAIT_DOTS_CSS).not.toContain('javascript');
  });

  it('shows a steady ellipsis when motion is reduced (both switches)', () => {
    expect(WAIT_DOTS_CSS).toMatch(/\.reduce-motion[^}]*\.futasaku-wait-dots i[^}]*animation:none/s);
    expect(WAIT_DOTS_CSS).toMatch(/prefers-reduced-motion[^}]*\.futasaku-wait-dots i[^}]*animation:none/s);
    // ...and the steady form is still visible (opacity 1), so it still says "waiting".
    expect(WAIT_DOTS_CSS).toMatch(/animation:none !important; opacity:1/);
  });

  it('can be hidden by any caller (the author display rule beats the browser [hidden] rule)', () => {
    // Without its own hidden rule, `display:inline-flex` would keep the dots on screen after a
    // caller sets `dots.hidden = true` — the pill's waiting state relies on this.
    expect(WAIT_DOTS_CSS).toMatch(/\.futasaku-wait-dots\[hidden\]\s*\{\s*display:none/);
  });
});

// The owner's rule: a waiting/connecting state always carries the animated ellipsis, and there is
// exactly ONE treatment. Static checks on the source, in the spirit of the other static suites.
const uiSource = readFileSync(new URL('../src/online/live/ui.ts', import.meta.url), 'utf8');

describe('every waiting state reuses the one dots treatment', () => {
  it('the challenge pill\'s waiting state uses the SHARED dots, not its own animation', () => {
    expect(uiSource).toContain("import { WAIT_DOTS_CLASS, WAIT_DOTS_CSS, waitDots } from './wait-dots.js'");
    // The pill builds the shared node once and toggles it (a rebuilt node would restart the CSS
    // animation every 250 ms, before it could ever cycle).
    expect(uiSource).toMatch(/const dots = waitDots\(\);/);
    expect(uiSource).toMatch(/dots\.hidden = m\.kind !== 'waiting'/);
    // No second dots animation: the one keyframe lives in the shared module only.
    expect(uiSource).not.toContain('@keyframes futasaku-wait-dot');
    expect(uiSource.split('waitDots()').length - 1).toBeGreaterThanOrEqual(2); // reconnect notice + pill
  });

  it('the reconnect notice and the pill both render the shared dots via waitDots()', () => {
    expect(uiSource).toContain('waitDots()');
    const uses = uiSource.match(/waitDots\(\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the dead header circles are gone for good', () => {
  it('the chip lamp and the clock dot nodes are deleted, not merely hidden', () => {
    // The header session's e2e accepts either (its `circleGone` treats an absent node as gone), so
    // deleting is the honest form: a node that is always hidden is dead weight.
    expect(uiSource).not.toContain("el('span', 'lamp')");
    expect(uiSource).not.toContain('live-clock-dot');
    expect(uiSource).not.toContain('.live-chip .lamp');
  });
});
