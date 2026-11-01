import { describe, expect, it } from 'vitest';
import { liveStrike } from '../src/ui/live-strike.js';
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
