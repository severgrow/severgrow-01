// The Lab (test copy only): its styles, added to the page when the Lab loads.
export const LAB_CSS = `
/* The Lab (test copy only). One column, big touch targets, plain words. */
.lab-sheet { max-height: 92dvh; }
.lab-body { display: flex; flex-direction: column; gap: 6px; padding-bottom: 12px; }
.lab-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; flex-wrap: wrap; }
.lab-row > span { flex: 1 1 auto; }
.lab-row input[type='range'] { flex: 1 1 100%; min-height: 32px; accent-color: var(--c-accent, #6a9a4a); }
.lab-row select, .lab-row input[type='text'] { min-height: 44px; font: inherit; padding: 0 10px; border-radius: 10px; border: 1.5px solid var(--c-line); background: var(--c-bg); color: inherit; max-width: 60%; }
.lab-check input { width: 28px; height: 28px; }
.lab-buttons { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.lab-buttons .btn { min-height: 48px; }
.lab-buttons .lab-design { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; letter-spacing: 0.08em; border-style: dashed; }
#menu .menu-design { border-style: dashed; letter-spacing: 0.06em; }
.lab-buttons .lab-design small { font-size: 11px; font-weight: 500; letter-spacing: 0; opacity: 0.75; }
.lab-preview-wrap { display: flex; justify-content: center; padding: 8px 0; }
.lab-preview { width: 100%; max-width: 360px; max-height: 300px; }
.lab-preview polygon { stroke: var(--c-bg); stroke-width: 0.08; }
.lp-open { fill: color-mix(in srgb, var(--c-text) 22%, transparent); }
.lp-rock { fill: #5b5650; }
.lp-gold { fill: #e0b440; }
.lp-me { fill: #4f9a45; }
.lp-opp { fill: #c4533a; }
.lab-legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: -1px; margin-left: 6px; }
.lab-legend i.lp-me { background: #4f9a45; }
.lab-legend i.lp-opp { background: #c4533a; }
.lab-legend i.lp-rock { background: #5b5650; }
.lab-legend i.lp-gold { background: #e0b440; }
.lab-warnings { margin: 0; padding-left: 20px; color: #b4572e; font-size: 0.9rem; }
.lab-link-note { padding: 12px; border-radius: 12px; border: 1.5px solid var(--c-line); display: flex; flex-direction: column; gap: 8px; }
.lab-line { text-align: center; margin-top: 10px; opacity: 0.85; }
.lab-line .lab-back { min-height: 40px; margin-left: 6px; }
.lab-reset-view { position: absolute; left: 8px; bottom: 8px; z-index: 3; min-height: 40px; padding: 0 12px; border-radius: 20px; border: 1.5px solid var(--c-line); background: var(--c-surface); color: inherit; font: inherit; }
.lab-thinking { position: fixed; top: 64px; left: 50%; transform: translateX(-50%); z-index: 9; padding: 6px 14px; border-radius: 16px; background: var(--c-surface); border: 1.5px solid var(--c-line); font-size: 0.9rem; opacity: 0.9; pointer-events: none; }
.lab-watchbar { position: fixed; left: 50%; transform: translateX(-50%); top: calc(env(safe-area-inset-top) + 56px); z-index: 9; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px 8px; padding: 4px 8px; font-size: 0.8rem; max-width: calc(100vw - 32px); border-radius: 16px; background: var(--c-surface); border: 1.5px solid var(--c-line); box-shadow: 0 4px 18px rgba(0,0,0,0.3); }
.lab-watchbar .btn { min-height: 40px; padding: 0 12px; }
.lab-watchbar > span { width: 100%; text-align: center; }
.lab-speed { display: flex; border: 1.5px solid var(--c-line); border-radius: 12px; overflow: hidden; }
.lab-speed button { min-height: 40px; min-width: 52px; border: 0; background: transparent; color: inherit; font: inherit; }
.lab-speed button.on { background: var(--c-line); font-weight: 700; }
/* while watching, my seat is not mine: no taps on the board, hand or piles */
body.lab-watching #board-wrap, body.lab-watching #hand, body.lab-watching .dock { pointer-events: none; }
body.lab-watching .dock { opacity: 0.55; }

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
`;
