import { multiply,rotate,type Quat } from './rotation.js';
import { cross,dot,unit,type V3 } from './geometry.js';
/** Align during an anchored zoom step, preserving the ground under the pointer/fingers.
 * This is never scheduled after release. Geographic up is undefined at a pole, so hold heading
 * when no upright anchored solution exists inside that small cap. */
export function uprightTarget(q:Quat,north:V3,pivot?:V3):Quat {
  const up=rotate(q,north);
  if(Math.hypot(up[0],up[1])<.15)return q;
  if(!pivot){
    const angle=Math.atan2(up[0],up[1]);
    if(Math.abs(angle)<1e-8)return q;
    return multiply([0,0,Math.sin(angle/2),Math.cos(angle/2)],q);
  }
  if(Math.abs(up[0])<1e-8&&up[1]>0)return q;
  const axis=unit(pivot),parallel=dot(axis,up),c=axis[0]*parallel;
  const a=up[0]-c,b=cross(axis,up)[0],radius=Math.hypot(a,b);
  // Rodrigues' formula: the rotated north's x = a*cos(t) + b*sin(t) + c.
  // At an extreme horizon/pole an upright solution may not exist without losing the anchor.
  if(radius<1e-8||Math.abs(c)>radius)return q;
  const phase=Math.atan2(b,a),offset=Math.acos(Math.max(-1,Math.min(1,-c/radius)));
  let best=q,least=Infinity;
  for(const root of [phase-offset,phase+offset]){
    const angle=Math.atan2(Math.sin(root),Math.cos(root)),s=Math.sin(angle/2);
    const candidate=multiply([axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(angle/2)],q);
    if(rotate(candidate,north)[1]>.15&&Math.abs(angle)<least){best=candidate;least=Math.abs(angle);}
  }
  return best;
}

/** Geographic drag: longitude wraps freely; latitude gently resists near the poles. Every
 * returned pose is already upright. Releasing input needs no correction, timer or inertia. */
export const NORTH_PITCH_LIMIT=Math.PI/2-.16;
export function northUpDrag(q:Quat,north:V3,dx:number,dy:number,radius:number):Quat {
  const up=rotate(q,north),roll=Math.atan2(up[0],up[1]);
  const flat=multiply([0,0,Math.sin(roll/2),Math.cos(roll/2)],q);
  const pitch=Math.atan2(up[2],Math.hypot(up[0],up[1]));
  const gain=Math.SQRT1_2/Math.max(1,radius);
  let delta=dy*gain;
  if(delta*pitch>0)delta*=Math.min(1,Math.max(.08,(NORTH_PITCH_LIMIT-Math.abs(pitch))/.2));
  const target=Math.max(-NORTH_PITCH_LIMIT,Math.min(NORTH_PITCH_LIMIT,pitch+delta));
  const yaw=dx*gain,s=Math.sin(yaw/2),axis=unit(north),tilt=(target-pitch)/2;
  return multiply([Math.sin(tilt),0,0,Math.cos(tilt)],multiply(flat,[axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(yaw/2)]));
}
