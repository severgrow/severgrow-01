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
   The world is very nearly square (274.49 x 272 units), so on a portrait phone filling the height
   means the map is wider than the column and the surplus is cropped horizontally — the window shows
   the world's middle and pans to the edges (world-view.ts frames the view to the window's own
   aspect, clamped to the world's extent). Cropping, never stretching: the SVG scales uniformly, so
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
  width: min(100%, 1100px, calc((100dvh - 210px) * 274.49 / 272));
  max-height: 100%; margin: 0 auto;
  display: grid; place-items: center; overflow: hidden;
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
.world-hex.available { stroke: #c9c89c; stroke-width: .65; }
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
/* The controls anchor to the bottom of the column (owner, 2026-10-16). Now that the window hugs the
   map instead of filling the column, the leftover height would otherwise collect under the
   selection bar as dead space at the very bottom. Pushing the controls down keeps the column
   spanning the viewport and keeps the one real action (GROW A TILE) at thumb height, where it
   already was before. The header -> summary -> Seeds -> window steps above stay on the column's own
   rhythm; this is the ONE deliberate break in it, and it is the bottom anchor, not a gap. */
.world-selection {
  margin-top: auto;
  min-height: 58px; width: min(100%, 720px); margin-inline: auto;
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  /* NO RULE ABOVE THE HINT (owner, 2026-10-17: a line under the map, between it and "Choose a
     tile to see who holds it", was redundant). The bar is separated from the map by its own
     min-height alone; the space does the dividing, so nothing draws a divider. */
  color: #e8ddbe; font-size: .83rem; letter-spacing: .04em;
}
.world-claim-button {
  min-height: 44px; padding: 0 17px; flex: none;
  color: #eee3c6; background: #2b3029; border: 1px solid #d5c89b7a;
  border-radius: 9px; font: inherit; font-weight: 700; letter-spacing: .08em;
}
.online-world .online-notice { min-height: 20px; max-width: 720px; width: 100%; margin: 0 auto; }
/* A short (640px) phone: one small, deliberate step tighter — 6px, not 3px crumbs — and a shallower
   selection bar, so the map keeps the room it needs without the column reading as cramped. */
@media (max-height: 650px) { .online-world .online-inner { gap: 6px; } .world-selection { min-height: 48px; } }
@media (prefers-reduced-motion: reduce) { .world-hex, .world-hex-face { transition: none; } }

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

`;

