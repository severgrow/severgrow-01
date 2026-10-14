// The real-time RECONNECT copy and the SHARED animated-ellipsis treatment.
//
// These are cheap pins on the owner's rules, so a later change cannot quietly break them:
//   * the strip's words state the fact and nothing more — the dots are the ANIMATION, never text;
//   * the header copy standard holds (<= 24 target, 32 hard cap);
//   * the one dots implementation is shared and stops animating under Reduce motion.
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
});
