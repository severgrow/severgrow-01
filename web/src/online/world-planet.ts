// THE PLANET inside the Territory window (/test/ only: `FEATURES.planet`). Owner, 2026-11-04:
// "replace and call it THE PLANET instead of TERRITORY ... the sphere sits where current territory
// flat map sits ... Full Territory actions".
//
// Territory (world-view.ts) still owns the data, the rules, the selection bar, the sheets and every
// request. This bridge only turns its state into the planet's input and the planet's taps back into
// Territory's own `select`. The heavy geometry and WebGL load lazily, the first time the window opens.
import type { Planet, PlanetInput } from '../sphere/planet.js';
import { PLANET } from '../../../src/strings.js';

const CSS = `
.world-grid.planet-on > .world-map-svg { visibility: hidden !important; pointer-events: none !important; }
/* The flat map's faint survey contours read as a stray hair over a planet in space (owner,
   2026-11-04: "this very thin circle like thing ... like a hair - is that intentional?"). */
.online-world.planet-screen::before { display: none; }
.world-grid > .planet-canvas {
  position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; display: block;
  border-radius: inherit; touch-action: none; cursor: grab; outline: 0; background: #07090a;
}
.world-grid > .planet-canvas:active { cursor: grabbing; }
.world-grid > .planet-canvas:focus-visible { outline: 2px solid #e8ddc5; outline-offset: -3px; }
.world-grid > .planet-fallback {
  position: absolute; inset: 0; z-index: 0; margin: 0; display: flex; align-items: center; justify-content: center;
  padding: 24px; text-align: center; font-size: .8rem; line-height: 1.7; color: #e8ddc5a6;
}
.world-grid > .planet-fallback[hidden], .world-grid > .planet-canvas[hidden] { display: none; }
`;

type Claim = { cellId: string; ownerId: string; colour: string };
const axial = (id: string) => { const [q, r] = id.split(',').map(Number); return { q: q!, r: r! }; };

/**
 * The tile to open on: the player's own tile nearest the middle of their land, or the world's
 * centre for a player with no land yet.
 */
export const homeTile = (claims: readonly Claim[], me: string | null): string => {
  const mine = claims.filter((claim) => claim.ownerId === me);
  if (!mine.length) return '0,0';
  const points = mine.map((claim) => axial(claim.cellId));
  const q = points.reduce((sum, p) => sum + p.q, 0) / points.length, r = points.reduce((sum, p) => sum + p.r, 0) / points.length;
  const distance = (p: { q: number; r: number }) => (Math.abs(p.q - q) + Math.abs(p.r - r) + Math.abs(p.q + p.r - q - r)) / 2;
  let best = mine[0]!, bestDistance = Infinity;
  mine.forEach((claim, i) => { const d = distance(points[i]!); if (d < bestDistance) { best = claim; bestDistance = d; } });
  return best.cellId;
};

let current: Planet | null = null;
/** The test hook (`__severgrow.planet()`): null while the flat map is in use. */
export const planetSnapshot = () => current?.snapshot() ?? null;

export type WorldPlanet = {
  update: (input: PlanetInput) => void;
  home: (id: string | null) => void;
  dispose: () => void;
};

/** Mount the planet into the Territory grid. Resolves to null when it could not load. */
export const mountWorldPlanet = async (grid: HTMLElement, onTile: (id: string | null) => void): Promise<WorldPlanet | null> => {
  if (!document.getElementById('world-planet-css')) {
    const style = document.createElement('style');
    style.id = 'world-planet-css';
    style.textContent = CSS;
    document.head.append(style);
  }
  let module: typeof import('../sphere/planet.js');
  try { module = await import('../sphere/planet.js'); } catch { return null; }
  const planet = module.mountPlanet(grid, { onTile, label: PLANET.controls, unavailable: PLANET.unavailable });
  grid.classList.add('planet-on');
  const screen = grid.closest('.online-world');
  screen?.classList.add('planet-screen');
  current = planet;
  return {
    update: (input) => planet.update(input),
    home: (id) => planet.home(id),
    dispose: () => {
      planet.dispose();
      grid.classList.remove('planet-on');
      screen?.classList.remove('planet-screen');
      if (current === planet) current = null;
    },
  };
};
