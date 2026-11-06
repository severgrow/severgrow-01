// THE PLANET inside the Territory window (/test/ only: `FEATURES.planet`). Owner, 2026-11-04:
// "replace and call it THE PLANET instead of TERRITORY ... the sphere sits where current territory
// flat map sits ... Full Territory actions".
//
// Territory (world-view.ts) still owns the data, the rules, the selection bar, the sheets and every
// request. This bridge only turns its state into the planet's input and the planet's taps back into
// Territory's own `select`. The heavy geometry and WebGL load lazily, the first time the window opens.
import type { Planet, PlanetInput, PlanetMode } from '../sphere/planet.js';
import { PLANET } from '../../../src/strings.js';
import { worldNeighbours } from '../../../server/src/world.js';
import { lockupBox } from '../player/planet-lockup.js';

const CSS = `
.world-grid.planet-on > .world-map-svg { visibility: hidden !important; pointer-events: none !important; }
/* The flat map's faint survey contours read as a stray hair over a planet in space (owner,
   2026-11-04: "this very thin circle like thing ... like a hair - is that intentional?"). */
.online-world.planet-screen::before { display: none; }
/* ONE SHEET OVER THE WHOLE SCREEN, behind the menu and in the window alike (owner, 2026-11-04: "There is
   a jump of the planet ... they have to be in identical position"). The canvas never moves or resizes
   between the two; the planet module crops it to the window's panel and centres the planet there. */
.world-grid > .planet-canvas {
  position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; z-index: 0; display: block;
  touch-action: none; cursor: grab; outline: 0; background: #0e0f10;
}
.world-grid > .planet-canvas:active { cursor: grabbing; }
/* BEHIND THE MENU the planet is the backdrop (owner, 2026-11-04): whole, dim, untouchable. The
   menu's living backdrop already stretches this grid over the whole screen. */
#online-world-screen[data-living-territory="menu"] .world-grid > .planet-canvas {
  visibility: visible; pointer-events: none; background: transparent;
}
.world-grid > .planet-canvas:focus-visible { outline: 2px solid #e8ddc5; outline-offset: -3px; }
/* Status changes must never change the camera's viewport. On phones the old flex footer
   could grow by several lines during a gesture. Share the map's grid cell instead, leaving
   the existing menu key and bottom selection bar clear. Desktop already has a shared stage. */
@media not all and (min-width: 960px) and (min-height: 560px) and (min-aspect-ratio: 5/4) {
  .online-world.planet-screen:not([data-living-territory="menu"]) .online-inner {
    display: grid; grid-template-columns: minmax(0,1fr); grid-template-rows: auto auto minmax(0,1fr);
  }
  .online-world.planet-screen:not([data-living-territory="menu"]) .online-inner > * { grid-column: 1; }
  .online-world.planet-screen:not([data-living-territory="menu"]) .online-head { grid-row: 1; }
  .online-world.planet-screen:not([data-living-territory="menu"]) #online-world-wallet { grid-row: 2; }
  .online-world.planet-screen:not([data-living-territory="menu"]) .world-grid { grid-row: 3; align-self: stretch; height: auto; }
  .online-world.planet-screen:not([data-living-territory="menu"]) #online-world-notice {
    grid-row: 3; align-self: start; justify-self: start; z-index: 5; box-sizing: border-box;
    width: fit-content; max-width: calc(var(--world-w) - 100px); min-height: 0; max-height: 6em;
    margin: 12px 0 0 calc((100% - var(--world-w)) / 2 + 12px); padding: 7px 10px; border-radius: 10px; overflow: hidden;
    background: rgba(10,13,11,.5); text-align: left; pointer-events: none;
  }
  .online-world.planet-screen:not([data-living-territory="menu"]) #online-world-notice:empty { display: none; }
}
/* A TILE WAS JUST GROWN (planet.ts \`grown\`): two rings leave it and fade. Ends by itself. */
.world-grid > .planet-grown {
  position: fixed; z-index: 1; pointer-events: none; border-radius: 50%;
  width: calc(var(--tile) * 1.2); height: calc(var(--tile) * 1.2);
  margin: calc(var(--tile) * -.6) 0 0 calc(var(--tile) * -.6);
  box-shadow: 0 0 0 1.5px #e8ddc5d9, 0 0 14px #e8ddc540;
  animation: planet-grown 1150ms cubic-bezier(.2, .7, .2, 1) both;
}
.world-grid > .planet-grown::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: 0 0 0 1px #e8ddc58c;
  animation: planet-grown 1150ms 200ms cubic-bezier(.2, .7, .2, 1) both;
}
@keyframes planet-grown { from { transform: scale(.55); opacity: 1; } to { transform: scale(4.4); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .world-grid > .planet-grown { display: none; } }
.world-grid > .planet-fallback {
  position: absolute; inset: 0; z-index: 0; margin: 0; display: flex; align-items: center; justify-content: center;
  padding: 24px; text-align: center; font-size: .8rem; line-height: 1.7; color: #e8ddc5a6;
}
.world-grid > .planet-fallback[hidden], .world-grid > .planet-canvas[hidden] { display: none; }
`;

type Claim = { cellId: string; ownerId: string; colour: string; claimedAt?: number };
const axial = (id: string) => { const [q, r] = id.split(',').map(Number); return { q: q!, r: r! }; };

/**
 * The tile to open on (owner, 2026-11-04: "always smoothly takes you to your biggest territory"): the
 * middle of the player's LARGEST connected holding, by the planet's own adjacency. Ties go to the
 * holding with the oldest tile, so the answer never flips between visits. A player with no land
 * opens on the world's centre.
 */
export const homeTile = (claims: readonly Claim[], me: string | null): string => {
  const mine = claims.filter((claim) => claim.ownerId === me);
  if (!mine.length) return '0,0';
  const own = new Map(mine.map((claim) => [claim.cellId, claim]));
  const left = new Set(own.keys());
  let best: string[] = [], bestOldest = Infinity;
  for (const claim of mine) {
    if (!left.delete(claim.cellId)) continue;
    const group = [claim.cellId];
    for (let i = 0; i < group.length; i++) for (const id of worldNeighbours(group[i]!)) if (left.delete(id)) group.push(id);
    const oldest = Math.min(...group.map((id) => (own.get(id) as { claimedAt?: number } | undefined)?.claimedAt ?? Infinity));
    if (group.length > best.length || (group.length === best.length && oldest < bestOldest)) { best = group; bestOldest = oldest; }
  }
  const points = best.map(axial);
  const q = points.reduce((sum, p) => sum + p.q, 0) / points.length, r = points.reduce((sum, p) => sum + p.r, 0) / points.length;
  const distance = (p: { q: number; r: number }) => (Math.abs(p.q - q) + Math.abs(p.r - r) + Math.abs(p.q + p.r - q - r)) / 2;
  let home = best[0]!, near = Infinity;
  // Equally near tiles (a two-tile holding, say) are ordered by id, so the list order never decides.
  best.forEach((id, i) => { const d = distance(points[i]!); if (d < near - 1e-9 || (Math.abs(d - near) <= 1e-9 && id < home)) { home = id; near = d; } });
  return home;
};

let current: Planet | null = null;
/** The test hook (`__severgrow.planet()`): null while the flat map is in use. */
export const planetSnapshot = () => current?.snapshot() ?? null;

export type WorldPlanet = {
  update: (input: PlanetInput) => void;
  home: (id: string | null) => void;
  setMode: (mode: PlanetMode) => void;
  freeze: (on: boolean) => void;
  grown: (id: string) => void;
  dispose: () => void;
};

/** Mount the planet into the Territory grid. Resolves to null when it could not load. */
export const mountWorldPlanet = async (grid: HTMLElement, onTile: (id: string | null) => void, mode: PlanetMode, onBlocked?: () => void): Promise<WorldPlanet | null> => {
  if (!document.getElementById('world-planet-css')) {
    const style = document.createElement('style');
    style.id = 'world-planet-css';
    style.textContent = CSS;
    document.head.append(style);
  }
  let module: typeof import('../sphere/planet.js');
  try { module = await import('../sphere/planet.js'); } catch { return null; }
  const planet = module.mountPlanet(grid, { onTile, label: PLANET.controls, unavailable: PLANET.unavailable, mode, panel: () => grid.getBoundingClientRect(), enclose: lockupBox, ...(onBlocked ? { onBlocked } : {}) });
  grid.classList.add('planet-on');
  const screen = grid.closest('.online-world');
  screen?.classList.add('planet-screen');
  current = planet;
  return {
    update: (input) => planet.update(input),
    home: (id) => planet.home(id),
    setMode: (next) => planet.setMode(next),
    freeze: (on: boolean) => planet.freeze(on),
    grown: (id) => planet.grown(id),
    dispose: () => {
      planet.dispose();
      grid.classList.remove('planet-on');
      screen?.classList.remove('planet-screen');
      if (current === planet) current = null;
    },
  };
};
