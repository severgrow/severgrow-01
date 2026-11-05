import { expect, it } from 'vitest';
import { spacePath } from '../src/player/space-path.js';
it('keeps drift bounded, monotonic and exactly continuous across cached redraws', () => {
  expect(spacePath(0)).toEqual({x:0,y:0}); expect(spacePath(1)).toEqual({x:1,y:1});
  let last=spacePath(0);
  for(let i=1;i<=100;i++) { const next=spacePath(i/100); expect(next.x).toBeGreaterThanOrEqual(last.x); expect(next.y).toBeGreaterThanOrEqual(last.y); last=next; }
  expect(spacePath(.25).x).not.toBe(spacePath(.25).y);
});
