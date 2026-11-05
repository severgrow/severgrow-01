import { INTERFACE_MOTION } from '../ui/interface-motion.js';
const beats = new WeakMap<Element, Animation>();
/** One compositor acknowledgement after a cosmetic swap. No geometry motion or frame loop. */
export function settleWorldMaterial(target: Element, motion: boolean): void {
  beats.get(target)?.cancel(); beats.delete(target);
  if (!motion) return;
  const beat=target.animate([{opacity:.92},{opacity:1}],{
    duration:INTERFACE_MOTION.open,easing:INTERFACE_MOTION.easeOpen,
  });
  beat.id='world-material-settle';beats.set(target,beat);
}
