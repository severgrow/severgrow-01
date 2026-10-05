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
  h3.textContent = 'Phone layout (test copy)';
  box.append(
    h3,
    seg('Thumb layout', 'thumb-seg', [['on', 'On'], ['off', 'Off']], () => (prefs.thumb ? 'on' : 'off'), (v) => (prefs = { ...prefs, thumb: v === 'on' })),
    seg('Hand side', 'hand-side-seg', [['right', 'Right'], ['left', 'Left']], () => prefs.side, (v) => (prefs = { ...prefs, side: v === 'left' ? 'left' : 'right' })),
    seg('Idle tip', 'idle-tip-seg', [['on', 'On'], ['off', 'Off']], () => (prefs.idleTip ? 'on' : 'off'), (v) => (prefs = { ...prefs, idleTip: v === 'on' })),
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
  /** The band of the board (top, middle or bottom third) with the fewest tiles and rocks. */
  const place = () => {
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const busy = [...wrap.querySelectorAll<SVGGElement>('g.tile, g.hex-cell.rock')].map((e) => e.getBoundingClientRect());
    const bands = [0.2, 0.5, 0.8].map((f) => {
      const cy = r.top + r.height * f;
      const n = busy.filter((b) => b.bottom > cy - 40 && b.top < cy + 40).length;
      return { f, n };
    });
    // fewest things under it; ties: the top band, then the bottom (the middle holds the homes' line)
    const best = bands.sort((a, b) => a.n - b.n || (a.f === 0.5 ? 1 : 0) - (b.f === 0.5 ? 1 : 0) || a.f - b.f)[0]!;
    tipEl.style.top = `${(best.f * 100).toFixed(0)}%`;
    tipEl.classList.toggle('busy', best.n > 4);
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
