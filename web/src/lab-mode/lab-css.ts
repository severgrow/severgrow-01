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
`;
