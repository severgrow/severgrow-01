// THE LED OPPONENT (owner, 2026-11-11): in offline free play the cockpit sign is the opponent,
// commentator and judge at once — "GOT U", "hehehe", "damn!", "Auch!", "Heeey easy girl" and more —
// but very rarely. Online and the teaching levels keep the neutral sign.
import { describe, expect, it } from 'vitest';
import { FLAVOUR_POOLS, FlavourDeck, RIVAL_GAME_CAP, RIVAL_POOLS, flavourGate } from '../src/player/led-flavour.js';
import { displayEventForPlay } from '../src/player/display-readout.js';
import { GLYPH_CHARS } from '../src/player/led-cells.js';
import { newGame } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';

const firing = (seed: string) => { for (let i = 0; i < 2000; i++) if (flavourGate(`${seed}:${i}`)) return `${seed}:${i}`; throw new Error('none'); };

describe('the opponent voice', () => {
  it("uses the owner's lines exactly", () => {
    const all = Object.values(RIVAL_POOLS).flatMap((p) => p.lines);
    for (const line of ['GOT U', 'hehehe', 'damn!', 'Auch!', 'Heeey easy girl']) expect(all).toContain(line);
  });
  it('has a line for every moment the neutral sign has, plus the end of a game', () => {
    for (const kind of Object.keys(FLAVOUR_POOLS)) expect(RIVAL_POOLS[kind as keyof typeof RIVAL_POOLS]?.lines.length, kind).toBeGreaterThan(2);
    expect(RIVAL_POOLS.win.lines.length).toBeGreaterThan(2);
    expect(RIVAL_POOLS.lose.lines.length).toBeGreaterThan(2);
  });
  it('every line can be drawn on the LED (no missing glyphs)', () => {
    for (const line of Object.values(RIVAL_POOLS).flatMap((p) => p.lines)) {
      for (const ch of line.toUpperCase()) if (ch !== ' ') expect(GLYPH_CHARS.has(ch), `${line}: "${ch}"`).toBe(true);
    }
  });
  it('is very rare: a few lines a game at most, even when every moment would fire', () => {
    const deck = new FlavourDeck();
    let shown = 0;
    for (let i = 0; i < 40; i++) if (deck.draw(i % 2 ? 'cut-mine' : 'cut-theirs', RIVAL_POOLS[i % 2 ? 'cut-mine' : 'cut-theirs'], firing(`g:${i}`))) shown++;
    expect(shown).toBe(RIVAL_GAME_CAP);
    deck.reset(); // a new game
    expect(deck.draw('mega', RIVAL_POOLS.mega, firing('new'))).not.toBeNull();
  });
  it('the neutral sign keeps its own lines and no cap', () => {
    const deck = new FlavourDeck();
    let shown = 0;
    for (let i = 0; i < 40; i++) if (deck.draw(i % 2 ? 'cut-mine' : 'cut-theirs', FLAVOUR_POOLS[i % 2 ? 'cut-mine' : 'cut-theirs'], firing(`n:${i}`))) shown++;
    expect(shown).toBeGreaterThan(RIVAL_GAME_CAP);
  });
});

describe('which voice a moment gets', () => {
  const over = (s: State, winner: 0 | 1): State => ({ ...s, phase: 'GAME_OVER', result: { winner } as State['result'] });
  it('offline free play: the opponent; online and lessons: neutral', () => {
    const s = newGame(3);
    const rival = displayEventForPlay(s, over(s, 0), [], 0, 'rival');
    expect(rival?.message).toBe('YOU WIN');
    expect(rival?.flavour?.pool).toBe(RIVAL_POOLS.win);
    expect(displayEventForPlay(s, over(s, 1), [], 0, 'rival')?.flavour?.pool).toBe(RIVAL_POOLS.lose);
    // neutral (online, levels 1-9): the result stays a plain fact, as before
    expect(displayEventForPlay(s, over(s, 0), [], 0)?.flavour).toBeUndefined();
  });
});
