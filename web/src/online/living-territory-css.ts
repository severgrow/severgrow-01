import { INTERFACE_MOTION as motion } from '../ui/interface-motion.js';
export const LIVING_TERRITORY_CSS=`
/* One SVG, one camera, one physical viewport. Hidden here means the Territory SCREEN is inactive;
   only its inert artwork is deliberately painted behind the menu. No second map or canvas. */
#online-world-screen[data-living-territory="menu"][hidden] { display:grid!important;z-index:1;pointer-events:none; }
#menu[data-living-world] { z-index:2; }
#online-world-screen[data-living-territory="menu"] .online-inner > :not(.world-grid),
#online-world-screen[data-living-territory="menu"] .world-grid > :not(.world-map-svg) { visibility:hidden; }
#online-world-screen[data-living-territory="menu"]::before { opacity:0; }
#online-world-screen[data-living-territory="menu"] .world-grid { background:transparent;box-shadow:none; }
#online-world-screen[data-living-territory="menu"] .world-grid::after { opacity:0; }
#online-world-screen[data-living-territory] .world-map-svg {
  transform-origin:center;
  transition:opacity ${motion.open}ms ${motion.easeOpen},transform ${motion.open}ms ${motion.easeOpen};
}
#online-world-screen[data-living-territory="menu"] .world-map-svg { opacity:.28;transform:scale(${motion.scale}); }
#online-world-screen[data-living-territory="menu"] .world-map-svg * { animation-play-state:paused!important; }
@starting-style { #online-world-screen[data-living-territory="menu"] .world-map-svg { opacity:0; } }
/* A shared rhythm links the logo, title and keys. Short screens compress space, never tap targets. */
#menu[data-living-world] .menu-inner { --living-space:clamp(6px,1.6dvh,16px);--menu-rhythm:var(--living-space);--menu-head-gap:calc(2 * var(--living-space)); }
@media(min-height:600px) {
 #menu[data-living-world] .menu-inner { height:auto;justify-content:center;gap:calc(3 * var(--living-space)); }
}
html.reduce-motion #online-world-screen[data-living-territory] .world-map-svg { transition:none;transform:none; }
@media(prefers-reduced-motion:reduce) { #online-world-screen[data-living-territory] .world-map-svg { transition:none;transform:none; } }
`;
