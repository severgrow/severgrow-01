import { expect,it } from 'vitest';
import { arcQuat,inverse,rotate,slerp,type Quat } from '../src/sphere/rotation.js';
import { unit } from '../src/sphere/geometry.js';
import { uprightTarget,northUpDrag,NORTH_PITCH_LIMIT,coastGain,coastStep } from '../src/sphere/upright.js';
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
