import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('enchanted field paths repeat with the same height and tangent at the atlas seam', () => {
  const svg=readFileSync(new URL('../src/assets/worlds/magic-fields.svg',import.meta.url),'utf8');
  const paths=[...svg.matchAll(/<path d="([^"]+)"[^>]*stroke="#77798a"/g)];
  expect(paths).toHaveLength(24);
  for(const path of paths){
    // Q followed by two reflected T curves: a full period is two equal horizontal spans.
    // Matching all endpoint heights makes the third curve a translated copy of the first.
    const v=path[1]!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(v[1]).toBe(v[5]);expect(v[5]).toBe(v[7]);expect(v[7]).toBe(v[9]);
    expect(v[4]!-v[0]!).toBe(v[6]!-v[4]!);
    expect(v[6]!-v[4]!).toBe(v[8]!-v[6]!);
  }
});

it('basalt plate junctions line up on both repeated atlas boundaries', () => {
  const svg=readFileSync(new URL('../src/assets/worlds/volcanic.svg',import.meta.url),'utf8');
  const points:[number,number][]=[];
  for(const match of svg.matchAll(/<path d="([^"]+)" fill="rgb/g)){
    const values=match[1]!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const polygon=Array.from({length:4},(_,i)=>[values[i*2]!,values[i*2+1]!] as const);
    const cx=polygon.reduce((v,p)=>v+p[0],0)/4,cy=polygon.reduce((v,p)=>v+p[1],0)/4;
    // Recover the shared junction from the 4% grout inset, allowing SVG coordinate rounding.
    for(const [x,y] of polygon)points.push([cx+(x-cx)/.96,cy+(y-cy)/.96]);
  }
  expect(points.length).toBe(64*4);
  const edge=(axis:0|1,value:number)=>points.filter(p=>Math.abs(p[axis]-value)<.1).map(p=>p[1-axis]!).sort((a,b)=>a-b).filter((p,i,all)=>i===0||p-all[i-1]!>.1);
  for(const axis of [0,1] as const){
    const a=edge(axis,0),b=edge(axis,240);expect(a).toHaveLength(9);expect(b).toHaveLength(9);
    a.forEach((point,i)=>expect(point).toBeCloseTo(b[i]!,1));
  }
});

it('ships lossless baked atlases made from the current authoring recipes', async () => {
  const { createHash } = await import('node:crypto');
  const base=new URL('../src/assets/worlds/',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('materials.json',base),'utf8')) as {recipe:string;files:Record<string,{svg:string;webp:string}>};
  expect(manifest.recipe).toBe('768px-lossless-webp-v1');
  expect(Object.keys(manifest.files)).toEqual(['ocean','forest','magic-fields','volcanic']);
  for(const [name,hashes] of Object.entries(manifest.files)) for(const ext of ['svg','webp'] as const){
    const data=readFileSync(new URL(`${name}.${ext}`,base));
    expect(createHash('sha256').update(data).digest('hex')).toBe(hashes[ext]);
    if(ext==='webp')expect(data.subarray(8,12).toString()).toBe('WEBP');
  }
});
