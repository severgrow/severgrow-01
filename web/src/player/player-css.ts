// Approved player layout and guidance; no Lab panel or Watch tools.
export const PLAYER_CSS = `
/* The game rests on darker felt; the menu keeps its own backdrop. */
html.futa04-information:has(#game:not([hidden])) #texture { filter:brightness(.92); }
html.futa04-information:has(#game:not([hidden])) #texture::before {
  display:block; opacity:.20;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.88' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .66  0 0 0 0 .64  0 0 0 0 .59  0 0 0 .52 -.21'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
html.futa04-information #game::before {
  content:''; position:fixed; inset:-12% -25%; pointer-events:none; z-index:8;
  background:radial-gradient(ellipse 43% 55% at 50% 48%,rgba(255,219,164,.11),transparent 78%);
  mix-blend-mode:screen; opacity:0; animation:futasaku-warm-pass 32s ease-in-out infinite;
}
@keyframes futasaku-warm-pass {
  0%,36%,100% { opacity:0; transform:translate3d(-5%,0,0); }
  53% { opacity:.32; transform:translate3d(0,0,0); }
  70% { opacity:0; transform:translate3d(5%,0,0); }
}
html.futa04-information #game .play { position:relative; isolation:isolate; }
html.futa04-information #game .play::before {
  content:''; position:absolute; inset:3% 2% 0; pointer-events:none; z-index:0;
  background:radial-gradient(ellipse 55% 58% at 48% 57%,rgba(0,0,0,.43),rgba(0,0,0,.14) 58%,transparent 84%);
  transform:translateY(22px); filter:blur(14px);
}
html.futa04-information #game .board-wrap,
html.futa04-information #game .dock { z-index:1; }
/* A quiet reflected edge beneath the map and short contact shadows beneath the hardware. */
html.futa04-information #game .board-wrap::before {
  content:''; position:absolute; inset:7% 4% 8%; pointer-events:none;
  background:radial-gradient(ellipse 56% 52% at 50% 50%,rgba(242,213,169,.035),transparent 80%);
}
html.futa04-information #game .dock::before {
  content:''; position:absolute; inset:0 2% 13%; pointer-events:none;
  background:radial-gradient(ellipse 27% 23% at 22% 27%,rgba(0,0,0,.26),transparent 85%),
             radial-gradient(ellipse 28% 23% at 79% 27%,rgba(0,0,0,.24),transparent 85%);
}
@media (prefers-reduced-motion:reduce) { html.futa04-information #game::before { animation:none; opacity:.025; transform:none; } }
html.futa04-information.reduce-motion #game::before { animation:none; opacity:.025; transform:none; }
/* ---- desktop (side layout): the coach and first-time tips get the empty space above the
   piles, at full size, instead of a squeezed strip over the deck. Test copy only for now:
   on docs/LIST-TO-IMPLEMENT.md to bring to the main game. ---- */
html[data-layout='side'] .dock-overlays {
  top: auto;
  bottom: calc(100% + 18px);
  left: 0;
  right: 0;
  height: auto;
  max-height: min(42vh, 360px);
  justify-content: flex-end;
}
html[data-layout='side'] .dock-overlays > .coach,
html[data-layout='side'] .dock-overlays > .first-tip {
  padding: 14px 16px 16px;
  font-size: 1rem;
  border-radius: 14px;
}
html[data-layout='side'] .dock-overlays > .coach:not([hidden]) {
  display: block;
}
html[data-layout='side'] .dock-overlays .coach-head {
  display: flex;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 0.95rem;
}
html[data-layout='side'] .dock-overlays .coach-head > .i,
html[data-layout='side'] .dock-overlays .coach-head > b {
  display: inline-flex;
}
html[data-layout='side'] .dock-overlays .coach-main {
  margin: 0;
  font-size: 1.15rem;
  line-height: 1.35;
  white-space: normal;
  overflow: visible;
}
html[data-layout='side'] .dock-overlays .tip {
  display: block;
  margin: 8px 0 0;
  font-size: 0.95rem;
  line-height: 1.4;
}
html[data-layout='side'] .dock-overlays #coach-why {
  font-size: 0.95rem;
  line-height: 1.4;
}
html[data-layout='side'] .dock-overlays .coach-actions {
  margin-top: 12px;
  gap: 8px;
}
html[data-layout='side'] .dock-overlays .coach-actions .btn {
  min-height: 40px;
  font-size: 0.95rem;
}
/* with the coach on, the dock sits low in its column so the coach has the room above it */
html[data-layout='side'] .dock:has(#coach:not([hidden])) {
  align-self: end;
  margin-bottom: 12px;
}
html[data-layout='side'] .dock:has(#coach:not([hidden])) .dock-overlays {
  max-height: calc(100vh - var(--dock-h, 360px) - 110px);
}

/* ---- the thumb layout (phones in portrait; logic/layout.ts computes every box): the hand as a
   curved fan up to the right edge, the piles in the lower left, no hint row ---- */
html[data-thumb] .dock {
  display: block;
  position: relative;
  height: var(--dock-h);
  padding: 0;
  overflow: visible;
}
html[data-thumb] .dock > .table-row,
html[data-thumb] .dock > .hand-row,
html[data-thumb] .dock .table-row > .piles {
  display: contents;
}
html[data-thumb] .dock .table-row > .hint-line,
html[data-thumb] #hint-btn {
  display: none;
}
html.futa04-information #hint-btn { display:none; }
html[data-thumb] .dock .table-row > .piles > .pile {
  position: absolute;
  left: var(--x);
  top: var(--y);
  width: var(--w);
  height: var(--h);
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
}
html[data-thumb] .dock .piles > .deck { --x: var(--t-deck-x); --y: var(--t-deck-y); --w: var(--t-deck-w); --h: var(--t-deck-h); }
html[data-thumb] .dock .piles > .discard { --x: var(--t-discard-x); --y: var(--t-discard-y); --w: var(--t-discard-w); --h: var(--t-discard-h); }
html[data-thumb] .dock .pile-card {
  --pile-h: var(--t-pile-h);
  width: var(--t-pile-w);
  height: var(--t-pile-h);
}
html[data-thumb] .dock .pile-meta {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
}
html[data-thumb] .dock .table-row > .moves {
  position: absolute;
  left: var(--t-moves-x);
  top: var(--t-moves-y);
  width: var(--t-moves-w);
  height: var(--t-moves-h);
  min-height: 0;
  max-height: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: flex-start;
  align-content: flex-start;
  gap: 4px 6px;
  overflow: visible;
  z-index: 3;
}
html[data-thumb] .dock .forecast-slot {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 100%;
}
/* the fan: every card placed on the arc and turned with it */
html[data-thumb] .dock .hand-row > .hand {
  position: absolute;
  inset: 0;
  height: auto;
  padding: 0;
  pointer-events: none;
  display: block;
}
html[data-thumb] .dock .hand-row > .hand .card,
html[data-thumb] .dock .hand-row > .hand .card:first-child {
  position: absolute;
  margin: 0;
  left: calc(var(--fx) - var(--cw) / 2);
  top: calc(var(--fy) - var(--ch) / 2);
  pointer-events: auto;
  transform: rotate(var(--rot, 0deg));
  transform-origin: 50% 50%;
}
html[data-thumb] .dock .hand-row > .hand .card.lifted {
  transform: translate(var(--lx, 0px), var(--ly, 0px)) rotate(var(--rot, 0deg)) scale(1.04);
}
html[data-thumb] .dock .hand-row > .hand .card:not(.lifted):hover {
  transform: rotate(var(--rot, 0deg));
}
/* Undo and Sort: icon-only, in the free corner under the arc (within the thumb's reach) */
html[data-thumb] .dock .hand-row > .hand-slot {
  position: absolute;
  margin: 0;
  width: var(--w);
  height: var(--h);
  left: var(--x);
  top: var(--y);
  z-index: 2;
}
html[data-thumb] .dock .hand-row > .undo-slot { --x: var(--t-undo-x); --y: var(--t-undo-y); --w: var(--t-undo-w); --h: var(--t-undo-h); }
html[data-thumb] .dock .hand-row > .hand-sort { --x: var(--t-sort-x); --y: var(--t-sort-y); --w: var(--t-sort-w); --h: var(--t-sort-h); }

/* the coach and first-time tips: just above the dock, over the board's lower-left edge (never over the cards) */
html[data-thumb] .dock-overlays {
  top: auto;
  bottom: calc(100% + 6px);
  left: var(--t-tips-x);
  right: auto;
  width: var(--t-tips-w);
  height: auto;
  max-height: var(--t-tips-h);
  justify-content: flex-start;
  z-index: 4;
}
html[data-thumb] .dock-overlays > .coach,
html[data-thumb] .dock-overlays > .first-tip {
  max-height: var(--t-tips-h);
}

html[data-thumb] .dock-overlays > .first-tip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  font-size: 0.85rem;
}
html[data-thumb] .dock-overlays > .coach {
  font-size: 0.85rem;
}

/* the idle tip: the step's words, large and faint over the board; never takes a tap */
.idle-tip {
  position: absolute;
  left: 50%;
  top: 20%;
  transform: translate(-50%, -50%);
  width: min(86%, 420px);
  text-align: center;
  font-size: 1.45rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--c-text);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.55);
  opacity: 0;
  pointer-events: none;
  z-index: 3;
  padding: 6px 12px;
  border-radius: 18px;
  transition: opacity 120ms ease-out;
}
.idle-tip.on {
  opacity: 0.4;
  transition: opacity 250ms ease-in;
}
/* a busy map: a very faint soft plate behind the words */
.idle-tip.busy {
  background: radial-gradient(closest-side, rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0));
}
.idle-tip.faint.on {
  opacity: 0.2;
}
.idle-tip.instant,
.idle-tip.instant.on {
  transition: none;
}
.thumb-settings h3 {
  margin-top: 4px;
}

/* ---- thumb layout v2 ---- */
/* v3: the piles' label under the card, the count as a small badge on the card's top corner */
html[data-thumb] .dock .table-row .pile-meta {
  position: static;
  display: block;
  text-align: center;
  line-height: 14px;
}
html[data-thumb] .dock .pile-label {
  font-size: 11px;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
html[data-thumb] .dock #deck .pile-meta .pile-count,
html[data-thumb] .dock #discard .pile-meta .pile-count {
  position: absolute;
  top: -6px;
  right: -4px;
  bottom: auto;
  left: auto;
  height: 18px;
  min-width: 20px;
  padding: 0 5px;
  line-height: 18px;
  font-size: 11px;
  text-align: center;
  border-radius: 9px;
  z-index: 2;
}
/* v3: the map sits low in its zone, at most 24pt above the cards */
html[data-thumb] .board-wrap {
  padding-bottom: var(--t-gap, 0px);
}
/* v3: one shared margin: the corner tools sit on the board zone's edges */
html[data-thumb] .ctool {
  margin: 0;
}
/* v3: the piles lying over the map are see-through too */
html[data-thumb][data-fan-over] .dock .table-row > .piles > .pile {
  opacity: 0.55;
  transition: opacity 120ms ease-out;
}
html[data-thumb][data-fan-over].fan-awake .dock .table-row > .piles > .pile {
  opacity: 1;
}
/* smart overlap: the board reaches under the fan's band (only where nothing is under a card) */
html[data-thumb][data-fan-over] .board-wrap {
  margin-bottom: calc(-1 * var(--t-overlap, 0px));
}
html[data-thumb] .dock {
  z-index: 2;
}
/* a fan lying over the map is see-through (55%) until I touch the fan or a card */
html[data-thumb][data-fan-over] .dock .hand-row > .hand .card {
  opacity: 0.55;
  transition: opacity 120ms ease-out;
}
html[data-thumb][data-fan-over].fan-awake .dock .hand-row > .hand .card,
html[data-thumb][data-fan-over] .dock .hand-row > .hand .card.lifted {
  opacity: 1;
}
/* the board taking a new size: a short crossfade */
.relayout-fade .board {
  animation: relayout-fade 220ms ease-out;
}
@keyframes relayout-fade {
  from {
    opacity: 0.35;
  }
}
.reduce-motion .relayout-fade .board {
  animation: none;
}
/* the move buttons: a fixed slot between the piles and Undo/Sort; compact; "Skip sprout" is a
   small pill, there only when it is useful */
html[data-thumb] .dock .table-row > .moves {
  align-content: center;
  align-items: center;
  justify-content: center;
}
html[data-thumb] .dock .table-row > .moves .btn {
  min-height: 36px;
  height: auto;
  padding: 4px 12px;
  font-size: 0.82rem;
  line-height: 1.15;
}
html[data-thumb] .dock .table-row > .moves .btn.skip {
  min-height: 32px;
  border: 1.5px solid var(--c-line);
  border-radius: 16px;
  background: var(--c-surface);
  text-decoration: none;
  padding: 2px 12px;
}

/* ---- the smart camera: edge arrows and the "Whole map" pill ---- */
/* zoomed in: the map stays inside its own area */
.cam-zoomed .board {
  overflow: hidden;
}
.cam-arrows {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 4;
}
.cam-arrow {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  padding: 0;
  pointer-events: auto;
  display: grid;
  place-items: center;
  color: var(--c-you);
}
.cam-arrow.bot {
  color: var(--c-bot);
}
.cam-arrow i {
  position: absolute;
  width: 14px;
  height: 14px;
  border-top: 3px solid currentColor;
  border-right: 3px solid currentColor;
  border-radius: 2px;
  transform: rotate(calc(var(--a) + 45deg)) translate(2px, -2px);
  opacity: 0.8;
}
.cam-arrow span {
  position: absolute;
  transform: translate(calc(cos(var(--a)) * -16px), calc(sin(var(--a)) * -16px));
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: color-mix(in srgb, currentColor 85%, transparent);
  color: var(--c-bg);
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
.cam-whole {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 4;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--c-line) 80%, transparent);
  background: color-mix(in srgb, var(--c-bg) 70%, transparent);
  color: var(--c-text);
  font: inherit;
  font-size: 0.8rem;
}

/* ---- slim header: only the menu button and the score bar (the rest is in the menu) ---- */
html.slim-hud .game > .hud {
  grid-template-columns: 44px minmax(0, 1fr);
  border-bottom: 0;
  padding: 0 6px;
}
html.slim-hud .game > .hud > .score,
html.slim-hud .game > .hud > .turn,
html.slim-hud .game > .hud > #hud-history {
  display: none;
}
html.slim-hud .game > .hud {
  grid-column: 1;
  /* the menu button at the screen's left edge on wide screens too (the bar starts after it) */
  max-width: none;
  justify-self: stretch;
}
html.slim-hud .game > .race {
  grid-row: 1;
  grid-column: 1;
  z-index: 1;
  align-self: center;
  height: 10px;
  margin: 0 16px 0 60px;
  pointer-events: none;
}
html.slim-hud .game > .race .race-fill {
  height: 6px;
  border-radius: 3px;
  opacity: 0.9;
}
html.slim-hud .game > .race .race-fill::after {
  top: -3px;
  height: 12px;
}
/* the menu: the scores and the turn on top (no player marks: the colours say who is who) */
.gm-status {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding-bottom: 12px;
  margin-bottom: 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--c-line) 70%, transparent);
}
.gm-scores {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.gm-scores > span {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.gm-scores b {
  font-size: 2rem;
  line-height: 1;
}
.gm-scores small {
  font-size: 0.95rem;
  opacity: 0.85;
}
.gm-you b {
  color: var(--c-you);
}
.gm-bot b {
  color: var(--c-bot);
}
.gm-turn {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
}
.gm-turn b {
  font-size: 1.05rem;
}
.gm-turn.you b {
  color: var(--c-you);
}
.gm-turn.bot b {
  color: var(--c-bot);
}
.gm-turn small {
  opacity: 0.8;
}

/* ---- thumb dock v4: the move buttons stacked in the middle of the control row ---- */
html[data-thumb] .dock .table-row > .moves {
  flex-direction: column;
  flex-wrap: nowrap;
  justify-content: center;
  align-items: stretch;
  align-content: center;
  gap: 8px;
}
html[data-thumb] .dock .table-row > .moves .btn,
html[data-thumb] .dock .table-row > .moves .btn.skip {
  width: 100%;
  min-height: 40px;
  max-width: 200px;
  align-self: center;
  margin: 0;
  padding: 4px 10px;
  font-size: 0.88rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
html[data-thumb] .dock .table-row > .moves .btn.skip {
  border-radius: 20px;
}
html[data-thumb] .dock .pile-label {
  font-size: 12px;
}

/* ---- the map runs on under the cards (phones): faded, the focus decides how much ---- */
html[data-thumb] .board-wrap {
  --cam-under: var(--dock-h, 0px);
  margin-bottom: calc(-1 * var(--dock-h, 0px));
}
/* Short phones can use the clear space between the header controls. Extend the camera's
   window, not the hex geometry, until the map shares the cockpit's small side margins. */
@media (max-width:600px) and (min-aspect-ratio:53/100) {
  html.futa04-information[data-thumb] #game .board-wrap {
    margin-top:calc(-1 * var(--hud-h,44px));
    margin-bottom:calc(-1 * var(--dock-h,0px) - clamp(8px,calc(70vw - 244px),32px));
  }
}
html[data-thumb] .board {
  overflow: hidden;
}
.cam-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(var(--cam-under, 0px) + 36px);
  background: linear-gradient(to bottom, color-mix(in srgb, var(--c-bg) 0%, transparent), var(--c-bg) 36px);
  opacity: 0;
  pointer-events: none;
  z-index: 1;
  transition: opacity 220ms ease-out;
}
/* choosing a card (or drawing, or throwing): the cards are clear, the map behind them faint */
html.cam-under .cam-fade {
  opacity: 0.6;
}
/* working on the map (a card picked, painting, the opponent playing, a finger on the map): the
   map behind shows more and the cards and piles step back until touched */
html.cam-under[data-focus='map'] .cam-fade,
html.cam-under.cam-touch .cam-fade {
  opacity: 0.15;
}
html[data-thumb] .dock .hand-row > .hand .card,
html[data-thumb] .dock .table-row > .piles > .pile,
html[data-thumb] .dock .hand-row > .hand-slot {
  transition: opacity 220ms ease-out;
}
html.cam-under[data-focus='map']:not(.fan-awake) .dock .hand-row > .hand .card:not(.lifted),
html.cam-under.cam-touch:not(.fan-awake) .dock .hand-row > .hand .card:not(.lifted),
html.cam-under[data-focus='map']:not(.fan-awake) .dock .table-row > .piles > .pile,
html.cam-under[data-focus='map']:not(.fan-awake) .dock .hand-row > .hand-slot {
  opacity: 0.6;
}
.reduce-motion .cam-fade,
.reduce-motion html[data-thumb] .dock .hand-row > .hand .card {
  transition: none;
}

/* ---- step guidance (test copy): a crafted plate on the map when a step starts; the step's
   controls as the hero. Only transform and opacity move (plus the words' tracking as they enter). ---- */
:root {
  --gd-cream: 243, 230, 196;
}
.step-cue {
  position: absolute;
  left: 50%;
  top: 40px;
  transform: translate(-50%, -50%);
  z-index: 3;
  pointer-events: none;
  opacity: 0;
  transition: opacity 100ms ease-out;
  --cue-c: var(--gd-cream);
}
.step-cue[data-step='grow'] {
  --cue-c: 140, 214, 150;
}
.step-cue[data-step='opp'] {
  --cue-c: 240, 132, 96;
}
.step-cue[data-level='hi'] {
  opacity: 1;
  transition: opacity 240ms ease-out;
}
.step-cue[data-level='lo'] {
  opacity: 0.72;
  transition: opacity 1100ms ease-in-out;
}
.step-cue.faint:not([data-level='off']) {
  opacity: 0.45;
}
html[data-guide='off'] .step-cue {
  display: none;
}
/* the plate: smoked glass with a fine warm rim, a soft drop and an inner highlight */
.cue-plate {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px 7px 7px;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0) 55%),
    rgba(17, 19, 17, 0.62);
  -webkit-backdrop-filter: blur(10px) saturate(1.25);
  backdrop-filter: blur(10px) saturate(1.25);
  box-shadow:
    0 0 0 1px rgba(var(--cue-c), 0.22),
    0 10px 28px -8px rgba(0, 0, 0, 0.6),
    0 2px 6px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  white-space: nowrap;
  overflow: hidden;
}
/* one soft pass of light across the plate as it arrives */
.cue-plate::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 30%, rgba(var(--cue-c), 0.22) 48%, rgba(255, 255, 255, 0.18) 50%, transparent 66%);
  transform: translateX(-110%);
  pointer-events: none;
}
.step-cue.enter .cue-plate::after {
  animation: cue-sweep 900ms cubic-bezier(0.4, 0, 0.2, 1) 160ms 1 both;
}
@keyframes cue-sweep {
  to {
    transform: translateX(110%);
  }
}
.step-cue.enter .cue-plate {
  animation: cue-enter 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes cue-enter {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
/* the icon: a small lit medallion in the step's colour */
.cue-icon {
  position: relative;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: rgb(var(--cue-c));
  background: radial-gradient(circle at 50% 35%, rgba(var(--cue-c), 0.3), rgba(var(--cue-c), 0.08) 70%);
  box-shadow: inset 0 0 0 1px rgba(var(--cue-c), 0.4), 0 0 14px -2px rgba(var(--cue-c), 0.45);
}
.cue-icon svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.cue-icon::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 50%;
  box-shadow: 0 0 16px 1px rgba(var(--cue-c), 0.55);
  opacity: 0;
  animation: cue-glow 2.4s ease-in-out infinite;
}
@keyframes cue-glow {
  0%,
  100% {
    opacity: 0.15;
  }
  50% {
    opacity: 0.6;
  }
}
.cue-words {
  display: flex;
  flex-direction: column;
  line-height: 1.05;
  gap: 2px;
}
.cue-kicker {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(var(--cue-c), 0.75);
}
.cue-text {
  font-family: var(--font-display, inherit);
  font-size: 17px;
  font-weight: 650;
  letter-spacing: 0.01em;
  color: #f6f1e4;
}
.step-cue.enter .cue-text {
  animation: cue-track 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes cue-track {
  from {
    letter-spacing: 0.12em;
    opacity: 0.4;
  }
  to {
    letter-spacing: 0.01em;
    opacity: 1;
  }
}
/* three step pips: done (soft), now (lit, breathing), next (hollow) */
.cue-pips {
  display: flex;
  gap: 5px;
  margin-left: 4px;
  padding-left: 11px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  align-self: stretch;
  align-items: center;
}
.cue-pips i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1.2px rgba(255, 255, 255, 0.32);
}
.step-cue[data-step='opp'] .cue-pips {
  display: none;
}
.step-cue[data-step='grow'] .cue-pips i[data-p='draw'],
.step-cue[data-step='throw'] .cue-pips i[data-p='draw'],
.step-cue[data-step='throw'] .cue-pips i[data-p='grow'] {
  background: rgba(255, 255, 255, 0.4);
  box-shadow: none;
}
.step-cue[data-step='draw'] .cue-pips i[data-p='draw'],
.step-cue[data-step='grow'] .cue-pips i[data-p='grow'],
.step-cue[data-step='throw'] .cue-pips i[data-p='throw'] {
  background: rgb(var(--cue-c));
  box-shadow: 0 0 8px rgba(var(--cue-c), 0.8);
  animation: cue-pip 2.4s ease-in-out infinite;
}
@keyframes cue-pip {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.25);
  }
}
html[data-guide='subtle'] .cue-icon::after,
html[data-guide='subtle'] .cue-pips i {
  animation: none !important;
}

/* the piles' effects: a cream halo and one ring (never take a tap) */
.gd-fx {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}
.gd-halo,
.gd-ring {
  position: absolute;
  inset: -1px;
  border-radius: calc(var(--radius, 12px) * 0.6);
  opacity: 0;
  transition: opacity 110ms ease-out;
}
.gd-halo {
  box-shadow:
    0 0 0 1.5px rgba(var(--gd-cream), 0.7),
    0 0 27px 2px rgba(var(--gd-cream), 0.75);
}
.gd-ring {
  border: 2px solid rgba(var(--gd-cream), 0.75);
}
html[data-guide='subtle'] .gd-fx {
  opacity: 0.5;
}
html[data-guide='subtle'] .gd-ring {
  display: none;
}
html[data-guide='off'] .gd-fx {
  display: none;
}
/* tired eyes: after 6s of waiting the pulses run at half strength (back after 10s of rest) */
html.gd-tired .gd-fx {
  opacity: 0.5;
}
html.gd-tired[data-guide='subtle'] .gd-fx {
  opacity: 0.25;
}

/* DRAW: both piles are the hero; the hand steps back to 75%; the board stays as it is */
html[data-step='draw']:not([data-guide='off']) .pile.ready .gd-halo {
  opacity: 1;
  animation: gd-halo 1.6s ease-in-out infinite;
}
html[data-step='draw']:not([data-guide='off']) .pile.ready .pile-card {
  animation: gd-lift 1.6s ease-in-out infinite;
}
html[data-step='draw']:not([data-guide='off']) .pile.ready .gd-ring {
  animation: gd-ring 2.5s ease-out infinite;
}
html[data-step='draw']:not([data-guide='off']) .hand .card,
html[data-step='draw']:not([data-guide='off']) .dock .hand-row > .hand .card.dim {
  opacity: 0.75;
}
@keyframes gd-halo {
  0%,
  100% {
    opacity: 0.75;
  }
  50% {
    opacity: 1;
  }
}
@keyframes gd-lift {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-4px) scale(1.04);
  }
}
@keyframes gd-ring {
  0% {
    opacity: 0.7;
    transform: scale(1);
  }
  70% {
    opacity: 0;
    transform: scale(1.28);
  }
  100% {
    opacity: 0;
    transform: scale(1.28);
  }
}

/* THROW: every card faintly lit; the throw pile is the target; the deck steps back */
html[data-step='throw']:not([data-guide='off']) .hand .card {
  outline: 1.5px solid rgba(var(--gd-cream), 0.32);
  outline-offset: 0;
}
html[data-step='throw']:not([data-guide='off']) #discard .gd-halo {
  opacity: 0.6;
}
html[data-step='throw']:not([data-guide='off']) #discard .gd-ring {
  animation: gd-ring 2.5s ease-out infinite;
}
html.gd-picked[data-step='throw']:not([data-guide='off']) #discard .gd-halo {
  opacity: 1;
}
html[data-step='throw']:not([data-guide='off']) #deck {
  opacity: 0.45;
}

/* the opponent's turn: calm; piles and hand at 70%, nothing pulses */
html[data-step='opp']:not([data-guide='off']) .dock .pile,
html[data-step='opp']:not([data-guide='off']) .hand .card {
  opacity: 0.7;
}
html[data-step='opp']:not([data-guide='off']) .pile .pile-card {
  animation: none;
}

/* the old pile hints under the piles: the highlight says it now */
html:not([data-guide='off']) .pile-hint {
  visibility: hidden;
}

html.reduce-motion .step-cue *,
html.reduce-motion .step-cue *::after,
html.reduce-motion .pile.ready .pile-card,
html.reduce-motion .gd-halo,
html.reduce-motion .gd-ring {
  animation: none !important;
}
html.reduce-motion .gd-ring {
  display: none;
}
/* Large text: the stacked move buttons keep the whole name (a little smaller, two lines if needed) */
html.large-text[data-thumb] .dock .table-row > .moves .btn,
html.large-text[data-thumb] .dock .table-row > .moves .btn.skip {
  font-size: 0.8rem;
  padding: 3px 6px;
  white-space: normal;
  line-height: 1.05;
  text-overflow: clip;
}

/* When the phone board has no tall free area, retain the full tip beside its button. */
html[data-thumb] .dock-overlays > .first-tip.teaching-compact {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 8px;
  row-gap: 0;
  padding: 8px;
  align-items: center;
}
html[data-thumb] .first-tip.teaching-compact > :not(#first-tip-ok) { grid-column: 1; }
html[data-thumb] .first-tip.teaching-compact #first-tip-ok { grid-column: 2; grid-row: 1 / span 2; }
html[data-thumb] .first-tip.teaching-compact #first-tip-text { margin: 0; font-size: 0.8rem; line-height: 1.2; }
`;
