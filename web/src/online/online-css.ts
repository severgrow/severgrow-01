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
/* The duel status row: a slim strip that sits IN the fixed header row, between the 44px menu
   button (left) and the brand/logo (right). It is positioned, so it can never cover either, and it
   is held above the board (its bottom stays in the header band). No frame or border contour — the
   same dark glass as the rest of the product. The left/right insets reuse the header's 8px gap. */
.duel-hud {
  position: fixed;
  top: env(safe-area-inset-top, 0px);
  left: calc(58px + env(safe-area-inset-left, 0px));
  /* 44px menu + 6px header padding + 8px gap, and the logo's max 90px + 6px padding + 8px gap. */
  right: calc(104px + env(safe-area-inset-right, 0px));
  z-index: 8;
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  align-content: center;
  column-gap: 8px;
  row-gap: 0;
  padding: 0 2px;
  font-size: 0.8rem;
  line-height: 1.15;
  min-height: 48px;
  overflow: visible;
  background: color-mix(in srgb, #161a16 92%, #000);
  border: 0;
}
/* Only the strip's own controls take taps; the header's menu button underneath stays reachable. */
.duel-hud > * {
  min-width: 0;
}
.duel-hud .duel-opp {
  display: none; /* the phone is too narrow for a name; the board and score already say who is who */
  order: 0;
  flex: 0 1 auto;
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.duel-hud [data-duel-turn] {
  order: 1;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.duel-hud .duel-deadline {
  order: 2;
  flex: 0 0 auto;
  margin-left: auto;
  white-space: nowrap;
}
.duel-hud .duel-notice {
  order: 9;
  flex: 1 1 auto;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}
.duel-hud #duel-resign {
  flex: 0 0 auto;
  order: 10;
  align-self: center;
  min-height: 44px;
  min-width: 44px;
}
/* Phones: exactly two tidy rows, no wrapping — turn + deadline above, who-starts + Resign below.
   A grid keeps the height predictable (and slim) at any width. */
@media (max-width: 600px) {
  .duel-hud {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    align-content: center;
    align-items: center;
    column-gap: 8px;
    row-gap: 0;
    padding: 1px 2px;
    line-height: 1;
  }
  .duel-hud .duel-opp {
    display: none;
  }
  .duel-hud [data-duel-turn] {
    grid-row: 1;
    grid-column: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .duel-hud .duel-deadline {
    grid-row: 1;
    grid-column: 2;
    justify-self: end;
    margin-left: 0;
  }
  .duel-hud .duel-starter {
    grid-row: 2;
    grid-column: 1;
    justify-self: start;
  }
  .duel-hud .duel-notice {
    grid-row: 2;
    grid-column: 1;
    justify-self: start;
    max-width: 100%;
  }
  .duel-hud #duel-resign {
    grid-row: 2;
    grid-column: 2;
    justify-self: end;
  }
}
/* Wider screens have room for the opponent's name and a single, tidy row. */
@media (min-width: 601px) {
  .duel-hud {
    flex-wrap: nowrap;
    height: var(--hud-h, 48px);
  }
  .duel-hud .duel-opp {
    display: inline-flex;
    align-items: center;
    order: 0;
  }
  .duel-hud .duel-starter {
    order: 3;
  }
  .duel-hud .duel-deadline {
    order: 4;
    margin-left: 0;
  }
  .duel-hud .duel-notice {
    order: 5;
  }
  .duel-hud #duel-resign {
    order: 6;
    margin-left: auto;
  }
}
.duel-hud [data-duel-presence]::before {
  content: '';
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  margin-right: 0.3rem;
  background: #6a7468;
}
.duel-hud [data-duel-presence][data-presence="online"]::before { background: #8fbf6a; }
.duel-hud [data-duel-presence][data-presence="away"]::before { background: #c9a35a; }
.duel-hud .duel-deadline[data-tone="amber"] { color: #d4a24a; }
.duel-hud .duel-deadline[data-tone="red"] { color: #e07a5f; }
.duel-hud .duel-notice {
  color: #e2c48a;
}
/* Permanent "who starts" chip. Never colour-only (a flag icon plus a word), legible at 360x640,
   and it stays on one line so it cannot push the Resign control out of the strip. */
.duel-hud .duel-starter {
  flex: 0 0 auto;
  order: 3;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, currentColor 26%, transparent);
  font-size: 0.78rem;
  line-height: 1.1;
  white-space: nowrap;
}
.duel-hud .duel-starter[hidden] { display: none; }
.duel-hud .duel-starter-icon { width: 1em; height: 1em; flex: 0 0 auto; }
.duel-hud .duel-starter[data-starter="me"] {
  background: color-mix(in srgb, #3d7a4a 42%, #161a16);
  border-color: color-mix(in srgb, #8fbf6a 55%, transparent);
}
.duel-hud .duel-starter[data-starter="opponent"] {
  background: color-mix(in srgb, #b86a2c 34%, #161a16);
  border-color: color-mix(in srgb, #d4a24a 55%, transparent);
}
`;
