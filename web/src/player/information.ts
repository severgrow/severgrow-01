// Test2 presentation only. The existing guide, effects and danger warning still supply every
// word; prompts float over the map and disappear as soon as a move begins. No layout row.
import { IS_TEST2 } from '../channel.js';

type Notice = { node: HTMLElement; priority: 'routine' | 'major'; text: string };

export const INFORMATION_CSS = `
.test2-information .game {
  grid-template-rows: var(--hud-h, 48px) var(--race-h, 0px) minmax(0, 1fr);
}
.test2-information .game > .play { grid-row: 3; }
.test2-information-blocked #test2-information-rail,
.test2-information-blocked #step-cue { visibility: hidden; }
/* Long Bloom labels must stay inside their existing desktop message/control column. */
.test2-information[data-layout='side'] .table-row > .moves { flex-wrap: wrap; align-content: center; gap: 4px; }
.test2-information[data-layout='side'] .table-row > .moves > .btn { max-width: 100%; white-space: normal; line-height: 1.15; }
.test2-information #turn-pill,
.test2-information #edge-wash,
.test2-information #idle-tip { display: none !important; }
.test2-information #test2-information-rail {
  position: absolute;
  inset: 6px 8px auto;
  z-index: 6;
  box-sizing: border-box;
  min-width: 0;
  height: 28px;
  pointer-events: none;
}
.test2-information #step-cue {
  position: absolute !important;
  inset: calc((100% - var(--cam-under, 0px)) / 2) auto auto 50% !important;
  transform: translate(-50%, -50%) !important;
  width: calc(100% - 28px);
  max-width: 560px;
  min-width: 0;
  z-index: 5;
  text-align: center;
  pointer-events: none;
  opacity: .72 !important;
  transition: opacity 140ms ease-out;
}
.test2-information #step-cue[data-level='hi'] { opacity: .86 !important; }
.test2-information #step-cue[data-level='lo'] { opacity: .66 !important; }
.test2-information #step-cue[data-level='off'],
.test2-information.test2-move-active #step-cue,
.test2-information:has(#tooltip:not([hidden])) #step-cue,
.test2-information.gd-picked #step-cue { opacity: 0 !important; }
.test2-information[data-step='none'] #step-cue,
.test2-information[data-guide='off'] #step-cue { visibility: hidden; }
.test2-information .cue-plate {
  display: block;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  overflow: visible;
  animation: none !important;
}
@keyframes test2-cue-breathe { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .94; transform: scale(1.085); } }
.test2-information #step-cue:is([data-step='draw'], [data-step='grow'], [data-step='throw']) .cue-text {
  animation: test2-cue-breathe 3.1s ease-in-out infinite !important;
}
.test2-information-blocked #step-cue .cue-text,
.test2-information.test2-move-active #step-cue .cue-text { animation-play-state: paused !important; }
.test2-information .cue-icon,
.test2-information .cue-kicker,
.test2-information .cue-pips,
.test2-information .cue-plate::after { display: none; }
.test2-information .cue-words {
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 0;
  line-height: 1.08;
}
.test2-information #step-cue .cue-text {
  display: inline-block; transform-origin: center;
  font-family: var(--font-display, Georgia, serif);
  font-size: clamp(30px, 8.2vw, 48px);
  line-height: 1.08;
  font-weight: 750;
  letter-spacing: .025em;
  text-transform: uppercase;
  color: #fff9e9;
  text-shadow: 0 2px 12px rgba(0,0,0,.85), 0 0 3px rgba(0,0,0,.95);
  -webkit-text-stroke: .35px rgba(0,0,0,.5);
  animation: none !important;
}
.test2-information.large-text #step-cue .cue-text { font-size: clamp(32px, 8.8vw, 52px); }
.test2-information #step-cue[data-step='opp'] .cue-text { font-size: clamp(24px, 6.6vw, 38px); }
/* Test2 owns prompt visibility independently of the guide's legacy entrance/settle clock. */
.test2-information:not(.test2-idle-ready) #step-cue { opacity: 0 !important; }
.test2-information.test2-idle-ready #step-cue:not([data-step='opp']) { opacity: .6536 !important; }
.test2-information.test2-idle-ready #step-cue .cue-text { animation: test2-cue-breathe 3.1s ease-in-out infinite !important; animation-play-state: running !important; }
.test2-information #step-cue[data-step='opp'] { visibility: hidden !important; }
.test2-information:has(#tooltip:not([hidden])) #step-cue { opacity: 0 !important; }
.test2-information .dock .hand .card.playable {
  border-color: color-mix(in srgb, var(--c-accent) 88%, var(--c-line));
  box-shadow: 0 0 7px color-mix(in srgb, var(--c-accent) 16%, transparent);
}
.test2-information .dock .hand .card.test2-bloom-card {
  border-color: var(--c-accent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--c-accent) 28%, transparent), inset 0 0 7px color-mix(in srgb, var(--c-accent) 8%, transparent);
}
.test2-information .dock .hand.waiting .card {
  opacity: .38 !important;
  filter: grayscale(.85) brightness(.72) !important;
  box-shadow: none !important;
  transition: none !important;
}
.test2-information #moves .test2-skip {
  color: var(--c-muted); background: transparent; border: 1px solid var(--c-line);
  opacity: .6; text-decoration: none;
}
.test2-information #moves .test2-skip:hover,
.test2-information #moves .test2-skip:focus-visible { opacity: 1; }
.test2-information .test2-combination { display: inline-flex; align-items: center; gap: 2px; }
.test2-information .test2-mini-card {
  display: grid; place-items: center; width: 14px; height: 28px; border: 1px solid currentColor;
  border-radius: 4px; font-size: 10px; line-height: 1; padding: 2px; box-sizing: border-box;
}
.test2-information .test2-mini-card .c-num { font-size: 10px; padding: 0; }
.test2-information .test2-mini-card .c-suit svg { width: 10px; height: 10px; }
.test2-information .test2-combination .s0 { color: var(--c-moss); }
.test2-information .test2-combination .s1 { color: var(--c-ash); }
.test2-information .test2-combination .s2 { color: var(--c-dew); }
.test2-information .test2-combination .s3 { color: var(--c-ember); }
.test2-information #moves .kind { min-height: 44px; padding: 4px 7px; }
.test2-information #moves .bloom-toggle::after { content: '⌄'; margin-left: 4px; }
.test2-information[data-thumb] .dock .table-row > .moves {
  flex-direction: row; flex-wrap: nowrap; align-items: center; gap: 4px;
}
.test2-information[data-thumb] .dock .table-row > .moves .btn {
  width: auto; max-width: none; min-width: 44px; min-height: 44px;
  margin: 0; padding: 4px 7px; flex: 0 0 auto;
}
.test2-information #moves .test2-compact-control { width: 44px; padding: 6px; }
.test2-information #moves .test2-compact-control svg { width: 22px; height: 22px; }
.test2-information #moves .bloom-toggle.test2-compact-control::after { display: none; }

/* Skip spans exactly the bulb + ordering controls; Bloom has its own remaining column. */
.test2-information { --test2-tool-size: 28px; --test2-tool-gap: 16px; }
.test2-information[data-thumb] { --test2-tool-size: 44px; --test2-tool-gap: 4px; }
.test2-information .dock .table-row > .moves:is(:has(.test2-skip), :has(.kind)) {
  display: grid; grid-template-columns: minmax(44px, 1fr) repeat(2, var(--test2-tool-size));
  grid-template-rows: 44px; gap: var(--test2-tool-gap); align-items: center;
}
.test2-information[data-thumb='left'] .dock .table-row > .moves:is(:has(.test2-skip), :has(.kind)) { grid-template-columns: repeat(3, var(--test2-tool-size)); justify-content: start; }
.test2-information .dock .table-row > .moves > .kind { grid-column: 1; grid-row: 1; max-width: 100%; width: auto; justify-self: center; }
.test2-information .dock .table-row > .moves > .test2-skip {
  grid-column: 2 / 4; grid-row: 1; width: 100%; min-width: 0; max-width: none;
  height: var(--test2-tool-size) !important; min-height: var(--test2-tool-size) !important; margin: 0; padding: 0 6px;
  position: relative; box-sizing: border-box;
}
.test2-information:not([data-thumb]) .dock .table-row { grid-template-rows: 0 44px 28px minmax(20px, 1fr); row-gap: 4px; }
.test2-information:not([data-thumb]) .dock .table-row > .moves { grid-row: 2; }
.test2-information:not([data-thumb]) #test2-actions { grid-row: 3; justify-content: flex-end; }
.test2-information:not([data-thumb]) #moves > .test2-skip::after { content:''; position:absolute; inset:-8px; }
.test2-information #moves .bloom-options { max-height: min(50dvh, 320px); overflow-y: auto; }
.test2-information .test2-combination { max-width:100%; }
.test2-information .test2-mini-card { flex-shrink: 1; min-width: 8px; padding-inline: 0; }
.test2-information .pile-label { display: none; }
.test2-information #deck.coach-glow { box-shadow: none; }
.test2-information #discard.test2-bloom-draw .pile-top { border-color: var(--c-gold); }
.test2-information #discard.test2-bloom-draw .pile-card { box-shadow: 0 0 18px -4px color-mix(in srgb, var(--c-gold) 65%, transparent); }
.test2-information #discard.test2-bloom-draw .gd-halo { box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--c-gold) 70%, transparent), 0 0 24px 2px color-mix(in srgb, var(--c-gold) 60%, transparent); }
.test2-information #discard.test2-bloom-draw .gd-ring { border-color: color-mix(in srgb, var(--c-gold) 75%, transparent); }
.test2-information #hand .card.test2-throw-picked {
  filter: grayscale(1) !important; border-color: #dedede; box-shadow: none !important;
  transform: perspective(500px) rotate(var(--rot, 0deg)) translateY(calc(var(--dy, 0px) - 18px)) scale(1.31);
}
.test2-information[data-thumb] #hand .card.test2-throw-picked {
  transform: translate(var(--lx, 0px), var(--ly, 0px)) rotate(var(--rot, 0deg)) scale(1.31);
}
.test2-information #test2-information-subline {
  min-width: 0;
  width: 100%;
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.test2-information #test2-notice-slot { min-width: 0; width: 100%; text-align: center; }
.test2-information #test2-help-slot { min-width: 0; pointer-events: auto; }
.test2-information #test2-help-slot:empty { display: none; }
.test2-information #test2-notice-slot > :not([data-information-active='true']) { display: none !important; }
.test2-information #test2-notice-slot > [data-information-active='true'] {
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
.test2-information #test2-information-rail[data-notice-priority='routine'] #test2-notice-slot { opacity: .78; }
.test2-information #test2-notice-slot > .bad,
.test2-information #test2-notice-slot > #root-warn { color: var(--c-danger); }
.test2-information #test2-notice-slot > .good { color: var(--c-you); }
.test2-information #test2-notice-slot > #root-warn i { display: none; }
.test2-information body.paused #test2-information-rail,
.test2-information body.paused #step-cue { visibility: hidden; }

/* The box: one stable cockpit, with a centre display and a right action slot. */
html.test2-information .dock > #test2-box {
  --box-tools: 140px; --box-pile: 50px; --box-piles: calc(2 * var(--box-pile) + 8px);
  --hardware-grain:
    radial-gradient(circle at 2px 3px,rgba(240,229,200,.045) 0 .45px,transparent .7px) 0 0/11px 13px,
    radial-gradient(circle at 7px 8px,rgba(0,0,0,.10) 0 .45px,transparent .75px) 0 0/17px 19px,
    radial-gradient(ellipse 22px 8px at 13% 2%,rgba(220,205,170,.035),transparent 90%),
    radial-gradient(ellipse 17px 7px at 86% 99%,rgba(220,205,170,.025),transparent 90%);
  display: grid; position: relative; inset: auto; width: 100%; height: 104px;
  grid-template-columns: var(--box-piles) minmax(0, 1fr) var(--box-tools);
  grid-template-rows: 44px 44px; gap: 4px 6px; padding: 6px;
  box-sizing: border-box; border: 0; border-radius: 0; background: none; box-shadow: none; align-items: end;
  transition: grid-template-columns 240ms ease;
}
html.test2-information[data-step='draw'] .dock > #test2-box { --box-piles: 128px; }
html.test2-information[data-thumb] .dock > #test2-box {
  position: absolute; top: 8px; left: 4px; width: calc(100% - 8px);
  height: 122px; grid-template-rows: 44px 48px; align-content: end;
}
html.test2-information[data-thumb] .dock #test2-box > .moves {
  grid-template-rows: 44px 48px;
}
html.test2-information .dock #test2-box > .piles {
  display: flex; position: relative; grid-column: 1; grid-row: 1 / 3;
  gap: 8px; align-items: flex-end; justify-content: center; height: 100%;
  transform: translateX(var(--test2-draw-shift, 0px));
  /* Returning to Grow is immediate: an exiting pile must never sit over Skip. */
  transition: none;
}
html.test2-information[data-step='draw'] .dock #test2-box > .piles {
  gap: 18px; justify-content: flex-start;
  transition: transform 300ms cubic-bezier(.2,.8,.2,1), gap 240ms ease;
}
/* The Draw cockpit may visually overlap the empty Moves region on small phones.
   Its transparent group must not intercept the enlarged pile buttons. */
html.test2-information[data-step='draw'] .dock #test2-box > .moves { pointer-events: none; }
html.test2-information[data-step='draw'] .dock #test2-box > .moves > * { pointer-events: auto; }
html.test2-information .dock #test2-box > .piles > .pile {
  position: relative; inset: auto; grid-area: auto; width: var(--box-pile); height: 100%;
  margin: 0; flex: 0 0 var(--box-pile); min-width: 0;
  transform-origin: left bottom; transition: transform 240ms cubic-bezier(.18,.8,.25,1);
}
html.test2-information .dock #test2-box #deck .pile-stack { inset: 0; }
/* The face, halo and meter share one edge. Draw scales the whole instrument, including
   its two-digit meter, while the surrounding grid reserves the extra width. */
html.test2-information[data-step='draw'] .dock #test2-box > .piles > .pile.ready {
  transform: scale(1.16); animation: test2-draw-pile-breathe 1.8s ease-in-out 240ms infinite;
}
html.test2-information[data-thumb][data-step='draw'] .dock #test2-box > .piles > .pile.ready {
  transform: translateY(10px) scale(1.16);
}
@keyframes test2-draw-pile-breathe { 0%,100% { scale: 1; } 50% { scale: 1.035; } }
html.test2-information[data-step='draw'] .dock #test2-box .pile.ready .pile-card {
  transform: none; animation: none !important;
}
html.test2-information .dock #test2-box .gd-ring { display: none !important; }
html.test2-information .dock #test2-box .gd-halo {
  box-shadow: 0 0 24px 2px rgba(var(--gd-cream), .72);
}
html.test2-information .dock #test2-box #discard.test2-bloom-draw .gd-halo {
  box-shadow: 0 0 24px 2px color-mix(in srgb, var(--c-gold) 60%, transparent);
}
html.test2-information.reduce-motion .dock #test2-box > .piles > .pile.ready { animation: none; }
@media (prefers-reduced-motion: reduce) {
  html.test2-information .dock #test2-box > .piles > .pile.ready { animation: none; }
}
html.test2-information .dock #test2-box .pile-card {
  --pile-h: 71px; --cw: 50px; --ch: 71px; width: 50px; height: 71px;
}
html.test2-information .dock #test2-box .pile { justify-content: flex-start; }
html.test2-information .dock #test2-box .pile-meta {
  position: absolute; inset: auto auto 0 0; width: var(--box-pile);
  height: 18px; justify-self: stretch; pointer-events: none;
}
html.test2-information .dock #test2-box :is(#deck,#discard) .pile-meta .pile-count { position: absolute; inset: 0 auto auto 0; height: 18px; }
html.test2-information .dock #test2-box .pile-count.pile-meter {
  display: flex; align-items: center; justify-content: center; gap: 0; position: relative;
  width: 34px; min-width: 34px; height: 19px; padding: 1px 3px;
  border: 1px solid rgba(171,165,144,.64); border-radius: 2px 3px 3px 2px;
  background: var(--hardware-grain), linear-gradient(180deg,#23251f 0%,#101210 26%,#0b0d0b 60%,#20221d 100%);
  color: #e8e1cd;
  box-shadow: inset 0 1px 1px rgba(241,233,207,.16), inset 0 -2px 2px #050606, 0 1px 2px rgba(0,0,0,.55);
  font: 600 12px/15px var(--font-mono, ui-monospace, monospace);
  font-variant-numeric: tabular-nums; letter-spacing: 0; box-sizing: border-box;
}
html.test2-information .dock #test2-box .pile-count.pile-meter::after {
  content: ''; position: absolute; inset: 1px 2px; border-radius: 2px;
  background: linear-gradient(180deg,rgba(255,246,219,.08),transparent 35%,rgba(0,0,0,.16) 76%,rgba(255,244,215,.035));
  box-shadow: inset 0 0 3px rgba(0,0,0,.5); pointer-events: none;
}
html.test2-information .dock #test2-box .pile-meter-window {
  position: relative; display: block; flex: 0 0 11px; width: 11px; height: 15px;
  overflow: hidden; border-right: 1px solid rgba(181,173,146,.23);
  box-shadow: inset 0 0 2px rgba(0,0,0,.65);
}
html.test2-information .dock #test2-box .pile-meter-window:last-child { border-right: 0; }
html.test2-information .dock #test2-box .pile-meter-drum { position: absolute; top: 0; left: 0; width: 100%; height: 30px; }
html.test2-information .dock #test2-box .pile-meter-face {
  position: relative; display: grid; place-items: center; width: 100%;
  height: 15px; white-space: nowrap; font: inherit;
  text-shadow: 0 1px 1px #020303, 0 -1px rgba(255,250,225,.12);
  background: linear-gradient(180deg,rgba(197,187,153,.1),transparent 35%,rgba(0,0,0,.08) 80%);
}
html.test2-information .dock #test2-box #deck.low .pile-meter { color: var(--c-gold); }
html.test2-information .dock #test2-box > .moves {
  display: grid; position: static; inset: auto; grid-column: 2 / 4; grid-row: 1 / 3;
  width: 100%; height: 100%; min-height: 0; max-height: none;
  grid-template-columns: minmax(0, 1fr) var(--box-tools); grid-template-rows: 44px 44px;
  gap: 4px 6px; padding: 0; align-items: end; justify-content: stretch;
}
html.test2-information .dock #test2-box #moves > .kind {
  grid-column: 1; grid-row: 1 / 3; width: 100%; min-width: 0; max-width: 100%;
  height: 100%; min-height: 60px; padding: 4px 4px 6px; justify-self: stretch;
  display: flex; align-items: flex-end; justify-content: center;
  background: transparent; border: 0; outline: 0; box-shadow: none; border-radius: 0;
}
html.test2-information .dock #test2-box #moves > .kind:is(:hover,:focus-visible,.on) {
  background: transparent; box-shadow: none;
}
html.test2-information .dock #test2-box #moves > .kind:focus-visible {
  outline: 2px solid var(--c-accent); outline-offset: -2px;
}
html.test2-information .dock #test2-box #moves > :is(.test2-skip,.cancel,.empty-continue,.primary:not(.kind)) {
  grid-column: 2; grid-row: 1; justify-self: end; width: 92px; max-width: 100%;
  height: 44px !important; min-height: 44px !important; padding: 0 6px;
  margin: 0; border-radius: 6px; font-size: 13px;
}
html.test2-information .dock #test2-box #moves:has(> .cancel) > .test2-skip { display: none; }
html.test2-information .dock #test2-box #moves > .cancel { background: transparent; color: var(--c-muted); }
html.test2-information .dock #test2-box #moves > .test2-skip::after { display: none; }
html.test2-information .dock #test2-box #test2-actions {
  position: static; inset: auto; grid-column: 3; grid-row: 2;
  width: 140px; height: 44px; display: flex; justify-content: flex-end; gap: 4px; z-index: 4;
}
html.test2-information .dock #test2-box #test2-actions > .hand-slot {
  width: 44px; height: 44px; flex: 0 0 44px; inset: auto;
}
html.test2-information .dock #test2-box #test2-actions > .hand-slot::after { display: none; }
html.test2-information .dock #test2-box #test2-help-button[hidden] { display: grid; visibility: hidden; pointer-events: none; }
html.test2-information[data-thumb='left'] .dock #test2-box { grid-template-columns: var(--box-tools) minmax(0,1fr) var(--box-piles); }
html.test2-information[data-thumb='left'] .dock #test2-box > .piles { grid-column: 3; }
html.test2-information[data-thumb='left'] .dock #test2-box > .moves { grid-column: 1 / 3; grid-template-columns: var(--box-tools) minmax(0,1fr); }
html.test2-information[data-thumb='left'] .dock #test2-box #moves > .kind { grid-column: 2; }
html.test2-information[data-thumb='left'] .dock #test2-box #moves > :is(.test2-skip,.cancel,.empty-continue,.primary:not(.kind)) { grid-column: 1; justify-self: end; }
html.test2-information[data-thumb='left'] .dock #test2-box #test2-actions { grid-column: 1; justify-content: flex-start; }
html.test2-information .dock #test2-box #test2-actions .i { width: 20px; height: 20px; }
html.test2-information .dock #test2-box .test2-combination {
  display: flex; justify-content: center; flex-wrap: wrap; gap: 3px; max-width: 100%;
}
html.test2-information .dock #test2-box .test2-mini-card {
  flex: 0 0 20px; width: 20px; height: 34px; min-width: 20px; padding: 2px;
}
html.test2-information .dock #test2-box .test2-mini-card .c-num { font-size: 13px; }
html.test2-information .dock #test2-box .test2-mini-card .c-suit svg { width: 13px; height: 13px; }
html.test2-information .dock #test2-box #moves .bloom-toggle::after { display: none; }
html.test2-information .dock #test2-box #moves > .bloom-toggle::before {
  content: '⌄'; position: absolute; right: 3px; bottom: 0; color: var(--c-muted);
}
html.test2-information .dock #test2-box #moves > .bloom-toggle { position: relative; }
html.test2-information .dock #test2-box #moves .bloom-options {
  left: calc(var(--box-piles) + 6px); right: auto; bottom: calc(100% + 6px);
  width: max-content; min-width: 0; max-width: min(280px, calc(100% - var(--box-piles) - 12px));
  max-height: min(45dvh,320px); z-index: 8; padding: 8px; box-sizing: border-box;
}
html.test2-information[data-thumb='left'] .dock #test2-box #moves .bloom-options {
  left: 6px;
}
html.test2-information #board .badge.weak { display: none !important; }
html.test2-information #board .test2-boink { transform-box: fill-box; transform-origin: center; }
html.test2-information[data-step='throw'] #test2-box #deck {
  opacity: .48; filter: grayscale(.7); transition: opacity 160ms ease, filter 160ms ease;
}
html.test2-information[data-step='throw'] #test2-box #discard {
  filter: brightness(1.12); transition: filter 160ms ease;
}
html.test2-information[data-step='throw'] #discard .gd-halo {
  opacity: .62; transition: none;
  box-shadow: 0 0 0 1px rgba(218,104,80,.38), 0 0 22px 2px rgba(173,64,47,.32);
}
html.test2-information[data-step='throw'] #discard .gd-ring { animation: none !important; opacity: 0; }
html.test2-information #hand .card { touch-action: manipulation; }
/* A short edge light belongs to each card, and follows its fan rotation and lift. */
html.test2-information[data-step='grow'] #hand:not(.waiting) .card.playable:not(.dim) {
  box-shadow: 0 0 0 1px rgba(119,179,116,.22), 0 0 8px 1px rgba(88,158,89,.18), 0 5px 15px rgba(5,16,9,.30);
}
/* Scale is separate from the fan's rotate/translate, preserving its hit targets. */
@keyframes test2-card-breathe { 0%,100% { scale: 1; } 50% { scale: 1.055; } }
html.test2-information[data-step='grow'][data-test2-waiting='true'] #hand:not(.waiting) .card.playable:not(.lifted) {
  animation: test2-card-breathe 1.35s ease-in-out infinite;
}
html.test2-information[data-step='grow'][data-test2-waiting='true'] #moves > :is(.kind[data-kind^='bloom-'],.bloom-toggle):not(.on) .test2-combination {
  animation: test2-card-breathe 1.35s ease-in-out infinite;
}
html.test2-information[data-step='throw'] #hand:not(.waiting) .card:not(.test2-throw-picked) {
  opacity: .88; filter: grayscale(.54) brightness(.94);
  outline-color: rgba(223,105,77,.35) !important;
  box-shadow: 0 0 0 1px rgba(222,110,83,.29), 0 0 9px 1px rgba(186,66,47,.24), 0 5px 15px rgba(20,11,10,.34);
  animation: test2-card-breathe 1.35s ease-in-out infinite;
}
html.test2-information[data-step='throw'] #hand:not(.waiting) .card.test2-throw-picked {
  opacity: 1; box-shadow: 0 0 0 1px rgba(222,110,83,.35), 0 0 11px 1px rgba(186,66,47,.26) !important;
}
html.test2-information:is(.test2-move-active,.test2-information-blocked,.reduce-motion) #hand .card { animation: none !important; }
html.test2-information:is(.test2-move-active,.test2-information-blocked,.reduce-motion) #moves .test2-combination { animation: none !important; }
@media (prefers-reduced-motion: reduce) {
  html.test2-information #hand .card, html.test2-information #moves .test2-combination { animation: none !important; }
}

@media (prefers-reduced-motion: reduce) {
  .test2-information #step-cue { transition: none; }
  .test2-information #step-cue .cue-text.cue-text { animation: none !important; }
}
.test2-information.reduce-motion #step-cue { transition: none; }
.test2-information.reduce-motion #step-cue .cue-text.cue-text { animation: none !important; }

/* Shared cockpit hardware: a 44px touch target, compact matte face and quiet edge light. */
html.test2-information #test2-box {
  --control-size: 44px;
  --control-gap: 4px;
  --control-ivory: #f5edda;
  --control-amber: #c49658;
  --control-ember: #c96e5c;
}
html.test2-information .dock #test2-box #test2-actions {
  width: calc(3 * var(--control-size) + 2 * var(--control-gap));
  height: var(--control-size);
  gap: var(--control-gap);
}
html.test2-information .dock #test2-box #test2-actions > .hand-slot {
  width: var(--control-size); height: var(--control-size); flex-basis: var(--control-size);
}
html.test2-information .dock #test2-box #moves > :is(.test2-skip,.cancel,.empty-continue,.primary:not(.kind)).test2-hardware-control {
  width: var(--control-size); min-width: var(--control-size); max-width: var(--control-size);
  height: var(--control-size) !important; min-height: var(--control-size) !important;
  padding: 0; justify-self: end;
}
html.test2-information .dock #test2-box :is(#test2-actions > .hand-slot, #moves .test2-hardware-control) {
  display: grid; place-items: center; box-sizing: border-box;
  width: var(--control-size); height: var(--control-size); min-width: var(--control-size); min-height: var(--control-size);
  margin: 0; padding: 0; border: 1px solid rgba(201,198,186,.33); border-radius: 12px;
  background: var(--hardware-grain), linear-gradient(160deg,#262826 0%,#1c1e1d 42%,#141615 100%);
  color: var(--control-ivory); opacity: 1;
  box-shadow: inset 0 1px rgba(255,250,236,.07), inset 0 -2px rgba(0,0,0,.46), 0 2px 4px rgba(0,0,0,.38);
  text-decoration: none; touch-action: manipulation;
  transition: border-color .16s ease, box-shadow .16s ease, color .16s ease, opacity .16s ease, transform .12s ease;
}
html.test2-information .dock #test2-box :is(#test2-actions > .hand-slot, #moves .test2-hardware-control) :is(svg,.i) {
  display: block; width: 21px; height: 21px;
}
html.test2-information .dock #test2-box :is(#test2-actions > .hand-slot, #moves .test2-hardware-control):is(:hover,:focus-visible,[aria-pressed='true'],.on) {
  border-color: var(--control-amber); color: #fff1cf;
  box-shadow: inset 0 1px rgba(255,246,215,.14), inset 0 -2px rgba(0,0,0,.48), 0 0 0 1px rgba(196,150,88,.3), 0 0 12px rgba(196,150,88,.18);
}
html.test2-information .dock #test2-box :is(#test2-actions > .hand-slot, #moves .test2-hardware-control):focus-visible {
  outline: 2px solid #ffe1a7; outline-offset: 2px;
}
html.test2-information .dock #test2-box :is(#test2-actions > .hand-slot, #moves .test2-hardware-control):active:not(:disabled) {
  transform: translateY(1px) scale(.98);
}
html.test2-information .dock #test2-box #moves .test2-skip.test2-hardware-control {
  color: #c4c1b7; opacity: .77;
}
html.test2-information .dock #test2-box #moves .test2-control-clear { color: #d38c7c; }
html.test2-information .dock #test2-box #moves .test2-control-clear:is(:hover,:focus-visible) {
  border-color: var(--control-ember); color: #ed9b87;
  box-shadow: inset 0 1px rgba(255,246,215,.1), 0 0 0 1px rgba(201,110,92,.28), 0 0 12px rgba(201,110,92,.14);
}
html.test2-information .dock #test2-box :is(#test2-actions > .hand-slot, #moves .test2-hardware-control):disabled {
  opacity: .38; filter: grayscale(1); box-shadow: inset 0 1px rgba(255,255,255,.04), inset 0 -2px rgba(0,0,0,.4);
}
html.test2-information .dock #test2-box #moves .bloom-options .test2-hardware-control {
  display: inline-grid; vertical-align: middle; margin: 3px;
}
@media (prefers-reduced-motion: reduce) {
  html.test2-information .dock #test2-box :is(#test2-actions > .hand-slot, #moves .test2-hardware-control) { transition: none; }
}
`;

/** Mount after player enhancements (including mountGuide). No game state or settings change. */
export const mountInformation = () => {
  const root = document.documentElement;
  const game = document.getElementById('game');
  const wrap = document.getElementById('board-wrap');
  if (!IS_TEST2 || !game || !wrap || document.getElementById('test2-information-rail')) return;
  root.classList.add('test2-information');
  const cockpit = document.querySelector<HTMLElement>('#dock > .table-row');
  if (cockpit) { cockpit.id = 'test2-box'; cockpit.setAttribute('role', 'group'); cockpit.setAttribute('aria-label', 'Turn controls'); }
  const style = document.createElement('style');
  style.id = 'test2-information-style';
  style.textContent = INFORMATION_CSS;
  document.head.append(style);

  const rail = document.createElement('div');
  rail.id = 'test2-information-rail';
  const subline = document.createElement('div');
  subline.id = 'test2-information-subline';
  const notices = document.createElement('div');
  notices.id = 'test2-notice-slot';
  notices.setAttribute('role', 'status');
  notices.setAttribute('aria-live', 'polite');
  notices.setAttribute('aria-atomic', 'true');
  const help = document.createElement('div');
  help.id = 'test2-help-slot';
  subline.append(notices, help);
  rail.append(subline);
  wrap.append(rail);

  const cue = document.getElementById('step-cue');
  if (cue) wrap.append(cue);
  const cueText = cue?.querySelector<HTMLElement>('.cue-text');
  if (cueText) {
    const labels: Record<string, string> = { draw: 'Draw', grow: 'Grow', throw: 'Throw', opp: '' };
    const normalize = () => {
      const label = root.dataset.test2Bloom === 'true' && root.dataset.step === 'grow' ? 'Bloom' : labels[root.dataset.step ?? ''];
      if (label !== undefined && cueText.textContent !== label) cueText.textContent = label;
    };
    // The guide remains the sole phase source, including on resumed games. Its idle refresh
    // can refill the old Grow wording, so normalize just that presentation without a loop.
    new MutationObserver(normalize).observe(cueText, { childList: true, characterData: true, subtree: true });
    new MutationObserver(normalize).observe(root, { attributes: true, attributeFilter: ['data-step', 'data-test2-bloom'] });
    normalize();
  }
  // Guidance is a fallback, never the opening ceremony of a turn. One timer is reset by
  // real input, phase/turn readiness, menus and visibility; repeated renders don't postpone it.
  let idleTimer = 0;
  let held = false;
  let idleKey = '';
  const armPrompt = () => {
    clearTimeout(idleTimer);
    root.classList.remove('test2-idle-ready');
    if (held || document.hidden || game.hidden || root.dataset.test2Waiting !== 'true' ||
        root.classList.contains('test2-information-blocked') || document.body.classList.contains('paused')) return;
    idleTimer = window.setTimeout(() => root.classList.add('test2-idle-ready'), 3000);
  };
  const syncPrompt = () => {
    const key = [root.dataset.step, root.dataset.test2Turn, root.dataset.test2Waiting,
      root.dataset.test2Bloom, root.classList.contains('test2-information-blocked'),
      document.body.classList.contains('paused'), game.hidden].join(':');
    if (key !== idleKey) { idleKey = key; armPrompt(); }
  };
  new MutationObserver(syncPrompt).observe(root, { attributes: true, attributeFilter: ['class', 'data-step', 'data-test2-turn', 'data-test2-waiting', 'data-test2-bloom'] });
  new MutationObserver(syncPrompt).observe(game, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(syncPrompt).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('pointerdown', () => { held = true; armPrompt(); }, { capture: true, passive: true });
  for (const event of ['pointerup', 'pointercancel'] as const)
    window.addEventListener(event, () => { held = false; armPrompt(); }, { capture: true, passive: true });
  for (const event of ['keydown', 'click', 'wheel', 'pointermove'] as const)
    window.addEventListener(event, armPrompt, { capture: true, passive: true });
  window.addEventListener('blur', () => { held = false; clearTimeout(idleTimer); root.classList.remove('test2-idle-ready'); });
  window.addEventListener('focus', armPrompt);
  document.addEventListener('visibilitychange', armPrompt);
  syncPrompt();
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
  const announceChange = () => rail.dispatchEvent(new CustomEvent('test2-noticechange', { bubbles: true }));
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
