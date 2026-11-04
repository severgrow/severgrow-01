// THE PLANET IN SPACE. Two passes, no textures, no post-processing, no dependency:
//   1. SPACE: one full-screen triangle draws the sky, a slowly sliding star field (two parallax
//      layers, procedural), the atmosphere halo around the planet and a still film grain;
//   2. GROUND: the planet's tiles as fans, lit by a low sun with a soft day/night line, an
//      atmospheric rim, chunky bevelled tiles separated by fine grout, owner borders, the selection
//      ring, a hatch on disputed ground, owned ground glowing faintly on the night side, and glossy
//      black pentagons.
// A frame costs one draw of ~104k vertices; nothing renders unless asked (see view.ts).
import type { Sphere } from './geometry.js';
import type { Quat } from './rotation.js';
import { KIND, type Ground } from './ground.js';

export const EYE = 3.6;
/** Focal length; at zoom 1 the planet's disc is 82% of the shorter half-side. */
export const focal = (aspect: number, zoom: number) => .82 * Math.sqrt(EYE * EYE - 1) * Math.min(1, aspect) * zoom;
/** The planet's silhouette radius in CSS px for a stage of this size. */
export const discRadius = (width: number, height: number, zoom: number) =>
  .82 * Math.min(1, width / height) * zoom * height / 2;

/** A rectangle in CSS px, relative to the canvas's own top-left. */
export type Frame = { x: number; y: number; width: number; height: number };
/**
 * ONE CANVAS, ANY FRAME (owner, 2026-11-04: "There is a jump of the planet as it's not exactly the same
 * in menu and the planet ... they have to be in identical position"). The canvas never moves or
 * resizes between the menu and the Territory window; the planet is drawn centred on, and sized to, a
 * FRAME inside it (the whole screen behind the menu, the panel in the window). Moving the frame
 * smoothly moves the planet smoothly; the same frame always draws the same pixels.
 */
export const projection = (view: { width: number; height: number }, frame: Frame, zoom: number) => {
  const aspect = view.width / view.height;
  // The frame's own focal length, rescaled to the canvas's NDC (which spans the canvas height).
  const f = focal(frame.width / frame.height, zoom) * (frame.height / view.height);
  const ox = ((frame.x + frame.width / 2) / view.width) * 2 - 1;
  const oy = 1 - ((frame.y + frame.height / 2) / view.height) * 2;
  return { aspect, f, ox, oy, radius: discRadius(frame.width, frame.height, zoom), cx: frame.x + frame.width / 2, cy: frame.y + frame.height / 2 };
};

const SPACE_VERTEX = `
attribute vec2 aCorner;
void main(){ gl_Position = vec4(aCorner, 0.0, 1.0); }`;
const SPACE_FRAGMENT = `
precision highp float;
uniform vec2 uSize; uniform vec2 uCentre; uniform float uRadius; uniform vec2 uDrift; uniform float uScale;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float stars(vec2 p, float cell, float density){
  vec2 c = floor(p / cell), f = fract(p / cell);
  float h = hash(c);
  if (h < density) return 0.0;
  vec2 at = vec2(hash(c + 7.1), hash(c + 3.7)) * .7 + .15;
  float d = length((f - at) * cell);
  float size = mix(.55, 1.35, hash(c + 1.9)) * uScale;
  return smoothstep(size, 0.0, d) * mix(.35, 1.0, (h - density) / (1.0 - density));
}
void main(){
  vec2 p = gl_FragCoord.xy;
  // Deep space, a touch warmer toward the planet so it never floats on flat black.
  float d = length(p - uCentre) / uRadius;
  vec3 sky = mix(vec3(.030, .036, .034), vec3(.012, .014, .015), smoothstep(.9, 3.2, d));
  float s = stars(p + uDrift * .35, 9.0 * uScale, .965) * .55 + stars(p + uDrift, 17.0 * uScale, .955);
  sky += vec3(.86, .84, .78) * s * smoothstep(1.0, 1.25, d);
  // The halo: the atmosphere's light scattered past the limb, falling off into space.
  float out_ = max(0.0, d - 1.0);
  sky += vec3(.44, .58, .52) * (exp(-out_ * 11.0) * .30 + exp(-out_ * 3.2) * .07) * step(1.0, d);
  // Still grain, the same film the flat map wears.
  sky += (hash(p) - .5) * .022;
  gl_FragColor = vec4(sky, 1.0);
}`;

const GROUND_VERTEX = `
attribute vec4 aPosition; attribute vec4 aLook;
uniform vec4 uRotation; uniform float uAspect; uniform float uFocal; uniform vec2 uShift;
varying vec3 vNormal; varying vec3 vColour; varying float vEdge; varying float vFlags; varying float vSeed; varying vec3 vLocal;
void main(){
  vec3 q = aPosition.xyz;
  vLocal = q;
  vec3 t = 2.0 * cross(uRotation.xyz, q);
  vec3 p = q + uRotation.w * t + cross(uRotation.xyz, t);
  float z = p.z - ${EYE.toFixed(1)};
  gl_Position = vec4(p.x * uFocal / uAspect - uShift.x * z, p.y * uFocal - uShift.y * z, 0.0, -z);
  vNormal = p; vColour = aLook.rgb; vFlags = aLook.a * 255.0;
  vEdge = fract(aPosition.w); vSeed = floor(aPosition.w) / 4096.0;
}`;
const groundFragment = (derivatives: boolean) => `
${derivatives ? '#extension GL_OES_standard_derivatives : enable' : ''}
precision highp float;
varying vec3 vNormal; varying vec3 vColour; varying float vEdge; varying float vFlags; varying float vSeed; varying vec3 vLocal;
uniform float uPulse; uniform float uPixel; uniform float uDpr;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// Value noise fixed to the planet (not the screen), so the grain turns with the ground.
float hash3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main(){
  float f = floor(vFlags + .5);
  float kind = mod(f, 8.0);
  float border = mod(floor(f / 8.0), 2.0);
  float disputed = mod(floor(f / 16.0), 2.0);
  float selected = mod(floor(f / 32.0), 2.0);
  float kin = mod(floor(f / 64.0), 2.0);
  float below = mod(floor(f / 128.0), 2.0);
  // vEdge runs 0 at a tile's centre to 0.999 along its sides.
  float e = vEdge / .999;
  float w = ${derivatives ? 'max(fwidth(e), 1e-4)' : 'uPixel'};
  vec3 n = normalize(vNormal), v = normalize(vec3(0.0, 0.0, ${EYE.toFixed(1)}) - vNormal);
  vec3 sun = normalize(vec3(-.52, .58, .63));
  float ndl = dot(n, sun);
  // A long, soft falloff: even a close view across a few dozen tiles shows the light rolling over
  // the curve, and the night side fades through a broad dusk instead of a hard line.
  float day = smoothstep(-.32, 1.0, ndl);
  vec3 c = vColour;
  // THE TILE'S MATERIAL (owner, 2026-11-04: the tiles "stand out as too baloony or plasticky ...
  // make them look more organic more real but cool and cheap"). A tile is a FLAT slab, not a
  // cushion: its top is lit evenly and only a narrow chamfer at the very edge turns toward or away
  // from the sun. A fine grain fixed to the planet and a slight tone of its own per tile make a
  // holding read as fields, or glazed clay, rather than one moulded piece of plastic.
  float owned = step(2.5, kind) * step(kind, 4.5);
  float landish = step(1.5, kind) * step(kind, 2.5);
  // Colour: a touch less saturated and darker, the matte of a real pigment.
  c = mix(c, vec3(dot(c, vec3(.3, .59, .11))), .14 * owned) * mix(1.0, .93, owned);
  // Each tile its own faint tone; the unknown a little more (it is terrain, not ground anyone keeps).
  c *= kind < 1.5 ? .9 + .2 * vSeed : .975 + .05 * vSeed;
  // Grain: two octaves, about three and ten blobs across a tile, a few percent either way.
  float grain = noise3(vLocal * 95.0) * .62 + noise3(vLocal * 330.0) * .38;
  c *= mix(.955, 1.045, grain) * (1.0 - .035 * landish * (1.0 - grain));
  // The chamfer: only the last eighth of the way to the side. Owned slabs stand a little proud,
  // free land barely, the unknown is flat. A soft, very slight occlusion where it meets the grout.
  float rise = owned > .5 ? 1.0 : landish > .5 ? .5 : .15;
  float lip = smoothstep(.8, .975, e);
${derivatives ? `  vec2 grad = vec2(dFdx(e), dFdy(e));
  float toSun = dot(grad, grad) > 1e-12 ? dot(normalize(grad), normalize(vec2(-.52, .58))) : 0.0;
  c *= 1.0 + rise * lip * (.34 * toSun - .07);
  // A RAISED NEIGHBOUR CASTS A SHADOW: lower ground beside an owned slab darkens toward that side
  // when the slab stands between it and the sun. Soft, short, and only where it is true.
  c *= 1.0 - below * .42 * smoothstep(.5, 1.0, e) * max(0.0, toSun);` : `  c *= 1.0 - rise * lip * .05;`}
  c *= 1.0 - .07 * smoothstep(.9, 1.0, e);
  if (disputed > .5) c *= .82 + .18 * step(.5, fract((gl_FragCoord.x + gl_FragCoord.y) / (7.0 * uDpr)));
  if (kin > .5 && selected < .5) c = mix(c, vec3(.95, .92, .82), .07);
  float lit = .13 + .95 * day;
  vec3 colour = c * lit;
  // Owned ground keeps a little of its colour on the night side, like lights across a dark world.
  if (kind > 2.5 && kind < 4.5) colour += c * .2 * (1.0 - day);
  // Pentagons: black glass with a hard little sun glint.
  if (kind > 4.5) {
    vec3 h = normalize(sun + v);
    colour = vColour + vec3(.75, .74, .7) * pow(max(dot(n, h), 0.0), 90.0) * day + vec3(.05, .06, .07) * smoothstep(.55, .95, e);
  }
  // A broad sheen where the sun is reflected, so the ball reads as a solid body.
  vec3 halfway = normalize(sun + v);
  colour += vec3(.9, .88, .8) * pow(max(dot(n, halfway), 0.0), 28.0) * .018;
  // The atmosphere seen edge-on.
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  colour += vec3(.36, .5, .44) * rim * (.25 + .75 * day) * .55;
  // Owner borders: a quiet inner line in the tile's own colour, lifted a little (no glowing rim).
  float band = smoothstep(1.0 - w * 4.2, 1.0 - w * 2.6, e) * border * owned;
  colour = mix(colour, mix(c, vec3(.94, .91, .82), .3) * lit, band * .6);
  // The selection ring.
  float ring = smoothstep(1.0 - w * 6.0, 1.0 - w * 3.5, e) * selected;
  colour = mix(colour, vec3(.97, .94, .85), ring * (.82 + .18 * uPulse));
  if (selected > .5) colour *= 1.08 + .06 * uPulse;
  // Grout: a fine dark seam between every pair of tiles, constant in pixels at any zoom.
  float grout = smoothstep(1.0 - w * 1.7, 1.0 - w * .35, e);
  colour = mix(colour, vec3(.018, .021, .02), grout * (kind > 4.5 ? .4 : .78));
  colour += (hash(gl_FragCoord.xy) - .5) * .022;
  gl_FragColor = vec4(colour, 1.0);
}`;

/** Owned ground (anyone's) stands as a raised slab. */
const owned = (kind: number) => kind === KIND.owned || kind === KIND.mine;

export class PlanetRenderer {
  readonly gl: WebGLRenderingContext;
  bytes = 0;
  frames = 0;
  disposed = false;
  private space: WebGLProgram;
  private ground: WebGLProgram;
  private buffers: WebGLBuffer[] = [];
  private triangle: WebGLBuffer;
  private positions: WebGLBuffer;
  private looks: WebGLBuffer;
  private look: Uint8Array<ArrayBuffer>;
  private vertexCount: number;
  /** First vertex of each cell's fan, and its vertex count. */
  private start: Int32Array;
  private span: Uint8Array;
  private flags: Uint8Array;
  private selected: number | null = null;
  private kin: number[] = [];
  private u: Record<string, WebGLUniformLocation | null> = {};
  private pixel = 1;
  private cssWidth = 1;
  private cssHeight = 1;
  private derivatives: boolean;
  constructor(readonly canvas: HTMLCanvasElement, readonly sphere: Sphere) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!gl) throw Error('WebGL unavailable');
    this.gl = gl;
    this.derivatives = !!gl.getExtension('OES_standard_derivatives');
    this.space = this.program(SPACE_VERTEX, SPACE_FRAGMENT);
    this.ground = this.program(GROUND_VERTEX, groundFragment(this.derivatives));
    for (const name of ['uSize', 'uCentre', 'uRadius', 'uDrift', 'uScale']) this.u[`space.${name}`] = gl.getUniformLocation(this.space, name);
    for (const name of ['uRotation', 'uAspect', 'uFocal', 'uShift', 'uPulse', 'uPixel', 'uDpr']) this.u[name] = gl.getUniformLocation(this.ground, name);
    this.triangle = this.buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));
    // Fans: centre, corner i, corner i+1 for every side of every tile. A cell's `w` packs its seed
    // (integer part) with the distance-to-side ramp (fraction: 0 at the centre, .999 on a side).
    const cells = sphere.cells;
    this.start = new Int32Array(cells.length);
    this.span = new Uint8Array(cells.length);
    let vertices = 0;
    for (const c of cells) { this.start[c.index] = vertices; this.span[c.index] = c.corners.length * 3; vertices += c.corners.length * 3; }
    this.vertexCount = vertices;
    const position = new Float32Array(vertices * 4);
    let o = 0;
    for (const c of cells) {
      const seed = Math.floor((Math.sin(c.index * 12.9898) * 43758.5453 % 1 + 1) % 1 * 4095);
      for (let i = 0; i < c.corners.length; i++) {
        const a = sphere.corners[c.corners[i]!]!, b = sphere.corners[c.corners[(i + 1) % c.corners.length]!]!;
        position.set([c.centre[0], c.centre[1], c.centre[2], seed], o); o += 4;
        position.set([a[0], a[1], a[2], seed + .999], o); o += 4;
        position.set([b[0], b[1], b[2], seed + .999], o); o += 4;
      }
    }
    this.positions = this.buffer(gl.ARRAY_BUFFER, position);
    this.look = new Uint8Array(vertices * 4);
    this.flags = new Uint8Array(cells.length);
    this.looks = this.buffer(gl.ARRAY_BUFFER, this.look, gl.DYNAMIC_DRAW);
    this.bytes = position.byteLength + this.look.byteLength + 24;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(0, 0, 0, 1);
  }
  private program(vertex: string, fragment: string): WebGLProgram {
    const gl = this.gl;
    const shader = (kind: number, source: string) => {
      const s = gl.createShader(kind);
      if (!s) throw Error('Graphics context unavailable');
      gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw Error(`Graphics shader unavailable: ${log}`); }
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment), p = gl.createProgram();
    if (!p) throw Error('Graphics context unavailable');
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p); gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { gl.deleteProgram(p); throw Error('Graphics program unavailable'); }
    return p;
  }
  private buffer(target: number, data: BufferSource, usage?: number) {
    const gl = this.gl, b = gl.createBuffer();
    if (!b) throw Error('Graphics buffer unavailable');
    gl.bindBuffer(target, b); gl.bufferData(target, data, usage ?? gl.STATIC_DRAW);
    this.buffers.push(b);
    return b;
  }
  /** Repaint every tile's look from fresh Territory data (only when the data actually changed). */
  setGround(ground: Ground, selected: number | null, kin: readonly number[]) {
    const cells = this.sphere.cells;
    for (const c of cells) {
      const i = c.index;
      this.flags[i] = ground.kind[i]! + (ground.disputed[i] ? 16 : 0);
    }
    this.selected = selected;
    this.kin = [...kin];
    for (const c of cells) {
      const i = c.index, r = Math.round(ground.colour[i * 3]! * 255), g = Math.round(ground.colour[i * 3 + 1]! * 255), b = Math.round(ground.colour[i * 3 + 2]! * 255);
      const base = this.flags[i]! + (i === selected ? 32 : 0) + (this.kin.includes(i) ? 64 : 0);
      for (let k = 0; k < c.corners.length; k++) {
        // 128: the tile across this edge is a raised (owned) slab and this one is not.
        const raised = !owned(ground.kind[i]!) && owned(ground.kind[c.neighbours[k]!]!) ? 128 : 0;
        const flag = base + (ground.border[i]! & (1 << k) ? 8 : 0) + raised;
        for (let v = 0; v < 3; v++) {
          const o = (this.start[i]! + k * 3 + v) * 4;
          this.look[o] = r; this.look[o + 1] = g; this.look[o + 2] = b; this.look[o + 3] = flag;
        }
      }
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.looks);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.look);
  }
  /** Move the selection without re-uploading the whole planet: only the touched cells' bytes. */
  setSelection(selected: number | null, kin: readonly number[]) {
    const touched = new Set<number>([...(this.selected === null ? [] : [this.selected]), ...this.kin,
      ...(selected === null ? [] : [selected]), ...kin]);
    this.selected = selected;
    this.kin = [...kin];
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.looks);
    for (const i of touched) {
      const from = this.start[i]!, count = this.span[i]!;
      for (let v = 0; v < count; v++) {
        const o = (from + v) * 4;
        this.look[o + 3] = (this.look[o + 3]! & ~(32 | 64)) | (i === selected ? 32 : 0) | (this.kin.includes(i) ? 64 : 0);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, from * 4, this.look.subarray(from * 4, (from + count) * 4));
    }
  }
  resize(width: number, height: number, quality = 1) {
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2) * quality;
    this.cssWidth = Math.max(1, width); this.cssHeight = Math.max(1, height);
    this.pixel = dpr;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
  }
  render(q: Quat, zoom: number, pulse: number, drift: readonly [number, number], frame?: Frame) {
    const gl = this.gl;
    if (this.disposed || gl.isContextLost()) return;
    this.frames++;
    const w = this.canvas.width, h = this.canvas.height;
    const at = projection({ width: this.cssWidth, height: this.cssHeight }, frame ?? { x: 0, y: 0, width: this.cssWidth, height: this.cssHeight }, zoom);
    gl.viewport(0, 0, w, h);
    // 1. Space.
    gl.useProgram(this.space);
    gl.uniform2f(this.u['space.uSize']!, w, h);
    gl.uniform2f(this.u['space.uCentre']!, at.cx * this.pixel, h - at.cy * this.pixel);
    gl.uniform1f(this.u['space.uRadius']!, at.radius * this.pixel);
    gl.uniform2f(this.u['space.uDrift']!, drift[0] * this.pixel, drift[1] * this.pixel);
    gl.uniform1f(this.u['space.uScale']!, this.pixel);
    const corner = gl.getAttribLocation(this.space, 'aCorner');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.triangle);
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(corner);
    gl.enable(gl.CULL_FACE);
    // 2. Ground.
    gl.useProgram(this.ground);
    gl.uniform4f(this.u.uRotation!, q[0], q[1], q[2], q[3]);
    gl.uniform1f(this.u.uAspect!, at.aspect);
    gl.uniform1f(this.u.uFocal!, at.f);
    gl.uniform2f(this.u.uShift!, at.ox, at.oy);
    gl.uniform1f(this.u.uPulse!, pulse);
    gl.uniform1f(this.u.uDpr!, this.pixel);
    // Without derivatives, one pixel of the side ramp is estimated from the tile's size on screen.
    gl.uniform1f(this.u.uPixel!, 1 / Math.max(4, at.radius * this.pixel * (Math.PI / 5) / this.sphere.frequency));
    const position = gl.getAttribLocation(this.ground, 'aPosition'), look = gl.getAttribLocation(this.ground, 'aLook');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positions);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.looks);
    gl.enableVertexAttribArray(look);
    gl.vertexAttribPointer(look, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.disableVertexAttribArray(position);
    gl.disableVertexAttribArray(look);
  }
  dispose(release = false) {
    if (this.disposed) return;
    this.disposed = true;
    for (const b of this.buffers) this.gl.deleteBuffer(b);
    this.gl.deleteProgram(this.space);
    this.gl.deleteProgram(this.ground);
    if (release) this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
export { KIND };
