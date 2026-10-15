// Futa04 presentation only. The existing guide, effects and danger warning still supply every
// word; prompts float over the map and disappear as soon as a move begins. No layout row.
import { IS_FUTA04 } from '../channel.js';

type Notice = { node: HTMLElement; priority: 'routine' | 'major'; text: string };

export const INFORMATION_CSS = `
.futa04-information .game {
  grid-template-rows: var(--hud-h, 48px) var(--race-h, 0px) minmax(0, 1fr);
}
.futa04-information .game > .play { grid-row: 3; }
.futa04-information-blocked #futa04-information-rail,
.futa04-information-blocked #step-cue { visibility: hidden; }
/* Long Bloom labels must stay inside their existing desktop message/control column. */
.futa04-information[data-layout='side'] .table-row > .moves { flex-wrap: wrap; align-content: center; gap: 4px; }
.futa04-information[data-layout='side'] .table-row > .moves > .btn { max-width: 100%; white-space: normal; line-height: 1.15; }
.futa04-information #turn-pill,
.futa04-information #edge-wash,
.futa04-information #idle-tip { display: none !important; }
.futa04-information #futa04-information-rail {
  position: absolute;
  inset: 6px 8px auto;
  z-index: 6;
  box-sizing: border-box;
  min-width: 0;
  height: 28px;
  pointer-events: none;
}
.futa04-information #step-cue { display:none !important; }
.futa04-information .dock .hand .card.playable {
  border-color: color-mix(in srgb, var(--c-accent) 88%, var(--c-line));
  box-shadow: 0 0 7px color-mix(in srgb, var(--c-accent) 16%, transparent);
}
.futa04-information .dock .hand .card.futa04-bloom-card {
  border-color: var(--c-accent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--c-accent) 28%, transparent), inset 0 0 7px color-mix(in srgb, var(--c-accent) 8%, transparent);
}
.futa04-information .dock .hand.waiting .card {
  opacity: .38 !important;
  filter: grayscale(.85) brightness(.72) !important;
  box-shadow: none !important;
  transition: opacity calc(180ms * var(--anim,1)) ease-out, filter calc(180ms * var(--anim,1)) ease-out !important;
}
.futa04-information #moves .futa04-skip {
  color: var(--c-muted); background: transparent; border: 1px solid var(--c-line);
  opacity: .6; text-decoration: none;
}
.futa04-information #moves .futa04-skip:hover,
.futa04-information #moves .futa04-skip:focus-visible { opacity: 1; }
.futa04-information .futa04-combination { display: inline-flex; align-items: center; gap: 2px; }
.futa04-information .futa04-mini-card {
  display: grid; place-items: center; width: 14px; height: 28px; border: 1px solid currentColor;
  border-radius: 4px; font-size: 10px; line-height: 1; padding: 2px; box-sizing: border-box;
}
.futa04-information .futa04-mini-card .c-num { font-size: 10px; padding: 0; }
.futa04-information .futa04-mini-card .c-suit svg { width: 10px; height: 10px; }
.futa04-information .futa04-combination .s0 { color: var(--c-moss); }
.futa04-information .futa04-combination .s1 { color: var(--c-ash); }
.futa04-information .futa04-combination .s2 { color: var(--c-dew); }
.futa04-information .futa04-combination .s3 { color: var(--c-ember); }
.futa04-information #moves .kind { min-height: 44px; padding: 4px 7px; }
.futa04-information #moves .bloom-toggle::after { content: '⌄'; margin-left: 4px; }
.futa04-information[data-thumb] .dock .table-row > .moves {
  flex-direction: row; flex-wrap: nowrap; align-items: center; gap: 4px;
}
.futa04-information[data-thumb] .dock .table-row > .moves .btn {
  width: auto; max-width: none; min-width: 44px; min-height: 44px;
  margin: 0; padding: 4px 7px; flex: 0 0 auto;
}
.futa04-information #moves .futa04-compact-control { width: 44px; padding: 6px; }
.futa04-information #moves .futa04-compact-control svg { width: 22px; height: 22px; }
.futa04-information #moves .bloom-toggle.futa04-compact-control::after { display: none; }

/* Skip spans exactly the bulb + ordering controls; Bloom has its own remaining column. */
.futa04-information { --futa04-tool-size: 28px; --futa04-tool-gap: 16px; }
.futa04-information[data-thumb] { --futa04-tool-size: 44px; --futa04-tool-gap: 4px; }
.futa04-information .dock .table-row > .moves:is(:has(.futa04-skip), :has(.kind)) {
  display: grid; grid-template-columns: minmax(44px, 1fr) repeat(2, var(--futa04-tool-size));
  grid-template-rows: 44px; gap: var(--futa04-tool-gap); align-items: center;
}
.futa04-information[data-thumb='left'] .dock .table-row > .moves:is(:has(.futa04-skip), :has(.kind)) { grid-template-columns: repeat(3, var(--futa04-tool-size)); justify-content: start; }
.futa04-information .dock .table-row > .moves > .kind { grid-column: 1; grid-row: 1; max-width: 100%; width: auto; justify-self: center; }
.futa04-information .dock .table-row > .moves > .futa04-skip {
  grid-column: 2 / 4; grid-row: 1; width: 100%; min-width: 0; max-width: none;
  height: var(--futa04-tool-size) !important; min-height: var(--futa04-tool-size) !important; margin: 0; padding: 0 6px;
  position: relative; box-sizing: border-box;
}
.futa04-information:not([data-thumb]) .dock .table-row { grid-template-rows: 0 44px 28px minmax(20px, 1fr); row-gap: 4px; }
.futa04-information:not([data-thumb]) .dock .table-row > .moves { grid-row: 2; }
.futa04-information:not([data-thumb]) #futa04-actions { grid-row: 3; justify-content: flex-end; }
.futa04-information:not([data-thumb]) #moves > .futa04-skip::after { content:''; position:absolute; inset:-8px; }
.futa04-information #moves .bloom-options { max-height: min(50dvh, 320px); overflow-y: auto; }
.futa04-information .futa04-combination { max-width:100%; }
.futa04-information .futa04-mini-card { flex-shrink: 1; min-width: 8px; padding-inline: 0; }
.futa04-information .pile-label { display: none; }
.futa04-information #deck.coach-glow { box-shadow: none; }
.futa04-information #discard.futa04-bloom-draw .pile-top { border-color: var(--c-gold); }
.futa04-information #hand .card.futa04-throw-picked {
  filter: grayscale(1) !important; border-color: #dedede; box-shadow: none !important;
  transform: perspective(500px) rotate(var(--rot, 0deg)) translateY(calc(var(--dy, 0px) - 18px)) scale(1.31);
}
.futa04-information[data-thumb] #hand .card.futa04-throw-picked {
  transform: translate(var(--lx, 0px), var(--ly, 0px)) rotate(var(--rot, 0deg)) scale(1.31);
}
.futa04-information #futa04-information-subline {
  min-width: 0;
  width: 100%;
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.futa04-information #futa04-notice-slot { min-width: 0; width: 100%; text-align: center; }
.futa04-information #futa04-help-slot { min-width: 0; pointer-events: auto; }
.futa04-information #futa04-help-slot:empty { display: none; }
.futa04-information #futa04-notice-slot > :not([data-information-active='true']) { display: none !important; }
.futa04-information #futa04-notice-slot > [data-information-active='true'] {
  position: static !important;
  inset: auto !important;
  transform: none !important;
  opacity: 1 !important;
  display: block;
  max-width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
  font-size: .75rem;
  font-weight: 450;
  line-height: 1;
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  color: var(--c-text);
  text-shadow: 0 1px 5px rgba(0,0,0,.85);
  pointer-events: none;
}
.futa04-information #futa04-information-rail[data-notice-priority='routine'] #futa04-notice-slot { opacity: .78; }
.futa04-information #futa04-notice-slot > .bad,
.futa04-information #futa04-notice-slot > #root-warn { color: var(--c-danger); }
.futa04-information #futa04-notice-slot > .good { color: var(--c-you); }
.futa04-information #futa04-notice-slot > #root-warn i { display: none; }
.futa04-information body.paused #futa04-information-rail,
.futa04-information body.paused #step-cue { visibility: hidden; }

/* The box: one stable cockpit, with a centre display and a right action slot. */
html.futa04-information .dock > #futa04-box {
  --box-tools: 140px; --box-pile: 50px; --box-piles: calc(2 * var(--box-pile) + 8px);
  --hardware-surface:
    radial-gradient(ellipse 24px 12px at 7% 0%,rgba(222,213,188,.045),transparent 80%),
    radial-gradient(ellipse 19px 10px at 97% 100%,rgba(224,211,180,.035),transparent 80%),
    linear-gradient(155deg,#242624,#1a1c1b 52%,#171918);
  display: grid; position: relative; inset: auto; width: 100%; height: 104px;
  grid-template-columns: var(--box-piles) minmax(0, 1fr) var(--box-tools);
  grid-template-rows: 44px 44px; gap: 4px 6px; padding: 6px;
  box-sizing: border-box; border: 0; border-radius: 0; background: none; box-shadow: none; align-items: end;
  transition: grid-template-columns 240ms ease;
}
html.futa04-information[data-step='draw'] .dock > #futa04-box { --box-piles: 128px; }
html.futa04-information[data-thumb] .dock > #futa04-box {
  position: absolute; top: 8px; left: 4px; width: calc(100% - 8px);
  height: 122px; grid-template-rows: 44px 48px; align-content: end;
}
html.futa04-information[data-thumb] .dock #futa04-box > .moves {
  grid-template-rows: 44px 48px;
}
html.futa04-information .dock #futa04-box > .piles {
  display: flex; position: relative; grid-column: 1; grid-row: 1 / 3;
  gap: 8px; align-items: flex-end; justify-content: center; height: 100%;
  transform: translateX(var(--futa04-draw-shift, 0px));
  /* Returning to Grow is immediate: an exiting pile must never sit over Skip. */
  transition: none;
}
html.futa04-information[data-step='draw'] .dock #futa04-box > .piles {
  gap: 18px; justify-content: flex-start;
  transition: transform 300ms cubic-bezier(.2,.8,.2,1), gap 240ms ease;
}
/* The Draw cockpit may visually overlap the empty Moves region on small phones.
   Its transparent group must not intercept the enlarged pile buttons. */
html.futa04-information[data-step='draw'] .dock #futa04-box > .moves { pointer-events: none; }
html.futa04-information[data-step='draw'] .dock #futa04-box > .moves > * { pointer-events: auto; }
html.futa04-information .dock #futa04-box > .piles > .pile {
  position: relative; inset: auto; grid-area: auto; width: var(--box-pile); height: 100%;
  margin: 0; flex: 0 0 var(--box-pile); min-width: 0;
  transform-origin: left bottom; transition: transform 240ms cubic-bezier(.18,.8,.25,1);
}
html.futa04-information .dock #futa04-box #deck .pile-stack { inset: 0; }
/* The face, halo and meter share one edge. Draw scales the whole instrument, including
   its two-digit meter, while the surrounding grid reserves the extra width. */
html.futa04-information[data-step='draw'] .dock #futa04-box > .piles > .pile.ready {
  transform: scale(1.16); animation: futa04-draw-pile-breathe 1.8s ease-in-out 240ms infinite;
}
html.futa04-information[data-thumb][data-step='draw'] .dock #futa04-box > .piles > .pile.ready {
  transform: translateY(10px) scale(1.16);
}
@keyframes futa04-draw-pile-breathe { 0%,100% { scale: 1; } 50% { scale: 1.035; } }
html.futa04-information[data-step='draw'] .dock #futa04-box .pile.ready .pile-card {
  transform: none; animation: none !important;
}
html.futa04-information .dock #futa04-box .gd-ring { display: none !important; }
html.futa04-information .dock #futa04-box .gd-halo {
  box-shadow: 0 0 24px 2px rgba(var(--gd-cream), .72);
}
html.futa04-information.reduce-motion .dock #futa04-box > .piles > .pile.ready { animation: none; }
@media (prefers-reduced-motion: reduce) {
  html.futa04-information .dock #futa04-box > .piles > .pile.ready { animation: none; }
}
html.futa04-information .dock #futa04-box .pile-card {
  --pile-h: 71px; --cw: 50px; --ch: 71px; width: 50px; height: 71px;
}
html.futa04-information .dock #futa04-box .pile { justify-content: flex-start; }
html.futa04-information .dock #futa04-box .pile-meta {
  position: absolute; inset: auto auto 0 0; width: var(--box-pile);
  height: 18px; justify-self: stretch; pointer-events: none;
}
html.futa04-information .dock #futa04-box :is(#deck,#discard) .pile-meta .pile-count { position: absolute; inset: 0 auto auto 0; height: 18px; }
html.futa04-information .dock #futa04-box .pile-count.pile-meter {
  display: flex; align-items: center; justify-content: center; gap: 3px; position: relative;
  width: 34px; min-width: 34px; height: 18px; padding: 1px 0;
  border: 0; border-radius: 3px;
  background: #111312; color: #e8e1cd;
  box-shadow: none;
  font: 700 10px/10px var(--font-mono, ui-monospace, monospace);
  font-variant-numeric: tabular-nums; letter-spacing: 0; box-sizing: border-box;
}
html.futa04-information .dock #futa04-box .pile-count.pile-meter::before {
  content:''; position:absolute; inset:0; border-radius:0; pointer-events:none;
  background:url('./hardware/counter-frame-supplied.webp') center / contain no-repeat; z-index:0;
}
html.futa04-information .dock #futa04-box .pile-meter-window {
  position: relative; display: block; flex: 0 0 11px; width: 11px; height: 10px; z-index:1;
  overflow: hidden; border-right: 0; box-shadow: none; background:#0c0d0c;
}
html.futa04-information .dock #futa04-box .pile-meter-drum { position: absolute; top: 0; left: 0; width: 100%; height: 20px; }
html.futa04-information .dock #futa04-box .pile-meter-face {
  position: relative; top:1px; display: grid; place-items: center; width: 100%;
  height: 10px; white-space: nowrap; font: inherit;
  text-shadow: 0 1px 1px #020303, 0 -1px rgba(255,250,225,.12);
  background: transparent;
}
html.futa04-information .dock #futa04-box #deck.low .pile-meter { color: var(--c-gold); }
html.futa04-information .dock #futa04-box > .moves {
  display: grid; position: static; inset: auto; grid-column: 2 / 4; grid-row: 1 / 3;
  width: 100%; height: 100%; min-height: 0; max-height: none;
  grid-template-columns: minmax(0, 1fr) var(--box-tools); grid-template-rows: 44px 44px;
  gap: 4px 6px; padding: 0; align-items: end; justify-content: stretch;
}
html.futa04-information .dock #futa04-box #moves > .kind {
  grid-column: 1; grid-row: 1 / 3; width: 100%; min-width: 0; max-width: 100%;
  height: 100%; min-height: 60px; padding: 4px 4px 6px; justify-self: stretch;
  display: flex; align-items: flex-end; justify-content: center;
  background: transparent; border: 0; outline: 0; box-shadow: none; border-radius: 0;
}
html.futa04-information .dock #futa04-box #moves > .kind:is(:hover,:focus-visible,.on) {
  background: transparent; box-shadow: none;
}
html.futa04-information .dock #futa04-box #moves > .kind:focus-visible {
  outline: 2px solid var(--c-accent); outline-offset: -2px;
}
html.futa04-information .dock #futa04-box #moves > :is(.futa04-skip,.cancel,.empty-continue,.primary:not(.kind)) {
  grid-column: 2; grid-row: 1; justify-self: end; width: 92px; max-width: 100%;
  height: 44px !important; min-height: 44px !important; padding: 0 6px;
  margin: 0; border-radius: 6px; font-size: 13px;
}
html.futa04-information .dock #futa04-box #moves:has(> .cancel) > .futa04-skip { display: none; }
html.futa04-information .dock #futa04-box #moves > .cancel { background: transparent; color: var(--c-muted); }
html.futa04-information .dock #futa04-box #moves > .futa04-skip::after { display: none; }
html.futa04-information .dock #futa04-box #futa04-actions {
  position: static; inset: auto; grid-column: 3; grid-row: 2;
  width: 140px; height: 44px; display: flex; justify-content: flex-end; gap: 4px; z-index: 4;
}
html.futa04-information .dock #futa04-box #futa04-actions > .hand-slot {
  width: 44px; height: 44px; flex: 0 0 44px; inset: auto;
}
html.futa04-information .dock #futa04-box #futa04-actions > .hand-slot::after { display: none; }
html.futa04-information .dock #futa04-box #futa04-help-button[hidden] { display: grid; visibility: hidden; pointer-events: none; }
html.futa04-information[data-thumb='left'] .dock #futa04-box { grid-template-columns: var(--box-tools) minmax(0,1fr) var(--box-piles); }
html.futa04-information[data-thumb='left'] .dock #futa04-box > .piles { grid-column: 3; }
html.futa04-information[data-thumb='left'] .dock #futa04-box > .moves { grid-column: 1 / 3; grid-template-columns: var(--box-tools) minmax(0,1fr); }
html.futa04-information[data-thumb='left'] .dock #futa04-box #moves > .kind { grid-column: 2; }
html.futa04-information[data-thumb='left'] .dock #futa04-box #moves > :is(.futa04-skip,.cancel,.empty-continue,.primary:not(.kind)) { grid-column: 1; justify-self: end; }
html.futa04-information[data-thumb='left'] .dock #futa04-box #futa04-actions { grid-column: 1; justify-content: flex-start; }
html.futa04-information .dock #futa04-box #futa04-actions .i { width: 20px; height: 20px; }
html.futa04-information .dock #futa04-box .futa04-combination {
  display: flex; justify-content: center; flex-wrap: wrap; gap: 3px; max-width: 100%;
}
html.futa04-information .dock #futa04-box .futa04-mini-card {
  flex: 0 0 20px; width: 20px; height: 34px; min-width: 20px; padding: 2px;
}
html.futa04-information .dock #futa04-box .futa04-mini-card .c-num { font-size: 13px; }
html.futa04-information .dock #futa04-box .futa04-mini-card .c-suit svg { width: 13px; height: 13px; }
html.futa04-information .dock #futa04-box #moves .bloom-toggle::after { display: none; }
html.futa04-information .dock #futa04-box #moves > .bloom-toggle::before {
  content: '⌄'; position: absolute; right: 3px; bottom: 0; color: var(--c-muted);
}
html.futa04-information .dock #futa04-box #moves > .bloom-toggle { position: relative; }
html.futa04-information .dock #futa04-box #moves .bloom-options {
  left: calc(var(--box-piles) + 6px); right: auto; bottom: calc(100% + 6px);
  width: max-content; min-width: 0; max-width: min(280px, calc(100% - var(--box-piles) - 12px));
  max-height: min(45dvh,320px); z-index: 8; padding: 8px; box-sizing: border-box;
}
html.futa04-information[data-thumb='left'] .dock #futa04-box #moves .bloom-options {
  left: 6px;
}
html.futa04-information #board .badge.weak { display: none !important; }
html.futa04-information #board .futa04-boink { transform-box: fill-box; transform-origin: center; }
html.futa04-information[data-step='throw'] #futa04-box #deck {
  opacity: .48; filter: grayscale(.7); transition: opacity 160ms ease, filter 160ms ease;
}
html.futa04-information[data-step='throw'] #futa04-box #discard {
  filter: brightness(1.12); transition: filter 160ms ease;
}
html.futa04-information[data-step='throw'] #discard .gd-halo {
  opacity: .62; transition: none;
  box-shadow: 0 0 0 1px rgba(218,104,80,.38), 0 0 22px 2px rgba(173,64,47,.32);
}
html.futa04-information[data-step='throw'] #discard .gd-ring { animation: none !important; opacity: 0; }
html.futa04-information #hand .card { touch-action: manipulation; }
/* A short edge light belongs to each card, and follows its fan rotation and lift. */
html.futa04-information[data-step='grow'] #hand:not(.waiting) .card.playable:not(.dim) {
  box-shadow: 0 0 0 1px rgba(119,179,116,.22), 0 0 8px 1px rgba(88,158,89,.18), 0 5px 15px rgba(5,16,9,.30);
}
/* Scale is separate from the fan's rotate/translate, preserving its hit targets. */
@keyframes futa04-card-breathe { 0%,100% { scale: 1; } 50% { scale: 1.055; } }
html.futa04-information[data-step='grow'][data-futa04-waiting='true'] #hand:not(.waiting) .card.playable:not(.lifted) {
  animation: futa04-card-breathe 1.35s ease-in-out infinite;
}
html.futa04-information[data-step='grow'][data-futa04-waiting='true'] #moves > :is(.kind[data-kind^='bloom-'],.bloom-toggle):not(.on) .futa04-combination {
  animation: futa04-card-breathe 1.35s ease-in-out infinite;
}
html.futa04-information[data-step='throw'] #hand:not(.waiting) .card:not(.futa04-throw-picked) {
  opacity: .88; filter: grayscale(.54) brightness(.94);
  outline-color: rgba(223,105,77,.35) !important;
  box-shadow: 0 0 0 1px rgba(222,110,83,.29), 0 0 9px 1px rgba(186,66,47,.24), 0 5px 15px rgba(20,11,10,.34);
  animation: futa04-card-breathe 1.35s ease-in-out infinite;
}
html.futa04-information[data-step='throw'] #hand:not(.waiting) .card.futa04-throw-picked {
  opacity: 1; box-shadow: 0 0 0 1px rgba(222,110,83,.35), 0 0 11px 1px rgba(186,66,47,.26) !important;
}
html.futa04-information:is(.futa04-move-active,.futa04-information-blocked,.reduce-motion) #hand .card { animation: none !important; }
html.futa04-information:is(.futa04-move-active,.futa04-information-blocked,.reduce-motion) #moves .futa04-combination { animation: none !important; }
@media (prefers-reduced-motion: reduce) {
  html.futa04-information #hand .card, html.futa04-information #moves .futa04-combination { animation: none !important; }
}

/* Shared cockpit hardware: a 44px touch target, compact matte face and quiet edge light. */
html.futa04-information #futa04-box {
  --control-size: 44px;
  --control-gap: 4px;
  --control-ivory: #f5edda;
  --control-amber: #c49658;
  --control-ember: #c96e5c;
}
html.futa04-information .dock #futa04-box #futa04-actions {
  width: calc(3 * var(--control-size) + 2 * var(--control-gap));
  height: var(--control-size);
  gap: var(--control-gap);
}
html.futa04-information .dock #futa04-box #futa04-actions > .hand-slot {
  width: var(--control-size); height: var(--control-size); flex-basis: var(--control-size);
}
html.futa04-information .dock #futa04-box #moves > :is(.futa04-skip,.cancel,.empty-continue,.primary:not(.kind)).futa04-hardware-control {
  width: var(--control-size); min-width: var(--control-size); max-width: var(--control-size);
  height: var(--control-size) !important; min-height: var(--control-size) !important;
  padding: 0; justify-self: end;
}
html.futa04-information .dock #futa04-box :is(#futa04-actions > .hand-slot, #moves .futa04-hardware-control) {
  display: grid; place-items: center; box-sizing: border-box;
  width: var(--control-size); height: var(--control-size); min-width: var(--control-size); min-height: var(--control-size);
  margin: 0; padding: 0; border: 0; border-radius: 12px;
  background: #111312;
  color: var(--control-ivory); opacity: 1;
  box-shadow: none;
  text-decoration: none; touch-action: manipulation;
  transition: border-color .16s ease, box-shadow .16s ease, color .16s ease, opacity .16s ease, transform .12s ease;
}
html.futa04-information .dock #futa04-box :is(#futa04-actions > .hand-slot, #moves .futa04-hardware-control) :is(svg,.i) {
  display: block; width: 21px; height: 21px;
}
html.futa04-information .dock #futa04-box :is(#futa04-actions > .hand-slot, #moves .futa04-hardware-control):is(:hover,:focus-visible,[aria-pressed='true'],.on) {
  color: #fff1cf; box-shadow: 0 0 9px rgba(196,150,88,.22);
}
html.futa04-information .dock #futa04-box :is(#futa04-actions > .hand-slot, #moves .futa04-hardware-control):focus-visible {
  outline: 2px solid #ffe1a7; outline-offset: 2px;
}
html.futa04-information .dock #futa04-box :is(#futa04-actions > .hand-slot, #moves .futa04-hardware-control):active:not(:disabled) {
  transform: translateY(1px) scale(.98);
}
html.futa04-information .dock #futa04-box #moves .futa04-skip.futa04-hardware-control {
  color: #c4c1b7; opacity: .77;
}
html.futa04-information .dock #futa04-box #moves .futa04-control-clear { color: #d38c7c; }
html.futa04-information .dock #futa04-box #moves .futa04-control-clear:is(:hover,:focus-visible) {
  color: #ed9b87; box-shadow: 0 0 9px rgba(201,110,92,.2);
}
html.futa04-information .dock #futa04-box :is(#futa04-actions > .hand-slot, #moves .futa04-hardware-control):disabled {
  opacity: .68;
}
html.futa04-information .dock #futa04-box #moves .bloom-options .futa04-hardware-control {
  display: inline-grid; vertical-align: middle; margin: 3px;
}
@media (prefers-reduced-motion: reduce) {
  html.futa04-information .dock #futa04-box :is(#futa04-actions > .hand-slot, #moves .futa04-hardware-control) { transition: none; }
}
`;

/** Mount after player enhancements (including mountGuide). No game state or settings change. */
export const mountInformation = () => {
  const root = document.documentElement;
  const game = document.getElementById('game');
  const wrap = document.getElementById('board-wrap');
  if (!IS_FUTA04 || !game || !wrap || document.getElementById('futa04-information-rail')) return;
  root.classList.add('futa04-information');
  const cockpit = document.querySelector<HTMLElement>('#dock > .table-row');
  if (cockpit) { cockpit.id = 'futa04-box'; cockpit.setAttribute('role', 'group'); cockpit.setAttribute('aria-label', 'Turn controls'); }
  const style = document.createElement('style');
  style.id = 'futa04-information-style';
  style.textContent = INFORMATION_CSS;
  document.head.append(style);

  const rail = document.createElement('div');
  rail.id = 'futa04-information-rail';
  const subline = document.createElement('div');
  subline.id = 'futa04-information-subline';
  const notices = document.createElement('div');
  notices.id = 'futa04-notice-slot';
  notices.setAttribute('role', 'status');
  notices.setAttribute('aria-live', 'polite');
  notices.setAttribute('aria-atomic', 'true');
  const help = document.createElement('div');
  help.id = 'futa04-help-slot';
  subline.append(notices, help);
  rail.append(subline);
  wrap.append(rail);

  // The fixed LED now owns routine phase instructions; no idle prompt timers remain.
  const cue = document.getElementById('step-cue');
  if (cue) { cue.setAttribute('aria-hidden', 'true'); cue.inert = true; }
  const captions = document.getElementById('captions');
  // The message now has one live region; floating score numbers keep their existing rendering.
  captions?.setAttribute('aria-live', 'off');
  const banner = document.getElementById('banner');
  if (banner) {
    banner.removeAttribute('aria-hidden');
    notices.append(banner);
  }
  const warning = document.getElementById('root-warn');
  if (warning) {
    warning.removeAttribute('role');
    notices.append(warning);
  }

  let current: Notice | null = null;
  let timer = 0;
  const announceChange = () => rail.dispatchEvent(new CustomEvent('futa04-noticechange', { bubbles: true }));
  const update = () => {
    for (const child of notices.children) (child as HTMLElement).removeAttribute('data-information-active');
    const shown = current?.node.isConnected && (current.priority === 'major' || !warning || warning.hidden)
      ? current
      : warning && !warning.hidden
        ? { node: warning, priority: 'major' as const, text: warning.textContent ?? '' }
        : null;
    if (shown) {
      shown.node.dataset.informationActive = 'true';
      rail.dataset.noticePriority = shown.priority;
    } else delete rail.dataset.noticePriority;
    announceChange();
  };
  const expire = () => {
    clearTimeout(timer);
    current = null;
    update();
  };
  const priorityFor = (node: HTMLElement, text: string): Notice['priority'] =>
    node.id === 'banner' || !/\b(threw away|took (?:a |an |the |Moss|Ash|Dew|Ember|Fruit)|nothing to play)\b/i.test(text) ? 'major' : 'routine';
  const take = (node: HTMLElement) => {
    const text = node.textContent?.trim() ?? '';
    if (!text) return;
    if (current && current.node !== node) current.node.removeAttribute('data-information-active');
    if (node.parentElement !== notices) notices.append(node);
    current = { node, priority: priorityFor(node, text), text };
    clearTimeout(timer);
    // Important outcomes get room to finish; routine opponent bookkeeping yields immediately
    // when the player acts. Original caption animations still own their DOM cleanup.
    timer = window.setTimeout(expire, current.priority === 'major' ? 3500 : 1800);
    update();
  };

  if (captions) {
    for (const caption of captions.querySelectorAll<HTMLElement>('.caption')) take(caption);
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes)
        if (node instanceof HTMLElement && node.classList.contains('caption')) take(node);
    }).observe(captions, { childList: true });
  }
  if (banner) new MutationObserver(() => take(banner)).observe(banner, { childList: true, characterData: true, subtree: true });
  if (warning) new MutationObserver(update).observe(warning, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(() => {
    if (current && !current.node.isConnected) expire();
  }).observe(notices, { childList: true });

  const clearRoutine = () => {
    if (current?.priority === 'routine') expire();
  };
  for (const event of ['pointerdown', 'keydown'] as const)
    window.addEventListener(event, clearRoutine, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) expire();
  });
  update();
  return { clearRoutine };
};
