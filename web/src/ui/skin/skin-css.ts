// Styles for skinned boards (injected once by SkinBoardView; inert anywhere else).
export const SKIN_CSS = `
.skin-board .skin-cell { stroke: rgba(4, 5, 5, 0.32); stroke-width: 0.7; }
.skin-board .skin-proxy { pointer-events: none; }
.skin-board .skin-fill, .skin-board .skin-edge { pointer-events: none; }
.skin-board .skin-edge { fill: none; stroke: rgba(6, 8, 7, 0.45); stroke-width: 0.9; stroke-linecap: round; }
.skin-board .skin-rocks { pointer-events: none; }
.skin-board .skin-tile-art { pointer-events: none; }
.skin-board .skin-tile-art.cut { filter: saturate(0.45) brightness(0.72); }
.skin-board .skin-prop, .skin-board .skin-scar, .skin-board .skin-home-layer { pointer-events: none; }
.skin-board .skin-link { pointer-events: none; stroke-linejoin: round; }
.skin-board .skin-link.loose { opacity: 0.45; }
.skin-board .skin-link.grow-in { stroke-dasharray: 1; animation: draw-on calc(0.34s * var(--anim, 1)) ease-out both; }
.skin-board .skin-flow { stroke-dasharray: 0.05 0.035; animation: skin-flow 1.7s linear infinite; }
@keyframes skin-flow { to { stroke-dashoffset: -0.085; } }
.skin-board .landmark.skin-has-art .lm-sprite { display: none; }
.skin-board .skin-sway { transform-box: fill-box; transform-origin: 50% 85%; animation: skin-sway 5.2s ease-in-out infinite; }
@keyframes skin-sway { 0%, 100% { transform: rotate(-1.6deg); } 50% { transform: rotate(1.6deg); } }
.skin-board .skin-pulse { animation: skin-pulse 3.4s ease-in-out infinite; }
@keyframes skin-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
.skin-board .skin-drift { transform-box: fill-box; transform-origin: 50% 50%; animation: skin-drift 6s ease-in-out infinite; }
@keyframes skin-drift { 0% { transform: translate(0, 0); opacity: 0; } 30% { opacity: 0.8; } 100% { transform: translate(3px, -9px); opacity: 0; } }
.skin-board .skin-mote { pointer-events: none; transform-box: fill-box; transform-origin: 50% 50%; animation-timing-function: ease-in-out; animation-iteration-count: infinite; opacity: 0; }
.skin-board .skin-mote.rise { animation-name: skin-rise; }
.skin-board .skin-mote.fall { animation-name: skin-fall; }
@keyframes skin-rise { 0% { transform: translate(0, 0) scale(0.6); opacity: 0; } 15% { opacity: 0.9; } 70% { opacity: 0.55; } 100% { transform: translate(3px, -18px) scale(1); opacity: 0; } }
@keyframes skin-fall { 0% { transform: translate(0, 0) rotate(0deg); opacity: 0; } 15% { opacity: 0.85; } 75% { opacity: 0.6; } 100% { transform: translate(9px, 16px) rotate(140deg); opacity: 0; } }
.skin-board .skin-glow { opacity: 0; animation: skin-glow 7s ease-in-out infinite; }
@keyframes skin-glow { 0%, 42%, 100% { opacity: 0; } 58% { opacity: 0.4; } 78% { opacity: 0.1; } }
.skin-board .skin-breathe { animation: skin-breathe 6.5s ease-in-out infinite; }
@keyframes skin-breathe { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.07) saturate(1.06); } }
.skin-board .skin-firefly { transform-box: fill-box; transform-origin: center; opacity: 0; animation: skin-firefly 9s ease-in-out infinite; }
@keyframes skin-firefly { 0%, 52%, 100% { opacity: 0; transform: translate(0, 0) scale(0.6); } 60% { opacity: 1; transform: translate(1.5px, -2px) scale(1); } 68% { opacity: 0.35; } 76% { opacity: 1; transform: translate(-1px, -6px) scale(0.9); } 90% { opacity: 0; transform: translate(2.5px, -10px) scale(0.6); } }
.skin-board .skin-lava-glow { pointer-events: none; opacity: 0; animation: skin-lava 5s ease-in-out infinite; }
@keyframes skin-lava { 0%, 100% { opacity: 0; } 35% { opacity: 0.2; } 55% { opacity: 0.42; } 75% { opacity: 0.12; } }
.skin-board .skin-ember { pointer-events: none; opacity: 0; animation: skin-ember 7s ease-out infinite; }
@keyframes skin-ember { 0%, 64%, 100% { opacity: 0; transform: translate(0, 0) scale(0.5); } 68% { opacity: 1; transform: translate(0, -1px) scale(1); } 74% { opacity: 0.5; } 80% { opacity: 1; } 96% { opacity: 0; transform: translate(2.5px, -11px) scale(0.6); } }
.skin-board .skin-tile-smoke { pointer-events: none; opacity: 0; animation: skin-tile-smoke 11s ease-out infinite; }
@keyframes skin-tile-smoke { 0%, 70%, 100% { opacity: 0; transform: translate(0, 0) scale(0.6); } 78% { opacity: 0.75; } 99% { opacity: 0; transform: translate(3px, -12px) scale(1.25); } }
.reduce-motion .skin-board .skin-lava-glow, .reduce-motion .skin-board .skin-ember, .reduce-motion .skin-board .skin-tile-smoke { display: none; }
.skin-board .skin-art-link.grow-in { stroke-dasharray: none; animation: skin-link-in calc(0.4s * var(--anim, 1)) ease-out both; transform-box: fill-box; transform-origin: 0 50%; }
@keyframes skin-link-in { from { transform: scaleX(0.2); opacity: 0; } to { transform: none; opacity: 1; } }
.skin-board .skin-vine { transform-box: fill-box; transform-origin: center; animation: skin-vine 6s ease-in-out infinite; }
@keyframes skin-vine { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.01, 1.08); } }
.skin-board .skin-lava-flow { pointer-events: none; opacity: 0; animation: skin-lava 4s ease-in-out infinite; }
.reduce-motion .skin-board .skin-vine { animation: none; }
.reduce-motion .skin-board .skin-lava-flow { display: none; }
.skin-board .skin-life { pointer-events: none; }
.skin-board .skin-wander { opacity: 0; animation: skin-wander 30s ease-in-out infinite; }
@keyframes skin-wander { 0%, 58%, 100% { opacity: 0; } 64%, 92% { opacity: 1; } }
.skin-board .skin-bob { animation: skin-bob 2s ease-in-out infinite; }
@keyframes skin-bob { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(0, -1.6px); } }
.skin-board .skin-wing { animation: skin-wing 0.35s ease-in-out infinite alternate; }
@keyframes skin-wing { from { transform: scaleX(1); } to { transform: scaleX(0.2); } }
.skin-board .skin-spin { animation: skin-spin 6s linear infinite; }
@keyframes skin-spin { to { transform: rotate(360deg); } }
.skin-board .skin-flame { opacity: 0; animation: skin-flame 9s ease-out infinite; }
@keyframes skin-flame { 0%, 80%, 100% { opacity: 0; } 83% { opacity: 1; } 92% { opacity: 0.85; } 97% { opacity: 0; } }
.skin-board .skin-lick { transform-box: fill-box; transform-origin: 50% 100%; animation: skin-lick 0.5s ease-in-out infinite alternate; }
@keyframes skin-lick { from { transform: scale(0.85, 0.9) skewX(-4deg); } to { transform: scale(1.05, 1.15) skewX(4deg); } }
.skin-board .skin-soot { opacity: 0; animation: skin-soot 12s ease-out infinite; }
.skin-board .skin-flame-light { opacity: 0.8; }
.skin-board .skin-spark { animation: skin-spark 0.9s ease-out infinite; }
@keyframes skin-spark { 0% { transform: translate(0, 0); opacity: 1; } 100% { transform: translate(1.2px, -6px); opacity: 0; } }
@keyframes skin-soot { 0%, 72%, 100% { opacity: 0; transform: translate(0, 0) scale(0.6); } 78% { opacity: 0.55; } 99% { opacity: 0; transform: translate(3px, -14px) scale(1.4); } }
.reduce-motion .skin-board .skin-life { display: none; }
.reduce-motion .skin-board .skin-mote { display: none; }
.reduce-motion .skin-board .skin-later { display: none; }
.reduce-motion .skin-board .skin-glow, .reduce-motion .skin-board .skin-firefly { display: none; }
.reduce-motion .skin-board .skin-breathe, .reduce-motion .skin-board .skin-sway, .reduce-motion .skin-board .skin-pulse, .reduce-motion .skin-board .skin-drift, .reduce-motion .skin-board .skin-flow { animation: none; }
`;
