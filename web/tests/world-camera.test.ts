import { describe, expect, it } from 'vitest';
import { lastCamera, lastChosenCamera, rememberCamera, CAMERA_KEY } from '../src/online/world-camera.js';
const store=()=>{const data=new Map<string,string>();return {data,kv:{get:(k:string)=>data.get(k)??null,set:(k:string,v:string)=>{data.set(k,v);return true;},remove:(k:string)=>{data.delete(k);return true;}}};};
describe('Territory camera memory',()=>{
  it('restores a deliberate view without changing it or mixing world versions',()=>{
    const {kv}=store();rememberCamera(kv,3,[-20,-10,50,80],true);
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
    expect(()=>rememberCamera(kv,3,[0,0,20,30],true)).not.toThrow();expect(lastCamera(kv,3)).toBeNull();
  });
});
// ONLY A GESTURE IS A CAMERA (owner, 2026-11-02: the anchor "works once and then stops"). Every
// close used to store whatever frame was on screen; the next open read it back as deliberate and
// skipped the menu anchor. The stored record now carries provenance, and a record written by an
// older build — which has no flag — is AUTOMATIC by definition.
describe('a remembered frame knows whether the player chose it',()=>{
  it('only a frame stored as chosen can outrank the menu anchor',()=>{
    const {kv}=store();
    rememberCamera(kv,3,[-20,-10,50,80],true);
    expect(lastChosenCamera(kv,3)).toEqual([-20,-10,50,80]);
  });
  it('an automatic frame is remembered for its world but never as a camera',()=>{
    const {kv}=store();
    rememberCamera(kv,3,[-20,-10,50,80],false);
    expect(lastCamera(kv,3)).toEqual([-20,-10,50,80]);
    expect(lastChosenCamera(kv,3)).toBeNull();
  });
  it('a record from build 1528bc3 (no flag) is automatic, so the anchor still applies',()=>{
    const {kv,data}=store();
    data.set(CAMERA_KEY,JSON.stringify({version:3,box:[-20,-10,50,80]}));
    expect(lastCamera(kv,3)).toEqual([-20,-10,50,80]);
    expect(lastChosenCamera(kv,3)).toBeNull();
  });
  it('writes the flag, so a genuine camera survives a reload',()=>{
    const {kv,data}=store();
    rememberCamera(kv,3,[-20,-10,50,80],true);
    expect(JSON.parse(data.get(CAMERA_KEY)!).manual).toBe(true);
  });
});
