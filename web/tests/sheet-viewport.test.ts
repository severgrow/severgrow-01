import { describe, expect, it } from 'vitest';
import { sheetViewport } from '../src/ui/sheet-viewport.js';
describe('shared visual-viewport sheets',()=>{
  it('centres inside the visible area above a phone keyboard',()=>expect(sheetViewport(120,340)).toEqual({top:120,centre:290,height:340,maxHeight:308}));
  it('leaves room for safe-area padding and can shrink on short screens',()=>expect(sheetViewport(0,60,20,24)).toEqual({top:0,centre:28,height:60,maxHeight:16}));
  it('never emits invalid dimensions from transient viewport readings',()=>{const v=sheetViewport(NaN,Infinity);expect(Object.values(v).every(Number.isFinite)).toBe(true);expect(v.height).toBeGreaterThan(0);});
});
