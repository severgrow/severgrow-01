import {expect,it} from 'vitest';
import {newGame,viewFor} from '../../src/engine/index.js';
import type {Event} from '../../src/engine/index.js';
import {matchIntel,publicIntelMoves} from '../src/logic/match-intel.js';

it('every paired Intel readout is relative to the viewing player',()=>{
 const s=newGame(7);s.board['0,0']={owner:0,strength:5};
 const events:Event[]=[{t:'Sever',player:1,coords:[{q:0,r:1},{q:1,r:0}]}];
 const a=matchIntel(viewFor(s,0),events,[]),b=matchIntel(viewFor(s,1),events,[]);
 expect(a.territory).not.toEqual([...a.territory].reverse());
 for(const key of ['territory','cuts','blooms','bombs','score'] as const)expect(b[key]).toEqual([...a[key]].reverse());
 expect(b.moves.at(-1)?.who).toBe('opp');
});
it('a deck draw never exposes the other seat’s card identity',()=>{
 const s=newGame(7),card=s.hands[0][0]!;
 const events:Event[]=[{t:'Draw',player:0,from:'deck',card:card.id}];
 expect(publicIntelMoves(viewFor(s,1),events)).toEqual([{who:'opp',verb:'DREW',detail:null}]);
 expect(publicIntelMoves(viewFor(s,0),events)[0]?.detail).not.toBeNull();
});
