// PLAY THROUGH (owner, 2026-11-06: "if player wants to select next action while animation is playing
// let him - so if bloom goes first, while animation is playing player can pick a card for grow which
// comes next, or if he grew and blooming animation plays he can already pick the throw card while
// animation goes --- so the animation plays but never gets in the way of playing the game, even when
// someone wants to play very quickly").
//
// While only MY OWN move is still being shown, my input is live and the animation keeps playing. The
// opponent's turn is different: it still has to be seen (a tap there skips it, as before).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AnimQueue } from '../src/logic/anim.js';
import type { Step } from '../src/logic/anim.js';
import { playsThrough } from '../src/logic/play-through.js';

const ME = 0 as const;
const THEM = 1 as const;
const grow = (player: 0 | 1): Step => ({ k: 'grow', style: 'bloom', player, tiles: [{ key: '0,0', strength: 1, replaced: false }] });
const sync: Step = { k: 'sync', board: {}, scores: [0, 0] };
const cut = (by: 0 | 1): Step => ({ k: 'sever', player: by === 0 ? 1 : 0, by, keys: ['1,0'], origin: '1,0' });

describe('play through my own animation', () => {
  it('my own steps still playing: input is live', () => {
    expect(playsThrough([grow(ME), cut(ME), sync], null, ME)).toBe(true);
    expect(playsThrough([sync], grow(ME), ME)).toBe(true);
    expect(playsThrough([], grow(ME), ME)).toBe(true);
  });

  it('any opponent step still to be shown (or showing): the old rule, it must be seen first', () => {
    expect(playsThrough([grow(THEM), sync], null, ME)).toBe(false);
    expect(playsThrough([sync], grow(THEM), ME)).toBe(false);
    expect(playsThrough([grow(ME), grow(THEM)], null, ME)).toBe(false);
    // the opponent cutting me is the opponent's step, even though the tiles are mine
    expect(playsThrough([cut(THEM)], null, ME)).toBe(false);
  });

  it('nothing playing is not "playing through" (the ordinary idle state)', () => {
    expect(playsThrough([], null, ME)).toBe(false);
  });

  it('the queue lists what is still waiting without consuming it', () => {
    const q = new AnimQueue({});
    q.push([grow(ME), sync]);
    expect(q.steps().map((s) => s.k)).toEqual(['grow', 'sync']);
    expect(q.pending).toBe(2);
  });

  it('the page uses it: my own taps no longer skip my own animation, and the hand, board and piles stay live', () => {
    const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');
    expect(main).toContain('playsThrough(queue.steps(), currentStep, HUMAN)');
    expect(main).toMatch(/const blocking = \(\) => busy\(\) && !playThrough\(\);/);
    for (const gate of [
      /function onCardTap[\s\S]{0,400}if \(blocking\(\)\) fastForward\(\);/,
      /function onHexTap[\s\S]{0,400}if \(blocking\(\)\) fastForward\(\);/,
      /const legal = myTurn\(\) && !blocking\(\) \? session\.legal : \[\];/,
      /function maybeAutoPlay\(\) \{\s*if \(!session \|\| !myTurn\(\) \|\| blocking\(\)\) return;/,
      /pileStates\(v\.phase, myTurn\(\), blocking\(\),/,
    ]) expect(main).toMatch(gate);
  });
});
