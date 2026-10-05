// SEVEROR forest-volcano skin geometry reference.
// Copy/adapt into the renderer; values are in board units (R=30).
export const HEX_R = 30;
export const APOTHEM = HEX_R * Math.sqrt(3) / 2;
export const CONNECTION_START = 10.4; // just outside 10.2-unit strength plate
export const CONNECTION_STRAIGHT_BAND = 8.66;
export const CONNECTION_BLEED = 3;

export const POINTY_EDGE_MIDPOINTS = [
  [25.980762, 0],
  [12.990381, 22.5],
  [-12.990381, 22.5],
  [-25.980762, 0],
  [-12.990381, -22.5],
  [12.990381, -22.5],
] as const;

export const FLAT_EDGE_MIDPOINTS = [
  [0, -25.980762],
  [22.5, -12.990381],
  [22.5, 12.990381],
  [0, 25.980762],
  [-22.5, 12.990381],
  [-22.5, -12.990381],
] as const;

/**
 * Build the structural half-link from one tile toward one shared edge.
 * The final segment is radial/straight, so it crosses the true edge
 * square-on at the exact midpoint and continues 3 units into bleed.
 */
export function buildSpoke(edge: readonly [number, number], bow = 2.8) {
  const [ax, ay] = edge;
  const mag = Math.hypot(ax, ay);
  const dx = ax / mag, dy = ay / mag;
  const px = -dy, py = dx;
  const pre = APOTHEM - CONNECTION_STRAIGHT_BAND;
  const out = APOTHEM + CONNECTION_BLEED;
  const start = { x: dx * CONNECTION_START, y: dy * CONNECTION_START };
  const endCurve = { x: dx * pre, y: dy * pre };
  return {
    start,
    c1: { x: start.x + dx * 4 + px * bow, y: start.y + dy * 4 + py * bow },
    c2: { x: endCurve.x - dx * 5 + px * bow * 0.45, y: endCurve.y - dy * 5 + py * bow * 0.45 },
    endCurve,
    edge: { x: ax, y: ay },
    bleedEnd: { x: dx * out, y: dy * out },
  };
}
