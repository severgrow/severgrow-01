import { INTERFACE_MOTION as motion } from '../ui/interface-motion.js';
/** The menu map's rest opacity. OWNER, 2026-11-02: "decrease opacity by further 7%" — 7% of the
 * PRESENT value, not seven points off 1: 0.28 x (1 - 0.07) = 0.2604. The Territory screen keeps 1. */
export const MENU_MAP_OPACITY = 0.2604;
/** One close beat for the frame's skin, so the vignette and the hairline leave with the map. */
const SKIN = motion.close + 30;
export const LIVING_TERRITORY_CSS = `
/* One SVG, one camera, one physical viewport. Hidden here means the Territory SCREEN is inactive;
   only its inert artwork is deliberately painted behind the menu. No second map or canvas. */
#online-world-screen[data-living-territory="menu"][hidden] { display:grid!important;z-index:1;pointer-events:none; }
#menu[data-living-world] { z-index:2; }
#online-world-screen[data-living-territory="menu"] .online-inner > :not(.world-grid),
#online-world-screen[data-living-territory="menu"] .world-grid > :not(.world-map-svg) { visibility:hidden; }
/* THE FRAME'S SKIN ARRIVES, IT DOES NOT APPEAR (owner, 2026-11-02: "make going into 'territory'
   from main menu look intentional ... right now it jumps"). The panel is a framed window only
   because of two layers: the vignette inside its edge (the ::after layer) and a 1px instrument hairline
   that sits ABOVE the map (a ::before layer). Both are off on the menu and simply existed on the panel,
   so the window snapped into being on the first frame. They now fade on the same beat as the map's
   own light, which is what turns a crop into a frame closing in. Opacity only, one composited
   layer each, nothing to measure and nothing to clean up. */
#online-world-screen .world-grid::after {
  opacity:1;
  transition:opacity ${SKIN}ms ${motion.easeOpen};
}
#online-world-screen .world-grid::before {
  content:''; position:absolute; inset:0; pointer-events:none; border-radius:inherit;
  box-shadow:inset 0 0 0 1px #e8ddbe1a;
  opacity:1; transition:opacity ${SKIN}ms ${motion.easeOpen};
}
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
#online-world-screen[data-living-territory="menu"] .world-map-svg { opacity:${MENU_MAP_OPACITY};transform:none; }
#online-world-screen[data-living-territory="menu"] .world-map-svg * { animation-play-state:paused!important; }
#online-world-screen[data-living-territory="menu"] .world-grid::before,
#online-world-screen[data-living-territory="menu"] .world-grid::after { opacity:0; }
/* The screen's own survey contours belong to the panel too: they fade with the skin. */
#online-world-screen::before { transition:opacity ${SKIN}ms ${motion.easeOpen}; }
#online-world-screen[data-living-territory="menu"]::before { opacity:0; }
#online-world-screen[data-living-territory="menu"] .world-grid { background:transparent;box-shadow:none; }
#online-world-screen[data-living-territory] .world-map-svg {
  transform-origin:center;
  transition:opacity ${motion.open}ms ${motion.easeOpen};
}
/* THE RETURN'S FIRST BEAT (see living-territory.ts leave): the frame's skin leaves with the
   map's light, before the geometry returns to the menu's full-bleed framing. The map's own opacity
   is driven by the animation, not here. */
#online-world-screen.living-leaving .world-grid::before,
#online-world-screen.living-leaving .world-grid::after,
#online-world-screen.living-leaving::before {
  transition-duration:${motion.close}ms; transition-timing-function:${motion.easeClose}; opacity:0;
}
/* NO SCALE HERE: at full bleed even the interface layer's 99.6% would leave a 1px transparent rim
   around the screen. The menu's map is exactly the viewport; the settle on opening is added by JS
   from the SAME tokens (see living-territory.ts). */
@starting-style { #online-world-screen[data-living-territory="menu"] .world-map-svg { opacity:0; } }
/* A shared rhythm links the logo, title and keys. Short screens compress space, never tap targets. */
#menu[data-living-world] .menu-inner { --living-space:clamp(6px,1.6dvh,16px);--menu-rhythm:var(--living-space);--menu-head-gap:calc(2 * var(--living-space)); }
@media(min-height:600px) {
 #menu[data-living-world] .menu-inner { height:auto;justify-content:center;gap:calc(3 * var(--living-space)); }
}
html.reduce-motion #online-world-screen .world-grid::before,
html.reduce-motion #online-world-screen .world-grid::after,
html.reduce-motion #online-world-screen::before { transition:none; }
html.reduce-motion #online-world-screen[data-living-territory] .world-map-svg { transition:none; transform:none; }
@media(prefers-reduced-motion:reduce) {
 #online-world-screen[data-living-territory] .world-map-svg { transition:none; transform:none; }
 #online-world-screen .world-grid::before,
 #online-world-screen .world-grid::after,
 #online-world-screen::before { transition:none; }
}
`;
