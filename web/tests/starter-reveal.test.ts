// Online duels — the exactly-once "who starts" lottery reveal.
//
// These pin the product rule: the lottery plays once per player per match, only at the live-join
// moment. A refresh, a return, an async catch-up or a still-waiting match must never play it. The
// old trigger (`status === 'active' && turnNumber === 1`) would replay after a refresh, so the
// non-live cases below fail against it.
//
// The persistent "who starts" HUD chip was removed after the two-phone playtest (the one-time
// reveal is enough), so the old chip tests are replaced by a check that the trimmed strip draws
// ONE short message (the turn word) plus the presence — never the opponent's name or a notice box.
import { describe, expect, it } from 'vitest';
import type { KeyValue } from '../../server/src/client.js';
import {
  STARTER_REVEAL_INDEX_KEY,
  STARTER_REVEAL_KEEP,
  STARTER_REVEAL_PREFIX,
  fillDuelHud,
  hasStarterRevealed,
  markStarterRevealed,
  shouldPlayStarterLottery,
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

  it('does not accumulate one storage key per duel forever (bounded marker list)', () => {
    const store = memoryStore();
    // A device that plays many duels: without the cap, every match leaves its own key behind.
    for (let i = 0; i < STARTER_REVEAL_KEEP * 3; i++) markStarterRevealed(store, `match-${i}`);
    const markerKeys = [...store.raw.keys()].filter((k) => k.startsWith(STARTER_REVEAL_PREFIX) && k !== STARTER_REVEAL_INDEX_KEY);
    expect(markerKeys.length).toBe(STARTER_REVEAL_KEEP);
    // The newest matches are still marked; the oldest have been cleaned up.
    expect(hasStarterRevealed(store, `match-${STARTER_REVEAL_KEEP * 3 - 1}`)).toBe(true);
    expect(hasStarterRevealed(store, 'match-0')).toBe(false);
    // Re-marking the same match does not duplicate it in the index.
    markStarterRevealed(store, 'match-a');
    markStarterRevealed(store, 'match-a');
    const index = JSON.parse(store.raw.get(STARTER_REVEAL_INDEX_KEY) ?? '[]') as string[];
    expect(index.filter((id) => id === 'match-a').length).toBe(1);
    expect(index[0]).toBe('match-a');
  });
});

// ---------------------------------------------------------------------------- trimmed strip fill

type FakeEl = {
  textContent: string;
  hidden: boolean;
  attrs: Record<string, string>;
  setAttribute: (k: string, v: string) => void;
};

const fakeEl = (hidden = false): FakeEl => {
  const el: FakeEl = {
    textContent: '',
    hidden,
    attrs: {},
    setAttribute(k, v) {
      el.attrs[k] = v;
    },
  };
  return el;
};

/** Minimal stand-in for the trimmed strip: only the selectors fillDuelHud asks for. */
const fakeHud = (): { root: HTMLElement; els: Record<string, FakeEl> } => {
  const els: Record<string, FakeEl> = {
    '[data-duel-opponent]': fakeEl(true),
    '[data-duel-presence]': fakeEl(),
    '[data-duel-notice]': fakeEl(true),
    '[data-duel-turn]': fakeEl(),
  };
  const root = {
    querySelector: (sel: string) => els[sel] ?? null,
  } as unknown as HTMLElement;
  return { root, els };
};

const baseModel = (over: Partial<DuelHudModel>): DuelHudModel => ({
  opponentName: 'Friend',
  presence: 'online',
  turn: 'theirs',
  notice: null,
  finished: false,
  finishedTitle: null,
  ...over,
});

describe('fillDuelHud (trimmed duel strip)', () => {
  it('draws ONE short message — the turn word — plus the presence, and nothing visible else', () => {
    const { root, els } = fakeHud();
    fillDuelHud(root, baseModel({}));
    expect(els['[data-duel-turn]']!.textContent).toBe("Opponent's turn");
    expect(els['[data-duel-presence]']!.textContent).toBe('Online');
    expect(els['[data-duel-presence]']!.attrs['data-presence']).toBe('online');
    // The opponent name and the notice stay as HIDDEN state hooks (never painted), so the page's
    // own tests can still read them; the visible lane carries the one message above.
    expect(els['[data-duel-opponent]']!.textContent).toBe('Friend');
    expect(els['[data-duel-opponent]']!.hidden).toBe(true);
    // The strip carries no Resign, no deadline and no who-starts chip.
    expect(els['[data-duel-deadline]']).toBeUndefined();
    expect(els['[data-duel-starter]']).toBeUndefined();
  });

  it('says "Your turn", and a notice temporarily takes the lane instead', () => {
    const { root, els } = fakeHud();
    fillDuelHud(root, baseModel({ turn: 'mine' }));
    expect(els['[data-duel-turn]']!.textContent).toBe('Your turn');
    // A notice is a danger message: it outranks the turn word, then hands the lane back.
    fillDuelHud(root, baseModel({ turn: 'mine', notice: 'Reconnecting' }));
    expect(els['[data-duel-turn]']!.textContent).toBe('Reconnecting');
    expect(els['[data-duel-notice]']!.textContent).toBe('Reconnecting');
    fillDuelHud(root, baseModel({ turn: 'mine', notice: null }));
    expect(els['[data-duel-turn]']!.textContent).toBe('Your turn');
    expect(els['[data-duel-notice]']!.textContent).toBe('');
  });

  it('reads "Replaying their turn" while the enemy turn animates — never "Opponent\'s turn"', () => {
    const { root, els } = fakeHud();
    fillDuelHud(root, baseModel({ turn: 'replaying' }));
    expect(els['[data-duel-turn]']!.textContent).toBe('Replaying their turn');
    expect(els['[data-duel-turn]']!.textContent).not.toBe("Opponent's turn");
  });
});
