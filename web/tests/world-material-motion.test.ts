import { expect, it, vi } from 'vitest';
import { INTERFACE_MOTION } from '../src/ui/interface-motion.js';
import { settleWorldMaterial } from '../src/worlds/motion.js';

it('settles a material once without moving geometry or retaining a filled animation', () => {
  const animate=vi.fn(()=>({cancel:vi.fn()}));
  settleWorldMaterial({animate} as unknown as Element,true);
  const [frames,options]=animate.mock.calls[0]! as unknown as [Keyframe[],KeyframeAnimationOptions];
  expect(frames).toEqual([{opacity:.92},{opacity:1}]);
  expect(options).toMatchObject({duration:INTERFACE_MOTION.open});
  expect(options.fill).toBeUndefined();
});
it('a rapid replacement cancels the previous beat and reduced motion cancels without restarting', () => {
  const cancel=vi.fn(),animate=vi.fn(()=>({cancel})),target={animate} as unknown as Element;
  settleWorldMaterial(target,true);settleWorldMaterial(target,true);
  expect(cancel).toHaveBeenCalledOnce();
  settleWorldMaterial(target,false);
  expect(cancel).toHaveBeenCalledTimes(2);expect(animate).toHaveBeenCalledTimes(2);
});
