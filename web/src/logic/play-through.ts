// PLAY THROUGH (owner, 2026-11-06): "the animation plays but never gets in the way of playing the
// game". While only the player's OWN move is still being shown, their input stays live and the
// animation keeps playing; new moves queue up behind it. Any opponent step still to be shown keeps
// the old rule (it is seen first; a tap skips it). Pure: the page asks it with its queue.
import type { Player } from '../../../src/engine/index.js';
import type { Step } from './anim.js';
import { actorOf } from './opponent.js';

export const playsThrough = (pending: readonly Step[], current: Step | null, me: Player): boolean => {
  const all = current ? [current, ...pending] : pending;
  if (!all.length) return false;
  return all.every((s) => {
    const by = actorOf(s);
    return by === null || by === me;
  });
};
