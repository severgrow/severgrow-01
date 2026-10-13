/** Compact online lobby styles (Phase 4). Injected once beside player CSS. */
export const ONLINE_CSS = `
.online-hub .online-inner,
.online-waiting .online-inner,
.online-join .online-inner {
  max-width: 28rem;
  margin: 0 auto;
  padding: 1rem 1.1rem 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-height: 100%;
  box-sizing: border-box;
}
.online-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
}
.online-head h2 {
  margin: 0;
  font-size: 1.25rem;
  letter-spacing: 0.04em;
}
.online-actions {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.online-actions .btn {
  min-height: 44px;
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
  font-size: 2rem;
  letter-spacing: 0.28em;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  margin: 0.4rem 0;
}
.online-card {
  padding: 0.9rem 1rem;
  border-radius: 12px;
  background: color-mix(in srgb, #243024 90%, #000);
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
}
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
/* The duel HUD is a slim strip shown only in online duels. The brand header is a fixed overlay at
   the top of the game screen (z-index 7), so the strip is lifted above both it and the board and
   starts after the header's 44px menu button. Everything stays on one line so the Resign control
   never wraps out of the strip, and the strip's own box never intercepts the menu button. */
.duel-hud {
  position: relative;
  z-index: 8;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.4rem 0.5rem;
  margin-left: 52px;
  padding: 0 0.75rem;
  font-size: 0.85rem;
  min-height: 48px;
  overflow: visible;
  background: color-mix(in srgb, #161a16 92%, #000);
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
}
/* Only the strip's own controls take taps; the header's menu button underneath stays reachable. */
.duel-hud > * {
  min-width: 0;
}
.duel-hud .duel-opp {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.duel-hud [data-duel-turn],
.duel-hud .duel-deadline {
  flex: 0 0 auto;
  white-space: nowrap;
}
.duel-hud .duel-notice {
  flex: 1 1 auto;
  order: 9;
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
  min-height: 48px;
  min-width: 48px;
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
`;
