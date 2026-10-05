// The skinned board's ground: ONE canvas picture of the whole board, painted from continuous
// world-space seamless textures (never one finished picture per hex), then shown through an SVG
// pattern that every hex is filled with (like ui/worldlayer.ts), so neighbouring hexes show
// neighbouring parts of the same texture and the ground joins up by itself.
//
// Per hex: base texture(s) -> overlay texture through the strength coverage mask -> the local
// clarity masks take the overlay back under the number and the gold badge -> cut-off tint.
// Textures are sampled in screen space (the board's screen coordinates), so when the board turns
// in 60-degree steps the painted light and brushwork stay upright. Missing textures fall back to
// the skin's flat greybox colours; the masks and the whole pipeline still run.
import { allNeighbors, coordKey, parseKey } from '../../../../src/engine/index.js';
import { cornerPts } from '../geom.js';
import type { SkinAssets } from './assets.js';
import type { MaterialDef, SkinDef } from './types.js';
import type { Orient } from '../../logic/orient.js';

export type Tint = {
  desaturate?: number;
  darken?: number;
  warm_shift?: number;
  cool_shift?: number;
  dryness?: number;
  ash?: number;
  magma_reduction?: number;
};

export type GroundCell = {
  key: string;
  /** centre, board (screen) units */
  x: number;
  y: number;
  material: string;
  /** strength coverage mask 1-9 (0: none) */
  coverage: number;
  /** mirror the coverage mask (deterministic variety; masks carry no lighting) */
  mirror: boolean;
  /** a gold hex: calm the badge zone too */
  rich: boolean;
  /** drawn first (a scar shows the dead material over the empty ground) */
  under?: string;
  /** opacity of `material` over `under` */
  alpha?: number;
  tint?: Tint | null;
};

export type Box = { x0: number; y0: number; w: number; h: number };

/** Half the mask frame: masks span the hex's corner-to-corner box, 60 board units. */
const HALF = 30;

const blendB = (x: number, y: number) => Math.min(1, Math.max(0, 0.5 + 0.62 * Math.sin(x / 173 + 1.3) * Math.cos(y / 151 - 0.4)));

type Loaded = {
  tex: Map<string, CanvasPattern | null>;
  cover: Map<number, HTMLCanvasElement | null>;
  number: HTMLCanvasElement | null;
  gold: HTMLCanvasElement | null;
};

export class GroundPainter {
  constructor(
    private skin: SkinDef,
    private assets: SkinAssets,
  ) {}

  /** Paints every cell into a new canvas covering `box` at `ppu` canvas pixels per board unit. */
  async paint(box: Box, ppu: number, cells: GroundCell[], orient: Orient): Promise<HTMLCanvasElement | null> {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(box.w * ppu));
    canvas.height = Math.max(1, Math.ceil(box.h * ppu));
    const g = canvas.getContext('2d');
    if (!g) return null;
    const L = await this.load(g, cells, orient);
    const world = (c: CanvasRenderingContext2D, ox = 0, oy = 0) => c.setTransform(ppu, 0, 0, ppu, -box.x0 * ppu - ox, -box.y0 * ppu - oy);
    const fill = (c: CanvasRenderingContext2D, mat: MaterialDef, which: 'base' | 'b' | 'overlay') => {
      const src = which === 'overlay' ? mat.overlay : which === 'b' ? mat.base[1] : mat.base[0];
      const pat = src ? L.tex.get(src) : null;
      c.fillStyle = pat ?? (which === 'overlay' ? (mat.proxy.overlay ?? mat.proxy.base) : mat.proxy.base);
      return !!pat || which !== 'b';
    };
    const tmpSize = Math.ceil(2 * HALF * ppu) + 2;
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = tmpSize;
    const t = tmp.getContext('2d')!;

    const paintMaterial = (cell: GroundCell, id: string, alpha: number) => {
      const mat = this.skin.materials[id];
      if (!mat) return;
      g.globalAlpha = alpha;
      world(g);
      g.beginPath();
      g.rect(cell.x - HALF, cell.y - HALF, 2 * HALF, 2 * HALF);
      fill(g, mat, 'base');
      g.fill();
      if (mat.base[1] && L.tex.get(mat.base[1])) {
        g.globalAlpha = alpha * blendB(cell.x, cell.y);
        fill(g, mat, 'b');
        g.fill();
      }
      g.globalAlpha = 1;
      if (cell.coverage <= 0 || !L.cover.get(cell.coverage)) return;
      // the overlay through the coverage mask, then calmed under the number and badge
      const ox = Math.floor((cell.x - HALF - box.x0) * ppu);
      const oy = Math.floor((cell.y - HALF - box.y0) * ppu);
      t.globalCompositeOperation = 'source-over';
      t.globalAlpha = 1;
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.clearRect(0, 0, tmpSize, tmpSize);
      world(t, ox, oy);
      fill(t, mat, 'overlay');
      t.fillRect(cell.x - HALF - 1, cell.y - HALF - 1, 2 * HALF + 2, 2 * HALF + 2);
      t.globalCompositeOperation = 'destination-in';
      const m = L.cover.get(cell.coverage)!;
      if (cell.mirror) {
        t.save();
        t.translate(2 * cell.x, 0);
        t.scale(-1, 1);
        t.drawImage(m, cell.x - HALF, cell.y - HALF, 2 * HALF, 2 * HALF);
        t.restore();
      } else t.drawImage(m, cell.x - HALF, cell.y - HALF, 2 * HALF, 2 * HALF);
      t.globalCompositeOperation = 'destination-out';
      t.globalAlpha = mat.clarity;
      if (L.number) t.drawImage(L.number, cell.x - HALF, cell.y - HALF, 2 * HALF, 2 * HALF);
      if (cell.rich && L.gold) t.drawImage(L.gold, cell.x - HALF, cell.y - HALF, 2 * HALF, 2 * HALF);
      const reduce = cell.tint?.magma_reduction ?? 0;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = alpha * (1 - reduce);
      g.drawImage(tmp, ox, oy);
      g.restore();
      g.globalAlpha = 1;
    };

    const tintCell = (tint: Tint, a: number) => {
      const op = (mode: GlobalCompositeOperation, color: string, amount: number | undefined) => {
        if (!amount) return;
        g.globalCompositeOperation = mode;
        g.globalAlpha = Math.min(1, amount * a);
        g.fillStyle = color;
        g.fill();
      };
      op('saturation', '#808080', tint.desaturate);
      op('multiply', '#c2a774', tint.dryness ? tint.dryness * 0.5 : 0);
      op('source-over', '#6f6a64', tint.ash ? tint.ash * 0.35 : 0);
      op('soft-light', '#e0a040', tint.warm_shift);
      op('soft-light', '#5f86b0', tint.cool_shift);
      op('source-over', '#000000', tint.darken);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    };

    const paintCell = (cell: GroundCell, reach: number) => {
      g.save();
      world(g);
      const pts = cornerPts(cell.key, HALF * reach);
      g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.closePath();
      g.clip();
      if (cell.under) paintMaterial({ ...cell, coverage: 0 }, cell.under, 1);
      paintMaterial(cell, cell.material, cell.alpha ?? 1);
      if (cell.tint) {
        world(g);
        g.beginPath();
        pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
        g.closePath();
        tintCell(cell.tint, cell.alpha ?? 1);
      }
      g.restore();
    };
    // every hex a little past its true outline (the SVG outline does the exact clip, and hexes of
    // one material join without a hairline); then the hexes beside a different material once more
    // at their exact size, so no neighbour's colour shows inside them
    const look = (c: GroundCell) => `${c.material}|${c.under ?? ''}|${c.alpha ?? 1}|${c.tint ? 1 : 0}`;
    const byKey = new Map(cells.map((c) => [c.key, look(c)]));
    for (const cell of cells) paintCell(cell, 1.04);
    for (const cell of cells) {
      const mine = byKey.get(cell.key);
      if (allNeighbors(parseKey(cell.key)).some((n) => byKey.has(coordKey(n)) && byKey.get(coordKey(n)) !== mine)) paintCell(cell, 1);
    }
    return canvas;
  }

  /** Everything the cells need, from the current tier (missing files give null: greybox). */
  private async load(g: CanvasRenderingContext2D, cells: GroundCell[], orient: Orient): Promise<Loaded> {
    const skin = this.skin;
    const a = this.assets;
    const texPaths = new Set<string>();
    const covers = new Set<number>();
    for (const c of cells) {
      for (const id of [c.material, c.under]) {
        const m = id ? skin.materials[id] : undefined;
        if (!m) continue;
        for (const p of [...m.base, m.overlay]) if (p) texPaths.add(p);
      }
      if (c.coverage > 0) covers.add(c.coverage);
    }
    const tex = new Map<string, CanvasPattern | null>();
    await Promise.all(
      [...texPaths].map(async (p) => {
        const img = await a.image(p);
        const pat = img ? g.createPattern(img, 'repeat') : null;
        // texture pixels -> board units: one texture spans skin.worldUnits, whatever the tier
        if (pat && img) pat.setTransform(new DOMMatrix([skin.worldUnits / img.width, 0, 0, skin.worldUnits / img.height, 0, 0]));
        tex.set(p, pat);
      }),
    );
    const cover = new Map<number, HTMLCanvasElement | null>();
    await Promise.all([...covers].map(async (n) => cover.set(n, await a.mask(skin.masks.coverage(n, orient)))));
    const [number, gold] = await Promise.all([a.mask(skin.masks.clarityNumber(orient), true), a.mask(skin.masks.clarityGold(orient), true)]);
    return { tex, cover, number, gold };
  }
}
