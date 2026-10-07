/** Two tiny mechanical drums. Counts still come from the current View; keeping each
 * window mounted prevents unrelated board renders from restarting a turn. */
export function renderPileMeter(host: HTMLElement, count: number) {
  const next = String(Math.max(0, Math.min(99, count))).padStart(2, '0');
  const face = (digit: string) => {
    const el = document.createElement('span');
    el.className = 'pile-meter-face';
    el.textContent = digit;
    return el;
  };
  if (!host.classList.contains('pile-meter')) {
    host.classList.add('pile-meter');
    host.replaceChildren(...[0, 1].map(index => {
      const window = document.createElement('span');
      window.className = 'pile-meter-window';
      window.append(face(next[index]!));
      return window;
    }));
    host.dataset.value = next;
    return;
  }
  if (host.dataset.value === next) return;
  const previous = host.dataset.value ?? next;
  host.dataset.value = next;
  const decreasing = count < Number(previous);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.classList.contains('reduce-motion');
  [...host.querySelectorAll<HTMLElement>('.pile-meter-window')].forEach((window, index) => {
    if (previous[index] === next[index]) return;
    window.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    window.replaceChildren();
    if (still || Math.abs(count - Number(previous)) > 2) { window.append(face(next[index]!)); return; }
    const drum = document.createElement('span');
    drum.className = 'pile-meter-drum';
    if (decreasing) drum.append(face(next[index]!), face(previous[index]!));
    else drum.append(face(previous[index]!), face(next[index]!));
    window.append(drum);
    const travel = window.getBoundingClientRect().height;
    const start = decreasing ? -travel : 0, end = decreasing ? 0 : -travel;
    const delay = index === 0 ? 95 : 0; // the carry catches the tens wheel a beat later
    const animation = drum.animate([
      { transform: `translateY(${start}px)`, offset: 0 },
      { transform: `translateY(${start + (end - start) * .83}px)`, offset: .73 },
      { transform: `translateY(${end + (decreasing ? 1 : -1) * .65}px)`, offset: .93 },
      { transform: `translateY(${end}px)`, offset: 1 },
    ], { duration: index === 0 ? 720 : 620, delay, easing: 'cubic-bezier(.23,.55,.35,1)', fill: 'forwards' });
    void animation.finished.then(() => {
      if (host.dataset.value === next) window.replaceChildren(face(next[index]!));
    }).catch(() => {});
  });
}
