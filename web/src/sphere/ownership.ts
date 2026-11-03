import {TILE_COLOURS} from '../../../src/tile-colours.js';
import {dot,unit,type Sphere,type V3} from './geometry.js';
export const MOCK_PLAYERS=[
  {name:'YOU',colour:TILE_COLOURS[9]!}, {name:'Ash',colour:TILE_COLOURS[4]!},
  {name:'Ember',colour:TILE_COLOURS[1]!},{name:'Iris',colour:TILE_COLOURS[17]!},
  {name:'Tide',colour:TILE_COLOURS[12]!},
] as const;
export const mockOwnership=(s:Sphere)=>{
  const owners=new Int8Array(s.cells.length).fill(-1);
  const dirs:V3[]=[[0,0,1],[-.85,.35,.3],[.8,-.4,.4],[.4,.65,-.65],[-.5,-.5,-.7]];
  const closest=(p:V3)=>s.cells.reduce((a,b)=>dot(a.centre,p)>dot(b.centre,p)?a:b).index;
  // Seeded breadth-first fronts produce coherent countries, not a random checkerboard.
  const queue=dirs.map((p,owner)=>({id:closest(unit(p)),owner,depth:0}));
  const limits=[5,6,5,6,5];
  for(const seed of queue)owners[seed.id]=seed.owner;
  for(let i=0;i<queue.length;i++){
    const {id,owner,depth}=queue[i]!;
    if(depth>=limits[owner]!)continue;
    for(const n of s.cells[id]!.neighbours)if(owners[n]===-1){owners[n]=owner;queue.push({id:n,owner,depth:depth+1});}
  }
  for(const direction of [[.8,-.4,-.55],[-.8,.6,-.35]] as const){
    const toward=unit(direction);
    const candidate=s.cells.filter(c=>owners[c.index]===-1&&c.centre[2]<.1&&c.neighbours.every(n=>owners[n]!==0))
      .sort((a,b)=>dot(b.centre,toward)-dot(a.centre,toward))[0];
    if(candidate){owners[candidate.index]=0;for(const n of candidate.neighbours.slice(0,3))if(owners[n]===-1)owners[n]=0;}
  }
  for(const c of s.cells)if(owners[c.index]===-1 && c.centre[1]<-.35 && c.centre[2]<-.3)owners[c.index]=-2;
  const mine=s.cells.filter(c=>owners[c.index]===0),remaining=new Set(mine.map(c=>c.index));
  let largest:number[]=[];
  for(const cell of mine){
    if(!remaining.delete(cell.index))continue;
    const group=[cell.index];for(const id of group)for(const n of s.cells[id]!.neighbours)if(remaining.delete(n))group.push(n);
    if(group.length>largest.length)largest=group;
  }
  const centre=unit(largest.reduce<V3>((sum,id)=>{const p=s.cells[id]!.centre;return[sum[0]+p[0],sum[1]+p[1],sum[2]+p[2]];},[0,0,0]));
  return {owners,home:centre,connected:largest.length};
};

export const colourRgb=(css:string):V3=>{
  const values=css.match(/[\d.]+/g)?.map(Number)??[0,0,0];
  const h=values[0]!/360,s=values[1]!/100,l=values[2]!/100;
  const f=(n:number)=>{const k=(n+h*12)%12;return l-s*Math.min(l,1-l)*Math.max(-1,Math.min(k-3,9-k,1));};
  return[f(0),f(8),f(4)];
};
