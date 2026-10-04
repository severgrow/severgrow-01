// The Lab (test copy only): pan and pinch-zoom for big boards. Only when the board's tiles are
// drawn smaller than 40pt. Two fingers pan and zoom; one finger on empty space (not on a hex)
// pans; the mouse wheel zooms. It works by changing the board's viewBox, so taps, hit tests and
// painting a Bloom (which all go through the board's screen matrix) keep working while zoomed.
const MIN_TILE = 40;
const HEX_W = Math.sqrt(3) * 30;

type Box = { x: number; y: number; w: number; h: number };

export const installPanZoom = (svg: SVGSVGElement, wrap: HTMLElement) => {
  let base: Box | null = null;
  let view: Box | null = null;
  let mine = '';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'lab-reset-view';
  reset.textContent = 'Reset view';
  reset.hidden = true;
  wrap.appendChild(reset);

  const read = (): Box | null => {
    const v = svg.getAttribute('viewBox')?.split(/\s+/).map(Number);
    return v && v.length === 4 && v.every(Number.isFinite) ? { x: v[0]!, y: v[1]!, w: v[2]!, h: v[3]! } : null;
  };
  const write = (b: Box) => {
    mine = `${b.x.toFixed(2)} ${b.y.toFixed(2)} ${b.w.toFixed(2)} ${b.h.toFixed(2)}`;
    svg.setAttribute('viewBox', mine);
    view = b;
    reset.hidden = !base || Math.abs(b.w - base.w) < 0.5;
  };
  // a new board (or a new layout) sets a fresh viewBox: that is the new "whole board" view
  new MutationObserver(() => {
    // (observer callbacks run later: compare with what we last wrote)
    if (svg.getAttribute('viewBox') === mine) return;
    base = read();
    view = base;
    reset.hidden = true;
  }).observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
  base = read();
  view = base;

  /** The board's tile width on screen at the whole-board view, in CSS px. */
  const baseTile = () => {
    if (!base) return Infinity;
    const r = svg.getBoundingClientRect();
    return Math.min(r.width / base.w, r.height / base.h) * HEX_W;
  };
  const active = () => !!base && baseTile() < MIN_TILE;

  /** Board units per CSS px at the current view. */
  const unit = () => {
    const r = svg.getBoundingClientRect();
    return view ? Math.max(view.w / r.width, view.h / r.height) : 1;
  };
  const toBoard = (cx: number, cy: number) => {
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const clamp = (b: Box): Box => {
    if (!base) return b;
    // never smaller than the whole board, never deeper than tiles of about 3x the minimum
    const maxZoom = Math.max(1, (MIN_TILE * 3) / Math.max(1, baseTile()));
    const w = Math.min(base.w, Math.max(base.w / maxZoom, b.w));
    const h = (b.h / b.w) * w;
    const x = Math.min(base.x + base.w - w, Math.max(base.x, b.x));
    const y = Math.min(base.y + base.h - h, Math.max(base.y, b.y));
    return { x: w >= base.w ? base.x : x, y: h >= base.h ? base.y : y, w, h };
  };
  const zoomAt = (cx: number, cy: number, factor: number) => {
    if (!view) return;
    const p = toBoard(cx, cy);
    const w = view.w / factor;
    const h = view.h / factor;
    write(clamp({ x: p.x - ((p.x - view.x) / view.w) * w, y: p.y - ((p.y - view.y) / view.h) * h, w, h }));
  };
  const panBy = (dx: number, dy: number) => {
    if (!view) return;
    const u = unit();
    write(clamp({ ...view, x: view.x - dx * u, y: view.y - dy * u }));
  };

  reset.addEventListener('click', () => base && write(base));

  const pts = new Map<number, { x: number; y: number }>();
  let gesture = false;
  let last: { cx: number; cy: number; d: number } | null = null;
  const centre = () => {
    const a = [...pts.values()];
    const cx = a.reduce((s, p) => s + p.x, 0) / a.length;
    const cy = a.reduce((s, p) => s + p.y, 0) / a.length;
    const d = a.length > 1 ? Math.hypot(a[0]!.x - a[1]!.x, a[0]!.y - a[1]!.y) : 0;
    return { cx, cy, d };
  };
  const onEmpty = (e: PointerEvent) => !(e.target as Element | null)?.closest?.('[data-key]');

  wrap.addEventListener(
    'pointerdown',
    (e) => {
      if (!active() || e.pointerType === 'mouse') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 || (pts.size === 1 && onEmpty(e))) {
        if (pts.size === 2 && !gesture) {
          // the first finger may have started a tap or a paint: cancel it
          for (const id of pts.keys()) if (id !== e.pointerId) svg.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, bubbles: true }));
        }
        gesture = true;
        last = centre();
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );
  wrap.addEventListener(
    'pointermove',
    (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!gesture || !last) return;
      const c = centre();
      panBy(c.cx - last.cx, c.cy - last.cy);
      if (last.d > 0 && c.d > 0) zoomAt(c.cx, c.cy, c.d / last.d);
      last = c;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
  const end = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (gesture) {
      e.stopPropagation();
      if (pts.size === 0) gesture = false;
      last = pts.size ? centre() : null;
    }
  };
  wrap.addEventListener('pointerup', end, true);
  wrap.addEventListener('pointercancel', end, true);
  wrap.addEventListener(
    'wheel',
    (e) => {
      if (!active()) return;
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false },
  );
  // two fingers on the board must not zoom the whole page
  wrap.style.touchAction = 'none';
};
