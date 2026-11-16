import { expect,it } from 'vitest';
import { arcQuat,inverse,rotate,slerp,type Quat } from '../src/sphere/rotation.js';
import { unit } from '../src/sphere/geometry.js';
import { uprightTarget,northUpDrag,rolledDrag,NORTH_PITCH_LIMIT,coastGain,coastStep } from '../src/sphere/upright.js';
import { multiply } from '../src/sphere/rotation.js';
it('removes roll while keeping exactly the same point at the centre',()=>{
 for(let i=1;i<80;i++){
  const q=arcQuat([0,0,1],[Math.sin(i),Math.cos(i),.4]);
  const target=uprightTarget(q,[0,1,0]);
  const before=rotate(inverse(q),[0,0,1]),after=rotate(inverse(target),[0,0,1]);
  before.forEach((v,j)=>expect(after[j]).toBeCloseTo(v,10));
  const up=rotate(target,[0,1,0]);
  if(Math.hypot(up[0],up[1])>.15){expect(up[0]).toBeCloseTo(0,9);expect(up[1]).toBeGreaterThan(0);}
 }
});
it('is idempotent and holds its orientation at a pole instead of flipping',()=>{
 const q:Quat=[0,0,Math.sin(.6),Math.cos(.6)];
 const target=uprightTarget(q,[0,1,0]);expect(uprightTarget(target,[0,1,0])).toEqual(target);
 const pole=arcQuat([0,1,0],[0,0,1]);expect(uprightTarget(pole,[0,1,0])).toEqual(pole);
});
it('aligns around a surface anchor while keeping that point fixed',()=>{
 const q:Quat=[0,0,Math.sin(.4),Math.cos(.4)],pivot=unit([.3,.2,.93]);
 const target=uprightTarget(q,[0,1,0],pivot),worldPoint=rotate(inverse(q),pivot);
 expect(rotate(target,[0,1,0])[0]).toBeCloseTo(0,9);
 expect(rotate(target,[0,1,0])[1]).toBeGreaterThan(0);
 for(let i=0;i<=10;i++)rotate(slerp(q,target,i/10),worldPoint).forEach((v,j)=>expect(v).toBeCloseTo(pivot[j]!,9));
});
it('keeps geographic up throughout dragging, with stable pole limits and no follow-up motion',()=>{
 let q:Quat=[0,0,0,1];
 for(let i=0;i<400;i++){
  q=northUpDrag(q,[0,1,0],i%2?13:-7,i<200?11:-11,240);
  const up=rotate(q,[0,1,0]);
  expect(up[0]).toBeCloseTo(0,8);expect(up[1]).toBeGreaterThanOrEqual(Math.cos(NORTH_PITCH_LIMIT)-1e-8);
  expect(Math.hypot(...q)).toBeCloseTo(1,9);
 }
 const held=northUpDrag(q,[0,1,0],0,0,240);
 q.forEach((v,i)=>expect(held[i]).toBeCloseTo(v,10));
});
it('coasts only when the top of the planet is visible, with a continuous zoom transition',()=>{
 const frame={x:0,y:0,width:400,height:600};
 // Disc fills past the top edge → zoomed in → no coast.
 expect(coastGain(frame, 340)).toBe(0);
 // Top limb sits well inside the frame → full coast.
 expect(coastGain(frame, 180)).toBe(1);
 // Between: continuous, not a hard step.
 const a=coastGain(frame, 280), b=coastGain(frame, 250), c=coastGain(frame, 220);
 expect(a).toBeGreaterThan(0); expect(a).toBeLessThan(b); expect(b).toBeLessThan(c); expect(c).toBeLessThanOrEqual(1);
});
it('a half-zoomed flick keeps gliding; gain is not applied again every frame',()=>{
 // Eight frames at 16 ms. Multiplying by gain (0.5) on every frame used to kill this.
 let half={x:0.8,y:0}, full={x:0.8,y:0};
 for(let i=0;i<8;i++){
  const nextHalf=coastStep(half,0.5,16), nextFull=coastStep(full,1,16);
  expect(nextHalf).not.toBeNull();
  expect(nextFull).not.toBeNull();
  half=nextHalf!; full=nextFull!;
 }
 expect(half.x).toBeGreaterThan(0.4);
 expect(full.x).toBeGreaterThan(half.x);
 // Zoomed in (top clipped) and a flick that has already died both stop.
 expect(coastStep({x:1,y:0},0,16)).toBeNull();
 expect(coastStep({x:0.02,y:0},1,16)).toBeNull();
});

// THE GROUND STAYS UNDER THE FINGER IN A TURNED VIEW (owner, 2026-11-16: "it's like u can't drag it in
// whatever direction" on /test, while live drags freely). 0.86 turns the world view by a small roll so
// the centre tile sits flat side up, and applied the north-up drag BEFORE that turn: the ground then
// slid off by the roll angle (measured in Chromium: 30 degrees off the finger in every direction, the
// tile ending 50% of the drag away from it; live 0 degrees and ~7%). The finger's movement must be read
// in the turned view.
it('a drag in a turned view moves the ground the way the finger moves, and keeps the turn',()=>{
 const north:[number,number,number]=[0,1,0],rz=(r:number):Quat=>[0,0,Math.sin(r/2),Math.cos(r/2)];
 const base=northUpDrag([0,0,0,1],north,40,30,200);
 for(const roll of [0,-Math.PI/6,-Math.PI/12,Math.PI/18,Math.PI/6]){
  const q=multiply(rz(roll),base);
  for(let k=0;k<8;k++){
   const th=k*Math.PI/4,dx=8*Math.cos(th),dy=8*Math.sin(th);
   const ground=rotate(inverse(q),[0,0,1]);
   const next=rolledDrag(q,north,dx,dy,200,roll),p=rotate(next,ground);
   // screen: x right, y down
   const moved=Math.atan2(-p[1],p[0]),off=Math.abs(((moved-th)*180/Math.PI+540)%360-180);
   expect(off,`roll ${(roll*180/Math.PI).toFixed(0)} deg, drag ${k*45} deg`).toBeLessThan(2);
   const up=rotate(next,north);
   expect(Math.atan2(-up[0],up[1])).toBeCloseTo(roll,6);
  }
 }
});
it('with no roll it is exactly the north-up drag live has',()=>{
 const q=northUpDrag([0,0,0,1],[0,1,0],10,20,150);
 expect(rolledDrag(q,[0,1,0],12,-7,150,0)).toEqual(northUpDrag(q,[0,1,0],12,-7,150));
});
