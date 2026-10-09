import { expect, it } from 'vitest';
import { coordKey, legalActions, newGame, planBloom, viewFor } from '../../src/engine/index.js';
import type { Card, State } from '../../src/engine/index.js';
import { DESK_IDLE, comboFor, deskClick, deskShape, deskTrace, drawNext, drawStarts, paintMatch } from '../src/logic/draw.js';
import { EMPTY_SEL, kindOf, kindsAvailable, moveButtons } from '../src/logic/interaction.js';
import { Session } from '../src/logic/session.js';

it('shows every Bloom recipe and accepts an unlisted legal six-card route',()=>{
  const start=newGame(11);
  const terrain={...start.terrain};
  for(const key of Object.keys(terrain))terrain[key]='normal';
  const hand:Card[]=[1,2,3,4,5,6].map((rank,id)=>({id:900+id,suit:0,rank}));
  const state:State={...start,terrain,phase:'ACT',actor:0,turnPlayer:0,hands:[hand,start.hands[1]]};
  const v=viewFor(state,0),legal=legalActions(v);
  const recipes=moveButtons(v,legal,EMPTY_SEL,true);
  expect(recipes.map(recipe=>recipe.kind)).toEqual(kindsAvailable(v,legal,EMPTY_SEL).filter(k=>k.kind.startsWith('bloom-')).map(k=>k.kind));
  const six=legal.find(a=>a.t==='Bloom'&&a.cards.length===6);
  expect(six?.t).toBe('Bloom');
  if(six?.t!=='Bloom')return;
  const kind=kindOf(six)!;
  const combo=comboFor(v,legal,{...EMPTY_SEL,kind})!;
  const used=new Set(legal.filter((a):a is Extract<typeof a,{t:'Bloom'}>=>a.t==='Bloom'&&kindOf(a)===kind).map(a=>a.hexes.map(coordKey).join('|')));
  const order=[...six.hexes].reverse();
  expect(used.has(order.map(coordKey).join('|'))).toBe(false);
  expect(()=>planBloom(state,0,hand,six.cards,order)).not.toThrow();
  const painted=paintMatch(combo,order.map(coordKey));
  expect(painted).not.toBeNull();
  const session=new Session(state,0);
  expect(session.play(painted!)).not.toBeNull();
  expect(session.state.hands[0]).toHaveLength(0);
  const path=[...drawStarts(combo)][0]!;
  const traced=[path];
  while(traced.length<combo.n) {
    const next=[...drawNext(combo,traced)][0];
    expect(next).toBeDefined();
    traced.push(next!);
  }
  let desktop=deskClick(DESK_IDLE,path,v,combo).desk;
  for(const key of traced.slice(1))desktop=deskTrace(combo,desktop,key);
  expect(deskShape(v,combo,desktop).action).toEqual(paintMatch(combo,traced));
  expect(deskClick(desktop,traced.at(-1)!,v,combo).finish).toEqual(paintMatch(combo,traced));
});
