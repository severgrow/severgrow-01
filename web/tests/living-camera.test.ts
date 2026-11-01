import { expect,it } from 'vitest';
import { menuTerritoryAnchor } from '../src/online/living-camera.js';
import { cellXY } from '../src/online/world-growth.js';
const cells=[{id:'0,0',q:0,r:0},{id:'1,0',q:1,r:0},{id:'20,0',q:20,r:0}];
const claims=cells.map(c=>({cellId:c.id,ownerId:'me'}));
it('has no invented anchor for a player without land',()=>{
 expect(menuTerritoryAnchor(cells,claims,null)).toBeNull();expect(menuTerritoryAnchor(cells,claims,'other')).toBeNull();
});
it('anchors the largest connected holding on an actual owned cell, never the empty gap between claims',()=>{
 const at=menuTerritoryAnchor(cells,claims,'me');expect([cellXY(0,0),cellXY(1,0)]).toContainEqual(at);
});
it('a single isolated claim remains personally visible',()=>{
 expect(menuTerritoryAnchor(cells,[claims[2]!],'me')).toEqual(cellXY(20,0));
});
it('equal-size holdings keep the same geographic anchor when the server reorders cells',()=>{
 const more=[...cells,{id:'21,0',q:21,r:0}],owners=more.map(c=>({cellId:c.id,ownerId:'me'}));
 expect(menuTerritoryAnchor([...more].reverse(),owners,'me')).toEqual(menuTerritoryAnchor(more,owners,'me'));
});
