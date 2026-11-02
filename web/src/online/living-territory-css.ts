import { INTERFACE_MOTION as motion } from '../ui/interface-motion.js';
/** The menu map's rest opacity. OWNER, 2026-11-02: "decrease opacity by further 7%", then
 * "decrease color intensity in background living territory in main menu by 10%". Both are
 * MULTIPLICATIVE on the present value, never points off 1: 0.28 x 0.93 x 0.90 = 0.23436. The
 * Territory screen keeps 1; only the menu's backdrop is dimmed. */
export const MENU_MAP_OPACITY = 0.23436;
export const LIVING_TERRITORY_CSS = `
/* One SVG, one camera, one physical viewport. Hidden here means the Territory SCREEN is inactive;
   only its inert artwork is deliberately painted behind the menu. No second map or canvas. */
/* The Territory SCREEN takes focus on open so a screen reader announces the new region, but it is
   a container, not a control: it must not paint a focus ring (owner, 2026-11-02: the stray circle
   around Back). Its own keys still show theirs. */
#online-world-screen:focus { outline:none; }

#online-world-screen[data-living-territory="menu"][hidden] { display:grid!important;z-index:1;pointer-events:none; }
#menu[data-living-world] { z-index:2; }
#online-world-screen[data-living-territory="menu"] .online-inner > :not(.world-grid),
#online-world-screen[data-living-territory="menu"] .world-grid > :not(.world-map-svg) { visibility:hidden; }
#online-world-screen[data-living-territory="menu"]::before { opacity:0; }
#online-world-screen[data-living-territory="menu"] .world-grid { background:transparent;box-shadow:none; }
#online-world-screen[data-living-territory="menu"] .world-grid::after { opacity:0; }
/* THE MENU'S MAP IS A BACKGROUND, NOT A WINDOW (owner, 2026-11-02: "the living territory in main
   menu shouldnt be cropped as in territory menu, it should take the whole background"). The
   Territory screen keeps its framed, rounded .world-grid; on the menu the same grid is lifted out of
   the column and stretched to the viewport, so the SVG (100% of the grid) paints edge to edge. The
   camera measures this box and reconciles the viewBox to the screen's own aspect, so the map fills
   with no letterbox band and no visible frame edge. */
#online-world-screen[data-living-territory="menu"] .online-inner { padding:0; }
#online-world-screen[data-living-territory="menu"] .online-inner .world-grid {
  position:absolute; inset:0; z-index:0;
  /* An abspos grid CHILD placed in a row is contained by that ROW's area (the desktop stage puts
     it in row 2, which started 54px down). Clearing the placement makes the inner's padding box
     its containing block, so the background truly reaches the screen's top edge. */
  grid-row:auto; grid-column:auto; align-self:auto;
  width:auto; height:auto; max-width:none; max-height:none;
  margin:0; border-radius:0;
}
#online-world-screen[data-living-territory] .world-map-svg {
  transform-origin:center;
  transition:opacity ${motion.open}ms ${motion.easeOpen};
}
/* NO SCALE HERE: at full bleed even the interface layer's 99.6% would leave a 1px transparent rim
   around the screen. The menu's map is exactly the viewport; the settle on opening is added by JS
   from the SAME tokens (see living-territory.ts). */
#online-world-screen[data-living-territory="menu"] .world-map-svg { opacity:${MENU_MAP_OPACITY};transform:none; }
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
