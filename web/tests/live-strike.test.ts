import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { liveStrike } from '../src/ui/live-strike.js';
import { BOMB_ART_URL } from '../src/replay/strike.js';
import { BOMB_FACE, cardArtUrl, setCardFaceArt } from '../src/ui/card-art.js';
import type { Step } from '../src/logic/anim.js';
describe('opponent Bomb / Blast visual identity',()=>{
  it('distinguishes one Bomb from a two-card, seven-hex Blast without mutating a step',()=>{
    const bomb:Step={k:'fruit',player:1,card:{id:99,suit:null,rank:0},target:'0,0',strength:7};
    const blast:Step={k:'megaBomb',player:1,target:'0,0',destroyed:['0,0','1,0']};
    const original=JSON.stringify(blast);
    expect(liveStrike(bomb)).toEqual({target:'0,0',area:['0,0'],cards:1});
    expect(liveStrike(blast)?.cards).toBe(2);expect(new Set(liveStrike(blast)?.area).size).toBe(7);
    expect(JSON.stringify(blast)).toBe(original);
  });
  it('never decorates unrelated moves',()=>expect(liveStrike({k:'turn',player:1,final:false})).toBeNull());
});
// The strike's card IS the game's card art (owner, 2026-11-14: "that should be included in skin swap
// too - none of the animations should change, just replace the art"). One source, so a card skin
// reaches the hand the piles, the strike and the replay together — or not at all.
describe('the strike card draws from the one card-art table', () => {
  it('the strike card is the Bomb face, asked for at draw time', () => {
    const strike = readFileSync(new URL('../src/ui/live-strike.ts', import.meta.url), 'utf8');
    expect(strike).toMatch(/href: cardArtUrl\(BOMB_FACE\)/);
    expect(strike).not.toContain('assets/cards/');
    expect(BOMB_FACE).toBe('fruit');
    expect(BOMB_ART_URL).toBe(cardArtUrl(BOMB_FACE));
  });
  it('the replay and the strike name the same face through the same accessor', () => {
    for (const file of ['../src/replay/frames.ts', '../src/replay/player.ts', '../src/replay/board-canvas.ts']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(src, file).toContain('cardArtUrl(BOMB_FACE)');
      expect(src, file).not.toContain('assets/cards/');
    }
  });
  it('a face override reaches the strike art; null restores the shipped face', () => {
    const shipped = cardArtUrl(BOMB_FACE);
    try {
      setCardFaceArt({ [BOMB_FACE]: 'skim-bomb.webp' });
      expect(cardArtUrl(BOMB_FACE)).toBe('skim-bomb.webp');
    } finally {
      setCardFaceArt(null);
    }
    expect(cardArtUrl(BOMB_FACE)).toBe(shipped);
  });
});
