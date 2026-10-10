// Approved player step guidance (Test and Futa04): a small crafted plate on the map
// the moment a step starts (an icon, the step's words, three step pips), and the step's own
// controls as the clear hero (CSS in lab-css.ts, keyed on <html data-step data-guide>). The step
// comes from the game's own state (main.ts passes the phase and whose turn it is); nothing here
// keeps a separate idea of the step.
import { STEP_CUE } from '../../../src/strings.js';
import { IS_FUTA04 } from '../channel.js';

export type Step = 'draw' | 'grow' | 'throw' | 'opp';
export type GuideMode = 'full' | 'subtle' | 'off';

const KEY = 'severgrow-guide';
/** The plate's timing (ms): crisp at first, settled after SETTLE, one breath after IDLE without
 *  input, pulses at half strength after TIRED, back to full after REST of idle. */
export const GUIDE = { settle: 2500, idle: 5000, breath: 1400, tired: 6000, rest: 10000 } as const;

/** Small line icons (24-unit box, stroke = currentColor). */
const ICON: Record<Step, string> = {
  // a card lifting off the deck
  draw: '<rect x="6.5" y="8" width="11" height="14" rx="2"/><path d="M12 2.5v8M8.8 5.7 12 2.5l3.2 3.2"/>',
  // a sprout
  grow: '<path d="M12 21v-8"/><path d="M12 13c0-4 2.6-6.6 7-6.6 0 4.2-2.8 6.6-7 6.6Z"/><path d="M12 15.5c0-3.3-2.2-5.4-5.8-5.4 0 3.4 2.3 5.4 5.8 5.4Z"/>',
  // a card going down onto the pile
  throw: '<rect x="5" y="15" width="14" height="5.5" rx="1.6"/><rect x="7.5" y="3" width="9" height="9" rx="1.6" transform="rotate(-12 12 7.5)"/>',
  // an ember
  opp: '<path d="M12 21c3.6 0 6-2.4 6-5.8 0-3.6-3-5.6-3.6-9.7-2.2 1.6-3 3.6-3 5.6-1.2-.8-1.8-2-1.9-3.3C7.4 9.6 6 11.9 6 15.2 6 18.6 8.4 21 12 21Z"/>',
};

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
          key = '';
          level('off');
        });
        return b;
      }),
    );
  paint();
  const host = document.querySelector('#sheet-settings .thumb-settings') ?? document.querySelector('#sheet-settings .sheet-body');
  host?.append(row);

  // ---------- the piles' effects: a cream halo and one ring (decorations only) ----------
  for (const id of ['deck', 'discard']) {
    const pile = document.getElementById(id);
    if (!pile || pile.querySelector('.gd-fx')) continue;
    const box = document.createElement('span');
    box.className = 'gd-fx';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<i class="gd-halo"></i><i class="gd-ring"></i>';
    pile.querySelector('.pile-card')?.append(box);
  }

  // ---------- the plate on the map ----------
  const wrap = document.getElementById('board-wrap');
  const cue = document.createElement('div');
  cue.id = 'step-cue';
  cue.className = 'step-cue';
  cue.setAttribute('aria-hidden', 'true');
  cue.innerHTML = `<div class="cue-plate"><span class="cue-icon"><svg viewBox="0 0 24 24" aria-hidden="true"></svg></span><span class="cue-words"><span class="cue-kicker"></span><span class="cue-text"></span></span><span class="cue-pips"><i data-p="draw"></i><i data-p="grow"></i><i data-p="throw"></i></span></div>`;
  wrap?.appendChild(cue);
  const plate = cue.querySelector<HTMLElement>('.cue-plate')!;
  const textEl = cue.querySelector<HTMLElement>('.cue-text')!;
  const kickEl = cue.querySelector<HTMLElement>('.cue-kicker')!;
  const iconEl = cue.querySelector<SVGSVGElement>('.cue-icon svg')!;

  let step: Step | null = null;
  let key = '';
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

  const fill = (s: Step) => {
    textEl.textContent = STEP_CUE[s];
    kickEl.textContent = s === 'opp' ? STEP_CUE.kickerOpp : STEP_CUE.kicker[s];
    iconEl.innerHTML = ICON[s];
    cue.dataset.step = s;
  };

  /** Where the plate goes: its home is the top of the map's window, centred. If that would touch
   *  a home, a tile (its number), a gold "2", a highlight, a target, a ghost or the camera's
   *  controls, the nearest free spot down the map (empty hexes first). */
  const place = () => {
    if (!wrap) return;
    // Futa04's nonblocking instruction is centred by CSS. It has no separate reserved row,
    // and never searches for a free hex or moves when the battlefield changes.
    if (IS_FUTA04) return;
    const B = wrap.getBoundingClientRect();
    const under = parseFloat(getComputedStyle(wrap).getPropertyValue('--cam-under')) || 0;
    const W = { left: B.left, top: B.top, width: B.width, height: Math.max(0, B.height - under) };
    const rect = (e: Element) => e.getBoundingClientRect();
    const hard = [...wrap.querySelectorAll('g.tile, .landmark, .gold-badge, .l-over > *, .badge, .ghost-tile, .ghost-num, .cam-whole, .cam-arrow')].map(rect).filter((r) => r.width > 0);
    const rocks = [...wrap.querySelectorAll('g.hex-cell.rock')].map(rect).filter((r) => r.width > 0);
    type Box = { left: number; top: number; right: number; bottom: number };
    const hit = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const w = plate.offsetWidth;
    const h = plate.offsetHeight;
    const at = (cx: number, cy: number) => ({ left: W.left + cx - w / 2, right: W.left + cx + w / 2, top: W.top + cy - h / 2, bottom: W.top + cy + h / 2 });
    const top = 10 + h / 2;
    // candidates: the home spot first, then down the map in the centre, then the thirds
    const spots: { x: number; y: number }[] = [];
    for (let yi = 0; yi <= 20; yi++) {
      const y = top + ((W.height - h - 20) * yi) / 20;
      for (const xf of [0.5, 0.32, 0.68]) spots.push({ x: Math.min(W.width - w / 2 - 6, Math.max(w / 2 + 6, W.width * xf)), y });
    }
    for (const avoidRocks of [true, false]) {
      const s = spots.find((p) => {
        const r = at(p.x, p.y);
        return !hard.some((x) => hit(r, x)) && (!avoidRocks || !rocks.some((x) => hit(r, x)));
      });
      if (s) return put(s.x, s.y);
    }
    // nowhere free: the home spot, quieter
    cue.classList.add('faint');
    put(W.width / 2, top);
  };
  const put = (x: number, y: number) => {
    cue.style.left = `${x.toFixed(1)}px`;
    cue.style.top = `${y.toFixed(1)}px`;
  };

  const show = () => {
    if (!step || mode === 'off' || document.hidden) return level('off');
    fill(step);
    cue.classList.remove('faint');
    place();
    // the entrance plays again: a fade, a 6px rise, the letters settling, one pass of light
    cue.classList.remove('enter');
    void cue.offsetWidth;
    cue.classList.toggle('still', hooks.reduceMotion());
    cue.classList.add('enter');
    level('hi');
    root.dataset.cueMs = String(Math.round(performance.now() - startedAt));
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
        fill(step);
        place();
      }
      level('hi');
      timers.push(window.setTimeout(() => level('lo'), GUIDE.breath));
    }, GUIDE.idle);
    // pulses come back to full strength after a longer rest
    restTimer = window.setTimeout(() => root.classList.remove('gd-tired'), GUIDE.rest);
  };

  // any input: the plate goes (within 120ms), the idle clock starts again
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
  // a new screen size (a phone turned, a window resized): the plate finds its spot again
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (step && cue.dataset.level !== 'off') {
        cue.classList.remove('faint');
        place();
      }
    }, 120);
  });

  return {
    /**
     * Called on every render with the game's own step (null: none, e.g. game over), the turn
     * number and whether a card is picked.
     */
    update(s: { step: Step | null; turn: number; picked: boolean }) {
      root.dataset.step = s.step ?? 'none';
      root.classList.toggle('gd-picked', s.picked);
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
