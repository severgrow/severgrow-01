import type { Card } from '../../../src/engine/index.js';
import type { MatchIntel } from '../logic/match-intel.js';
import { cardFace, suitClass } from '../ui/effects.js';

export type FocusShape = 'hex' | 'card' | 'pill' | 'none';
export type TutorialWindowButtons = {
  showMe?: boolean;
  skip?: boolean;
  chapters?: boolean;
  next?: boolean;
  playReal?: boolean;
  replayChapter?: boolean;
};
export type TutorialWindowHandlers = {
  onShowMe?: () => void;
  onSkip?: () => void;
  onChapters?: () => void;
  onNext?: () => void;
  onPlayReal?: () => void;
  onReplayChapter?: () => void;
};
export type TutorialFocusOptions = {
  gentle?: boolean;
  arrow?: boolean;
  why?: string;
  shape?: FocusShape;
  chapterCount?: number;
  reduceMotion?: boolean;
  idleHard?: boolean;
  praise?: string | null;
  status?: string | null;
  buttons?: TutorialWindowButtons;
  handlers?: TutorialWindowHandlers;
  turnIcons?: boolean;
};

const CSS = `
#futasaku-glass { position:fixed; z-index:35; box-sizing:border-box; border:1px solid rgba(214,204,177,.14);
  border-radius:15px; overflow:hidden; color:#f0e9dc; background:rgba(8,10,10,.42);
  box-shadow:inset 0 1px rgba(243,232,202,.06),0 10px 28px rgba(0,0,0,.22);
  backdrop-filter:blur(9px) saturate(1.05); -webkit-backdrop-filter:blur(9px) saturate(1.05);
  font:500 13px/1.35 Commissioner,system-ui,sans-serif; }
#futasaku-glass[hidden], #tutorial-focus[hidden] { display:none; }
#futasaku-glass[data-mode='tutorial'] { pointer-events:none; max-width:min(420px,calc(100vw - 24px)); width:min(420px,calc(100vw - 24px));
  left:50%; transform:translateX(-50%); height:auto; background:rgba(8,10,10,.42);
  backdrop-filter:blur(9px) saturate(1.05); -webkit-backdrop-filter:blur(9px) saturate(1.05);
  transition: top 220ms ease, bottom 220ms ease, opacity 120ms ease; }
#futasaku-glass[data-mode='tutorial'] .glass-tutorial { display:flex; flex-direction:column; gap:8px; padding:12px 14px 12px; margin:0; max-width:none;
  min-height:0; border-radius:0; background:transparent; box-shadow:none; pointer-events:none; }
#futasaku-glass[data-mode='tutorial'] .glass-dots { display:flex; flex-wrap:wrap; gap:5px; justify-content:center; }
#futasaku-glass[data-mode='tutorial'] .glass-dot { width:6px; height:6px; border-radius:50%; background:rgba(232,221,201,.28); }
#futasaku-glass[data-mode='tutorial'] .glass-dot[data-on='1'] { background:#e8ddc9; }
#futasaku-glass[data-mode='tutorial'] .glass-instruction { margin:0; font:700 18px/1.25 Commissioner,system-ui,sans-serif; letter-spacing:0; text-transform:none; color:#f6ecd8; text-shadow:0 1px 5px rgba(0,0,0,.55); }
.large-text #futasaku-glass[data-mode='tutorial'] .glass-instruction { font-size:20px; }
#futasaku-glass[data-mode='tutorial'] .glass-why { margin:0; font:500 14px/1.3 Commissioner,system-ui,sans-serif; color:rgba(240,233,220,.7); letter-spacing:0; }
#futasaku-glass[data-mode='tutorial'] .glass-status { margin:0; font:600 14px/1.3 Commissioner,system-ui,sans-serif; color:#e8ddc9; }
#futasaku-glass[data-mode='tutorial'] .glass-icons { display:flex; gap:10px; justify-content:center; }
#futasaku-glass[data-mode='tutorial'] .glass-icons span { font:600 11px/1 Commissioner,system-ui,sans-serif; color:#cbbfa0; letter-spacing:.04em; }
#futasaku-glass[data-mode='tutorial'] .glass-actions { display:flex; flex-wrap:wrap; gap:8px; pointer-events:auto; }
#futasaku-glass[data-mode='tutorial'] .glass-actions button { min-height:44px; min-width:44px; padding:0 14px; border:1px solid rgba(214,204,177,.22);
  border-radius:10px; background:rgba(255,255,255,.05); color:#f0e9dc; font:600 13px/1 Commissioner,system-ui,sans-serif; cursor:pointer; }
#futasaku-glass[data-mode='tutorial'] .glass-actions button:focus-visible { outline:2px solid #e8ddc9; outline-offset:1px; }
#futasaku-glass[data-mode='tutorial'][data-fade='out'] { opacity:0; }
#futasaku-glass[data-mode='tutorial'][data-fade='in'] { opacity:1; }
#futasaku-glass .glass-chapter { color:#bcae8d; font:600 10px/1.1 monospace; letter-spacing:.16em; white-space:nowrap; }
#futasaku-glass .glass-copy { font-weight:650; letter-spacing:.09em; text-wrap:balance; text-shadow:0 1px 5px rgba(0,0,0,.8); }
#futasaku-glass[data-mode='intel'] { pointer-events:auto; display:flex; flex-direction:column; }
#futasaku-glass .intel-bar { display:flex; align-items:center; gap:8px; padding:4px 6px 2px 12px; min-height:44px; }
#futasaku-glass .intel-step { flex:1; min-width:0; font:600 11px/1 monospace; letter-spacing:.14em; color:#cbbfa0; font-variant-numeric:tabular-nums; }
#futasaku-glass .intel-close { width:44px; height:44px; flex:none; border:0; border-radius:9px; background:transparent; color:#e8ddc9; font-size:23px; line-height:1; cursor:pointer; }
#futasaku-glass .intel-close:focus-visible { outline:2px solid #e8ddc9; }
#futasaku-glass .intel-body { padding:2px 13px 12px; min-height:0; overflow:auto; overscroll-behavior:contain; display:flex; flex-direction:column; gap:10px; }
#futasaku-glass .intel-readout { display:grid; gap:4px; min-height:58px; padding:10px 0 8px; border-top:1px solid rgba(229,214,183,.10); border-bottom:1px solid rgba(229,214,183,.10); }
#futasaku-glass .intel-who { font:600 10px/1 monospace; letter-spacing:.18em; color:#b7a98a; }
#futasaku-glass .intel-verb { font:700 28px/1.05 monospace; letter-spacing:.08em; color:#f6ecd8; text-shadow:0 1px 8px rgba(0,0,0,.45); }
#futasaku-glass .intel-detail { font:600 13px/1 monospace; letter-spacing:.12em; color:#e2d4b4; min-height:1em; }
#futasaku-glass .intel-nav { display:flex; align-items:center; gap:8px; }
#futasaku-glass .intel-nav button { flex:1; min-height:40px; border:1px solid rgba(214,204,177,.18); border-radius:8px;
  background:rgba(255,255,255,.03); color:#e8ddc9; font:600 11px/1 monospace; letter-spacing:.14em; cursor:pointer; }
#futasaku-glass .intel-nav button:disabled { opacity:.28; cursor:default; }
#futasaku-glass .intel-nav button:not(:disabled):is(:hover,:focus-visible) { background:rgba(255,255,255,.07); outline:none; }
#futasaku-glass .intel-nav button:focus-visible { outline:2px solid #e8ddc9; outline-offset:1px; }
#futasaku-glass .intel-meters { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px 10px; }
#futasaku-glass .intel-meter { display:grid; gap:2px; min-width:0; }
#futasaku-glass .intel-meter span { font:600 9px/1 monospace; letter-spacing:.14em; color:#b7a98a; }
#futasaku-glass .intel-meter b { font:700 14px/1.1 monospace; letter-spacing:.04em; color:#f4ebda; font-variant-numeric:tabular-nums; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#futasaku-glass .intel-cards { display:flex; flex-wrap:wrap; align-items:flex-start; gap:5px; }
#futasaku-glass .intel-card-wrap { position:relative; flex:none; }
#futasaku-glass .intel-card { display:block; position:relative; width:26px; height:37px; border-radius:3px; box-sizing:border-box; overflow:hidden; background:#171918; border:1px solid #958a70; }
#futasaku-glass .intel-card .futa04-card-art { position:absolute; inset:0; display:block; border-radius:inherit; background-size:300% 300%; background-repeat:no-repeat; }
#futasaku-glass .intel-card.fruit .futa04-card-art { background-size:cover; background-position:center; }
#futasaku-glass .intel-card .c-num { position:absolute; top:1px; left:2px; z-index:1; font:800 11px/1 monospace; }
#futasaku-glass .intel-card .c-suit { display:none; }
#futasaku-glass .intel-card-count { position:absolute; right:-3px; bottom:-3px; min-width:13px; height:13px; padding:0 2px; border-radius:5px; background:#24221e; border:1px solid #a99c81; font:700 9px/12px monospace; text-align:center; }
#futasaku-glass .intel-observation { margin:0; color:#d3c4a3; font-size:10px; letter-spacing:.09em; }
#tutorial-focus { position:fixed; inset:0; z-index:34; pointer-events:none; width:100vw; height:100dvh; overflow:visible; }
#tutorial-focus .focus-dim { fill:rgba(1,3,3,.40); }
#tutorial-focus .focus-glow { fill:none; stroke:#e9d8ad; stroke-width:2; filter:drop-shadow(0 0 6px rgba(233,216,173,.55)); transform-box:fill-box; transform-origin:center; }
#tutorial-focus .focus-glow-soft { fill:rgba(233,216,173,.08); stroke:none; }
#tutorial-focus[data-pulse='1'] .focus-glow { animation:tutorial-glow-pulse 1.4s ease-in-out infinite; }
@keyframes tutorial-glow-pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.04); } }
#tutorial-focus .focus-pointer { filter:drop-shadow(0 3px 6px rgba(0,0,0,.45)); }
#tutorial-focus .focus-pointer-body { fill:#e9d8ad; stroke:#1a1814; stroke-width:2.2; stroke-linejoin:round; }
#tutorial-focus[data-bob='1'] .focus-pointer { animation:tutorial-pointer-bob .7s ease-in-out infinite alternate; }
#tutorial-focus[data-bob='hard'] .focus-pointer { animation:tutorial-pointer-bob-hard .55s ease-in-out infinite alternate; }
@keyframes tutorial-pointer-bob { from { transform:translate(0,0); } to { transform:translate(var(--bob-x,0px),var(--bob-y,8px)); } }
@keyframes tutorial-pointer-bob-hard { from { transform:translate(0,0); } to { transform:translate(var(--bob-x,0px),var(--bob-y,14px)); } }
#tutorial-focus.nudge .focus-glow { animation:tutorial-nudge .16s ease-out; }
@keyframes tutorial-nudge { 25% { transform:translateX(-4px); } 75% { transform:translateX(4px); } }
.reduce-motion #tutorial-focus .focus-glow, .reduce-motion #tutorial-focus .focus-pointer,
.reduce-motion #tutorial-focus.nudge .focus-glow { animation:none !important; }
@media (prefers-reduced-motion:reduce) {
  #futasaku-glass[data-mode='tutorial'] { transition: opacity 120ms ease; }
  #tutorial-focus .focus-glow, #tutorial-focus .focus-pointer, #tutorial-focus.nudge .focus-glow { animation:none !important; }
}
`;

const rectOf = (element: Element) => element.getBoundingClientRect();
const safe = (text: string) => text.replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Pt = { x: number; y: number };
type Tracked = { cx: number; cy: number; hole: string; ring: string; soft: string; w: number; h: number; left: number; top: number; right: number; bottom: number };

const boxQuad = (el: Element): Pt[] => {
  const withQuads = el as Element & { getBoxQuads?: (opts?: { box?: string }) => Array<{ p1: Pt; p2: Pt; p3: Pt; p4: Pt }> };
  if (typeof withQuads.getBoxQuads === 'function') {
    try {
      const q = withQuads.getBoxQuads({ box: 'border' })[0];
      if (q) return [q.p1, q.p2, q.p3, q.p4];
    } catch { /* fall through */ }
  }
  const r = rectOf(el);
  return [{ x: r.left, y: r.top }, { x: r.right, y: r.top }, { x: r.right, y: r.bottom }, { x: r.left, y: r.bottom }];
};

const poly = (pts: Pt[]) => pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

const hexPts = (el: Element): Pt[] => {
  const path = el.querySelector('path.hex, path') as SVGGeometryElement | null;
  if (path && typeof path.getTotalLength === 'function' && path.getScreenCTM()) {
    const ctm = path.getScreenCTM()!;
    const len = path.getTotalLength();
    const out: Pt[] = [];
    for (let i = 0; i < 6; i++) {
      const p = path.getPointAtLength((len * i) / 6);
      out.push({ x: ctm.a * p.x + ctm.c * p.y + ctm.e, y: ctm.b * p.x + ctm.d * p.y + ctm.f });
    }
    return out;
  }
  const r = rectOf(el);
  const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
  const rw = r.width / 2; const rh = r.height / 2;
  return [
    { x: cx - rw * 0.5, y: cy - rh }, { x: cx + rw * 0.5, y: cy - rh }, { x: cx + rw, y: cy },
    { x: cx + rw * 0.5, y: cy + rh }, { x: cx - rw * 0.5, y: cy + rh }, { x: cx - rw, y: cy },
  ];
};

const measureTarget = (selector: string, shape: FocusShape): Tracked | null => {
  if (!selector || shape === 'none') return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = rectOf(el);
  if (r.width <= 0 || r.height <= 0) return null;
  const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
  if (shape === 'hex') {
    const pts = hexPts(el);
    const points = poly(pts);
    return { cx, cy, hole: `<polygon points="${points}" fill="black"/>`, ring: `<polygon class="focus-glow" points="${points}"/>`, soft: `<polygon class="focus-glow-soft" points="${points}"/>`, w: r.width, h: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  if (shape === 'card') {
    const pts = boxQuad(el);
    const points = poly(pts);
    return { cx, cy, hole: `<polygon points="${points}" fill="black"/>`, ring: `<polygon class="focus-glow" points="${points}"/>`, soft: `<polygon class="focus-glow-soft" points="${points}"/>`, w: r.width, h: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  const padX = 6; const padY = 6;
  const x = r.left - padX; const y = r.top - padY; const w = r.width + padX * 2; const h = r.height + padY * 2;
  const rx = Math.min(18, h / 2);
  return {
    cx, cy,
    hole: `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" fill="black"/>`,
    ring: `<rect class="focus-glow" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}"/>`,
    soft: `<rect class="focus-glow-soft" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}"/>`,
    w: r.width, h: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom,
  };
};

const POINTER = `<g class="focus-pointer"><path class="focus-pointer-body" d="M18 6c1.2-2.4 4.8-1.6 5.2 1.2l2.2 16.4 4.6-3.4c1.6-1.2 3.8-.2 3.4 1.8l-3.2 14.2c-.6 2.6-3.2 4.2-5.8 3.6L8.2 36.2c-2.2-.6-3.2-3.2-2-5.2l6.4-10.2-5.8 2.2c-2 .8-4-.8-3.4-2.8L18 6z"/></g>`;

export type GlassSurface = ReturnType<typeof mountGlassSurface>;
export const mountGlassSurface = (onClose: () => void) => {
  const style = document.createElement('style'); style.id = 'futasaku-glass-style'; style.textContent = CSS; document.head.append(style);
  const panel = document.createElement('section'); panel.id = 'futasaku-glass'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Match details');
  const focus = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); focus.id = 'tutorial-focus'; focus.setAttribute('hidden', '');
  focus.setAttribute('aria-hidden', 'true');
  document.body.append(focus, panel);
  const dock = document.getElementById('dock')!;
  let targetSelector = '';
  let targetShape: FocusShape = 'pill';
  let mode: 'tutorial' | 'intel' | null = null;
  let moveCursor = -1;
  let lastMoveLen = -1;
  let reduceMotion = false;
  let idleHard = false;
  let raf = 0;
  let holdUntil = 0;
  let smooth: Tracked | null = null;
  let panelSide: 'top' | 'bottom' = 'bottom';
  let handlers: TutorialWindowHandlers = {};
  const showFocus = (show: boolean) => show ? focus.removeAttribute('hidden') : focus.setAttribute('hidden', '');

  const stopLoop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const placeIntel = () => {
    const d = rectOf(dock);
    panel.style.left = `${Math.max(6, d.left + 6)}px`;
    panel.style.width = `${Math.max(0, Math.min(innerWidth - 12, d.width - 12))}px`;
    panel.style.top = `${Math.max(6, d.top + 4)}px`;
    panel.style.height = `${Math.max(140, Math.min(innerHeight - d.top - 8, d.height - 8))}px`;
    panel.style.bottom = '';
    panel.style.transform = '';
  };

  const placeTutorialPanel = (tracked: Tracked | null) => {
    const safeTop = 12;
    const safeBottom = Math.max(12, innerHeight - (dock.getBoundingClientRect().top - 8));
    const height = panel.offsetHeight || 120;
    const targetTop = tracked?.top ?? innerHeight / 2;
    const targetBottom = tracked?.bottom ?? innerHeight / 2;
    const roomAbove = targetTop - safeTop;
    const roomBelow = safeBottom - targetBottom;
    const preferTop = roomAbove >= roomBelow && roomAbove >= height + 16;
    const nextSide: 'top' | 'bottom' = preferTop ? 'top' : 'bottom';
    panelSide = nextSide;
    panel.style.width = `${Math.min(420, innerWidth - 24)}px`;
    panel.style.height = 'auto';
    panel.style.left = '50%';
    panel.style.transform = 'translateX(-50%)';
    if (nextSide === 'top') {
      panel.style.top = `${safeTop}px`;
      panel.style.bottom = '';
    } else {
      panel.style.bottom = `${Math.max(12, innerHeight - safeBottom)}px`;
      panel.style.top = '';
    }
  };

  const pointerPose = (tracked: Tracked, panelRect: DOMRect) => {
    const space = [
      { side: 'left' as const, room: tracked.left - 16 },
      { side: 'right' as const, room: innerWidth - tracked.right - 16 },
      { side: 'top' as const, room: tracked.top - 16 },
      { side: 'bottom' as const, room: innerHeight - tracked.bottom - 16 },
    ].sort((a, b) => b.room - a.room);
    const pick = space.find(s => {
      if (s.side === 'top' && panelSide === 'top') return false;
      if (s.side === 'bottom' && panelSide === 'bottom') return false;
      return s.room >= 56;
    }) ?? space[0]!;
    let x = tracked.cx - 18; let y = tracked.cy - 18;
    let bobX = 0; let bobY = 8;
    if (pick.side === 'left') { x = Math.max(8, tracked.left - 54); y = tracked.cy - 24; bobX = 8; bobY = 0; }
    if (pick.side === 'right') { x = Math.min(innerWidth - 56, tracked.right + 8); y = tracked.cy - 24; bobX = -8; bobY = 0; }
    if (pick.side === 'top') { x = tracked.cx - 18; y = Math.max(8, tracked.top - 56); bobX = 0; bobY = 8; }
    if (pick.side === 'bottom') { x = tracked.cx - 18; y = Math.min(innerHeight - 56, tracked.bottom + 8); bobX = 0; bobY = -8; }
    if (x < panelRect.right && x + 48 > panelRect.left && y < panelRect.bottom && y + 48 > panelRect.top) {
      y = panelSide === 'top' ? panelRect.bottom + 8 : panelRect.top - 56;
    }
    x = Math.min(innerWidth - 56, Math.max(8, x));
    y = Math.min(innerHeight - 56, Math.max(8, y));
    return { x, y, bobX, bobY };
  };

  const paintFocus = (tracked: Tracked | null) => {
    focus.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    focus.dataset.pulse = reduceMotion || !tracked ? '0' : '1';
    focus.dataset.bob = reduceMotion || !tracked ? '0' : idleHard ? 'hard' : '1';
    if (!tracked) {
      focus.innerHTML = `<rect class="focus-dim" width="100%" height="100%"/>`;
      return;
    }
    const panelRect = panel.getBoundingClientRect();
    const pose = pointerPose(tracked, panelRect);
    focus.style.setProperty('--bob-x', `${pose.bobX}px`);
    focus.style.setProperty('--bob-y', `${pose.bobY}px`);
    focus.innerHTML = `<defs><mask id="tutorial-cutouts"><rect width="100%" height="100%" fill="white"/>${tracked.hole}</mask></defs>`
      + `<rect class="focus-dim" width="100%" height="100%" mask="url(#tutorial-cutouts)"/>`
      + tracked.soft + tracked.ring
      + `<g transform="translate(${pose.x.toFixed(1)} ${pose.y.toFixed(1)}) scale(0.92)">${POINTER}</g>`;
  };

  const tick = (now: number) => {
    raf = 0;
    if (mode !== 'tutorial' || document.hidden) return;
    const measured = measureTarget(targetSelector, targetShape);
    if (measured) {
      holdUntil = now + 200;
      if (!smooth) smooth = measured;
      else {
        const t = 0.55;
        smooth = {
          ...measured,
          cx: lerp(smooth.cx, measured.cx, t),
          cy: lerp(smooth.cy, measured.cy, t),
          left: lerp(smooth.left, measured.left, t),
          top: lerp(smooth.top, measured.top, t),
          right: lerp(smooth.right, measured.right, t),
          bottom: lerp(smooth.bottom, measured.bottom, t),
          w: lerp(smooth.w, measured.w, t),
          h: lerp(smooth.h, measured.h, t),
          hole: measured.hole,
          ring: measured.ring,
          soft: measured.soft,
        };
      }
      placeTutorialPanel(smooth);
      paintFocus(smooth);
    } else if (now < holdUntil && smooth) {
      placeTutorialPanel(smooth);
      paintFocus(smooth);
    } else {
      smooth = null;
      placeTutorialPanel(null);
      paintFocus(null);
    }
    raf = requestAnimationFrame(tick);
  };

  const startLoop = () => {
    if (raf || mode !== 'tutorial') return;
    raf = requestAnimationFrame(tick);
  };

  const place = () => {
    if (!mode) return;
    if (mode === 'intel') return placeIntel();
    placeTutorialPanel(smooth);
    if (!raf) startLoop();
  };

  const observer = new ResizeObserver(place); observer.observe(dock);
  window.addEventListener('resize', place, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else if (mode === 'tutorial') startLoop();
  });

  const close = () => {
    mode = null; moveCursor = -1; lastMoveLen = -1; stopLoop(); smooth = null;
    panel.hidden = true; showFocus(false); panel.replaceChildren(); onClose();
  };

  const bindTutorialButtons = () => {
    panel.querySelector<HTMLButtonElement>('[data-tut="show-me"]')?.addEventListener('click', e => { e.preventDefault(); handlers.onShowMe?.(); });
    panel.querySelector<HTMLButtonElement>('[data-tut="skip"]')?.addEventListener('click', e => { e.preventDefault(); handlers.onSkip?.(); });
    panel.querySelector<HTMLButtonElement>('[data-tut="chapters"]')?.addEventListener('click', e => { e.preventDefault(); handlers.onChapters?.(); });
    panel.querySelector<HTMLButtonElement>('[data-tut="next"]')?.addEventListener('click', e => { e.preventDefault(); handlers.onNext?.(); });
    panel.querySelector<HTMLButtonElement>('[data-tut="play"]')?.addEventListener('click', e => { e.preventDefault(); handlers.onPlayReal?.(); });
    panel.querySelector<HTMLButtonElement>('[data-tut="replay"]')?.addEventListener('click', e => { e.preventDefault(); handlers.onReplayChapter?.(); });
  };

  const renderTutorialWindow = (
    instruction: string,
    chapter: number,
    options: TutorialFocusOptions,
  ) => {
    const count = options.chapterCount ?? 13;
    const dots = Array.from({ length: count }, (_, i) => `<span class="glass-dot" data-on="${i === chapter ? 1 : 0}"></span>`).join('');
    const line = options.praise || options.status || instruction;
    const why = options.praise || options.status ? '' : (options.why ? `<p class="glass-why">${safe(options.why)}</p>` : '');
    const icons = options.turnIcons
      ? `<div class="glass-icons" aria-hidden="true"><span>Draw</span><span>Grow</span><span>Throw</span></div>` : '';
    const b = options.buttons ?? {};
    const actions = [
      b.showMe ? `<button type="button" data-tut="show-me">Show me</button>` : '',
      b.next ? `<button type="button" data-tut="next">Next</button>` : '',
      b.skip ? `<button type="button" data-tut="skip">Skip</button>` : '',
      b.chapters ? `<button type="button" data-tut="chapters">Chapters</button>` : '',
      b.playReal ? `<button type="button" data-tut="play">Play a real game</button>` : '',
      b.replayChapter ? `<button type="button" data-tut="replay">Replay a chapter</button>` : '',
    ].filter(Boolean).join('');
    panel.innerHTML = `<div class="glass-tutorial"><div class="glass-dots" aria-hidden="true">${dots}</div>`
      + `<p class="glass-instruction glass-copy">${safe(line)}</p>${why}${icons}`
      + (actions ? `<div class="glass-actions">${actions}</div>` : '')
      + `</div>`;
    bindTutorialButtons();
  };

  const tutorial = (text: string, chapter: number, selectors: readonly string[], options: TutorialFocusOptions = {}) => {
    mode = 'tutorial';
    handlers = options.handlers ?? {};
    reduceMotion = !!options.reduceMotion || document.documentElement.classList.contains('reduce-motion');
    idleHard = !!options.idleHard;
    // One target only — never light every card.
    targetSelector = selectors[0] ?? '';
    targetShape = options.shape
      ?? (targetSelector.includes('#hand .card') ? 'card'
        : targetSelector.includes('.hex-cell') || targetSelector.includes('#board') ? 'hex'
          : targetSelector ? 'pill' : 'none');
    panel.dataset.mode = 'tutorial';
    panel.dataset.focus = targetSelector.includes('#deck') ? 'deck' : targetSelector.includes('#discard') ? 'discard' : 'other';
    panel.hidden = false;
    showFocus(true);
    panel.setAttribute('aria-label', 'Tutorial guidance');
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.dataset.fade = 'out';
    renderTutorialWindow(text, chapter, options);
    requestAnimationFrame(() => {
      panel.dataset.fade = 'in';
      smooth = null;
      startLoop();
      place();
    });
  };

  const renderIntel = (data: MatchIntel) => {
    const total = data.moves.length;
    if (total !== lastMoveLen) {
      moveCursor = total ? total - 1 : -1;
      lastMoveLen = total;
    } else if (total) {
      moveCursor = Math.max(0, Math.min(total - 1, moveCursor < 0 ? total - 1 : moveCursor));
    } else moveCursor = -1;
    const move = total && moveCursor >= 0 ? data.moves[moveCursor]! : null;
    const stepLabel = total ? `${pad(total - moveCursor)} / ${pad(total)}` : '00 / 00';
    const groups = new Map<string, { card: Card; count: number }>();
    for (const card of data.discarded) {
      const key = `${card.suit}:${card.rank}`;
      const group = groups.get(key);
      if (group) group.count++;
      else groups.set(key, { card, count: 1 });
    }
    const sorted = [...groups.values()].sort((a, b) => (a.card.suit ?? 4) - (b.card.suit ?? 4) || a.card.rank - b.card.rank);
    const cards = sorted.map(({ card, count }) => `<span class="intel-card-wrap" title="${card.suit === null ? 'Bomb' : `Suit ${card.suit + 1}, ${card.rank}`}${count > 1 ? ` — seen ${count} times` : ''}"><span class="intel-card card ${suitClass(card)}">${cardFace(card)}</span>${count > 1 ? `<span class="intel-card-count">${count}</span>` : ''}</span>`).join('');
    const who = move ? (move.who === 'you' ? 'YOU' : 'OPP') : 'MATCH';
    const verb = move ? move.verb : (data.discarded.length ? 'FACE' : 'READY');
    const detail = move?.detail ?? (data.discarded.length ? 'OPEN PILE' : 'NO MOVES YET');
    panel.innerHTML = `<div class="intel-bar"><span class="intel-step" aria-live="polite">${stepLabel}</span><button class="intel-close" type="button" aria-label="Close">×</button></div><div class="intel-body"><div class="intel-readout"><span class="intel-who">${who}</span><span class="intel-verb">${safe(verb)}</span><span class="intel-detail">${safe(detail)}</span></div><div class="intel-nav"><button type="button" class="intel-newer" ${!total || moveCursor >= total - 1 ? 'disabled' : ''}>‹ NEWER</button><button type="button" class="intel-older" ${!total || moveCursor <= 0 ? 'disabled' : ''}>OLDER ›</button></div><div class="intel-meters"><label class="intel-meter"><span>SCORE</span><b>${data.score[0]}:${data.score[1]}</b></label><label class="intel-meter"><span>TILES</span><b>${data.territory[0]}:${data.territory[1]}</b></label><label class="intel-meter"><span>DECK</span><b>${data.deckCount}</b></label><label class="intel-meter"><span>OPP</span><b>${data.oppHand}</b></label><label class="intel-meter"><span>BOMBS</span><b>${data.fruitUnseen}</b></label><label class="intel-meter"><span>TURN</span><b>${data.turn}</b></label></div><div class="intel-cards">${cards || ''}</div>${data.observation ? `<p class="intel-observation">${safe(data.observation)}</p>` : ''}</div>`;
    panel.querySelector('.intel-close')?.addEventListener('click', close, { once: true });
    panel.querySelector('.intel-newer')?.addEventListener('click', () => { if (moveCursor < lastMoveLen - 1) { moveCursor++; renderIntel(data); } });
    panel.querySelector('.intel-older')?.addEventListener('click', () => { if (moveCursor > 0) { moveCursor--; renderIntel(data); } });
    requestAnimationFrame(place);
  };

  const intel = (data: MatchIntel) => {
    mode = 'intel'; stopLoop(); smooth = null;
    panel.dataset.mode = 'intel'; panel.hidden = false; showFocus(false);
    panel.setAttribute('aria-label', 'Match details'); panel.setAttribute('role', 'dialog');
    panel.removeAttribute('aria-live');
    renderIntel(data);
  };

  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });

  return {
    tutorial,
    intel,
    close,
    hide: () => { mode = null; moveCursor = -1; lastMoveLen = -1; stopLoop(); smooth = null; panel.hidden = true; showFocus(false); },
    nudge: () => {
      if (reduceMotion) return;
      focus.classList.remove('nudge');
      void focus.getBoundingClientRect();
      focus.classList.add('nudge');
    },
    refresh: place,
    isOpen: () => mode === 'intel',
    /** Test hook: last smoothed glow centre. */
    focusCentre: () => smooth ? { x: smooth.cx, y: smooth.cy } : null,
    setIdleHard: (hard: boolean) => { idleHard = hard; },
  };
};
