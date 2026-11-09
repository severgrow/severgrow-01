/**
 * Read layout as it will be once `el`'s running animations have finished (the board's entrance lifts
 * and scales it): each animation is jumped to its end for the reading and put back at once, inside
 * the same task, so nothing is ever painted in between. Things placed from this reading land where the
 * element comes to REST, never where it happened to be mid-entrance (owner, 2026-11-09: the board
 * "drops just as the game starts"; the ritual emblem "doesn't always end up in the middle tile").
 */
export function measureAtRest<T>(el: Element | null | undefined, read: () => T): T {
  return atRest(typeof el?.getAnimations === 'function' ? el.getAnimations() : [], read);
}

/**
 * The same for a whole screen: every running animation on `root` or anything inside it (the menu's
 * arrival moves its logo and keys). Nothing is touched when none is running, the usual case.
 */
export function measureAtRestWithin<T>(root: Element | null | undefined, read: () => T): T {
  if (!root || typeof document === 'undefined' || typeof document.getAnimations !== 'function') return read();
  const running = document.getAnimations().filter((a) => {
    const target = (a.effect as KeyframeEffect | null)?.target;
    return !!target && (target === root || root.contains(target));
  });
  return atRest(running, read);
}

function atRest<T>(running: readonly Animation[], read: () => T): T {
  if (!running.length) return read();
  const saved = running.map((a) => [a, a.currentTime] as const);
  for (const [a] of saved) {
    const end = a.effect?.getComputedTiming().endTime;
    if (typeof end === 'number' && Number.isFinite(end)) a.currentTime = end;
  }
  try {
    return read();
  } finally {
    for (const [a, t] of saved) a.currentTime = t;
  }
}
