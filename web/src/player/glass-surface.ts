import type { Card } from '../../../src/engine/index.js';
import type { MatchIntel } from '../logic/match-intel.js';
import { drawLedCells, ledMessageWidth } from './led-cells.js';
import { cardFace, suitClass } from '../ui/effects.js';

export type FocusShape = 'hex' | 'card' | 'pill' | 'none';
export type TutorialWindowButtons = {
  previous?: boolean;
  next?: boolean;
  nextLabel?: string;
  nextBlink?: boolean;
  exit?: boolean;
  playReal?: boolean;
  replayChapter?: boolean;
};
export type TutorialWindowHandlers = {
  onPrevious?: () => void;
  onNext?: () => void;
  onExit?: () => void;
  onPlayReal?: () => void;
  onReplayChapter?: () => void;
};
export type TutorialFocusOptions = {
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
  /** Stable step id — skip fade/jump when only the CTA changes. */
  stepKey?: string;
  /** Soft mid-screen set + run card examples (bloom explain). */
  bloomDemo?: boolean;
};

const CSS = `
#futasaku-glass { position:fixed; z-index:35; box-sizing:border-box; border:1px solid rgba(214,204,177,.14);
  border-radius:15px; overflow:hidden; color:#f0e9dc; background:rgba(8,10,10,.42);
  box-shadow:inset 0 1px rgba(243,232,202,.06),0 10px 28px rgba(0,0,0,.22);
  backdrop-filter:blur(9px) saturate(1.05); -webkit-backdrop-filter:blur(9px) saturate(1.05);
  font:400 13px/1.4 var(--font-ui,'Fragment Mono',ui-monospace,monospace); }
#futasaku-glass[hidden], #tutorial-focus[hidden] { display:none; }
/* Hosted inside #game.screen so z-order compares with #hud-menu (body-level glass sat above the whole screen). */
#futasaku-glass[data-mode='tutorial'] { pointer-events:none; z-index:40; max-width:min(420px,calc(100vw - 16px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px))); width:min(420px,calc(100vw - 16px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px)));
  left:50%; top:max(0px, env(safe-area-inset-top, 0px)); bottom:auto; transform:translateX(-50%); height:auto;
  background:rgba(12,14,14,.88);
  border:none !important; outline:none !important; box-shadow:0 12px 32px rgba(0,0,0,.36);
  backdrop-filter:blur(10px) saturate(1.05); -webkit-backdrop-filter:blur(10px) saturate(1.05);
  transition: opacity 220ms ease; filter:none; }
/* Phone tutorial: pad the map band between glass and cockpit, then centre the board
   so top gap (glass→board) matches bottom gap (board→hand/cockpit). */
html.futa04-tutorial #game.screen { overflow: visible; }
html.futa04-tutorial:not([data-layout='side']) .board-wrap {
  padding-top: var(--tutorial-pad-top, var(--tutorial-glass-h, 0px));
  padding-bottom: var(--tutorial-pad-bottom, 0px);
  box-sizing: border-box;
  min-height: 0;
}
/* Cancel thumb “map under cards” so the leftover band is truly glass↔dock. */
html.futa04-tutorial[data-thumb] .board-wrap,
html.futa04-tutorial.futa04-information[data-thumb] .board-wrap {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  --cam-under: 0px;
}
@media (max-width:600px) and (min-aspect-ratio:53/100) {
  html.futa04-tutorial.futa04-information[data-thumb] #game .board-wrap {
    margin-top: 0 !important;
    margin-bottom: 0 !important;
  }
}
html.futa04-tutorial:not([data-layout='side']) .board-wrap > .board {
  transform-origin: center center;
  max-width: 100%;
  max-height: 100%;
}
html.futa04-tutorial:not([data-layout='side']) .play {
  min-height: 0;
  overflow: visible;
}
html.futa04-tutorial .cam-fade { opacity: 0 !important; }
#futasaku-glass[data-mode='tutorial'] .glass-tutorial { display:flex; flex-direction:column; gap:6px; padding:8px 10px 10px; margin:0; max-width:none;
  min-height:0; border-radius:0; background:transparent; box-shadow:none; pointer-events:none; }
/* One head row: PREVIOUS | title | NEXT/TAP, with full-size touch targets. */
#futasaku-glass[data-mode='tutorial'] {
  --glass-head-h: 44px;
}
.large-text #futasaku-glass[data-mode='tutorial'] { --glass-head-h: 48px; }
#futasaku-glass[data-mode='tutorial'] .glass-head {
  display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.15fr) minmax(0,1fr);
  align-items:stretch; gap:6px; width:100%; pointer-events:none;
}
#futasaku-glass[data-mode='tutorial'] .glass-head-slot {
  display:flex; align-items:stretch; min-width:0; min-height:0; height: var(--glass-head-h);
}
#futasaku-glass[data-mode='tutorial'] .glass-head-prev { justify-content:stretch; }
#futasaku-glass[data-mode='tutorial'] .glass-head-title { justify-content:center; }
#futasaku-glass[data-mode='tutorial'] .glass-head-next { justify-content:stretch; }
#futasaku-glass[data-mode='tutorial'] .glass-head-slot > button {
  width:100%; height:100%; min-height:0; min-width:0; padding:0 8px; box-sizing:border-box;
  border:1px solid rgba(214,204,177,.22); border-radius:8px;
  background:rgba(255,255,255,.05); color:#f0e9dc;
  font:400 11px/1 var(--font-ui,'Fragment Mono',ui-monospace,monospace);
  letter-spacing:.04em; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  pointer-events:auto;
}
#futasaku-glass[data-mode='tutorial'] .glass-head-slot > button:focus-visible { outline:2px solid #e8ddc9; outline-offset:1px; }
#futasaku-glass[data-mode='tutorial'] .glass-head-slot > button[data-tut="next"] {
  background:rgba(233,216,173,.14); border-color:rgba(233,216,173,.45); letter-spacing:.05em;
}
#futasaku-glass[data-mode='tutorial'] .glass-head-slot > button[data-tut="next"].glass-blink {
  animation: tutorial-next-blink 1.15s ease-in-out infinite;
}
@keyframes tutorial-next-blink {
  0%,100% { opacity:1; box-shadow:0 0 0 0 rgba(233,216,173,0); }
  50% { opacity:1; box-shadow:0 0 0 3px rgba(233,216,173,.32); }
}
#futasaku-glass[data-mode='tutorial'] .glass-instruction,
#futasaku-glass[data-mode='guidance'] .glass-instruction { margin:0; display:flex; justify-content:center; align-items:stretch; width:100%; max-width:100%; height:100%; }
#futasaku-glass[data-mode='tutorial'] .glass-led-sr,
#futasaku-glass[data-mode='guidance'] .glass-led-sr {
  position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
#futasaku-glass[data-mode='tutorial'] .glass-led-window,
#futasaku-glass[data-mode='guidance'] .glass-led-window {
  position:relative; display:flex; align-items:center; justify-content:center; overflow:hidden;
  height:100%; min-height:0; width:100%; max-width:100%; padding:3px 6px; box-sizing:border-box;
  border-radius:8px; background:#090c0b;
  box-shadow:inset 0 0 0 1px rgba(166,128,78,.18), inset 0 0 18px rgba(255,195,104,.06);
}
#futasaku-glass[data-mode='tutorial'] .glass-led-window::before,
#futasaku-glass[data-mode='guidance'] .glass-led-window::before {
  content:''; position:absolute; inset:0; pointer-events:none; border-radius:inherit;
  background-image:radial-gradient(circle,rgba(166,128,78,.18) .65px,transparent .8px);
  background-size:2.3px 3.1px; background-position:0 2.6px;
}
#futasaku-glass[data-mode='tutorial'] .glass-led-cells,
#futasaku-glass[data-mode='guidance'] .glass-led-cells {
  display:block; position:relative; z-index:1; height:30px; width:auto; max-width:100%;
}
.large-text #futasaku-glass[data-mode='tutorial'] .glass-led-window { padding:4px 8px; }
.large-text #futasaku-glass[data-mode='guidance'] .glass-led-window { min-height:38px; padding:5px 8px; }
.large-text #futasaku-glass[data-mode='tutorial'] .glass-led-cells,
.large-text #futasaku-glass[data-mode='guidance'] .glass-led-cells { height:34px; }
#futasaku-glass[data-mode='tutorial'] .glass-why { margin:0; font:400 13px/1.45 var(--font-ui,'Fragment Mono',ui-monospace,monospace); color:rgba(240,233,220,.78); letter-spacing:.012em; text-transform:none; text-wrap:pretty; text-align:center; }
#futasaku-glass[data-mode='tutorial'] .glass-status { margin:0; font:400 13px/1.4 var(--font-ui,'Fragment Mono',ui-monospace,monospace); color:#e8ddc9; letter-spacing:.015em; text-align:center; }
#futasaku-glass[data-mode='tutorial'] .glass-icons { display:flex; gap:10px; justify-content:center; }
#futasaku-glass[data-mode='tutorial'] .glass-icons span { font:400 11px/1.15 var(--font-ui,'Fragment Mono',ui-monospace,monospace); color:#cbbfa0; letter-spacing:.05em; }
/* Soft settle on the inner column when the lesson step changes (panel transform stays JS-owned). */
#futasaku-glass[data-mode='tutorial'][data-step-settle='1'] .glass-tutorial {
  animation: tutorial-glass-settle 280ms cubic-bezier(.22,.72,.24,1);
}
@keyframes tutorial-glass-settle {
  0% { opacity:.88; }
  100% { opacity:1; }
}
#futasaku-glass[data-mode='tutorial'][data-fade='out'] { opacity:.94; }
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
#futasaku-glass[data-mode='guidance'] { pointer-events:auto; display:flex; flex-direction:column; }
#futasaku-glass[data-mode='guidance'] .glass-tutorial { display:flex; flex-direction:column; gap:8px; padding:12px 14px 12px; }
#futasaku-glass[data-mode='guidance'] .glass-actions { display:flex; justify-content:flex-end; pointer-events:auto; }
#futasaku-glass[data-mode='guidance'] .glass-actions button { min-height:44px; min-width:44px; padding:0 12px; border:1px solid rgba(214,204,177,.22);
  border-radius:10px; background:rgba(255,255,255,.05); color:#f0e9dc; font:400 12.5px/1.15 var(--font-ui,'Fragment Mono',ui-monospace,monospace); letter-spacing:.03em; cursor:pointer; white-space:nowrap; }
#tutorial-focus { position:fixed; inset:0; z-index:34; pointer-events:none; width:100vw; height:100dvh; overflow:visible;
  opacity:0; transition: opacity 240ms ease; }
#tutorial-focus[data-on='1'] { opacity:1; }
#tutorial-focus[data-fade='out'] { opacity:0; transition: opacity 160ms ease; }
/* Glass + focus live inside #game.screen; raise HUD above both so the menu is never covered.
   The slim HUD is a full-width top strip — keep it pointer-transparent except #hud-menu so
   PREVIOUS/NEXT on the glass stay clickable underneath the empty chrome. */
html.futa04-tutorial .game > .hud,
html.futa04-tutorial.futa04-branding.slim-hud .game > .hud {
  z-index: 45;
  pointer-events: none;
}
html.futa04-tutorial #hud-menu {
  position: relative;
  z-index: 46;
  opacity: 1 !important;
  filter: none !important;
  pointer-events: auto !important;
  visibility: visible !important;
}
html.futa04-tutorial #scrim { z-index: 50; }
html.futa04-tutorial .sheet { z-index: 51; }
/* Plain SVG mask dim — no foreignObject/backdrop-filter (iOS Safari ignores those cutouts
   and the grayscale+brightness crush leaves the board nearly black). */
#tutorial-focus .focus-dim { fill:rgba(0,0,0,.38); }
/* Contour-free highlight: soft cream fill only — no stroke/ring outline. */
#tutorial-focus .focus-glow { fill:rgba(233,216,173,.10); stroke:none; stroke-width:0;
  filter:drop-shadow(0 0 12px rgba(233,216,173,.55)); }
#tutorial-focus .focus-glow-soft { fill:rgba(233,216,173,.18); stroke:none; filter:drop-shadow(0 0 16px rgba(233,216,173,.42)); }
#tutorial-focus .focus-lift { transform-box:fill-box; transform-origin:center; }
/* Steady opacity pulse only — never scale (scale + live target breathe looked broken). */
#tutorial-focus[data-pulse='1'] .focus-lift { animation:tutorial-glow-pulse 1.6s ease-in-out infinite; }
@keyframes tutorial-glow-pulse {
  0%,100% { opacity:1; }
  50% { opacity:.72; }
}
#tutorial-focus .focus-pointer { filter:drop-shadow(0 1px 3px rgba(0,0,0,.4)); transform-origin:10px 4px; }
#tutorial-focus .focus-pointer-body { fill:#fff; stroke:none; }
#tutorial-focus[data-bob='1'] .focus-pointer { animation:tutorial-pointer-tap 1.1s ease-in-out infinite; }
#tutorial-focus[data-bob='hard'] .focus-pointer { animation:tutorial-pointer-tap-hard .85s ease-in-out infinite; }
@keyframes tutorial-pointer-tap { 0%,100% { transform:translate(0,0); } 45% { transform:translate(var(--bob-x,0px),var(--bob-y,7px)); } }
@keyframes tutorial-pointer-tap-hard { 0%,100% { transform:translate(0,0); } 45% { transform:translate(var(--bob-x,0px),var(--bob-y,10px)); } }
#tutorial-focus.nudge .focus-glow-soft { animation:tutorial-nudge .16s ease-out; }
@keyframes tutorial-nudge { 25% { transform:translateX(-4px); } 75% { transform:translateX(4px); } }
.reduce-motion #tutorial-focus .focus-glow, .reduce-motion #tutorial-focus .focus-pointer,
.reduce-motion #tutorial-focus .focus-lift,
.reduce-motion #tutorial-focus.nudge .focus-glow-soft,
.reduce-motion #futasaku-glass[data-mode='tutorial'] .glass-head-slot > button[data-tut="next"].glass-blink,
.reduce-motion #futasaku-glass[data-mode='tutorial'][data-step-settle='1'] .glass-tutorial { animation:none !important; }
@media (prefers-reduced-motion:reduce) {
  #futasaku-glass[data-mode='tutorial'] { transition: opacity 120ms ease; }
  #futasaku-glass[data-mode='tutorial'] .glass-head-slot > button[data-tut="next"].glass-blink,
  #futasaku-glass[data-mode='tutorial'][data-step-settle='1'] .glass-tutorial { animation:none !important; }
  #tutorial-focus { transition: opacity 120ms ease; }
  #tutorial-focus .focus-glow, #tutorial-focus .focus-pointer,
  #tutorial-focus .focus-lift, #tutorial-focus.nudge .focus-glow-soft { animation:none !important; }
}
/* Bloom explain: soft mid-screen set + run faces (no hard frame — float only). */
#tutorial-bloom-demo {
  position:fixed; inset:0; z-index:36; pointer-events:none; display:flex; align-items:center; justify-content:center;
  padding:max(96px, 14vh) 16px 24px; box-sizing:border-box;
  opacity:0; transition:opacity 280ms ease;
}
#tutorial-bloom-demo[hidden] { display:none; }
#tutorial-bloom-demo[data-on='1'] { opacity:1; }
#tutorial-bloom-demo .tutorial-bloom-stage {
  display:flex; flex-direction:column; gap:22px; align-items:stretch;
  width:min(340px, calc(100vw - 32px)); padding:8px 4px;
  border:0; border-radius:0; background:transparent;
  box-shadow:none; backdrop-filter:none; -webkit-backdrop-filter:none;
}
#tutorial-bloom-demo .tutorial-bloom-group { display:flex; flex-direction:column; gap:8px; align-items:center; }
/* Same face as tutorial glass why-copy (not a mismatched display face). */
#tutorial-bloom-demo .tutorial-bloom-tag {
  margin:0; font:400 13.5px/1.5 var(--font-ui,'Fragment Mono',ui-monospace,monospace);
  letter-spacing:.012em; text-transform:none; color:rgba(240,233,220,.78);
  text-shadow:0 1px 5px rgba(0,0,0,.55);
}
#tutorial-bloom-demo .tutorial-bloom-row {
  display:flex; align-items:flex-end; justify-content:center; gap:8px;
}
#tutorial-bloom-demo .tutorial-bloom-card {
  --cw: clamp(44px, 12vw, 56px); --ch: calc(var(--cw) * 1.42);
  width:var(--cw); height:var(--ch); flex:none;
  transform:translateY(10px) scale(.94); opacity:0;
  box-shadow:0 6px 16px rgba(0,0,0,.38);
}
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-card {
  animation:tutorial-bloom-card-in 420ms cubic-bezier(.22,.72,.24,1) forwards;
}
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-group:nth-child(1) .tutorial-bloom-card:nth-child(1) { animation-delay:40ms; }
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-group:nth-child(1) .tutorial-bloom-card:nth-child(2) { animation-delay:110ms; }
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-group:nth-child(1) .tutorial-bloom-card:nth-child(3) { animation-delay:180ms; }
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-group:nth-child(2) .tutorial-bloom-card:nth-child(1) { animation-delay:260ms; }
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-group:nth-child(2) .tutorial-bloom-card:nth-child(2) { animation-delay:330ms; }
#tutorial-bloom-demo[data-on='1'] .tutorial-bloom-group:nth-child(2) .tutorial-bloom-card:nth-child(3) { animation-delay:400ms; }
@keyframes tutorial-bloom-card-in {
  from { opacity:0; transform:translateY(18px) scale(.9); }
  to { opacity:1; transform:translateY(0) scale(1); }
}
.reduce-motion #tutorial-bloom-demo,
.reduce-motion #tutorial-bloom-demo .tutorial-bloom-card { transition:none; animation:none !important; }
.reduce-motion #tutorial-bloom-demo[data-on='1'] .tutorial-bloom-card { opacity:1; transform:none; }
@media (prefers-reduced-motion:reduce) {
  #tutorial-bloom-demo, #tutorial-bloom-demo .tutorial-bloom-card { transition:none; animation:none !important; }
  #tutorial-bloom-demo[data-on='1'] .tutorial-bloom-card { opacity:1; transform:none; }
}
`;

/** Authored demo faces for bloom explain — set (3s) and run (4-5-6). Labels stay BLOOM. */
const BLOOM_DEMO_SET: readonly Card[] = Object.freeze([
  { id: -101, suit: 0, rank: 3 },
  { id: -102, suit: 1, rank: 3 },
  { id: -103, suit: 2, rank: 3 },
]);
const BLOOM_DEMO_RUN: readonly Card[] = Object.freeze([
  { id: -111, suit: 0, rank: 4 },
  { id: -112, suit: 0, rank: 5 },
  { id: -113, suit: 0, rank: 6 },
]);

const bloomDemoRowHtml = (cards: readonly Card[]) =>
  cards.map(card =>
    `<span class="tutorial-bloom-card card ${suitClass(card)}" aria-hidden="true">${cardFace(card)}</span>`,
  ).join('');

const bloomDemoHtml = () =>
  `<div class="tutorial-bloom-stage" aria-hidden="true">`
  + `<div class="tutorial-bloom-group"><span class="tutorial-bloom-tag">Set — same number, different suits</span>`
  + `<div class="tutorial-bloom-row">${bloomDemoRowHtml(BLOOM_DEMO_SET)}</div></div>`
  + `<div class="tutorial-bloom-group"><span class="tutorial-bloom-tag">Run — numbers in a row, one suit</span>`
  + `<div class="tutorial-bloom-row">${bloomDemoRowHtml(BLOOM_DEMO_RUN)}</div></div>`
  + `</div>`;


const rectOf = (element: Element) => element.getBoundingClientRect();
const safe = (text: string) => text.replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Tracked = { cx: number; cy: number; hole: string; ring: string; soft: string; w: number; h: number; left: number; top: number; right: number; bottom: number; exact?: boolean };

const FOCUS_RX = 10;
const FOCUS_PAD_X = 8;
const FOCUS_PAD_Y = 8;
const FOCUS_VIEW_MARGIN = 6;
/** Square icon buttons (Skip, Undo, …) stretch into a soft horizontal pill — never a circle. */
const MIN_PILL_ASPECT = 1.4;

/**
 * Layout box with CSS scale / transform scale undone so target breathe/pulse
 * does not make the highlight chase and wobble.
 */
const layoutBounds = (el: Element): { left: number; top: number; right: number; bottom: number } | null => {
  const r = rectOf(el);
  if (r.width <= 0 || r.height <= 0) return null;
  let sx = 1;
  let sy = 1;
  try {
    const cs = getComputedStyle(el);
    const scaleProp = (cs as CSSStyleDeclaration & { scale?: string }).scale;
    if (scaleProp && scaleProp !== 'none') {
      const parts = scaleProp.trim().split(/\s+/).map(parseFloat);
      sx = parts[0] || 1;
      sy = Number.isFinite(parts[1]!) ? parts[1]! : sx;
    } else if (cs.transform && cs.transform !== 'none') {
      const m = new DOMMatrixReadOnly(cs.transform);
      sx = Math.hypot(m.a, m.b) || 1;
      sy = Math.hypot(m.c, m.d) || 1;
    }
  } catch { /* ignore */ }
  const ax = Math.abs(sx) || 1;
  const ay = Math.abs(sy) || 1;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const w = r.width / ax;
  const h = r.height / ay;
  return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
};

/** Keep the padded highlight fully on-screen (hand glow must not clip off the bottom). */
const clampBoundsToViewport = (left: number, top: number, right: number, bottom: number) => {
  const margin = FOCUS_VIEW_MARGIN;
  const maxR = Math.max(margin + 8, innerWidth - margin);
  const maxB = Math.max(margin + 8, innerHeight - margin);
  let l = left;
  let t = top;
  let r = right;
  let b = bottom;
  const shift = (dx: number, dy: number) => { l += dx; r += dx; t += dy; b += dy; };
  if (l < margin) shift(margin - l, 0);
  if (t < margin) shift(0, margin - t);
  if (r > maxR) shift(maxR - r, 0);
  if (b > maxB) shift(0, maxB - b);
  if (l < margin) l = margin;
  if (t < margin) t = margin;
  if (r > maxR) r = maxR;
  if (b > maxB) b = maxB;
  return { left: l, top: t, right: r, bottom: b };
};

/** Soft rounded-rect / pill geometry. Contour-free; never a circular ring. */
const geometryFromBounds = (left: number, top: number, right: number, bottom: number, exact = false): Tracked => {
  let l = left; let t = top; let r = right; let b = bottom;
  ({ left: l, top: t, right: r, bottom: b } = clampBoundsToViewport(l, t, r, b));
  let bw = r - l; let bh = b - t;
  // Nearly-square targets would read as circles with large rx — widen into a pill.
  // A single card keeps its own outline: widening would spill onto its neighbours in the fan.
  if (!exact && bw > 0 && bh > 0) {
    const aspect = bw / bh;
    if (aspect < MIN_PILL_ASPECT && bh / bw < MIN_PILL_ASPECT) {
      const targetW = bh * MIN_PILL_ASPECT;
      const grow = (targetW - bw) / 2;
      l -= grow; r += grow; bw = targetW;
      ({ left: l, top: t, right: r, bottom: b } = clampBoundsToViewport(l, t, r, b));
      bw = r - l; bh = b - t;
    }
  }
  const x = l - FOCUS_PAD_X; const y = t - FOCUS_PAD_Y;
  const w = bw + FOCUS_PAD_X * 2; const h = bh + FOCUS_PAD_Y * 2;
  const cx = l + bw / 2; const cy = t + bh / 2;
  // Cap rx so even short pills stay rectangular, not stadium-circles.
  const rx = Math.min(FOCUS_RX, Math.min(w, h) * 0.22);
  const rect = `x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx.toFixed(1)}"`;
  return {
    cx, cy,
    hole: `<rect ${rect} fill="black"/>`,
    ring: `<rect class="focus-glow" ${rect}/>`,
    soft: `<rect class="focus-glow-soft" ${rect}/>`,
    w: bw, h: bh, left: l, top: t, right: r, bottom: b, exact,
  };
};

/** Menu hole so #hud-menu stays undimmed and readable during tutorial. */
const menuCutoutHole = (): string => {
  const el = typeof document !== 'undefined' ? document.getElementById('hud-menu') : null;
  if (!el) return '';
  const r = rectOf(el);
  if (r.width <= 0 || r.height <= 0) return '';
  const pad = 6;
  const x = r.left - pad; const y = r.top - pad;
  const w = r.width + pad * 2; const h = r.height + pad * 2;
  const rx = Math.min(10, Math.min(w, h) * 0.22);
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx.toFixed(1)}" fill="black"/>`;
};

/**
 * Prefer the pile face (`.pile-card`) over the tall `#deck` / `#discard` button.
 * The button box includes the meter/label chrome and reads as a wrong-sized, offset glow.
 */
const focusMeasureEl = (el: Element): Element => {
  if (el.id === 'deck' || el.id === 'discard') return el.querySelector('.pile-card') ?? el;
  // Terrain art may spill beyond the hex. Focus the gameplay footprint instead
  // of letting a rock or plant enlarge the teaching cutout into its neighbours.
  if (el.classList.contains('hex-cell')) return el.querySelector(':scope > path.hex') ?? el;
  return el;
};

/**
 * DRAW PILE teaching targets `#deck` for the gate, but the copy mentions both piles —
 * expand the glow to cover both faces. Gate still only unlocks `#deck`.
 */
const expandFocusSelector = (selector: string): string => {
  const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 1 && parts[0] === '#deck') return '#deck, #discard';
  return selector;
};

/** Always the same soft pill — never hex / circle contour, even on icon buttons. */
const measureTarget = (selector: string, _shape: FocusShape): Tracked | null => {
  if (!selector || _shape === 'none') return null;
  const nodes = [...document.querySelectorAll(expandFocusSelector(selector))];
  if (!nodes.length) return null;
  let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity;
  for (const raw of nodes) {
    const box = layoutBounds(focusMeasureEl(raw));
    if (!box) continue;
    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  }
  if (!Number.isFinite(left)) return null;
  const singleCard = nodes.length === 1 && nodes[0]!.matches('#hand .card');
  return geometryFromBounds(left, top, right, bottom, singleCard);
};

/** Simple white triangle arrow (tip toward the target). */
const POINTER_ARROW = `<g class="focus-pointer">`
  + `<polygon class="focus-pointer-body" points="10,1 19,22 10,17 1,22"/>`
  + `</g>`;

export type GlassSurface = ReturnType<typeof mountGlassSurface>;
export const mountGlassSurface = (onClose: () => void) => {
  const style = document.createElement('style'); style.id = 'futasaku-glass-style'; style.textContent = CSS; document.head.append(style);
  const panel = document.createElement('section'); panel.id = 'futasaku-glass'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Match details');
  const focus = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); focus.id = 'tutorial-focus'; focus.setAttribute('hidden', '');
  focus.setAttribute('aria-hidden', 'true');
  const bloomDemo = document.createElement('div');
  bloomDemo.id = 'tutorial-bloom-demo';
  bloomDemo.hidden = true;
  bloomDemo.setAttribute('aria-hidden', 'true');
  // Inside #game.screen so HUD z-index can sit above glass.
  const host = document.getElementById('game') ?? document.body;
  host.append(focus, bloomDemo, panel);
  const dock = document.getElementById('dock')!;
  let targetSelector = '';
  let targetShape: FocusShape = 'pill';
  let mode: 'tutorial' | 'intel' | 'guidance' | null = null;
  let moveCursor = -1;
  let lastMoveLen = -1;
  let reduceMotion = false;
  let idleHard = false;
  let raf = 0;
  let holdUntil = 0;
  let smooth: Tracked | null = null;
  let panelSide: 'top' | 'bottom' = 'top';
  let handlers: TutorialWindowHandlers = {};
  let lastStepKey = '';
  let ledTitle = '';
  let focusScene: 'tracked' | 'menu' | 'empty' | null = null;
  const paintTutorialLed = () => {
    const canvas = panel.querySelector<HTMLCanvasElement>('.glass-led-cells');
    if (!canvas || !ledTitle) return;
    const text = ledTitle.toUpperCase();
    const large = document.documentElement.classList.contains('large-text');
    const titleSlot = panel.querySelector('.glass-head-title') as HTMLElement | null;
    const slotW = titleSlot?.clientWidth || 0;
    const maxW = Math.max(72, Math.min(slotW > 0 ? slotW - 8 : panel.clientWidth - 36, innerWidth - 56));
    let scale = large ? 1.2 : 1.1;
    const natural = ledMessageWidth(text) * scale;
    if (natural > maxW) scale *= maxW / natural;
    drawLedCells(canvas, text, false, 'amber', scale);
  };
  const showFocus = (show: boolean) => {
    if (show) {
      focus.removeAttribute('hidden');
      focus.dataset.on = '1';
      focus.dataset.fade = 'in';
    } else {
      focus.dataset.fade = 'out';
      focus.dataset.on = '0';
      window.setTimeout(() => {
        if (focus.dataset.on === '0') focus.setAttribute('hidden', '');
      }, 130);
    }
  };

  const setBloomDemo = (show: boolean) => {
    if (!show) {
      bloomDemo.dataset.on = '0';
      bloomDemo.hidden = true;
      bloomDemo.replaceChildren();
      return;
    }
    // Keep the pull-in when only the glass CTA refreshes on the same step.
    if (!bloomDemo.hidden && bloomDemo.dataset.on === '1' && bloomDemo.firstChild) return;
    bloomDemo.innerHTML = bloomDemoHtml();
    bloomDemo.hidden = false;
    bloomDemo.dataset.on = '0';
    void bloomDemo.offsetWidth;
    bloomDemo.dataset.on = '1';
  };


  const stopLoop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const placeIntel = () => {
    clearTutorialReserve();
    const d = rectOf(dock);
    panel.style.left = `${Math.max(6, d.left + 6)}px`;
    panel.style.width = `${Math.max(0, Math.min(innerWidth - 12, d.width - 12))}px`;
    panel.style.maxWidth = '';
    panel.style.top = `${Math.max(6, d.top + 4)}px`;
    panel.style.height = `${Math.max(140, Math.min(innerHeight - d.top - 8, d.height - 8))}px`;
    panel.style.bottom = '';
    panel.style.transform = '';
  };

  const safeInsets = () => {
    const probe = document.getElementById('safe-probe');
    if (!probe) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    const cs = getComputedStyle(probe);
    const px = (s: string) => parseFloat(s) || 0;
    return {
      top: px(cs.paddingTop),
      right: px(cs.paddingRight),
      bottom: px(cs.paddingBottom),
      left: px(cs.paddingLeft),
    };
  };

  const placeTutorialPanel = (_tracked: Tracked | null) => {
    // Keep the glass docked (never follows the moving highlight).
    void _tracked;
    panelSide = 'top';
    panel.style.height = 'auto';
    panel.style.bottom = '';
    const side = document.documentElement.dataset.layout === 'side';
    const safe = safeInsets();
    if (side) {
      // Desktop: right column — sides with the cockpit; top near the map but clear of the logo.
      const cockpit = document.getElementById('futa04-box')?.getBoundingClientRect();
      const board = document.getElementById('board-wrap')?.getBoundingClientRect();
      const dock = document.getElementById('dock')?.getBoundingClientRect();
      const logo = document.getElementById('hud-brand')?.getBoundingClientRect();
      const col = cockpit ?? dock;
      if (col && board) {
        const width = Math.max(200, Math.round(col.width));
        const left = Math.round(col.left);
        // Prefer map-top alignment, but always sit a small gap under the Futa logo when it
        // shares the right column (never cover chrome).
        const logoClear = logo && logo.width > 0 ? Math.ceil(logo.bottom + 8) : 0;
        const top = Math.max(Math.round(board.top), logoClear);
        panel.style.width = `${width}px`;
        panel.style.maxWidth = `${width}px`;
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        // Override stylesheet `translateX(-50%)` (used for phone centering).
        panel.style.transform = 'none';
        clearTutorialPads();
        return;
      }
    }
    // Phone / stack: the menu and logo own the top chrome, including the
    // Home Screen safe area. Measure their live bounds rather than guessing a
    // device-specific notch offset.
    const sidePad = 16 + safe.left + safe.right;
    const width = Math.min(420, Math.max(200, innerWidth - sidePad));
    const menu = document.getElementById('hud-menu')?.getBoundingClientRect();
    const logo = document.getElementById('hud-brand')?.getBoundingClientRect();
    const chromeBottom = Math.max(menu?.bottom ?? 0, logo?.bottom ?? 0);
    const top = Math.max(Math.round(safe.top), Math.ceil(chromeBottom + 8));
    panel.style.width = `${width}px`;
    panel.style.maxWidth = `${width}px`;
    panel.style.left = '50%';
    panel.style.transform = 'translateX(-50%)';
    panel.style.top = `${top}px`;
    // After layout: equal gaps glass→board and board→cockpit/hand (centre map in the band).
    requestAnimationFrame(() => balanceTutorialBoardBand());
  };

  /** Shared chrome→board margin on both ends of the leftover map band. */
  const TUTORIAL_BAND_GAP = 4;
  let lastBandKey = '';

  const clearTutorialPads = () => {
    lastBandKey = '';
    const root = document.documentElement.style;
    root.removeProperty('--tutorial-glass-h');
    root.removeProperty('--tutorial-pad-top');
    root.removeProperty('--tutorial-pad-bottom');
  };

  /**
   * Reserve equal chrome margins above/below the map band (glass↔dock).
   * Camera centres a short map while `futa04-tutorial` is on so hex gaps match.
   */
  const balanceTutorialBoardBand = () => {
    if (mode !== 'tutorial' || document.documentElement.dataset.layout === 'side') return;
    const wrapEl = document.getElementById('board-wrap');
    const dockEl = document.getElementById('dock');
    const wrap = wrapEl?.getBoundingClientRect();
    const glass = panel.getBoundingClientRect();
    if (!wrap || !wrapEl) return;
    const dockTop = dockEl?.getBoundingClientRect().top ?? wrap.bottom;
    const bandKey = [
      Math.round(glass.bottom), Math.round(dockTop), Math.round(wrap.height),
      Math.round(innerWidth), Math.round(innerHeight),
    ].join(':');
    if (bandKey === lastBandKey) return;
    lastBandKey = bandKey;
    document.getElementById('board')?.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    document.documentElement.classList.remove('cam-under');
    const topClear = Math.max(0, glass.bottom - wrap.top);
    const bottomClear = Math.max(0, wrap.bottom - dockTop);
    let padTop = Math.ceil(topClear + TUTORIAL_BAND_GAP);
    let padBottom = Math.ceil(bottomClear + TUTORIAL_BAND_GAP);
    const maxPad = Math.max(0, Math.floor(wrap.height - 72));
    if (padTop + padBottom > maxPad) {
      const scale = maxPad / Math.max(1, padTop + padBottom);
      padTop = Math.floor(padTop * scale);
      padBottom = Math.max(0, maxPad - padTop);
    }
    const root = document.documentElement.style;
    root.setProperty('--tutorial-pad-top', `${padTop}px`);
    root.setProperty('--tutorial-pad-bottom', `${padBottom}px`);
    root.setProperty('--tutorial-glass-h', `${padTop}px`);
    // Nudge camera to re-frame with tutorial centering.
    window.dispatchEvent(new Event('resize'));
  };

  /**
   * Place the white triangle so its tip sits on the midpoint of the highlight's
   * chosen edge (cx for top/bottom, cy for left/right) and points at the pill centre.
   * Translate is derived from the tip — not from a corner of the unrotated AABB.
   */
  const pointerPose = (tracked: Tracked, panelRect: DOMRect): { x: number; y: number; bobX: number; bobY: number; rot: number } | null => {
    const GAP = 8;
    const BOX = 22;
    type Side = 'left' | 'right' | 'top' | 'bottom';
    /** Local tip after `rotate(rot, 10, 4)` on polygon tip (10,1). */
    const tipLocal = (rot: number) => {
      const rad = (rot * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      // Tip (10,1) relative to pivot (10,4); SVG positive angles are clockwise.
      const rx = 0;
      const ry = -3;
      return { dx: 10 + rx * cos + ry * sin, dy: 4 - rx * sin + ry * cos };
    };
    // Aim at the soft pill’s edge midpoints (padded glow), not the raw element box.
    const softL = tracked.left - FOCUS_PAD_X;
    const softR = tracked.right + FOCUS_PAD_X;
    const softT = tracked.top - FOCUS_PAD_Y;
    const softB = tracked.bottom + FOCUS_PAD_Y;
    const edge: Record<Side, { tipX: number; tipY: number; room: number; bobX: number; bobY: number; rot: number }> = {
      left: { tipX: softL - GAP, tipY: tracked.cy, room: softL - 16, bobX: 8, bobY: 0, rot: 90 },
      right: { tipX: softR + GAP, tipY: tracked.cy, room: innerWidth - softR - 16, bobX: -8, bobY: 0, rot: -90 },
      top: { tipX: tracked.cx, tipY: softT - GAP, room: softT - 16, bobX: 0, bobY: 8, rot: 180 },
      bottom: { tipX: tracked.cx, tipY: softB + GAP, room: innerHeight - softB - 16, bobX: 0, bobY: -8, rot: 0 },
    };
    /** Rough AABB of the body extending away from the tip (for collision / on-screen). */
    const bodyBox = (side: Side, tipX: number, tipY: number) => {
      if (side === 'left') return { x: tipX - BOX, y: tipY - BOX / 2, w: BOX, h: BOX };
      if (side === 'right') return { x: tipX, y: tipY - BOX / 2, w: BOX, h: BOX };
      if (side === 'top') return { x: tipX - BOX / 2, y: tipY - BOX, w: BOX, h: BOX };
      return { x: tipX - BOX / 2, y: tipY, w: BOX, h: BOX };
    };
    const fan = document.getElementById('hand')?.getBoundingClientRect() ?? null;
    const overlaps = (box: { x: number; y: number; w: number; h: number }, r: DOMRect) =>
      box.x < r.right && box.x + box.w > r.left && box.y < r.bottom && box.y + box.h > r.top;
    const onScreen = (box: { x: number; y: number; w: number; h: number }) =>
      box.x >= 4 && box.y >= 4 && box.x + box.w <= innerWidth - 4 && box.y + box.h <= innerHeight - 4;
    const targetRect = {
      left: tracked.left, top: tracked.top, right: tracked.right, bottom: tracked.bottom,
      width: tracked.w, height: tracked.h, x: tracked.left, y: tracked.top, toJSON: () => ({}),
    } as DOMRect;
    const usable = (Object.keys(edge) as Side[])
      .map(side => {
        const e = edge[side]!;
        const local = tipLocal(e.rot);
        return {
          side,
          room: e.room,
          tipX: e.tipX,
          tipY: e.tipY,
          x: e.tipX - local.dx,
          y: e.tipY - local.dy,
          bobX: e.bobX,
          bobY: e.bobY,
          rot: e.rot,
          box: bodyBox(side, e.tipX, e.tipY),
        };
      })
      .filter(c => {
        if (c.side === 'top' && panelSide === 'top') return false;
        if (c.side === 'bottom' && panelSide === 'bottom') return false;
        if (c.room < BOX + GAP) return false;
        if (!onScreen(c.box)) return false;
        if (overlaps(c.box, panelRect)) return false;
        if (fan && overlaps(c.box, fan)) return false;
        if (overlaps(c.box, targetRect)) return false;
        return true;
      })
      .sort((a, b) => b.room - a.room);
    const pick = usable[0];
    if (!pick) return null;
    return { x: pick.x, y: pick.y, bobX: pick.bobX, bobY: pick.bobY, rot: pick.rot };
  };

  const applyRectAttrs = (el: Element | null, tracked: Tracked, soft: boolean) => {
    if (!el) return;
    const padX = soft ? FOCUS_PAD_X : 0;
    const padY = soft ? FOCUS_PAD_Y : 0;
    const x = tracked.left - padX;
    const y = tracked.top - padY;
    const w = tracked.w + padX * 2;
    const h = tracked.h + padY * 2;
    const rx = Math.min(FOCUS_RX, Math.min(w, h) * 0.22);
    el.setAttribute('x', x.toFixed(1));
    el.setAttribute('y', y.toFixed(1));
    el.setAttribute('width', w.toFixed(1));
    el.setAttribute('height', h.toFixed(1));
    el.setAttribute('rx', rx.toFixed(1));
  };

  /** Pixel cutouts need userSpaceOnUse — default objectBoundingBox ignores screen coords
   *  so the hole never punches and the whole board stays crushed. */
  const cutoutMask = (holes: string) =>
    `<defs><mask id="tutorial-cutouts" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">`
    + `<rect x="0" y="0" width="100%" height="100%" fill="white"/>`
    + holes
    + `</mask></defs>`
    + `<rect class="focus-dim" width="100%" height="100%" mask="url(#tutorial-cutouts)"/>`;

  const ensureTrackedScene = () => {
    if (focusScene === 'tracked') return;
    focus.innerHTML = cutoutMask(
      `<rect class="focus-hole" fill="black"/>`
      + `<rect class="focus-menu-hole" fill="black"/>`,
    )
      + `<g class="focus-lift"><rect class="focus-glow-soft"/><rect class="focus-glow"/></g>`
      + `<g class="focus-pointer-root" hidden>${POINTER_ARROW}</g>`;
    focusScene = 'tracked';
  };

  const syncMenuHole = () => {
    const menuEl = focus.querySelector('.focus-menu-hole');
    const menu = document.getElementById('hud-menu');
    const menuRect = menu ? rectOf(menu) : null;
    if (menuEl && menuRect && menuRect.width > 0 && menuRect.height > 0) {
      const padM = 6;
      const w = menuRect.width + padM * 2;
      const h = menuRect.height + padM * 2;
      menuEl.setAttribute('x', (menuRect.left - padM).toFixed(1));
      menuEl.setAttribute('y', (menuRect.top - padM).toFixed(1));
      menuEl.setAttribute('width', w.toFixed(1));
      menuEl.setAttribute('height', h.toFixed(1));
      menuEl.setAttribute('rx', Math.min(10, Math.min(w, h) * 0.22).toFixed(1));
      menuEl.removeAttribute('hidden');
    } else if (menuEl) {
      menuEl.setAttribute('width', '0');
      menuEl.setAttribute('height', '0');
    }
  };

  const paintFocus = (tracked: Tracked | null) => {
    focus.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    // Steady pulse always while a target is live — never pauses for settle/jiggle.
    focus.dataset.pulse = reduceMotion || !tracked ? '0' : '1';
    focus.dataset.bob = reduceMotion || !tracked ? '0' : idleHard ? 'hard' : '1';
    focus.dataset.on = tracked || mode === 'tutorial' ? '1' : '0';
    const menuHole = menuCutoutHole();
    if (!tracked) {
      if (!menuHole) {
        if (focusScene !== 'empty') {
          focus.innerHTML = `<rect class="focus-dim" width="100%" height="100%"/>`;
          focusScene = 'empty';
        }
        focus.dataset.pointer = '0';
        return;
      }
      if (focusScene !== 'menu') {
        focus.innerHTML = cutoutMask(`<rect class="focus-menu-hole" fill="black"/>`);
        focusScene = 'menu';
      }
      syncMenuHole();
      focus.dataset.pointer = '0';
      return;
    }
    ensureTrackedScene();
    applyRectAttrs(focus.querySelector('.focus-hole'), tracked, true);
    applyRectAttrs(focus.querySelector('.focus-glow-soft'), tracked, true);
    applyRectAttrs(focus.querySelector('.focus-glow'), tracked, true);
    syncMenuHole();
    const panelRect = panel.getBoundingClientRect();
    const pose = pointerPose(tracked, panelRect);
    const pointerRoot = focus.querySelector('.focus-pointer-root');
    if (pose && pointerRoot) {
      focus.style.setProperty('--bob-x', `${pose.bobX}px`);
      focus.style.setProperty('--bob-y', `${pose.bobY}px`);
      pointerRoot.setAttribute('transform', `translate(${pose.x.toFixed(1)} ${pose.y.toFixed(1)}) rotate(${pose.rot} 10 4)`);
      pointerRoot.removeAttribute('hidden');
    } else if (pointerRoot) {
      pointerRoot.setAttribute('hidden', '');
    }
    focus.dataset.pointer = pose ? '1' : '0';
  };

  const tick = (now: number) => {
    raf = 0;
    if (mode !== 'tutorial' || document.hidden) return;
    const measured = measureTarget(targetSelector, targetShape);
    if (measured) {
      holdUntil = now + 280;
      if (!smooth) smooth = measured;
      else {
        // Soft ease toward a new target; unscaled measure already ignores breathe jitter.
        const drift = Math.hypot(smooth.cx - measured.cx, smooth.cy - measured.cy)
          + Math.abs(smooth.w - measured.w) + Math.abs(smooth.h - measured.h);
        const t = reduceMotion ? 1 : drift < 2.5 ? 0.08 : 0.22;
        const left = lerp(smooth.left, measured.left, t);
        const top = lerp(smooth.top, measured.top, t);
        const right = lerp(smooth.right, measured.right, t);
        const bottom = lerp(smooth.bottom, measured.bottom, t);
        smooth = geometryFromBounds(left, top, right, bottom, measured.exact);
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
    if (mode === 'intel' || mode === 'guidance') return placeIntel();
    placeTutorialPanel(smooth);
    paintTutorialLed();
    if (!raf) startLoop();
  };

  const observer = new ResizeObserver(place); observer.observe(dock);
  window.addEventListener('resize', place, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else if (mode === 'tutorial') startLoop();
  });

  const clearTutorialReserve = () => {
    clearTutorialPads();
  };

  const close = () => {
    mode = null; moveCursor = -1; lastMoveLen = -1; stopLoop(); smooth = null;
    focusScene = null;
    setBloomDemo(false); clearTutorialReserve();
    panel.hidden = true; showFocus(false); panel.replaceChildren(); onClose();
  };

  const playGlassStepSettle = () => {
    if (reduceMotion) {
      panel.dataset.stepSettle = '0';
      return;
    }
    panel.dataset.stepSettle = '0';
    void panel.offsetWidth;
    panel.dataset.stepSettle = '1';
    window.setTimeout(() => {
      if (panel.dataset.stepSettle === '1') panel.dataset.stepSettle = '0';
    }, 320);
  };

  const bindTutorialButtons = () => {
    panel.querySelector<HTMLButtonElement>('[data-tut="previous"]')?.addEventListener('click', e => { e.preventDefault(); handlers.onPrevious?.(); });
    panel.querySelector<HTMLButtonElement>('[data-tut="next"]')?.addEventListener('click', e => { e.preventDefault(); handlers.onNext?.(); });
    panel.querySelector<HTMLButtonElement>('[data-tut="play"]')?.addEventListener('click', e => { e.preventDefault(); handlers.onPlayReal?.(); });
    panel.querySelector<HTMLButtonElement>('[data-tut="replay"]')?.addEventListener('click', e => { e.preventDefault(); handlers.onReplayChapter?.(); });
  };

  const renderTutorialWindow = (
    instruction: string,
    chapter: number,
    options: TutorialFocusOptions,
    opts: { keepShell?: boolean } = {},
  ) => {
    void chapter;
    void options.chapterCount;
    const line = options.praise || options.status || instruction;
    const whyHtml = options.praise || options.status ? '' : (options.why ? `<p class="glass-why">${safe(options.why)}</p>` : '');
    const icons = options.turnIcons
      ? `<div class="glass-icons" aria-hidden="true"><span>Draw</span><span>Grow</span><span>Throw</span></div>` : '';
    const b = options.buttons ?? {};
    const nextLabel = b.nextLabel || 'NEXT';
    // Exit tutorial lives in the pause menu (#hud-menu), not on the glass.
    // Head row always has 3 equal slots so the title stays centred.
    const prevBtn = b.previous
      ? `<button type="button" data-tut="previous">PREVIOUS</button>` : '';
    const nextBtn = b.next
      ? `<button type="button" data-tut="next" class="${b.nextBlink ? 'glass-blink' : ''}">${safe(nextLabel)}</button>`
      : (b.playReal ? `<button type="button" data-tut="play">Play</button>` : '');
    const titleHtml = `<p class="glass-instruction glass-copy" data-led-title="1">`
      + `<span class="glass-led-sr">${safe(line)}</span>`
      + `<span class="glass-led-window" aria-hidden="true"><canvas class="glass-led-cells"></canvas></span>`
      + `</p>`;
    const headHtml = `<div class="glass-head" role="group" aria-label="Tutorial step">`
      + `<div class="glass-head-slot glass-head-prev">${prevBtn}</div>`
      + `<div class="glass-head-slot glass-head-title">${titleHtml}</div>`
      + `<div class="glass-head-slot glass-head-next">${nextBtn}</div>`
      + `</div>`;
    const shell = panel.querySelector('.glass-tutorial');
    const canPatch = !!opts.keepShell && !!shell && ledTitle === line
      && !!panel.querySelector('.glass-led-cells') && !!panel.querySelector('.glass-head');
    if (canPatch && shell) {
      // Same lesson shell: only swap side buttons / why / icons so the LED does not flash.
      const sr = shell.querySelector('.glass-led-sr');
      if (sr) sr.textContent = line;
      const prevSlot = shell.querySelector('.glass-head-prev');
      const nextSlot = shell.querySelector('.glass-head-next');
      if (prevSlot) prevSlot.innerHTML = prevBtn;
      if (nextSlot) nextSlot.innerHTML = nextBtn;
      for (const node of [...shell.querySelectorAll('.glass-why, .glass-status, .glass-icons')]) node.remove();
      const head = shell.querySelector('.glass-head');
      if (head) head.insertAdjacentHTML('afterend', `${whyHtml}${icons}`);
      else shell.insertAdjacentHTML('beforeend', `${whyHtml}${icons}`);
      handlers = options.handlers ?? handlers;
      bindTutorialButtons();
      return;
    }
    ledTitle = line;
    panel.innerHTML = `<div class="glass-tutorial">${headHtml}${whyHtml}${icons}</div>`;
    bindTutorialButtons();
    paintTutorialLed();
  };

  const tutorial = (text: string, chapter: number, selectors: readonly string[], options: TutorialFocusOptions = {}) => {
    mode = 'tutorial';
    handlers = options.handlers ?? {};
    reduceMotion = !!options.reduceMotion || document.documentElement.classList.contains('reduce-motion');
    idleHard = !!options.idleHard;
    const nextSelector = selectors.join(', ');
    targetSelector = nextSelector;
    // Tutorial focus is always a soft pill/rounded-rect — never hex or circle contour.
    targetShape = !targetSelector || options.shape === 'none' ? 'none' : 'pill';
    panel.dataset.mode = 'tutorial';
    panel.dataset.focus = targetSelector.includes('#deck') ? 'deck' : targetSelector.includes('#discard') ? 'discard' : 'other';
    panel.hidden = false;
    showFocus(true);
    setBloomDemo(!!options.bloomDemo);
    panel.setAttribute('aria-label', 'Tutorial guidance');
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    const stepKey = options.stepKey ?? `${chapter}:${text}`;
    const stepped = stepKey !== lastStepKey;
    lastStepKey = stepKey;
    // Same step (CTA arm / status clear): patch actions only — avoids LED redraw flash.
    renderTutorialWindow(text, chapter, options, { keepShell: !stepped });
    if (stepped) {
      // Soft content settle — keep the highlight living so it can glide to the next target.
      panel.dataset.fade = 'out';
      playGlassStepSettle();
      requestAnimationFrame(() => {
        panel.dataset.fade = 'in';
        startLoop();
        place();
      });
    } else {
      startLoop();
      place();
    }
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

  /** Free-play bulb: one amber LED matrix line for the current step — nothing else. */
  const guidance = (line: string) => {
    const same = mode === 'guidance' && ledTitle === line && !panel.hidden;
    mode = 'guidance'; stopLoop(); smooth = null;
    panel.dataset.mode = 'guidance'; panel.hidden = false; showFocus(false);
    panel.setAttribute('aria-label', 'Turn guidance'); panel.setAttribute('role', 'dialog');
    panel.removeAttribute('aria-live');
    ledTitle = line;
    if (same) {
      paintTutorialLed();
      requestAnimationFrame(place);
      return;
    }
    panel.innerHTML = `<div class="glass-tutorial">`
      + `<p class="glass-instruction glass-copy" data-led-title="1">`
      + `<span class="glass-led-sr">${safe(line)}</span>`
      + `<span class="glass-led-window" aria-hidden="true"><canvas class="glass-led-cells"></canvas></span>`
      + `</p>`
      + `<div class="glass-actions"><button type="button" class="intel-close" aria-label="Close">×</button></div>`
      + `</div>`;
    panel.querySelector('.intel-close')?.addEventListener('click', close, { once: true });
    paintTutorialLed();
    requestAnimationFrame(place);
  };

  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });

  return {
    tutorial,
    intel,
    guidance,
    close,
    hide: () => {
      mode = null; moveCursor = -1; lastMoveLen = -1; stopLoop(); smooth = null;
      focusScene = null;
      setBloomDemo(false); clearTutorialReserve(); panel.hidden = true; showFocus(false);
    },
    nudge: () => {
      if (reduceMotion) return;
      focus.classList.remove('nudge');
      void focus.getBoundingClientRect();
      focus.classList.add('nudge');
      window.setTimeout(() => focus.classList.remove('nudge'), 180);
    },
    refresh: place,
    isOpen: () => mode === 'intel' || mode === 'guidance',
    mode: () => mode,
    /** Test hook: last smoothed glow centre. */
    focusCentre: () => smooth ? { x: smooth.cx, y: smooth.cy } : null,
    /** Test hook: whether the hand pointer is currently drawn. */
    pointerVisible: () => focus.dataset.pointer === '1',
    setIdleHard: (hard: boolean) => { idleHard = hard; },
    /** Hide glow + pointer (busy / opponent / between steps) while keeping the window. */
    hideFocus: () => {
      showFocus(false); stopLoop(); smooth = null; targetSelector = '';
      focusScene = null;
    },
  };
};
