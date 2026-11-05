/** PLAY is immediate; the already-mounted world quietly leaves behind it. No timers or render loop. */
export function mountPlayBackdrop(target: HTMLElement, release: () => void) {
  let beat: Animation | null = null;
  let epoch = 0;
  const cancel = () => { epoch++; beat?.cancel(); beat = null; };
  return {
    active: () => beat !== null,
    cancel,
    start(motion: boolean) {
      if (beat) return;
      if (!motion) { release(); return; }
      const generation = ++epoch;
      beat = target.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 1500, easing: 'cubic-bezier(.2,0,.2,1)', fill: 'both',
      });
      beat.id = 'play-world-fade';
      beat.finished.then(() => {
        if (generation !== epoch) return;
        // Hide before cancelling the retained last frame: never flash the old world back on.
        release(); cancel();
      }).catch(() => undefined);
    },
  };
}
