// The opponent's replayed turn must reach the cockpit (the same personality the player's own
// moves get) and the display must read as SOMEONE ELSE'S while it plays. These are the DOM-free
// pieces `main.ts` composes: the author test, the dim's lifecycle, and the source wiring that the
// two-browser suite then proves end to end.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { Event } from '../../src/engine/index.js';
import { createTheirsDim, replayedByOpponent } from '../src/player/replay-display.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('replayedByOpponent — whose move is on the glass', () => {
  const sprout = (player: 0 | 1): Event => ({ t: 'Sprout', player, card: 3, coord: { q: 0, r: 0 } });

  it('reads the opponent’s events as theirs (live and gap catch-up alike)', () => {
    expect(replayedByOpponent([sprout(1)], 0)).toBe(true);
    expect(replayedByOpponent([sprout(0), sprout(1)], 0)).toBe(true);
    // Seat 1's view: their opponent is engine player 0.
    expect(replayedByOpponent([sprout(0)], 1)).toBe(true);
  });

  it('keeps the player’s OWN aftermath (a sever their Throw caused) as ours', () => {
    expect(replayedByOpponent([{ t: 'Sever', player: 0, coords: [{ q: 0, r: 0 }] }], 0)).toBe(false);
    expect(replayedByOpponent([], 0)).toBe(false);
  });
});

describe('createTheirsDim — the "not ours" dim cannot get stuck', () => {
  it('turns on once, off once, and never repeats a toggle', () => {
    const apply = vi.fn();
    const dim = createTheirsDim(apply);
    expect(dim.active).toBe(false);
    dim.begin();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenLastCalledWith(true);
    dim.begin(); // idempotent — a second begin is not a second dim
    expect(apply).toHaveBeenCalledTimes(1);
    expect(dim.active).toBe(true);
    dim.clear();
    expect(apply).toHaveBeenLastCalledWith(false);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(dim.active).toBe(false);
  });

  it('a clear without a begin is silent, and every drain path can call it', () => {
    const apply = vi.fn();
    const dim = createTheirsDim(apply);
    dim.clear();
    dim.clear();
    expect(apply).not.toHaveBeenCalled();
    // begin → any number of clears (pump, watchdog, teardown, finish) all resolve to one off.
    dim.begin();
    dim.clear();
    dim.clear();
    dim.clear();
    expect(apply.mock.calls).toEqual([[true], [false]]);
    expect(dim.active).toBe(false);
  });
});

describe('source wiring (the two-browser suite proves the runtime)', () => {
  const mainSource = read('../src/main.ts');
  const cockpitSource = read('../src/player/smart-cockpit.ts');

  it('the cockpit exposes an explicit dim and styles it', () => {
    expect(cockpitSource).toMatch(/dim\s*:\s*\(on\s*:\s*boolean\)/);
    expect(cockpitSource).toMatch(/classList\.toggle\('led-theirs'/);
    expect(cockpitSource).toMatch(/#smart-panel\.led-theirs\s+#smart-led\b/);
  });

  it('the online replay wires the personality and the dim, and lifts it on every drain', () => {
    // The event rides its anchor step through the ONE mechanism offline uses.
    expect(mainSource).toMatch(/displayEventForPlay\(beforeState, os\.state, catchUp, HUMAN\)/);
    expect(mainSource).toMatch(/displaySteps\.set\(anchor, displayEvent\)/);
    expect(mainSource).toMatch(/outcomeSteps\.set\(cue\.step, cue\)/);
    expect(mainSource).toMatch(/replayedByOpponent\(pending, os\.seat\)/);
    expect(mainSource).toMatch(/theirsDim\.begin\(\)/);
    // Every drain point the Reveal can end at lifts the dim (pump, fast-forward, watchdog,
    // teardown) — at least four clears, so a stuck dim is not reachable from one missed path.
    const clears = mainSource.match(/theirsDim\.clear\(\)/g) ?? [];
    expect(clears.length).toBeGreaterThanOrEqual(4);
  });

  it('offline is untouched — afterPlay still computes the event the same way', () => {
    expect(mainSource).toMatch(/displayEventForPlay\(p\.before,p\.after,p\.steps,HUMAN\)/);
    expect(mainSource).toMatch(/displayEventForPlay\(result\.played\.before, result\.played\.after, result\.played\.steps, HUMAN\)/);
  });
});
