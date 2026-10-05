// The test copy's step guidance (loaded only in the test build): the step's word on the map the
// moment a step starts, and the step's own controls as the clear hero (CSS in lab-css.ts, keyed
// on <html data-step data-guide>). The step comes from the game's own state (main.ts passes the
// phase and whose turn it is); nothing here keeps a separate idea of the step.
import { STEP_CUE } from '../../../src/strings.js';

export type Step = 'draw' | 'grow' | 'throw' | 'opp';
export type GuideMode = 'full' | 'subtle' | 'off';

const KEY = 'severgrow-guide';
/** The cue's timing (ms): bright at first, settled after SETTLE, one breath after IDLE without
 *  input, pulses at half strength after TIRED, back to full after REST of idle. */
export const GUIDE = { settle: 2500, idle: 5000, breath: 1400, tired: 6000, rest: 10000, earlyTurns: 3 } as const;

const loadMode = (): GuideMode => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'subtle' || v === 'off' ? v : 'full';
  } catch {
    return 'full';
  }
};

export const mountGuide = (hooks: { reduceMotion: () => boolean }) => {
  const root = document.documentElement;
  let mode = loadMode();
  root.dataset.guide = mode;

  // ---------- the setting (Settings sheet, with the phone layout rows) ----------
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = '<span>Step guidance</span><div class="seg" role="radiogroup" aria-label="Step guidance" id="guide-seg"></div>';
  const seg = row.querySelector('.seg')!;
  const paint = () =>
    seg.replaceChildren(
      ...([['full', 'Full'], ['subtle', 'Subtle'], ['off', 'Off']] as const).map(([v, t]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `seg-btn${mode === v ? ' on' : ''}`;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(mode === v));
        b.textContent = t;
        b.addEventListener('click', () => {
          mode = v;
          root.dataset.guide = mode;
          try {
            localStorage.setItem(KEY, mode);
          } catch {
            /* storage blocked: lasts until reload */
          }
          paint();
          restart();
        });
        return b;
      }),
    );
  paint();
  const host = document.querySelector('#sheet-settings .thumb-settings') ?? document.querySelector('#sheet-settings .sheet-body');
  host?.append(row);

  // ---------- the chips and effects on the piles (decorations only: never take a tap) ----------
  const fx = (pile: HTMLElement | null, chip: string) => {
    if (!pile || pile.querySelector('.gd-fx')) return;
    const box = document.createElement('span');
    box.className = 'gd-fx';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = `<i class="gd-halo"></i><i class="gd-ring"></i><b class="gd-chip"></b>`;
    box.querySelector('.gd-chip')!.textContent = chip;
    pile.querySelector('.pile-card')?.append(box);
  };
  fx(document.getElementById('deck'), STEP_CUE.chipDeck);
  fx(document.getElementById('discard'), STEP_CUE.chipTake);
  const throwChip = document.querySelector<HTMLElement>('#discard .gd-chip');

  // ---------- the cue on the map ----------
  const wrap = document.getElementById('board-wrap');
  const cue = document.createElement('div');
  cue.id = 'step-cue';
  cue.className = 'step-cue';
  cue.setAttribute('aria-hidden', 'true');
  cue.innerHTML = '<span class="cue-in"><span class="cue-text"></span><i class="cue-chev"></i></span>';
  wrap?.appendChild(cue);
  const textEl = cue.querySelector<HTMLElement>('.cue-text')!;
  const inner = cue.querySelector<HTMLElement>('.cue-in')!;

  let step: Step | null = null;
  let key = '';
  let shownAt = 0;
  let startedAt = 0;
  let timers: number[] = [];
  let idleTimer = 0;
  let restTimer = 0;
  let tiredTimer = 0;
  const clear = () => {
    timers.forEach((t) => clearTimeout(t));
    timers = [];
  };
  const level = (l: 'off' | 'hi' | 'lo') => (cue.dataset.level = l);

  /** Where the words go: never over a home, a tile (its number), a gold "2", a highlight, a legal
   *  target or a ghost; empty hexes only when possible (rocks too are avoided at first). */
  const place = () => {
    if (!wrap) return;
    const B = wrap.getBoundingClientRect();
    const under = parseFloat(getComputedStyle(wrap).getPropertyValue('--cam-under')) || 0;
    const W = { left: B.left, top: B.top, width: B.width, height: Math.max(0, B.height - under) };
    const rect = (e: Element) => e.getBoundingClientRect();
    const hard = [...wrap.querySelectorAll('g.tile, .landmark, .gold-badge, .l-over > *, .badge, .ghost-tile, .ghost-num, .cam-whole, .cam-arrow')].map(rect).filter((r) => r.width > 0);
    const rocks = [...wrap.querySelectorAll('g.hex-cell.rock')].map(rect).filter((r) => r.width > 0);
    const cells = [...wrap.querySelectorAll('g.hex-cell:not(.rock)')].map(rect).filter((r) => r.width > 0);
    type Box = { left: number; top: number; right: number; bottom: number };
    const hit = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const empty = cells.filter((c) => !hard.some((x) => hit(c, x)));
    inner.style.fontSize = '';
    cue.classList.remove('faint');
    let fallback: { x: number; y: number; size: number; cost: number } | null = null;
    for (const [size, avoidRocks] of [[1, true], [0.8, true], [1, false], [0.8, false], [0.65, false]] as const) {
      inner.style.fontSize = `${size}em`;
      // (the letters enter a little wider: room for that too)
      const w = inner.offsetWidth * 1.15;
      const h = inner.offsetHeight;
      if (w > W.width - 8) continue; // too wide for the board at this size: try smaller
      let best: { x: number; y: number; score: number } | null = null;
      for (let yi = 0; yi <= 16; yi++) {
        for (const xf of [0.5, 0.3, 0.7]) {
          const cx = Math.min(W.width - w / 2, Math.max(w / 2, W.width * xf));
          const cy = Math.min(W.height - h / 2, Math.max(h / 2, W.height * (0.08 + (0.84 * yi) / 16)));
          const r = { left: W.left + cx - w / 2, right: W.left + cx + w / 2, top: W.top + cy - h / 2, bottom: W.top + cy + h / 2 };
          const cost = hard.filter((x) => hit(r, x)).length;
          if (cost > 0) {
            if (!fallback || cost < fallback.cost) fallback = { x: cx, y: cy, size, cost };
            continue;
          }
          if (avoidRocks && rocks.some((x) => hit(r, x))) continue;
          const score = empty.filter((c) => hit(r, c)).length - Math.abs(xf - 0.5);
          if (!best || score > best.score) best = { x: cx, y: cy, score };
        }
      }
      if (best) return put(best.x, best.y, B);
    }
    if (fallback) {
      inner.style.fontSize = '0.65em';
      cue.classList.add('faint');
      put(fallback.x, fallback.y, B);
    }
  };
  /** Puts the words at (x, y) in the board's box and points the chevron at the step's pile. */
  const put = (x: number, y: number, B: DOMRect) => {
    cue.style.left = `${x.toFixed(1)}px`;
    cue.style.top = `${y.toFixed(1)}px`;
    const target = step === 'draw' ? document.querySelector('#dock .piles') ?? document.getElementById('deck') : step === 'throw' ? document.getElementById('discard') : null;
    if (target) {
      const t = target.getBoundingClientRect();
      const a = Math.atan2(t.top + t.height / 2 - (B.top + y), t.left + t.width / 2 - (B.left + x));
      cue.style.setProperty('--chev-a', `${((a * 180) / Math.PI).toFixed(1)}deg`);
    }
  };

  const show = () => {
    if (!step || mode === 'off' || document.hidden) return level('off');
    textEl.textContent = STEP_CUE[step];
    textEl.dataset.t = STEP_CUE[step];
    cue.dataset.step = step;
    place();
    // the entrance plays again: fade, a 6px rise, letters settling, one pass of light
    cue.classList.remove('enter');
    void cue.offsetWidth;
    cue.classList.toggle('still', hooks.reduceMotion());
    cue.classList.add('enter');
    level('hi');
    shownAt = performance.now();
    root.dataset.cueMs = String(Math.round(shownAt - startedAt));
    clear();
    timers.push(window.setTimeout(() => cue.dataset.level === 'hi' && level('lo'), GUIDE.settle));
  };
  /** Nothing touched for a while: one gentle breath up, then settled again. */
  const armIdle = () => {
    clearTimeout(idleTimer);
    clearTimeout(restTimer);
    if (!step || mode === 'off') return;
    idleTimer = window.setTimeout(() => {
      if (!step) return;
      if (cue.dataset.level === 'off') {
        textEl.textContent = STEP_CUE[step];
        textEl.dataset.t = STEP_CUE[step];
        place();
      }
      level('hi');
      timers.push(window.setTimeout(() => level('lo'), GUIDE.breath));
    }, GUIDE.idle);
    // pulses come back to full strength after a longer rest
    restTimer = window.setTimeout(() => root.classList.remove('gd-tired'), GUIDE.rest);
  };
  const restart = () => {
    key = '';
    level('off');
  };

  // any input: the words go (within 120ms), the idle clock starts again
  for (const ev of ['pointerdown', 'keydown'] as const)
    window.addEventListener(
      ev,
      () => {
        if (cue.dataset.level !== 'off') level('off');
        clear();
        armIdle();
      },
      { capture: true, passive: true },
    );
  document.addEventListener('visibilitychange', () => (document.hidden ? level('off') : armIdle()));

  return {
    /**
     * Called on every render with the game's own step (null: none, e.g. game over or an
     * animation of my own move still playing), my turn number (1, 2, ...) and whether a card is
     * picked (the throw pile's chip says "Throw here" then).
     */
    update(s: { step: Step | null; turn: number; myTurns: number; picked: boolean }) {
      root.dataset.step = s.step ?? 'none';
      root.classList.toggle('gd-early', s.myTurns <= GUIDE.earlyTurns);
      root.classList.toggle('gd-picked', s.picked);
      if (throwChip) throwChip.textContent = s.step === 'throw' ? STEP_CUE.chipThrow : STEP_CUE.chipTake;
      const k = `${s.step}:${s.turn}`;
      if (k === key) return;
      key = k;
      step = s.step;
      startedAt = performance.now();
      root.classList.remove('gd-tired');
      clear();
      if (!step) {
        level('off');
        return;
      }
      show();
      armIdle();
      clearTimeout(tiredTimer);
      tiredTimer = window.setTimeout(() => root.classList.add('gd-tired'), GUIDE.tired);
    },
  };
};
