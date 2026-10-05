// The test copy's phone extras (loaded only in the test build): the "thumb layout" settings
// (Thumb layout, Hand side) and the idle tip shown faintly over the board. The layout itself is
// computed by the one layout engine (logic/layout.ts, computeLayout's `thumb` variant).
export type ThumbPrefs = { thumb: boolean; side: 'right' | 'left'; idleTip: boolean };

const KEY = 'severgrow-thumb';
const DEFAULTS: ThumbPrefs = { thumb: true, side: 'right', idleTip: true };
/** No touch or key input for this long (ms) on my turn: the tip shows. */
export const IDLE_MS = 4000;

const load = (): ThumbPrefs => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const x = (raw && typeof raw === 'object' ? raw : {}) as Partial<ThumbPrefs>;
    return { thumb: x.thumb !== false, side: x.side === 'left' ? 'left' : 'right', idleTip: x.idleTip !== false };
  } catch {
    return { ...DEFAULTS };
  }
};

/** A phone held upright: a touch screen, portrait, at most 600px wide. */
export const isPhonePortrait = (w: number, h: number) => w <= 600 && h > w && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export const mountThumb = (hooks: { relayout: () => void; reduceMotion: () => boolean }) => {
  let prefs = load();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* storage blocked: the choice lasts until the page reloads */
    }
  };

  // ---------- the settings rows (in the Settings sheet, test copy only) ----------
  const body = document.querySelector('#sheet-settings .sheet-body');
  const box = document.createElement('div');
  box.className = 'thumb-settings';
  const seg = (label: string, id: string, options: [string, string][], current: () => string, pick: (v: string) => void) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span>${label}</span><div class="seg" role="radiogroup" aria-label="${label}" id="${id}"></div>`;
    const g = row.querySelector('.seg')!;
    const paint = () => {
      g.replaceChildren(
        ...options.map(([v, text]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `seg-btn${current() === v ? ' on' : ''}`;
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', String(current() === v));
          b.textContent = text;
          b.addEventListener('click', () => {
            pick(v);
            save();
            paintAll();
            hooks.relayout();
          });
          return b;
        }),
      );
    };
    painters.push(paint);
    return row;
  };
  const painters: (() => void)[] = [];
  const paintAll = () => painters.forEach((p) => p());
  const h3 = document.createElement('h3');
  h3.textContent = 'Phone layout';
  box.append(
    h3,
    seg('Thumb layout', 'thumb-seg', [['on', 'On'], ['off', 'Off']], () => (prefs.thumb ? 'on' : 'off'), (v) => (prefs = { ...prefs, thumb: v === 'on' })),
    seg('Hand side', 'hand-side-seg', [['right', 'Right'], ['left', 'Left']], () => prefs.side, (v) => (prefs = { ...prefs, side: v === 'left' ? 'left' : 'right' })),
  );
  body?.prepend(box);
  paintAll();

  // ---------- the idle tip: large faint words over the board's emptiest part ----------
  const wrap = document.getElementById('board-wrap');
  const tipEl = document.createElement('div');
  tipEl.id = 'idle-tip';
  tipEl.className = 'idle-tip';
  tipEl.setAttribute('aria-hidden', 'true');
  wrap?.appendChild(tipEl);
  let text: string | null = null;
  let active = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hide = () => {
    tipEl.classList.remove('on');
  };
  const arm = () => {
    clearTimeout(timer);
    hide();
    if (!active || !text || !prefs.idleTip || document.hidden) return;
    timer = setTimeout(show, IDLE_MS);
  };
  const show = () => {
    if (!active || !text || !prefs.idleTip || document.hidden) return;
    tipEl.textContent = text;
    place();
    tipEl.classList.toggle('instant', hooks.reduceMotion());
    tipEl.classList.add('on');
  };
  /**
   * Where the tip goes: never over a home, a tile (its number), a gold hex's "2", a highlight or
   * a legal target. Of the spots that touch none of them, the one over the most empty hexes.
   * None at full size: smaller words; still none: the smallest words, very faint, where they
   * cover the least.
   */
  const place = () => {
    if (!wrap) return;
    const B = wrap.getBoundingClientRect();
    // the map may run on under the cards: the tip stays in the window above them
    const under = parseFloat(getComputedStyle(wrap).getPropertyValue('--cam-under')) || 0;
    const W = { left: B.left, top: B.top, width: B.width, height: Math.max(0, B.height - under) };
    const rect = (e: Element) => e.getBoundingClientRect();
    const avoid = [...wrap.querySelectorAll('g.tile, .landmark, .gold-badge, .l-over > *, .badge')].map(rect).filter((r) => r.width > 0);
    const cells = [...wrap.querySelectorAll('g.hex-cell:not(.rock)')].map(rect);
    const hit = (a: DOMRect | { left: number; top: number; right: number; bottom: number }, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const empty = cells.filter((c) => !avoid.some((x) => hit(c, x)));
    tipEl.classList.remove('faint', 'busy');
    let fallback: { x: number; y: number; size: number; cost: number } | null = null;
    for (const size of [1, 0.8, 0.65]) {
      tipEl.style.fontSize = `${(1.45 * size).toFixed(2)}rem`;
      tipEl.style.width = `min(${size === 1 ? 86 : 70}%, 420px)`;
      const w = tipEl.offsetWidth;
      const h = tipEl.offsetHeight;
      let best: { x: number; y: number; score: number } | null = null;
      for (let yi = 0; yi <= 16; yi++) {
        for (const xf of [0.5, 0.3, 0.7]) {
          const cx = Math.min(W.width - w / 2, Math.max(w / 2, W.width * xf));
          const cy = Math.min(W.height - h / 2, Math.max(h / 2, W.height * (0.08 + (0.84 * yi) / 16)));
          const r = { left: W.left + cx - w / 2, right: W.left + cx + w / 2, top: W.top + cy - h / 2, bottom: W.top + cy + h / 2 };
          const cost = avoid.filter((x) => hit(r, x)).length;
          if (cost > 0) {
            if (!fallback || cost < fallback.cost) fallback = { x: cx, y: cy, size, cost };
            continue;
          }
          const score = empty.filter((c) => hit(r, c)).length - Math.abs(xf - 0.5);
          if (!best || score > best.score) best = { x: cx, y: cy, score };
        }
      }
      if (best) {
        tipEl.style.left = `${best.x}px`;
        tipEl.style.top = `${best.y}px`;
        return;
      }
    }
    // nowhere free: the smallest words, very faint, where they cover the least
    if (fallback) {
      tipEl.style.fontSize = `${(1.45 * 0.65).toFixed(2)}rem`;
      tipEl.style.left = `${fallback.x}px`;
      tipEl.style.top = `${fallback.y}px`;
      tipEl.classList.add('faint');
    }
  };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.addEventListener(ev, arm, { capture: true, passive: true });
  document.addEventListener('visibilitychange', arm);

  return {
    /** the hand side for a viewport, or null: the normal layout */
    side: (w: number, h: number): 'right' | 'left' | null => (prefs.thumb && isPhonePortrait(w, h) ? prefs.side : null),
    /** the tip to show when idle (null: not now: not my turn, an animation, painting a Bloom) */
    tip: (t: string | null, thumbOn: boolean) => {
      const next = thumbOn ? t : null;
      const changed = next !== text || active !== !!next;
      text = next;
      active = !!next;
      if (changed) arm();
    },
  };
};
