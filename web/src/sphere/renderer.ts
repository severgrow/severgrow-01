import { CHALLENGE_STAMP_GLSL, stampCoordinates } from './challenge-stamp.js';
import { tileFace, tileVariants } from './tile-face.js';
import type { V3 } from './geometry.js';
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
import { compileProgram, spacePass } from './space.js';

export const EYE = 3.6;
/** Focal length; at zoom 1 the planet's disc is 82% of the shorter half-side. */
export const focal = (aspect: number, zoom: number) => .82 * Math.sqrt(EYE * EYE - 1) * Math.min(1, aspect) * zoom;
/** The planet's silhouette radius in CSS px for a stage of this size. */
export const discRadius = (width: number, height: number, zoom: number) =>
  .82 * Math.min(1, width / height) * zoom * height / 2;

/** A rectangle in CSS px, relative to the canvas's own top-left. */
export type Frame = { x: number; y: number; width: number; height: number };
/** Cover the visible CSS crop, rounded outward, in WebGL's bottom-left device pixels. */
export const scissorFor = (crop: Frame, width: number, height: number, pixel: number): [number, number, number, number] => {
  const x = Math.max(0, Math.min(width, Math.floor(crop.x * pixel)));
  const y = Math.max(0, Math.min(height, Math.floor(height - (crop.y + crop.height) * pixel)));
  const right = Math.max(x, Math.min(width, Math.ceil((crop.x + crop.width) * pixel)));
  const top = Math.max(y, Math.min(height, Math.ceil(height - crop.y * pixel)));
  return [x, y, right - x, top - y];
};
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

// The SPACE pass is shared with the space backdrop (space.ts): one shader for the whole game.

const GROUND_VERTEX = `
attribute vec4 aPosition; attribute vec4 aLook; attribute vec2 aStamp; attribute vec2 aTile;
uniform vec4 uRotation; uniform float uAspect; uniform float uFocal; uniform vec2 uShift;
varying vec2 vStamp; varying vec3 vNormal; varying vec3 vColour; varying float vEdge; varying float vFlags; varying float vSeed; varying vec3 vLocal;
varying vec2 vTile;
void main(){
  vStamp = aStamp;
  vTile = aTile * 1.27;
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
varying vec2 vStamp; varying vec3 vNormal; varying vec3 vColour; varying float vEdge; varying float vFlags; varying float vSeed; varying vec3 vLocal;
varying vec2 vTile; uniform sampler2D uTiles; uniform float uTilesOn;
uniform float uPulse; uniform float uPixel;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// Value noise fixed to the planet (not the screen), so the grain turns with the ground.
float hash3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
${CHALLENGE_STAMP_GLSL}
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
  // YOUR LAND WEARS YOUR TILES (owner, 2026-11-14: "use the 9 plain tiles on the planet as well"):
  // one of your set's nine plain tiles per tile, flat side up in its own frame (sphere/tile-face.ts),
  // under the same matte, grain, chamfer and light as every other tile. The branch is uniform
  // (off: no texture is read at all).
  if (uTilesOn > .5) {
    float pick = min(8.0, floor(floor(vSeed * 4096.0 + .5) / 455.0));
    vec2 cell = vec2(mod(pick, 3.0), floor(pick / 3.0));
    vec2 uv = clamp(vTile * .5 + .5, .006, .994);
    vec4 t = texture2D(uTiles, (cell + vec2(uv.x, 1.0 - uv.y)) * ${(160 / 512).toFixed(4)});
    c = mix(c, t.rgb, t.a * step(3.5, kind) * step(kind, 4.5));
  }
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
  float tone = mod(floor(vSeed * 4096.0 + .5), 455.0) / 455.0;
  c *= kind < 1.5 ? .9 + .2 * tone : .975 + .05 * tone;
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
  if (disputed > .5) {
    float ink = crossedSwords(vStamp);
    float aa = ${derivatives ? 'max(fwidth(ink), .008)' : 'max(uPixel * .6, .008)'};
    float coverage = 1.0 - smoothstep(-aa,aa,ink);
    // Ink darkens a light holding; a soft metal catch keeps the same insignia legible on basalt.
    vec3 stamp = dot(c,vec3(.3,.59,.11)) > .3 ? vec3(.10,.11,.10) : vec3(.63,.59,.49);
    c = mix(c, stamp, coverage * .73);
  }
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

/**
 * THE ART LAB'S TEXTURED PLANET (lab only; the game never passes `textures`, so its shader is the one
 * above, unchanged). One picture per tile kind in a 3×2 atlas (void, fog, land / owned, mine,
 * pentagon), projected on the planet from three sides so it needs no seams or unwrapping; owned
 * ground keeps its owner's colour by tinting the picture.
 */
const texturedFragment = (derivatives: boolean) => groundFragment(derivatives)
  .replace('uniform float uPulse; uniform float uPixel;', 'uniform float uPulse; uniform float uPixel; uniform sampler2D uAtlas; uniform vec3 uStrA; uniform vec3 uStrB; uniform float uRepeat;')
  .replace('  vec3 c = vColour;\n', `  vec3 c = vColour;
  {
    vec2 cell = vec2(mod(kind, 3.0), floor(kind / 3.0));
    vec3 an = abs(normalize(vLocal)); an /= (an.x + an.y + an.z);
    vec2 sc = vec2(3.0, 2.0);
    vec3 t = texture2D(uAtlas, (cell + .03 + fract(vLocal.yz * uRepeat) * .94) / sc).rgb * an.x
           + texture2D(uAtlas, (cell + .03 + fract(vLocal.xz * uRepeat) * .94) / sc).rgb * an.y
           + texture2D(uAtlas, (cell + .03 + fract(vLocal.xy * uRepeat) * .94) / sc).rgb * an.z;
    float str = kind < .5 ? uStrA.x : kind < 1.5 ? uStrA.y : kind < 2.5 ? uStrA.z : kind < 3.5 ? uStrB.x : kind < 4.5 ? uStrB.y : uStrB.z;
    float lum = max(dot(vColour, vec3(.3, .59, .11)), .06);
    vec3 tinted = kind > 2.5 && kind < 4.5 ? t * vColour / lum * .55 : t;
    c = mix(c, tinted, str);
  }
`);

/** Owned ground (anyone's) stands as a raised slab. */
const owned = (kind: number) => kind === KIND.owned || kind === KIND.mine;

export class PlanetRenderer {
  readonly gl: WebGLRenderingContext;
  bytes = 0;
  frames = 0;
  disposed = false;
  private space: ReturnType<typeof spacePass>;
  private ground: WebGLProgram;
  private buffers: WebGLBuffer[] = [];
  private triangle: WebGLBuffer;
  private positions: WebGLBuffer;
  private stamps: WebGLBuffer;
  private tileFrames: WebGLBuffer;
  /** Each tile's own turn (sphere/tile-face.ts): the view levels the tile at its centre with it. */
  private turn: Float32Array;
  private tileTexture: WebGLTexture | null = null;
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
  private attributes: {position: number; look: number; stamp: number; tile: number} | null = null;
  private pixel = 1;
  private cssWidth = 1;
  private cssHeight = 1;
  private derivatives: boolean;
  private atlas: WebGLTexture | null = null;
  private strengths = [0, 0, 0, 0, 0, 0];
  private repeat = 6;
  constructor(readonly canvas: HTMLCanvasElement, readonly sphere: Sphere,north:V3=[0,1,0], opts: { textures?: boolean } = {}) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!gl) throw Error('WebGL unavailable');
    this.gl = gl;
    this.derivatives = !!gl.getExtension('OES_standard_derivatives');
    this.ground = this.program(GROUND_VERTEX, opts.textures ? texturedFragment(this.derivatives) : groundFragment(this.derivatives));
    for (const name of ['uRotation', 'uAspect', 'uFocal', 'uShift', 'uPulse', 'uPixel', 'uTiles', 'uTilesOn', ...(opts.textures ? ['uAtlas', 'uStrA', 'uStrB', 'uRepeat'] : [])]) this.u[name] = gl.getUniformLocation(this.ground, name);
    this.triangle = this.buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));
    this.space = spacePass(gl, (v, f) => this.program(v, f), this.triangle);
    // Fans: centre, corner i, corner i+1 for every side of every tile. A cell's `w` packs its seed
    // (integer part) with the distance-to-side ramp (fraction: 0 at the centre, .999 on a side).
    const cells = sphere.cells;
    this.start = new Int32Array(cells.length);
    this.span = new Uint8Array(cells.length);
    let vertices = 0;
    for (const c of cells) { this.start[c.index] = vertices; this.span[c.index] = c.corners.length * 3; vertices += c.corners.length * 3; }
    this.vertexCount = vertices;
    const position = new Float32Array(vertices * 4);
    const stamps = new Int8Array(vertices * 2);
    // Each tile's own levelled frame (sphere/tile-face.ts), stored x100 so a corner just past the
    // unit circle still fits a byte; the shader scales it back (x1.27).
    const tiles = new Int8Array(vertices * 2);
    // NO TWO NEIGHBOURS ALIKE (owner, 2026-11-14): one of the nine plain tiles per cell, each cell
    // taking the first of its own shuffled nine that no already-placed neighbour wears. A tile has at
    // most six neighbours, so one is always free. Fixed by the planet's cells: it never changes.
    const variant = tileVariants(cells);
    this.turn = new Float32Array(cells.length);
    let to = 0;
    let so = 0;
    let o = 0;
    for (const c of cells) {
      const uv = stampCoordinates(c.centre, c.corners.map(i => sphere.corners[i]!),north);
      const face = tileFace(c.centre, c.corners.map(i => sphere.corners[i]!), north);
      this.turn[c.index] = face.angle;
      // The seed carries the tile's picture (variant * 455 + a tone of its own, below 4096).
      const seed = variant[c.index]! * 455 + Math.floor((Math.sin(c.index * 12.9898) * 43758.5453 % 1 + 1) % 1 * 455);
      for (let i = 0; i < c.corners.length; i++) {
        const a = sphere.corners[c.corners[i]!]!, b = sphere.corners[c.corners[(i + 1) % c.corners.length]!]!;
        for (const p of [[0,0],uv[i]!,uv[(i+1)%uv.length]!]) { stamps[so++] = Math.round(p[0]! * 127); stamps[so++] = Math.round(p[1]! * 127); }
        for (const p of [[0,0],face.coords[i]!,face.coords[(i+1)%face.coords.length]!]) { tiles[to++] = Math.round(p[0]! * 100); tiles[to++] = Math.round(p[1]! * 100); }
        position.set([c.centre[0], c.centre[1], c.centre[2], seed], o); o += 4;
        position.set([a[0], a[1], a[2], seed + .999], o); o += 4;
        position.set([b[0], b[1], b[2], seed + .999], o); o += 4;
      }
    }
    this.positions = this.buffer(gl.ARRAY_BUFFER, position);
    this.stamps = this.buffer(gl.ARRAY_BUFFER, stamps);
    this.tileFrames = this.buffer(gl.ARRAY_BUFFER, tiles);
    this.look = new Uint8Array(vertices * 4);
    this.flags = new Uint8Array(cells.length);
    this.looks = this.buffer(gl.ARRAY_BUFFER, this.look, gl.DYNAMIC_DRAW);
    this.bytes = position.byteLength + stamps.byteLength + tiles.byteLength + this.look.byteLength + 24;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(0, 0, 0, 1);
  }
  private program(vertex: string, fragment: string): WebGLProgram { return compileProgram(this.gl, vertex, fragment); }
  private buffer(target: number, data: BufferSource, usage?: number) {
    const gl = this.gl, b = gl.createBuffer();
    if (!b) throw Error('Graphics buffer unavailable');
    gl.bindBuffer(target, b); gl.bufferData(target, data, usage ?? gl.STATIC_DRAW);
    this.buffers.push(b);
    return b;
  }
  /** The Art Lab's pictures per tile kind (a 3×2 atlas) and how strongly each shows (0-1); textured planets only. */
  setTextures(atlas: TexImageSource, strengths: readonly number[], repeat = 6) {
    const gl = this.gl;
    if (!this.atlas) this.atlas = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.strengths = [...strengths];
    this.repeat = repeat;
  }
  /**
   * Your set's nine plain tiles (a 3x3 atlas, ui/forestAsh.ts), or null for plain colour. Uploaded
   * once when given (mount, or a new choice), mipmapped: never while the planet is at rest.
   */
  setTiles(atlas: TexImageSource | null) {
    const gl = this.gl;
    if (!atlas) { if (this.tileTexture) gl.deleteTexture(this.tileTexture); this.tileTexture = null; return; }
    this.tileTexture ??= gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tileTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
  }
  /** Whether your land is wearing tile pictures (for tests). */
  get hasTiles(): boolean { return !!this.tileTexture; }
  /** A tile's own turn (radians, counter-clockwise from flat-top-north). */
  tileTurn(cell: number): number { return this.turn[cell] ?? 0; }
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
    const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }
  render(q: Quat, zoom: number, pulse: number, drift: readonly [number, number], frame?: Frame, crop?: Frame) {
    const gl = this.gl;
    if (this.disposed || gl.isContextLost()) return;
    this.frames++;
    const w = this.canvas.width, h = this.canvas.height;
    const at = projection({ width: this.cssWidth, height: this.cssHeight }, frame ?? { x: 0, y: 0, width: this.cssWidth, height: this.cssHeight }, zoom);
    gl.viewport(0, 0, w, h);
    // CSS hides the rest of this full-screen canvas. Do not shade those invisible pixels.
    // The viewport/projection stay fixed, including throughout the menu's moving iris.
    const bounds = crop ? scissorFor(crop, w, h, this.pixel) : null;
    const clipped = bounds && (bounds[0] !== 0 || bounds[1] !== 0 || bounds[2] !== w || bounds[3] !== h);
    if (clipped) { gl.enable(gl.SCISSOR_TEST); gl.scissor(...bounds); }
    // 1. Space.
    gl.disable(gl.CULL_FACE);
    this.space.draw(w, h, [at.cx * this.pixel, h - at.cy * this.pixel], at.radius * this.pixel, drift, this.pixel);
    gl.enable(gl.CULL_FACE);
    // 2. Ground.
    gl.useProgram(this.ground);
    gl.uniform4f(this.u.uRotation!, q[0], q[1], q[2], q[3]);
    gl.uniform1f(this.u.uAspect!, at.aspect);
    gl.uniform1f(this.u.uFocal!, at.f);
    gl.uniform2f(this.u.uShift!, at.ox, at.oy);
    gl.uniform1f(this.u.uPulse!, pulse);
    if (this.u.uAtlas && this.atlas) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      gl.uniform1i(this.u.uAtlas, 0);
      const st = this.strengths;
      gl.uniform3f(this.u.uStrA!, st[0]!, st[1]!, st[2]!);
      gl.uniform3f(this.u.uStrB!, st[3]!, st[4]!, st[5]!);
      gl.uniform1f(this.u.uRepeat!, this.repeat);
    }
    gl.uniform1f(this.u.uTilesOn!, this.tileTexture ? 1 : 0);
    if (this.tileTexture) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.tileTexture);
      gl.uniform1i(this.u.uTiles!, 1);
      gl.activeTexture(gl.TEXTURE0);
    }
    // Without derivatives, one pixel of the side ramp is estimated from the tile's size on screen.
    gl.uniform1f(this.u.uPixel!, 1 / Math.max(4, at.radius * this.pixel * (Math.PI / 5) / this.sphere.frequency));
    // Resolve once, at the original first-draw point. Moving synchronous GL queries into
    // construction changes cold-start ordering before the first frame can be announced.
    const {position, look, stamp, tile} = this.attributes ??= {
      position:gl.getAttribLocation(this.ground,'aPosition'),look:gl.getAttribLocation(this.ground,'aLook'),stamp:gl.getAttribLocation(this.ground,'aStamp'),
      tile:gl.getAttribLocation(this.ground,'aTile'),
    };
    if (tile >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tileFrames);
      gl.enableVertexAttribArray(tile);
      gl.vertexAttribPointer(tile, 2, gl.BYTE, true, 0, 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.stamps);
    gl.enableVertexAttribArray(stamp);
    gl.vertexAttribPointer(stamp, 2, gl.BYTE, true, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positions);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.looks);
    gl.enableVertexAttribArray(look);
    gl.vertexAttribPointer(look, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.disableVertexAttribArray(position);
    gl.disableVertexAttribArray(look);
    gl.disableVertexAttribArray(stamp);
    if (tile >= 0) gl.disableVertexAttribArray(tile);
    if (clipped) gl.disable(gl.SCISSOR_TEST);
  }
  dispose(release = false) {
    if (this.disposed) return;
    this.disposed = true;
    for (const b of this.buffers) this.gl.deleteBuffer(b);
    if (this.atlas) this.gl.deleteTexture(this.atlas);
    if (this.tileTexture) this.gl.deleteTexture(this.tileTexture);
    this.gl.deleteProgram(this.space.program);
    this.gl.deleteProgram(this.ground);
    if (release) this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
export { KIND };
