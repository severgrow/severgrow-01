import { expect,it } from 'vitest';
import { outlinePath } from '../src/ui/outline.js';
it('joins shuffled edges into a closed silhouette without individual stroke seams',()=>{
 const a=[0,0] as const,b=[10,0] as const,c=[10,10] as const,d=[0,10] as const;
 const path=outlinePath([[c,d],[a,b],[d,a],[b,c]]);
 expect(path.match(/M/g)).toHaveLength(1);expect(path.match(/Z/g)).toHaveLength(1);
 expect(path.match(/L/g)).toHaveLength(3);
});
it('retains separate closed islands and tolerates shared-corner floating point rounding',()=>{
 const path=outlinePath([[[0,0],[1,0]],[[1.000001,0],[0,1]],[[0,1],[0,0]],
  [[3,0],[4,0]],[[4,0],[3,1]],[[3,1],[3,0]]]);
 expect(path.match(/M/g)).toHaveLength(2);expect(path.match(/Z/g)).toHaveLength(2);
 expect(outlinePath([])).toBe('');
});

it('joins shared corners on the axes despite floating point negative zero',()=>{
 const path=outlinePath([[[0,0],[1,0]],[
  [1,-.000001],[0,1]],[[.000001,1],[-.000001,.000001]]]);
 expect(path.match(/M/g)).toHaveLength(1);expect(path.match(/Z/g)).toHaveLength(1);
});

it('welds the two subpixel versions of a shared projected corner',()=>{
 const path=outlinePath([[[0,0],[10,0]],[[10,.06],[10,10]],[[10.06,10],[0,10]],[[0,10.06],[.06,0]]]);
 expect(path.match(/M/g)).toHaveLength(1);expect(path.match(/Z/g)).toHaveLength(1);
});
