// THE PLANET: the Territory's ground drawn as a world in space, inside the Territory window on /test/
// (owner, 2026-11-04: "replace and call it THE PLANET instead of TERRITORY ... Apply the whole window
// and overlay from current territory, so the sphere sits where current territory flat map sits ...
// Full Territory actions").
//
// This module only draws and steers. Territory (world-view.ts) keeps every rule, request, selection
// bar, sheet and window: a tap here hands it a flat tile id, exactly as a tap on the flat map did.
//
// MOTION: drag turns the planet under the finger, a flick keeps turning and slows, pinch/wheel zoom,
// a tap selects, a tap on tiles too small to hit flies in. Opening flies in from space to your land.
// The stars slide slowly while any space is on screen (owner: "deep space subtle + space with slow
// slide"); that is the only loop, it runs at ~30 fps, and it stops when the planet fills the window,
// the page is hidden, or reduced motion is on.
import { interfaceMotionAllowed } from '../ui/interface-motion.js';
import { settleWorldMaterial } from '../worlds/motion.js';
import { menuDiscRadius } from '../player/planet-lockup.js';
import { claimSpace, DRIFT_PX_PER_MS, DRIFT_Y_SHARE, freeSpace, spaceDrift } from './space.js';
import { buildSphere, homeQuat, latticeMap, pickCell, unit, type Sphere, type V3 } from './geometry.js';
import { arcQuat, inverse, multiply, rotate, slerp, trackball, type Quat } from './rotation.js';
import { groundOf, KIND, tileForCell, type Ground, type GroundInput } from './ground.js';
import { PlanetRenderer, EYE, discRadius, projection, type Frame } from './renderer.js';

/** A tile's width on screen at zoom 1, as a fraction of the disc radius (centre of the view). */
const TILE_AT_ZOOM_1 = (n: number) => (Math.atan(2) / n) * (Math.sqrt(EYE * EYE - 1) / (EYE - 1));
/** The tile size the planet opens at and flies to: the flat map's own comfortable size. */
const OPEN_TILE_PX = 44;
/** Below this a tap is too coarse to choose a tile, so it flies in instead. */
const TAP_TILE_PX = 30;
const MAX_TILE_PX = 84;
const MIN_ZOOM = .92;
/** Behind the main menu the whole planet floats a little smaller, halo and all (owner, 2026-11-04:
 *  "Make the live territory in background of main menu be the planet ... the starting position of
 *  when you open the planet"). */
const MENU_ZOOM = .78;
const OUT_MS = 900;
const FLY_MS = 620;
const INTRO_MS = 1150;
/** Behind the menu the planet turns slowly on its own (owner, 2026-11-04): one turn in 160 s. */
const MENU_SPIN_RAD_PER_MS = (2 * Math.PI) / 160_000;
/** The planet's light behind the menu, and in the window (the flat map's own "fade in"). */
// Brighter behind the menu (owner, 2026-11-04: "make the sphere when on main menu brighter/ higher
// opacity - with low brightness of screen is barely visible"): was .46. It is the canvas's opacity.
const MENU_LIGHT = .9;
/** A tapped tile below this share of the window (the tile bar's band), or this near an edge, comes clear. */
const CLEAR_FOOT = .7;
const CLEAR_EDGE = .1;
/** The window's corner radius, matching `.world-grid`. */
const FRAME_RADIUS = 14;

export type PlanetInput = GroundInput & { selected: string | null; home: string | null };
export type PlanetHooks = {
  /** A tap chose a known tile (its flat id) or empty space/unknown ground (null). */
  onTile: (id: string | null) => void;
  label: string;
  unavailable: string;
  /** Where the planet starts: behind the menu (dim, whole) or in the Territory window. */
  mode?: PlanetMode;
  /** The Territory window's panel, in viewport px: the planet's frame while in the window. */
  panel?: () => DOMRect | null;
  /**
   * Behind the menu: the box the planet should enclose (the logo and its wordmark, owner 2026-11-04:
   * "have the globe around it ... The logo grouped perfectly centered in the sphere"). Null: the
   * whole screen, as before.
   */
  enclose?: () => DOMRect | null;
  /** A tap landed on one of the twelve black pentagons: nothing can grow there. */
  onBlocked?: () => void;
};
/**
 * WHERE THE MENU'S PLANET WAS (owner, 2026-11-04: "the animation of rotating the sphere goes back to
 * where it was ... so it's continuous rather than starting again every time main menu is open").
 * Module memory: it outlives a planet freed for a game and remounted after it.
 */
let menuMemory: Quat | null = null;
export type PlanetMode = 'menu' | 'world';
export type Planet = ReturnType<typeof mountPlanet>;

const easeInOut = (t: number) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export const mountPlanet = (stage: HTMLElement, hooks: PlanetHooks) => {
  const sphere: Sphere = buildSphere();
  const map = latticeMap(sphere);
  const canvas = document.createElement('canvas');
  canvas.className = 'planet-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', hooks.label);
  const fallback = document.createElement('p');
  fallback.className = 'planet-fallback';
  fallback.hidden = true;
  stage.append(canvas, fallback);

  const abort = new AbortController(), signal = abort.signal;
  let renderer: PlanetRenderer | null = null, lost = false, disposed = false, frozen = false;
  let raf = 0, lastFrame = 0;
  // THE CANVAS IS ONE FIXED SHEET OVER THE WHOLE SCREEN, behind the menu and in the window alike; only
  // the FRAME the planet is drawn into moves (see `projection`). `view` is the canvas in viewport px.
  let view = { left: 0, top: 0, width: 1, height: 1 };
  const viewOf = () => ({ left: 0, top: 0, width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) });
  const full = (): Frame => ({ x: 0, y: 0, width: view.width, height: view.height });
  let ground: Ground | null = null, input: PlanetInput | null = null, signature = '';
  let selected: number | null = null, pulseUntil = 0;
  let q: Quat = [0, 0, 0, 1], zoom = 1, targetZoom = 1;
  let speed = 0, axis: V3 = [0, 1, 0], lastMove = 0, lastBall: V3 = [0, 0, 1];
  /** `elapsed` advances by each painted frame's (capped) time, never by the wall clock: a busy main
   *  thread (the window opening, data arriving) pauses the flight instead of skipping most of it. */
  /** `aimPx`: the tile size a flight into the window lands on, re-read against the panel every frame
   *  (the panel may still be settling its layout when the flight starts). */
  let flight: { from: Quat; to: Quat; zoomFrom: number; zoomTo: number; elapsed: number; ms: number; ease: (t: number) => number; t: number; aimPx?: number } | null = null;
  /** The frame and the light have their own tween: a touch may stop the camera, never snap the window. */
  let frameTween: { from: Frame; cropFrom: Frame; lightFrom: number; lightTo: number; elapsed: number; ms: number } | null = null;
  /** The visible part of the canvas: the whole screen behind the menu, the panel in the window. */
  let cropNow: Frame = { x: 0, y: 0, width: 1, height: 1 };
  const cropTarget = (): Frame => {
    if (mode !== 'world') return full();
    const panel = hooks.panel?.();
    if (!panel || !(panel.width > 0) || !(panel.height > 0)) return full();
    return { x: panel.left - view.left, y: panel.top - view.top, width: panel.width, height: panel.height };
  };
  const mix = (a: Frame, b: Frame, k: number): Frame => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k,
    width: a.width + (b.width - a.width) * k, height: a.height + (b.height - a.height) * k });
  const differs = (a: Frame, b: Frame) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height) > .5;
  let drift: [number, number] = [0, 0], introduced = false, posed = false, mode: PlanetMode = hooks.mode ?? 'world';
  let frameNow: Frame = { x: 0, y: 0, width: 1, height: 1 }, light = mode === 'menu' ? MENU_LIGHT : 1;
  let shownClip = '', shownLight = '';
  const pointers = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number } | null = null, dragged = false, multi = false, pinch = 0, lastTap = 0;

  const motion = () => interfaceMotionAllowed();
  /** The frame the current mode asks for: the whole screen behind the menu, the panel in the window. */
  const frameTarget = (): Frame => {
    if (mode !== 'world') {
      // Behind the menu: centred on the logo group, sized so the globe's disc encloses it.
      const box = hooks.enclose?.();
      if (!box || !(box.width > 0) || !(box.height > 0)) return full();
      const radius = menuDiscRadius(box, view.width, view.height);
      const side = (2 * radius) / (.82 * MENU_ZOOM);
      return { x: box.left - view.left + box.width / 2 - side / 2, y: box.top - view.top + box.height / 2 - side / 2, width: side, height: side };
    }
    const panel = hooks.panel?.();
    if (!panel || !(panel.width > 0) || !(panel.height > 0)) return full();
    return { x: panel.left - view.left, y: panel.top - view.top, width: panel.width, height: panel.height };
  };
  const tilePx = (z = zoom, f: Frame = frameNow) => discRadius(f.width, f.height, z) * TILE_AT_ZOOM_1(sphere.frequency);
  const zoomFor = (px: number, f: Frame = frameTarget()) => px / Math.max(1e-6, tilePx(1, f));
  const clampZoom = (z: number) => Math.min(zoomFor(MAX_TILE_PX), Math.max(mode === 'menu' ? MENU_ZOOM : MIN_ZOOM, z));
  const spaceVisible = () => discRadius(frameNow.width, frameNow.height, zoom) < Math.hypot(frameNow.width, frameNow.height) / 2;
  const ask = () => { if (!raf && !disposed && !frozen && !lost && !document.hidden) raf = requestAnimationFrame(frame); };
  const stop = () => { speed = 0; flight = null; targetZoom = zoom; };
  const centre = () => ({ x: view.left + frameNow.x + frameNow.width / 2, y: view.top + frameNow.y + frameNow.height / 2 });
  const ball = (p: { x: number; y: number }) => {
    const c = centre();
    return trackball(p.x - c.x, p.y - c.y, discRadius(frameNow.width, frameNow.height, zoom));
  };
  const spread = () => { const [a, b] = [...pointers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  const kinOf = (index: number | null) => {
    const owner = index === null || !ground ? null : ground.owner[index];
    return owner ? sphere.cells.filter((c) => ground!.owner[c.index] === owner && c.index !== index).map((c) => c.index) : [];
  };
  const cellAt = (x: number, y: number): number | null => {
    const at = projection(view, frameNow, zoom), inv = inverse(q);
    const origin = rotate(inv, [0, 0, EYE]);
    const nx = (x - view.left) / view.width * 2 - 1 - at.ox, ny = 1 - (y - view.top) / view.height * 2 - at.oy;
    const direction = rotate(inv, unit([nx * at.aspect / at.f, ny / at.f, -1]));
    return pickCell(sphere, origin, direction);
  };
  /** The planet's surface point (planet coords) under screen point (x, y), or null off the planet. */
  const surfaceAt = (x: number, y: number): V3 | null => {
    const at = projection(view, frameNow, zoom), inv = inverse(q);
    const o = rotate(inv, [0, 0, EYE]);
    const nx = (x - view.left) / view.width * 2 - 1 - at.ox, ny = 1 - (y - view.top) / view.height * 2 - at.oy;
    const d = rotate(inv, unit([nx * at.aspect / at.f, ny / at.f, -1]));
    const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - 1, h = b * b - c;
    if (h < 0) return null;
    const t = -b - Math.sqrt(h);
    return [o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2]];
  };
  /**
   * ZOOM TOWARDS THE FINGERS (a pinch's midpoint, the mouse under the wheel): after a zoom step, turn
   * the planet so the ground that was under that point is under it again, like any map.
   */
  let anchor: { x: number; y: number; at: V3 } | null = null;
  const keepAnchor = () => {
    if (!anchor) return;
    const now = surfaceAt(anchor.x, anchor.y);
    if (!now) { anchor = null; return; }
    const from = rotate(q, anchor.at), to = rotate(q, now);
    if (Math.hypot(from[0] - to[0], from[1] - to[1], from[2] - to[2]) > 1e-6) q = multiply(arcQuat(unit(from), unit(to)), q);
  };
  /** Where planet cell `index` sits on screen (CSS px), or null when it faces away. */
  const screenOfCell = (index: number) => {
    const p = rotate(q, sphere.cells[index]!.centre);
    if (p[2] < 0) return null;
    const at = projection(view, frameNow, zoom), w = EYE - p[2];
    return { x: view.left + (p[0] * at.f / at.aspect / w + at.ox + 1) / 2 * view.width, y: view.top + (1 - (p[1] * at.f / w + at.oy)) / 2 * view.height };
  };
  /** Fly so `index` faces the camera, at `toZoom`. */
  const flyToCell = (index: number, toZoom: number, ms = FLY_MS, ease = easeOut) => {
    const towards = multiply(arcQuat(rotate(q, sphere.cells[index]!.centre), [0, 0, 1]), q);
    flyTo(towards, toZoom, ms, ease);
  };
  const flyTo = (to: Quat, toZoom: number, ms = FLY_MS, ease = easeOut, aimPx?: number) => {
    speed = 0;
    const lightTo = mode === 'menu' ? MENU_LIGHT : 1;
    if (!motion()) { q = to; zoom = targetZoom = toZoom; flight = null; frameTween = null; frameNow = frameTarget(); cropNow = cropTarget(); light = lightTo; ask(); return; }
    flight = { from: q, to, zoomFrom: zoom, zoomTo: toZoom, elapsed: 0, ms, ease, t: 0, ...(aimPx ? { aimPx } : {}) };
    if (lightTo !== light || differs(frameTarget(), frameNow) || differs(cropTarget(), cropNow)) {
      frameTween = { from: { ...frameNow }, cropFrom: { ...cropNow }, lightFrom: light, lightTo, elapsed: 0, ms };
    }
    lastFrame = 0;
    ask();
  };

  function frame(now: number) {
    raf = 0;
    if (disposed || frozen || lost || document.hidden || !renderer) return;
    const gap = Math.max(1, now - (lastFrame || now - 16)), dt = Math.min(48, gap);
    lastFrame = now;
    if (!motion()) { speed = 0; if (flight) { q = flight.to; zoom = targetZoom = flight.zoomTo; flight = null; } zoom = targetZoom; pulseUntil = 0; }
    // Up to 250 ms per frame counts: a slow device still lands about on time, a real stall pauses.
    const step = Math.min(250, gap);
    if (flight) {
      if (flight.aimPx && mode === 'world') flight.zoomTo = clampZoom(zoomFor(flight.aimPx));
      flight.elapsed += step;
      const t = Math.min(1, flight.elapsed / flight.ms), k = flight.ease(t);
      flight.t = t;
      q = slerp(flight.from, flight.to, k);
      zoom = targetZoom = flight.zoomFrom * Math.pow(flight.zoomTo / flight.zoomFrom, k);
      if (t === 1) flight = null;
    }
    const target = frameTarget();
    if (frameTween && motion()) {
      // THE FRAME CLOSES IN LIKE AN IRIS, a little ahead of the camera (done by ~60% of the flight),
      // so the window is in place before the ground arrives. The light rises (or falls) over the
      // whole flight: the flat map's own fade, on the planet.
      frameTween.elapsed += step;
      const t = Math.min(1, frameTween.elapsed / frameTween.ms), kf = easeOut(Math.min(1, t / .6)), kl = easeInOut(t);
      // The planet's own frame glides with the camera; the crop (the window closing in, or opening
      // back to the whole screen) leads it, like an iris.
      frameNow = mix(frameTween.from, target, kl);
      cropNow = mix(frameTween.cropFrom, cropTarget(), kf);
      light = frameTween.lightFrom + (frameTween.lightTo - frameTween.lightFrom) * kl;
      if (t === 1) { frameTween = null; frameNow = target; cropNow = cropTarget(); }
    } else { frameTween = null; frameNow = target; cropNow = cropTarget(); light = mode === 'menu' ? MENU_LIGHT : 1; }
    // Behind the menu the planet turns slowly by itself, about its own up axis on screen.
    if (mode === 'menu' && !flight && motion()) {
      const s = Math.sin((MENU_SPIN_RAD_PER_MS * dt) / 2);
      q = multiply([0, s, 0, Math.cos((MENU_SPIN_RAD_PER_MS * dt) / 2)], q);
    }
    if (mode === 'menu' && !flight && posed) menuMemory = q;
    if (speed > 0 && !pointers.size) {
      const angle = speed * dt, s = Math.sin(angle / 2);
      q = multiply([axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)], q);
      speed *= Math.exp(-dt / 260);
      if (speed < .00002) speed = 0;
    }
    if (Math.abs(targetZoom - zoom) > zoom * .0005) zoom += (targetZoom - zoom) * (1 - Math.exp(-dt / 70));
    else zoom = targetZoom;
    if (anchor && !flight) { keepAnchor(); if (zoom === targetZoom) anchor = null; }
    const drifting = motion() && (spaceVisible() || mode === 'menu');
    // THE STARS RUSH during a flight (fastest mid-way) and settle as it lands; at rest, the slow slide.
    const rush = flight ? 1 + 16 * Math.sin(Math.PI * flight.t) : 1;
    // The stars also answer the planet's turn a little, so space has depth.
    const turn = rotate(q, [0, 0, 1]);
    // THE STARS ARE ONE SKY (0.75): taking the screen from the space backdrop, the planet starts its
    // slide where the backdrop left it, so the star field never cuts between the menu and a game.
    if (spaceDrift.owner !== 'planet') {
      claimSpace();
      drift = [spaceDrift.x - turn[0] * 40, spaceDrift.y - turn[1] * 40];
    }
    if (drifting || flight) { drift = [drift[0] + dt * DRIFT_PX_PER_MS * rush, drift[1] + dt * DRIFT_PX_PER_MS * DRIFT_Y_SHARE * rush]; }
    const pulse = pulseUntil > now ? Math.sin(Math.PI * (1 - (pulseUntil - now) / 420)) : 0;
    paintFrame();
    const offset: [number, number] = [drift[0] + turn[0] * 40, drift[1] + turn[1] * 40];
    renderer.render(q, zoom, pulse, offset, frameNow);
    spaceDrift.x = offset[0]; spaceDrift.y = offset[1];
    const busy = !!flight || !!frameTween || (speed > 0 && !pointers.size) || zoom !== targetZoom || pulseUntil > now;
    if (busy) ask();
    // The slow slide: about 30 frames a second, only while there is space to see.
    else if (drifting) window.setTimeout(ask, 18);
  }

  /** The crop (the window's own rounded frame) and the light, written only when they change. */
  const paintFrame = () => {
    const c = cropNow;
    const whole = c.x <= .5 && c.y <= .5 && c.width >= view.width - .5 && c.height >= view.height - .5;
    const clip = whole ? 'none' : `inset(${c.y.toFixed(1)}px ${(view.width - c.x - c.width).toFixed(1)}px ${(view.height - c.y - c.height).toFixed(1)}px ${c.x.toFixed(1)}px round ${FRAME_RADIUS}px)`;
    if (clip !== shownClip) { shownClip = clip; canvas.style.clipPath = clip; canvas.style.setProperty('-webkit-clip-path', clip); }
    const lit = light.toFixed(3);
    if (lit !== shownLight) { shownLight = lit; canvas.style.opacity = lit; }
  };
  const resize = () => {
    // A new screen size keeps the TILE SIZE, not the zoom number: rotating a phone must not make the
    // ground jump closer or further. The canvas itself only changes with the screen.
    const keep = renderer && view.width > 1 ? tilePx(zoom) : 0;
    view = viewOf();
    // THE CANVAS IS EXACTLY THE SIZE IT IS DRAWN FOR (owner, 2026-11-04, iPhone Safari: "the sphere
    // get squished and looks like an egg - should never happen"). CSS 100vh there is the LARGE
    // viewport (under the toolbars), taller than innerHeight, which the picture is drawn for: the
    // browser stretched it vertically. The box now takes the measured size, in px, every resize.
    canvas.style.width = `${view.width}px`;
    canvas.style.height = `${view.height}px`;
    if (!renderer) return;
    renderer.resize(view.width, view.height);
    if (!flight && !frameTween) {
      frameNow = frameTarget();
      cropNow = cropTarget();
      if (mode === 'menu') zoom = targetZoom = posed ? zoom : MENU_ZOOM;
      else if (keep) zoom = targetZoom = clampZoom(zoomFor(keep));
    }
    if (!introduced && input) intro();
    paintFrame();
    ask();
  };
  /** The menu's pose, which is also where the opening flight begins: the whole planet, a quarter
   *  turn away from your land. */
  const menuPose = (): Quat => {
    const tilt = Math.sin(.55), roll: Quat = [tilt * .6, tilt * .8, 0, Math.cos(.55)];
    return multiply(roll, homeQuat(sphere, map, input?.home ?? '0,0'));
  };
  const intro = () => {
    introduced = true;
    if (mode === 'menu') {
      if (!posed) { q = menuMemory ?? menuPose(); zoom = targetZoom = MENU_ZOOM; frameNow = frameTarget(); cropNow = cropTarget(); light = MENU_LIGHT; posed = true; }
      ask();
      return;
    }
    const target = homeQuat(sphere, map, input?.home ?? '0,0');
    const open = clampZoom(zoomFor(OPEN_TILE_PX));
    if (!motion()) { q = target; zoom = targetZoom = open; frameNow = frameTarget(); cropNow = cropTarget(); light = 1; posed = true; ask(); return; }
    // FROM WHEREVER IT IS, down to your biggest land (owner, 2026-11-04). Opened from the menu the
    // planet is already on screen, turned however far its slow spin took it: the flight starts from
    // that exact pose, size and frame, so the first frame is the menu's last. Opened elsewhere (the
    // hub), it starts from the menu's pose in the window.
    if (!posed) { q = menuMemory ?? menuPose(); zoom = targetZoom = MENU_ZOOM; frameNow = frameTarget(); cropNow = cropTarget(); light = MENU_LIGHT; posed = true; }
    flyTo(target, open, INTRO_MS, easeInOut, OPEN_TILE_PX);
  };
  const fail = (text: string) => { fallback.textContent = text; fallback.hidden = false; canvas.hidden = true; };
  const initialise = () => {
    try {
      renderer = new PlanetRenderer(canvas, sphere);
      lost = false; fallback.hidden = true; canvas.hidden = false;
      if (ground) renderer.setGround(ground, selected, kinOf(selected));
      resize();
    } catch {
      renderer = null;
      fail(hooks.unavailable);
    }
  };

  // ---- input ------------------------------------------------------------------------------------
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || lost || !renderer || mode === 'menu') return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    stop(); lastFrame = 0; anchor = null;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* a cancelled touch */ }
    if (pointers.size === 1) { start = { x: e.clientX, y: e.clientY }; dragged = false; multi = false; lastBall = ball(start); lastMove = performance.now(); }
    else { multi = true; dragged = true; pinch = spread(); }
  }, { signal });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    e.preventDefault();
    const p = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, p);
    if (pointers.size > 1) {
      const d = spread();
      if (pinch > 0) {
        const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, at = surfaceAt(mid.x, mid.y);
        zoom = targetZoom = clampZoom(zoom * d / pinch);
        if (at) { anchor = { ...mid, at }; keepAnchor(); anchor = null; }
        ask();
      }
      pinch = d;
      return;
    }
    if (!dragged && start && Math.hypot(p.x - start.x, p.y - start.y) < 6) return;
    dragged = true;
    const at = performance.now(), next = ball(p), step = arcQuat(lastBall, next);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(step[3])));
    q = multiply(step, q);
    axis = unit([step[0], step[1], step[2]]);
    speed = Math.min(.004, angle / Math.max(8, at - lastMove));
    lastMove = at; lastBall = next;
    ask();
  }, { signal });
  const release = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const tap = pointers.size === 1 && !dragged && !multi && e.type === 'pointerup';
    pointers.delete(e.pointerId);
    if (tap) { speed = 0; tapAt(e.clientX, e.clientY); }
    if (pointers.size === 1) { lastBall = ball([...pointers.values()][0]!); lastMove = performance.now(); speed = 0; }
    if (!pointers.size) {
      // A flick carries on; a drag that paused before letting go stops where it is.
      if (e.type !== 'pointerup' || !motion() || performance.now() - lastMove > 70 || speed < .0006) speed = 0;
      start = null;
      if (speed) ask();
    }
  };
  canvas.addEventListener('pointerup', release, { signal });
  canvas.addEventListener('pointercancel', release, { signal });
  canvas.addEventListener('lostpointercapture', (e) => { if (pointers.has(e.pointerId)) { pointers.delete(e.pointerId); speed = 0; start = null; } }, { signal });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    speed = 0; flight = null;
    if (mode === 'menu') return;
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? frameNow.height : 1);
    targetZoom = clampZoom(targetZoom * Math.exp(-pixels * .0018));
    const at = surfaceAt(e.clientX, e.clientY);
    anchor = at ? { x: e.clientX, y: e.clientY, at } : null;
    if (!motion()) { zoom = targetZoom; keepAnchor(); anchor = null; }
    ask();
  }, { signal, passive: false });
  const tapAt = (x: number, y: number) => {
    const index = cellAt(x, y);
    const now = performance.now(), double = now - lastTap < 320;
    lastTap = double ? 0 : now;
    // A quick second tap zooms in on that spot, like the flat map's double tap; fully zoomed in, it
    // zooms back out to the opening size (owner, 2026-11-04: "double tap when full zoomed in should
    // zoom out not not do anything").
    if (double) {
      if (index === null) return;
      const closer = clampZoom(zoom * 1.8);
      flyToCell(index, closer > zoom * 1.02 ? closer : clampZoom(zoomFor(OPEN_TILE_PX)));
      return;
    }
    if (index === null) { hooks.onTile(null); return; }
    // Tiles too small to hit reliably: the tap brings you closer instead of guessing.
    if (tilePx() < TAP_TILE_PX) { flyToCell(index, clampZoom(zoomFor(OPEN_TILE_PX))); return; }
    // EVERY hexagon is a tile you can tap (owner, 2026-11-04: "ALL can be taped"); only the twelve
    // pentagons are not ground.
    if (ground && ground.kind[index]! === KIND.pentagon) { hooks.onTile(null); hooks.onBlocked?.(); return; }
    const id = tileForCell(map, index);
    hooks.onTile(id);
    // THE TAPPED TILE COMES CLEAR of the tile bar along the window's foot and of the frame's edges:
    // the planet turns it towards the middle, at the same zoom.
    const at = id === null ? null : screenOfCell(index);
    if (at) {
      const f = frameNow, fx = (at.x - view.left - f.x) / f.width, fy = (at.y - view.top - f.y) / f.height;
      if (fy > CLEAR_FOOT || fy < CLEAR_EDGE || fx < CLEAR_EDGE || fx > 1 - CLEAR_EDGE) flyToCell(index, zoom, FLY_MS);
    }
  };
  canvas.addEventListener('keydown', (e) => {
    if (mode === 'menu') return;
    const axes: Record<string, V3> = { ArrowLeft: [0, -1, 0], ArrowRight: [0, 1, 0], ArrowUp: [-1, 0, 0], ArrowDown: [1, 0, 0] };
    if (axes[e.key]) {
      e.preventDefault(); stop();
      const a = axes[e.key]!, s = Math.sin(.6 / (zoom * 4) + .01);
      q = multiply([a[0] * s, a[1] * s, a[2] * s, Math.sqrt(1 - s * s)], q);
      ask();
    } else if (['+', '=', '-'].includes(e.key)) {
      e.preventDefault(); stop();
      targetZoom = clampZoom(zoom * (e.key === '-' ? 1 / 1.25 : 1.25));
      ask();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = centre();
      tapAt(c.x, c.y);
    }
  }, { signal });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; stop(); cancelAnimationFrame(raf); raf = 0; }, { signal });
  canvas.addEventListener('webglcontextrestored', () => { renderer?.dispose(); initialise(); }, { signal });
  document.addEventListener('visibilitychange', () => { stop(); cancelAnimationFrame(raf); raf = 0; if (!document.hidden) { lastFrame = 0; ask(); } }, { signal });
  // The screen's size moves the canvas; the panel's size moves only the frame (read every frame).
  window.addEventListener('resize', resize, { signal, passive: true });
  window.addEventListener('futasaku:world-style', () => {
    ask();settleWorldMaterial(canvas,motion());
  }, { signal });
  const observer = new ResizeObserver(() => { if (!flight && !frameTween) resize(); else ask(); });
  observer.observe(stage);

  initialise();

  return {
    /** Fresh Territory data. Re-uploads tile looks only when something drawn actually changed. */
    update(next: PlanetInput) {
      input = next;
      const fog = [...(next.fog ?? [])];
      const disputes = [...(next.disputes ?? [])];
      const sig = `${next.me}|${next.growAnywhere ? 1 : 0}|${next.cells.length}|${next.claims.map((c) => `${c.cellId}:${c.ownerId}:${c.colour}`).join(',')}|${fog.length}|${disputes.join(',')}`;
      const index = next.selected ? map.cellOf.get(next.selected) ?? null : null;
      // A REFRESH THAT CHANGES NOTHING DRAWS NOTHING: Territory re-sends the same world on every
      // poll, and that used to repaint the planet and re-pulse the selected tile each time.
      const newGround = sig !== signature, newSelection = index !== selected;
      if (newGround) {
        signature = sig;
        ground = groundOf(sphere, map, { ...next, fog, disputes });
        selected = index;
        renderer?.setGround(ground, selected, kinOf(selected));
      } else if (newSelection) {
        selected = index;
        renderer?.setSelection(selected, kinOf(selected));
      }
      if (newSelection && index !== null && motion()) pulseUntil = performance.now() + 420;
      if (!introduced && renderer) intro();
      if (newGround || newSelection) ask();
    },
    /**
     * Behind the menu, or in the Territory window. Into the window: the opening flight from the
     * menu pose down to your land. Back to the menu: the same flight in reverse, out to the whole
     * planet, playing behind the menu that is already there.
     */
    setMode(next: PlanetMode) {
      if (frozen) { frozen = false; lastFrame = 0; ask(); }
      if (next === mode) return;
      mode = next;
      speed = 0;
      pointers.clear();
      if (!renderer || !input) { introduced = false; return; }
      if (next === 'world') { if (posed) menuMemory = q; introduced = false; intro(); return; }
      // Back to the menu: to exactly where the menu's planet was, so its slow turn carries on.
      const back = menuMemory ?? menuPose();
      if (!motion()) { q = back; zoom = targetZoom = MENU_ZOOM; frameTween = null; frameNow = frameTarget(); cropNow = cropTarget(); light = MENU_LIGHT; paintFrame(); ask(); return; }
      flyTo(back, MENU_ZOOM, OUT_MS, easeInOut);
    },
    /** Retain the last painted planet during PLAY's compositor fade; hand the sky over once. */
    freeze(on: boolean) {
      if (frozen === on) return;
      frozen = on; lastFrame = 0;
      if (on) { cancelAnimationFrame(raf); raf = 0; if (spaceDrift.owner === 'planet') freeSpace(); }
      else ask();
    },
    /** Bring flat tile `id` (e.g. the player's own land) to the middle at a comfortable size. */
    /**
     * A TILE WAS JUST GROWN: two soft rings leave it over the ground it lights up (the planet's own
     * version of the flat map's grow ripple). One DOM element, one CSS animation that ends and removes
     * itself: no render loop, nothing left behind. Reduce motion: nothing.
     */
    grown(id: string) {
      const index = map.cellOf.get(id);
      const at = index === undefined || !motion() || mode !== 'world' ? null : screenOfCell(index);
      if (!at) return;
      const ring = document.createElement('span');
      ring.className = 'planet-grown';
      ring.setAttribute('aria-hidden', 'true');
      ring.style.left = `${at.x.toFixed(1)}px`;
      ring.style.top = `${at.y.toFixed(1)}px`;
      ring.style.setProperty('--tile', `${Math.max(12, tilePx()).toFixed(1)}px`);
      canvas.after(ring);
      const done = () => ring.remove();
      ring.addEventListener('animationend', (e) => { if (e.target === ring) done(); });
      window.setTimeout(done, 2000);
    },
    home(id: string | null) {
      const index = id ? map.cellOf.get(id) : undefined;
      if (index === undefined || !renderer) return;
      flyTo(homeQuat(sphere, map, id!), Math.max(zoom, clampZoom(zoomFor(OPEN_TILE_PX))));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort(); observer.disconnect(); cancelAnimationFrame(raf); raf = 0;
      if (renderer) renderer.dispose(true);
      // The sky goes back to the space backdrop, which carries on from the planet's last stars.
      if (spaceDrift.owner === 'planet') freeSpace();
      canvas.remove(); fallback.remove();
    },
    snapshot: () => ({
      ready: !!renderer && !lost,
      cells: sphere.cells.length,
      zoom, tilePx: tilePx(), q: [...q], selected: selected === null ? null : tileForCell(map, selected),
      frames: renderer?.frames ?? 0, bytes: renderer?.bytes ?? 0, pendingFrame: !!raf || !!flight || !!frameTween,
      flying: !!flight || !!frameTween, spinning: speed > 0, mode, spaceVisible: spaceVisible(), fallback: !fallback.hidden,
      light, frame: { ...frameNow }, crop: { ...cropNow },
      /** The globe's disc on screen (CSS px): centre and radius. */
      disc: { x: view.left + frameNow.x + frameNow.width / 2, y: view.top + frameNow.y + frameNow.height / 2, r: discRadius(frameNow.width, frameNow.height, zoom) },
      /** Where a flat tile's centre is on screen right now (CSS px), or null when it faces away. */
      screenOf: (id: string) => {
        const index = map.cellOf.get(id);
        return index === undefined ? null : screenOfCell(index);
      },
    }),
  };
};
