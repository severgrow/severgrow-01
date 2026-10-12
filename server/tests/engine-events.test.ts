// The engine's single hidden-information rule for events. The online server reuses it, so it must
// stay exactly equivalent to what the local game already sends (`eventsFor`).
import { describe, expect, it } from 'vitest';
import { eventsFor, hidePrivateEvents } from '../../src/engine/index.js';
import type { Event, State } from '../../src/engine/index.js';
import { randomPlay } from '../../tests/helpers.js';

describe('hidePrivateEvents', () => {
  it('hides only the opponent deck draws, and keeps the card otherwise', () => {
    const events: Event[] = [
      { t: 'Draw', player: 0, from: 'deck', card: 5 },
      { t: 'Draw', player: 1, from: 'deck', card: 6 },
      { t: 'Draw', player: 1, from: 'discard', card: 7 },
      { t: 'Sprout', player: 0, card: 5, coord: { q: 0, r: 1 } },
    ];
    expect(hidePrivateEvents(events, 0)).toEqual([
      { t: 'Draw', player: 0, from: 'deck', card: 5 },
      { t: 'Draw', player: 1, from: 'deck' },
      { t: 'Draw', player: 1, from: 'discard', card: 7 },
      { t: 'Sprout', player: 0, card: 5, coord: { q: 0, r: 1 } },
    ]);
    expect(hidePrivateEvents(events, 1)[1]).toEqual({ t: 'Draw', player: 1, from: 'deck', card: 6 });
  });

  it('is identical to eventsFor across real games (both seats)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      randomPlay(seed, 120, (state: State) => {
        for (const player of [0, 1] as const) {
          expect(hidePrivateEvents(state.history ?? [], player)).toEqual(eventsFor(state, player));
        }
      });
    }
  }, 120_000);

  it('never leaks the opponent deck card into a filtered list', () => {
    randomPlay(3, 200, (state: State) => {
      for (const player of [0, 1] as const) {
        for (const event of hidePrivateEvents(state.history ?? [], player)) {
          if (event.t === 'Draw' && event.from === 'deck' && event.player !== player) expect(event.card).toBeUndefined();
        }
      }
    });
  });
});
