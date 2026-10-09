/** Futasaku 0.3 cockpit presentation. Game-owned buttons remain the action source. */
import { LED_ADVANCE, drawLedCells, ledMarqueeTravel, ledMessageWidth, ledMotifFrames, ledStaticMessage } from './led-cells.js';
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
  : button.matches('.cancel') ? 'cancel' : button.matches('.test2-skip,.end') ? 'skip'
  : button.matches('.empty-continue') ? 'continue' : button.matches('.primary') ? 'confirm' : 'continue';
const priority: Record<string, number> = { back: -1, clear: 0, confirm: 1, cancel: 2, bloom: 3, reverse: 4, next: 5, previous: 6, continue: 7, skip: 8, whole: 9 };

export const SMART_COCKPIT_CSS = `
html.test2-information #step-cue { display:none !important; }
/* The match computer owns instructions; leave the entire board unobstructed. */
html.test2-information #board-wrap :is(#draw-info,#captions,#banner,#root-warn,#turn-pill) { display:none !important; }
html.test2-information #tool-skip { display:none !important; }
html.test2-information .cam-whole { display:none !important; }
html.test2-information #test2-box {
  --hardware-edge:inset 0 1px rgba(226,218,191,.10),inset 1px 0 rgba(225,212,180,.035),inset -1px 0 rgba(225,212,180,.03),inset 0 -2px rgba(0,0,0,.48);
  --box-tools:calc(3 * var(--control-size) + 2 * var(--control-gap));
}
html.test2-information #test2-box #moves { position:absolute !important; width:0 !important; height:0 !important; min-height:0 !important; overflow:hidden !important; visibility:hidden !important; pointer-events:none !important; }
html.test2-information #test2-box > #smart-panel {
  grid-column:3; grid-row:1 / 3; align-self:end; justify-self:end;
  display:grid; grid-template-columns:repeat(3,var(--control-size)); grid-template-rows:repeat(2,var(--control-size));
  gap:var(--control-gap); width:var(--box-tools); height:calc(2 * var(--control-size) + var(--control-gap));
  position:relative; z-index:5; box-sizing:border-box;
}
html.test2-information[data-thumb='left'] #test2-box > #smart-panel { grid-column:1; justify-self:start; }
body.paused #smart-panel { visibility:hidden; }
body.paused #smart-bloom { visibility:hidden; }
html.test2-information #test2-box #test2-actions { display:contents !important; position:static !important; width:auto !important; height:auto !important; }
html.test2-information #test2-box #test2-actions > :nth-child(1) { grid-column:1; grid-row:2; }
html.test2-information #test2-box #test2-actions > :nth-child(2) { grid-column:2; grid-row:2; }
html.test2-information #test2-box #test2-actions > :nth-child(3) { grid-column:3; grid-row:2; }
html.test2-information #test2-box #test2-actions > .hand-slot[hidden] { display:grid !important; visibility:visible !important; }
html.test2-information .dock #test2-box :is(#smart-context,#test2-actions > .hand-slot) {
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
html.test2-information .dock #test2-box :is(#smart-context,#test2-actions > .hand-slot)::before {
  content:''; position:absolute; inset:0; border-radius:0; pointer-events:none;
  background:url('./hardware/button-frame-supplied.webp') center / contain no-repeat; z-index:0;
}
/* Major board events briefly catch the existing metal edges. Only the shell
   images brighten; LED cells, icons, and the panel geometry stay untouched. */
html.test2-information #smart-panel.hardware-reflect :is(#smart-led,#smart-context,#test2-actions > .hand-slot)::before {
  animation:test2-hardware-reflect 640ms ease-out;
}
@keyframes test2-hardware-reflect {
  0%,100% { filter:none; }
  27% { filter:brightness(1.14) drop-shadow(0 0 2px rgba(246,207,137,.24)); }
  55% { filter:brightness(1.06) drop-shadow(0 0 1px rgba(246,207,137,.10)); }
}
html.test2-information.reduce-motion #smart-panel.hardware-reflect :is(#smart-led,#smart-context,#test2-actions > .hand-slot)::before { animation:none; }
@media (prefers-reduced-motion:reduce) {
  html.test2-information #smart-panel.hardware-reflect :is(#smart-led,#smart-context,#test2-actions > .hand-slot)::before { animation:none; }
}
html.test2-information .dock #test2-box :is(#smart-context,#test2-actions > .hand-slot) :is(svg,.i) { position:relative; z-index:1; }
html.test2-information #test2-box #smart-context { grid-column:3; grid-row:1; cursor:pointer; }
html.test2-information #test2-box #smart-context svg { width:21px; height:21px; }
html.test2-information .dock #test2-box :is(#smart-context,#test2-actions > .hand-slot) :is(svg,.i) { opacity:.94; }
html.test2-information #test2-box #smart-context:is(:hover,:focus-visible,[aria-expanded='true']) {
  color:#fff1cf; box-shadow:0 0 9px rgba(196,150,88,.22);
}
html.test2-information #test2-box #smart-context:active:not(:disabled) { transform:translateY(1px) scale(.98); }
html.test2-information #test2-box #smart-context:disabled { opacity:.68; cursor:default; }
html.test2-information #test2-box #smart-context:disabled svg { opacity:.45; }
html.test2-information #test2-box #test2-actions > .hand-slot:disabled { opacity:.72; }
html.test2-information #test2-box #test2-actions > .hand-slot:disabled :is(svg,.i) { opacity:.48; }
html.test2-information #test2-box #smart-context:focus-visible { outline:2px solid #ffe1a7; outline-offset:2px; }
html.test2-information #test2-box #smart-led {
  grid-column:1 / 3; grid-row:1; width:calc(2 * var(--control-size) + var(--control-gap)); height:var(--control-size);
  padding:8px 6px; box-sizing:border-box; border:0; border-radius:12px;
  background:#111312; box-shadow:none; position:relative;
}
html.test2-information #test2-box #smart-led::before {
  content:''; position:absolute; inset:0; border-radius:0; pointer-events:none;
  background:url('./hardware/display-frame-supplied.webp') center / contain no-repeat; z-index:0;
}
html.test2-information #test2-box #smart-led-window {
  display:flex; align-items:center; justify-content:center; overflow:hidden; width:100%; height:100%; padding:0; box-sizing:border-box; position:relative;
  border-radius:6px; background:#090c0b; box-shadow:none; z-index:1;
}
html.test2-information #test2-box #smart-led-window::before {
  content:''; position:absolute; inset:0; pointer-events:none;
  background-image:radial-gradient(circle,rgba(166,128,78,.20) .65px,transparent .8px);
  background-size:2.3px 3.1px; background-position:0 2.6px;
}
html.test2-information #test2-box #smart-led-text {
  position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap;
}
html.test2-information #test2-box #smart-led-cells {
  display:block; flex:none; width:auto; height:26px; position:relative;
}
@media (min-width:1500px) {
  html.test2-information #smart-led[data-mode='score'] #smart-led-cells { scale:1.32; }
}
html.test2-information #smart-led-cells.scrolling { position:absolute; left:0; }
@keyframes smart-led-scroll { from { transform:translateX(0); } to { transform:translateX(calc(-1 * var(--led-travel,0px))); } }
html.test2-information #smart-led-cells.scrolling { animation:smart-led-scroll var(--led-duration,8s) linear infinite; }
html.test2-information #smart-led-window.led-pulse #smart-led-cells { filter:brightness(1.22); }
/* A faint optical spill from the actual LED pixels reaches the two keys below it. */
html.test2-information #smart-led-spill {
  position:absolute; left:-38px; top:calc(var(--control-size) - 17px);
  width:calc(2 * var(--control-size) + var(--control-gap) + 76px);
  height:calc(var(--control-size) + var(--control-gap) + 42px);
  overflow:visible; pointer-events:none; z-index:7;
  opacity:.31; mix-blend-mode:screen;
  -webkit-mask-image:radial-gradient(ellipse 69% 66% at 50% 19%,#000 8%,rgba(0,0,0,.55) 57%,transparent 100%);
  mask-image:radial-gradient(ellipse 69% 66% at 50% 19%,#000 8%,rgba(0,0,0,.55) 57%,transparent 100%);
}
html.test2-information #smart-led-spill-cells {
  display:block; position:absolute; left:46px; top:18px; height:26px;
  filter:blur(13px) brightness(1.4); scale:1.2 2.1; transform-origin:top;
}
html.test2-information #smart-led-spill-cells.scrolling { animation:smart-led-scroll var(--led-duration,8s) linear infinite; }
html.test2-information #smart-led[data-mode='red'] #smart-led-spill { opacity:.42; }
/* On a wide desktop the cockpit and its piles grow as one instrument. Phone
   controls retain their exact existing footprint. */
@media (min-width:1500px) {
  html.test2-information[data-layout='side'] .dock > #test2-box {
    width:min(560px,100%); justify-self:end;
  }
  html.test2-information[data-layout='side'] .dock .hand-row > #hand {
    justify-content:flex-end; --slice:54px;
  }
  html.test2-information[data-layout='side'] #test2-box {
    --control-size:72px; --box-tools:224px; --box-pile:88px; --box-piles:184px;
    height:160px; grid-template-rows:72px 72px;
  }
  html.test2-information[data-layout='side'] #test2-box .pile-card {
    --pile-h:125px; --cw:88px; --ch:125px; width:88px; height:125px;
  }
  html.test2-information[data-layout='side'][data-step='draw'] .dock > #test2-box {
    --box-piles:224px;
  }
}
html.test2-information #smart-selector {
  position:absolute; right:0; top:0; z-index:10;
  display:flex; gap:var(--control-gap); width:calc(2 * var(--control-size) + var(--control-gap)); height:var(--control-size);
  overflow-x:auto; overflow-y:hidden; padding:0; box-sizing:border-box; scrollbar-width:none;
  border:0; border-radius:12px;
  background:var(--hardware-surface);
  box-shadow:0 2px 8px rgba(0,0,0,.4);
}
html.test2-information #smart-selector::-webkit-scrollbar { display:none; }
html.test2-information #smart-selector[hidden] { display:none; }
html.test2-information #smart-selector button {
  display:grid; place-items:center; flex:0 0 var(--control-size); width:var(--control-size); height:var(--control-size);
  border:1px solid rgba(201,198,186,.31); border-radius:12px; padding:0;
  background:var(--hardware-surface);
  color:var(--control-ivory); touch-action:manipulation; box-shadow:var(--hardware-edge);
}
html.test2-information #smart-selector button:first-child { background:rgba(196,150,88,.10); }
html.test2-information #smart-selector button:is(:hover,:focus-visible) { background:rgba(196,150,88,.2); outline:1px solid var(--control-amber); }
html.test2-information #smart-selector button svg { width:19px; height:19px; }
html.test2-information #smart-selector .test2-combination { display:flex; flex-wrap:nowrap; gap:1px; max-width:40px; }
html.test2-information #smart-selector .test2-mini-card { width:9px !important; min-width:9px !important; height:18px !important; padding:0 !important; border-radius:2px; }
html.test2-information #smart-selector .test2-mini-card .c-num { font-size:7px !important; }
html.test2-information #smart-selector .test2-mini-card .c-suit svg { width:7px !important; height:7px !important; }
html.test2-information #smart-selector .smart-action-label { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
html.test2-information #test2-box > #smart-bloom {
  grid-column:2; grid-row:1 / 3; align-self:end; justify-self:center;
  display:grid; place-items:center; position:static; z-index:6;
  width:100%; min-width:0; height:calc(2 * var(--control-size) + var(--control-gap));
}
html.test2-information #test2-box > #smart-bloom[hidden] { display:none; }
html.test2-information #smart-bloom-button {
  display:grid; place-items:center; position:relative; width:100%; min-width:44px; height:var(--control-size);
  border:0; border-radius:0; padding:3px;
  background:none; color:var(--control-ivory); cursor:pointer; box-shadow:none;
  touch-action:manipulation;
}
html.test2-information #smart-bloom-button:is(:hover,:focus-visible,[aria-expanded='true']) {
  filter:brightness(1.16);
}
html.test2-information #smart-bloom-button:focus-visible { outline:2px solid #ffe1a7; outline-offset:2px; }
html.test2-information #smart-bloom-button:active { transform:translateY(1px) scale(.98); }
/* A tiny film registration drift lives on the projected recipe alone. The control
   remains transparent; the coloured ink and card edges provide all its light. */
html.test2-information #smart-bloom-button .test2-combination {
  animation:test2-recipe-projector 7.3s steps(1,end) infinite;
  filter:drop-shadow(.25px .2px 1.2px rgba(244,227,186,.32));
}
html.test2-information #smart-bloom-button .test2-mini-card {
  opacity:.88; text-shadow:0 0 2px currentColor;
  box-shadow:0 0 1.5px currentColor,inset 0 0 1px currentColor;
}
@keyframes test2-recipe-projector {
  0%,18%,20%,51%,53%,83%,85%,100% { opacity:.9; translate:0 0; }
  19%,52% { opacity:.82; translate:.28px -.2px; }
  84% { opacity:.94; translate:-.22px .16px; }
}
html.test2-information[data-step='grow'][data-test2-waiting='true'] #smart-bloom-button:not([aria-expanded='true']) .test2-combination {
  animation:test2-card-breathe 1.35s ease-in-out infinite,test2-recipe-projector 7.3s steps(1,end) infinite;
}
html.test2-information:is(.test2-move-active,.test2-information-blocked,.reduce-motion) #smart-bloom-button .test2-combination { animation:none !important; }
@media (prefers-reduced-motion:reduce) { html.test2-information #smart-bloom-button .test2-combination { animation:none !important; } }
html.test2-information #test2-box #smart-bloom-button .test2-combination { display:flex; flex-wrap:nowrap; justify-content:center; gap:2px; max-width:100%; }
html.test2-information #test2-box #smart-bloom-button .test2-mini-card { flex:0 0 17px; width:17px; min-width:17px; height:28px; padding:1px; border-radius:3px; }
html.test2-information #test2-box #smart-bloom-button .test2-mini-card .c-num { font-size:11px; }
html.test2-information #test2-box #smart-bloom-button .test2-mini-card .c-suit svg { width:11px; height:11px; }
html.test2-information #smart-bloom-count { position:absolute; right:2px; top:1px; font:600 9px/1 var(--font-mono,monospace); color:var(--control-ivory); }
html.test2-information #smart-bloom-count[hidden] { display:none; }
html.test2-information #smart-bloom-selector {
  position:absolute; bottom:calc(100% + 14px); left:50%; transform:translateX(-50%); z-index:12;
  display:flex; gap:4px; width:max-content; max-width:100%;
  overflow-x:auto; overflow-y:hidden; padding:6px; box-sizing:border-box;
  border:1px solid rgba(201,198,186,.32); border-radius:13px;
  background:var(--hardware-surface); box-shadow:var(--hardware-edge),0 7px 18px rgba(0,0,0,.55);
}
html.test2-information #smart-bloom-selector[hidden] { display:none; }
html.test2-information #smart-bloom-selector button {
  display:flex; align-items:center; justify-content:center; flex:0 0 auto; min-width:96px; min-height:44px;
  border:0; border-radius:0; padding:4px 9px;
  background:transparent; color:var(--control-ivory); touch-action:manipulation;
}
html.test2-information #smart-bloom-selector button:hover .test2-combination { filter:brightness(1.2); }
html.test2-information #smart-bloom-selector button:focus-visible { outline:1px solid var(--control-amber); outline-offset:-2px; }
html.test2-information #test2-box #smart-bloom-selector .test2-combination { display:flex; flex-wrap:nowrap; gap:3px; }
html.test2-information #test2-box #smart-bloom-selector .test2-mini-card { flex:0 0 20px; width:20px; min-width:20px; height:34px; padding:2px; }
html.test2-information #test2-box #smart-bloom-selector .test2-mini-card .c-num { font-size:13px; }
html.test2-information #test2-box #smart-bloom-selector .test2-mini-card .c-suit svg { width:13px; height:13px; }
/* The deck's back artwork and the discard face use the same card footprint.
   Stack pseudo-layers sit behind it and do not move its visual centre. */
html.test2-information .dock #test2-box :is(#deck,#discard) .pile-meta .pile-count { left:50%; transform:translateX(-50%); }
/* Match the illustrated card's printed corners instead of the legacy card silhouette. */
html.test2-information.test2-card-art-ready #hand .card:has(>.test2-card-art) { border-radius:calc(var(--cw) * .075); }
html.test2-information.test2-card-art-ready #hand .card > .test2-card-art { border-radius:inherit; }
html.test2-information[data-step='grow'] #hand:not(.waiting) .card.playable:not(.dim) { box-shadow:0 0 0 1px rgba(119,194,115,.4),0 0 6px 1px rgba(88,171,86,.43),0 5px 12px rgba(5,16,9,.30); }
html.test2-information[data-step='throw'] #hand:not(.waiting) .card:not(.test2-throw-picked) { box-shadow:0 0 0 1px rgba(222,110,83,.5),0 0 7px 1px rgba(190,68,47,.53),0 5px 12px rgba(20,11,10,.34); }
html.test2-information[data-step='throw'] #hand:not(.waiting) .card.test2-throw-picked { box-shadow:0 0 0 1px rgba(222,110,83,.5),0 0 7px 1px rgba(190,68,47,.53) !important; }
html.test2-information #discard .gd-halo { inset:0; border-radius:6px; }
/* Both legal draw choices catch a cool white edge light on the actual card.
   The discard's amber edge is reserved for a card that completes a combo. */
html.test2-information[data-step='draw'] :is(#deck,#discard).ready .pile-card {
  border-radius:calc(var(--cw) * .075);
  box-shadow:0 0 0 1px rgba(239,234,220,.63),0 0 8px 1px rgba(242,237,224,.27) !important;
}
html.test2-information[data-step='draw'] #discard.test2-bloom-draw .pile-card { box-shadow:none !important; }
html.test2-information[data-step='draw'] :is(#deck,#discard) .gd-fx { display:none !important; }
html.test2-information[data-step='draw'] #discard.ready:not(.test2-bloom-draw) .pile-top.card { border-color:var(--c-line); box-shadow:0 1px 2px rgba(0,0,0,.4); }
html.test2-information[data-step='draw'] #discard.test2-bloom-draw .pile-top.card {
  transform:translateY(-3px); border-color:rgba(209,172,105,.8);
  box-shadow:0 0 0 1px rgba(209,172,105,.45),0 0 7px rgba(205,162,87,.30),0 2px 4px rgba(0,0,0,.45);
  transition:transform .2s ease-out,border-color .2s ease-out,box-shadow .2s ease-out;
}
/* Legal empty sockets share one warm, recessed treatment on Forest and Volcano turns. */
html.test2-information #board .l-over .receptive-well {
  fill:rgba(225,216,190,.045); stroke:rgba(5,6,5,.66); stroke-width:2.5;
  pointer-events:none;
}
html.test2-information #board .l-over .receptive-well:is(.kind-strengthen,.kind-bloom) { fill:rgba(99,171,96,.055); }
html.test2-information #board .l-over .receptive-well:is(.kind-replace,.kind-fruit) { fill:rgba(192,83,65,.055); }
html.test2-information #board .l-over .target.kind-grow {
  fill:#ded6bd; fill-opacity:calc(.055 + var(--near,0) * .16);
  stroke:#d8c8a5; stroke-width:1.15; stroke-opacity:calc(.30 + var(--near,0) * .35);
  stroke-dasharray:none; animation:target-in .2s ease-out both;
  transition:fill-opacity .14s ease,stroke-opacity .14s ease;
}
html.test2-information #board .l-over .target:is(.kind-strengthen,.kind-bloom,.kind-replace,.kind-fruit) {
  stroke-dasharray:none; stroke-width:1.15;
  fill-opacity:calc(.055 + var(--near,0) * .16);
  stroke-opacity:calc(.31 + var(--near,0) * .35);
  animation:target-in .2s ease-out both;
  transition:fill-opacity .14s ease,stroke-opacity .14s ease;
}
html.test2-information #board .l-over .target:is(.kind-strengthen,.kind-bloom) { fill:#a6d49b; stroke:#a5d294; }
html.test2-information #board .l-over .target:is(.kind-replace,.kind-fruit) { fill:#e5a18b; stroke:#db917a; }
html.test2-information #board .l-over .target:is(.kind-strengthen,.kind-bloom,.kind-replace,.kind-fruit):hover { fill-opacity:.23; stroke-opacity:.74; }
html.test2-information #board .l-over .will-cut,
html.test2-information #board .l-over .blast-affected {
  fill:#db806e; fill-opacity:.12; stroke:#d99179; stroke-width:1.15; stroke-opacity:.58;
  stroke-dasharray:none; pointer-events:none;
}
html.test2-information #board .l-over .blast-affected { fill-opacity:.18; stroke-opacity:.76; }
html.test2-information #board .l-over .selected.blast-selected { fill:#e5a18b; fill-opacity:.25; stroke:#e5aa90; stroke-width:1.5; stroke-opacity:.88; pointer-events:none; }
html.test2-information #board .l-over .target.kind-grow:hover {
  fill-opacity:.24; stroke-opacity:.72;
}
html.test2-information #board .l-over .selected.receptive-active {
  fill:#e2d7ba; fill-opacity:.20; stroke:#e1d0a9; stroke-opacity:.70; stroke-width:1.35;
  pointer-events:none;
}
/* Selected and previewed tiles use the same flat hex well as a legal move. */
html.test2-information #board .l-over :is(.selected,.ghost-tile) {
  stroke-dasharray:none; stroke-width:1.2; fill-opacity:.19; stroke-opacity:.74; pointer-events:none;
}
html.test2-information #board .l-over :is(.selected,.ghost-tile):is(.kind-strengthen,.kind-bloom,.kind-grow) {
  fill:#a6d49b; stroke:#a5d294;
}
html.test2-information #board .l-over :is(.selected,.ghost-tile).kind-replace {
  fill:#e5a18b; stroke:#db917a;
}
html.test2-information #board .l-territory-contour .territory-contour {
  stroke-width:.82; stroke-linecap:round; stroke-linejoin:round; opacity:.75;
}
html.test2-information #board .l-territory-contour .territory-contour.p0 { stroke:#c9e9a9; }
html.test2-information #board .l-territory-contour .territory-contour.p1 { stroke:#e4a289; }
@media (prefers-reduced-motion:reduce) { html.test2-information :is(#smart-led-cells,#smart-led-spill-cells).scrolling { animation:none; } }
html.test2-information.reduce-motion :is(#smart-led-cells,#smart-led-spill-cells).scrolling { animation:none; }
@media (prefers-reduced-motion:reduce) { html.test2-information #board .l-over .target.kind-grow { animation:none; transition:none; } }
html.test2-information.reduce-motion #board .l-over .target.kind-grow { animation:none; transition:none; }
`;

export function mountSmartCockpit() {
  const box = document.getElementById('test2-box')!;
  const actions = document.getElementById('test2-actions')!;
  const moves = document.getElementById('moves')!;
  const rail = document.getElementById('test2-information-rail')!;
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
  let motifTimer = 0;
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
    const highestRank = (button: HTMLButtonElement) => Math.max(0,...[...button.querySelectorAll<HTMLElement>('.test2-mini-card .c-num')].map(node=>Number(node.textContent?.trim())||0));
    bloomSources = [...byKind.values()].sort((a,b)=>highestRank(b)-highestRank(a));
    const next = bloomSources.map(button => `${button.dataset.kind}:${button.getAttribute('aria-label')}`).join('|');
    bloom.hidden = bloomSources.length === 0;
    if (next === bloomSignature) return;
    bloomSignature = next; closeBloom();
    if (!bloomSources.length) return;
    const first = bloomSources[0]!;
    const face = first.querySelector('.test2-combination')?.cloneNode(true);
    bloomButton.replaceChildren(...(face ? [face] : [document.createTextNode('BLOOM')]),bloomCount);
    bloomButton.setAttribute('aria-label',bloomSources.length === 1 ? first.getAttribute('aria-label') || 'Bloom' : `${bloomSources.length} Bloom combinations`);
    bloomButton.setAttribute('aria-haspopup',bloomSources.length > 1 ? 'menu' : 'false');
    bloomCount.hidden = true; // The visible control is the recipe cards alone.
    bloomSelector.replaceChildren(...bloomSources.map((button,index) => {
      const choice = document.createElement('button'); choice.type = 'button'; choice.setAttribute('role','menuitem');
      choice.setAttribute('aria-label',button.getAttribute('aria-label') || `Bloom combination ${index+1}`);
      const cards = button.querySelector('.test2-combination')?.cloneNode(true);
      if (cards) choice.append(cards);
      choice.addEventListener('click',() => { closeBloom(); bloomSources[index]?.click(); });
      return choice;
    }));
  };
  const setText = (frame: DisplayFrame) => {
    const { text:value, mode } = frame;
    windowEl.classList.toggle('led-pulse',!!frame.pulse && !document.documentElement.classList.contains('reduce-motion') && !window.matchMedia('(prefers-reduced-motion:reduce)').matches);
    if (value === lastText && mode === lastMode && !!frame.compact === lastCompact && frame.motif === lastMotif) return;
    const previous = lastText;
    const animated = !document.documentElement.classList.contains('reduce-motion') && !window.matchMedia('(prefers-reduced-motion:reduce)').matches;
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
    lastText = value; lastMode = mode; lastCompact = !!frame.compact; lastMotif = frame.motif;
    text.textContent = value; led.title = value; led.dataset.mode = mode;
    cells.classList.remove('scrolling'); spillCells.classList.remove('scrolling');
    requestAnimationFrame(() => {
      if (value !== lastText || mode !== lastMode || !!frame.compact !== lastCompact || frame.motif !== lastMotif) { old?.remove(); return; }
      const reduced = document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion:reduce)').matches;
      const shown = reduced || frame.compact ? ledStaticMessage(value) : value;
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
          const outgoing = old.animate([{translate:'0 0',opacity:1},{translate:'0 26px',opacity:0}],{duration,easing:'linear'});
          const incoming = cells.animate([{translate:'0 -26px',opacity:0},{translate:'0 0',opacity:1}],{duration,easing:'linear'});
          reel = [outgoing,incoming]; outgoing.onfinish = () => old?.remove();
        }
      }
    });
  };
  const machine = new DisplayMachine(setText);
  const phaseMessage = () => {
    const root = document.documentElement;
    if (root.dataset.step === 'opp') return 'OPPONENT TURN';
    if (root.dataset.step === 'draw') return 'DRAW';
    if (root.dataset.step === 'throw') return 'THROW';
    if (root.dataset.test2Bloom === 'true') return 'BLOOM READY';
    if (root.dataset.step === 'grow') return 'GROW OR SKIP';
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
      const combination = item.icon === 'bloom' ? item.source.querySelector('.test2-combination') : null;
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
  bloomButton.addEventListener('click', () => {
    if (bloomSources.length === 1) { bloomSources[0]?.click(); return; }
    if (bloomSources.length < 2) return;
    const opening = bloomSelector.hidden;
    if (opening) { bloomSelector.hidden = false; bloomButton.setAttribute('aria-expanded','true'); bloomSelector.querySelector<HTMLButtonElement>('button')?.focus(); }
    else closeBloom();
  });
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
  rail.addEventListener('test2-noticechange', () => {
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
    if (lastPhase === phase && lastAction && first?.key !== lastAction) {
      const hint = first?.icon === 'clear' ? 'CLEAR SHAPE' : first?.icon === 'reverse' ? 'REVERSE ORDER'
        : first?.icon === 'cancel' ? 'CANCEL SELECTION' : first?.icon === 'bloom' ? 'BLOOM READY'
        : first?.source.id === 'tool-skip' ? 'FAST FORWARD' : '';
      if (hint) machine.hint(hint);
    }
    lastPhase = phase; lastAction = first?.key ?? '';
    context.innerHTML = svg(first?.icon ?? 'neutral'); context.disabled = !first;
    context.setAttribute('aria-haspopup',current.length > 1 ? 'menu' : 'false');
    context.setAttribute('aria-label',first ? current.length > 1 ? `${first.label}. ${current.length} actions available` : first.label : 'No action available');
    context.title = context.getAttribute('aria-label') ?? '';
    for (const b of moves.querySelectorAll<HTMLButtonElement>('button')) b.tabIndex = -1;
    refreshMessage();
  }, flash, hint: (value:string) => machine.hint(value), event: (event:DisplayEvent) => machine.event(event),
    reset: (you=0,opp=0) => machine.reset(phaseMessage(),you,opp) };
}
