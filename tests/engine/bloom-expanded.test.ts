import { describe, expect, it } from 'vitest';
import { apply, bloomGroups, coordKey, legalActions, newGame, validateBloom, viewFor } from '../../src/engine/index.js';
import type { Card, State } from '../../src/engine/index.js';

const card=(id:number,suit:0|1|2|3,rank:number):Card=>({id,suit,rank});
const position=(hand:Card[]):State=>{
  const start=newGame(11);
  const terrain={...start.terrain};
  for(const key of Object.keys(terrain))terrain[key]='normal';
  return {...start,terrain,phase:'ACT',actor:0,turnPlayer:0,hands:[hand,start.hands[1]]};
};

describe('expanded Bloom recipes',()=>{
  it('accepts 3–6 equal ranks with duplicate suits and rejects two or seven',()=>{
    const hand=[card(1,0,9),card(2,0,9),card(3,3,9),card(4,2,9),card(5,1,9),card(6,1,9)];
    expect(validateBloom(hand).kind).toBe('set');
    expect(bloomGroups(hand).some(group=>group.cards.length===6)).toBe(true);
    expect(bloomGroups(hand).some(group=>group.cards.map(c=>c.id).join(',')==='1,2,3')).toBe(true);
    expect(()=>validateBloom(hand.slice(0,2))).toThrow();
    expect(()=>validateBloom([...hand,card(7,2,9)])).toThrow();
  });

  it('allows a six-tile same-rank Bloom and consumes those six cards',()=>{
    const hand=[0,0,1,1,2,3].map((suit,id)=>card(800+id,suit as 0|1|2|3,9));
    const state=position(hand);
    const v=viewFor(state,0);
    const legal=legalActions(v);
    const six=legal.find(a=>a.t==='Bloom' && a.cards.length===6);
    expect(six?.t).toBe('Bloom');
    if(six?.t!=='Bloom')return;
    const after=apply(state,six);
    expect(after.hands[0]).toHaveLength(0);
    expect(six.hexes.every(coord=>after.board[coordKey(coord)]?.owner===0)).toBe(true);
    expect(apply(state,six)).toEqual(after);
  });

});
