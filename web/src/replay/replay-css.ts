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
/* WHOSE MOVE, without a sentence (owner, 2026-10-26): the mover's name is lit and carries one small
   pip in their own ink, on the inner side, toward the score. It moves on the hand-over and nowhere else. */
#replay .rp-name::after,
#replay .rp-name::before { content: none; }
#replay .rp-name[data-seat='0'][data-live='1']::after,
#replay .rp-name[data-seat='1'][data-live='1']::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin: 0 8px;
  border-radius: 50%;
  vertical-align: 2px;
  background: var(--rp-me);
  box-shadow: 0 0 8px color-mix(in srgb, var(--rp-me) 70%, transparent);
}
#replay .rp-name[data-seat='1'][data-live='1']::before {
  background: var(--rp-opp);
  box-shadow: 0 0 8px color-mix(in srgb, var(--rp-opp) 70%, transparent);
}
#replay .rp-score {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font: 700 21px/1 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  font-variant-numeric: tabular-nums;
  letter-spacing: .02em;
}
#replay .rp-score .rp-dash { font-size: 13px; color: var(--rp-faint); font-weight: 400; }

/* ---------- the winner, at the end ----------
   One settle, never a loop: the winner's score swells in their ink with a soft halo and lands; their
   name lights up; the other side steps back. The result line below says it in words. */
#replay .rp-pts { display: inline-block; transition: color 260ms ease, opacity 260ms ease, text-shadow 260ms ease; }
#replay[data-ended='1'][data-winner='0'] .rp-pts[data-seat='0'],
#replay[data-ended='1'][data-winner='1'] .rp-pts[data-seat='1'] {
  color: var(--rp-win);
  text-shadow: 0 0 18px color-mix(in srgb, var(--rp-win) 45%, transparent);
  animation: rp-win-score 520ms cubic-bezier(.2, 1.4, .36, 1) both;
}
#replay[data-ended='1'][data-winner='0'] { --rp-win: var(--rp-me); }
#replay[data-ended='1'][data-winner='1'] { --rp-win: var(--rp-opp); }
#replay[data-ended='1'][data-winner='0'] .rp-pts[data-seat='1'],
#replay[data-ended='1'][data-winner='1'] .rp-pts[data-seat='0'],
#replay[data-ended='1'][data-winner='0'] .rp-name[data-seat='1'],
#replay[data-ended='1'][data-winner='1'] .rp-name[data-seat='0'] { opacity: .38; }
#replay[data-ended='1'][data-winner='0'] .rp-name[data-seat='0'],
#replay[data-ended='1'][data-winner='1'] .rp-name[data-seat='1'] {
  color: var(--rp-win);
  text-shadow: 0 0 12px color-mix(in srgb, var(--rp-win) 40%, transparent);
}
@keyframes rp-win-score {
  0% { transform: scale(1); }
  45% { transform: scale(1.28); }
  100% { transform: scale(1.12); }
}
#replay[data-ended='1'] .rp-turn {
  letter-spacing: .22em;
  animation: rp-turn-in 360ms 120ms cubic-bezier(.22, .72, .24, 1) both;
}

/* ---------- the turn line: spoken, not shown; the result once the match has ended ---------- */
#replay:not([data-ended='1']) .rp-turn {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  min-height: 0 !important;
  margin: -1px !important;
  padding: 0 !important;
  overflow: hidden !important;
  clip-path: inset(50%) !important;
  white-space: nowrap !important;
}
#replay .rp-turn {
  margin: 0;
  min-height: 17px;
  text-align: center;
  font: 500 12px/1.2 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--rp-ink);
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
/* ONLY the board's own outer SVG ("> svg"). The board nests small <svg> windows inside it — each
   strength stone and each bonus hex's gold frame is a cropped window onto a sprite atlas, sized by
   its own x/y/width/height and clipped by overflow="hidden". A descendant selector here used to
   reach those windows too: width/height 100% blew each one up to the whole board and
   overflow:visible un-clipped it, so the replay showed every stone 1-9 on every tile and whole
   strips of gold frames hanging off the board (owner screenshot, 2026-10-26). */
#replay .rp-board > svg {
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
/* The game scopes a strength stone's transform box to its board id; the replay's SVG is the same
   board (class "board") and needs the same origin, or its stone and number sit off the hex. */
#replay .rp-board svg .seed-stone { pointer-events: none; transform-box: view-box; transform-origin: 0 0; }
/* The same two looks the game scopes to its own board id. A bonus hex's metal frame carries a warm
   glow (the only thing that identifies it in Futasaku), and an empty hex is lifted 15% so the ground
   reads; without these the replay's rich and empty cells sit at a different brightness to the match's. */
#replay .rp-board svg .gold-frame { filter: drop-shadow(0 0 1.6px rgba(231, 181, 83, .32)); }
#replay .rp-board svg .gold-frame.empty { filter: drop-shadow(0 0 2.1px rgba(236, 187, 88, .40)); }
#replay .rp-board svg .gold-frame.occupied .gold-frame-art { opacity: .92; }
#replay .rp-board svg .hex-cell.normal.futa04-empty { filter: brightness(1.15); }

/* ---------- the controls ---------- */
/* The bar and its clock share one row: the clock is a quiet figure at the bar's right end. */
#replay .rp-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 0 2px;
}
#replay .rp-scrub-wrap { position: relative; }
/* THE BIGGEST MOMENTS: two to four small diamonds pinned just above the bar, one per play that moved
   the match most, in the ink of the player who made it, each on a hairline down to its exact beat.
   The turning point (the biggest cut) is the gold one, a size up. The pins live in their own lane
   ABOVE the line: the line itself always belongs to the bar, so a press or drag there seeks exactly
   as before, and only a press on a pin lands on its moment. */
#replay .rp-moments { position: absolute; inset: 0; pointer-events: none; }
#replay .rp-notch,
#replay .rp-moment {
  position: absolute;
  /* the lane: from 14px above the bar's box to 7px above its centre line */
  top: -14px;
  height: 29px;
  width: 24px;
  translate: -50% 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  pointer-events: auto;
  z-index: 2;
  --rp-mk: var(--rp-me);
}
#replay .rp-moment[data-seat='1'] { --rp-mk: var(--rp-opp); }
#replay .rp-notch { left: var(--rp-tp, 0%); --rp-mk: #e9cf8e; }
/* the pin's hairline, from the diamond down to the bar */
#replay .rp-notch::after,
#replay .rp-moment::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  width: 1px;
  height: 7px;
  translate: -50% 0;
  background: var(--rp-mk);
  opacity: .55;
}
#replay .rp-notch::before,
#replay .rp-moment::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 4px;
  width: 7px;
  height: 7px;
  translate: -50% 0;
  rotate: 45deg;
  border-radius: 1.5px;
  background: var(--rp-mk);
  box-shadow: 0 0 10px color-mix(in srgb, var(--rp-mk) 45%, transparent);
  transition: scale 160ms ease, box-shadow 160ms ease;
}
#replay .rp-notch::before {
  width: 9px;
  height: 9px;
  bottom: 3px;
  background: linear-gradient(135deg, #f7e6b4, #c9a256);
  box-shadow: 0 0 12px rgba(233, 207, 142, .55);
}
#replay .rp-notch[hidden] { display: none !important; }
#replay .rp-notch[data-at='1']::before,
#replay .rp-moment[data-at='1']::before,
#replay .rp-notch:hover::before,
#replay .rp-moment:hover::before { scale: 1.35; }
#replay .rp-notch:focus-visible,
#replay .rp-moment:focus-visible { outline: none; }
#replay .rp-notch:focus-visible::before,
#replay .rp-moment:focus-visible::before { box-shadow: 0 0 0 2px #0b0d0c, 0 0 0 4px rgba(233, 216, 173, .75); }
/* The lane needs its room above the bar. */
#replay .rp-bar { margin-top: 10px; }
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

/* ---------- the recording line ---------- */
/* THE VIDEO EXPORT (owner, 2026-10-26): progress and the way out, between the scrub bar and the
   footer. Hidden when idle, so no control ever moves for it. */
#replay .rp-video {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 2px;
}
#replay .rp-video[hidden] { display: none !important; }
#replay .rp-video-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 500 10.5px/1.3 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--rp-ink);
  font-variant-numeric: tabular-nums;
}
/* The one moving thing in the chrome: a quiet record dot, only while a recording can be cancelled. */
#replay .rp-video[data-live='1'] .rp-video-text::before {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--rp-opp);
  vertical-align: 1px;
  animation: rp-rec 1.6s ease-in-out infinite;
}
@keyframes rp-rec { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
/* The cancel key is the plate's own button: the same 44px thumb target, no new size. */
#replay .rp-video .rp-btn[hidden] { display: none !important; }
#replay .rp-icon:disabled { opacity: .45; cursor: default; }
#replay .rp-icon[aria-busy='true'] svg { animation: rp-rec 1.6s ease-in-out infinite; }

#replay .rp-foot {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 0 2px;
  min-height: 48px;
}
/* A FIXED width (the widest "00:00 / 00:00"), so the bar beside it never changes length as the
   clock fills in or pauses: a bar that shifts under a thumb mid-drag seeks to the wrong moment. */
#replay .rp-meta {
  position: relative;
  box-sizing: content-box;
  width: 14ch;
  text-align: right;
  white-space: nowrap;
  font: 400 10.5px/1.3 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  letter-spacing: .1em;
  color: var(--rp-faint);
  font-variant-numeric: tabular-nums;
}
/* The footer's right-hand slot holds the one mark; the share key sits immediately beside it. */
#replay .rp-actions { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
#replay .rp-actions-start { justify-content: flex-start; }
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
/* THE SIGNATURE: the 双サク mark over FUTASAKU.COM, set in Besley — the menu title's own face — in
   the game's classic cream (owner, 2026-10-26: "Besley … the classic cream colour we use", no gold,
   no side lines). Low-key depth, the way the board's carved stones read: a thin warm edge cast one
   pixel under each letter, and a soft shadow beneath. Quiet under the match, present in every
   screenshot of it. */
#replay .rp-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
}
#replay .rp-brand-mark {
  display: block;
  height: 15px;
  width: auto;
  max-width: 64px;
  opacity: .82;
}
#replay .rp-brand-site {
  display: block;
  font: 800 11.5px/1 var(--font-display, 'Besley', Georgia, serif);
  letter-spacing: .1em;
  /* tracking also adds space after the last letter; this pulls the word back to true centre */
  margin-right: -.1em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--rp-ink);
  text-shadow:
    0 1px 0 rgba(92, 78, 56, .95),
    0 2px 0 rgba(40, 33, 24, .7),
    0 3px 6px rgba(0, 0, 0, .55);
}
/* THE MOMENT CAPTION: one small glass plate over the top of the board — an eyebrow ("02 / 04", or
   TURNING POINT in the pin's gold), then the pin's diamond, the player's name in their ink and the
   play. Device-label type, the replay's own glass; it settles in from 6px, rests, and fades. */
#replay .rp-caption {
  position: absolute;
  top: 6px;
  left: 50%;
  z-index: 3;
  max-width: calc(100% - 24px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 15px 9px;
  border-radius: 12px;
  background: rgba(14, 16, 14, .8);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  box-shadow: inset 0 0 0 1px rgba(233, 216, 173, .14), inset 0 1px 0 rgba(255, 255, 255, .05), 0 10px 28px rgba(0, 0, 0, .5);
  pointer-events: none;
  opacity: 0;
  translate: -50% -6px;
  transition: opacity 240ms ease, translate 240ms ease;
  --rp-mk: var(--rp-me);
}
#replay .rp-caption[data-seat='1'] { --rp-mk: var(--rp-opp); }
#replay .rp-caption[data-show='1'] {
  opacity: 1;
  translate: -50% 0;
  transition: opacity 220ms cubic-bezier(.22, .72, .24, 1), translate 260ms cubic-bezier(.2, 1.3, .36, 1);
}
#replay .rp-caption-eyebrow {
  font: 400 9px/1 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  letter-spacing: .24em;
  margin-right: -.24em;
  text-transform: uppercase;
  color: var(--rp-faint);
  font-variant-numeric: tabular-nums;
}
#replay .rp-caption[data-turning='1'] .rp-caption-eyebrow { color: #e9cf8e; }
#replay .rp-caption-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  font: 500 12px/1.15 var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  letter-spacing: .1em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--rp-ink);
}
#replay .rp-caption-line i {
  flex: none;
  width: 7px;
  height: 7px;
  rotate: 45deg;
  border-radius: 1.5px;
  background: var(--rp-mk);
  box-shadow: 0 0 10px color-mix(in srgb, var(--rp-mk) 50%, transparent);
}
#replay .rp-caption[data-turning='1'] .rp-caption-line i { background: linear-gradient(135deg, #f7e6b4, #c9a256); }
#replay .rp-caption-line b {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  color: var(--rp-mk);
}
#replay .rp-caption-line span { flex: none; color: var(--rp-ink); }

/* Replay again: one pill over the foot of the finished board, centred. */
#replay .rp-board .rp-again {
  position: absolute;
  left: 50%;
  bottom: 6px;
  translate: -50% 0;
  z-index: 3;
  padding: 0 22px;
  border-color: rgba(233, 207, 142, .38);
  background: rgba(14, 16, 14, .82);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 24px rgba(0, 0, 0, .5);
}
/* Replay again arrives with the result, on the plate's own beat. */
#replay[data-ended='1'] .rp-btn[data-rp='again'] { animation: rp-again-in 260ms cubic-bezier(.22, .72, .24, 1) both; }
@keyframes rp-again-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }

/* Paused: the whole picture goes quiet rather than showing a badge, and the clock line says so. */
#replay[data-paused='1'] .rp-board { opacity: .82; transition: opacity 160ms ease; }
#replay[data-paused='1'] .rp-meta { color: var(--rp-ink); }
/* the pause glyph sits in the clock's own box, so it never moves the bar either */
#replay[data-paused='1'] .rp-meta::before { content: '❚❚'; position: absolute; left: 0; top: 50%; translate: 0 -50%; font-size: 8px; letter-spacing: 0; color: var(--rp-dim); }

/* The tightest portrait phone (320px): the footer keeps its one row. The share key joins the
   mark, so the two text keys give back a little padding and tracking — never a 44px target. */
@media (max-width: 380px) {
  #replay .rp-foot { gap: 6px; }
  #replay .rp-actions { gap: 4px; }
  #replay .rp-btn { min-height: 44px; padding: 0 8px; font-size: 10.5px; letter-spacing: .08em; }
  #replay .rp-brand-site { font-size: 10.5px; letter-spacing: .07em; margin-right: -.07em; }
}

/* A phone in landscape or a short window: tighten the chrome, never the board. */
@media (max-height: 560px) {
  #replay { padding-top: calc(env(safe-area-inset-top, 0px) + 5px); padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 5px); }
  #replay .rp-score { font-size: 18px; }
  #replay .rp-brand-mark { display: none; }
  #replay .rp-scrub { height: 44px; }
}

/* Reduce motion (setting or OS): no settle, no crossfade — the board simply is the next position. */
.reduce-motion #replay .rp-turn[data-change='1'],
.reduce-motion #replay[data-ended='1'] .rp-btn[data-rp='again'],
.reduce-motion #replay .rp-video[data-live='1'] .rp-video-text::before,
.reduce-motion #replay .rp-icon[aria-busy='true'] svg { animation: none !important; }
.reduce-motion #replay .rp-board { transition: none !important; }
.reduce-motion #replay .rp-caption { transition: none !important; translate: -50% 0 !important; }
.reduce-motion #replay .rp-pts { animation: none !important; }
@media (prefers-reduced-motion: reduce) {
  #replay .rp-turn[data-change='1'],
  #replay[data-ended='1'] .rp-btn[data-rp='again'],
  #replay .rp-video[data-live='1'] .rp-video-text::before,
  #replay .rp-icon[aria-busy='true'] svg { animation: none !important; }
  #replay .rp-board { transition: none !important; }
  #replay .rp-caption { transition: none !important; translate: -50% 0 !important; }
  #replay .rp-pts { animation: none !important; }
}
`;
