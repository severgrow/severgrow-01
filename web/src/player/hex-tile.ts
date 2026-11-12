// ONE TILE, DRAWN AS THE MAP DRAWS IT (owner, 2026-11-01: "change the color icon in profile to
// actual hex shape, in right direction like game map - with 'flat' edges on sides").
//
// The board's hexes are built from vertices at 60°·i − 30° (web/src/ui/geom.ts `cornerPts`), which
// puts a flat vertical EDGE on the left and the right and a point at the top and the bottom. The
// profile's swatch used to be a rounded square, which is a different material entirely; this module
// gives it the board's own silhouette so the one tile in the profile is the same object as the
// tiles on the map.
//
// Pure: it returns points, so the shape is unit-testable without a DOM.
const RAD = Math.PI / 180;

/** The six vertices of a map hex, at `size` radius, centred on (0, 0): the board's own angles. */
export const hexVertices = (size: number): readonly (readonly [number, number])[] =>
  Array.from({ length: 6 }, (_, i) => {
    const a = 60 * i - 30;
    return [size * Math.cos(a * RAD), size * Math.sin(a * RAD)] as const;
  });

/** The same six, as an SVG `points` attribute. Two decimals is finer than a device pixel here. */
export const hexPoints = (size: number): string =>
  hexVertices(size)
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');

/** The silhouette in a 24×24 box, as the map draws it (flat left/right edges). */
export const HEX_TILE_POINTS = hexPoints(11.5);
/** The hexagon's own aspect: taller than it is wide, because the points are top and bottom. */
export const HEX_TILE_ASPECT = 22 / (2 * 11.5 * Math.cos(30 * RAD));
