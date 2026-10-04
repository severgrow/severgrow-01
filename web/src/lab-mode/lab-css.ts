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
`;
