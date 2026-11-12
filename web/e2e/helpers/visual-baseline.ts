import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Page} from 'playwright-core';

type Sample={width:number;height:number;rgb:number[]};
const path=resolve('web/e2e/baselines/intel.json');
const baseline:Record<string,Sample>=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{};
/** Compare broad composition/material changes without depending on subpixel font rasterisation.
 * Full-size PNGs are retained by CI for human inspection; geometry/text assertions remain separate.
 * Updating requires an explicit command and review of the full-size screenshots. Never auto-bless.
 */
export async function checkVisual(page:Page,key:string,png:Buffer):Promise<void>{
 const sample=await page.evaluate(async data=>{
  const img=new Image();img.src=`data:image/png;base64,${data}`;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=24;
  const ctx=canvas.getContext('2d')!;ctx.drawImage(img,0,0,24,24);
  const pixels=ctx.getImageData(0,0,24,24).data,rgb:number[]=[];
  for(let i=0;i<pixels.length;i++)if(i%4!==3)rgb.push(pixels[i]!);
  return {width:img.naturalWidth,height:img.naturalHeight,rgb};
 },png.toString('base64'));
 if(process.env.UPDATE_VISUAL_BASELINE==='1'){
  baseline[key]=sample;writeFileSync(path,JSON.stringify(baseline)+'\n');return;
 }
 const expected=baseline[key];assert(expected,`Missing reviewed visual baseline: ${key}`);
 assert.equal(sample.width,expected.width);assert.equal(sample.height,expected.height);
 const delta=sample.rgb.map((value,i)=>Math.abs(value-expected.rgb[i]!));
 const mean=delta.reduce((sum,n)=>sum+n,0)/delta.length;
 const p99=[...delta].sort((a,b)=>a-b)[Math.floor(delta.length*.99)]!;
 assert(mean<=8&&p99<=42,`${key}: visual composition changed (mean ${mean.toFixed(2)}, p99 ${p99}); inspect full-size captures before intentionally updating`);
}
