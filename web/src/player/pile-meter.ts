/** Two tiny mechanical drums. Counts still come from the current View; keeping each
 * window mounted prevents unrelated board renders from restarting a turn. */
const running = new WeakMap<HTMLElement, Animation>();
const observed = new WeakSet<Document>();
const observeVisibility = () => {
  const doc = document;
  if (observed.has(doc)) return;
  observed.add(doc);
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) for (const window of doc.querySelectorAll<HTMLElement>('.pile-meter-window')) running.get(window)?.finish();
  });
};

export function renderPileMeter(host: HTMLElement, count: number) {
  observeVisibility();
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
  const still = document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.classList.contains('reduce-motion');
  [...host.querySelectorAll<HTMLElement>('.pile-meter-window')].forEach((window, index) => {
    if (previous[index] === next[index]) return;
    running.get(window)?.cancel();
    running.delete(window);
    window.replaceChildren();
    if (still || Math.abs(count - Number(previous)) > 2) { window.append(face(next[index]!)); return; }
    const drum = document.createElement('span');
    drum.className = 'pile-meter-drum';
    if (decreasing) drum.append(face(next[index]!), face(previous[index]!));
    else drum.append(face(previous[index]!), face(next[index]!));
    window.append(drum);
    // Two equal faces: percentage travel stays exact through zoom/parent transforms, and
    // needs no synchronous layout read after replacing the drum's children.
    const start = decreasing ? -50 : 0, end = decreasing ? 0 : -50;
    const delay = index === 0 ? 95 : 0; // the carry catches the tens wheel a beat later
    const animation = drum.animate([
      { transform: `translateY(${start}%)`, offset: 0 },
      { transform: `translateY(${start + (end - start) * .83}%)`, offset: .73 },
      { transform: `translateY(calc(${end}% ${decreasing ? '+' : '-'} .65px))`, offset: .93 },
      { transform: `translateY(${end}%)`, offset: 1 },
    ], { duration: index === 0 ? 720 : 620, delay, easing: 'cubic-bezier(.23,.55,.35,1)', fill: 'forwards' });
    running.set(window, animation);
    void animation.finished.then(() => {
      if (running.get(window) !== animation) return;
      running.delete(window);
      window.replaceChildren(face(next[index]!));
      animation.cancel();
    }).catch(() => {});
  });
}
