// Live duels — the DOM pieces. Same dark glass, moss and lava, same fonts; no new visual language.
// Everything is created here and appended to existing containers; no shared markup is edited.
import { hudRail } from '../../ui/hud-rail.js';
import { LIVE } from '../../../../src/strings.js';
import { glassBaseCss } from '../../player/glass-surface.js';
import type { ChallengeWire } from './api.js';
import type { PopupPort } from './center.js';
import { WAIT_DOTS_CSS, waitDots } from './wait-dots.js';

const MOSS = '#8fbf6a';
const MOSS_INK = '#0d100d';
const LAVA = '#e0735c';
const CREAM = '#f0e9dc';

const CSS = `
${glassBaseCss('.live-glass')}
${WAIT_DOTS_CSS}
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
/* The real-time forfeit rule, said BEFORE it matters: one short line, then the fuller explanation
   in the same glass window (never a wall of text). */
.live-glass .lg-warn { grid-column:1 / -1; margin-top:2px; color:#e2d4b4; font-size:12px; letter-spacing:.04em; line-height:1.35; }
.live-glass .lg-warn .lg-warn-short { display:block; color:#f6d3c8; font-weight:700; letter-spacing:.06em; }
.live-glass .lg-warn small { display:block; color:#b7a98a; font-size:11px; letter-spacing:.03em; }
.live-glass .lg-actions { grid-column:1 / -1; display:flex; gap:8px; margin-top:10px; }
.live-glass .lg-actions button { flex:1; min-height:44px; min-width:44px; border-radius:10px; font:700 14px/1 var(--font-ui,'Fragment Mono',ui-monospace,monospace);
  letter-spacing:.08em; cursor:pointer; border:1px solid rgba(214,204,177,.22); background:rgba(255,255,255,.04); color:${CREAM}; }
.live-glass .lg-actions button.primary { background:${MOSS}; border-color:${MOSS}; color:${MOSS_INK}; }
.live-glass .lg-actions button:focus-visible { outline:2px solid ${CREAM}; outline-offset:2px; }
/* The real-time BOLT (owner, 2026-10-15): one icon, no words, in the rail under the wordmark
   (ui/hud-rail.ts), rightmost. An outline while a real-time duel is not possible (the opponent is
   away, busy, or has real time switched off); filled and softly glowing when the opponent is here
   and a tap invites them; breathing while the invite waits (a tap cancels it); steady while the
   duel is live. Its words live only in the accessible name and a visually hidden label. */
.live-pill { order:2; width:44px; height:44px; display:grid; place-items:center end; padding:0; border:0; border-radius:10px;
  background:transparent; color:${CREAM}; cursor:pointer; position:relative; -webkit-tap-highlight-color:transparent; }
.live-pill svg { width:24px; height:24px; overflow:visible; }
.live-pill svg path { fill:transparent; stroke:currentColor; stroke-width:1.5; stroke-linejoin:round; transition:fill .3s ease, filter .3s ease, opacity .3s ease; }
.live-pill:is([data-state='away'], [data-state='disabled']) { opacity:.6; cursor:default; }
.live-pill:is([data-state='ready'], [data-state='waiting'], [data-state='live']) svg path {
  fill:#f2dfb0; stroke:#f6e6bd; filter:drop-shadow(0 0 3px rgba(242,214,140,.55)) drop-shadow(0 0 8px rgba(242,200,110,.28)); }
.live-pill[data-state='live'] { cursor:default; }
.live-pill[data-state='waiting'] svg { animation:live-bolt-wait 1.4s ease-in-out infinite; }
@keyframes live-bolt-wait { 0%,100% { opacity:1; } 50% { opacity:.45; } }
.live-pill:focus-visible { outline:2px solid ${CREAM}; outline-offset:-2px; }
.live-pill .label { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
.live-on [data-duel-urgency][data-live-clock] { display:inline-flex !important; } /* the live clock owns this slot */
.live-pill[hidden], .live-chip[hidden] { display:none; }
.live-chip { order:-1; flex:0 0 auto; display:inline-flex; align-items:center; gap:6px; min-height:24px; padding:0 8px; border-radius:6px;
  background:rgba(224,115,92,.14); border:1px solid rgba(224,115,92,.55); color:#f6d3c8;
  font:800 11px/1 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.14em; font-variant-numeric:tabular-nums; white-space:nowrap; }
.live-chip[data-urgent='1'] { background:rgba(224,115,92,.28); color:#fff; }
/* "Opponent reconnecting" in the strip: the words plus the SHARED animated dots. The order puts it
   just before the live clock; it is its own node, so the header's model never overwrites it. */
.live-reconnect { order:2; flex:0 0 auto; display:inline-flex; align-items:center; color:#e2d4b4;
  font:600 12px/1 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.04em; white-space:nowrap; }
.live-reconnect[hidden] { display:none; }
.large-text .live-reconnect { font-size:15px; }
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
.large-text .duel-hud [data-live-clock] { font-size:15px; }
.live-ring { position:fixed; z-index:7; pointer-events:none; }
/* The home timeout ring. IDENTICAL on both homes: the colour means TIME, never the side, and which
   home carries it is what says whose turn is timed (owner's rule). It is fitted INSIDE the home
   tile's hex (the arc's diameter is 86% of the tile's width, i.e. ~86% of the hex's incircle, so
   even the stroke and its shadow stay inside the silhouette) and it never becomes a frame: no
   radius, no fill, no border on the tile.
   Three strokes, no frame:
   - .sh is the small black under-stroke: a wider, soft dark arc beneath the coloured one, so the
     ring reads over moss, lava, rock, snow or any future palette, light or dark.
   - .bg is the faint remaining-time track (a hairline, dark, so it also survives a bright tile).
   - .fg is the coloured arc: its LENGTH is the time left (a length cue, never colour alone) and its
     colour travels green -> orange -> red across the turn. */
.live-ring circle { fill:none; }
.live-ring .sh { stroke:rgba(0,0,0,.42); stroke-linecap:butt; }
.live-ring .bg { stroke:rgba(0,0,0,.26); stroke-linecap:butt; }
.live-ring .fg { stroke-linecap:butt; transform:rotate(-90deg); transform-origin:50% 50%; }
.live-ring[data-urgent='1'] .sh { stroke:rgba(0,0,0,.5); }
.live-ring.pulse { animation:live-pulse 600ms ease-out 1; }
.live-vignette { position:fixed; inset:0; z-index:6; pointer-events:none; box-shadow:inset 0 0 70px rgba(224,115,92,.0); transition:box-shadow .3s ease; }
.live-vignette[data-on='1'] { box-shadow:inset 0 0 70px rgba(224,115,92,.22); }
.live-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
.live-setting small { display:block; opacity:.7; font-size:.8em; }
@keyframes live-breathe { 0%,100% { opacity:1 } 50% { opacity:.35 } }
@keyframes live-light { 0% { box-shadow:0 0 0 rgba(224,115,92,0); transform:scale(.9); } 40% { box-shadow:0 0 18px rgba(224,115,92,.7); transform:scale(1.06); } 100% { box-shadow:0 0 0 rgba(224,115,92,0); transform:scale(1); } }
@keyframes live-pulse { 0% { transform:scale(1); opacity:1 } 50% { transform:scale(1.35); opacity:.6 } 100% { transform:scale(1); opacity:1 } }
.large-text .live-glass .lg-name { font-size:19px; }
.large-text .live-glass .lg-actions button { font-size:15px; }
.large-text .live-chip { font-size:13px; }
.reduce-motion .live-chip.lighting, .reduce-motion .live-ring.pulse, .reduce-motion .live-pill[data-state='waiting'] svg { animation:none !important; }
@media (prefers-reduced-motion: reduce) { .live-chip.lighting, .live-ring.pulse, .live-pill[data-state='waiting'] svg { animation:none !important; } }
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

/**
 * The home timeout ring's geometry.
 *
 * The tile is a hexagon, so the bound that can never leak is its INNER radius, and for a regular
 * hexagon that is `min(width, height) / 2` whichever way the board is turned (flat-top: the width is
 * corner to corner; pointy-top: the height is). The ring's whole outer edge — the black under-stroke
 * included — is fitted inside 96% of that, so the arc reads as drawn ON the tile and never crosses
 * its borders. The e2e measures every sample of the outer edge against the real hexagon.
 */
export const RING_FIT = 0.96;
/** The arc's stroke width at a 60 px tile, scaled with the tile so it stays proportional. */
export const RING_STROKE_PX = 2;

/** The ring's elements: a black under-stroke (`sh`), the time track (`bg`) and the arc (`fg`). */
type RingParts = { svg: SVGSVGElement; fg: SVGCircleElement; sh: SVGCircleElement };

/**
 * Build the ring in a `size`-px box. The viewBox is the pixel box, so every stroke width below is a
 * literal px and the geometry can be measured against the tile directly. `outerPx` is the radius the
 * widest stroke's OUTER edge reaches; each circle is pulled in by its own half-stroke so no stroke
 * can cross that bound.
 */
const ringSvg = (cls: string, outerPx: number, strokes: { fg: number; track: number; shadow: number }): RingParts => {
  const size = outerPx * 2;
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('aria-hidden', 'true');
  const order: { cls: string; stroke: number }[] = [
    { cls: 'sh', stroke: strokes.shadow },
    { cls: 'bg', stroke: strokes.track },
    { cls: 'fg', stroke: strokes.fg },
  ];
  const nodes = order.map((spec) => {
    const node = document.createElementNS(SVGNS, 'circle');
    node.setAttribute('class', spec.cls);
    node.setAttribute('stroke-width', String(spec.stroke));
    node.setAttribute('cx', String(size / 2));
    node.setAttribute('cy', String(size / 2));
    node.setAttribute('r', String(Math.max(1, outerPx - spec.stroke / 2)));
    svg.append(node);
    return node;
  });
  const [sh, , fg] = nodes as [SVGCircleElement, SVGCircleElement, SVGCircleElement];
  const length = 2 * Math.PI * Number(fg.getAttribute('r'));
  for (const node of nodes) node.style.strokeDasharray = `${length}`;
  return { svg, fg, sh };
};

/** The stroke widths for a tile of `tilePx` (the arc, the hairlines, the under-shadow). */
export const ringStrokes = (tilePx: number): { fg: number; track: number; shadow: number } => {
  const fg = Math.max(1.4, Math.min(2.4, (RING_STROKE_PX * tilePx) / 60));
  return { fg, track: Math.max(1, fg - 0.6), shadow: fg + 2 };
};

/**
 * The ring's colour, interpolated over the turn: green at the start, orange at the half, red at the
 * end (owner's rule: the ring's colour means TIME only, identically on both homes).
 * Exact stops: t=0 `#8fbf6a` (FUTASAKU moss-green), t=0.5 `#e0a35c` (amber-orange), t=1 `#e0735c`
 * (FUTASAKU lava-red) — a linear sRGB ramp between each pair, so the journey is green -> orange ->
 * red and never passes through a colour outside that family.
 */
export const RING_GREEN = [143, 191, 106] as const;
export const RING_ORANGE = [224, 163, 92] as const;
export const RING_RED = [224, 115, 92] as const;

export const ringColour = (fracLeft: number): string => {
  const t = Math.min(1, Math.max(0, 1 - fracLeft));
  const mix = (a: readonly [number, number, number], b: readonly [number, number, number], k: number): string =>
    `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
  if (t <= 0.5) return mix(RING_GREEN, RING_ORANGE, t / 0.5);
  return mix(RING_ORANGE, RING_RED, (t - 0.5) / 0.5);
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
  // The challenge window's countdown keeps its own compact ring (a 44 px box, 22 px outer radius) —
  // this is NOT the home ring and its look is unchanged.
  const { svg, fg } = ringSvg('lg-ring', 22, { fg: 3, track: 3, shadow: 3 });
  const length = 2 * Math.PI * Number(fg.getAttribute('r'));
  const name = el('div', 'lg-name');
  const what = el('div', 'lg-what');
  const terms = el('div', 'lg-terms');
  const warn = el('div', 'lg-warn');
  warn.append(el('span', 'lg-warn-short', LIVE.leaveWarning), el('small', '', LIVE.leaveWarningHelp));
  const actions = el('div', 'lg-actions');
  const accept = el('button', 'primary', LIVE.accept);
  const decline = el('button', '', LIVE.notNow);
  accept.type = decline.type = 'button';
  accept.dataset.live = 'accept';
  decline.dataset.live = 'decline';
  actions.append(decline, accept);
  panel.append(svg, name, what, terms, warn, actions);
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
  | { kind: 'away'; name: string }
  | { kind: 'ready'; name: string; secs: number }
  | { kind: 'disabled'; label: string }
  | { kind: 'waiting'; label: string; name: string; secs: number }
  | { kind: 'live' };

const BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 2.5 5 13.6h6.1l-1.3 7.9 8.6-11.3h-6.2z"/></svg>';

/**
 * The real-time bolt (owner, 2026-10-15): an icon-only control in the rail under the wordmark.
 * Outline = no real-time duel possible right now; filled and glowing = the opponent is here, tap to
 * invite; breathing = the invite is waiting, tap to cancel; steady = the duel is live. The state
 * words stay in a visually hidden `.label` and the accessible name, never on screen.
 */
export const createPill = (onTap: () => void, onCancel: () => void) => {
  const pill = el('button', 'live-pill');
  pill.type = 'button';
  pill.dataset.live = 'pill';
  pill.hidden = true;
  pill.innerHTML = BOLT;
  const label = el('span', 'label');
  pill.append(label);
  let state: PillModel['kind'] = 'hidden';
  pill.addEventListener('click', () => {
    if (state === 'waiting') onCancel(); // the whole icon is the way back out of a waiting invite
    else if (state === 'ready') onTap();
  });
  const attach = () => {
    if (!pill.parentElement) hudRail().append(pill);
  };
  return {
    element: pill,
    render(m: PillModel) {
      attach();
      state = m.kind;
      pill.dataset.state = m.kind;
      pill.hidden = m.kind === 'hidden';
      pill.setAttribute('aria-disabled', String(!(m.kind === 'ready' || m.kind === 'waiting')));
      label.textContent = '';
      if (m.kind === 'ready') {
        label.textContent = LIVE.goLive;
        pill.setAttribute('aria-label', LIVE.goLiveAria(m.name, m.secs));
      } else if (m.kind === 'waiting') {
        label.append(el('span', 'full', LIVE.waitingFor(m.name)), el('span', 'short', LIVE.waitingShort), el('span', 'tiny', LIVE.waitingTiny));
        pill.setAttribute('aria-label', `${m.label}. ${LIVE.cancel}`);
      } else if (m.kind === 'disabled') {
        label.textContent = m.label;
        pill.setAttribute('aria-label', m.label);
      } else if (m.kind === 'away') {
        label.textContent = LIVE.away;
        pill.setAttribute('aria-label', LIVE.awayAria(m.name));
      } else if (m.kind === 'live') {
        label.textContent = LIVE.live;
        pill.setAttribute('aria-label', LIVE.chipAria(0));
      }
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
  /** The opponent's heartbeat has gone stale while the duel is live: they are reconnecting. */
  opponentReconnecting: boolean;
  reduceMotion: boolean;
};

/** The live HUD: the live chip in the status strip, the draining home ring, the vignette. */
export const createHud = () => {
  const chip = el('span', 'live-chip');
  chip.hidden = true;
  chip.dataset.live = 'chip';
  const text = el('span', 'text');
  chip.append(text);
  // Sized to the HOME TILE's inner radius at run time (see `place`), so this starting box is only a
  // placeholder that is replaced before the ring is ever shown.
  const { svg: ring, fg, sh } = ringSvg('live-ring', 14, { fg: 2, track: 1.4, shadow: 4 });
  const track = ring.querySelector<SVGCircleElement>('.bg')!;
  let ringLength = 0;
  ring.setAttribute('hidden', '');
  ring.dataset.live = 'ring';
  const vignette = el('div', 'live-vignette');
  vignette.hidden = true;
  // "Opponent reconnecting" + the shared animated dots, written into the strip next to the clock.
  // The node is created and owned HERE (not written into one of `fillDuelHud`'s slots), so the
  // header's own model can never overwrite it mid-grace.
  const reconnecting = el('span', 'live-reconnect');
  reconnecting.dataset.live = 'reconnect';
  reconnecting.setAttribute('role', 'status');
  reconnecting.hidden = true;
  reconnecting.append(el('span', '', LIVE.opponentReconnecting), waitDots());
  let reconnectShown: boolean | null = null;
  document.body.append(ring, vignette);
  let model: HudModel | null = null;
  let raf = 0;

  /** The header's own "invisible box": the live clock is written into the strip's time slot. */
  const clockEl = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('#duel-hud [data-duel-urgency]');
  // Only the words: the small circle that used to sit beside them is gone (owner's cleanup), and the
  // header hides any such node anyway.
  const clockWords = el('span', 'live-clock-words');

  const attach = () => {
    const hud = document.getElementById('duel-hud');
    if (!hud) return;
    if (chip.parentElement !== hud) hud.prepend(chip);
    if (reconnecting.parentElement !== hud) hud.append(reconnecting);
  };

  const place = (): boolean => {
    if (!model?.homeKey) return false;
    // Exposed so the ring can be measured against the exact tile it belongs to (the e2e does this).
    ring.dataset.homeKey = model.homeKey;
    const hex = document.querySelector<SVGGElement>(`#board .hex-cell[data-key="${model.homeKey}"]`);
    const game = document.getElementById('game');
    if (!hex || !game || game.hidden) return false;
    const r = hex.getBoundingClientRect();
    if (r.width === 0) return false;
    // The tile's inner radius, taken from the hexagon that is actually DRAWN (a cell's bounding box
    // includes its stroke and its corners, so a box-based guess overshoots and crosses the flats).
    // A regular hexagon's side length IS its circumradius, so `pathLength / 6` gives R and the inner
    // radius is R·cos 30°. The whole ring — the black under-stroke included — is fitted inside 96%
    // of that, so no part of it can cross the tile's borders.
    const path = hex.querySelector<SVGPathElement>('path.hex');
    const drawnR = path && path.getTotalLength() > 0 ? path.getTotalLength() / 6 : Math.min(r.width, r.height) / 2;
    const innerR = drawnR * Math.cos(Math.PI / 6);
    const tilePx = innerR * 2;
    const outerPx = innerR * RING_FIT;
    if (Math.abs(Number(ring.dataset.outer ?? 0) - outerPx) > 0.5) {
      ring.dataset.outer = String(outerPx);
      ring.dataset.size = String(tilePx);
      const strokes = ringStrokes(tilePx);
      for (const node of [sh, track, fg]) {
        const w = node === sh ? strokes.shadow : node === track ? strokes.track : strokes.fg;
        node.setAttribute('stroke-width', String(w));
        node.setAttribute('r', String(Math.max(1, outerPx - w / 2)));
      }
      const size = outerPx * 2;
      ring.setAttribute('viewBox', `0 0 ${size} ${size}`);
      for (const node of [sh, track, fg]) {
        node.setAttribute('cx', String(size / 2));
        node.setAttribute('cy', String(size / 2));
      }
      ringLength = 2 * Math.PI * Number(fg.getAttribute('r'));
      for (const node of [sh, track, fg]) node.style.strokeDasharray = `${ringLength}`;
    }
    const size = outerPx * 2;
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
    // The ARC's length is the time left (a length cue), the COLOUR is the same journey on both
    // homes: green -> orange -> red. Nothing on this ring says whose turn it is; the home it sits
    // on already does (owner's rule).
    fg.style.strokeDashoffset = `${ringLength * (1 - frac)}`;
    fg.style.stroke = ringColour(frac);
    const secs = Math.ceil(left / 1000);
    const urgent = model.deadline !== null && left <= 10_000;
    // A late emphasis, kept as a secondary readable cue (it survives Reduce motion): the arc gains a
    // little weight and full opacity as the turn runs out.
    const emphasis = urgent ? 1 : 0;
    fg.setAttribute('opacity', emphasis ? '1' : '0.94');
    // The late emphasis: the arc gains a little weight without ever reaching past the tile's edge
    // (its outer bound is fixed by `place`, so a heavier centre line only moves its inner side).
    const strokes = ringStrokes(Number(ring.dataset.size ?? 60));
    const outerPx = Number(ring.dataset.outer ?? 0);
    const fgWidth = strokes.fg + emphasis * 0.4;
    fg.setAttribute('stroke-width', String(fgWidth));
    // The heavier arc grows INWARD: its outer edge stays on the bound `place` set, so the late
    // emphasis can never poke past the tile either.
    if (outerPx > 0) fg.setAttribute('r', String(Math.max(1, outerPx - fgWidth / 2)));
    ringLength = 2 * Math.PI * Number(fg.getAttribute('r'));
    fg.style.strokeDasharray = `${ringLength}`;
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
        clock.replaceChildren(clockWords);
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
        reconnecting.hidden = true;
        reconnectShown = null;
        // No leftover arc: a go-live pulse that is still on screen when the session ends goes too.
        document.querySelectorAll('.live-ring[data-live="pulse"]').forEach((node) => node.remove());
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
      chip.setAttribute('aria-label', LIVE.chipAria(Math.round(m!.limitMs / 1000)));
      // The words do not tick, so only rewrite when the state actually flips (the dots animate).
      if (reconnectShown !== m!.opponentReconnecting) {
        reconnectShown = m!.opponentReconnecting;
        reconnecting.hidden = !m!.opponentReconnecting;
      }
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
        const size = ((Math.min(r.width, r.height) / 2) * RING_FIT) * 2;
        const { svg } = ringSvg('live-ring pulse', size / 2, ringStrokes(size));
        svg.dataset.live = 'pulse';
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
  const btn = el('button', 'btn ghost gm-act', LIVE.leaveLive);
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
  else document.querySelector('#sheet-menu .gm-acts')?.append(btn);
  return (show) => {
    btn.hidden = !show;
  };
};
