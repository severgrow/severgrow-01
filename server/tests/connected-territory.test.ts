import {expect,it} from 'vitest';
import {territoryStandings} from '../src/territory-ranking.js';
const held=(ownerId:string,...ids:string[])=>ids.map(cellId=>({ownerId,cellId,claimedAt:1}));
it('counts only the largest side-connected holding, with deterministic ties',()=>{
 const claims=[...held('a','0,0','1,0','2,0','10,0','11,0'),...held('b','0,5','1,5','2,5','3,5')];
 expect(territoryStandings(claims)).toEqual([
  {ownerId:'b',connectedTiles:4,totalTiles:4,rank:1}, {ownerId:'a',connectedTiles:3,totalTiles:5,rank:2},
 ]);
 expect(territoryStandings([...claims].reverse())).toEqual(territoryStandings(claims));
});
it('cuts, reconnects and transfers exactly the connecting tile',()=>{
 const claims=held('a','0,0','1,0','2,0','3,0','4,0');
 expect(territoryStandings(claims)[0]?.connectedTiles).toBe(5);
 const cut=claims.map(c=>c.cellId==='2,0'?{...c,ownerId:'b'}:c);
 expect(territoryStandings(cut).find(r=>r.ownerId==='a')).toMatchObject({connectedTiles:2,totalTiles:4});
 expect(territoryStandings(claims)[0]?.connectedTiles).toBe(5);
 expect(cut.filter((c,i)=>c.ownerId!==claims[i]!.ownerId)).toHaveLength(1);
});
it('does not connect diagonal cells, handles empty, isolated and equal counts',()=>{
 expect(territoryStandings([])).toEqual([]);
 expect(territoryStandings(held('a','0,0','1,1'))[0]).toMatchObject({connectedTiles:1,totalTiles:2});
 expect(territoryStandings([...held('z','0,0'),...held('a','3,3')]).map(r=>r.ownerId)).toEqual(['a','z']);
});

it('ranks the brief’s 45 connected tiles above 60 total with only 40 connected',()=>{
 const a=[...held('a',...Array.from({length:40},(_,i)=>`${i-20},0`)),
  ...held('a',...Array.from({length:20},(_,i)=>`${(i%10)*3-15},${i<10?5:-5}`))];
 const b=held('b',...Array.from({length:45},(_,i)=>`${i-22},15`));
 expect(territoryStandings([...a,...b])).toEqual([
  {ownerId:'b',connectedTiles:45,totalTiles:45,rank:1},
  {ownerId:'a',connectedTiles:40,totalTiles:60,rank:2},
 ]);
});
