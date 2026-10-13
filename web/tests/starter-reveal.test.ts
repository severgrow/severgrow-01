// Online duels — the permanent "who starts" chip and the exactly-once lottery marker.
//
// These pin the new product rule: the lottery plays once per player per match, only at the
// live-join moment. A refresh, a return, an async catch-up or a still-waiting match must never
// play it; the chip is what tells the player who started. The old trigger
// (`status === 'active' && turnNumber === 1`) would replay after a refresh, so the non-live cases
// below fail against it.
import { describe, expect, it } from 'vitest';
import type { KeyValue } from '../../server/src/client.js';
import {
  STARTER_REVEAL_PREFIX,
  fillDuelHud,
  hasStarterRevealed,
  markStarterRevealed,
  shouldPlayStarterLottery,
  starterChip,
  starterRevealKey,
} from '../src/online/index.js';
import type { DuelHudModel } from '../src/online/index.js';

const memoryStore = (): KeyValue & { raw: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    raw: map,
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
};

describe('shouldPlayStarterLottery', () => {
  it('plays once at the live-join moment of an active, not-yet-revealed match', () => {
    expect(shouldPlayStarterLottery({ status: 'active', liveJoin: true, alreadyRevealed: false })).toBe(true);
  });

  it('never plays a second time (marker already written)', () => {
    expect(shouldPlayStarterLottery({ status: 'active', liveJoin: true, alreadyRevealed: true })).toBe(false);
  });

  it('never replays on a refresh or a later entry (not a live join)', () => {
    // The old trigger replayed this because the refreshed match was still on turn 1.
    expect(shouldPlayStarterLottery({ status: 'active', liveJoin: false, alreadyRevealed: false })).toBe(false);
    expect(shouldPlayStarterLottery({ status: 'active', liveJoin: false, alreadyRevealed: true })).toBe(false);
  });

  it('never plays for a waiting or finished match', () => {
    expect(shouldPlayStarterLottery({ status: 'waiting', liveJoin: true, alreadyRevealed: false })).toBe(false);
    expect(shouldPlayStarterLottery({ status: 'finished', liveJoin: true, alreadyRevealed: false })).toBe(false);
  });
});

describe('starterChip (perspective-correct)', () => {
  it('reads "You start" / "Opponent starts" correctly for seat 0', () => {
    expect(starterChip(0, 0)).toMatchObject({ meStarts: true, word: 'You start' });
    expect(starterChip(1, 0)).toMatchObject({ meStarts: false, word: 'Opponent starts' });
  });

  it('reads the same fact correctly for seat 1 (never hard-coded to seat 0)', () => {
    expect(starterChip(1, 1)).toMatchObject({ meStarts: true, word: 'You start' });
    expect(starterChip(0, 1)).toMatchObject({ meStarts: false, word: 'Opponent starts' });
  });

  it('carries plain screen-reader text, not colour alone', () => {
    expect(starterChip(0, 0).srText).toBe('You move first in this match.');
    expect(starterChip(0, 1).srText).toBe('Your opponent moves first in this match.');
  });
});

describe('per-match reveal marker', () => {
  it('round-trips and is isolated per match', () => {
    const store = memoryStore();
    expect(hasStarterRevealed(store, 'match-a')).toBe(false);
    markStarterRevealed(store, 'match-a');
    expect(hasStarterRevealed(store, 'match-a')).toBe(true);
    expect(hasStarterRevealed(store, 'match-b')).toBe(false);
    expect(store.raw.has(starterRevealKey('match-a'))).toBe(true);
    expect(starterRevealKey('match-a').startsWith(STARTER_REVEAL_PREFIX)).toBe(true);
  });

  it('is safe with no storage and never throws', () => {
    expect(hasStarterRevealed(null, 'match-a')).toBe(false);
    expect(() => markStarterRevealed(null, 'match-a')).not.toThrow();
    const throwing: KeyValue = {
      get: () => {
        throw new Error('blocked');
      },
      set: () => {
        throw new Error('blocked');
      },
      remove: () => undefined,
    };
    expect(hasStarterRevealed(throwing, 'match-a')).toBe(false);
    expect(() => markStarterRevealed(throwing, 'match-a')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------- chip DOM fill

type FakeEl = {
  textContent: string;
  hidden: boolean;
  attrs: Record<string, string>;
  setAttribute: (k: string, v: string) => void;
  querySelector: (sel: string) => FakeEl | null;
};

const fakeEl = (tag = ''): FakeEl => {
  const el: FakeEl = {
    textContent: '',
    hidden: tag === 'starter',
    attrs: {},
    setAttribute(k, v) {
      el.attrs[k] = v;
    },
    querySelector: () => null,
  };
  return el;
};

/** Minimal stand-in for the HUD: only the selectors fillDuelHud asks for. */
const fakeHud = (): { root: HTMLElement; starter: FakeEl; word: FakeEl; sr: FakeEl } => {
  const starter = fakeEl('starter');
  const word = fakeEl();
  const sr = fakeEl();
  starter.querySelector = (sel) =>
    sel === '[data-duel-starter-word]' ? word : sel === '[data-duel-starter-sr]' ? sr : null;
  const found: Record<string, FakeEl | null> = {
    '[data-duel-starter]': starter,
  };
  const root = {
    querySelector: (sel: string) => found[sel] ?? null,
  } as unknown as HTMLElement;
  return { root, starter, word, sr };
};

const baseModel = (over: Partial<DuelHudModel>): DuelHudModel => ({
  opponentName: 'Friend',
  presence: 'online',
  myTurn: false,
  remainingMs: 3_600_000,
  notice: null,
  finished: false,
  finishedTitle: null,
  starterMeStarts: null,
  ...over,
});

describe('fillDuelHud chip', () => {
  it('shows an icon + word (never colour alone) with screen-reader text when I start', () => {
    const { root, starter, word, sr } = fakeHud();
    fillDuelHud(root, baseModel({ starterMeStarts: true }));
    expect(starter.hidden).toBe(false);
    expect(starter.attrs['data-starter']).toBe('me');
    expect(word.textContent).toBe('You start');
    expect(sr.textContent).toBe('You move first in this match.');
  });

  it('states the opposite fact when the opponent starts', () => {
    const { root, starter, word, sr } = fakeHud();
    fillDuelHud(root, baseModel({ starterMeStarts: false }));
    expect(starter.hidden).toBe(false);
    expect(starter.attrs['data-starter']).toBe('opponent');
    expect(word.textContent).toBe('Opponent starts');
    expect(sr.textContent).toBe('Your opponent moves first in this match.');
  });

  it('hides the chip while there is no starter to show', () => {
    const { root, starter } = fakeHud();
    fillDuelHud(root, baseModel({ starterMeStarts: null }));
    expect(starter.hidden).toBe(true);
  });
});
