import { expect, it } from 'vitest';
import { buildSphere, pickCell, dot, cross, sub, scale, unit } from '../src/sphere/geometry.js';
import { arcQuat, rotate, multiply, slerp, type Quat } from '../src/sphere/rotation.js';
import { mockOwnership } from '../src/sphere/ownership.js';

it('frequency-10 geodesic dual closes with exactly 990 hexagons and 12 pentagons',()=>{
  const s=buildSphere();
  expect(s.cells).toHaveLength(1002);expect(s.corners).toHaveLength(2000);expect(s.edges).toHaveLength(3000);
  expect(s.cells.filter(c=>c.corners.length===5)).toHaveLength(12);
  expect(s.cells.filter(c=>c.corners.length===6)).toHaveLength(990);
  expect(new Set(s.cells.map(c=>c.id)).size).toBe(1002);
  expect(s.corners.length-s.edges.length+s.cells.length).toBe(2);
  const edges=new Map<string,number>();
  let area=0;
  for(const c of s.cells){
    expect(c.neighbours).toHaveLength(c.corners.length);
    for(const n of c.neighbours)expect(s.cells[n]!.neighbours).toContain(c.index);
    for(let i=0;i<c.corners.length;i++){
      const a=c.corners[i]!, b=c.corners[(i+1)%c.corners.length]!;
      const key=[a,b].sort((x,y)=>x-y).join(':');edges.set(key,(edges.get(key)??0)+1);
      const p=s.corners[a]!,q=s.corners[b]!;
      expect(dot(cross(p,q),c.centre)).toBeGreaterThan(0);
      area+=2*Math.atan2(dot(c.centre,cross(p,q)),1+dot(c.centre,p)+dot(p,q)+dot(q,c.centre));
    }
  }
  expect([...edges.values()].every(n=>n===2)).toBe(true);
  expect(area).toBeCloseTo(4*Math.PI,8);
  const seen=new Set([0]),queue=[0];
  for(const id of queue)for(const n of s.cells[id]!.neighbours)if(!seen.has(n)){seen.add(n);queue.push(n);}
  expect(seen.size).toBe(1002);
});

it('picks the actual closest triangles, including every pentagon, and ignores sea and hidden faces',()=>{
  const s=buildSphere();
  for(const cell of s.cells.filter(c=>c.corners.length===5))
    expect(pickCell(s,scale(cell.centre,4),scale(cell.centre,-1))).toBe(cell.index);
  expect(pickCell(s,[0,0,4],unit([3,0,-1]))).toBeNull();
  const front=pickCell(s,[0,0,4],[0,0,-1]);
  expect(front).not.toBeNull();expect(s.cells[front!]!.centre[2]).toBeGreaterThan(0);
  // A sample inside each polygon stays that cell, including at a tilted horizon.
  for(const cell of s.cells.filter((_,i)=>i%17===0)){
    const target=unit(sub(scale(cell.centre,3),scale(s.corners[cell.corners[0]!]!,1)));
    expect(pickCell(s,scale(target,4),unit(sub(cell.centre,scale(target,4))))).toBe(cell.index);
  }
});

it('trackball quaternions stay stable through poles, antipodes and shortest-path home returns',()=>{
  let q:Quat=[0,0,0,1];
  expect(rotate(arcQuat([0,0,1],[0,0,-1]),[0,0,1])[2]).toBeCloseTo(-1);
  for(let i=0;i<360;i++){
    const step=arcQuat([0,0,1],unit([.04,.015,1]));
    q=multiply(step,q);
  }
  expect(Math.hypot(...q)).toBeCloseTo(1,10);
  const home=arcQuat([0,1,0],[0,0,1]);
  const mid=slerp([0,0,0,1],home,.5);
  expect(rotate(mid,[0,1,0])[2]).toBeGreaterThan(0);
  expect(rotate(slerp(home,home.map(x=>-x) as unknown as Quat,.5),[0,1,0])[2]).toBeCloseTo(1);
});

it('mock ownership is deterministic, clustered, and includes separate outposts without any backend',()=>{
 const sphere=buildSphere(),a=mockOwnership(sphere),b=mockOwnership(sphere);
 expect([...a.owners]).toEqual([...b.owners]);expect(a.connected).toBeGreaterThan(50);
 expect([...a.owners].filter(x=>x===0).length).toBeGreaterThan(a.connected);
 for(const owner of [0,1,2,3,4,-1,-2])expect([...a.owners]).toContain(owner);
 expect(Math.hypot(...a.home)).toBeCloseTo(1);
});
