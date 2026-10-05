// Place phone teaching panels in actual screen space, avoiding playable hexes and homes.
// This changes presentation only; no move or target is suppressed.
export const placeTeachingPanel = (panel: HTMLElement, targetKeys: Iterable<string>) => {
  panel.style.removeProperty('position'); panel.style.removeProperty('left');
  panel.style.removeProperty('width');
  panel.style.removeProperty('top'); panel.style.removeProperty('bottom');
  if (panel.hidden || !document.documentElement.dataset.thumb) return;
  const wrap = document.getElementById('board-wrap');
  if (!wrap) return;
  const bounds = wrap.getBoundingClientRect();
  let r = panel.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const avoid = [...document.querySelectorAll('#board .landmark, #step-cue')].map(e=>e.getBoundingClientRect());
  for (const key of targetKeys) {
    const el = document.querySelector(`#board .hex-cell[data-key="${key}"]`);
    if (el) avoid.push(el.getBoundingClientRect());
  }
  const collision = (x: number, y: number) => avoid.some(a=>a.width && x < a.right + 4 && x + r.width > a.left - 4 && y < a.bottom + 4 && y + r.height > a.top - 4);
  if (!collision(r.left, r.top)) return;
  const under = parseFloat(getComputedStyle(wrap).getPropertyValue('--cam-under')) || 0;
  for (const width of [r.width, Math.min(r.width, 140)]) {
  panel.style.width = `${width}px`; r = panel.getBoundingClientRect();
  const maxY = bounds.bottom - under - r.height - 8;
  for (let y = bounds.top + 8; y <= maxY; y += 8) {
    for (const x of [bounds.left + 8, bounds.right - r.width - 8, bounds.left + (bounds.width-r.width)/2]) {
      if (x < 0 || x + r.width > innerWidth || collision(x,y)) continue;
      panel.style.position = 'fixed'; panel.style.left = `${x}px`;
      panel.style.top = `${y}px`; panel.style.bottom = 'auto';
      return;
    }
  }
  }
};
