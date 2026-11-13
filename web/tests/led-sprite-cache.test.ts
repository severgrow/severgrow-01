import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
beforeEach(()=>{
 vi.resetModules();vi.stubGlobal('window',{devicePixelRatio:3});
 const gradient={addColorStop:vi.fn()};
 const context=new Proxy({createRadialGradient:()=>gradient},{get(target,key){return key in target?target[key as keyof typeof target]:vi.fn();},set(){return true;}});
 vi.stubGlobal('document',{createElement:()=>({width:300,height:150,style:{},getContext:()=>context})});
});
afterEach(()=>vi.unstubAllGlobals());
describe('bounded LED material reuse',()=>{
 it('reuses the exact baked glow and brightness for a repeated caption',async()=>{
  const led=await import('../src/player/led-cells.js');
  const bloom=led.ledBloomSprite('DRAW'), hot=led.ledHotSprite('DRAW');
  expect(led.ledBloomSprite('DRAW')).toBe(bloom);expect(led.ledHotSprite('DRAW')).toBe(hot);
  expect(led.ledSpriteCacheStats()).toMatchObject({entries:2,hits:2});
 });
 it('never substitutes a different tone, scale, marquee span, repeat mode or density',async()=>{
  const led=await import('../src/player/led-cells.js');const plain=led.ledHotSprite('DRAW');
  expect(led.ledHotSprite('DRAW',false,'red')).not.toBe(plain);
  expect(led.ledHotSprite('DRAW',false,'amber',2)).not.toBe(plain);
  expect(led.ledHotSprite('DRAW',false,'amber',1,240)).not.toBe(plain);
  expect(led.ledHotSprite('DRAW',true)).not.toBe(plain);
  (window as unknown as {devicePixelRatio:number}).devicePixelRatio=1;
  expect(led.ledHotSprite('DRAW')).not.toBe(plain);
 });
 it('caps both entry count and bitmap bytes over a long run without clearing retained motif frames',async()=>{
  const led=await import('../src/player/led-cells.js'),retained=led.ledHotSprite('DRAW')!;
  const w=retained.canvas.width;
  for(let i=0;i<200;i++){led.ledBloomSprite(`${i}:9`);led.ledHotSprite(`${i}:9`);}
  const stats=led.ledSpriteCacheStats();expect(stats.entries).toBeLessThanOrEqual(24);expect(stats.bytes).toBeLessThanOrEqual(2*1024*1024);
  expect(retained.canvas.width).toBe(w);
 });
});
