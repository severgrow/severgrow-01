import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { confirmedTurn, mountTurnRim, turnRimState } from '../src/player/turn-rim.js';
import { LIGHT_TONES } from '../src/player/light.js';

const active = { phase: 'DRAW', turnPlayer: 0 } as const;
describe('the board rim follows the current turn, not the announcement queue', () => {
  it('works for either seat and changes immediately at handoff', () => {
    expect(turnRimState(active, 0)).toBe('you');
    expect(turnRimState(active, 1)).toBe('opponent');
    expect(turnRimState({ ...active, turnPlayer: 1 }, 0)).toBe('opponent');
    expect(turnRimState({ ...active, turnPlayer: 1 }, 1)).toBe('you');
  });
  it('uses confirmed online status and phase through drafts, reconnects and both seats', () => {
    const turn = confirmedTurn({ status: 'active', serverPhase: 'ACT', view: { turnPlayer: 1 } });
    expect(turnRimState(turn, 1)).toBe('you');
    expect(turnRimState(turn, 0)).toBe('opponent');
    expect(turnRimState(confirmedTurn({ status: 'finished', serverPhase: 'GAME_OVER', view: { turnPlayer: 1 } }), 1)).toBe('none');
  });
  it('leaves ended and absent matches neutral', () => {
    expect(turnRimState(null, 0)).toBe('none');
    expect(turnRimState({ ...active, phase: 'GAME_OVER' }, 0)).toBe('none');
  });
  it('publishes the existing amber independently of the display tone and avoids repeated writes', () => {
    const dataset = { turn: '' };
    const style = { setProperty: vi.fn() };
    const sync = mountTurnRim({ dataset, style });
    expect(style.setProperty).toHaveBeenCalledWith('--turn-rim-ink', LIGHT_TONES.amber.core);
    sync(active, 0);
    expect(dataset.turn).toBe('you');
    sync({ ...active, turnPlayer: 1 }, 0);
    expect(dataset.turn).toBe('opponent');
    sync(null, 0);
    expect(dataset.turn).toBe('none');
    expect(style.setProperty).toHaveBeenCalledTimes(1);
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
