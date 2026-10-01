import { describe, expect, it } from 'vitest';
import { apply, legalActionsForState, newGame } from '../../src/engine/index.js';
import type { Action } from '../../src/engine/index.js';
import { renderBoard, runTerminalGame } from '../../src/cli/play.js';
import { replayReport } from '../../src/cli/replay.js';

describe('terminal client (spec 20 milestone E)', () => {
  it('draws the board as text: roots, rock, gold, tiles', () => {
    const s = newGame(5);
    const text = renderBoard(s);
    expect(text.split('\n')).toHaveLength(7); // 7 rows on a radius-3 board
    expect(text).toContain('YR'); // your root
    expect(text).toContain('BR'); // bot root
    expect(text).toContain('##'); // rock
    expect(text).toContain('**'); // gold (rich)
  });

  it('completes a full game against the bot with scripted input', async () => {
    const out: string[] = [];
    let asked = 0;
    const result = await runTerminalGame({
      seed: 11,
      ask: async () => {
        asked++;
        return '1'; // always the first listed move
      },
      print: (line) => out.push(line),
    });
    const text = out.join('\n');
    expect(result.phase).toBe('GAME_OVER');
    expect(asked).toBeGreaterThan(3);
    for (const part of ['Your hand', 'Discard', 'Deck', 'Score', 'Leftover', 'Moves', 'Game over']) expect(text).toContain(part);
  });

  it('re-asks on bad input and can quit', async () => {
    const answers = ['abc', '999', 'q'];
    const out: string[] = [];
    const result = await runTerminalGame({ seed: 2, ask: async () => answers.shift() ?? 'q', print: (l) => out.push(l) });
    expect(result.phase).toBe('DRAW');
    expect(out.join('\n')).toMatch(/Please type a number/);
  });
});

describe('replay CLI (spec 18)', () => {
  const log: Action[] = [];
  let s = newGame(9);
  for (let i = 0; i < 60 && s.phase !== 'GAME_OVER'; i++) {
    const a = legalActionsForState(s)[0]!;
    log.push(a);
    s = apply(s, a);
  }

  it('replays a log, printing events per action and the final state', () => {
    const r = replayReport(9, log);
    expect(r.ok).toBe(true);
    expect(r.text).toContain('#1 Draw');
    expect(r.text).toMatch(/Draw/);
    expect(r.text).toContain(`Final: phase ${s.phase}`);
  });

  it('reports the first illegal action with its index', () => {
    const r = replayReport(9, [{ t: 'Draw', from: 'deck' }, { t: 'Draw', from: 'deck' }]);
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/#2 .*WRONG_PHASE/);
  });
});
