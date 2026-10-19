// Phase 0: the one press primitive's policy is small and testable without a browser.
import { describe, expect, it } from 'vitest';
import {
  PRESS_DRAG_PX, PRESS_SELECTOR, dragExceeded, isPressKey, pressDepth, pressSurface, shouldSkipPress,
} from '../src/logic/press.js';

const fake = (opts: {
  disabled?: boolean;
  hidden?: boolean;
  ariaDisabled?: string | null;
  hiddenAncestor?: boolean;
  disabledAncestor?: boolean;
  surface?: boolean;
} = {}) => ({
  disabled: !!opts.disabled,
  hidden: !!opts.hidden,
  style: { setProperty() {}, removeProperty() {} },
  getAttribute: (name: string) => (name === 'aria-disabled' ? opts.ariaDisabled ?? null : null),
  setAttribute() {},
  removeAttribute() {},
  contains() { return false; },
  closest(selector: string) {
    if (selector.includes('[hidden]') && opts.hiddenAncestor) return this;
    if (selector.includes(':disabled') && opts.disabledAncestor) return this;
    if (selector.includes('.futa04-hardware-control') && opts.surface) return this;
    return null;
  },
});

describe('one press selector list', () => {
  it('covers buttons, hardware, cockpit, cards, piles, board, lesson CTA and settings', () => {
    for (const part of [
      'button', '[role="button"]', '.hand-slot', '.futa04-hardware-control', '#smart-context',
      '#smart-bloom-button', '#hand .card', '#deck', '#discard', '#board .tile', '#board .hex-cell',
      '#lesson-plate', '.lesson-cta', '#sheet-settings', '#settings-lab',
    ]) expect(PRESS_SELECTOR).toContain(part);
  });

  it('skips disabled and hidden surfaces', () => {
    expect(shouldSkipPress(null)).toBe(true);
    expect(shouldSkipPress(fake({ disabled: true }))).toBe(true);
    expect(shouldSkipPress(fake({ hidden: true }))).toBe(true);
    expect(shouldSkipPress(fake({ ariaDisabled: 'true' }))).toBe(true);
    expect(shouldSkipPress(fake({ hiddenAncestor: true }))).toBe(true);
    expect(shouldSkipPress(fake({ disabledAncestor: true }))).toBe(true);
    expect(shouldSkipPress(fake())).toBe(false);
  });

  it('uses the hardware depth for cockpit keys and the ordinary depth elsewhere', () => {
    expect(pressSurface(fake({ surface: true }))).toBe('key');
    expect(pressSurface(fake())).toBe('plain');
    expect(pressDepth('key')).toBe('0.98');
    expect(pressDepth('plain')).toBe('0.97');
  });

  it('cancels the visual press at exactly the 10 px drag threshold', () => {
    expect(PRESS_DRAG_PX).toBe(10);
    expect(dragExceeded(0, 0, 10, 0)).toBe(false);
    expect(dragExceeded(0, 0, 10.01, 0)).toBe(true);
    expect(dragExceeded(0, 0, 6, 8)).toBe(false); // exactly 10 px by distance
    expect(dragExceeded(0, 0, 7, 8)).toBe(true);
  });

  it('supports Space and Enter, and ignores auto-repeat in the controller path', () => {
    expect(isPressKey(' ')).toBe(true);
    expect(isPressKey('Spacebar')).toBe(true);
    expect(isPressKey('Enter')).toBe(true);
    expect(isPressKey('Escape')).toBe(false);
  });
});
