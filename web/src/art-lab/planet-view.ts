// THE PLANET, STILL: the game's own planet renderer in its lab-only textured mode, with the pack's
// picture for each tile kind. A made-up holding (your land, two neighbours, free land, the fog rings,
// the unexplored rest and the twelve pentagons) so every kind shows. Drag to turn; it never spins
// on its own and draws only when something changes (no frame loop).
import { buildSphere } from '../sphere/geometry.js';
import type { Sphere } from '../sphere/geometry.js';
import { GROUND_RGB, KIND } from '../sphere/ground.js';
import type { Ground } from '../sphere/ground.js';
import { PlanetRenderer } from '../sphere/renderer.js';
import { multiply, normalise } from '../sphere/rotation.js';
import type { Quat } from '../sphere/rotation.js';
import type { LabState } from './pack.js';

const KINDS = ['planet-void', 'planet-fog', 'planet-land', 'planet-owned', 'planet-mine', 'planet-pentagon'] as const;
const hexRgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const; };

/** A holding that shows every kind of tile: rings out from a few centres. */
const demoGround = (sphere: Sphere): Ground => {
  const n = sphere.cells.length;
  const kind = new Uint8Array(n).fill(KIND.void), colour = new Float32Array(n * 3), border = new Uint8Array(n), disputed = new Uint8Array(n);
  const owner: (string | null)[] = new Array(n).fill(null);
  const nearest = (v: readonly [number, number, number]) => sphere.cells.reduce((b, c) => (c.centre[0] * v[0] + c.centre[1] * v[1] + c.centre[2] * v[2] > b.centre[0] * v[0] + b.centre[1] * v[1] + b.centre[2] * v[2] ? c : b)).index;
  const rings = (start: number, depth: number) => {
    const d = new Map([[start, 0]]);
    let front = [start];
    for (let r = 1; r <= depth; r++) {
      const next: number[] = [];
      for (const i of front) for (const nb of sphere.cells[i]!.neighbours) if (!d.has(nb)) { d.set(nb, r); next.push(nb); }
      front = next;
    }
    return d;
  };
  const set = (i: number, k: number, rgb: readonly number[], who: string | null = null) => {
    if (sphere.cells[i]!.pentagon) return;
    kind[i] = k; colour.set(rgb, i * 3); owner[i] = who;
  };
  for (let i = 0; i < n; i++) colour.set(GROUND_RGB.void, i * 3);
  const holdings: [readonly [number, number, number], number, string, string][] = [
    [[0, 0.2, 1], KIND.mine, '#4df0b4', 'me'], [[0.45, 0.35, 0.85], KIND.owned, '#ff6b4a', 'a'], [[-0.4, -0.1, 0.9], KIND.owned, '#b389f3', 'b'],
  ];
  for (const [v] of holdings) for (const [i, r] of rings(nearest(normalise([v[0], v[1], v[2], 0]).slice(0, 3) as never), 7)) {
    if (r >= 6) { if (kind[i] === KIND.void) set(i, KIND.fog, GROUND_RGB.fog); } else if (r >= 3 && (kind[i] ?? 0) < KIND.land) set(i, KIND.land, GROUND_RGB.land);
  }
  for (const [v, k, c, who] of holdings) for (const [i, r] of rings(nearest(normalise([v[0], v[1], v[2], 0]).slice(0, 3) as never), 2)) if (r <= 2) set(i, k, hexRgb(c), who);
  for (const c of sphere.cells) if (c.pentagon) { kind[c.index] = KIND.pentagon; colour.set(GROUND_RGB.pentagon, c.index * 3); }
  for (const c of sphere.cells) c.neighbours.forEach((nb, e) => { if (owner[c.index] !== owner[nb] || kind[c.index] !== kind[nb]) border[c.index] = (border[c.index] ?? 0) | (1 << e); });
  return { kind, colour, border, disputed, skin: new Uint8Array(n), owner };
};

export const mountPlanet = (pane: HTMLElement, art: () => LabState) => {
  const note = document.createElement('p');
  note.className = 'lead';
  note.textContent = 'The planet with your textures, held still: drag to turn it. Your land is green, two other players hold red and violet land; around them free land, the fog rings, the unexplored ground and the black pentagons. A kind with no picture keeps the game\'s own colour.';
  const canvas = document.createElement('canvas');
  canvas.className = 'planet-canvas';
  canvas.setAttribute('aria-label', 'The planet, drawn with the pack\'s textures');
  canvas.setAttribute('role', 'img');
  pane.append(note, canvas);
  let renderer: PlanetRenderer | null = null;
  let q: Quat = normalise([0.08, -0.12, 0, 1]);
  let visible = false;
  let atlasRev = -1;
  let rev = 0;
  const draw = () => {
    if (!renderer || !visible) return;
    const r = canvas.getBoundingClientRect();
    renderer.resize(r.width, r.height);
    renderer.render(q, 1.15, 0, [0, 0]);
  };
  const atlas = async () => {
    const s = art();
    const c = document.createElement('canvas');
    c.width = 1536; c.height = 1024;
    const g = c.getContext('2d')!;
    const strengths: number[] = [];
    for (const [i, id] of KINDS.entries()) {
      const f = s.slots[id]?.files[0];
      const x = (i % 3) * 512, y = Math.floor(i / 3) * 512;
      if (f) {
        try {
          const b = await createImageBitmap(new Blob([f.lo as Uint8Array<ArrayBuffer>], { type: f.mime }));
          g.drawImage(b, x, y, 512, 512);
          strengths.push(Number(s.slots[id]?.settings.strength ?? 0.85));
          continue;
        } catch { /* a broken picture: the kind keeps its colour */ }
      }
      g.fillStyle = '#808080'; g.fillRect(x, y, 512, 512);
      strengths.push(0);
    }
    return { c, strengths };
  };
  const refresh = async () => {
    rev++;
    if (!visible) return;
    if (!renderer) {
      try {
        const sphere = buildSphere();
        renderer = new PlanetRenderer(canvas, sphere, [0, 1, 0], { textures: true });
        renderer.setGround(demoGround(sphere), null, []);
      } catch {
        note.textContent = 'This browser cannot draw the planet (WebGL is off).';
        return;
      }
    }
    if (atlasRev !== rev) {
      atlasRev = rev;
      const { c, strengths } = await atlas();
      renderer.setTextures(c, strengths);
    }
    draw();
  };
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / 260, dy = (e.clientY - drag.y) / 260;
    drag = { x: e.clientX, y: e.clientY };
    q = multiply(normalise([Math.sin(dy / 2), Math.sin(dx / 2), 0, Math.cos(Math.hypot(dx, dy) / 2)]), q);
    draw();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  addEventListener('resize', () => draw());
  return {
    show: () => { visible = true; void refresh(); },
    hide: () => { visible = false; },
    refresh: () => void refresh(),
  };
};
