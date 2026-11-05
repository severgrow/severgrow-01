import { multiply,rotate,type Quat } from './rotation.js';
import { cross,dot,unit,type V3 } from './geometry.js';
/** Drag settles about the viewing axis, preserving the centre. Zoom instead settles about its
 * anchored surface point, preserving the ground under the pointer/fingers through the whole
 * interpolation. Geographic up is undefined at a pole, so hold heading inside that small cap. */
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
