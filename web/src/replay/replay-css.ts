// The replay's chrome (owner brief, 2026-10-25): "board only … keep it minimal and BEAUTIFUL — the
// game's dark glass, the logo, the names, the scrub bar, nothing else. Make it look shareable."
//
// One poster-shaped surface: the two names and the score across the top, the board in the middle,
// the scrub bar and the FUTASAKU mark at the bottom (where a share control can later sit beside the
// mark without moving anything). Everything is the game's own ink and glass; nothing is a new
// language. No cockpit, no hand, no cards, no guidance — by construction there is no markup for them.
export const REPLAY_CSS = `
#replay {
  --rp-ink: #f0e9dc;
  --rp-dim: rgba(240, 233, 220, .62);
  --rp-faint: rgba(240, 233, 220, .34);
  --rp-line: rgba(233, 216, 173, .16);
  --rp-me: var(--c-you, #7fcf8d);
  --rp-opp: var(--c-bot, #ff6b4a);
  position: fixed;
  inset: 0;
  z-index: 64;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: calc(env(safe-area-inset-top, 0px) + 10px) calc(env(safe-area-inset-right, 0px) + 14px)
           calc(env(safe-area-inset-bottom, 0px) + 10px) calc(env(safe-area-inset-left, 0px) + 14px);
  color: var(--rp-ink);
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(52, 58, 44, .55) 0%, rgba(9, 11, 10, .97) 58%, #070908 100%),
    #070908;
  font: 400 13px/1.4 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
}
#replay[hidden] { display: none !important; }
/* The whole surface is the pause target; the controls below opt out of it. The stage is the poster:
   one centred column, so the names, board and scrub bar share an edge on a wide screen. */
#replay .rp-stage {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 6px;
  width: 100%;
  max-width: 940px;
  margin: 0 auto;
  cursor: pointer;
}

/* ---------- the match-up line ---------- */
#replay .rp-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 0 2px 2px;
}
#replay .rp-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 12.5px/1.2 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--rp-dim);
  transition: color 220ms ease;
}
#replay .rp-name[data-seat='0'] { text-align: left; color: var(--rp-me); }
#replay .rp-name[data-seat='1'] { text-align: right; color: var(--rp-opp); }
#replay .rp-name[data-live='1'] { color: var(--rp-ink); }
#replay .rp-score {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font: 700 21px/1 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  font-variant-numeric: tabular-nums;
  letter-spacing: .02em;
}
#replay .rp-score .rp-dash { font-size: 13px; color: var(--rp-faint); font-weight: 400; }

/* ---------- the one quiet line that names the turn ---------- */
#replay .rp-turn {
  margin: 0;
  min-height: 17px;
  text-align: center;
  font: 500 12px/1.2 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--rp-dim);
  font-variant-numeric: tabular-nums;
}
#replay .rp-turn b { font-weight: 700; color: var(--rp-ink); }
#replay .rp-turn[data-seat='0'] b { color: var(--rp-me); }
#replay .rp-turn[data-seat='1'] b { color: var(--rp-opp); }
/* ONE beat per hand-over: the line settles in from 4px, then rests. Never a loop. */
#replay .rp-turn[data-change='1'] { animation: rp-turn-in 300ms cubic-bezier(.22, .72, .24, 1) both; }
@keyframes rp-turn-in {
  from { opacity: .25; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}

/* ---------- the board ---------- */
#replay .rp-board {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 2px 0 4px;
}
#replay .rp-board svg {
  display: block;
  width: 100%;
  height: 100%;
  max-width: min(100%, 860px);
  max-height: 100%;
  overflow: visible;
}
/* The replay board is a picture: it takes no taps of its own. */
#replay .rp-board svg .hex-cell { pointer-events: none; }
#replay .rp-ghost-layer { pointer-events: none; }

/* ---------- the controls ---------- */
#replay .rp-scrub-wrap { position: relative; }
/* THE TURNING-POINT NOTCH: a marked beat on the bar, shaped like the existing ticks but one step
   brighter and taller. The button is 2px of ink; its pseudo-element is the 44px touch target, so
   the notch never shifts the bar or needs footer space on a 320px phone. */
#replay .rp-notch {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 44px;
  left: var(--rp-tp, 0%);
  translate: -50% -50%;
  padding: 0;
  border: 0;
  background: none;
  color: var(--rp-ink);
  cursor: pointer;
  z-index: 2;
}
#replay .rp-notch::after { content: ''; position: absolute; inset: 0 -21px; }
#replay .rp-notch::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2px;
  height: 15px;
  translate: -50% -50%;
  border-radius: 1px;
  background: currentColor;
  opacity: .78;
  box-shadow: 0 1px 0 rgba(0, 0, 0, .35);
  transition: height 140ms ease, opacity 140ms ease;
}
#replay .rp-notch[hidden] { display: none !important; }
#replay .rp-notch[data-at='1']::before { height: 21px; opacity: 1; }
#replay .rp-notch:focus-visible { outline: none; }
#replay .rp-notch:focus-visible::before { box-shadow: 0 0 0 3px rgba(233, 216, 173, .7); }
#replay .rp-scrub {
  position: relative;
  /* The replay's primary drag target. It was 30px tall — a thumb target only by luck. */
  height: 44px;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
  --rp-pct: 0%;
}
#replay .rp-track {
  position: relative;
  width: 100%;
  height: 3px;
  border-radius: 2px;
  background: rgba(240, 233, 220, .16);
  overflow: hidden;
}
#replay .rp-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--rp-pct);
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(182, 204, 139, .5), rgba(233, 216, 173, .92));
}
/* One hair per hand-over, so the eye can see the rhythm of the match before dragging. */
#replay .rp-tick {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 1px;
  background: rgba(240, 233, 220, .3);
}
#replay .rp-tick[data-seat='0'] { background: color-mix(in srgb, var(--rp-me) 55%, transparent); }
#replay .rp-tick[data-seat='1'] { background: color-mix(in srgb, var(--rp-opp) 55%, transparent); }
#replay .rp-knob {
  position: absolute;
  top: 50%;
  left: var(--rp-pct);
  width: 15px;
  height: 15px;
  margin: -7.5px 0 0 -7.5px;
  border-radius: 50%;
  background: #f4ecdb;
  box-shadow: 0 1px 6px rgba(0, 0, 0, .5), 0 0 0 3px rgba(233, 216, 173, .18);
  pointer-events: none;
}
#replay .rp-scrub:focus-visible { outline: none; }
#replay .rp-scrub:focus-visible .rp-knob { box-shadow: 0 0 0 3px rgba(233, 216, 173, .75); }

#replay .rp-foot {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 0 2px;
  min-height: 34px;
}
#replay .rp-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 400 10.5px/1.3 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--rp-faint);
  font-variant-numeric: tabular-nums;
}
/* The footer's right-hand slot holds the one mark; the share key sits immediately beside it. */
#replay .rp-actions { display: flex; align-items: center; gap: 8px; }
/* One quiet icon: the same ink and the same 44px target as the buttons, with no plate of its own. */
#replay .rp-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 11px;
  background: none;
  color: var(--rp-dim);
  cursor: pointer;
  transition: color 160ms ease, opacity 160ms ease;
}
#replay .rp-icon svg { display: block; width: 17px; height: 17px; }
#replay .rp-icon:hover { color: var(--rp-ink); }
#replay .rp-icon:focus-visible { outline: 2px solid #e8ddc9; outline-offset: 2px; }
#replay .rp-icon[aria-busy='true'] { opacity: .55; cursor: default; }
#replay .rp-btn {
  min-height: 44px;
  padding: 0 13px;
  border: 1px solid var(--rp-line);
  border-radius: 11px;
  background: rgba(255, 255, 255, .05);
  color: var(--rp-ink);
  font: 500 11.5px/1 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  letter-spacing: .12em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
}
#replay .rp-btn:focus-visible { outline: 2px solid #e8ddc9; outline-offset: 2px; }
#replay .rp-btn[hidden] { display: none !important; }
#replay .rp-brand {
  display: block;
  height: 18px;
  width: auto;
  max-width: 76px;
  opacity: .72;
  pointer-events: none;
}
#replay .rp-brand[hidden] { display: none !important; }
/* Replay again arrives with the result, on the plate's own beat. */
#replay[data-ended='1'] .rp-btn[data-rp='again'] { animation: rp-again-in 260ms cubic-bezier(.22, .72, .24, 1) both; }
@keyframes rp-again-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }

/* Paused: the whole picture goes quiet rather than showing a badge, and the clock line says so. */
#replay[data-paused='1'] .rp-board { opacity: .82; transition: opacity 160ms ease; }
#replay[data-paused='1'] .rp-meta::after { content: ' · paused'; color: var(--rp-dim); }

/* The tightest portrait phone (320px): the footer keeps its one row. The share key joins the
   mark, so the two text keys give back a little padding and tracking — never a 44px target. */
@media (max-width: 380px) {
  #replay .rp-foot { gap: 6px; }
  #replay .rp-actions { gap: 4px; }
  #replay .rp-btn { min-height: 44px; padding: 0 8px; font-size: 10.5px; letter-spacing: .08em; }
  #replay .rp-brand { max-width: 46px; }
}

/* A phone in landscape or a short window: tighten the chrome, never the board. */
@media (max-height: 560px) {
  #replay { padding-top: calc(env(safe-area-inset-top, 0px) + 5px); padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 5px); }
  #replay .rp-score { font-size: 18px; }
  #replay .rp-turn { display: none; }
  #replay .rp-scrub { height: 44px; }
}

/* Reduce motion (setting or OS): no settle, no crossfade — the board simply is the next position. */
.reduce-motion #replay .rp-turn[data-change='1'],
.reduce-motion #replay[data-ended='1'] .rp-btn[data-rp='again'] { animation: none !important; }
.reduce-motion #replay .rp-board { transition: none !important; }
@media (prefers-reduced-motion: reduce) {
  #replay .rp-turn[data-change='1'],
  #replay[data-ended='1'] .rp-btn[data-rp='again'] { animation: none !important; }
  #replay .rp-board { transition: none !important; }
}
`;
