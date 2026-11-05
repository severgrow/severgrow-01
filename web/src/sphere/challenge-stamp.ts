import type { V3 } from './geometry.js';
/** Stable tangent-plane coordinates, including near the poles. Two signed bytes per vertex. */
export function stampCoordinates(centre: V3, corners: readonly V3[]): [number, number][] {
  const up: V3 = Math.abs(centre[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
  const x: [number,number,number] = [up[1]*centre[2]-up[2]*centre[1], up[2]*centre[0]-up[0]*centre[2], up[0]*centre[1]-up[1]*centre[0]];
  const length = Math.hypot(...x); for (let i=0;i<3;i++) x[i] = x[i]! / length;
  const y: V3 = [centre[1]*x[2]-centre[2]*x[1], centre[2]*x[0]-centre[0]*x[2], centre[0]*x[1]-centre[1]*x[0]];
  const values = corners.map(p => { const d = p.map((v,i) => v-centre[i]!); return [d[0]!*x[0]+d[1]!*x[1]+d[2]!*x[2], d[0]!*y[0]+d[1]!*y[1]+d[2]!*y[2]] as [number,number]; });
  const radius = Math.max(...values.map(p=>Math.hypot(...p)), 1e-8);
  return values.map(p=>[p[0]/radius,p[1]/radius]);
}
/** Two simple stamped blades/guards/handles. Analytic coverage, no textures or per-cell DOM. */
export const CHALLENGE_STAMP_GLSL = `
float stampBlade(vec2 p) {
  float blade = max(abs(p.x)-.052, max(-.51-p.y, p.y-.17));
  float tip = max(abs(p.x)*.95 - (p.y+.66)*.35, max(-.66-p.y,p.y+.49));
  float guard = max(abs(p.x)-.19, abs(p.y-.2)-.038);
  float grip = max(abs(p.x)-.038, abs(p.y-.35)-.13);
  float pommel = length(p-vec2(0.0,.49))-.058;
  return min(min(min(blade,tip),min(guard,grip)),pommel);
}
float crossedSwords(vec2 p) {
  vec2 a = vec2(p.x+p.y,p.y-p.x)*.707107;
  vec2 b = vec2(p.x-p.y,p.y+p.x)*.707107;
  return min(stampBlade(a),stampBlade(b));
}
`;
