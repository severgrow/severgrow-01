import {expect,it} from 'vitest';
import {allNeighbors,apply,coordKey,homeCoord,legalActions,newGame,viewFor} from '../../src/engine/index.js';
import type {Action,State} from '../../src/engine/index.js';
import {matchAllTips,intelTips} from '../src/logic/intel-guide.js';
import {matchIntel} from '../src/logic/match-intel.js';

const position=():State=>{
 const s=newGame(3107);
 return {...s,phase:'ACT',actor:0,turnPlayer:0,terrain:Object.fromEntries(Object.keys(s.terrain).map(k=>[k,'normal' as const])),
  hands:[[{id:1000,suit:null,rank:0},{id:1001,suit:null,rank:0},{id:1002,suit:0,rank:1},{id:1003,suit:0,rank:2},{id:1004,suit:0,rank:3}],s.hands[1]]};
};
it('Bloom advice never promises an already-spent Grow',()=>{
 const s=position();s.sproutsThisTurn=s.config.sproutsPerTurn;
 const v=viewFor(s,0),tip=matchAllTips(v).find(t=>t.id==='bloom');
 expect(tip).toBeDefined();expect(tip!.detail).not.toMatch(/still have/);
 expect(tip!.detail).toMatch(/already used/);
});
it('takeover advice never promises a move during the opponent turn',()=>{
 const s=position(),side=allNeighbors(homeCoord(0,s.config)).map(coordKey).find(k=>k in s.board&&!s.board[k])!;
 s.board[side]={owner:1,strength:1};s.turnPlayer=1;s.actor=1;
 expect(matchAllTips(viewFor(s,0)).some(t=>t.id==='stronger')).toBe(false);
});
it('takeover advice needs a strong enough card in the actual hand',()=>{
 const s=position(),side=allNeighbors(homeCoord(0,s.config)).map(coordKey).find(k=>k in s.board&&!s.board[k])!;
 s.hands[0]=[{id:1002,suit:0,rank:2}];s.board[side]={owner:1,strength:8};
 expect(matchAllTips(viewFor(s,0)).some(t=>t.id==='stronger')).toBe(false);
});
it('Bomb advice names a reachable strength and the configured Grow cost',()=>{
 const s=position(),side=allNeighbors(homeCoord(0,s.config)).map(coordKey).find(k=>k in s.board&&!s.board[k])!;
 s.board[side]={owner:1,strength:9};
 const tip=()=>matchAllTips(viewFor(s,0)).find(t=>t.id==='bomb')!;
 expect(tip().headline).toContain('9');expect(tip().detail).toContain('uses your Grow');
 s.config={...s.config,fruitUsesSprout:false};expect(tip().detail).toContain('No Grow spent');
});
it('finished matches retain the real outcome and never recommend another move',()=>{
 const s=position();s.phase='GAME_OVER';s.result={winner:0,reason:'strangle',scores:[1,9]};
 const v=viewFor(s,0);
 expect(matchIntel(v,[],[]).outcome).toBe('won');
 expect(matchIntel(viewFor(s,1),[],[]).outcome).toBe('lost');
 expect(matchAllTips(v)).toEqual([]);
});
it('a legal Bloom that closes two home sides is the first, specific recommendation',()=>{
 const s=position(),home=coordKey(homeCoord(1,s.config));
 const sides=allNeighbors(homeCoord(1,s.config)).map(coordKey).filter(k=>k in s.board);
 const remaining=sides.slice(0,2),extra=allNeighbors(allNeighbors(homeCoord(1,s.config))[0]!).map(coordKey).find(k=>k in s.board&&!sides.includes(k)&&k!==home&&!s.board[k]?.root)!;
 for(const key of Object.keys(s.board))if(key!==home&&!s.board[key]?.root)s.board[key]={owner:0,strength:1};
 for(const key of [...remaining,extra])s.board[key]=null;
 const v=viewFor(s,0),a=legalActions(v).find((a):a is Extract<Action,{t:'Bloom'}>=>a.t==='Bloom'&&remaining.every(k=>a.hexes.some(h=>coordKey(h)===k)));
 expect(a).toBeDefined();expect(apply(s,a!).result?.winner).toBe(0);
 const tips=intelTips(v);expect(tips).toHaveLength(1);const tip=tips[0]!;
 expect(tip.id).toBe('surround');expect(tip.headline).toMatch(/Bloom/);expect(tip.detail).toMatch(/this turn/);
});
it('recognises a winning overgrow of a defended home side',()=>{
 const s=position(),home=coordKey(homeCoord(1,s.config));
 const last=allNeighbors(homeCoord(1,s.config)).map(coordKey).find(k=>k in s.board)!;
 for(const key of Object.keys(s.board))if(key!==home&&!s.board[key]?.root)s.board[key]={owner:0,strength:1};
 s.board[last]={owner:1,strength:8};s.hands[0]=[{id:1002,suit:0,rank:9}];
 const v=viewFor(s,0),a=legalActions(v).find(a=>a.t==='Sprout'&&coordKey(a.coord)===last)!;
 expect(a).toBeDefined();expect(apply(s,a).result?.winner).toBe(0);
 const tips=intelTips(v);expect(tips).toHaveLength(1);expect(tips[0]!.headline).toContain('finish with a Grow');
});
