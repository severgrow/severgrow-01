import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

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
