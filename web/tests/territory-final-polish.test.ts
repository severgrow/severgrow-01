import {expect,it} from 'vitest';
import {WorldView} from '../src/online/world-view.js';
import {flatCell,nearestCell,viewGlobePose,globeHex,globePoint} from '../src/online/map-globe.js';
it('mobile zoom-out contains the world at every panel aspect, independently of touch size',()=>{
 for(const aspect of [320/460,390/710,844/250,768/900]){
  const v:any=Object.create(WorldView.prototype);v.fit=[-138,-118,276,236];
  const b=v.boundsFor(aspect);
  expect(b[2]/b[3]).toBeCloseTo(aspect,10);
  expect(b[2]).toBeGreaterThanOrEqual(240);expect(b[3]).toBeGreaterThanOrEqual(200);
 }
});
it('blank sea never selects a distant tile, but projected centres remain exact',()=>{
 const cells=[{id:'0,0',q:0,r:0},{id:'1,0',q:1,r:0}];
 const pose=viewGlobePose([-100,-100,200,200]);
 expect(nearestCell(cells,pose,-90,-90)).toBeNull();
 expect(nearestCell(cells,null,0,9.5)?.id).toBe('0,0');
 expect(nearestCell(cells,null,9,9)).toBeNull();
 for(const c of cells){const p=flatCell(c.q,c.r);expect(nearestCell(cells,null,p.x,p.y)?.id).toBe(c.id);}
});

it('shared-canvas crops determine the maximum fit without changing the camera aspect',()=>{
 const v:any=Object.create(WorldView.prototype);v.fit=[-138,-118,276,236];v.active=true;
 v.canvas={left:0,top:0,width:390,height:844};v.focus={fx:.5,fy:465/844};
 v.panelLayout=()=>({left:16,top:102,width:358,height:726,radius:14});
 const b=v.boundsFor(390/844);const k=390/b[2];
 const screen=(x:number,y:number)=>({x:(x-b[0])*k,y:(y-b[1])*k});
 const a=screen(-120,-100),z=screen(120,100);
 expect(a.x).toBeGreaterThan(16);expect(z.x).toBeLessThan(374);
 expect(a.y).toBeGreaterThan(102);expect(z.y).toBeLessThan(828);
});

it('hit testing agrees on both sides of every rendered boundary, including compressed rim cells',()=>{
 for(const pose of [null,viewGlobePose([-100,-100,200,200])]){
  const cell={id:'4,3',q:4,r:3},flat=flatCell(cell.q,cell.r);
  const centre=pose?globePoint(pose,flat.x,flat.y):flat;
  const pts=[...globeHex(pose,flat.x,flat.y).matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(m=>({x:Number(m[1]),y:Number(m[2])}));
  for(let i=0;i<6;i++){
   const a=pts[i]!,b=pts[(i+1)%6]!,mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
   const dx=mid.x-centre.x,dy=mid.y-centre.y;
   expect(nearestCell([cell],pose,centre.x+dx*.999,centre.y+dy*.999)?.id).toBe(cell.id);
   expect(nearestCell([cell],pose,centre.x+dx*1.001,centre.y+dy*1.001)).toBeNull();
  }
 }
});


it('find-my-land puts the largest holding under the visible crop focus while retaining zoom',()=>{
 const v:any=Object.create(WorldView.prototype);
 v.world={cells:[{id:'0,0',q:0,r:0},{id:'1,0',q:1,r:0},{id:'20,0',q:20,r:0}],claims:[{cellId:'0,0',ownerId:'a'},{cellId:'1,0',ownerId:'a'},{cellId:'20,0',ownerId:'a'}]};
 v.box=[0,0,100,200];v.focus={fx:.5,fy:.55};let target:number[]=[];
 v.flyTo=(x:number,y:number)=>{target=[x,y];};v.flyToOwner('a');
 // Largest component's stable real-tile anchor is 0,0; the legacy flyTo centres its argument.
 expect(target[0]!-50+100*v.focus.fx).toBeCloseTo(0,10);
 expect(target[1]!-100+200*v.focus.fy).toBeCloseTo(0,10);
 expect(v.box[2]).toBe(100);expect(v.box[3]).toBe(200);
});

it('rotation keeps the approved bend centred on the drawn camera without rewriting stored zoom',()=>{
 const v:any=Object.create(WorldView.prototype);v.aspect=2;
 const stored=[-50,-100,100,200];const pose=v.poseFor(stored);
 expect(pose.cx).toBe(0);expect(pose.cy).toBe(0);
 expect(pose.radius).toBeCloseTo(Math.hypot(100,50)/2,10);
 expect(pose.falloff).toBe(.15);expect(stored).toEqual([-50,-100,100,200]);
});
