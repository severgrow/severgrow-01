/** Finite compositor-only chat motion. No timers, polling or animation loops. */
export const createChatMotion = (reduced: () => boolean) => {
  const running = new Map<HTMLElement, Animation>();
  const targets = new WeakMap<HTMLElement, boolean>();
  let stopped = false;
  const cancel = (element: HTMLElement) => {
    running.get(element)?.cancel();
    running.delete(element);
  };
  const play = (
    element: HTMLElement,
    frames: Keyframe[],
    duration: number,
    done?: () => void,
  ) => {
    cancel(element);
    if (stopped || reduced()) {
      done?.();
      return;
    }
    const easing =
      getComputedStyle(element).getPropertyValue('--ix-ease-open').trim() ||
      'cubic-bezier(.22,1,.36,1)';
    const animation = element.animate(frames, {
      duration,
      easing,
      fill: 'both',
    });
    running.set(element, animation);
    void animation.finished.then(
      () => {
        if (stopped || running.get(element) !== animation) return;
        running.delete(element);
        done?.();
        animation.cancel(); // release retained effects; base styles own the settled appearance
      },
      () => {
        /* interruption/teardown is intentional */
      },
    );
  };
  return {
    visible(element: HTMLElement, visible: boolean) {
      if (targets.get(element) === visible) return;
      targets.set(element, visible);
      if (element.hidden && !visible) {
        cancel(element);
        return;
      }
      const style = element.hidden ? null : getComputedStyle(element);
      const from = {
        opacity: style?.opacity ?? '0',
        transform: style?.transform ?? 'translateY(4px) scale(.996)',
      };
      element.style.pointerEvents = visible ? '' : 'none';
      element.hidden = false;
      play(
        element,
        [
          from,
          {
            opacity: visible ? 1 : 0,
            transform: visible ? 'none' : 'translateY(3px) scale(.998)',
          },
        ],
        visible ? 150 : 100,
        () => {
          element.hidden = !visible;
        },
      );
    },
    arrival(element: HTMLElement) {
      play(
        element,
        [
          { opacity: 0, transform: 'translateY(3px)' },
          { opacity: 1, transform: 'none' },
        ],
        160,
      );
    },
    unread(element: HTMLElement) {
      play(
        element,
        [
          { opacity: 0.6, transform: 'scale(.85)' },
          { opacity: 1, transform: 'scale(1.35)', offset: 0.45 },
          { opacity: 1, transform: 'scale(1)' },
        ],
        280,
      );
    },
    cancelWithin(parent: HTMLElement) {
      for (const element of running.keys())
        if (parent.contains(element)) cancel(element);
    },
    settle() {
      for (const animation of running.values()) animation.finish();
    },
    stop() {
      stopped = true;
      for (const animation of running.values()) animation.cancel();
      running.clear();
    },
  };
};
