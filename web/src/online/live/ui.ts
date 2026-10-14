// Live duels — the DOM pieces. Same dark glass, moss and lava, same fonts; no new visual language.
// Everything is created here and appended to existing containers; no shared markup is edited.
import { LIVE } from '../../../../src/strings.js';
import { glassBaseCss } from '../../player/glass-surface.js';
import type { ChallengeWire } from './api.js';
import type { PopupPort } from './center.js';

const MOSS = '#8fbf6a';
const MOSS_INK = '#0d100d';
const LAVA = '#e0735c';
const CREAM = '#f0e9dc';

const CSS = `
${glassBaseCss('.live-glass')}
.live-glass { z-index:90; }
.live-glass[hidden], .live-scrim[hidden], .live-ring[hidden], .live-vignette[hidden] { display:none !important; }
.live-scrim { position:fixed; inset:0; z-index:89; background:rgba(4,6,5,.34); touch-action:none; }
.live-glass[data-mode='challenge'], .live-glass[data-mode='end'] { left:50%; top:max(14px, env(safe-area-inset-top, 0px)); transform:translateX(-50%);
  width:min(360px, calc(100vw - 32px)); padding:14px 14px 12px; display:grid; grid-template-columns:44px 1fr; gap:4px 12px; align-items:center;
  background:rgba(8,10,10,.78); }
.live-glass[data-mode='note'] { left:50%; top:max(14px, env(safe-area-inset-top, 0px)); transform:translateX(-50%); padding:10px 16px;
  max-width:calc(100vw - 32px); background:rgba(8,10,10,.72); pointer-events:none; letter-spacing:.06em; }
.live-glass .lg-ring { grid-row:1 / span 3; width:44px; height:44px; }
.live-glass .lg-ring circle { fill:none; stroke-width:3; }
.live-glass .lg-ring .bg { stroke:rgba(214,204,177,.16); }
.live-glass .lg-ring .fg { stroke:${MOSS}; stroke-linecap:round; transform:rotate(-90deg); transform-origin:50% 50%; }
.live-glass .lg-dot { width:10px; height:10px; border-radius:50%; background:${LAVA}; box-shadow:0 0 10px ${LAVA}; justify-self:center; grid-row:1 / span 3; }
.live-glass .lg-name { font:700 16px/1.2 var(--font-ui,'Fragment Mono',ui-monospace,monospace); color:${CREAM}; letter-spacing:.04em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.live-glass .lg-what { color:#e2d4b4; letter-spacing:.05em; }
.live-glass .lg-terms { color:#b7a98a; font-size:12px; letter-spacing:.08em; }
.live-glass .lg-actions { grid-column:1 / -1; display:flex; gap:8px; margin-top:10px; }
.live-glass .lg-actions button { flex:1; min-height:44px; min-width:44px; border-radius:10px; font:700 14px/1 var(--font-ui,'Fragment Mono',ui-monospace,monospace);
  letter-spacing:.08em; cursor:pointer; border:1px solid rgba(214,204,177,.22); background:rgba(255,255,255,.04); color:${CREAM}; }
.live-glass .lg-actions button.primary { background:${MOSS}; border-color:${MOSS}; color:${MOSS_INK}; }
.live-glass .lg-actions button:focus-visible { outline:2px solid ${CREAM}; outline-offset:2px; }
.live-pill { order:3; flex:0 0 auto; display:inline-flex; align-items:center; gap:6px; min-height:32px; padding:0 10px; margin:6px 0;
  border-radius:999px; border:1px solid rgba(143,191,106,.45); background:rgba(8,10,10,.42); color:${CREAM};
  font:600 12px/1 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.06em; white-space:nowrap; cursor:pointer;
  position:relative; pointer-events:auto; } /* the strip is click-through; the pill is a real control */
.live-pill::after { content:''; position:absolute; inset:-6px 0; } /* 44px touch target */
.live-pill .dot { width:7px; height:7px; border-radius:50%; background:${MOSS}; box-shadow:0 0 6px ${MOSS}; }
.live-pill[disabled] { opacity:.62; cursor:default; border-color:rgba(214,204,177,.18); }
.live-pill[disabled] .dot { background:#b7a98a; box-shadow:none; }
.live-pill[data-state='waiting'] .dot { animation:live-breathe 1.2s ease-in-out infinite; }
.live-pill[data-state='waiting'] { flex:0 1 auto; min-width:0; max-width:100%; }
.live-pill .label { min-width:0; overflow:hidden; text-overflow:ellipsis; }
.live-pill .label .full { display:none; }
@media (min-width: 560px) { .live-pill .label .full { display:inline; } .live-pill .label .short { display:none; } }
.live-pill .secs { flex:none; font-variant-numeric:tabular-nums; }
.live-pill .secs:empty { display:none; }
.live-on [data-duel-urgency][data-live-clock] { display:inline-flex !important; } /* the live clock owns this slot */
.live-pill .cancel { margin-left:4px; padding:0 0 0 8px; border-left:1px solid rgba(214,204,177,.22); color:#e2d4b4; }
.live-pill[hidden], .live-chip[hidden] { display:none; }
.live-chip { order:-1; flex:0 0 auto; display:inline-flex; align-items:center; gap:6px; min-height:24px; padding:0 8px; border-radius:6px;
  background:rgba(224,115,92,.14); border:1px solid rgba(224,115,92,.55); color:#f6d3c8;
  font:800 11px/1 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.14em; font-variant-numeric:tabular-nums; white-space:nowrap; }
.live-chip .lamp { width:6px; height:6px; border-radius:50%; background:${LAVA}; box-shadow:0 0 8px ${LAVA}; }
.live-chip .strikes { display:inline-flex; gap:3px; margin-left:2px; }
.live-chip .strikes i { width:5px; height:5px; border-radius:50%; border:1px solid rgba(246,211,200,.6); }
.live-chip .strikes i.on { background:${LAVA}; border-color:${LAVA}; }
.live-chip[data-urgent='1'] { background:rgba(224,115,92,.28); color:#fff; }
.live-chip.lighting { animation:live-light 600ms ease-out 1; }
/* The live clock in the duel strip (the header's own "invisible box" between the menu button and
   the logo). Always visible during live play, slim, on the header's surface: no frame, no fill,
   no border of its own — just the words, in the material of whose turn it is. Never colour alone
   (the time is the words); the ambient screen reader line stays silent and the thresholds are
   announced by the live module's own announcer. */
.duel-hud [data-live-clock] { order:2; flex:0 0 auto; display:inline-flex; align-items:center; gap:5px;
  font-variant-numeric:tabular-nums; letter-spacing:.04em; color:#8fbf6a; background:none; border:0; }
.duel-hud [data-live-clock][data-side='opp'] { color:#e0735c; }
.duel-hud [data-live-clock][data-urgent='1'] { color:#f6d3c8; }
.duel-hud [data-live-clock][data-side='me'][data-urgent='1'] { color:#d9efc2; }
.duel-hud [data-live-clock] .live-clock-dot { width:6px; height:6px; border-radius:50%; background:currentColor; opacity:.85; }
.large-text .duel-hud [data-live-clock] { font-size:15px; }
.live-ring { position:fixed; z-index:7; pointer-events:none; }
/* The home timeout ring: a thin, tight arc in the turn-owner's own material, inset from the tile
   so it reads as one ornamental line rather than a hoop around it. Subtle at rest; it thickens and
   brightens as the clock runs low (shape + weight, so Reduce motion still shows urgency). */
.live-ring circle { fill:none; }
.live-ring .bg { stroke:rgba(240,233,220,.10); stroke-width:1.4; }
.live-ring .fg { stroke:${MOSS}; stroke-width:1.6; stroke-linecap:butt; transform:rotate(-90deg); transform-origin:50% 50%; opacity:.9; }
.live-ring[data-side='opp'] .fg { stroke:${LAVA}; }
.live-ring[data-urgent='1'] .bg { stroke:rgba(240,233,220,.16); stroke-width:1.6; }
.live-ring[data-urgent='1'] .fg { stroke:${LAVA}; stroke-width:2.2; opacity:1; filter:drop-shadow(0 0 2px rgba(224,115,92,.5)); }
.live-ring.pulse { animation:live-pulse 600ms ease-out 1; }
.live-vignette { position:fixed; inset:0; z-index:6; pointer-events:none; box-shadow:inset 0 0 70px rgba(224,115,92,.0); transition:box-shadow .3s ease; }
.live-vignette[data-on='1'] { box-shadow:inset 0 0 70px rgba(224,115,92,.22); }
.live-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
.live-setting small { display:block; opacity:.7; font-size:.8em; }
@keyframes live-breathe { 0%,100% { opacity:1 } 50% { opacity:.35 } }
@keyframes live-light { 0% { box-shadow:0 0 0 rgba(224,115,92,0); transform:scale(.9); } 40% { box-shadow:0 0 18px rgba(224,115,92,.7); transform:scale(1.06); } 100% { box-shadow:0 0 0 rgba(224,115,92,0); transform:scale(1); } }
@keyframes live-pulse { 0% { transform:scale(1); opacity:1 } 50% { transform:scale(1.35); opacity:.6 } 100% { transform:scale(1); opacity:1 } }
.large-text .live-glass .lg-name { font-size:19px; }
.large-text .live-glass .lg-actions button, .large-text .live-pill { font-size:15px; }
.large-text .live-chip { font-size:13px; }
.reduce-motion .live-chip.lighting, .reduce-motion .live-ring.pulse, .reduce-motion .live-pill[data-state='waiting'] .dot { animation:none !important; }
@media (prefers-reduced-motion: reduce) { .live-chip.lighting, .live-ring.pulse, .live-pill[data-state='waiting'] .dot { animation:none !important; } }
`;

export const injectLiveStyles = (): void => {
  if (document.getElementById('futasaku-live-style')) return;
  const style = document.createElement('style');
  style.id = 'futasaku-live-style';
  style.textContent = CSS;
  document.head.append(style);
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

const SVGNS = 'http://www.w3.org/2000/svg';
const ringSvg = (cls: string, size: number, r: number): { svg: SVGSVGElement; fg: SVGCircleElement; length: number } => {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('aria-hidden', 'true');
  const bg = document.createElementNS(SVGNS, 'circle');
  const fg = document.createElementNS(SVGNS, 'circle');
  for (const c of [bg, fg]) {
    c.setAttribute('cx', String(size / 2));
    c.setAttribute('cy', String(size / 2));
    c.setAttribute('r', String(r));
  }
  bg.setAttribute('class', 'bg');
  fg.setAttribute('class', 'fg');
  const length = 2 * Math.PI * r;
  fg.style.strokeDasharray = `${length}`;
  svg.append(bg, fg);
  return { svg, fg, length };
};

/** A screen-reader line (polite). Only ever written at thresholds. */
export const createAnnouncer = (): ((text: string) => void) => {
  const box = el('div', 'live-sr');
  box.setAttribute('aria-live', 'polite');
  box.setAttribute('role', 'status');
  document.body.append(box);
  return (text) => {
    box.textContent = '';
    window.setTimeout(() => (box.textContent = text), 30);
  };
};

/** The challenge pop-up: the glass window in challenge mode, over a scrim so the game ignores taps. */
export const createChallengePopup = (opts: { localDeadline: (c: ChallengeWire) => number; onShown?: () => void }): PopupPort & { element: HTMLElement } => {
  const scrim = el('div', 'live-scrim');
  scrim.hidden = true;
  const panel = el('section', 'live-glass');
  panel.dataset.mode = 'challenge';
  panel.hidden = true;
  panel.setAttribute('role', 'alertdialog');
  panel.setAttribute('aria-modal', 'true');
  const { svg, fg, length } = ringSvg('lg-ring', 44, 19);
  const name = el('div', 'lg-name');
  const what = el('div', 'lg-what');
  const terms = el('div', 'lg-terms');
  const actions = el('div', 'lg-actions');
  const accept = el('button', 'primary', LIVE.accept);
  const decline = el('button', '', LIVE.notNow);
  accept.type = decline.type = 'button';
  accept.dataset.live = 'accept';
  decline.dataset.live = 'decline';
  actions.append(decline, accept);
  panel.append(svg, name, what, terms, actions);
  const titleId = 'live-challenge-title';
  name.id = titleId;
  panel.setAttribute('aria-labelledby', titleId);
  // The game beneath ignores every tap while the window is open.
  for (const type of ['pointerdown', 'pointerup', 'click', 'touchstart']) {
    scrim.addEventListener(type, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }
  document.body.append(scrim, panel);
  let open = false;
  let raf = 0;
  let current: ChallengeWire | null = null;
  let handlers: { accept: () => void; decline: () => void } | null = null;
  accept.addEventListener('click', () => handlers?.accept());
  decline.addEventListener('click', () => handlers?.decline());
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') handlers?.decline();
  });
  const draw = () => {
    if (!open || !current) return;
    const end = opts.localDeadline(current);
    const total = current.expiresAt - current.createdAt;
    const left = Math.max(0, end - Date.now());
    fg.style.strokeDashoffset = `${length * (1 - left / total)}`;
    raf = requestAnimationFrame(draw);
  };
  return {
    element: panel,
    show(c, a) {
      current = c;
      handlers = a;
      name.textContent = c.fromName ?? '';
      what.textContent = c.kind === 'rematch' ? LIVE.wantsRematch : LIVE.wantsToGoLive;
      terms.textContent = LIVE.terms(Math.round(c.limitMs / 1000));
      scrim.hidden = panel.hidden = false;
      open = true;
      accept.focus({ preventScroll: true });
      cancelAnimationFrame(raf);
      draw();
      opts.onShown?.();
    },
    hide() {
      open = false;
      cancelAnimationFrame(raf);
      scrim.hidden = panel.hidden = true;
      current = null;
      handlers = null;
    },
    isOpen: () => open,
  };
};

/** A quiet glass line ("Fern: Not now"). */
export const createGlassNote = (): ((text: string, ms?: number) => void) => {
  const note = el('div', 'live-glass');
  note.dataset.mode = 'note';
  note.setAttribute('role', 'status');
  note.hidden = true;
  document.body.append(note);
  let t = 0;
  return (text, ms = 2600) => {
    note.textContent = text;
    note.hidden = false;
    window.clearTimeout(t);
    t = window.setTimeout(() => (note.hidden = true), ms);
  };
};

export type PillModel =
  | { kind: 'hidden' }
  | { kind: 'ready'; name: string; secs: number }
  | { kind: 'disabled'; label: string }
  | { kind: 'waiting'; label: string; name: string; secs: number };

/** The quiet "● Go live" pill in the duel status strip (appended into #duel-hud). */
export const createPill = (onTap: () => void, onCancel: () => void) => {
  const pill = el('button', 'live-pill');
  pill.type = 'button';
  pill.dataset.live = 'pill';
  pill.hidden = true;
  const dot = el('span', 'dot');
  dot.setAttribute('aria-hidden', 'true');
  const label = el('span', 'label');
  const secs = el('span', 'secs');
  const cancel = el('span', 'cancel', LIVE.cancel);
  cancel.setAttribute('role', 'button');
  cancel.dataset.live = 'cancel';
  pill.append(dot, label, secs, cancel);
  let state: PillModel['kind'] = 'hidden';
  pill.addEventListener('click', (e) => {
    if (state === 'waiting') {
      if ((e.target as HTMLElement).closest('[data-live="cancel"]')) onCancel();
      return;
    }
    if (state === 'ready') onTap();
  });
  const attach = () => {
    const hud = document.getElementById('duel-hud');
    if (hud && pill.parentElement !== hud) hud.append(pill);
  };
  return {
    element: pill,
    render(m: PillModel) {
      attach();
      state = m.kind;
      pill.dataset.state = m.kind;
      pill.hidden = m.kind === 'hidden';
      cancel.hidden = m.kind !== 'waiting';
      pill.disabled = m.kind === 'disabled';
      if (m.kind === 'ready') {
        label.textContent = LIVE.goLive;
        pill.setAttribute('aria-label', LIVE.goLiveAria(m.name, m.secs));
      } else if (m.kind === 'waiting') {
        label.textContent = '';
        label.append(el('span', 'full', LIVE.waitingFor(m.name)), el('span', 'short', LIVE.waitingShort));
        pill.setAttribute('aria-label', `${m.label}. ${LIVE.cancel}`);
      } else if (m.kind === 'disabled') {
        label.textContent = m.label;
        pill.setAttribute('aria-label', m.label);
      }
      secs.textContent = m.kind === 'waiting' ? `${m.secs}s` : '';
    },
  };
};

export type HudModel = {
  live: boolean;
  limitMs: number;
  /** Local-clock ms when the active player's clock runs out (null = no clock). */
  deadline: number | null;
  /** Which home: my own (moss, bottom) or the opponent's (lava, top). */
  side: 'me' | 'opp';
  homeKey: string | null;
  myStrikes: number;
  reduceMotion: boolean;
};

/** The live HUD: the LIVE chip (with strike dots) in the status strip, the draining home ring, the vignette. */
export const createHud = () => {
  const chip = el('span', 'live-chip');
  chip.hidden = true;
  chip.dataset.live = 'chip';
  const lamp = el('span', 'lamp');
  const text = el('span', 'text');
  const strikes = el('span', 'strikes');
  strikes.setAttribute('aria-hidden', 'true');
  const dots = [el('i'), el('i')];
  strikes.append(...dots);
  chip.append(lamp, text, strikes);
  // The arc is inset from the tile's own edge (radius 42 of a 100 box, not 46): it reads as a thin
  // ornamental line around the home rather than a hoop pressed against it.
  const { svg: ring, fg, length } = ringSvg('live-ring', 100, 42);
  ring.setAttribute('hidden', '');
  ring.dataset.live = 'ring';
  const vignette = el('div', 'live-vignette');
  vignette.hidden = true;
  document.body.append(ring, vignette);
  let model: HudModel | null = null;
  let raf = 0;

  /** The header's own "invisible box": the live clock is written into the strip's time slot. */
  const clockEl = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('#duel-hud [data-duel-urgency]');
  const clockDot = el('span', 'live-clock-dot');
  clockDot.setAttribute('aria-hidden', 'true');
  const clockWords = el('span', 'live-clock-words');

  const attach = () => {
    const hud = document.getElementById('duel-hud');
    if (hud && chip.parentElement !== hud) hud.prepend(chip);
  };

  const place = (): boolean => {
    if (!model?.homeKey) return false;
    const hex = document.querySelector<SVGGElement>(`#board .hex-cell[data-key="${model.homeKey}"]`);
    const game = document.getElementById('game');
    if (!hex || !game || game.hidden) return false;
    const r = hex.getBoundingClientRect();
    if (r.width === 0) return false;
    // 1.42×: the inset arc still clears the tile's corners, without the old wide halo.
    const size = Math.max(r.width, r.height) * 1.42;
    ring.style.left = `${r.left + r.width / 2 - size / 2}px`;
    ring.style.top = `${r.top + r.height / 2 - size / 2}px`;
    ring.style.width = ring.style.height = `${size}px`;
    return true;
  };

  /** mm:ss of the remaining time — the words, so the clock is never colour alone. */
  const clockText = (left: number): string => {
    const secs = Math.max(0, Math.ceil(left / 1000));
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  };

  const frame = () => {
    raf = 0;
    if (!model || !model.live) return;
    const left = model.deadline === null ? model.limitMs : Math.max(0, model.deadline - Date.now());
    const frac = Math.min(1, left / model.limitMs);
    fg.style.strokeDashoffset = `${length * (1 - frac)}`;
    const secs = Math.ceil(left / 1000);
    const urgent = model.deadline !== null && left <= 10_000;
    chip.dataset.urgent = urgent ? '1' : '0';
    ring.dataset.urgent = urgent ? '1' : '0';
    text.textContent = urgent ? `${LIVE.live.toUpperCase()} ${secs}s` : LIVE.chip(Math.round(model.limitMs / 1000));
    // The strip clock, written only when the words change (not once per frame).
    const clock = clockEl();
    if (clock) {
      if (clock.dataset.liveClock !== '1') {
        clock.dataset.liveClock = '1';
        // Not a live region: the words change every second and must never be announced each time.
        // The live module's own announcer keeps the threshold lines (10, 8, 6, 4, 2, time's up).
        clock.removeAttribute('role');
        clock.setAttribute('aria-live', 'off');
        clock.replaceChildren(clockDot, clockWords);
      }
      const label = clockText(left);
      if (clockWords.textContent !== label) clockWords.textContent = label;
      clock.dataset.side = model.side;
      clock.dataset.urgent = urgent ? '1' : '0';
      clock.hidden = false;
    }
    if (place()) ring.removeAttribute('hidden');
    else ring.setAttribute('hidden', '');
    vignette.hidden = model.reduceMotion;
    vignette.dataset.on = !model.reduceMotion && model.deadline !== null && left <= 5_000 && left > 0 ? '1' : '0';
    raf = requestAnimationFrame(frame);
  };

  return {
    chip,
    ring,
    render(m: HudModel | null) {
      attach();
      model = m;
      const on = !!m?.live;
      chip.hidden = !on;
      document.documentElement.classList.toggle('live-on', on);
      if (!on) {
        ring.setAttribute('hidden', '');
        vignette.hidden = true;
        // Leaving live: hand the strip's time slot back to the 24-hour urgency rule.
        const clock = clockEl();
        if (clock && clock.dataset.liveClock === '1') {
          delete clock.dataset.liveClock;
          delete clock.dataset.side;
          delete clock.dataset.urgent;
          clock.replaceChildren();
          clock.textContent = '';
          clock.hidden = true;
          clock.setAttribute('role', 'status');
          clock.removeAttribute('aria-live');
        }
        cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      ring.dataset.side = m!.side;
      dots.forEach((d, i) => d.classList.toggle('on', i < m!.myStrikes));
      chip.setAttribute('aria-label', LIVE.chipAria(Math.round(m!.limitMs / 1000)));
      if (!raf) raf = requestAnimationFrame(frame);
    },
    /** The 600 ms go-live moment: the chip lights up, both homes pulse. */
    lightUp(homeKeys: string[], reduceMotion: boolean) {
      if (reduceMotion) return;
      chip.classList.remove('lighting');
      void chip.getBoundingClientRect();
      chip.classList.add('lighting');
      for (const key of homeKeys) {
        const hex = document.querySelector<SVGGElement>(`#board .hex-cell[data-key="${key}"]`);
        if (!hex) continue;
        const r = hex.getBoundingClientRect();
        const { svg } = ringSvg('live-ring pulse', 100, 42);
        const size = Math.max(r.width, r.height) * 1.42;
        Object.assign(svg.style, { left: `${r.left + r.width / 2 - size / 2}px`, top: `${r.top + r.height / 2 - size / 2}px`, width: `${size}px`, height: `${size}px` });
        svg.dataset.side = key === homeKeys[0] ? 'me' : 'opp';
        document.body.append(svg);
        window.setTimeout(() => svg.remove(), 650);
      }
      window.setTimeout(() => chip.classList.remove('lighting'), 650);
    },
  };
};

/** The end-of-live window: Back to <what I was doing> · Rematch · Close. */
export const createEndWindow = () => {
  const scrim = el('div', 'live-scrim');
  scrim.hidden = true;
  const panel = el('section', 'live-glass');
  panel.dataset.mode = 'end';
  panel.dataset.live = 'end';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  const dot = el('span', 'lg-dot');
  const title = el('div', 'lg-name', LIVE.endedTitle);
  title.id = 'live-end-title';
  panel.setAttribute('aria-labelledby', title.id);
  const why = el('div', 'lg-what');
  const actions = el('div', 'lg-actions');
  panel.append(dot, title, why, el('div', 'lg-terms'), actions);
  document.body.append(scrim, panel);
  const hide = () => {
    scrim.hidden = panel.hidden = true;
  };
  scrim.addEventListener('click', hide);
  return {
    element: panel,
    isOpen: () => !panel.hidden,
    hide,
    show(opts: { reason: string; back: { label: string; run: () => void } | null; rematch: (() => void) | null }) {
      why.textContent = opts.reason;
      actions.textContent = '';
      const close = el('button', '', LIVE.close);
      close.type = 'button';
      close.dataset.live = 'end-close';
      close.addEventListener('click', hide);
      actions.append(close);
      if (opts.rematch) {
        const r = el('button', opts.back ? '' : 'primary', LIVE.rematch);
        r.type = 'button';
        r.dataset.live = 'rematch';
        const go = opts.rematch;
        r.addEventListener('click', () => {
          hide();
          go();
        });
        actions.append(r);
      }
      if (opts.back) {
        const b = el('button', 'primary', opts.back.label);
        b.type = 'button';
        b.dataset.live = 'back';
        const go = opts.back.run;
        b.addEventListener('click', () => {
          hide();
          go();
        });
        actions.append(b);
      }
      scrim.hidden = panel.hidden = false;
      (actions.lastElementChild as HTMLElement | null)?.focus({ preventScroll: true });
    },
  };
};

/** "Allow live challenges" in the Settings sheet (no `data-setting`, so main.ts's form ignores it). */
export const mountSettingsSwitch = (initial: boolean, onChange: (on: boolean) => void): ((on: boolean) => void) => {
  const sheet = document.querySelector('#sheet-settings .sheet-body') ?? document.getElementById('sheet-settings');
  if (!sheet) return () => undefined;
  const row = el('label', 'row live-setting');
  const span = el('span', '', LIVE.allowChallenges);
  span.append(el('small', '', LIVE.allowChallengesHelp));
  const box = el('input');
  box.type = 'checkbox';
  box.id = 'live-allow';
  box.checked = initial;
  box.addEventListener('change', () => onChange(box.checked));
  row.append(span, box);
  const anchor = sheet.querySelector('[data-setting="vibration"]')?.closest('label');
  if (anchor?.parentElement) anchor.parentElement.insertBefore(row, anchor.nextSibling);
  else sheet.prepend(row);
  return (on) => {
    box.checked = on;
  };
};

/** "Leave live" in the pause menu, shown only while this match is live. */
export const mountLeaveItem = (onLeave: () => void): ((show: boolean) => void) => {
  const btn = el('button', 'btn ghost', LIVE.leaveLive);
  btn.type = 'button';
  btn.id = 'gm-leave-live';
  btn.dataset.live = 'leave';
  btn.hidden = true;
  btn.addEventListener('click', () => {
    if (!window.confirm(LIVE.leaveConfirm)) return;
    document.querySelector<HTMLElement>('#sheet-menu [data-close]')?.click();
    onLeave();
  });
  const resign = document.getElementById('gm-resign');
  if (resign?.parentElement) resign.parentElement.insertBefore(btn, resign);
  else document.querySelector('#sheet-menu .sheet-body')?.append(btn);
  return (show) => {
    btn.hidden = !show;
  };
};
