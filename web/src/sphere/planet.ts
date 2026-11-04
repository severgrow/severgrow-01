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
import { buildSphere, homeQuat, latticeMap, pickCell, unit, type Sphere, type V3 } from './geometry.js';
import { arcQuat, inverse, multiply, rotate, slerp, trackball, type Quat } from './rotation.js';
import { groundOf, KIND, tileForCell, type Ground, type GroundInput } from './ground.js';
import { PlanetRenderer, EYE, focal, discRadius } from './renderer.js';

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
const DRIFT_PX_PER_MS = .006;

export type PlanetInput = GroundInput & { selected: string | null; home: string | null };
export type PlanetHooks = {
  /** A tap chose a known tile (its flat id) or empty space/unknown ground (null). */
  onTile: (id: string | null) => void;
  label: string;
  unavailable: string;
  /** Where the planet starts: behind the menu (dim, whole) or in the Territory window. */
  mode?: PlanetMode;
};
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
  let renderer: PlanetRenderer | null = null, lost = false, disposed = false;
  let raf = 0, lastFrame = 0, rect = stage.getBoundingClientRect();
  let ground: Ground | null = null, input: PlanetInput | null = null, signature = '';
  let selected: number | null = null, pulseUntil = 0;
  let q: Quat = [0, 0, 0, 1], zoom = 1, targetZoom = 1;
  let speed = 0, axis: V3 = [0, 1, 0], lastMove = 0, lastBall: V3 = [0, 0, 1];
  /** `elapsed` advances by each painted frame's (capped) time, never by the wall clock: a busy main
   *  thread (the window opening, data arriving) pauses the flight instead of skipping most of it. */
  let flight: { from: Quat; to: Quat; zoomFrom: number; zoomTo: number; elapsed: number; ms: number; ease: (t: number) => number } | null = null;
  let drift: [number, number] = [0, 0], introduced = false, mode: PlanetMode = hooks.mode ?? 'world';
  const pointers = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number } | null = null, dragged = false, multi = false, pinch = 0, lastTap = 0;

  const motion = () => interfaceMotionAllowed();
  const tilePx = (z = zoom) => discRadius(rect.width, rect.height, z) * TILE_AT_ZOOM_1(sphere.frequency);
  const zoomFor = (px: number) => px / Math.max(1e-6, tilePx(1));
  const clampZoom = (z: number) => Math.min(zoomFor(MAX_TILE_PX), Math.max(mode === 'menu' ? MENU_ZOOM : MIN_ZOOM, z));
  const spaceVisible = () => discRadius(rect.width, rect.height, zoom) < Math.hypot(rect.width, rect.height) / 2;
  const ask = () => { if (!raf && !disposed && !lost && !document.hidden) raf = requestAnimationFrame(frame); };
  const stop = () => { speed = 0; flight = null; targetZoom = zoom; };
  const ball = (p: { x: number; y: number }) =>
    trackball(p.x - rect.left - rect.width / 2, p.y - rect.top - rect.height / 2, discRadius(rect.width, rect.height, zoom));
  const spread = () => { const [a, b] = [...pointers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  const kinOf = (index: number | null) => {
    const owner = index === null || !ground ? null : ground.owner[index];
    return owner ? sphere.cells.filter((c) => ground!.owner[c.index] === owner && c.index !== index).map((c) => c.index) : [];
  };
  const cellAt = (x: number, y: number): number | null => {
    const aspect = rect.width / rect.height, f = focal(aspect, zoom), inv = inverse(q);
    const origin = rotate(inv, [0, 0, EYE]);
    const direction = rotate(inv, unit([((x - rect.left) / rect.width * 2 - 1) * aspect / f, (1 - (y - rect.top) / rect.height * 2) / f, -1]));
    return pickCell(sphere, origin, direction);
  };
  /** Fly so `index` faces the camera, at `toZoom`. */
  const flyToCell = (index: number, toZoom: number, ms = FLY_MS, ease = easeOut) => {
    const towards = multiply(arcQuat(rotate(q, sphere.cells[index]!.centre), [0, 0, 1]), q);
    flyTo(towards, toZoom, ms, ease);
  };
  const flyTo = (to: Quat, toZoom: number, ms = FLY_MS, ease = easeOut) => {
    speed = 0;
    if (!motion()) { q = to; zoom = targetZoom = toZoom; flight = null; ask(); return; }
    flight = { from: q, to, zoomFrom: zoom, zoomTo: toZoom, elapsed: 0, ms, ease };
    lastFrame = 0;
    ask();
  };

  function frame(now: number) {
    raf = 0;
    if (disposed || lost || document.hidden || !renderer) return;
    const gap = Math.max(1, now - (lastFrame || now - 16)), dt = Math.min(48, gap);
    lastFrame = now;
    if (!motion()) { speed = 0; if (flight) { q = flight.to; zoom = targetZoom = flight.zoomTo; flight = null; } zoom = targetZoom; pulseUntil = 0; }
    if (flight) {
      // Up to 250 ms per frame counts: a slow device still lands about on time, a real stall pauses.
      flight.elapsed += Math.min(250, gap);
      const t = Math.min(1, flight.elapsed / flight.ms), k = flight.ease(t);
      q = slerp(flight.from, flight.to, k);
      zoom = targetZoom = flight.zoomFrom * Math.pow(flight.zoomTo / flight.zoomFrom, k);
      if (t === 1) flight = null;
    }
    if (speed > 0 && !pointers.size) {
      const angle = speed * dt, s = Math.sin(angle / 2);
      q = multiply([axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)], q);
      speed *= Math.exp(-dt / 260);
      if (speed < .00002) speed = 0;
    }
    if (Math.abs(targetZoom - zoom) > zoom * .0005) zoom += (targetZoom - zoom) * (1 - Math.exp(-dt / 70));
    else zoom = targetZoom;
    const drifting = motion() && spaceVisible();
    if (drifting) { drift = [drift[0] + dt * DRIFT_PX_PER_MS, drift[1] + dt * DRIFT_PX_PER_MS * .38]; }
    // The stars also answer the planet's turn a little, so space has depth.
    const turn = rotate(q, [0, 0, 1]);
    const pulse = pulseUntil > now ? Math.sin(Math.PI * (1 - (pulseUntil - now) / 420)) : 0;
    renderer.render(q, zoom, pulse, [drift[0] + turn[0] * 40, drift[1] + turn[1] * 40]);
    const busy = !!flight || (speed > 0 && !pointers.size) || zoom !== targetZoom || pulseUntil > now;
    if (busy) ask();
    // The slow slide: about 30 frames a second, only while there is space to see.
    else if (drifting) window.setTimeout(ask, 18);
  }

  const resize = () => {
    // A new window size keeps the TILE SIZE, not the zoom number: rotating a phone must not make
    // the ground jump closer or further.
    const sized = rect.width > 0 && rect.height > 0;
    const keep = sized ? tilePx(zoom) : 0;
    const aim = sized && flight ? [tilePx(flight.zoomFrom), tilePx(flight.zoomTo)] as const : null;
    rect = stage.getBoundingClientRect();
    if (!renderer || !rect.width || !rect.height) return;
    renderer.resize(rect.width, rect.height);
    // A flight is exempt from the window's zoom floor: it may start from the menu's smaller planet.
    const same = keep ? zoomFor(keep) : zoom;
    zoom = targetZoom = mode === 'menu' && !flight ? MENU_ZOOM : flight ? same : clampZoom(same);
    // A flight under way (the opening, say) still lands at the tile size it was aiming for. Out to
    // the menu, it lands on the menu's own whole-planet size for the new (full-screen) box.
    if (flight && aim) {
      flight.zoomFrom = zoomFor(aim[0]);
      flight.zoomTo = mode === 'menu' ? MENU_ZOOM : clampZoom(zoomFor(aim[1]));
    }
    if (!introduced && input) intro();
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
    if (mode === 'menu') { q = menuPose(); zoom = targetZoom = MENU_ZOOM; ask(); return; }
    const target = homeQuat(sphere, map, input?.home ?? '0,0');
    const open = clampZoom(zoomFor(OPEN_TILE_PX));
    if (!motion()) { q = target; zoom = targetZoom = open; ask(); return; }
    // From space down to your land. Opened from the menu, the planet is ALREADY at the menu pose,
    // so this flight simply continues what was behind the buttons.
    if (!flight) { q = menuPose(); zoom = targetZoom = MENU_ZOOM; }
    flyTo(target, open, INTRO_MS, easeInOut);
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
    stop(); lastFrame = 0;
    rect = stage.getBoundingClientRect();
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
      if (pinch > 0) { zoom = targetZoom = clampZoom(zoom * d / pinch); ask(); }
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
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1);
    targetZoom = clampZoom(targetZoom * Math.exp(-pixels * .0018));
    if (!motion()) zoom = targetZoom;
    ask();
  }, { signal, passive: false });
  const tapAt = (x: number, y: number) => {
    const index = cellAt(x, y);
    const now = performance.now(), double = now - lastTap < 320;
    lastTap = double ? 0 : now;
    // A quick second tap zooms in on that spot, like the flat map's double tap.
    if (double) { if (index !== null) flyToCell(index, clampZoom(zoom * 1.8)); return; }
    if (index === null) { hooks.onTile(null); return; }
    // Tiles too small to hit reliably: the tap brings you closer instead of guessing.
    if (tilePx() < TAP_TILE_PX) { flyToCell(index, clampZoom(zoomFor(OPEN_TILE_PX))); return; }
    // Known land and owned tiles are always tiles; with grow-anywhere every hexagon of the planet is.
    const tile = ground && ((ground.kind[index]! >= KIND.land && ground.kind[index]! <= KIND.mine) || (input?.growAnywhere && ground.kind[index]! !== KIND.pentagon));
    const id = tile ? tileForCell(map, index) : null;
    hooks.onTile(id);
  };
  canvas.addEventListener('keydown', (e) => {
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
      tapAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  }, { signal });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; stop(); cancelAnimationFrame(raf); raf = 0; }, { signal });
  canvas.addEventListener('webglcontextrestored', () => { renderer?.dispose(); initialise(); }, { signal });
  document.addEventListener('visibilitychange', () => { stop(); cancelAnimationFrame(raf); raf = 0; if (!document.hidden) { lastFrame = 0; ask(); } }, { signal });
  const observer = new ResizeObserver(resize);
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
      if (sig !== signature) {
        signature = sig;
        ground = groundOf(sphere, map, { ...next, fog, disputes });
        selected = index;
        renderer?.setGround(ground, selected, kinOf(selected));
      } else if (index !== selected) {
        selected = index;
        renderer?.setSelection(selected, kinOf(selected));
      }
      if (index !== null && motion()) pulseUntil = performance.now() + 420;
      if (!introduced && rect.width && rect.height && renderer) intro();
      ask();
    },
    /**
     * Behind the menu, or in the Territory window. Into the window: the opening flight from the
     * menu pose down to your land. Back to the menu: the same flight in reverse, out to the whole
     * planet, playing behind the menu that is already there.
     */
    setMode(next: PlanetMode) {
      if (next === mode) return;
      mode = next;
      speed = 0;
      pointers.clear();
      if (!renderer || !input) { introduced = false; return; }
      if (next === 'world') { introduced = false; intro(); return; }
      if (!motion()) { q = menuPose(); zoom = targetZoom = MENU_ZOOM; ask(); return; }
      flyTo(menuPose(), MENU_ZOOM, OUT_MS, easeInOut);
    },
    /** Bring flat tile `id` (e.g. the player's own land) to the middle at a comfortable size. */
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
      canvas.remove(); fallback.remove();
    },
    snapshot: () => ({
      ready: !!renderer && !lost,
      cells: sphere.cells.length,
      zoom, tilePx: tilePx(), q: [...q], selected: selected === null ? null : tileForCell(map, selected),
      frames: renderer?.frames ?? 0, bytes: renderer?.bytes ?? 0, pendingFrame: !!raf || !!flight,
      flying: !!flight, spinning: speed > 0, mode, spaceVisible: spaceVisible(), fallback: !fallback.hidden,
      /** Where a flat tile's centre is on screen right now (CSS px), or null when it faces away. */
      screenOf: (id: string) => {
        const index = map.cellOf.get(id);
        if (index === undefined) return null;
        const p = rotate(q, sphere.cells[index]!.centre);
        if (p[2] < 0) return null;
        const aspect = rect.width / rect.height, f = focal(aspect, zoom), w = EYE - p[2];
        return { x: rect.left + (p[0] * f / aspect / w + 1) / 2 * rect.width, y: rect.top + (1 - p[1] * f / w) / 2 * rect.height };
      },
    }),
  };
};
