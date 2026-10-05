// The test copy's smart camera: which part of the map the board shows. It only moves the board's
// SVG viewBox (the view, in board units), so everything that finds hexes through the board's
// screen matrix (taps, painting a Bloom, highlights, ghosts, tile cards, the idle tip, badges)
// follows it by itself. Landmarks and text stay upright: they are drawn in board units already.
//
// Tiles are never smaller than MIN_TILE (the classic board's tile on this screen, times a
// factor) unless "Whole map" is on, never bigger than MAX_TILE. The camera frames where the game
// is: all tiles of both players plus two hexes around them; when that can't fit at MIN_TILE, my
// tiles first, then the opponent's nearest and the last move. Off-screen tiles get edge arrows.

/** Camera settings: the smallest tile (x DEFAULT_TILE), the largest, the margin (hexes) round
 *  the tiles, the move's length (ms) and how long a peek through an edge arrow lasts. */
export const CAMERA = { minFactor: 1.0, maxFactor: 1.4, margin: 2, ms: 300, peekMs: 2500 } as const;

const S = 30;
const HEXW = Math.sqrt(3) * S; // centre to centre, board units

type Rect = { x: number; y: number; w: number; h: number };
export type CamTile = { key: string; x: number; y: number; owner: 0 | 1 };
export type CamInput = {
  /** every tile on the board (homes included), centres in board units */
  tiles: CamTile[];
  me: 0 | 1;
  /** the last move's hexes (board units) */
  recent: { x: number; y: number }[];
  /** changes when the turn passes (auto-framing resumes, a zoom-out snaps back) */
  turnKey: string;
  /** the classic board's tile on this screen (CSS px): MIN_TILE = this x CAMERA.minFactor */
  defaultTile: number;
  /** false while a Bloom is painted, an animation plays (cut, Fruit) or a finger is down */
  canMove: boolean;
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const installCamera = (svg: SVGSVGElement, wrap: HTMLElement, hooks: { reduceMotion: () => boolean; changed: () => void }) => {
  let base: Rect | null = null; // the whole map (what the board itself sets)
  let view: Rect | null = null; // what is shown
  let mine = '';
  let auto = true;
  let wholeOn = false;
  let lastKey = '';
  let lastTurn = '';
  let pending = false;
  let input: CamInput | null = null;
  let anim = 0;
  let peekTimer = 0;
  let touching = 0;
  let culled = false;

  // ---------- the UI: edge arrows and the "Whole map" pill ----------
  const arrows = document.createElement('div');
  arrows.className = 'cam-arrows';
  wrap.appendChild(arrows);
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'cam-whole';
  pill.hidden = true;
  wrap.appendChild(pill);
  pill.addEventListener('click', () => {
    wholeOn = !wholeOn;
    auto = true;
    frame(true);
  });

  const read = (): Rect | null => {
    const v = svg.getAttribute('viewBox')?.split(/\s+/).map(Number);
    return v && v.length === 4 && v.every(Number.isFinite) ? { x: v[0]!, y: v[1]!, w: v[2]!, h: v[3]! } : null;
  };
  const write = (r: Rect) => {
    mine = `${r.x.toFixed(2)} ${r.y.toFixed(2)} ${r.w.toFixed(2)} ${r.h.toFixed(2)}`;
    svg.setAttribute('viewBox', mine);
    view = r;
  };
  const box = () => svg.getBoundingClientRect();
  /** The view for a centre and a tile size (CSS px), with the svg box's own shape. */
  const viewAt = (cx: number, cy: number, tile: number): Rect => {
    const b = box();
    const s = tile / HEXW; // px per unit
    const w = b.width / s;
    const h = b.height / s;
    let x = cx - w / 2;
    let y = cy - h / 2;
    if (base) {
      // never show past the map's edges when it is bigger than the view; centre it when smaller
      x = w >= base.w ? base.x + (base.w - w) / 2 : Math.min(base.x + base.w - w, Math.max(base.x, x));
      y = h >= base.h ? base.y + (base.h - h) / 2 : Math.min(base.y + base.h - h, Math.max(base.y, y));
    }
    return { x, y, w, h };
  };
  const fitTile = (r: Rect) => {
    const b = box();
    return HEXW * Math.min(b.width / r.w, b.height / r.h);
  };
  const tileOf = (r: Rect) => HEXW * (box().width / r.w);

  /** Where the camera should be now. */
  const target = (): { rect: Rect; tile: number; whole: boolean } | null => {
    if (!base || !input || box().width === 0) return null;
    const minT = input.defaultTile * CAMERA.minFactor;
    const maxT = input.defaultTile * CAMERA.maxFactor;
    const tW = fitTile(base);
    const cx = base.x + base.w / 2;
    const cy = base.y + base.h / 2;
    if (wholeOn) return { rect: viewAt(cx, cy, Math.min(tW, maxT)), tile: Math.min(tW, maxT), whole: true };
    if (tW >= minT - 0.01) return { rect: viewAt(cx, cy, Math.min(tW, maxT)), tile: Math.min(tW, maxT), whole: true };
    const pts = input.tiles;
    if (!pts.length) return { rect: viewAt(cx, cy, minT), tile: minT, whole: false };
    const m = CAMERA.margin * HEXW + S;
    const bbox = (ps: { x: number; y: number }[], pad: number): Rect => {
      const xs = ps.map((p) => p.x);
      const ys = ps.map((p) => p.y);
      const x0 = Math.min(...xs) - pad;
      const y0 = Math.min(...ys) - pad;
      return { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 };
    };
    const area = bbox(pts, m);
    const tA = fitTile(area);
    if (tA >= minT) {
      const t = Math.min(tA, maxT);
      return { rect: viewAt(area.x + area.w / 2, area.y + area.h / 2, t), tile: t, whole: false };
    }
    // MIN_TILE wins: my tiles first, then the last move and the opponent's tiles nearest to mine
    const mineT = pts.filter((p) => p.owner === input!.me);
    const theirs = pts.filter((p) => p.owner !== input!.me);
    const near = (p: { x: number; y: number }) => Math.min(...mineT.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
    const b = box();
    const fits = (r: Rect) => (r.w * minT) / HEXW <= b.width && (r.h * minT) / HEXW <= b.height;
    let set: { x: number; y: number }[] = [...mineT];
    const pad = S + 6;
    if (!fits(bbox(set, pad))) {
      // not even all of mine: centre on them anyway (arrows show the rest)
      const r = bbox(set, pad);
      return { rect: viewAt(r.x + r.w / 2, r.y + r.h / 2, minT), tile: minT, whole: false };
    }
    for (const p of [...input.recent, ...theirs.sort((a, c) => near(a) - near(c))]) {
      const next = [...set, p];
      if (fits(bbox(next, pad))) set = next;
    }
    // then two hexes of room, if they still fit
    const roomy = bbox(set, m);
    const r = fits(roomy) ? roomy : bbox(set, pad);
    return { rect: viewAt(r.x + r.w / 2, r.y + r.h / 2, minT), tile: minT, whole: false };
  };

  const show = (r: Rect, instant = false) => {
    cancelAnimationFrame(anim);
    uncull();
    const from = view ?? r;
    if (instant || hooks.reduceMotion() || !view) {
      write(r);
      settle();
      return;
    }
    wrap.classList.add('cam-zoomed');
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / CAMERA.ms);
      const e = ease(k);
      write({ x: from.x + (r.x - from.x) * e, y: from.y + (r.y - from.y) * e, w: from.w + (r.w - from.w) * e, h: from.h + (r.h - from.h) * e });
      if (k < 1) anim = requestAnimationFrame(step);
      else settle();
    };
    anim = requestAnimationFrame(step);
  };

  /** After a move: draw only the hexes in view (huge maps stay fast), then the arrows. */
  const settle = () => {
    clip();
    cull();
    drawArrows();
    hooks.changed();
  };
  /** Zoomed in: the map is clipped to its own area (never over the header or the dock). */
  const clip = () => {
    const zoomedIn = !!view && !!base && (view.w < base.w - 0.5 || view.h < base.h - 0.5);
    wrap.classList.toggle('cam-zoomed', zoomedIn);
  };
  const cull = () => {
    if (!view || !base) return;
    const isWhole = view.w >= base.w - 0.5 && view.h >= base.h - 0.5;
    if (isWhole) return uncull();
    const m = HEXW;
    for (const g of svg.querySelectorAll<SVGGElement>('g.hex-cell, g.tile')) {
      const k = g.dataset.key ?? g.getAttribute('data-key');
      const c = k ? centres.get(k) : undefined;
      if (!c) continue;
      const out = c.x < view.x - m || c.x > view.x + view.w + m || c.y < view.y - m || c.y > view.y + view.h + m;
      g.style.display = out ? 'none' : '';
    }
    culled = true;
  };
  const uncull = () => {
    if (!culled) return;
    for (const g of svg.querySelectorAll<SVGGElement>('g.hex-cell, g.tile')) g.style.display = '';
    culled = false;
  };
  let centres = new Map<string, { x: number; y: number }>();

  /** Off-screen tiles: one soft chevron per side and owner, with a count, at the edge. */
  const drawArrows = () => {
    arrows.replaceChildren();
    if (!view || !input || wholeOn) return;
    const inset = 0; // a tile counts as off screen when its centre is outside the view
    const off = input.tiles.filter((p) => p.x < view!.x + inset || p.x > view!.x + view!.w - inset || p.y < view!.y + inset || p.y > view!.y + view!.h - inset);
    if (!off.length) return;
    const ctm = svg.getScreenCTM();
    const wr = wrap.getBoundingClientRect();
    if (!ctm) return;
    const cx = view.x + view.w / 2;
    const cy = view.y + view.h / 2;
    const groups = new Map<string, CamTile[]>();
    for (const p of off) {
      const a = Math.atan2(p.y - cy, p.x - cx);
      const sector = Math.round(a / (Math.PI / 4)); // 8 directions
      const k = `${sector}:${p.owner}`;
      groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    for (const [k, g] of groups) {
      const owner = Number(k.split(':')[1]);
      const gx = g.reduce((s, p) => s + p.x, 0) / g.length;
      const gy = g.reduce((s, p) => s + p.y, 0) / g.length;
      const a = Math.atan2(gy - cy, gx - cx);
      // where the ray from the view's centre leaves the view (a little inside the edge)
      const hw = view.w / 2 - S * 0.7;
      const hh = view.h / 2 - S * 0.7;
      const tt = Math.min(Math.abs(hw / (Math.cos(a) || 1e-9)), Math.abs(hh / (Math.sin(a) || 1e-9)));
      const ex = cx + Math.cos(a) * tt;
      const ey = cy + Math.sin(a) * tt;
      const pt = new DOMPoint(ex, ey).matrixTransform(ctm);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `cam-arrow ${owner === input.me ? 'you' : 'bot'}`;
      b.style.left = `${(pt.x - wr.left).toFixed(1)}px`;
      b.style.top = `${(pt.y - wr.top).toFixed(1)}px`;
      b.style.setProperty('--a', `${((a * 180) / Math.PI).toFixed(1)}deg`);
      b.setAttribute('aria-label', `${g.length} ${owner === input.me ? 'of your' : "of the opponent's"} tiles this way`);
      b.innerHTML = `<i aria-hidden="true"></i><span>${g.length}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        peek(gx, gy);
      });
      arrows.appendChild(b);
    }
  };

  /** An edge arrow: look over there for a moment, then come back. */
  const peek = (x: number, y: number) => {
    if (!view) return;
    clearTimeout(peekTimer);
    show(viewAt(x, y, tileOf(view)));
    peekTimer = window.setTimeout(() => {
      if (!touching && auto) frame(true);
    }, CAMERA.peekMs);
  };

  const frame = (force = false) => {
    const t = target();
    if (!t) return;
    pill.hidden = !(wholeOn || !t.whole);
    pill.textContent = wholeOn ? 'Back to play' : 'Whole map';
    if (!force && view && Math.abs(view.x - t.rect.x) + Math.abs(view.y - t.rect.y) + Math.abs(view.w - t.rect.w) < 0.5) return settle();
    show(t.rect);
  };

  // the board sets its own viewBox (a new game, a new layout): that is the whole map
  new MutationObserver(() => {
    if (svg.getAttribute('viewBox') === mine) return;
    base = read();
    view = null;
    culled = false;
    if (input) frame(true);
  }).observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
  base = read();

  // ---------- manual pan and pinch-zoom (auto-framing pauses until the next turn) ----------
  const pts = new Map<number, { x: number; y: number }>();
  let gesture = false;
  let last: { cx: number; cy: number; d: number } | null = null;
  const toUnits = (x: number, y: number) => {
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(x, y).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const manual = (r: Rect) => {
    cancelAnimationFrame(anim);
    clearTimeout(peekTimer);
    uncull();
    if (!base || !input) return write(r);
    // never deeper than 3x MAX_TILE; never further out than the whole map
    const maxT = input.defaultTile * CAMERA.maxFactor * 2;
    const tW = fitTile(base);
    let t = HEXW * (box().width / r.w);
    t = Math.min(maxT, Math.max(Math.min(tW, input.defaultTile), t));
    const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    write(viewAt(c.x, c.y, t));
    clip();
    arrows.replaceChildren();
    auto = false;
  };
  const centre = () => {
    const a = [...pts.values()];
    const cx = a.reduce((s, p) => s + p.x, 0) / a.length;
    const cy = a.reduce((s, p) => s + p.y, 0) / a.length;
    const d = a.length > 1 ? Math.hypot(a[0]!.x - a[1]!.x, a[0]!.y - a[1]!.y) : 0;
    return { cx, cy, d };
  };
  const zoomed = () => !!view && !!base && (view.w < base.w - 0.5 || view.h < base.h - 0.5);
  const onEmpty = (e: PointerEvent) => !(e.target as Element | null)?.closest?.('[data-key], button');
  wrap.addEventListener(
    'pointerdown',
    (e) => {
      touching++;
      if (e.pointerType === 'mouse') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 || (pts.size === 1 && onEmpty(e) && zoomed())) {
        if (pts.size === 2 && !gesture) for (const id of pts.keys()) if (id !== e.pointerId) svg.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, bubbles: true }));
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
      if (!gesture || !last || !view) return;
      const c = centre();
      const a = toUnits(last.cx, last.cy);
      const b = toUnits(c.cx, c.cy);
      let r: Rect = { ...view, x: view.x - (b.x - a.x), y: view.y - (b.y - a.y) };
      if (last.d > 0 && c.d > 0) {
        const f = c.d / last.d;
        const p = toUnits(c.cx, c.cy);
        const w = r.w / f;
        const h = r.h / f;
        r = { x: p.x - ((p.x - r.x) / r.w) * w, y: p.y - ((p.y - r.y) / r.h) * h, w, h };
      }
      manual(r);
      last = c;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
  const end = (e: PointerEvent) => {
    touching = Math.max(0, touching - 1);
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (gesture) {
      e.stopPropagation();
      if (pts.size === 0) {
        gesture = false;
        cull();
        drawArrows();
      }
      last = pts.size ? centre() : null;
    }
  };
  wrap.addEventListener('pointerup', end, true);
  wrap.addEventListener('pointercancel', end, true);
  wrap.addEventListener(
    'wheel',
    (e) => {
      if (!view) return;
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      const p = toUnits(e.clientX, e.clientY);
      const w = view.w / f;
      const h = view.h / f;
      manual({ x: p.x - ((p.x - view.x) / view.w) * w, y: p.y - ((p.y - view.y) / view.h) * h, w, h });
    },
    { passive: false },
  );
  wrap.style.touchAction = 'none';

  return {
    /** Called on every render: re-frames when the tiles change (at most once per change). */
    update(i: CamInput, cellCentres: Map<string, { x: number; y: number }>) {
      input = i;
      centres = cellCentres;
      const key = i.tiles.map((t) => `${t.key}${t.owner}`).sort().join('|') + `@${i.defaultTile.toFixed(1)}`;
      if (i.turnKey !== lastTurn) {
        lastTurn = i.turnKey;
        auto = true; // a new turn: auto-framing again (and a manual zoom-out snaps back)
        pending = true;
      }
      if (key !== lastKey) {
        lastKey = key;
        pending = true;
      }
      if (!pending || !auto) return;
      if (!i.canMove || touching > 0) return;
      pending = false;
      frame();
    },
    /** True when the whole map is in view (the fan's smart overlap needs that). */
    isWhole: () => !!view && !!base && view.w >= base.w - 0.5 && view.h >= base.h - 0.5,
    /** The tile size shown now (CSS px, centre to centre). */
    tile: () => (view ? tileOf(view) : 0),
    offscreen: () => arrows.childElementCount,
  };
};
