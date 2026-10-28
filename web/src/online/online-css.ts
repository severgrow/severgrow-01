/** Compact online lobby styles (Phase 4). Injected once beside player CSS. */
export const ONLINE_CSS = `
/* The online lobby is a real full-screen VIEW, not a layer on the menu. The base .screen rule
   already makes it fixed/inset:0; give each online screen the theme background (opaque, so the
   menu can never paint through), lift it above the menu in z-order as a second safety net, and
   centre its column exactly like the main menu / level picker so tall content scrolls.
   NOTE (consistency sweep, 2026-10-25): this opaque fill is the one material difference from
   every other screen — #play-menu, #levels and the lobby's own sibling .online-world stand on the
   shared painted surface. It is pinned on purpose by web/tests/world-surface.test.ts and
   web/e2e/online-lobby-overlay.ts ("this change is the world map only"), so the sweep reported it
   to the owner instead of changing it. */
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
/* "Your matches" disclosure (owner, 2026-10-25): collapsed by default, so the red "!" rides the
   BUTTON too, where it is readable with the list shut. Dark glass: the same 10px radius, hairline
   and dark mix as .online-row below, and a 44px touch target like every other lobby key. */
.online-matches-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  box-sizing: border-box;
  margin: 0.4rem 0 0;
  padding: 0.35rem 0.7rem;
  color: inherit;
  font: inherit;
  font-size: 0.95rem;
  line-height: 1.15;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
  background: color-mix(in srgb, #1c221c 88%, #3a4a32);
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 10px;
  cursor: pointer;
}
.online-matches-toggle:focus-visible {
  outline: 2px solid #c9e4a8;
  outline-offset: 2px;
}
/* The flexing label is the only part allowed to shrink/ellipsise; badge and caret keep their ink
   at 320px, so the header never overflows. */
.online-matches-toggle-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The badge is a STATIC mark in every motion mode (no pulse, no reveal of its own). Its spoken
   name lives on the button (aria-label), never on this aria-hidden "!".
   THE RED IS --c-alert. Decided in the browser, not by reading: the rule below WAS applied all
   along; the first version painted var(--c-danger), and every palette rebinds that token to
   #fff4dc (cream — it is the weak-spot chip's ink), so the disc measured rgb(255,244,220) and the
   "!" disappeared. No selector change or extra specificity can fix a custom-property override, so
   style.css now owns --c-alert / --c-alertInk (#ff6b4a on near-black, contrast 6.3:1) and no
   palette writes them. Measured after the change: fill rgb(255,107,74), ink rgb(24,25,26). */
.online-attention-badge {
  flex: 0 0 auto;
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--c-alert, #ff6b4a);
  color: var(--c-alertInk, #18191a);
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1;
}
.online-attention-badge[hidden] { display: none; }
.online-matches-caret {
  flex: 0 0 auto;
  width: 0.5rem;
  height: 0.5rem;
  margin-inline-end: 2px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  opacity: 0.7;
  transition: transform 160ms ease;
}
.online-matches-toggle[aria-expanded='true'] .online-matches-caret { transform: rotate(-135deg); }
.online-matches-panel[hidden] { display: none; }
.online-matches-panel {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
/* The row's mark slot: the status icon, with the same red "!" set into its corner when this match
   waits for the player's move. The badge is decoration; the row's word ("Your turn") is the
   signal every player can read, and the border tint is a third, quiet reinforcement. */
.online-row-mark {
  position: relative;
  width: 2rem;
  min-height: 2rem;
  display: grid;
  place-items: center;
}
.online-row-attention {
  position: absolute;
  inset-inline-start: -3px;
  top: -5px;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--c-alert, #ff6b4a);
  color: var(--c-alertInk, #18191a);
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1;
}
.online-row.needs-response {
  border-color: color-mix(in srgb, var(--c-alert, #ff6b4a) 50%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .online-matches-caret { transition: none; }
}
.reduce-motion .online-matches-caret { transition: none; }

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
  /* The one typeface, like every other label in the lobby. This was a literal system-monospace
     stack, so the invite code was the only text in the product set in the OS's mono face. */
  font-family: var(--font-ui);
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
/* HIDDEN FOR NOW (owner, 2026-10-21): "on top, opponent's turn was trying to scroll but was
   jumpy and weird ... I think we'll delete all the text from top, so for now maybe just hide it."
   So the turn word is not painted at all. It stays in the DOM with its text intact (and the clock
   and urgency slots still own the lane), so nothing that reads the state breaks and restoring the
   strip later is one rule. The ticker's transform is what looked jumpy; an unpainted element
   cannot ticker. */
.duel-hud .duel-msg { display: none; }
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
   - the two small circles that used to sit beside the chip (its lamp) and the clock (its dot) are
     both GONE (owner's cleanup): the nodes themselves were deleted, so no rule hides them here. */
#duel-hud .live-chip { display: none !important; }
/* The real-time control is now the bolt in the rail under the wordmark (live/ui.ts), not in this lane. */

/* The world uses the whole safe viewport; the other online screens retain their narrow column.
   NO BACKGROUND FILL (owner, 2026-10-16): the world map is the ONE online screen that stands on
   the shared surface instead of blanking it. #texture (web/src/style.css) already paints the
   page background — the soil radial gradient, the grain and the vignette — at z-index 0, and every
   .screen is transparent over it, which is exactly how the main menu and the game screen sit on
   it. This rule used to paint var(--c-bg) here, a FLAT fill at z-index 3 that covered the grain
   only on this screen (measured: background luminance sd 0.42px here vs 3.80 on the same patch of
   the menu) — the screen read as a different product. The map's own contained window is untouched:
   it is the .world-grid panel below, which keeps its bounded inset surface.
   GUTTERS (owner, 2026-10-16): the side gutters are the menu column's own 16px, so the world's
   column edge sits exactly where #menu .menu-inner's does (that column is 100% - 32px). The
   4px difference (12px here) was the last edge that did not line up with the menu. */
.online-world {
  display: grid; place-items: stretch; z-index: 3; background: none;
  overflow: hidden; overscroll-behavior: contain;
  /* THE SCREEN ITSELF MUST NOT RESERVE THE SAFE AREAS. The shared .screen rule (web/src/style.css)
     pads every screen by env(safe-area-inset-*), and .online-inner below pads by the same insets
     again. Both were in force, so on an iPhone 15 Pro the inset was applied TWICE: the inner started
     59px down AND was 100dvh tall, putting its bottom at 911 on an 852px screen. Because this screen
     is overflow:hidden, the last 59px was silently CUT - which is the owner's "choose a tile to see
     who holds it is not visible" (measured: the selection bar at 819-877, and the header row at
     118 = 59 + 59, i.e. 59px of dead space at the top).
     The inner owns the insets for this screen, so this one is zeroed. */
  padding: 0;
}
.online-world .online-inner {
  box-sizing: border-box;
  width: 100%; max-width: none; height: 100dvh; min-height: 0;
  padding: max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  gap: 8px;
}
/* The world header IS the in-game header (owner, 2026-10-16): ONE 44px row with the back control
   anchored in the left corner and the wordmark in the right, exactly like #hud-menu / #hud-brand.
   A three-column grid with centred items is what puts the two corners and the single-line title on
   the SAME line; the chevron no longer floats centred against a tall two-line block. */
.online-world .online-head {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  /* The row stays 44px - the in-game HUD's own row height - so the two headers keep the same rhythm.
     The title and the wordmark hang from the top edge; the chevron stays CENTRED, exactly as it is in
     the game's own header, where #hud-menu sits at the row top and #hud-brand is pushed 18px down. */
  align-items: center;
  column-gap: 8px;
  min-height: 44px;
  max-width: 720px; width: 100%; margin-inline: auto;
}
.online-world .online-head > .icon-only { justify-self: start; }
/* THE TITLE AND THE WORDMARK SHARE ONE TOP EDGE (owner, 2026-10-16: "the world map top border is
   aligned with right top logo's top border"). It was wrong because the wordmark had been moved to the
   in-game HUD position (18px down) while the title stayed vertically centred, so the title sat 6px
   ABOVE the logo. The two offsets are MEASURED in a real browser, not computed, because the two have
   different shapes: the wordmark's ink fills its 22px box, while the title's glyphs sit about 1px
   below the top of its 22px line box - hence 18 and 17. Measured ink tops: both at header + 18,
   delta 0.00px. Change one and you must change the other, then re-measure. */
.online-world .online-head > .online-brand {
  align-self: start;
  margin-top: 18px;
}
/* THE WORDMARK SITS WHERE THE LIVE GAME PUTS IT (owner, 2026-10-16: "logo on top right sitting
   where normally during live game"). The game's #hud-brand is align-self:start with margin-top:18px
   (web/src/player/branding.ts), NOT centred in its row - so its top is safe-area-top + 18. Centring
   it in this 44px row instead put it at safe-top + 11: measured 52px too low before the double-inset
   fix, and 7px too low after it. Repeating the game's two declarations is what makes the two headers
   agree exactly rather than approximately. Its margin-top now lives with the other two offsets in the
   aligned group above, so there is ONE place that owns the header's top edge. */
/* The title reads on ONE line at 360px and wider. It uses the world screen's own small UI caps —
   the size this rule always asked for; it silently lost the cascade to the typography stylesheet
   (equal specificity, injected later), so it is scoped by id now. nowrap plus a size that genuinely
   fits the narrowest phone keeps it a title: it never wraps, clips or ellipsises.
   Line-height 22px matches the wordmark's own height, so chevron, title and mark share one top. */
#online-world-screen .online-head h2 {
  min-width: 0;
  /* Hangs from the header's top edge so its INK tops out level with the wordmark's (see the aligned
     offsets note above): the glyphs sit 1px below the top of this 22px line box, so 17 here lands
     the ink at header + 18. MEASURED in a real browser, not derived. */
  align-self: start;
  margin-top: 17px;
  padding-top: 0;
  font-family: var(--font-ui, 'Fragment Mono', ui-monospace, monospace);
  font-size: 1.05rem;
  line-height: 22px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: center;
  white-space: nowrap;
}
  /* One deliberate column: the Seeds balance, the selection bar and the notice share the header's
     720px axis, so on a wide screen the screen's text reads down one line and the map is the only
     thing that widens. There is NO summary line (owner, 2026-10-16): the old "N / 183 grown" caption
     was removed outright, so the header sits directly above the Seeds wallet. */
  .world-wallet {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  min-height: 30px; max-width: 720px; width: 100%; margin-inline: auto;
  color: #e8ddbe; font-size: .86rem; font-weight: 700; letter-spacing: .12em;
}
.seed-icon { flex: none; color: #e8ddbe; }
/* The map window FILLS the column (owner, 2026-10-16). He looked at the fitted screen and saw the
   void had simply moved outside the window: the square map sat at the top of a tall column with
   roughly half the screen empty below it. He chose to fill that space with a BIGGER map rather than
   by centring, accepting a horizontal crop. So the window now takes the column's whole height and
   the map scales up to it.
   The world is very nearly square (331.77 x 320 units, plus an 18-unit gutter on every side), so on a
   portrait phone filling the height means the map is wider than the column and the surplus is
   cropped horizontally — the window shows the world's middle and pans to the edges in BOTH axes
   (world-view.ts frames the view to the window's own aspect, clamped to the world's extent). Cropping, never stretching: the SVG scales uniformly, so
   the hexes keep their true shape.
   The width cap keeps a WIDE screen honest: there the height is not the limiting dimension, so the
   window never grows wider than the map's aspect at the available height and the whole world stays
   in view. flex: 1 1 0 is what makes the height take the leftover space; its 210px constant is the
   column's own fixed chrome, derived: padding 12 + 16, header 44, summary 18, Seeds row 30,
   selection 58 and 4 x 8px column gaps = 209.7. min-height 0 and max-height 100% are the backstop:
   if that chrome ever grew (a notice line does exactly that), the window shrinks by that much
   instead of overflowing the viewport. */
.world-grid {
  position: relative;
  flex: 1 1 0; min-height: 0;
  width: min(100%, 1100px, calc((100dvh - 210px) * 367.77 / 356));
  max-height: 100%; margin: 0 auto;
  display: grid; place-items: center; overflow: hidden;
  /* A gesture that runs out of map can never chain to the page behind it, and touch-action: none
     means a drag is always the map's own (owner, 2026-10-21: the page must never scroll). */
  overscroll-behavior: contain; touch-action: none;
  border-radius: 14px; background: radial-gradient(ellipse at 50% 44%, #232721 0, #171b18 55%, #101412 100%);
  box-shadow: inset 0 0 0 1px rgba(232,221,190,.04), inset 0 20px 65px #090c0b69;
}
/* A faint vignette so the world feels CONTAINED inside its window, the same way the page's own
   #texture::after holds the whole screen. Absolutely positioned and click-through, so it never
   becomes a grid item and never takes a pan or a tile tap. */
.world-grid::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 78% 72% at 50% 46%, transparent 42%, #070a08b8 100%);
}
.world-map-svg { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
.world-map-svg:active { cursor: grabbing; }
/* THE TWO LAYERS (world-view.ts). Each tile is drawn TWICE: a FACE (its surface) and a LINE (its
   edge, plus the whole touch target). Every face paints first, then every line, so a neighbour's
   fill can never bury an edge — that was the owner's uneven highlight (2026-10-16: a cream edge
   only where a tile met open ground, and no line at all between two highlighted tiles). The selected
   tile then draws once more, last, in .world-accent-line, above every edge.

   FACE — the fill only. The per-owner gradient is set inline (world-view.ts) so it beats this flat
   fallback, which is only for a tile that has not been painted a gradient yet. Pointer-transparent:
   the line above owns every tap. */
.world-hex-face { fill: #252b26; pointer-events: none; transition: fill 160ms ease; }
/* LINE — the edge, the owner and the state. fill: none paints no surface of its own;
   pointer-events: all lets a tap anywhere inside the hex reach it. stroke-linejoin: round keeps
   a hex vertex from spiking (a miter join would), and the non-scaling stroke keeps the line a true
   hairline at every zoom. */
.world-hex {
  fill: none; stroke: #697267; stroke-width: .36;
  stroke-linejoin: round; stroke-linecap: round;
  vector-effect: non-scaling-stroke; pointer-events: all;
  transition: stroke 160ms ease, opacity 160ms ease; cursor: pointer;
}
/* Owned tiles keep the OWNER colour — the gradient supplies the fill, so this rule paints only the edge. */
.world-hex.held { stroke: var(--territory); }
/* Your own territory: the same colour, one step brighter in the gradient (world-view.ts), plus a
   quietly lifted edge. No new colour — the owner asked to spot his own at a glance, not to be told
   by a different hue. */
.world-hex.mine { stroke: color-mix(in srgb, var(--territory) 62%, #e8ddc5); }

.world-hex.same-owner { stroke-width: 1.1; }
/* THE SELECTION, drawn ONCE above every edge (the .world-accent group in world-view.ts), so no
   neighbouring tile can cover half of it. The same cream the tile highlight always used, with round
   joins so all six vertices stay crisp. */
.world-accent-line {
  fill: none; stroke: #f2e5c5; stroke-width: 1.6; stroke-linejoin: round;
  vector-effect: non-scaling-stroke; pointer-events: none;
  filter: drop-shadow(0 0 3px #d4c28cb0);
}
/* NO DEFAULT RING, IN ANY FOCUS STATE (owner, 2026-10-16: "highlighting tiles on world map looks
   weird af"). Every hex is tabindex=0, and a POINTER click on one focuses it WITHOUT matching
   :focus-visible — so a rule that covered only :focus-visible left the browser painting its own
   ring: the rounded blue bracket, clipped by the map edge, that the owner photographed. Turning the
   outline off for every focus state is only half the fix; the other half is that keyboard users keep
   a marker, so :focus-visible draws OUR hex-following cream stroke instead. It rides the LINE layer,
   which paints above every fill, so it can never be buried by a neighbour's surface. */
.world-hex:focus { outline: none; }
.world-hex:focus-visible { outline: none; stroke: #fff4d3; stroke-width: 1.7; }
/* THE TILE BAR (owner, 2026-10-28: "tapping empty tile should NOT open the menu and still have option
   to grow/sell/challenge"). A tapped tile's line and its one key float at the map's foot on the
   windows' dark glass, centred, so the map's own height never changes when a tile is picked (no
   re-frame, no jump). Hidden while a window is open: one surface at a time. */
.world-selection {
  position: absolute; z-index: 3; left: 50%; bottom: 10px; translate: -50% 0;
  box-sizing: border-box; width: max-content; max-width: calc(100% - 20px); min-height: 44px;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 6px 6px 6px 16px; border-radius: 14px;
  color: #e8ddbe; font-size: .74rem; letter-spacing: .06em; text-transform: uppercase;
  background: rgba(10, 13, 11, .7);
  -webkit-backdrop-filter: blur(8px) saturate(1.05); backdrop-filter: blur(8px) saturate(1.05);
  box-shadow: inset 0 1px 0 #e8ddc514, 0 10px 26px #0006;
  animation: world-bar-in var(--ix-open) var(--ix-ease-open) both;
}
.world-selection:not(.has-action) { padding: 6px 16px; }
.world-selection[hidden], .world-grid.pane-open .world-selection { display: none; }
.world-selection-line { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@keyframes world-bar-in { from { opacity: 0; translate: -50% 4px; } to { opacity: 1; translate: -50% 0; } }
.world-claim-button {
  min-height: 40px; padding: 0 15px; flex: none;
  color: #161a16; background: linear-gradient(#efe4c8, #ddd1b2); border: 0;
  box-shadow: inset 0 1px 0 #fff8, inset 0 -2px 0 #0000002e;
  border-radius: 10px; font: inherit; font-size: .66rem; font-weight: 700; letter-spacing: .12em;
  cursor: pointer; touch-action: manipulation;
}
/* asked once already: the key lights the challenge red, so the second press is a decision */
.world-claim-button.armed { color: #fff4e6; background: linear-gradient(#d9694f, #b8533c); box-shadow: inset 0 1px 0 #ffffff40, inset 0 -2px 0 #00000040, 0 0 12px #e07a5f66; }
.world-claim-button:focus-visible { outline: 2px solid #f2e5c5; outline-offset: 2px; }
/* on its way to the server: the same key, dimmed and breathing, so the bar never changes size */
.world-claim-button.working { opacity: .62; cursor: default; animation: world-working 1.1s ease-in-out infinite; }
@keyframes world-working { 50% { opacity: .42; } }
@media (prefers-reduced-motion: reduce) { .world-claim-button.working { animation: none; } }
html.reduce-motion .world-claim-button.working { animation: none; }
.online-world .online-notice { min-height: 20px; max-width: 720px; width: 100%; margin: 0 auto; }
/* A short (640px) phone: one small, deliberate step tighter — 6px, not 3px crumbs — and a shallower
   selection bar, so the map keeps the room it needs without the column reading as cramped. */
@media (max-height: 650px) { .online-world .online-inner { gap: 6px; } }
@media (prefers-reduced-motion: reduce) { .world-hex, .world-hex-face { transition: none; } .world-selection { animation: none; } }
html.reduce-motion .world-selection { animation: none; }

/* ---- Territory challenges (docs/TERRITORY-CHALLENGES.md) ------------------ */
/* THE FRONTIER: a rival tile that shares a side with the selected cell of mine. It keeps the
   owner's own --territory colour; only the weight lifts, and the notched corner (drawn in
   world-view.ts) is the one new mark. Nothing else about the map changes. */
.world-hex.frontier { stroke-width: 1.15; }
.world-frontier-mark {
  fill: none; stroke: var(--territory, #e8ddbe); stroke-width: 1.1;
  stroke-linecap: round; stroke-linejoin: round;
  vector-effect: non-scaling-stroke; pointer-events: none;
}
/* THE TIMER RING, traced on the cell's own six-point outline. pathLength=1 makes the dash a
   fraction, so the drain is one attribute and never a measurement. The 12 s transition matches the
   map's poll: each refresh hands it the next offset and it drains continuously between them. */
.world-ring {
  fill: none; stroke: var(--territory, #e8ddbe); stroke-width: 1.35;
  stroke-linejoin: round; vector-effect: non-scaling-stroke; pointer-events: none;
  transition: stroke-dashoffset 12s linear;
}
.world-ring.low { animation: world-ring-breath 2.4s ease-in-out infinite; }
/* Expiry: the ring drains the last of its length and fades over 400 ms (the design's collapse). */
.world-ring.done { opacity: 0; transition: stroke-dashoffset 400ms ease, opacity 400ms ease; }
@keyframes world-ring-breath {
  0%, 100% { opacity: 1; }
  50% { opacity: .42; }
}
/* THE CROSSED SWORDS (owner, 2026-10-24: "2 swords graphic on top of the tile that is being
   challenged. white symbol with red glow or something... lowkey, but visible and elegant"). Drawn in
   the map's own SVG, so they pan and zoom with their tile; sized to sit INSIDE the timer ring rather
   than on top of it. White here is the game's warm ink-white, and the red is a bloom rather than a
   fill: the glyph is a mark on the ground, not a badge over it. NOTHING animates — the swords are
   static in every motion mode, so there is no reduced-motion variant to keep in step. */
.world-swords { pointer-events: none; }
.world-swords-hit { fill: #0000; pointer-events: all; cursor: pointer; }
.world-swords-hit:focus { outline: none; }
/* Keyboard focus draws the same cream the tiles use, around the whole 44 px target. */
.world-swords-hit:focus-visible {
  stroke: #f2e5c5; stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}
.world-swords-glyph {
  /* Solid, not stroked: the mark is the owner's heraldic reference (2026-10-24), so it is filled in
     the tiles' own warm ink-white with the challenge's red bloom underneath it. No stroke means
     non-scaling-stroke is unnecessary — the shape is drawn on the ground and scales with it, which
     is what keeps it locked to its hex through pan and zoom. */
  fill: #f8f2e1; stroke: none;
  pointer-events: none;
  filter: drop-shadow(0 0 1px #0b0f0bcc) drop-shadow(0 0 2.2px #ff3b2ed0) drop-shadow(0 0 5.5px #b81c14a8);
}
/* THE CHALLENGE LIST. Hidden when empty, a horizontal rail when not, so it costs the map no room
   until there is something to answer. Each chip carries the same ring at chip size. */
.world-challenges {
  display: flex; gap: 8px; width: min(100%, 720px); margin-inline: auto;
  overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain;
  scrollbar-width: none; -webkit-overflow-scrolling: touch;
  padding: 1px 0 2px;
}
.world-challenges::-webkit-scrollbar { display: none; }
.world-challenges[hidden] { display: none; }
/* A chip that is new to this player settles in once. The node is reused from then on (world-view.ts
   keys the chips by challenge id), so this never re-runs on a poll. */
.world-challenge-chip.is-arriving { animation: world-chip-arrive 480ms cubic-bezier(.22, 1, .36, 1) both; }
@keyframes world-chip-arrive {
  from { opacity: 0; translate: 0 4px; scale: .96; }
  70% { opacity: 1; translate: 0 -1px; scale: 1.004; }
  to { opacity: 1; translate: 0 0; scale: 1; }
}
/* Past the rail's cap: a count, never a silent drop. Not a button — there is nothing to press. */
.world-challenge-more {
  flex: 0 0 auto; align-self: center; padding: 0 6px;
  font-size: .62rem; letter-spacing: .1em; color: #e8ddbe; opacity: .62; white-space: nowrap;
}
/* The screen-reader line. Present to assistive tech, invisible to the eye, and empty when silent. */
.world-live {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}
.world-challenge-chip {
  flex: 0 0 auto; min-height: 44px; box-sizing: border-box;
  display: flex; align-items: center; gap: 8px; padding: 4px 11px 4px 7px;
  color: #e8ddbe; background: #161b17cc; border: 1px solid #d5c89b40; border-radius: 9px;
  font: inherit; text-align: left; cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, scale 90ms ease;
}
/* The chip is a key like any other: it answers a press the way the rest of the game does. */
.world-challenge-chip:active { scale: .975; }
.world-challenge-chip[data-status='pending'] { border-color: #d5c89b59; }
.world-challenge-chip:focus { outline: none; }
.world-challenge-chip:focus-visible { outline: 2px solid #f2e5c5; outline-offset: 2px; }
.world-challenge-chip-copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.world-challenge-chip-copy strong {
  font-size: .64rem; font-weight: 700; letter-spacing: .1em; color: #f2e5c5; white-space: nowrap;
}
.world-challenge-chip-copy span {
  font-size: .62rem; letter-spacing: .05em; color: #e8ddbe; opacity: .72; white-space: nowrap;
}
.world-chip-ring { width: 22px; height: 24px; flex: none; display: block; }
.world-chip-ring-path {
  fill: none; stroke: var(--territory, #e8ddbe); stroke-width: 1.5;
  stroke-linejoin: round; vector-effect: non-scaling-stroke;
  transition: stroke-dashoffset 12s linear;
}
.world-chip-ring-path.low { animation: world-ring-breath 2.4s ease-in-out infinite; }
.world-chip-hex { fill: none; stroke: #e8ddbe66; stroke-width: 1.4; vector-effect: non-scaling-stroke; }

/* THE SHEET. It reuses the established invitation surface (world-invitation / -card): the same
   grained page showing through the same translucent glass, cream ink, one primary key. */
.world-challenge-sheet[hidden] { display: none; }
.world-challenge-card { width: min(100%, 380px); }
/* The contested ground itself, at the head of the card: the cell's own six-point outline in the
   holder's colour. It is the one thing on this surface that is not a word. */
.world-challenge-head { display: flex; align-items: center; gap: 9px; }
.world-challenge-head strong { font-size: 1.06rem; letter-spacing: .1em; }
.world-challenge-glyph { width: 22px; height: 24px; flex: none; display: block; }
.world-challenge-glyph path {
  fill: none; stroke: var(--territory, #e8ddbe); stroke-width: 1.5;
  stroke-linejoin: round; vector-effect: non-scaling-stroke;
}
.world-challenge-glyph.is-rock path { stroke: #e8ddbe66; }
.world-challenge-line { font-size: .82rem; color: #eee3c6; }
.world-challenge-meta {
  margin: -2px 0 10px; font-size: .68rem; letter-spacing: .12em; color: #cfc8ae;
}
.world-challenge-keys { width: 100%; display: flex; gap: 8px; }
/* The one primary key is the game's own amber, not a second green: this card is part of the same
   instrument as PLAY and the pause plate, and its lead key must read as the lead key everywhere. */
.world-challenge-primary {
  background: var(--c-gold, #f2c14e); border-color: var(--c-gold, #f2c14e);
  color: #14170f; font-weight: 700;
}
.world-challenge-secondary { background: transparent; opacity: .75; }
/* Declining is armed, not done: the label says so and the face steps forward to be read. */
.world-challenge-secondary.is-armed { opacity: 1; border-color: #d8cda5aa; }
/* An in-flight key speaks the app's own busy language: calmer face, progress cursor. */
.world-challenge-keys button[aria-busy='true'] { cursor: progress; opacity: .62; }
.world-challenge-notice { min-height: 0; margin: 0; font-size: .7rem; line-height: 1.35; color: #d9c89a; }
.world-challenge-notice:not(:empty) { min-height: 1.1em; }

/* THE SETTLE BEAT: the ground draws its own outline once in its new owner's colour, then goes. */
.world-settle {
  fill: none; stroke: var(--territory, #e8ddbe); stroke-width: 1.6;
  stroke-linejoin: round; vector-effect: non-scaling-stroke; pointer-events: none;
  stroke-dasharray: 1; stroke-dashoffset: 1;
  animation: world-settle 1250ms cubic-bezier(.22, 1, .36, 1) forwards;
}
@keyframes world-settle {
  0% { stroke-dashoffset: 1; opacity: .95; }
  38% { stroke-dashoffset: 0; opacity: .95; }
  72% { stroke-dashoffset: 0; opacity: .5; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}

/* The one new continuous motion is the ring; reduced motion keeps its DRAINED LENGTH and stops both
   the breath and the smooth fill. The expiry fade is not information on its own. */
@media (prefers-reduced-motion: reduce) {
  /* The .low class carries the breath at higher specificity, so it must be named too. */
  .world-ring, .world-ring.low, .world-ring.done,
  .world-chip-ring-path, .world-chip-ring-path.low {
    transition: none; animation: none;
  }
  .world-ring.done { opacity: 0; }
  /* A chip still appears and a settled tile still marks its new owner — it just does not move. */
  .world-challenge-chip.is-arriving { animation: none; }
  .world-settle { animation: none; opacity: .9; }
}

.world-invitation {
  position: fixed; inset: 0; z-index: 100; display: grid; place-items: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: #050806ae;
}
.world-invitation-card {
  width: min(100%, 360px); padding: 23px 21px 19px; box-sizing: border-box;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  text-align: center; color: #eee3c6; border-radius: 15px;
  border: 1px solid #d8cda557; background: #1c211edb;
  box-shadow: 0 20px 80px #0009; backdrop-filter: blur(10px);
}
.world-invitation-card strong { font-size: 1.16rem; letter-spacing: .1em; }
.world-invitation-card p { margin: 3px 0 13px; line-height: 1.4; }
.world-invitation-card > div { width: 100%; display: flex; gap: 8px; }
.world-invitation-card button {
  flex: 1; min-height: 44px; border-radius: 8px; border: 1px solid #d8cda558;
  color: #eee3c6; background: #343a31; font: inherit; font-size: .75rem; letter-spacing: .06em;
}
.world-invitation-card button:last-child { background: transparent; opacity: .75; }

/* 0.6: a lobby action in flight (find / create / join). The guard refuses a second tap before any
   request; the key it locked says so with aria-busy and a calmer face. NO second spinner: the
   screen's own line (or the waiting screen) already carries the animated dots. */
.online-actions .btn[aria-busy='true'],
.online-actions .btn[aria-busy='true']:disabled {
  cursor: progress;
  opacity: .62;
}


/* ================= THE TERRITORY, ITS OWN WORLD (owner, 2026-10-27) =================
   "Symmetric, elegant, functional, tactile hardware". One centred axis; every control a physical key
   (a 1px top highlight, a darker lip, a press that sinks); one window for every menu. */

/* The column never grows past the screen: a strip or a long name scrolls inside its own box. */
.online-world .online-inner { min-width: 0; max-width: 100vw; overflow: hidden; }
.online-world .online-inner > * { min-width: 0; }
/* ONE WIDTH FOR THE WHOLE COLUMN, so header, wallet, deck, window and selection share both edges:
   on a phone the full column; on a desktop a bigger, still perfectly centred window. */
.online-world { --world-w: min(100%, 1240px, max(388px, calc((100dvh - 262px) * 1.32))); }
.online-world .online-head,
.online-world .world-wallet,
.online-world .online-notice { width: var(--world-w); max-width: var(--world-w); margin-inline: auto; }
.online-world .world-grid { width: var(--world-w); max-width: var(--world-w); }
/* A lowkey world of its own: faint survey contours under everything, centred on the map. */
.online-world::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background:
    repeating-radial-gradient(ellipse 120% 90% at 50% 55%, transparent 0 46px, rgba(232, 221, 197, .028) 46px 47px),
    radial-gradient(ellipse 70% 55% at 50% 50%, rgba(127, 191, 77, .035), transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 52%, #000 40%, transparent 85%);
  mask-image: radial-gradient(ellipse 80% 70% at 50% 52%, #000 40%, transparent 85%);
}
.online-world .online-inner { position: relative; z-index: 1; }

/* ---- THE MENU KEY (owner, 2026-10-28): the one key on the map at rest, top-right ---- */
/* three grille slots, the key's only marking; while its row is out they fold into a close mark */
.world-menu-glyph { display: grid; gap: 3px; width: 18px; }
.world-menu-glyph i { display: block; height: 2px; border-radius: 1px; background: currentColor; opacity: .85;
  /* The middle bar folds with SCALE, not width: a width animation would relayout the MENU key on
     every frame of the row's roll-out, and the glyph is part of that same gesture. The glyph shares
     the row's one vocabulary: it folds away with --ix-close and unfolds with --ix-open. */
  transition: transform var(--ix-close) var(--ix-ease-close), opacity var(--ix-close) var(--ix-ease-close), scale var(--ix-close) var(--ix-ease-close); }
.world-menu-glyph i:nth-child(2) { width: 70%; justify-self: center; }
.world-menu-key[aria-expanded='true'] .world-menu-glyph i { transition-duration: var(--ix-open); transition-timing-function: var(--ix-ease-open); }
.world-menu-key[aria-expanded='true'] .world-menu-glyph i:nth-child(1) { transform: translateY(5px) rotate(45deg); }
.world-menu-key[aria-expanded='true'] .world-menu-glyph i:nth-child(2) { opacity: 0; scale: 0 1; }
.world-menu-key[aria-expanded='true'] .world-menu-glyph i:nth-child(3) { transform: translateY(-5px) rotate(-45deg); }
/* the row's challenges key carries the lamp while the row is out, so MENU's own lamp steps aside */
.world-menu-key[aria-expanded='true'] .world-deck-count { opacity: 0; }
.world-grid > .world-menu-key .world-deck-count { position: absolute; z-index: 2; top: -6px; right: -6px; }
.world-grid > .world-menu-key .world-menu-glyph { position: absolute; z-index: 1; left: 50%; top: 50%; translate: -50% -50%; }
.world-deck-count {
  min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 9px;
  display: inline-grid; place-items: center; font-size: .6rem; font-weight: 700; letter-spacing: 0;
  color: #0f1210; background: #cfc6ac; font-variant-numeric: tabular-nums;
}
.world-deck-count[hidden] { display: none; }
/* A challenge waiting for YOUR answer: the lamp glows (the menu's Territory lamp, same red). */
.world-deck-count.waiting { background: #e07a5f; color: #160b08; box-shadow: 0 0 10px #e07a5f8c; animation: world-lamp 2.4s ease-in-out infinite; }
@keyframes world-lamp { 50% { box-shadow: 0 0 3px #e07a5f4d; } }

/* ---- the one window: under the row of keys, light enough to see the land through ---- */
.world-panel {
  /* It hangs from the key row (10px edge + 44px key + 8px gap), right-aligned with MENU, so the lit
     key stays visible above it and the next key is one tap away. */
  position: absolute; z-index: 4; right: 10px; top: 62px;
  width: min(calc(100% - 20px), 420px); max-height: calc(100% - 72px);
  display: flex; flex-direction: column; overflow: hidden;
  border-radius: 15px; color: #e8ddc5;
  background: rgba(10, 13, 11, .66);
  -webkit-backdrop-filter: blur(6px) saturate(1.05); backdrop-filter: blur(6px) saturate(1.05);
  box-shadow: inset 0 1px 0 #e8ddc514, 0 14px 34px rgba(0, 0, 0, .28);
  transform-origin: top right;
}
.world-panel[hidden] { display: none; }
.world-panel-head {
  display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: center;
  min-height: 46px; padding: 2px; border-bottom: 1px solid #e8ddc512;
}
/* An empty cell the close key's width (left) keeps the title exactly centred. */
.world-panel-spacer { width: 44px; }
.world-panel-title {
  margin: 0; text-align: center; font-size: .66rem; font-weight: 700; letter-spacing: .2em;
  text-transform: uppercase; color: #e8ddc5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.world-panel-close {
  justify-self: center; width: 44px; height: 44px; display: grid; place-items: center;
  border: 0; background: none; color: #cfc6ac; cursor: pointer; border-radius: 9px;
}
.world-panel-close:focus-visible { outline: 2px solid #f2e5c5; outline-offset: -4px; }
.world-panel-body { overflow: auto; overscroll-behavior: contain; touch-action: pan-y; padding: 10px; }
.world-pane { display: none; flex-direction: column; gap: 8px; }
.world-panel[data-pane='challenges'] .world-pane[data-pane='challenges'],
.world-panel[data-pane='ranking'] .world-pane[data-pane='ranking'] { display: flex; }
.world-pane > .world-pane-label:first-child { margin-top: 0; }
.world-pane-label { margin: 4px 4px 0; font-size: .6rem; letter-spacing: .2em; text-transform: uppercase; color: #e8ddc58f; text-align: center; }
.world-pane-empty { margin: 2px 0 6px; text-align: center; font-size: .74rem; color: #e8ddc5a6; }
.world-pane-empty[hidden] { display: none; }

/* the challenge chips, stacked in the window instead of a sideways rail */
.world-panel .world-challenges {
  display: flex; flex-direction: column; gap: 6px; width: 100%; overflow: visible; padding: 0;
}
.world-panel .world-challenges[hidden] { display: flex; }
.world-panel .world-challenges:empty { display: none; }
.world-panel .world-challenge-chip { width: 100%; box-sizing: border-box; }
#online-world-history .world-challenge-chip { opacity: .78; }
.world-panel .world-challenge-more { align-self: center; }

/* YOUR STANDING: the one number to chase, on a recessed plate */
.world-standing {
  display: grid; grid-template-columns: auto 1fr; align-items: baseline; column-gap: 10px; row-gap: 6px;
  padding: 11px 13px 12px; border-radius: 11px;
  background: linear-gradient(#0c0f0dcc, #111512cc);
  box-shadow: inset 0 1px 0 #000a, inset 0 0 0 1px #e8ddc50f;
}
.world-standing[hidden] { display: none; }
.world-standing-place { font-size: 1.15rem; letter-spacing: .1em; color: #f2e7cb; text-transform: uppercase; font-variant-numeric: tabular-nums; }
.world-standing-tiles { justify-self: end; font-size: .62rem; letter-spacing: .18em; color: #e8ddc5a6; }
.world-standing-line { grid-column: 1 / -1; font-size: .64rem; letter-spacing: .16em; text-transform: uppercase; color: #cfc6ac; }
.world-standing-meter { grid-column: 1 / -1; height: 4px; border-radius: 2px; background: #e8ddc514; overflow: hidden; }
.world-standing-meter i {
  display: block; height: 100%; border-radius: 2px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--territory, #cfc6ac) 70%, #000), var(--territory, #cfc6ac));
  box-shadow: 0 0 8px color-mix(in srgb, var(--territory, #cfc6ac) 60%, transparent);
  transition: width 600ms cubic-bezier(.2, .8, .3, 1);
}
/* the ranking */
.world-ranking-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.world-ranking-row {
  width: 100%; display: grid; grid-template-columns: 2.4ch 10px minmax(0, 1fr) auto 3.5ch; align-items: center; gap: 9px;
  min-height: 40px; padding: 0 8px; border: 0; border-radius: 8px; background: transparent; color: #e8ddc5;
  font: inherit; font-size: .74rem; text-align: left; cursor: pointer; font-variant-numeric: tabular-nums;
}
.world-ranking-row:active { background: #e8ddc50d; }
.world-ranking-row.mine { background: #e8ddc514; box-shadow: inset 0 0 0 1px #e8ddc51f; }
.world-ranking-rank { color: #e8ddc570; letter-spacing: .08em; }
.world-ranking-swatch { width: 10px; height: 10px; border-radius: 2px; background: var(--territory); box-shadow: 0 0 6px color-mix(in srgb, var(--territory) 50%, transparent); }
.world-ranking-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: .06em; }
.world-ranking-tiles { text-align: right; font-weight: 700; letter-spacing: .04em; }
.world-ranking-row:focus-visible { outline: 2px solid #f2e5c5; outline-offset: 2px; }

/* THE MAP'S KEYS (owner, 2026-10-28: "teenage engineering/nintendo inspo"). MENU and the four keys it
   slides out are one family: the in-game cockpit key, 44px, radius 12, #111312 under the supplied
   hardware frame, ivory ink (the duel chat key in web/src/online/chat/style.ts is the reference). */
.world-grid > .world-corner, .world-key {
  position: absolute; z-index: 3; box-sizing: border-box;
  width: 44px; height: 44px; min-width: 44px; min-height: 44px; padding: 0; margin: 0;
  display: grid; place-items: center; line-height: 0;
  border: 0; border-radius: 12px; background: #111312; color: var(--control-ivory, #f5edda);
  box-shadow: 0 2px 8px #0007; -webkit-backdrop-filter: none; backdrop-filter: none;
  cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent;
  transition: transform 90ms ease, box-shadow 140ms ease, color 140ms ease, opacity 140ms ease;
}
.world-grid > .world-corner::before, .world-key::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: url('./hardware/button-frame-supplied.webp') center / contain no-repeat;
}
/* Only the icon is lifted above the frame. A wider rule (every svg AND span child) also caught the
   press layer (.press-shade, web/src/logic/press.ts): made relative it became a second grid row and
   pushed every icon ~5px up after the first press. The glyph and the lamp place themselves. */
.world-key > svg { position: relative; z-index: 1; }
.world-grid > .world-corner:active { transform: translateY(1px); }
/* a row key presses with translate and scale, leaving transform to its slide */
.world-key:active { translate: 0 1px; scale: .985; filter: brightness(.96); }
.world-grid > .world-corner:is(:focus-visible, .on, [aria-expanded='true']),
.world-key:focus-visible {
  color: #fff1cf; box-shadow: 0 0 9px var(--light-bloom, rgba(196, 150, 88, .22)), 0 2px 8px #0007;
}
/* Hover glow only where there is a real pointer: on a phone :hover sticks to the last key tapped. */
@media (hover: hover) {
  .world-grid > .world-corner:hover, .world-key:hover {
    color: #fff1cf; box-shadow: 0 0 9px var(--light-bloom, rgba(196, 150, 88, .22)), 0 2px 8px #0007;
  }
}
/* the lit key: its page is open (a lamp under the icon, like a hardware toggle that is ON) */
.world-key.on { color: #fff6dc; box-shadow: 0 0 12px var(--light-bloom, rgba(196, 150, 88, .32)), 0 2px 8px #0007; }
.world-key::after {
  content: ''; position: absolute; z-index: 1; left: 50%; bottom: 5px; width: 10px; height: 2px; translate: -50% 0;
  border-radius: 1px; background: #f2c879; box-shadow: 0 0 6px #f2c879; opacity: 0; transition: opacity var(--ix-press) ease;
}
.world-key.on::after { opacity: 1; }
.world-grid > .world-corner:focus, .world-key:focus { outline: none; }
.world-grid > .world-corner:focus-visible, .world-key:focus-visible { outline: 2px solid #f2e5c5; outline-offset: 2px; }
.world-grid > .world-menu-key { top: 10px; right: 10px; left: auto; bottom: auto; }
.world-key-icon { width: 21px; height: 21px; opacity: .94; overflow: visible; }
.world-key-icon .line { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
.world-key-icon .fill { fill: currentColor; }
.world-key-icon text { fill: currentColor; font: 700 5.6px/1 system-ui, sans-serif; }
.world-key .world-deck-count { position: absolute; z-index: 2; top: -6px; right: -6px; }
/* THE ROW: the keys to MENU's left, on the same 10px edge, 8px apart. At rest they are tucked
   behind MENU (transparent, inert); MENU rolls them out one after another, nearest first, on the
   compositor only (transform + opacity), and folds them back with the SAME gesture mirrored.
   ONE motion, from the interface vocabulary: the arrival is --ix-open / --ix-ease-open, the fold
   is --ix-close / --ix-ease-close, and BOTH directions share ONE stagger formula
   (--key-order * --key-stagger) whose order the view stamps onto each key. The keys are small,
   so the gesture lands in ~190ms (150ms of travel + two 18ms waves): fast enough to never be
   waited on, long enough to read as a roll-out rather than a pop. */
.world-keys {
  position: absolute; z-index: 3; top: 10px; right: 62px;
  display: flex; gap: 8px; pointer-events: none;
  /* The wave's gap: a fifth of a press, so it is derived from the vocabulary, not a new duration. */
  --key-stagger: calc(var(--ix-press) / 5);
  /* A folded row leaves quicker than an open one arrives (the vocabulary's own asymmetry). */
  --key-move: var(--ix-close);
  --key-ease: var(--ix-ease-close);
}
.world-keys.open {
  pointer-events: auto;
  --key-move: var(--ix-open);
  --key-ease: var(--ix-ease-open);
}
.world-keys .world-key {
  /* The travel order, stamped from the live row (WorldView): 0 is the key nearest MENU. Closed it
     is the MIRROR of the open order, so the fold is the same gesture played back, and the fallbacks
     keep a row sane if it were ever built without the stamp. */
  --key-order: calc(var(--key-count, 1) - 1 - var(--key-i, 0));
  --key-wave: calc(var(--key-order) * var(--key-stagger));
  position: relative; opacity: 0; transform: translateX(calc(var(--key-i, 0) * 52px + 52px)) scale(.86);
  /* ONE transition list, three jobs: transform/opacity roll the key out, scale/translate answer the
     press, colour and the lamp ease. This is the fix for the old "random speed": two transition
     shorthands used to fight on this element, the later one dropped the other's properties, and its
     stagger ALSO delayed the press - by a different amount per key and per state. Now the wave sits
     on the two roll-out properties only; the press is always --ix-press, undelayed. */
  transition-property: transform, opacity, scale, translate, box-shadow, color;
  transition-duration: var(--key-move), var(--key-move), var(--ix-press), var(--ix-press), var(--ix-press), var(--ix-press);
  transition-timing-function: var(--key-ease), var(--key-ease), var(--ix-ease-open), var(--ix-ease-open), var(--ix-ease-open), var(--ix-ease-open);
  transition-delay: var(--key-wave), var(--key-wave), 0ms, 0ms, 0ms, 0ms;
  /* Ready before the tap: the layer exists at rest, so opening needs no rasterisation on frame one. */
  will-change: transform, opacity;
}
.world-keys.open .world-key {
  /* Opening leads with the key nearest MENU; the rest follow outward. */
  --key-order: var(--key-i, 0);
  opacity: 1; transform: translateX(0) scale(1);
}
.world-keys:not(.open) .world-key { pointer-events: none; }
@media (prefers-reduced-motion: reduce) {
  .world-keys .world-key, .world-menu-glyph i { transition: none; }
  .world-keys .world-key { will-change: auto; }
}
html.reduce-motion :is(.world-keys .world-key, .world-menu-glyph i) { transition: none; }
html.reduce-motion .world-keys .world-key { will-change: auto; }

/* ---- TERRITORY CHAT: hangs from the key row like the other windows, on the same glass ---- */
.world-chat {
  position: absolute; z-index: 4; right: 10px; top: 62px;
  width: min(calc(100% - 20px), 420px); max-height: calc(100% - 72px);
  display: flex; flex-direction: column; gap: 6px; padding: 10px; box-sizing: border-box;
  border-radius: 15px; color: #e8ddc5; background: rgba(10, 13, 11, .62);
  -webkit-backdrop-filter: blur(6px) saturate(1.05); backdrop-filter: blur(6px) saturate(1.05);
  box-shadow: inset 0 1px 0 #e8ddc514, 0 14px 34px rgba(0, 0, 0, .28);

}
.world-chat[hidden] { display: none; }
@keyframes world-chat-in { from { opacity: 0; translate: 0 6px; } to { opacity: 1; translate: 0 0; } }
.world-chat-list {
  list-style: none; margin: 0; padding: 0 2px; min-height: 0; flex: 1 1 auto; overflow: auto;
  overscroll-behavior: contain; touch-action: pan-y; display: flex; flex-direction: column; gap: 6px;
}
.world-chat-line { display: grid; gap: 2px; padding: 4px 6px; border-radius: 8px; font-size: .74rem; line-height: 1.35; cursor: default; }
.world-chat-line:not(.mine) { cursor: pointer; }
.world-chat-line.picked { background: #e8ddc50f; }
.world-chat-line:focus-visible { outline: 2px solid #f2e5c5; outline-offset: 1px; }
.world-chat-who { display: flex; gap: 6px; align-items: baseline; font-size: .58rem; letter-spacing: .14em; text-transform: uppercase; }
.world-chat-who b { color: #f2e7cb; font-weight: 700; }
.world-chat-line.mine .world-chat-who b { color: #cfc6acb3; }
.world-chat-text { color: #e8ddc5; overflow-wrap: anywhere; letter-spacing: .02em; }
.world-chat-mod { display: flex; gap: 6px; margin-top: 4px; }
.world-chat-mod button {
  min-height: 44px; padding: 0 12px; border: 0; border-radius: 8px; cursor: pointer; color: #e8ddc5;
  background: linear-gradient(#1f241f, #191d19); box-shadow: inset 0 1px 0 #e8ddc51f, inset 0 -2px 0 #00000059;
  font: inherit; font-size: .58rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
}
.world-chat-empty { margin: 4px 0; text-align: center; font-size: .7rem; color: #e8ddc58f; }
.world-chat-empty[hidden] { display: none; }
.world-chat-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
.world-chat-input {
  min-width: 0; height: 44px; padding: 0 12px; box-sizing: border-box; border: 0; border-radius: 10px;
  background: #0a0d0bcc; color: #f2e7cb; box-shadow: inset 0 1px 0 #000a, inset 0 0 0 1px #e8ddc50d;
  font: inherit; font-size: 16px; letter-spacing: .02em;
}
.world-chat-input::placeholder { color: #e8ddc566; }
.world-chat-input:focus { outline: none; box-shadow: inset 0 1px 0 #000a, inset 0 0 0 1px #d5c89b52; }
.world-chat-send {
  height: 44px; padding: 0 14px; border: 0; border-radius: 10px; cursor: pointer;
  color: #161a16; background: linear-gradient(#efe4c8, #ddd1b2); box-shadow: inset 0 1px 0 #fff8, inset 0 -2px 0 #0000002e;
  font: inherit; font-size: .62rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
}
.world-chat-send:active { transform: translateY(1px); }
.world-chat-status { margin: 0; min-height: 0; font-size: .64rem; text-align: center; color: #e8ddc5a6; }
.world-chat-status:empty { display: none; }
@media (prefers-reduced-motion: reduce) { .world-chat { animation: none; } }
html.reduce-motion .world-chat { animation: none; }
/* the notice: one centred axis, like everything else on this screen */
.online-world .online-notice { text-align: center; }

/* ---- the fog, alive: two rings breathing at different paces ---- */
.world-fog { fill: #1b201c; stroke: #8f977f; stroke-width: .4; stroke-dasharray: 1.6 2.4; vector-effect: non-scaling-stroke; pointer-events: none; }
.world-fog-ring.ring-1 { opacity: .42; animation: world-mist 9s ease-in-out infinite; }
.world-fog-ring.ring-2 { opacity: .16; animation: world-mist-far 13s ease-in-out infinite; }
@keyframes world-mist { 50% { opacity: .26; } }
@keyframes world-mist-far { 50% { opacity: .07; } }
/* ---- new land rises in ---- */
@keyframes world-rise {
  0% { opacity: 0; transform: translateY(5px) scale(.55); }
  60% { opacity: 1; transform: translateY(-1px) scale(1.06); }
  100% { opacity: 1; transform: none; }
}
.world-hex-face.rising { transform-box: fill-box; transform-origin: center; animation: world-rise 520ms cubic-bezier(.2, .9, .3, 1.2) both; animation-delay: var(--rise-delay, 0ms); }
/* ---- your tiles catch the light, one after another ---- */
.world-hex-face.mine { animation: world-glint 11s ease-in-out infinite; animation-delay: var(--glint-delay, 0s); }
.world-hex-face.mine.rising { animation: world-rise 520ms cubic-bezier(.2, .9, .3, 1.2) both; }
@keyframes world-glint { 0%, 82%, 100% { filter: none; } 91% { filter: brightness(1.24); } }
/* ---- fresh ground glows from underneath for six hours (a blurred halo; the edge stays crisp) ---- */
.world-halo { fill: none; stroke: color-mix(in srgb, var(--territory) 60%, #fff4d6); stroke-width: 2.2; opacity: .13; pointer-events: none;
  animation: world-halo 3.6s ease-in-out infinite; animation-delay: var(--halo-delay, 0s); }
@keyframes world-halo { 50% { opacity: .28; } }
/* ---- the outline of your land: a soft glow under a fine edge, breathing very slowly ---- */
.world-border path { fill: none; pointer-events: none; stroke-linecap: round; }
.world-border-edge { stroke: color-mix(in srgb, var(--territory, #cfc6ac) 40%, #fff4d6); stroke-width: .8; stroke-opacity: .8; }
.world-border-glow { stroke: color-mix(in srgb, var(--territory, #cfc6ac) 70%, #fff4d6); stroke-width: 2; opacity: .22; animation: world-border 7s ease-in-out infinite; }
@keyframes world-border { 50% { opacity: .12; } }
/* ---- the grow ripple: two soft rings leave the new tile ---- */
.world-ripple { fill: none; stroke: color-mix(in srgb, var(--territory, #cfc6ac) 50%, #fff4d6); stroke-width: 1.2; opacity: 0; pointer-events: none;
  transform-box: fill-box; transform-origin: center; animation: world-ripple 1.2s cubic-bezier(.15, .7, .3, 1) both; animation-delay: var(--ripple-delay, 0ms); }
@keyframes world-ripple { 0% { opacity: .85; transform: scale(1); } 100% { opacity: 0; transform: scale(3.2); stroke-width: .3; } }
/* ---- spores drift off held ground ---- */
.world-spore { fill: #e8ddc5; opacity: 0; pointer-events: none; animation: world-spore 12s ease-in-out infinite; animation-delay: var(--spore-delay, 0s); transform-box: fill-box; }
@keyframes world-spore {
  0% { opacity: 0; transform: translate(0, 0); }
  15% { opacity: .6; }
  70% { opacity: .22; }
  100% { opacity: 0; transform: translate(3px, -16px); }
}
@media (prefers-reduced-motion: reduce) {
  .world-fog-ring, .world-hex-face.mine, .world-halo, .world-border-glow, .world-spore, .world-hex-face.rising, .world-deck-count.waiting { animation: none; }
  .world-spore, .world-ripples { display: none; }
}
html.reduce-motion :is(.world-fog-ring, .world-hex-face.mine, .world-halo, .world-border-glow, .world-spore, .world-hex-face.rising, .world-deck-count.waiting) { animation: none; }
html.reduce-motion :is(.world-spore, .world-ripples) { display: none; }

/* ================= THE DESKTOP STAGE (owner, 2026-10-28: "make the map bigger, use the space
   better … SICK but elegant"; a global chat will later lay dark glass over the whole map).
   On a wide screen the map is no longer a box in a column: it is the STAGE, filling everything
   under the header, and the screen's few words float over it as glass pills on one centred axis —
   Seeds and the coordinates on top, the notice, the selected tile and the menu key at the foot.
   One surface, so the chat's glass can cover it whole. Phones keep the column. */
@media (min-width: 960px) and (min-height: 560px) and (min-aspect-ratio: 5/4) {
  .online-world { --world-w: min(100%, 1720px); }
  .online-world .online-inner {
    display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr);
    row-gap: 10px; justify-items: center; align-items: start;
  }
  .online-world .online-inner > * { grid-column: 1; }
  .online-world .online-head { grid-row: 1; width: var(--world-w); max-width: var(--world-w); }
  .online-world .world-grid {
    grid-row: 2; align-self: stretch; height: auto; max-height: none; margin: 0;
    width: var(--world-w); max-width: var(--world-w); border-radius: 20px;
    box-shadow: inset 0 0 0 1px rgba(232, 221, 190, .05), inset 0 30px 90px #090c0b80, 0 30px 80px #0006;
  }
  /* a deeper vignette: the stage's edges fall away into the dark, the centre holds the light */
  .online-world .world-grid::after { background: radial-gradient(ellipse 72% 70% at 50% 48%, transparent 46%, #060807d9 100%); }
  /* the floating HUD: every pill sits in the stage's own cell, above the map */
  .online-world :is(#online-world-wallet, #daily-place, #online-world-live, #online-world-notice) {
    grid-row: 2; position: relative; z-index: 5; width: auto; max-width: min(680px, calc(var(--world-w) - 200px)); margin: 0;
  }
  .online-world #online-world-live { position: absolute; }
  .online-world #online-world-wallet {
    align-self: start; margin-top: 14px; min-height: 38px; padding: 0 18px; border-radius: 19px;
    background: rgba(10, 13, 11, .56); -webkit-backdrop-filter: blur(10px) saturate(1.1); backdrop-filter: blur(10px) saturate(1.1);
    box-shadow: inset 0 1px 0 #e8ddc514, 0 8px 22px #0005;
  }
  .online-world #daily-place { align-self: start; margin-top: 92px; }
  .online-world .world-selection { bottom: 14px; min-height: 52px; padding: 6px 7px 6px 20px; border-radius: 16px; font-size: .78rem; }
  .online-world .world-selection:not(.has-action) { padding: 6px 20px; }
  .online-world #online-world-notice {
    align-self: end; margin-bottom: 78px; min-height: 0; padding: 7px 14px; border-radius: 10px;
    background: rgba(10, 13, 11, .5); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  }
  .online-world #online-world-notice:empty { display: none; }
  /* the keys sit in a little from the stage's rounded corners, on one 14px edge; the windows hang
     from the row like on a phone, a fixed width at the right */
  .online-world .world-grid > .world-menu-key { top: 14px; right: 14px; }
  .online-world .world-keys { top: 14px; right: 66px; }
  .online-world :is(.world-panel, .world-chat) { top: 68px; right: 14px; width: 420px; max-height: calc(100% - 82px); }
}

/* Every free tile is open to grow now, so "available" is a quiet lift; the board's own global
   .available (a dashed onboarding ring with pointer-events: none) must never leak onto the world. */
.world-hex.available { stroke: #858d7c; stroke-width: .42; stroke-dasharray: none; stroke-opacity: 1; pointer-events: all; }

/* Your land has a distinct ivory rim, independent of player colour, with a quiet glow underneath. */
.world-border-edge {stroke:#f2e5c5;stroke-width:1.15;stroke-opacity:.9;}
.world-border-glow {stroke-width:2.8;opacity:.26;}

.online-world .world-chat.keyboard {position:fixed;left:max(8px,env(safe-area-inset-left));right:auto;width:min(400px,calc(100vw - 16px - env(safe-area-inset-left) - env(safe-area-inset-right)));z-index:70;}
/* THE MAP IN MOTION (world-view.ts, setMoving): while a finger pans or pinches, or the view glides,
   the soft-focus blurs are drawn sharp and the ambient loops hold still. A blur re-renders on every
   frame the view moves; this is what keeps a pan at 60 fps on a mid phone. */
.world-grid.moving .world-map-svg [filter] { filter: none; }
.world-grid.moving .world-map-svg :is(.world-fog-ring, .world-hex-face.mine, .world-halo, .world-border-glow, .world-spore) { animation-play-state: paused; }
.world-grid.moving .world-map-svg .world-accent-line { filter: none; }
`;
