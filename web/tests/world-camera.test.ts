import { describe, expect, it } from 'vitest';
import { lastCamera, rememberCamera, CAMERA_KEY } from '../src/online/world-camera.js';
const store=()=>{const data=new Map<string,string>();return {data,kv:{get:(k:string)=>data.get(k)??null,set:(k:string,v:string)=>{data.set(k,v);return true;},remove:(k:string)=>{data.delete(k);return true;}}};};
describe('Territory camera memory',()=>{
  it('restores a deliberate view without changing it or mixing world versions',()=>{
    const {kv}=store();rememberCamera(kv,3,[-20,-10,50,80]);
    expect(lastCamera(kv,3)).toEqual([-20,-10,50,80]);expect(lastCamera(kv,4)).toBeNull();
  });
  it('ignores corrupt, degenerate and unbounded views',()=>{
    const {kv,data}=store();
    for(const box of [[0,0,0,1],[0,0,-2,1],[0,0,1e20,1],[0,0,1],[null,0,10,10]]){
      data.set(CAMERA_KEY,JSON.stringify({version:3,box}));expect(lastCamera(kv,3)).toBeNull();
    }
    data.set(CAMERA_KEY,'bad json');expect(lastCamera(kv,3)).toBeNull();
  });
  it('keeps navigation usable when storage is blocked',()=>{
    const kv={get:()=>{throw Error('blocked');},set:()=>{throw Error('blocked');},remove:()=>true};
    expect(()=>rememberCamera(kv,3,[0,0,20,30])).not.toThrow();expect(lastCamera(kv,3)).toBeNull();
  });
});
