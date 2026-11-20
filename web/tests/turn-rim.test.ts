import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { confirmedTurn, moveTappable, mountTurnRim, turnRimState } from '../src/player/turn-rim.js';
import type { TapAvailability } from '../src/player/turn-rim.js';
import { LIGHT_TONES } from '../src/player/light.js';
import type { Player } from '../../src/engine/index.js';

const active = { phase: 'DRAW', turnPlayer: 0 } as const;
/** The board is mine to move on, every condition clear. */
const mine: TapAvailability = {
  actor: 0 as Player,
  me: 0 as Player,
  phase: 'ACT',
  inputOpen: true,
  ritualHold: false,
  covered: false,
  paused: false,
};

describe('the one predicate for "my move is tappable now"', () => {
  it('is true only when it is my move, the phase is actionable and nothing blocks input', () => {
    expect(moveTappable(mine)).toBe(true);
    expect(moveTappable({ ...mine, phase: 'DRAW' })).toBe(true);
    expect(moveTappable({ ...mine, phase: 'DISCARD' })).toBe(true);
  });

  it('is false while the animation queue is pending or the pump is still running', () => {
    // `blocking()` (main.ts) is the injected answer: queue.pending > 0 || pumping, unless the steps
    // are my own (playThrough), so both arrive here as inputOpen === false.
    expect(moveTappable({ ...mine, inputOpen: false })).toBe(false);
  });

  it('is false during the pre-game ceremony (the starter ritual / pregame hold)', () => {
    expect(moveTappable({ ...mine, ritualHold: true })).toBe(false);
  });

  it('is false while a sheet or a lesson gate covers the board', () => {
    expect(moveTappable({ ...mine, covered: true })).toBe(false);
  });

  it('is false while the match is paused', () => {
    expect(moveTappable({ ...mine, paused: true })).toBe(false);
  });

  it('is false on GAME_OVER and before a match exists', () => {
    expect(moveTappable({ ...mine, phase: 'GAME_OVER' })).toBe(false);
    expect(moveTappable({ ...mine, phase: null })).toBe(false);
    expect(moveTappable({ ...mine, actor: null })).toBe(false);
  });

  it('is false when it is not my move, however idle the board is', () => {
    expect(moveTappable({ ...mine, actor: 1 as Player })).toBe(false);
  });

  it('keeps my own move live: mine animating is not a block (the mid-Bloom / own-throw case)', () => {
    // Offline `blocking() = busy() && !playThrough()`: my own move showing is playThrough, so the
    // page injects inputOpen === true. A Bloom being painted has no queued work at all.
    const ownMoveShowing = { busy: true, myMoveOnly: true };
    const inputOpen = !(ownMoveShowing.busy && !ownMoveShowing.myMoveOnly);
    expect(moveTappable({ ...mine, inputOpen })).toBe(true);
    // The opponent's cards being dealt to them is the same queue, but it is NOT my own move.
    const theirsShowing = { busy: true, myMoveOnly: false };
    expect(moveTappable({ ...mine, inputOpen: !(theirsShowing.busy && !theirsShowing.myMoveOnly) })).toBe(false);
  });
});

describe('the board rim follows the turn AND whether that move is tappable', () => {
  it('works for either seat', () => {
    expect(turnRimState(active, 0, true)).toBe('you');
    expect(turnRimState(active, 1, true)).toBe('opponent');
    expect(turnRimState({ ...active, turnPlayer: 1 }, 0, true)).toBe('opponent');
    expect(turnRimState({ ...active, turnPlayer: 1 }, 1, true)).toBe('you');
  });

  it('uses confirmed online status and phase through drafts, reconnects and both seats', () => {
    const turn = confirmedTurn({ status: 'active', serverPhase: 'ACT', view: { turnPlayer: 1 } });
    expect(turnRimState(turn, 1, true)).toBe('you');
    expect(turnRimState(turn, 1, false)).toBe('none'); // their turn is still replaying to me
    expect(turnRimState(turn, 0, true)).toBe('opponent');
    expect(turnRimState(confirmedTurn({ status: 'finished', serverPhase: 'GAME_OVER', view: { turnPlayer: 1 } }), 1, true)).toBe('none');
  });

  it('stays dark on my turn until the board is genuinely ready (the shuffle window)', () => {
    expect(turnRimState(active, 0, false)).toBe('none');
  });

  it('never lights for the opponent, even with an empty queue (the near miss)', () => {
    expect(turnRimState({ ...active, turnPlayer: 1 }, 0, true)).toBe('opponent');
    expect(turnRimState({ ...active, turnPlayer: 1 }, 0, false)).toBe('opponent');
  });

  it('leaves ended and absent matches neutral', () => {
    expect(turnRimState(null, 0, true)).toBe('none');
    expect(turnRimState({ ...active, phase: 'GAME_OVER' }, 0, true)).toBe('none');
  });

  it('publishes the existing amber independently of the display tone and avoids repeated writes', () => {
    const dataset: { turn?: string } = { turn: '' };
    const style = { setProperty: vi.fn() };
    const sync = mountTurnRim({ dataset, style });
    expect(style.setProperty).toHaveBeenCalledWith('--turn-rim-ink', LIGHT_TONES.amber.core);
    sync(active, 0, true);
    expect(dataset.turn).toBe('you');
    sync({ ...active, turnPlayer: 1 }, 0, true);
    expect(dataset.turn).toBe('opponent');
    sync(null, 0, false);
    expect(dataset.turn).toBe('none');
    expect(style.setProperty).toHaveBeenCalledTimes(1);
  });
});

describe('the transition: blocked -> ready lights up once, at the moment input opens', () => {
  const turn = { phase: 'ACT', turnPlayer: 0 } as const;

  it('writes exactly one change to "you" however many blocked or ready frames it is asked for', () => {
    const writes: string[] = [];
    const dataset: { turn?: string } = {};
    Object.defineProperty(dataset, 'turn', {
      get: () => writes.at(-1) ?? '',
      set: (v: string) => writes.push(v),
    });
    const sync = mountTurnRim({ dataset, style: { setProperty: vi.fn() } });
    // The opponent's finished turn replaying: many renders, one state.
    for (let i = 0; i < 6; i++) sync(turn, 0, moveTappable({ ...mine, inputOpen: false }));
    // It drains, then the page renders for a few frames: exactly one change, no flicker back.
    for (let i = 0; i < 6; i++) sync(turn, 0, moveTappable({ ...mine, inputOpen: true }));
    expect(writes).toEqual(['none', 'you']);
  });

  it('keeps "you" through my own move and a Bloom being painted', () => {
    const writes: string[] = [];
    const dataset: { turn?: string } = {};
    Object.defineProperty(dataset, 'turn', {
      get: () => writes.at(-1) ?? '',
      set: (v: string) => writes.push(v),
    });
    const sync = mountTurnRim({ dataset, style: { setProperty: vi.fn() } });
    sync(turn, 0, true); // ready
    sync(turn, 0, moveTappable({ ...mine, inputOpen: true })); // my own move animating (playThrough)
    sync(turn, 0, moveTappable({ ...mine, inputOpen: true })); // mid-Bloom paint, no queued work
    expect(writes).toEqual(['you']);
  });
});

describe('one rim, one publisher, every mode', () => {
  const repo = fileURLToPath(new URL('../..', import.meta.url));
  const main = readFileSync(join(repo, 'web/src/main.ts'), 'utf8');

  it('is published only through syncTurnRim (offline, online duels, Blitz, live duels all share it)', () => {
    // `publishTurnRim` is assigned once on mount and called from exactly one function; every call
    // site (the offline render, the online HUD paint and the online confirmed-snapshot callback)
    // goes through it, so no mode can grow its own rim rule.
    expect(main.match(/publishTurnRim\(/g) ?? []).toHaveLength(1);
    expect(main).toMatch(/function syncTurnRim\(\)[\s\S]*?publishTurnRim\(/);
    expect(main.match(/syncTurnRim\(\)/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('never writes the turn attribute outside the mount', () => {
    expect(main).not.toMatch(/dataset\.turn\s*=/);
    expect(main).not.toMatch(/setAttribute\(\s*['"]data-turn/);
  });
});

describe('active-turn board contour (0.83 polish)', () => {
  it('is a continuous amber LED hairline, not dashed segments', () => {
    const css = readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'src/polish-075.css'), 'utf8');
    const block = css.slice(css.indexOf('html.v075 #board .planet-turn-line {'));
    const rule = block.slice(0, block.indexOf('}', block.indexOf('stroke-dasharray')) + 1);
    expect(rule).toMatch(/stroke-dasharray:\s*none/);
    expect(rule).not.toMatch(/stroke-dasharray:\s*[0-9]/);
    expect(rule).toMatch(/stroke-linecap:\s*round/);
    expect(rule).toMatch(/drop-shadow/);
  });

  it('stays a quiet trace until it is your turn', () => {
    const css = readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'src/polish-075.css'), 'utf8');
    const resting = css.match(/html\.v075 #board \.planet-turn-rim \{ opacity: ([.\d]+); \}/);
    const yours = css.match(/html\.v075 body\[data-turn='you'\] #board \.planet-turn-rim \{ opacity: ([.\d]+); \}/);
    expect(resting).not.toBeNull();
    expect(yours).not.toBeNull();
    expect(Number(resting![1])).toBeLessThanOrEqual(0.12);
    expect(Number(yours![1])).toBe(1);
  });

  // The 0.86 metal bezel was reverted (owner, 2026-11-14: the bare hairline looked "elegant").
  // It had left a THIRD `.planet-turn-line` rule after its own block whose `stroke-width: .85`
  // silently overrode the intended 1.15 hairline. The rule that wins must stay the 1.15 one.
  it('keeps the 1.15 hairline as the declaration that wins', () => {
    const css = readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'src/polish-075.css'), 'utf8');
    const blocks = [...css.matchAll(/html\.v075 #board \.planet-turn-line\s*\{([^}]*)\}/g)];
    const widths = blocks.map((m) => m[1]!.match(/stroke-width:\s*([\d.]+)/)?.[1] ?? 'unset');
    expect(widths.at(-1)).toBe('1.15');
  });
});
