/** Compact online lobby styles (Phase 4). Injected once beside player CSS. */
export const ONLINE_CSS = `
/* The online lobby is a real full-screen VIEW, not a layer on the menu. The base .screen rule
   already makes it fixed/inset:0; give each online screen the theme background (opaque, so the
   menu can never paint through), lift it above the menu in z-order as a second safety net, and
   centre its column exactly like the main menu / level picker so tall content scrolls. */
.online-hub,
.online-waiting,
.online-join {
  display: grid;
  place-items: center;
  z-index: 3;
  background: var(--c-bg);
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
/* Same centred column, width, padding, rhythm and heading type scale as #menu .menu-inner /
   .levels-inner, so the online submenu reads as the same product rather than a bolted-on page. */
.online-inner {
  width: min(420px, 100% - 32px);
  padding: 32px 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
}
.online-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
}
/* The back button keeps its full 44x44 tap target even when the title (flexes) needs the room. */
.online-head > .icon-only { flex: 0 0 auto; }
.online-head h2 {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-size: 1.4rem;
  line-height: 1.15;
  letter-spacing: -0.012em;
  padding-top: 1px;
}
/* The small, treeless Futasaku wordmark that the in-game HUD shows top-right (#hud-brand):
   the same asset, filter, size and opacity, placed top-right of the online submenu header so the
   submenu carries the same mark instead of a big wordmark. */
.online-brand {
  flex: 0 0 auto;
  display: block;
  height: 22px;
  width: auto;
  max-width: 90px;
  opacity: 0.75;
  pointer-events: none;
  user-select: none;
}
.online-section {
  margin: 0.4rem 0 0;
  font-size: 0.95rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.85;
}
.online-matches {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.online-row {
  display: grid;
  grid-template-columns: 2rem 1fr auto;
  gap: 0.55rem;
  align-items: center;
  min-height: 48px;
  padding: 0.55rem 0.7rem;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 10px;
  cursor: pointer;
  background: color-mix(in srgb, #1c221c 88%, #3a4a32);
}
.online-row:focus-visible {
  outline: 2px solid #c9e4a8;
  outline-offset: 2px;
}
.online-row.warn {
  border-color: color-mix(in srgb, #d4a24a 55%, transparent);
}
.online-row-main {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}
.online-row-main b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.online-row-status {
  font-size: 0.85rem;
  opacity: 0.8;
}
.online-row-time {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.online-row-time small {
  color: #d4a24a;
  font-size: 0.72rem;
  max-width: 7.5rem;
}
.online-code {
  font-size: 1.15rem;
  letter-spacing: 0.22em;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  margin: 0;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  padding: 0 1rem;
  border-radius: 10px;
  background: color-mix(in srgb, #1c221c 88%, #3a4a32);
  cursor: pointer;
  user-select: all;
  -webkit-user-select: all;
}
.online-code:focus-visible {
  outline: 2px solid #c9e4a8;
  outline-offset: 2px;
}
/* inline-flex would otherwise beat the [hidden] attribute (setWaitingMode hides the code). */
.online-code[hidden] { display: none; }
.online-code-hint {
  margin: 0;
  text-align: center;
}
.online-code-hint[hidden] { display: none; }
.online-card {
  padding: 0.9rem 1rem;
  border-radius: 12px;
  background: color-mix(in srgb, #243024 90%, #000);
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
}
/* "Opponent found" prompt: a small dark-glass card centred above whatever is on screen (the
   computer game). No new tokens or borders — it reuses the existing .online-card component. */
.online-matched {
  position: fixed;
  inset: 0;
  z-index: 9;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, #0d100d 72%, transparent);
}
.online-matched[hidden] { display: none; }
.online-matched .online-card { width: min(340px, 100% - 24px); }
.online-card h3 { margin: 0 0 0.5rem; font-size: 1.05rem; }
.online-card ul { margin: 0 0 0.85rem; padding-left: 1.1rem; }
.online-card li { margin: 0.35rem 0; }
.online-notice:empty { display: none; }
.online-notice {
  color: #e2c48a;
  min-height: 1.2em;
  margin: 0;
}
/* The map choice on the hub: the same segmented control the Settings sheet uses (no new frame,
   radius or colour), with its own label word above it and a full 44px touch height. */
.online-map {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.online-map > span {
  font-size: 0.85rem;
  opacity: 0.8;
}
.online-map .seg { width: 100%; }
.online-map .seg-btn { flex: 1 1 50%; min-height: 44px; }
.online-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.online-field input,
.online-link-block input {
  min-height: 44px;
  font-size: 1.1rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 0.45rem 0.7rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  background: #141814;
  color: inherit;
}
.online-confirm {
  margin: 0;
  font-size: 1rem;
}
.online-link-block {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-top: 0.4rem;
}
/* The duel status row: the ONE fixed-height lane that sits IN the fixed header row, between the
   44px menu button (left) and the brand/logo (right), so it can never cover either. Owner's
   cleanup (2026-10-14): ONE short message at a time, never a second line, never a frame, and never
   a single pixel over the board.
   NO BOX: no background, border, radius or shadow on the lane or its words, so it reads as the
   header's own text, exactly like the menu button and the brand beside them.
   CLIPPED: overflow:hidden plus contain:paint mean nothing inside can draw outside its own box.
   CLICK-THROUGH: the words are not controls, so a tap on them reaches the board (or the header)
   underneath; only a real control (the live pill) takes a tap of its own. */
.duel-hud {
  position: fixed;
  top: env(safe-area-inset-top, 0px);
  left: calc(58px + env(safe-area-inset-left, 0px));
  /* 44px menu + 6px header padding + 8px gap, and the logo's max 90px + 6px padding + 8px gap. */
  right: calc(104px + env(safe-area-inset-right, 0px));
  z-index: 8;
  box-sizing: border-box;
  display: flex;
  flex-wrap: nowrap;          /* the lane NEVER wraps */
  align-items: center;
  column-gap: 8px;
  padding: 0 2px;
  font-size: 0.8rem;
  line-height: 1;
  /* ONE fixed row, the same height as the menu button: it never grows or shrinks. */
  height: var(--hud-h, 44px);
  min-height: var(--hud-h, 44px);
  max-height: var(--hud-h, 44px);
  overflow: hidden;
  contain: paint;
  background: none; /* no frame, no fill — the header's own surface shows through */
  border: 0;
  box-shadow: none;
  pointer-events: none;
}
/* The lane's own clipping box: one row of text inside the fixed lane. */
.duel-hud .duel-lane {
  order: 1;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  column-gap: 8px;
  overflow: hidden;
  contain: paint;
}
/* The text viewport: one line, clipped. The soft fade appears only while the words ticker. */
.duel-hud .duel-msg {
  order: 1;
  flex: 0 1 auto;
  min-width: 0;
  display: block;
  overflow: hidden;
  white-space: nowrap;
  color: inherit;
  background: none;
  border: 0;
  box-shadow: none;
  outline: none;
}
.duel-hud .duel-msg[hidden] { display: none; }
.duel-hud .duel-msg[data-scroll='1'] {
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
}
/* The track the ticker moves. A transform animation the browser drives — never per-frame JS. */
.duel-hud .duel-track { display: inline-block; white-space: nowrap; will-change: transform; }
/* Reduce motion: nothing scrolls — the words ellipsise cleanly instead. */
.reduce-motion .duel-hud .duel-track { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
@media (prefers-reduced-motion: reduce) {
  .duel-hud .duel-track { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
}
.duel-hud .duel-msg[data-tone='amber'] { color: #d4a24a; }
.duel-hud .duel-msg[data-tone='red'], .duel-hud .duel-msg[data-tone='danger'] { color: var(--c-danger, #e0735c); }

/* The live clock: the ONLY number in the lane. Plain text on the header — no chip, no dot. */
.duel-hud .duel-urgency {
  order: 2;
  flex: 0 0 auto;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  background: none;
  border: 0;
}
.duel-hud .duel-urgency[hidden] { display: none; }

/* Hidden state hooks (never painted): the lane shows ONE message, but the opponent name and the
   current notice stay readable to the page's own tests and the frame audit. */
.duel-hud .duel-opp,
.duel-hud .duel-notice { display: none; }
/* Presence: a small dot plus a word — never colour alone, never a boxed badge. Nothing is drawn
   until a real state is reported (presence is not wired yet), so "unknown" is hidden. */
.duel-hud [data-duel-presence] {
  order: 3;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.duel-hud [data-duel-presence][data-presence="unknown"] { display: none; }
.duel-hud [data-duel-presence]::before {
  content: '';
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  margin-right: 0.3rem;
  flex: 0 0 auto;
  background: currentColor;
}
.duel-hud [data-duel-presence][data-presence="online"]::before { background: #8fbf6a; }
.duel-hud [data-duel-presence][data-presence="away"]::before { background: #c9a35a; }

/* The nodes the live module injects into this lane. Raising the specificity with #duel-hud means
   these neutralisations win no matter which stylesheet is injected last.
   - the chip still HAS a node (the go-live moment lights it and nothing else does), but the strip
     shows no chip: the plain m:ss clock is the lane's only number, so it is hidden here outright;
   - the "Real time" pill is a control, not a chip: it keeps its 44px tap target but loses every
     frame (no border, background, radius or shadow) so it reads as plain header text;
   - the two small circles that used to sit beside the chip (its lamp) and the clock (its dot) are
     both GONE (owner's cleanup): the nodes themselves were deleted, so no rule hides them here. */
#duel-hud .live-chip { display: none !important; }
#duel-hud .live-pill {
  order: 3;
  pointer-events: auto;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
  padding: 0 2px;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
}
#duel-hud .live-pill::after { inset: -6px 0; } /* keep the 44px touch target without a frame */
#duel-hud .live-pill[disabled] { border: 0; opacity: .62; }
/* The pill's own dot node still EXISTS (it breathes in the ready state), so this rule is live: it
   keeps that dot out of the header lane. Do not delete it with the two deleted circles above. */
#duel-hud .live-pill .dot { display: none; }

`;
