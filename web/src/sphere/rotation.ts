import {cross,dot,scale,unit,type V3} from './geometry.js';
export type Quat=readonly[number,number,number,number];
export const normalise=(q:Quat):Quat=>{const n=Math.hypot(...q)||1;return[q[0]/n,q[1]/n,q[2]/n,q[3]/n];};
export const multiply=(a:Quat,b:Quat):Quat=>normalise([
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
]);
export const inverse=(q:Quat):Quat=>[-q[0],-q[1],-q[2],q[3]];
export const rotate=(q:Quat,p:V3):V3=>{
  const u:V3=[q[0],q[1],q[2]],t=scale(cross(u,p),2),v=cross(u,t);
  return[p[0]+q[3]*t[0]+v[0],p[1]+q[3]*t[1]+v[1],p[2]+q[3]*t[2]+v[2]];
};
export const arcQuat=(a:V3,b:V3):Quat=>{
  const d=dot(a,b);
  if(d<-.999999){const axis=unit(cross(a,Math.abs(a[0])<.8?[1,0,0]:[0,1,0]));return[...axis,0];}
  return normalise([...cross(a,b),1+d]);
};
export const slerp=(a:Quat,b:Quat,t:number):Quat=>{
  let end=b,d=a.reduce((sum,x,i)=>sum+x*b[i]!,0);
  if(d<0){d=-d;end=b.map(x=>-x) as unknown as Quat;}
  if(d>.9995)return normalise(a.map((x,i)=>x+(end[i]!-x)*t) as unknown as Quat);
  const angle=Math.acos(Math.min(1,d)),sin=Math.sin(angle);
  return a.map((x,i)=>(x*Math.sin((1-t)*angle)+end[i]!*Math.sin(t*angle))/sin) as unknown as Quat;
};
export const trackball=(x:number,y:number,radius:number):V3=>{
  const nx=x/radius,ny=-y/radius,d=nx*nx+ny*ny;
  return unit([nx,ny,d<=.5?Math.sqrt(1-d):.5/Math.sqrt(d)]);
};
