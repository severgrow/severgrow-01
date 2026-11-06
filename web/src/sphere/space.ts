// ONE SPACE FOR THE WHOLE GAME (owner, 2026-11-04, the 0.75 polish pass: "Reuse the planet's own
// SPACE pass ... WITHOUT the planet and its halo. Do not copy the shader; share it.").
//
// The planet's first pass (renderer.ts) and the space backdrop behind the Play submenu and the board
// (web/src/player/space-backdrop.ts) draw with THIS one shader. Without a planet the shader is given a
// vanishing radius: the halo and the warmer glow toward the planet fall away by their own maths, and
// what is left is the same deep sky, the same two sliding star layers and the same still grain.
//
// The star field's OFFSET is shared too (`spaceDrift`): whoever draws space last leaves it here, and
// whoever draws next starts from it, so the stars carry on without a cut from the menu's planet into a
// game and back (owner: "Seamless menu → game: the stars carry on without a cut").

/** How fast the stars slide, CSS px per ms (the planet's own pace behind the menu). */
export const DRIFT_PX_PER_MS = .006;
/** The far layer slides this much slower than the near one (parallax). */
export const DRIFT_Y_SHARE = .38;

export const SPACE_VERTEX = `
attribute vec2 aCorner;
void main(){ gl_Position = vec4(aCorner, 0.0, 1.0); }`;

export const SPACE_FRAGMENT = `
precision highp float;
uniform vec2 uSize; uniform vec2 uCentre; uniform float uRadius; uniform vec2 uDrift; uniform float uScale;
// x: the sky (and its grain), y: the far stars, z: the near stars. The planet draws all three; the
// backdrop draws one star layer at a time on a clear background, to slide each on the compositor.
uniform vec3 uLayers;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float stars(vec2 p, float cell, float density){
  vec2 c = floor(p / cell), f = fract(p / cell);
  float h = hash(c);
  if (h < density) return 0.0;
  vec2 at = vec2(hash(c + 7.1), hash(c + 3.7)) * .7 + .15;
  float d = length((f - at) * cell);
  float size = mix(.55, 1.35, hash(c + 1.9)) * uScale;
  // A small in-focus core and a very faint soft skirt, varied by depth. No post-process blur.
  float core = 1.0 - smoothstep(0.0, size, d);
  float soft = exp(-d*d / (size*size*1.4)) * .11;
  return (core * .74 + soft) * mix(.22, .92, (h - density) / (1.0 - density));
}
void main(){
  vec2 p = gl_FragCoord.xy;
  // Deep space, a touch warmer toward the planet so it never floats on flat black.
  float d = length(p - uCentre) / uRadius;
  // Beta 0.8 charcoal (owner, 2026-11-06): the deepest sky is #0e0f10, never pure black.
  vec3 sky = mix(vec3(.068, .072, .070), vec3(.055, .059, .063), smoothstep(.9, 3.2, d));
  float s = (stars(p + uDrift * .35, 9.0 * uScale, .965) * .55 * uLayers.y + stars(p + uDrift, 17.0 * uScale, .955) * uLayers.z) * smoothstep(1.0, 1.25, d);
  if (uLayers.x < .5) { gl_FragColor = vec4(vec3(.86, .84, .78) * s, s); return; }
  sky += vec3(.86, .84, .78) * s;
  // The halo: the atmosphere's light scattered past the limb, falling off into space.
  float out_ = max(0.0, d - 1.0);
  sky += vec3(.44, .58, .52) * (exp(-out_ * 11.0) * .30 + exp(-out_ * 3.2) * .07) * step(1.0, d);
  // Still grain, the same film the flat map wears.
  sky += (hash(p) - .5) * .022;
  gl_FragColor = vec4(sky, 1.0);
}`;

/**
 * The star field's offset (CSS px) as last drawn, shared by every space on the page. `owner` is the
 * drawer that currently has the screen: while the planet is drawing space, the backdrop rests.
 */
export const spaceDrift: { x: number; y: number; owner: 'planet' | 'backdrop' | null; sync?: () => void } = { x: 0, y: 0, owner: null };

const freeListeners = new Set<() => void>();
const claimListeners = new Set<() => void>();
/** The planet starts drawing space: the backdrop writes where its stars are now, then rests. */
export const claimSpace = () => {
  spaceDrift.sync?.();
  spaceDrift.owner = 'planet';
  for (const f of claimListeners) f();
};
export const onSpaceClaim = (f: () => void) => { claimListeners.add(f); return () => claimListeners.delete(f); };
/** The planet stopped drawing space: whoever waits for the sky gets it back (from the same stars). */
export const freeSpace = () => { if (spaceDrift.owner === 'planet') spaceDrift.owner = null; for (const f of freeListeners) f(); };
export const onSpaceFree = (f: () => void) => { freeListeners.add(f); return () => freeListeners.delete(f); };

/** Advance an offset by `dt` ms of sliding (near layer; the shader slows the far one). */
export const slide = (at: { x: number; y: number }, dt: number, rush = 1) => {
  at.x += dt * DRIFT_PX_PER_MS * rush;
  at.y += dt * DRIFT_PX_PER_MS * DRIFT_Y_SHARE * rush;
};

/** A radius so small that nothing of a planet (glow, halo, cut-out) reaches a single pixel. */
export const NO_PLANET = 1e-4;

type SpaceUniforms = { layers: WebGLUniformLocation | null; size: WebGLUniformLocation | null; centre: WebGLUniformLocation | null; radius: WebGLUniformLocation | null; drift: WebGLUniformLocation | null; scale: WebGLUniformLocation | null };

/** Compile the shared space program on `gl` and return a function that draws it full-screen. */
export const spacePass = (gl: WebGLRenderingContext, compile: (vertex: string, fragment: string) => WebGLProgram, triangle: WebGLBuffer) => {
  const program = compile(SPACE_VERTEX, SPACE_FRAGMENT);
  const u: SpaceUniforms = {
    layers: gl.getUniformLocation(program, 'uLayers'),
    size: gl.getUniformLocation(program, 'uSize'), centre: gl.getUniformLocation(program, 'uCentre'),
    radius: gl.getUniformLocation(program, 'uRadius'), drift: gl.getUniformLocation(program, 'uDrift'),
    scale: gl.getUniformLocation(program, 'uScale'),
  };
  const corner = gl.getAttribLocation(program, 'aCorner');
  return {
    program,
    /** Draw space into the current viewport (device px): a planet at `centre` with `radius`, or none. */
    draw(width: number, height: number, centre: readonly [number, number], radius: number, drift: readonly [number, number], pixel: number, layers: readonly [number, number, number] = [1, 1, 1]) {
      gl.useProgram(program);
      gl.uniform3f(u.layers, layers[0], layers[1], layers[2]);
      gl.uniform2f(u.size, width, height);
      gl.uniform2f(u.centre, centre[0], centre[1]);
      gl.uniform1f(u.radius, radius);
      gl.uniform2f(u.drift, drift[0] * pixel, drift[1] * pixel);
      gl.uniform1f(u.scale, pixel);
      gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
      gl.enableVertexAttribArray(corner);
      gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(corner);
    },
  };
};

/** Compile helper shared by both drawers. */
export const compileProgram = (gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram => {
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
};

/**
 * SPACE ALONE: the shared pass on its own canvas, with no planet. Used behind the Play submenu, the
 * board in game and the menu until the planet is ready. One full-screen triangle per frame.
 */
export class SpaceRenderer {
  private gl: WebGLRenderingContext;
  private pass: ReturnType<typeof spacePass>;
  private triangle: WebGLBuffer;
  private pixel = 1;
  frames = 0;
  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!gl) throw Error('WebGL unavailable');
    this.gl = gl;
    const triangle = gl.createBuffer();
    if (!triangle) throw Error('Graphics buffer unavailable');
    gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.triangle = triangle;
    this.pass = spacePass(gl, (v, f) => compileProgram(gl, v, f), triangle);
    gl.disable(gl.DEPTH_TEST);
  }
  /** Device px per CSS px for the layers (the planet's own cap). */
  get scale() { return this.pixel; }
  /**
   * Draw ONE star layer ('far' or 'near') at `drift` on a clear background, `width` x `height` CSS px,
   * and return the canvas to copy from (copy it in the same task: the buffer is not preserved).
   */
  layer(which: 'far' | 'near', width: number, height: number, drift: readonly [number, number]) {
    const gl = this.gl;
    this.pixel = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
    const w = Math.max(1, Math.round(width * this.pixel)), h = Math.max(1, Math.round(height * this.pixel));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.frames++;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.pass.draw(w, h, [w / 2, h / 2], NO_PLANET, drift, this.pixel, which === 'far' ? [0, 1, 0] : [0, 0, 1]);
    return this.canvas;
  }
  get lost() { return this.gl.isContextLost(); }
  dispose() {
    this.gl.deleteBuffer(this.triangle);
    this.gl.deleteProgram(this.pass.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
