/** Futasaku 0.4 cockpit presentation. Game-owned buttons remain the action source. */
import { LED_ADVANCE, drawLedCells, ledMarqueeTravel, ledMessageWidth, ledMotifFrames, ledStaticMessage, ledToken } from './led-cells.js';
import type { LedTone } from './led-cells.js';
import { DisplayMachine } from './display-machine.js';
import type { DisplayFrame } from './display-machine.js';
import type { DisplayEvent } from './display-readout.js';
type Action = { key: string; label: string; icon: string; priority: number; source: HTMLButtonElement };

const ICONS: Record<string, string> = {
  skip: '<path d="m5 5 7 7-7 7V5Zm8 0 7 7-7 7V5Z" fill="currentColor" stroke="none"/>',
  cancel: '<path d="M6 6 18 18M18 6 6 18"/>',
  clear: '<path d="M5 7h14M9 7V5h6v2m2 0-.7 12H7.7L7 7m3 4v5m4-5v5"/>',
  reverse: '<path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/>',
  previous: '<path d="m14.5 5-7 7 7 7"/>',
  back: '<path d="m14.5 5-7 7 7 7"/>',
  whole: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
  next: '<path d="m9.5 5 7 7-7 7"/>',
  bloom: '<path d="M12 12c-3-4-3-7 0-8 3 1 3 4 0 8Zm0 0c4-3 7-3 8 0-1 3-4 3-8 0Zm0 0c3 4 3 7 0 8-3-1-3-4 0-8Zm0 0c-4 3-7 3-8 0 1-3 4-3 8 0Z"/>',
  continue: '<path d="m8 5 8 7-8 7"/>',
  confirm: '<path d="m5 12 5 5L19 7"/>',
  neutral: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};
const svg = (kind: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind] ?? ICONS.continue}</svg>`;
const actionKind = (button: HTMLButtonElement) => button.matches('[data-kind],.bloom-toggle') ? 'bloom'
  : button.matches('.draw-clear') ? 'clear' : button.matches('.draw-reverse') ? 'reverse'
  : button.matches('.list-prev') ? 'previous' : button.matches('.list-next') ? 'next'
  : button.matches('.cancel') ? 'cancel' : button.matches('.futa04-skip,.end') ? 'skip'
  : button.matches('.empty-continue') ? 'continue' : button.matches('.primary') ? 'confirm' : 'continue';
const priority: Record<string, number> = { back: -1, clear: 0, confirm: 1, cancel: 2, bloom: 3, reverse: 4, next: 5, previous: 6, continue: 7, skip: 8, whole: 9 };

export const SMART_COCKPIT_CSS = `
html.futa04-information #step-cue { display:none !important; }
/* The match computer owns instructions; leave the entire board unobstructed. */
html.futa04-information #board-wrap :is(#draw-info,#captions,#banner,#root-warn,#turn-pill) { display:none !important; }
html.futa04-information #tool-skip { display:none !important; }
html.futa04-information .cam-whole { display:none !important; }
html.futa04-information #futa04-box {
  --hardware-edge:inset 0 1px rgba(226,218,191,.10),inset 1px 0 rgba(225,212,180,.035),inset -1px 0 rgba(225,212,180,.03),inset 0 -2px rgba(0,0,0,.48);
  --box-tools:calc(3 * var(--control-size) + 2 * var(--control-gap));
}
html.futa04-information #futa04-box #moves { position:absolute !important; width:0 !important; height:0 !important; min-height:0 !important; overflow:hidden !important; visibility:hidden !important; pointer-events:none !important; }
html.futa04-information #futa04-box > #smart-panel {
  grid-column:3; grid-row:1 / 3; align-self:end; justify-self:end;
  display:grid; grid-template-columns:repeat(3,var(--control-size)); grid-template-rows:repeat(2,var(--control-size));
  gap:var(--control-gap); width:var(--box-tools); height:calc(2 * var(--control-size) + var(--control-gap));
  position:relative; z-index:5; box-sizing:border-box;
}
html.futa04-information[data-thumb='left'] #futa04-box > #smart-panel { grid-column:1; justify-self:start; }
body.paused #smart-panel { visibility:hidden; }
body.paused #smart-bloom { visibility:hidden; }
html.futa04-information #futa04-box #futa04-actions { display:contents !important; position:static !important; width:auto !important; height:auto !important; }
html.futa04-information #futa04-box #futa04-actions > :nth-child(1) { grid-column:1; grid-row:2; }
html.futa04-information #futa04-box #futa04-actions > :nth-child(2) { grid-column:2; grid-row:2; }
html.futa04-information #futa04-box #futa04-actions > :nth-child(3) { grid-column:3; grid-row:2; }
html.futa04-information #futa04-box #futa04-actions > .hand-slot[hidden] { display:grid !important; visibility:visible !important; }
html.futa04-information .dock #futa04-box :is(#smart-context,#futa04-actions > .hand-slot) {
  width:var(--control-size) !important; height:var(--control-size) !important;
  min-width:var(--control-size); min-height:var(--control-size); max-width:var(--control-size);
  margin:0; padding:0; position:relative; inset:auto; flex:none;
  display:grid; place-items:center; box-sizing:border-box;
  border:0; border-radius:12px;
  background:#111312;
  color:var(--control-ivory); opacity:1;
  box-shadow:none;
  touch-action:manipulation;
}
html.futa04-information .dock #futa04-box :is(#smart-context,#futa04-actions > .hand-slot)::before {
  content:''; position:absolute; inset:0; border-radius:0; pointer-events:none;
  background:url('./hardware/button-frame-supplied.webp') center / contain no-repeat; z-index:0;
}
/* Major board events catch the DISPLAY's own bezel — the emitter. The keys never
   brighten themselves; they receive light only through the reflected wash below, so
   nothing reads as a second light source. */
html.futa04-information #smart-panel.hardware-reflect #smart-led::before {
  animation:futa04-hardware-reflect 640ms ease-out;
}
@keyframes futa04-hardware-reflect {
  0%,100% { filter:none; }
  27% { filter:brightness(1.06); }
  55% { filter:brightness(1.02); }
}
html.futa04-information.reduce-motion #smart-panel.hardware-reflect #smart-led::before { animation:none; }
@media (prefers-reduced-motion:reduce) {
  html.futa04-information #smart-panel.hardware-reflect #smart-led::before { animation:none; }
}
html.futa04-information .dock #futa04-box :is(#smart-context,#futa04-actions > .hand-slot) :is(svg,.i) { position:relative; z-index:1; }
html.futa04-information #futa04-box #smart-context { grid-column:3; grid-row:1; cursor:pointer; }
html.futa04-information #futa04-box #smart-context svg { width:21px; height:21px; }
html.futa04-information .dock #futa04-box :is(#smart-context,#futa04-actions > .hand-slot) :is(svg,.i) { opacity:.94; }
html.futa04-information #futa04-box #smart-context:is(:hover,:focus-visible,[aria-expanded='true']) {
  color:#fff1cf; box-shadow:0 0 9px rgba(196,150,88,.22);
}
html.futa04-information #futa04-box #smart-context:active:not(:disabled) { transform:translateY(1px) scale(.98); }
/* NO lit state on the Skip key (owner, 2026-10-15: "skip is highlighted on every grow — remove;
   i just wanted it to be possible during grow, but not extra highlighted"). Skip is therefore
   styled by the base key rule above, exactly like Draw/Grow/Blast, and no longer brightens its
   frame, warms its icon or carries a halo. It is still OFFERED whenever Skip is the move in this
   slot — availability never depended on these rules, only on the action being present. */
html.futa04-information #futa04-box #smart-context:disabled { opacity:.68; cursor:default; }
html.futa04-information #futa04-box #smart-context:disabled svg { opacity:.45; }
html.futa04-information #futa04-box #futa04-actions > .hand-slot:disabled { opacity:.72; }
html.futa04-information #futa04-box #futa04-actions > .hand-slot:disabled :is(svg,.i) { opacity:.48; }
html.futa04-information #futa04-box #smart-context:focus-visible { outline:2px solid #ffe1a7; outline-offset:2px; }
html.futa04-information #futa04-box #smart-led {
  grid-column:1 / 3; grid-row:1; width:calc(2 * var(--control-size) + var(--control-gap)); height:var(--control-size);
  padding:8px 6px; box-sizing:border-box; border:0; border-radius:12px;
  background:#111312; box-shadow:none; position:relative;
}
html.futa04-information #futa04-box #smart-led::before {
  content:''; position:absolute; inset:0; border-radius:0; pointer-events:none;
  background:url('./hardware/display-frame-supplied.webp') center / contain no-repeat; z-index:0;
}
html.futa04-information #futa04-box #smart-led-window {
  display:flex; align-items:center; justify-content:center; overflow:hidden; width:100%; height:100%; padding:0; box-sizing:border-box; position:relative;
  border-radius:6px; background:#090c0b; box-shadow:none; z-index:1;
}
html.futa04-information #futa04-box #smart-led-window::before {
  content:''; position:absolute; inset:0; pointer-events:none;
  background-image:radial-gradient(circle,rgba(166,128,78,.20) .65px,transparent .8px);
  background-size:2.3px 3.1px; background-position:0 2.6px;
}
html.futa04-information #futa04-box #smart-led-text {
  position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap;
}
html.futa04-information #futa04-box #smart-led-cells {
  display:block; flex:none; width:auto; height:26px; position:relative;
}
@media (min-width:1500px) {
  html.futa04-information #smart-led[data-mode='score'] #smart-led-cells { scale:1.32; }
}
html.futa04-information #smart-led-cells.scrolling { position:absolute; left:0; }
@keyframes smart-led-scroll { from { transform:translateX(0); } to { transform:translateX(calc(-1 * var(--led-travel,0px))); } }
html.futa04-information #smart-led-cells.scrolling { animation:smart-led-scroll var(--led-duration,8s) linear infinite; }
/* Attention pulses and impact flashes are short, one-shot and fully skipped under reduce-motion. */
html.futa04-information #smart-led-window.led-pulse { animation:smart-led-pulse 500ms ease-in-out 1; }
/* Idle re-prompt: keep blinking with the board cues until the player starts the next move. */
html.futa04-information #smart-led-window.led-alarm { animation:smart-led-alarm 1200ms ease-in-out infinite; }
@keyframes smart-led-pulse { 0%,100% { filter:none; } 50% { filter:brightness(1.22); } }
@keyframes smart-led-alarm {
  0%,100% { filter:none; }
  20% { filter:brightness(1.45) contrast(1.08); }
  40% { filter:none; }
  60% { filter:brightness(1.4) contrast(1.06); }
  80% { filter:none; }
}
/* The old "chrome" pulse ran brightness()+drop-shadow() on every key's own frame art,
   which is why the buttons looked like a second lamp. It is gone: reflected light now
   arrives through #smart-led-spill, so the keys themselves never animate. */
@keyframes idle-urgency-draw {
  0%,100% { box-shadow:0 0 0 1px rgba(239,234,220,.44),0 1px 3px rgba(242,237,224,.10) !important; }
  50% { box-shadow:0 0 0 1px rgba(239,234,220,.72),0 1px 4px rgba(242,237,224,.20) !important; }
}
@keyframes idle-urgency-grow {
  0%,100% { opacity:1; }
  50% { opacity:.8; }
}
/* The grow hand keeps its scale breathe (futa04-card-breathe's 1.055) while the LED alarms, on the
   LED's beat, with the urgency dip on top. An opacity-only cue here REPLACED the breathe, so the
   hand looked like it stopped the moment the display started blinking GROW! (owner, 2026-10-15). */
@keyframes idle-urgency-grow-hand {
  0%,100% { scale:1; opacity:1; }
  50% { scale:1.055; opacity:.86; }
}
/* Keep the throw hand's scale breathe (futa04-card-breathe) while the LED alarms —
   idle must not replace body pulse with a glow-only cue. The cue is a tight rim, not a
   halo, so the cards never read as lamps; colours and depth shadow are unchanged. */
@keyframes idle-urgency-throw {
  0%,100% {
    scale:1;
    box-shadow:0 0 0 1px rgba(222,110,83,.40),0 1px 3px rgba(190,68,47,.26),0 5px 12px rgba(20,11,10,.28);
  }
  50% {
    scale:1.04;
    box-shadow:0 0 0 1px rgba(255,120,90,.72),0 1px 4px rgba(220,70,45,.34),0 5px 14px rgba(20,11,10,.36);
  }
}
/* Matching board cues while the LED holds the sticky idle re-prompt. */
html.futa04-information.idle-urgency[data-step='draw'] :is(#deck,#discard).ready .pile-card {
  animation:idle-urgency-draw 1200ms ease-in-out infinite;
}
html.futa04-information.idle-urgency[data-step='grow'] #hand:not(.waiting) .card.playable:not(.dim):not(.lifted) {
  animation:idle-urgency-grow-hand 1200ms ease-in-out infinite;
}
html.futa04-information.idle-urgency[data-step='grow'] #smart-bloom:not([hidden]) #smart-bloom-button,
html.futa04-information.idle-urgency[data-step='grow'] #smart-bloom:not([hidden]) #smart-bloom-button .futa04-combination {
  animation:idle-urgency-grow 1200ms ease-in-out infinite;
}
html.futa04-information.idle-urgency[data-step='throw'] #hand:not(.waiting) .card:not(.futa04-throw-picked) {
  animation:idle-urgency-throw 1200ms ease-in-out infinite;
}
html.futa04-information.reduce-motion.idle-urgency :is(#deck,#discard).ready .pile-card,
html.futa04-information.reduce-motion.idle-urgency #hand .card,
html.futa04-information.reduce-motion.idle-urgency #smart-bloom-button,
html.futa04-information.reduce-motion.idle-urgency #smart-bloom-button .futa04-combination {
  animation:none !important;
}
@media (prefers-reduced-motion:reduce) {
  html.futa04-information.idle-urgency :is(#deck,#discard).ready .pile-card,
  html.futa04-information.idle-urgency #hand .card,
  html.futa04-information.idle-urgency #smart-bloom-button,
  html.futa04-information.idle-urgency #smart-bloom-button .futa04-combination {
    animation:none !important;
  }
}
html.futa04-information #smart-led-window.led-flash-cut { animation:smart-led-flash-cut 380ms ease-out; }
@keyframes smart-led-flash-cut { 0% { filter:brightness(1.9) contrast(1.06); } 100% { filter:none; } }
html.futa04-information #smart-led-window.led-flash-bloom { animation:smart-led-flash-bloom 320ms ease-out; }
@keyframes smart-led-flash-bloom { 0% { filter:brightness(1.5); } 100% { filter:none; } }
html.futa04-information.reduce-motion #smart-led-window:is(.led-pulse,.led-alarm,.led-flash-cut,.led-flash-bloom) { animation:none; }
@media (prefers-reduced-motion:reduce) {
  html.futa04-information #smart-led-window:is(.led-pulse,.led-alarm,.led-flash-cut,.led-flash-bloom) { animation:none; }
}
/* Opponent replay: the read-out says "not yours" by going a little quieter. A modest luminance
   drop that stays fully legible — never a blackout, never a flash, no border, no badge: the DIM
   is the whole signal. It is a STATE, not motion, so Reduce motion keeps it and adds nothing. */
html.futa04-information #smart-panel.led-theirs #smart-led { filter:brightness(.8) saturate(.9); }
html.futa04-information #smart-panel.led-theirs #smart-led-spill { opacity:calc(var(--spill-opacity,.16) * .6); }
/* Reflected light from the display, falling on the keys below. This is NOT a lamp: it is
   the display's own light bouncing off the control strip. Three physical cues only — a
   thin catch on each key's top edge, faint light in the seam between keys, and a whisper
   down the faces — decaying over roughly one key row. Screen blending is used because reflected
   light adds luminance, but the mask confines it to those rims and seams so a key's own
   mid-tone is never brightened. The blurred glyph copy (old #smart-led-spill-cells) was
   the additive face wash that made the keys look self-lit, so it is retired. */
html.futa04-information #smart-led-spill {
  --spill-opacity:.16;
  --spill-ink:rgba(255,205,135,.22);
  --spill-rim:rgba(255,215,160,.50);
  position:absolute;
  left:0; top:var(--control-size);
  width:calc(2 * var(--control-size) + 2 * var(--control-gap));
  height:calc(var(--control-gap) + var(--control-size));
  overflow:hidden; pointer-events:none; z-index:7;
  opacity:var(--spill-opacity); mix-blend-mode:screen;
  filter:saturate(.78);
  -webkit-mask-image:
    linear-gradient(180deg,#000 0,#000 var(--control-gap),rgba(0,0,0,.60) 42%,transparent 80%),
    linear-gradient(90deg,#000 0,#000 86%,transparent 100%);
  -webkit-mask-composite:source-in;
  mask-image:
    linear-gradient(180deg,#000 0,#000 var(--control-gap),rgba(0,0,0,.60) 42%,transparent 80%),
    linear-gradient(90deg,#000 0,#000 86%,transparent 100%);
  mask-composite:intersect;
  background:
    /* thin bright catch on the keys' top edge, just below the row gap */
    linear-gradient(180deg,transparent 0,transparent calc(var(--control-gap) + 1px),var(--spill-rim) calc(var(--control-gap) + 1px),var(--spill-rim) calc(var(--control-gap) + 2px),transparent calc(var(--control-gap) + 4px)),
    /* light passing through the row gap between the display and the keys */
    linear-gradient(180deg,var(--spill-ink) 0,var(--spill-ink) var(--control-gap),transparent calc(var(--control-gap) + 2px)),
    /* the deepest seams between keys keep a thread of light (one period = key pitch) */
    repeating-linear-gradient(90deg,transparent 0,transparent calc(var(--control-size) - 1px),var(--spill-ink) calc(var(--control-size) - 1px),var(--spill-ink) calc(var(--control-size) + var(--control-gap)),transparent calc(var(--control-size) + var(--control-gap))),
    /* one faint bounce below each top edge, then almost nothing on the faces */
    linear-gradient(180deg,transparent calc(var(--control-gap) + 3px),var(--spill-ink) calc(var(--control-gap) + 6px),transparent 46%);
}
html.futa04-information #smart-led-spill-cells { display:none; }
/* Mode lives on #smart-panel (spill is not a child of #smart-led). Inks are the LED family,
   softened and desaturated by the element's own saturate() filter. */
html.futa04-information #smart-panel[data-led-mode='amber'] #smart-led-spill,
html.futa04-information #smart-panel[data-led-mode='score'] #smart-led-spill,
html.futa04-information #smart-panel:not([data-led-mode]) #smart-led-spill {
  --spill-opacity:.16; --spill-ink:rgba(255,205,135,.22); --spill-rim:rgba(255,215,160,.50);
}
html.futa04-information #smart-panel[data-led-mode='ivory'] #smart-led-spill {
  --spill-opacity:.14; --spill-ink:rgba(246,236,214,.20); --spill-rim:rgba(250,243,226,.46);
}
html.futa04-information #smart-panel[data-led-mode='green'] #smart-led-spill {
  --spill-opacity:.17; --spill-ink:rgba(150,200,125,.22); --spill-rim:rgba(178,214,150,.46);
}
html.futa04-information #smart-panel[data-led-mode='red'] #smart-led-spill {
  --spill-opacity:.18; --spill-ink:rgba(214,92,72,.24); --spill-rim:rgba(232,124,104,.46);
}
html.futa04-information #smart-panel[data-led-mode='pink'] #smart-led-spill {
  --spill-opacity:.17; --spill-ink:rgba(226,158,180,.22); --spill-rim:rgba(240,186,202,.44);
}
html.futa04-information #smart-panel[data-led-mode='cyan'] #smart-led-spill {
  --spill-opacity:.16; --spill-ink:rgba(150,200,200,.22); --spill-rim:rgba(180,214,214,.44);
}
/* The reflected wash breathes with the display; it never flashes with it. */
html.futa04-information #smart-panel.led-pulse #smart-led-spill {
  animation:smart-spill-pulse 500ms ease-in-out 1;
}
html.futa04-information #smart-panel.led-alarm #smart-led-spill {
  animation:smart-spill-alarm 1200ms ease-in-out infinite;
}
@keyframes smart-spill-pulse {
  0%,100% { opacity:var(--spill-opacity,.16); }
  50% { opacity:calc(var(--spill-opacity,.16) * 1.14); }
}
@keyframes smart-spill-alarm {
  0%,100% { opacity:var(--spill-opacity,.16); }
  20% { opacity:calc(var(--spill-opacity,.16) * 1.22); }
  40% { opacity:var(--spill-opacity,.16); }
  60% { opacity:calc(var(--spill-opacity,.16) * 1.14); }
  80% { opacity:var(--spill-opacity,.16); }
}
html.futa04-information.reduce-motion #smart-panel:is(.led-pulse,.led-alarm) #smart-led-spill { animation:none; }
@media (prefers-reduced-motion:reduce) {
  html.futa04-information #smart-panel:is(.led-pulse,.led-alarm) #smart-led-spill { animation:none; }
}
/* On a wide desktop the cockpit and its piles grow as one instrument. Phone
   controls retain their exact existing footprint. */
@media (min-width:1500px) {
  html.futa04-information[data-layout='side'] .dock > #futa04-box {
    width:min(560px,100%); justify-self:end;
  }
  html.futa04-information[data-layout='side'] .dock .hand-row > #hand {
    justify-content:flex-end; --slice:54px;
  }
  html.futa04-information[data-layout='side'] #futa04-box {
    --control-size:72px; --box-tools:224px; --box-pile:88px; --box-piles:184px;
    height:160px; grid-template-rows:72px 72px;
  }
  html.futa04-information[data-layout='side'] #futa04-box .pile-card {
    --pile-h:125px; --cw:88px; --ch:125px; width:88px; height:125px;
  }
  html.futa04-information[data-layout='side'][data-step='draw'] .dock > #futa04-box {
    --box-piles:224px;
  }
}
html.futa04-information #smart-selector {
  position:absolute; right:0; top:0; z-index:10;
  display:flex; gap:var(--control-gap); width:calc(2 * var(--control-size) + var(--control-gap)); height:var(--control-size);
  overflow-x:auto; overflow-y:hidden; padding:0; box-sizing:border-box; scrollbar-width:none;
  border:0; border-radius:12px;
  background:var(--hardware-surface);
  box-shadow:0 2px 8px rgba(0,0,0,.4);
}
html.futa04-information #smart-selector::-webkit-scrollbar { display:none; }
html.futa04-information #smart-selector[hidden] { display:none; }
html.futa04-information #smart-selector button {
  display:grid; place-items:center; flex:0 0 var(--control-size); width:var(--control-size); height:var(--control-size);
  border:1px solid rgba(201,198,186,.31); border-radius:12px; padding:0;
  background:var(--hardware-surface);
  color:var(--control-ivory); touch-action:manipulation; box-shadow:var(--hardware-edge);
}
html.futa04-information #smart-selector button:first-child { background:rgba(196,150,88,.10); }
html.futa04-information #smart-selector button:is(:hover,:focus-visible) { background:rgba(196,150,88,.2); outline:1px solid var(--control-amber); }
html.futa04-information #smart-selector button svg { width:19px; height:19px; }
html.futa04-information #smart-selector .futa04-combination { display:flex; flex-wrap:nowrap; gap:1px; max-width:40px; }
html.futa04-information #smart-selector .futa04-mini-card { width:9px !important; min-width:9px !important; height:18px !important; padding:0 !important; border-radius:2px; }
html.futa04-information #smart-selector .futa04-mini-card .c-num { font-size:7px !important; }
html.futa04-information #smart-selector .futa04-mini-card .c-suit svg { width:7px !important; height:7px !important; }
html.futa04-information #smart-selector .smart-action-label { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
html.futa04-information #futa04-box > #smart-bloom {
  grid-column:2; grid-row:1 / 3; align-self:stretch; justify-self:center;
  display:grid; place-items:center; position:static; z-index:6;
  width:100%; min-width:0; height:calc(2 * var(--control-size) + var(--control-gap));
}
html.futa04-information #futa04-box > #smart-bloom[hidden] { display:none; }
html.futa04-information #smart-bloom-button {
  display:grid; place-items:center; position:relative; width:100%; min-width:44px; height:100%;
  border:0; border-radius:0; padding:4px 2px 8px;
  background:none; color:var(--control-ivory); cursor:pointer; box-shadow:none;
  touch-action:manipulation;
}
html.futa04-information #smart-bloom-button:is(:hover,:focus-visible,[aria-expanded='true']) {
  filter:brightness(1.18);
}
html.futa04-information #smart-bloom-button:focus-visible { outline:2px solid #ffe1a7; outline-offset:2px; }
html.futa04-information #smart-bloom-button:active { transform:translateY(1px) scale(.98); }
/* Quiet TE-style corner ticks + soft brightness pulse on the recipe (button stays frameless). */
html.futa04-information #smart-bloom-button::before,
html.futa04-information #smart-bloom-button::after {
  content:''; position:absolute; width:8px; height:8px; pointer-events:none;
  border-color:rgba(255,225,167,.52); border-style:solid;
  animation:futa04-bloom-corners 2.6s ease-in-out infinite;
}
html.futa04-information #smart-bloom-button::before { top:5px; left:6px; border-width:1px 0 0 1px; }
html.futa04-information #smart-bloom-button::after { right:6px; bottom:7px; border-width:0 1px 1px 0; }
/* A tiny film registration drift lives on the projected recipe alone. The control
   remains transparent; the coloured ink and card edges provide all its light. */
html.futa04-information #smart-bloom-button .futa04-combination {
  animation:futa04-recipe-projector 7.3s steps(1,end) infinite, futa04-bloom-ready 2.6s ease-in-out infinite;
  filter:drop-shadow(.25px .2px 1.2px rgba(244,227,186,.38));
}
html.futa04-information #smart-bloom-button .futa04-mini-card {
  opacity:.92; text-shadow:0 0 2px currentColor;
  box-shadow:0 0 1.5px currentColor,inset 0 0 1px currentColor;
}
@keyframes futa04-recipe-projector {
  0%,18%,20%,51%,53%,83%,85%,100% { opacity:.9; translate:0 0; }
  19%,52% { opacity:.82; translate:.28px -.2px; }
  84% { opacity:.94; translate:-.22px .16px; }
}
@keyframes futa04-bloom-ready {
  0%,100% { filter:drop-shadow(.25px .2px 1.2px rgba(244,227,186,.28)); }
  50% { filter:drop-shadow(.25px .2px 3px rgba(255,225,167,.55)); }
}
@keyframes futa04-bloom-corners {
  0%,100% { opacity:.42; }
  50% { opacity:.88; }
}
html.futa04-information:is(.futa04-move-active,.futa04-information-blocked,.reduce-motion) #smart-bloom-button::before,
html.futa04-information:is(.futa04-move-active,.futa04-information-blocked,.reduce-motion) #smart-bloom-button::after,
html.futa04-information:is(.futa04-move-active,.futa04-information-blocked,.reduce-motion) #smart-bloom-button .futa04-combination { animation:none !important; }
@media (prefers-reduced-motion:reduce) {
  html.futa04-information #smart-bloom-button::before,
  html.futa04-information #smart-bloom-button::after,
  html.futa04-information #smart-bloom-button .futa04-combination { animation:none !important; }
}
html.futa04-information #futa04-box #smart-bloom-button .futa04-combination { display:flex; flex-wrap:nowrap; justify-content:center; gap:3px; max-width:100%; }
html.futa04-information #futa04-box #smart-bloom-button .futa04-mini-card { flex:0 0 clamp(26px,2.5vw,30px); width:clamp(26px,2.5vw,30px); min-width:clamp(26px,2.5vw,30px); height:clamp(41px,3.9vw,47px); padding:1px; border-radius:3px; }
html.futa04-information #futa04-box #smart-bloom-button .futa04-combination:has(.futa04-mini-card:nth-child(5)) .futa04-mini-card { flex-basis:21px; width:21px; min-width:21px; height:35px; }
html.futa04-information #futa04-box #smart-bloom-button .futa04-combination:has(.futa04-mini-card:nth-child(6)) .futa04-mini-card { flex-basis:19px; width:19px; min-width:19px; }
html.futa04-information #futa04-box #smart-bloom-button .futa04-mini-card .c-num { font-size:13px; }
html.futa04-information #futa04-box #smart-bloom-button .futa04-mini-card .c-suit svg { width:13px; height:13px; }
html.futa04-information #smart-bloom-count { position:absolute; right:2px; top:1px; font:600 9px/1 var(--font-mono,monospace); color:var(--control-ivory); }
html.futa04-information #smart-bloom-count[hidden] { display:none; }
html.futa04-information #smart-bloom-selector {
  position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%); z-index:12;
  display:flex; gap:0; width:max-content; max-width:calc(100% - 12px);
  overflow-x:auto; overflow-y:hidden; padding:3px; box-sizing:border-box;
  border:1px solid rgba(201,198,186,.26); border-radius:9px;
  background:#171918; box-shadow:0 7px 18px rgba(0,0,0,.5);
}
html.futa04-information #smart-bloom-selector[hidden] { display:none; }
html.futa04-information #smart-bloom-selector button {
  display:flex; align-items:center; justify-content:center; flex:1 0 auto; min-width:76px; min-height:44px;
  border:0; border-radius:0; padding:3px 6px;
  background:transparent; color:var(--control-ivory); touch-action:manipulation;
}
html.futa04-information #smart-bloom-selector button:hover .futa04-combination { filter:brightness(1.2); }
html.futa04-information #smart-bloom-selector button:focus-visible { outline:1px solid var(--control-amber); outline-offset:-2px; }
html.futa04-information #futa04-box #smart-bloom-selector .futa04-combination { display:flex; flex-wrap:nowrap; gap:3px; }
html.futa04-information #futa04-box #smart-bloom-selector .futa04-mini-card { flex:0 0 20px; width:20px; min-width:20px; height:34px; padding:2px; }
html.futa04-information #futa04-box #smart-bloom-selector .futa04-mini-card .c-num { font-size:13px; }
html.futa04-information #futa04-box #smart-bloom-selector .futa04-mini-card .c-suit svg { width:13px; height:13px; }
/* The deck's back artwork and the discard face use the same card footprint.
   Stack pseudo-layers sit behind it and do not move its visual centre. */
html.futa04-information .dock #futa04-box :is(#deck,#discard) .pile-meta .pile-count { left:50%; transform:translateX(-50%); }
/* Match the illustrated card's printed corners instead of the legacy card silhouette. */
html.futa04-information.futa04-card-art-ready #hand .card:has(>.futa04-card-art) { border-radius:calc(var(--cw) * .075); }
html.futa04-information.futa04-card-art-ready #hand .card > .futa04-card-art { border-radius:inherit; }
html.futa04-information[data-step='grow'] #hand:not(.waiting) .card.playable:not(.dim) { box-shadow:0 0 0 1px rgba(119,194,115,.4),0 0 6px 1px rgba(88,171,86,.43),0 5px 12px rgba(5,16,9,.30); }
html.futa04-information[data-step='throw'] #hand:not(.waiting) .card:not(.futa04-throw-picked) { box-shadow:0 0 0 1px rgba(222,110,83,.5),0 0 7px 1px rgba(190,68,47,.53),0 5px 12px rgba(20,11,10,.34); }
html.futa04-information[data-step='throw'] #hand:not(.waiting) .card.futa04-throw-picked { box-shadow:0 0 0 1px rgba(222,110,83,.5),0 0 7px 1px rgba(190,68,47,.53) !important; }
html.futa04-information #discard .gd-halo { inset:0; border-radius:6px; }
/* Both legal draw choices catch a cool white edge light on the actual card.
   The discard's amber edge is reserved for a card that completes a combo. */
html.futa04-information[data-step='draw'] :is(#deck,#discard).ready .pile-card {
  border-radius:calc(var(--cw) * .075);
  box-shadow:0 0 0 1px rgba(239,234,220,.63),0 0 8px 1px rgba(242,237,224,.27) !important;
}
html.futa04-information[data-step='draw'] #discard.futa04-bloom-draw .pile-card { box-shadow:none !important; }
html.futa04-information[data-step='draw'] :is(#deck,#discard) .gd-fx { display:none !important; }
html.futa04-information[data-step='draw'] #discard.ready:not(.futa04-bloom-draw) .pile-top.card { border-color:var(--c-line); box-shadow:0 1px 2px rgba(0,0,0,.4); }
html.futa04-information[data-step='draw'] #discard.futa04-bloom-draw .pile-top.card {
  transform:translateY(-3px); border-color:rgba(209,172,105,.8);
  box-shadow:0 0 0 1px rgba(209,172,105,.45),0 0 7px rgba(205,162,87,.30),0 2px 4px rgba(0,0,0,.45);
  transition:transform .2s ease-out,border-color .2s ease-out,box-shadow .2s ease-out;
}
/* Legal empty sockets share one warm, recessed treatment on Forest and Volcano turns. */
html.futa04-information #board .l-over .receptive-well {
  fill:rgba(225,216,190,.045); stroke:rgba(5,6,5,.66); stroke-width:2.5;
  pointer-events:none;
}
html.futa04-information #board .l-over .receptive-well:is(.kind-strengthen,.kind-bloom) { fill:rgba(99,171,96,.11); }
html.futa04-information #board .l-over .receptive-well:is(.kind-replace,.kind-fruit) { fill:rgba(192,83,65,.11); }
html.futa04-information #board .l-over .target.kind-grow {
  fill:#ded6bd; fill-opacity:calc(.10 + var(--near,0) * .22);
  stroke:#d8c8a5; stroke-width:1.45; stroke-opacity:calc(.42 + var(--near,0) * .4);
  stroke-dasharray:none; animation:target-in .2s ease-out both;
  transition:fill-opacity .14s ease,stroke-opacity .14s ease;
}
html.futa04-information #board .l-over .target:is(.kind-strengthen,.kind-bloom,.kind-replace,.kind-fruit) {
  stroke-dasharray:none; stroke-width:1.45;
  fill-opacity:calc(.10 + var(--near,0) * .22);
  stroke-opacity:calc(.42 + var(--near,0) * .4);
  animation:target-in .2s ease-out both;
  transition:fill-opacity .14s ease,stroke-opacity .14s ease;
}
html.futa04-information #board .l-over .target:is(.kind-strengthen,.kind-bloom) { fill:#a6d49b; stroke:#a5d294; }
html.futa04-information #board .l-over .target:is(.kind-replace,.kind-fruit) { fill:#e5a18b; stroke:#db917a; }
html.futa04-information #board .l-over .target:is(.kind-strengthen,.kind-bloom,.kind-replace,.kind-fruit):hover { fill-opacity:.23; stroke-opacity:.74; }
html.futa04-information #board .l-over .will-cut,
html.futa04-information #board .l-over .blast-affected {
  fill:#db806e; fill-opacity:.12; stroke:#d99179; stroke-width:1.15; stroke-opacity:.58;
  stroke-dasharray:none; pointer-events:none;
}
html.futa04-information #board .l-over .blast-affected { fill-opacity:.18; stroke-opacity:.76; }
html.futa04-information #board .l-over .selected.blast-selected { fill:#e5a18b; fill-opacity:.25; stroke:#e5aa90; stroke-width:1.5; stroke-opacity:.88; pointer-events:none; }
html.futa04-information #board .l-over .target.kind-grow:hover {
  fill-opacity:.24; stroke-opacity:.72;
}
html.futa04-information #board .l-over .selected.receptive-active {
  fill:#e2d7ba; fill-opacity:.20; stroke:#e1d0a9; stroke-opacity:.70; stroke-width:1.35;
  pointer-events:none;
}
/* Selected and previewed tiles use the same flat hex well as a legal move. */
html.futa04-information #board .l-over :is(.selected,.ghost-tile) {
  stroke-dasharray:none; stroke-width:1.2; fill-opacity:.19; stroke-opacity:.74; pointer-events:none;
}
html.futa04-information #board .l-over :is(.selected,.ghost-tile):is(.kind-strengthen,.kind-bloom,.kind-grow) {
  fill:#a6d49b; stroke:#a5d294;
}
html.futa04-information #board .l-over :is(.selected,.ghost-tile).kind-replace {
  fill:#e5a18b; stroke:#db917a;
}
/* The hexes being painted: the same flat grid, green ink and stroke as a legal well, so the
   shape you draw reads as one family with the legal-move highlights. Each hex pops softly as
   it joins the shape (the group holds the ink and its stone, so both arrive together). */
html.futa04-information #board .l-draw .ghost-tile {
  fill:#a6d49b; fill-opacity:.19;
  stroke:#a5d294; stroke-width:1.45; stroke-opacity:.74;
  stroke-dasharray:none; animation:none;
  transition:fill-opacity .18s ease-out, stroke-opacity .18s ease-out, stroke .18s ease-out;
}
html.futa04-information #board .l-draw .ghost.cant .ghost-tile {
  fill:#e5a18b; stroke:#db917a;
}
html.futa04-information #board .l-draw .ghost.blocked:not(.cant) .ghost-tile { fill-opacity:.11; }
html.futa04-information #board .l-draw .ghost {
  transform-box:fill-box; transform-origin:center;
  animation:draw-hex-pop 260ms cubic-bezier(.2,.9,.32,1.12) both;
  will-change:transform;
}
@keyframes draw-hex-pop {
  0% { transform:scale(.58); opacity:0; }
  55% { transform:scale(1.06); opacity:1; }
  100% { transform:scale(1); opacity:1; }
}
html.futa04-information.reduce-motion #board .l-draw .ghost { animation:none; }
@media (prefers-reduced-motion:reduce) { html.futa04-information #board .l-draw .ghost { animation:none; } }
html.futa04-information #board .l-draw .ghost.cant .ghost-tile { stroke-opacity:.82; }
html.futa04-information #board .l-territory-contour .territory-contour {
  stroke-width:.82; stroke-linecap:round; stroke-linejoin:round; opacity:.75;
}
html.futa04-information #board .l-territory-contour .territory-contour.p0 { stroke:#c9e9a9; }
html.futa04-information #board .l-territory-contour .territory-contour.p1 { stroke:#e4a289; }
html.futa04-information #board .l-territory-contour .territory-contour.grow-in {
  stroke-dasharray:1; animation:draw-on calc(280ms * var(--anim,1)) ease-out both;
}
html.futa04-information.reduce-motion #board .l-territory-contour .territory-contour.grow-in { animation:none; }
@media (prefers-reduced-motion:reduce) { html.futa04-information #board .l-territory-contour .territory-contour.grow-in { animation:none; } }
@media (prefers-reduced-motion:reduce) { html.futa04-information :is(#smart-led-cells,#smart-led-spill-cells).scrolling { animation:none; } }
html.futa04-information.reduce-motion :is(#smart-led-cells,#smart-led-spill-cells).scrolling { animation:none; }
@media (prefers-reduced-motion:reduce) { html.futa04-information #board .l-over .target.kind-grow { animation:none; transition:none; } }
html.futa04-information.reduce-motion #board .l-over .target.kind-grow { animation:none; transition:none; }
`;

export function mountSmartCockpit() {
  const box = document.getElementById('futa04-box')!;
  const actions = document.getElementById('futa04-actions')!;
  const moves = document.getElementById('moves')!;
  const rail = document.getElementById('futa04-information-rail')!;
  const style = document.createElement('style');
  style.id = 'smart-cockpit-style'; style.textContent = SMART_COCKPIT_CSS; document.head.append(style);
  const panel = document.createElement('div'); panel.id = 'smart-panel'; panel.setAttribute('role','group'); panel.setAttribute('aria-label','Game controls');
  const led = document.createElement('div'); led.id = 'smart-led'; led.setAttribute('role','status'); led.setAttribute('aria-live','polite');
  const windowEl = document.createElement('div'); windowEl.id = 'smart-led-window';
  const text = document.createElement('span'); text.id = 'smart-led-text';
  const cells = document.createElement('canvas'); cells.id = 'smart-led-cells'; cells.setAttribute('aria-hidden','true');
  windowEl.append(text,cells); led.append(windowEl);
  const spill = document.createElement('div'); spill.id = 'smart-led-spill'; spill.setAttribute('aria-hidden','true');
  const spillCells = document.createElement('canvas'); spillCells.id = 'smart-led-spill-cells'; spill.append(spillCells);
  const context = document.createElement('button'); context.id = 'smart-context'; context.type = 'button'; context.setAttribute('aria-haspopup','menu'); context.setAttribute('aria-expanded','false');
  const selector = document.createElement('div'); selector.id = 'smart-selector'; selector.setAttribute('role','menu'); selector.hidden = true;
  context.setAttribute('aria-controls',selector.id);
  const bloom = document.createElement('div'); bloom.id = 'smart-bloom'; bloom.hidden = true;
  const bloomButton = document.createElement('button'); bloomButton.id = 'smart-bloom-button'; bloomButton.type = 'button';
  const bloomCount = document.createElement('span'); bloomCount.id = 'smart-bloom-count'; bloomCount.hidden = true;
  const bloomSelector = document.createElement('div'); bloomSelector.id = 'smart-bloom-selector'; bloomSelector.setAttribute('role','menu'); bloomSelector.hidden = true;
  bloomButton.setAttribute('aria-controls',bloomSelector.id);
  bloom.append(bloomButton,bloomSelector);
  panel.append(led,spill,context,actions,selector); box.append(panel,bloom);
  moves.setAttribute('aria-hidden','true');
  let current: Action[] = [];
  let signature = '';
  let lastPhase = '';
  let lastAction = '';
  let lastText = '';
  let lastMode: LedTone = 'amber';
  let lastCompact = false;
  let lastMotif: DisplayFrame['motif'];
  let lastFlash: DisplayFrame['flash'];
  let motifTimer = 0;
  let flashTimer = 0;
  let lastReduced = document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  let reel: Animation[] = [];
  const close = () => { selector.hidden = true; context.setAttribute('aria-expanded','false'); };
  const closeBloom = () => { bloomSelector.hidden = true; bloomButton.setAttribute('aria-expanded','false'); };
  let bloomSources: HTMLButtonElement[] = [];
  let bloomSignature = '';
  const syncBloom = () => {
    const byKind = new Map<string,HTMLButtonElement>();
    for (const button of moves.querySelectorAll<HTMLButtonElement>('button[data-kind]')) {
      if (!button.disabled && button.dataset.kind && !byKind.has(button.dataset.kind)) byKind.set(button.dataset.kind,button);
    }
    const highestRank = (button: HTMLButtonElement) => Math.max(0,...[...button.querySelectorAll<HTMLElement>('.futa04-mini-card .c-num')].map(node=>Number(node.textContent?.trim())||0));
    bloomSources = [...byKind.values()].sort((a,b)=>highestRank(b)-highestRank(a));
    const next = bloomSources.map(button => `${button.dataset.kind}:${button.getAttribute('aria-label')}`).join('|');
    bloom.hidden = bloomSources.length === 0;
    if (next === bloomSignature) return;
    bloomSignature = next; closeBloom();
    if (!bloomSources.length) return;
    const first = bloomSources[0]!;
    const face = first.querySelector('.futa04-combination')?.cloneNode(true);
    bloomButton.replaceChildren(...(face ? [face] : [document.createTextNode('BLOOM')]),bloomCount);
    bloomButton.setAttribute('aria-label',bloomSources.length === 1 ? first.getAttribute('aria-label') || 'Bloom' : `${bloomSources.length} Bloom combinations`);
    bloomButton.setAttribute('aria-haspopup',bloomSources.length > 1 ? 'menu' : 'false');
    bloomCount.hidden = true; // The visible control is the recipe cards alone.
    bloomSelector.replaceChildren(...bloomSources.map((button,index) => {
      const choice = document.createElement('button'); choice.type = 'button'; choice.setAttribute('role','menuitem');
      choice.setAttribute('aria-label',button.getAttribute('aria-label') || `Bloom combination ${index+1}`);
      const cards = button.querySelector('.futa04-combination')?.cloneNode(true);
      if (cards) choice.append(cards);
      choice.addEventListener('click',() => { closeBloom(); bloomSources[index]?.click(); });
      return choice;
    }));
  };
  const setText = (frame: DisplayFrame) => {
    const { text:value, mode } = frame;
    const reduceNow = () => document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const pulsing = !!frame.pulse && !frame.alarm && !reduceNow();
    const alarming = !!frame.alarm && !reduceNow();
    windowEl.classList.toggle('led-pulse', pulsing);
    windowEl.classList.toggle('led-alarm', alarming);
    // Frame + button metal edges share the LED beat and ink color.
    panel.classList.toggle('led-pulse', pulsing);
    panel.classList.toggle('led-alarm', alarming);
    panel.dataset.ledMode = mode;
    // Same flag drives LED alarm + board cue blinks (piles / hand / bloom).
    document.documentElement.classList.toggle('idle-urgency', !!frame.alarm);
    if (value === lastText && mode === lastMode && !!frame.compact === lastCompact && frame.motif === lastMotif && frame.flash === lastFlash) return;
    const previous = lastText;
    const animated = !reduceNow();
    const scoreTick = animated && mode === 'score' && lastMode === 'score' && previous.length === value.length;
    const animateReel = previous && animated && !scoreTick;
    for (const running of reel) running.cancel(); reel = [];
    window.clearInterval(motifTimer);
    windowEl.querySelector('.led-reel-old')?.remove();
    let old: HTMLCanvasElement | null = null;
    if (animateReel || scoreTick) {
      old = document.createElement('canvas'); old.className = 'led-reel-old';
      old.width = cells.width; old.height = cells.height;
      old.getContext('2d')?.drawImage(cells,0,0);
      old.style.cssText = `position:absolute;width:${cells.style.width};height:26px;left:${cells.classList.contains('scrolling') ? '0' : '50%'};top:50%;transform:translate(${cells.classList.contains('scrolling') ? '0' : '-50%'},-50%);pointer-events:none`;
      if (scoreTick) {
        const ctx = old.getContext('2d');
        const dpr = old.width / ledMessageWidth(previous);
        for (let i = 0; i < previous.length; i++) if (previous[i] === value[i])
          ctx?.clearRect(i * LED_ADVANCE * dpr,0,LED_ADVANCE * dpr,old.height);
      }
      windowEl.append(old);
    }
    lastText = value; lastMode = mode; lastCompact = !!frame.compact; lastMotif = frame.motif; lastFlash = frame.flash;
    text.textContent = value; led.title = value; led.dataset.mode = mode;
    cells.classList.remove('scrolling'); spillCells.classList.remove('scrolling');
    requestAnimationFrame(() => {
      if (value !== lastText || mode !== lastMode || !!frame.compact !== lastCompact || frame.motif !== lastMotif || frame.flash !== lastFlash) { old?.remove(); return; }
      const reduced = reduceNow();
      // A recognised caption/banner gets its short token even with motion on; other copy keeps its scroll.
      const token = ledToken(value);
      const shown = token ?? (reduced || frame.compact ? ledStaticMessage(value) : value);
      const scrolling = !frame.motif && !reduced && mode !== 'score' && ledMessageWidth(shown) > windowEl.clientWidth - 2;
      if (frame.motif) {
        const frames = ledMotifFrames(frame.motif);
        let index = 0;
        const paint = () => {
          const picture = frames[index++ % frames.length]!;
          drawLedCells(cells,picture,false,mode);
          drawLedCells(spillCells,picture,false,mode);
        };
        paint();
        motifTimer = window.setInterval(paint,88);
      } else {
        drawLedCells(cells,shown,scrolling,mode);
        drawLedCells(spillCells,shown,scrolling,mode);
      }
      window.clearTimeout(flashTimer);
      windowEl.classList.remove('led-flash-cut','led-flash-bloom');
      if (frame.flash && !reduced) {
        void windowEl.offsetWidth; // restart the one-shot accent
        windowEl.classList.add(frame.flash === 'bloom' ? 'led-flash-bloom' : 'led-flash-cut');
        // Match CSS: bloom 320ms, cut 380ms.
        const flashMs = frame.flash === 'bloom' ? 320 : 380;
        flashTimer = window.setTimeout(() => windowEl.classList.remove('led-flash-cut','led-flash-bloom'), flashMs);
      }
      if (scrolling) {
        const travel = ledMarqueeTravel(shown);
        for (const target of [cells,spillCells]) {
          target.style.setProperty('--led-travel',`${travel}px`);
          target.style.setProperty('--led-duration',`${Math.max(3.2,travel/42).toFixed(1)}s`);
          target.classList.add('scrolling');
        }
      }
      if (old && old.isConnected) {
        if (scoreTick) {
          const tick = old.animate([{translate:'0 0',opacity:1},{translate:'0 2px',opacity:0}],{duration:180,easing:'ease-out'});
          reel = [tick]; tick.onfinish = () => old?.remove();
        } else {
          const duration = 190;
          const ease = 'cubic-bezier(.2,.7,.2,1)';
          const outgoing = old.animate([{translate:'0 0',opacity:1},{translate:'0 26px',opacity:0}],{duration,easing:ease});
          const incoming = cells.animate([{translate:'0 -26px',opacity:0},{translate:'0 0',opacity:1}],{duration,easing:ease});
          reel = [outgoing,incoming]; outgoing.onfinish = () => old?.remove();
        }
      }
    });
  };
  // Hold times follow Speed (--anim); skip/0 floors inside DisplayMachine.
  const machine = new DisplayMachine(setText, () => {
    const raw = Number.parseFloat(document.documentElement.style.getPropertyValue('--anim'));
    return Number.isFinite(raw) ? raw : 1;
  });
  const phaseMessage = () => {
    const root = document.documentElement;
    if (root.dataset.step === 'opp') return 'WAIT';
    if (root.dataset.step === 'draw') return 'DRAW!';
    if (root.dataset.step === 'throw') return 'THROW!';
    if (root.dataset.futa04Bloom === 'true') return 'BLOOM!';
    if (root.dataset.step === 'grow') {
      // After the one Grow, Bloom is optional — make Skip feel like an invitation.
      if (root.dataset.futa04Grew === 'true' && root.dataset.futa04BloomReady === 'true') return 'SKIP?';
      return 'GROW!';
    }
    return 'FUTASAKU';
  };
  machine.reset(phaseMessage());
  const refreshMessage = () => machine.phase(phaseMessage());
  const flash = (value: string, ms = 1900) => machine.event({message:value.toUpperCase(),priority:30,duration:ms});
  const collect = (): Action[] => {
    const buttons = [...moves.querySelectorAll<HTMLButtonElement>('button')];
    const items = buttons.filter(button => !button.disabled && !button.matches('[data-kind],.bloom-toggle'));
    if (document.getElementById('tool-skip')?.hidden === false) {
      const skip = document.getElementById('tool-skip') as HTMLButtonElement;
      items.push(skip);
    }
    const camera = document.querySelector<HTMLButtonElement>('.cam-whole');
    if (camera && !camera.hidden) items.push(camera);
    if (document.getElementById('confirm')?.hidden === false) {
      items.push(document.getElementById('confirm-play') as HTMLButtonElement,document.getElementById('confirm-cancel') as HTMLButtonElement);
    }
    return items.filter(button => !button.closest('[hidden]') || button.closest('.bloom-options'))
      .map((button,index) => {
        const kind = button.matches('.cam-whole') ? button.textContent?.trim() === 'Back to play' ? 'back' : 'whole'
          : button.id === 'tool-skip' ? 'skip' : button.id === 'confirm-play' ? 'confirm' : button.id === 'confirm-cancel' ? 'cancel' : actionKind(button);
        const label = button.getAttribute('aria-label') || button.title || button.textContent?.trim() || kind;
        const key = `${kind}:${button.dataset.kind ?? ''}:${label}`;
        return { key,label,icon:kind,priority:(button.id === 'tool-skip' ? -2 : priority[kind] ?? 9)+index/100,source:button };
      }).sort((a,b)=>a.priority-b.priority);
  };
  const renderSelector = () => {
    selector.replaceChildren(...current.map(item => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role','menuitem');
      b.dataset.action = item.key; b.setAttribute('aria-label',item.label); b.title = item.label;
      const combination = item.icon === 'bloom' ? item.source.querySelector('.futa04-combination') : null;
      if (combination) b.append(combination.cloneNode(true)); else b.innerHTML = svg(item.icon);
      const label = document.createElement('span'); label.className = 'smart-action-label'; label.textContent = item.label; b.append(label);
      b.addEventListener('click', () => { close(); current.find(a=>a.key===item.key)?.source.click(); });
      return b;
    }));
  };
  context.addEventListener('click', () => {
    if (current.length === 1) { current[0]!.source.click(); return; }
    if (current.length < 2) return;
    const opening = selector.hidden;
    if (opening) { selector.hidden = false; context.setAttribute('aria-expanded','true'); selector.querySelector<HTMLButtonElement>('button')?.focus(); }
    else close();
  });
  const activateBloom = (source: HTMLButtonElement | undefined, cardId?: number) => {
    if (!source) return;
    if (cardId != null && Number.isFinite(cardId)) source.dataset.bloomCard = String(cardId);
    else delete source.dataset.bloomCard;
    source.click();
  };
  bloomButton.addEventListener('click', (event) => {
    const mini = (event.target as Element | null)?.closest?.('.futa04-mini-card') as HTMLElement | null;
    const cardId = mini ? Number(mini.dataset.card) : NaN;
    const picked = Number.isFinite(cardId) ? cardId : undefined;
    // One recipe: tap the face (or a mini-card) to start; mini-card sets tile one.
    if (bloomSources.length === 1) { activateBloom(bloomSources[0], picked); return; }
    if (bloomSources.length < 2) return;
    // Several recipes: any face tap opens the drawer. Mini-card → tile-one lives on the menu items.
    const opening = bloomSelector.hidden;
    if (opening) { bloomSelector.hidden = false; bloomButton.setAttribute('aria-expanded','true'); bloomSelector.querySelector<HTMLButtonElement>('button')?.focus(); }
    else closeBloom();
  });
  bloomSelector.addEventListener('click', (event) => {
    const mini = (event.target as Element | null)?.closest?.('.futa04-mini-card') as HTMLElement | null;
    if (!mini) return;
    const choice = mini.closest('button');
    if (!choice || !bloomSelector.contains(choice)) return;
    const index = [...bloomSelector.querySelectorAll(':scope > button')].indexOf(choice);
    const cardId = Number(mini.dataset.card);
    event.preventDefault();
    event.stopPropagation();
    closeBloom();
    activateBloom(bloomSources[index], Number.isFinite(cardId) ? cardId : undefined);
  }, true);
  document.addEventListener('pointerdown', event => {
    machine.interact();
    if (!panel.contains(event.target as Node)) close();
    if (!bloom.contains(event.target as Node)) closeBloom();
  }, { capture:true });
  document.addEventListener('keydown', event => {
    machine.interact();
    if (event.key !== 'Escape') return;
    if (!bloomSelector.hidden) { event.preventDefault(); closeBloom(); bloomButton.focus(); }
    else if (!selector.hidden) { event.preventDefault(); close(); context.focus(); }
  });
  rail.addEventListener('futa04-noticechange', () => {
    const shown = rail.querySelector<HTMLElement>('[data-information-active="true"]');
    if (shown && rail.dataset.noticePriority === 'major') flash(shown.textContent?.trim() || 'ACTION',2200);
    else refreshMessage();
  });
  window.addEventListener('resize', () => { lastText = ''; machine.repaint(); });
  return { score: (you:number,opp:number) => machine.score(you,opp), sync() {
    const reduced = document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    if (reduced !== lastReduced) { lastReduced = reduced; lastText = ''; machine.repaint(); }
    syncBloom();
    const next = collect();
    const phase = document.documentElement.dataset.step ?? '';
    const key = `${phase}:${next.map(a=>a.key).join('|')}`;
    current = next;
    if (key !== signature) { close(); signature = key; renderSelector(); }
    const first = current[0];
    // Never hint SKIP — phaseMessage already owns SKIP?/THROW!/GROW!, and a SKIP hint
    // was lingering into the throw step after EndAct.
    if (lastPhase === phase && lastAction && first?.key !== lastAction) {
      const hint = first?.icon === 'clear' ? 'CLEAR' : first?.icon === 'reverse' ? 'FLIP'
        : first?.icon === 'cancel' ? 'CANCEL' : first?.icon === 'bloom' ? 'BLOOM' : '';
      if (hint) machine.hint(hint);
    }
    if (lastPhase !== phase && phase === 'opp') machine.event({message:'WAIT',priority:20,duration:1050,mode:'red',pulse:true});
    lastPhase = phase; lastAction = first?.key ?? '';
    context.innerHTML = svg(first?.icon ?? 'neutral'); context.disabled = !first;
    // The slot's current action, so CSS can light a key that is the move (e.g. Skip).
    context.dataset.action = first?.icon ?? '';
    context.setAttribute('aria-haspopup',current.length > 1 ? 'menu' : 'false');
    context.setAttribute('aria-label',first ? current.length > 1 ? `${first.label}. ${current.length} actions available` : first.label : 'No action available');
    context.title = context.getAttribute('aria-label') ?? '';
    for (const b of moves.querySelectorAll<HTMLButtonElement>('button')) b.tabIndex = -1;
    refreshMessage();
  }, flash, hint: (value:string) => machine.hint(value), event: (event:DisplayEvent) => machine.event(event),
    /**
     * The display is showing the OPPONENT's replayed turn: dim the glass so it reads as not
     * yours. A state, toggled by its owner (main's `theirsDim`); one small class, no inline
     * style, so nothing here can leak a stuck dim past the drain that clears it.
     */
    dim: (on: boolean) => { panel.classList.toggle('led-theirs', on); },
    /** Hold a drag word (DRAW/PLACE/THROW/BLOOM/MEGA) on the sign; null clears it. Never FAST. */
    led: (word:string|null) => {
      if (word) machine.hold(word, word === 'THROW' ? 'red' : word === 'BLOOM' || word === 'MEGA' ? 'green' : 'amber');
      else machine.release();
    },
    reset: (you=0,opp=0) => machine.reset(phaseMessage(),you,opp) };
}
