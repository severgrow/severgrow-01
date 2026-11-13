import {describe,expect,it,vi} from 'vitest';
import {PlanetRenderer,scissorFor} from '../src/sphere/renderer.js';

describe('Planet visible-pixel budget',()=>{
 it('covers every visible fractional CSS pixel with bottom-left WebGL coordinates',()=>{
  expect(scissorFor({x:16.25,y:102.25,width:357.5,height:725.5},780,1688,2)).toEqual([32,32,716,1452]);
 });
 it('clamps overscroll and transitions to the drawing buffer without shrinking the projection',()=>{
  expect(scissorFor({x:-100,y:-20,width:1000,height:1000},780,1688,2)).toEqual([0,0,780,1688]);
  expect(scissorFor({x:900,y:0,width:20,height:20},780,1688,2)).toEqual([780,1648,0,40]);
 });
 it('does not reallocate a drawing buffer when ResizeObserver reports the same dimensions',()=>{
  const resizeWidth=vi.fn(),resizeHeight=vi.fn();
  const canvas={get width(){return 200;},set width(v:number){resizeWidth(v);},get height(){return 300;},set height(v:number){resizeHeight(v);}};
  const renderer=Object.assign(Object.create(PlanetRenderer.prototype),{canvas});
  renderer.resize(200,300);
  expect(resizeWidth).not.toHaveBeenCalled();expect(resizeHeight).not.toHaveBeenCalled();
 });
});
