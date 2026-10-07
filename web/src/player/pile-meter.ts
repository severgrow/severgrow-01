/** A two-wheel readout for Test2 piles. It is presentation only; the count still comes
 * from the current View on every render. Reusing the wheels avoids restarting them on
 * unrelated board renders. */
export function renderPileMeter(host: HTMLElement, count: number) {
  const next = String(Math.max(0, Math.min(99, count))).padStart(2, '0');
  if (!host.classList.contains('pile-meter')) {
    host.classList.add('pile-meter');
    host.replaceChildren(...[0, 1].map(index => {
      const window = document.createElement('span');
      window.className = 'pile-meter-window';
      const face = document.createElement('span');
      face.className = 'pile-meter-face';
      face.textContent = next[index]!;
      window.append(face);
      return window;
    }));
    host.dataset.value = next;
    return;
  }
  if (host.dataset.value === next) return;
  const previous = host.dataset.value ?? next;
  host.dataset.value = next;
  const direction = count < Number(previous) ? 1 : -1;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.classList.contains('reduce-motion');
  [...host.querySelectorAll<HTMLElement>('.pile-meter-window')].forEach((window, index) => {
    if (previous[index] === next[index]) return;
    window.getAnimations().forEach(animation => animation.cancel());
    window.replaceChildren();
    const oldFace = document.createElement('span');
    oldFace.className = 'pile-meter-face';
    oldFace.textContent = previous[index]!;
    const newFace = document.createElement('span');
    newFace.className = 'pile-meter-face pile-meter-arriving';
    newFace.textContent = next[index]!;
    window.append(oldFace, newFace);
    if (still) { window.replaceChildren(newFace); return; }
    const travel = window.getBoundingClientRect().height;
    newFace.style.transform = `translateY(${-direction * travel}px)`;
    const duration = index === 0 ? 620 : 480;
    const first = oldFace.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${direction * travel}px)` }],
      { duration, easing: 'cubic-bezier(.23,.67,.28,1)', fill: 'forwards' });
    const second = newFace.animate([{ transform: `translateY(${-direction * travel}px)` }, { transform: 'translateY(0)' }],
      { duration, easing: 'cubic-bezier(.23,.67,.28,1)', fill: 'forwards' });
    second.onfinish = () => {
      if (host.dataset.value !== next) return;
      first.cancel(); second.cancel(); newFace.style.transform = '';
      window.replaceChildren(newFace);
    };
  });
}
