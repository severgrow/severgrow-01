import { cellXY } from './world-growth.js';
type Cell={id:string;q:number;r:number};
type Claim={cellId:string;ownerId:string};
/** First visit only. Centre a real tile in the largest connected holding, not an empty midpoint
 * between scattered claims. Existing remembered/manual cameras always take precedence. */
export const menuTerritoryAnchor=(cells:readonly Cell[],claims:readonly Claim[],me:string|null)=>{
 if(!me)return null;
 const owned=new Set(claims.filter(c=>c.ownerId===me).map(c=>c.cellId));
 const remaining=new Map(cells.filter(c=>owned.has(c.id)).map(c=>[`${c.q},${c.r}`,c]));
 const before=(a:Cell,b:Cell)=>a.q<b.q||a.q===b.q&&a.r<b.r;
 let largest:Cell[]=[],landmark:Cell|null=null;
 for(const root of [...remaining.values()]){
  if(!remaining.delete(`${root.q},${root.r}`))continue;
  const group=[root];
  for(let i=0;i<group.length;i++){
   const cell=group[i]!;
   for(const [dq,dr] of [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]){
    const key=`${cell.q+dq!},${cell.r+dr!}`,next=remaining.get(key);
    if(next){remaining.delete(key);group.push(next);}
   }
  }
  const mark=group.reduce((a,c)=>before(c,a)?c:a);
  if(group.length>largest.length||group.length===largest.length&&(!landmark||before(mark,landmark))){largest=group;landmark=mark;}
 }
 if(!largest.length)return null;
 const points=largest.map(c=>cellXY(c.q,c.r));
 const centre=points.reduce((p,v)=>({x:p.x+v.x/points.length,y:p.y+v.y/points.length}),{x:0,y:0});
 const distance=(p:{x:number;y:number})=>(p.x-centre.x)**2+(p.y-centre.y)**2;
 return points.reduce((best,p)=>{
  const d=distance(p)-distance(best);
  return d < -1e-6||Math.abs(d)<=1e-6&&(p.x<best.x||p.x===best.x&&p.y<best.y)?p:best;
 });
};
