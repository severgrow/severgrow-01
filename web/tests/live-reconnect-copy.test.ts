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

// The lane's own stylesheet. A rule is only dead when the NODE it styles is gone, so the two rules
// the deleted circles left behind were removed while the two live ones stayed.
const cssSource = readFileSync(new URL('../src/online/online-css.ts', import.meta.url), 'utf8');

describe('the lane hides only nodes that still exist', () => {
  it('no rule references the deleted clock dot', () => {
    // The `live-clock-dot` node was deleted with the chip's lamp, so its rule was styling nothing.
    expect(cssSource).not.toContain('live-clock-dot');
  });

  it('the chip rule stays: the chip NODE is still created for the go-live light', () => {
    // `createHud` still builds the chip and prepends it into the lane, so this rule is the only
    // thing keeping it out of the header — deleting it would paint a chip in the strip.
    expect(uiSource).toContain("el('span', 'live-chip')");
    expect(cssSource).toContain('#duel-hud .live-chip');
  });

  it('the pill dot rule stays: the pill still creates its own dot node', () => {
    // `createPill` still builds the dot and appends it to the pill, so its rule is live too.
    expect(uiSource).toContain("el('span', 'dot')");
    expect(cssSource).toContain('#duel-hud .live-pill .dot');
  });
});

describe('a waiting finger reaches the Cancel control', () => {
  it('the Cancel control stacks above the pill tap extender', () => {
    // The pill's transparent ::after (its 44px tap extender) is a positioned descendant painted
    // above the pill's inline content, so without a stacking step it swallows every tap and the
    // delegated click handler never sees the cancel target — the player could not back out.
    expect(uiSource).toMatch(/\.live-pill \.cancel \{[^}]*position:\s*relative[^}]*z-index:\s*1/s);
  });

  it('the Cancel control is a REAL full-height target, not just its glyphs', () => {
    // The word's own box is ~55x13 px — far under the 44px minimum every other control meets — and
    // Cancel is the escape hatch out of a state the player may be stuck in. The transparent ::after
    // overlay gives it a full-height hit box without moving the word. Measured in the header-lane
    // e2e: 55x44 px at both 360 and 390 px (the lane's own 44 px is the ceiling).
    expect(uiSource).toMatch(/\.live-pill \.cancel::after \{[^}]*content:''[^}]*position:absolute[^}]*inset:-16px 0/s);
    // A purely additive overlay: it adds no background, border or shadow of its own.
    expect(uiSource).toMatch(/\.live-pill \.cancel::after \{[^}]*\}/s);
    const overlay = uiSource.match(/\.live-pill \.cancel::after \{([^}]*)\}/s)?.[1] ?? '';
    expect(overlay).not.toMatch(/background|border(?!-radius)|box-shadow|outline/);
  });
});
