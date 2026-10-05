// DESIGN mode: illustrated V2 skin layered over the real Severor board.
//
// This class deliberately leaves BoardView and the normal Lab renderer untouched.
// It reuses all existing board/game behavior, then replaces only the visual tile/network
// presentation when ?design=1 is active on the test copy.
import type { Player, RulesConfig, Terrain, Tile } from '../../../src/engine/index.js';
import { looseEdges, networkEdges, veinLook } from '../logic/network.js';
import type { MaterialLook } from '../logic/materials.js';
import { getOrient } from '../logic/orient.js';
import type { ThemeId, ThemeStyle } from '../logic/themes.js';
import { BoardView, S, centerOf } from './board.js';
import type { BoardHandlers, Overlay } from './board.js';
import { el } from './geom.js';

const ASSET = 'design-v2';
const SVG_NS = 'http://www.w3.org/2000/svg';
const START = 10.4;
const MID_TANGENT = 5.2;
const SQ3 = Math.sqrt(3);
let designBoardCount = 0;
const DETAILS = { forest: [1, 5, 6, 7, 8], volcano: [6, 7] } as const;

type DesignVein = { a: string; b: string; owner: Player; el: SVGElement };

const pad2 = (n: number) => String(Math.max(1, Math.min(9, Math.round(n)))).padStart(2, '0');

const stableHash = (s: string) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  return h >>> 0;
};

const cubicPoint = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
) => {
  const m = 1 - t;
  return {
    x: m ** 3 * p0.x + 3 * m * m * t * p1.x + 3 * m * t * t * p2.x + t ** 3 * p3.x,
    y: m ** 3 * p0.y + 3 * m * m * t * p1.y + 3 * m * t * t * p2.y + t ** 3 * p3.y,
  };
};

const cubicTangent = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
) => {
  const m = 1 - t;
  return {
    x: 3 * m * m * (p1.x - p0.x) + 6 * m * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * m * m * (p1.y - p0.y) + 6 * m * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
};

export class DesignBoardView extends BoardView {
  private designConfig!: RulesConfig;
  private readonly designUid = `dv${++designBoardCount}`;
  private designVeins: DesignVein[] = [];
  private shownDesignVeins = new Set<string>();

  constructor(
    svg: SVGSVGElement,
    handlers: BoardHandlers,
  ) {
    super(svg, handlers);
    svg.classList.add('design-v2-board');
  }

  override setup(
    config: RulesConfig,
    terrain: Record<string, Terrain>,
    style: ThemeStyle,
    look: MaterialLook,
    paletteId: ThemeId = 'soil',
  ) {
    this.designConfig = config;
    super.setup(config, terrain, style, look, paletteId);
    this.svg.classList.add('design-v2-board');
    this.decorateTerrain(terrain);
    this.decorateHomes();
  }

  override render(board: Record<string, Tile | null>, overlay: Overlay) {
    super.render(board, overlay);
    this.decorateTiles(board);
    this.redrawDesignVeins(board, overlay);
    this.decorateScars(board, overlay);
  }

  override veinsTouching(keys: Set<string>) {
    return this.designVeins.filter((v) => keys.has(v.a) || keys.has(v.b)).map((v) => v.el);
  }

  private defs() {
    return this.svg.querySelector('defs') as SVGDefsElement;
  }

  private clearClipGroup(name: string) {
    const defs = this.defs();
    let g = defs.querySelector<SVGGElement>(`#${name}`);
    if (!g) g = el('g', { id: name }, defs);
    g.replaceChildren();
    return g;
  }

  private makeClip(parent: SVGGElement, id: string, key: string, size = S * 0.995) {
    const clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.id = id;
    clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', this.hexPath(key, size));
    clip.appendChild(path);
    parent.appendChild(clip);
  }

  private imageBox(key: string) {
    const { x, y } = centerOf(key);
    if (getOrient() === 'pointy') {
      return { x: x - (SQ3 * S) / 2, y: y - S, width: SQ3 * S, height: 2 * S };
    }
    // Keep the pointy-authored artwork upright. Overscale by 2/sqrt(3) so it covers
    // every flat-top corner, then the runtime hex clip performs the actual crop.
    const scale = 2 / SQ3;
    const w = SQ3 * S * scale;
    const h = 2 * S * scale;
    return { x: x - w / 2, y: y - h / 2, width: w, height: h };
  }

  private addClippedImage(
    parent: SVGGElement,
    clipParent: SVGGElement,
    key: string,
    href: string,
    cls: string,
    before: Element | null = null,
    opacity = 1,
  ) {
    const clipId = `${this.designUid}-${cls.replace(/[^a-z0-9_-]/gi, '-')}-${key.replace(/[^a-z0-9_-]/gi, '-')}`;
    this.makeClip(clipParent, clipId, key);
    const box = this.imageBox(key);
    const img = el(
      'image',
      {
        href,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        preserveAspectRatio: 'xMidYMid slice',
        class: cls,
        opacity,
        'clip-path': `url(#${clipId})`,
        'pointer-events': 'none',
      },
      parent,
    );
    if (before) parent.insertBefore(img, before);
    return img;
  }

  private decorateTerrain(terrain: Record<string, Terrain>) {
    const clips = this.clearClipGroup(`${this.designUid}-terrain-clips`);
    for (const g of this.svg.querySelectorAll<SVGGElement>('.hex-cell.rock[data-key]')) {
      const key = g.dataset.key;
      if (!key || terrain[key] !== 'rock') continue;
      const variant = 1 + (stableHash(`rock:${key}`) % 6);
      this.addClippedImage(
        g,
        clips,
        key,
        `${ASSET}/neutral/bases/neutral_base_${String(variant).padStart(2, '0')}.png`,
        'design-v2-terrain-art',
      );
      el('path', { d: this.hexPath(key, S - 1.2), class: 'design-v2-cell-edge', 'pointer-events': 'none' }, g);
    }
  }

  private decorateTiles(board: Record<string, Tile | null>) {
    const clips = this.clearClipGroup(`${this.designUid}-tile-clips`);
    const cssWidth = this.tileCssWidth();

    for (const [key, tile] of Object.entries(board)) {
      if (!tile) continue;
      const g = this.svg.querySelector<SVGGElement>(`.l-tiles .tile[data-key="${CSS.escape(key)}"]`);
      if (!g) continue;
      const owner = tile.owner === 0 ? 'forest' : 'volcano';
      const href = tile.root
        ? `${ASSET}/${owner}/bases/${owner}_base_01.png`
        : `${ASSET}/${owner}/strength/${owner}_strength_${pad2(tile.strength)}.png`;
      const anchor = g.querySelector('.tile-edge, .num-plate, .tile-num');
      this.addClippedImage(g, clips, key, href, `design-v2-tile-art ${owner}`, anchor);

      // One restrained deterministic accent only on large, high-rank tiles. The strength
      // master remains the primary artwork, so repeated tiles gain variety without noise.
      if (!tile.root && tile.strength >= 7 && cssWidth >= 88) {
        // only the details that are whole, single objects in the V2 pack (the others are
        // cut-off fragments of a sprite sheet)
        const usable = DETAILS[owner];
        const which = usable[stableHash(`detail:${owner}:${key}`) % usable.length]!;
        const detail = el(
          'image',
          {
            href: `${ASSET}/${owner}/details/${owner}_detail_${String(which).padStart(2, '0')}.png`,
            class: `design-v2-detail ${owner}`,
            'pointer-events': 'none',
          },
          g,
        );
        const h = stableHash(`detail-pos:${key}`);
        const angle = ((h % 360) * Math.PI) / 180;
        const { x, y } = centerOf(key);
        const r = S * 0.6;
        const size = S * 0.42;
        detail.setAttribute('x', String(x + Math.cos(angle) * r - size / 2));
        detail.setAttribute('y', String(y + Math.sin(angle) * r - size / 2));
        detail.setAttribute('width', String(size));
        detail.setAttribute('height', String(size));
        detail.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        detail.setAttribute('clip-path', this.addDetailClip(clips, key));
        if (anchor) g.insertBefore(detail, anchor);
      }
    }
  }

  private addDetailClip(clips: SVGGElement, key: string) {
    const id = `${this.designUid}-detail-${key.replace(/[^a-z0-9_-]/gi, '-')}`;
    this.makeClip(clips, id, key);
    return `url(#${id})`;
  }

  private tileCssWidth() {
    const rect = this.svg.getBoundingClientRect();
    const vb = this.svg.viewBox.baseVal;
    if (!vb.width || !vb.height) return 0;
    const scale = Math.min(rect.width / vb.width, rect.height / vb.height);
    return (getOrient() === 'pointy' ? SQ3 * S : 2 * S) * scale;
  }

  private decorateHomes() {
    this.svg.querySelectorAll<SVGGElement>('.l-homes .landmark').forEach((g) => {
      const kind = g.classList.contains('lm-tree') ? 'forest' : 'volcano';
      const sprite = g.querySelector<SVGGElement>('.lm-sprite');
      if (sprite) sprite.classList.add('design-v2-hidden-landmark');
      const body = g.querySelector<SVGGElement>('.lm-body');
      if (!body || body.querySelector('.design-v2-home-art')) return;
      const img = el(
        'image',
        {
          href: `${ASSET}/${kind}/home/${kind}_home_01.png`,
          x: -20.5,
          y: -21.5,
          width: 41,
          height: 41,
          preserveAspectRatio: 'xMidYMid meet',
          class: `design-v2-home-art ${kind}`,
          'pointer-events': 'none',
        },
        body,
      );
      body.insertBefore(img, body.firstChild);
    });
  }

  private decorateScars(board: Record<string, Tile | null>, overlay: Overlay) {
    const groups = [...this.svg.querySelectorAll<SVGGElement>('.l-scars .scar-g')];
    const visible = overlay.scars.filter((s) => !board[s.key]);
    const clips = this.clearClipGroup(`${this.designUid}-scar-clips`);

    groups.forEach((g, i) => {
      const scar = visible[i];
      if (!scar) return;
      const owner = scar.owner === 0 ? 'forest' : 'volcano';
      const age = Math.min(2, scar.age ?? 0);
      this.addClippedImage(
        g,
        clips,
        scar.key,
        `${ASSET}/${owner}/states/${owner}_cutoff.png`,
        `design-v2-cutoff ${owner}`,
        null,
        0.82 - age * 0.17,
      );
      const { x, y } = centerOf(scar.key);
      const size = S * 1.28;
      el(
        'image',
        {
          href: `${ASSET}/shared/scars/${owner}_sever_scar.png`,
          x: x - size / 2,
          y: y - size / 2,
          width: size,
          height: size,
          preserveAspectRatio: 'xMidYMid meet',
          class: `design-v2-scar ${owner}`,
          opacity: 0.84 - age * 0.2,
          'pointer-events': 'none',
        },
        g,
      );
    });
  }

  private continuousPath(a: string, b: string) {
    const A = centerOf(a);
    const B = centerOf(b);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const start = { x: A.x + ux * START, y: A.y + uy * START };
    const end = { x: B.x - ux * START, y: B.y - uy * START };
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };

    const pair = [a, b].sort().join('|');
    const h = stableHash(pair);
    const bow = (2.5 + ((h >>> 3) % 36) / 10) * ((h & 1) ? 1 : -1);
    const c1 = { x: start.x + ux * 4.8 + px * bow, y: start.y + uy * 4.8 + py * bow };
    const c2 = { x: mid.x - ux * MID_TANGENT, y: mid.y - uy * MID_TANGENT };
    const c3 = { x: mid.x + ux * MID_TANGENT, y: mid.y + uy * MID_TANGENT };
    const c4 = { x: end.x - ux * 4.8 - px * bow, y: end.y - uy * 4.8 - py * bow };
    const d = `M${start.x.toFixed(2)},${start.y.toFixed(2)}C${c1.x.toFixed(2)},${c1.y.toFixed(2)} ${c2.x.toFixed(2)},${c2.y.toFixed(2)} ${mid.x.toFixed(2)},${mid.y.toFixed(2)}C${c3.x.toFixed(2)},${c3.y.toFixed(2)} ${c4.x.toFixed(2)},${c4.y.toFixed(2)} ${end.x.toFixed(2)},${end.y.toFixed(2)}`;
    return { d, start, c1, c2, mid, c3, c4, end };
  }

  private addLinkLayer(
    g: SVGGElement,
    d: string,
    cls: string,
    width: number,
    opacity: number,
    grow: boolean,
  ) {
    return el(
      'path',
      {
        d,
        pathLength: 1,
        class: `design-link ${cls}${grow ? ' grow-in' : ''}`,
        'stroke-width': width.toFixed(2),
        'stroke-opacity': opacity.toFixed(2),
      },
      g,
    );
  }

  private drawForestLeaves(
    g: SVGGElement,
    geom: ReturnType<DesignBoardView['continuousPath']>,
    a: string,
    b: string,
  ) {
    const halves = [
      [geom.start, geom.c1, geom.c2, geom.mid, 0.58],
      [geom.mid, geom.c3, geom.c4, geom.end, 0.42],
    ] as const;
    halves.forEach(([p0, p1, p2, p3, t], i) => {
      const p = cubicPoint(p0, p1, p2, p3, t);
      const v = cubicTangent(p0, p1, p2, p3, t);
      const angle = (Math.atan2(v.y, v.x) * 180) / Math.PI + (i ? -52 : 52);
      const leaf = el(
        'ellipse',
        {
          cx: p.x,
          cy: p.y,
          rx: 3.2,
          ry: 1.65,
          transform: `rotate(${angle.toFixed(1)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`,
          class: 'design-v2-link-leaf',
          'pointer-events': 'none',
        },
        g,
      );
      this.designVeins.push({ a, b, owner: 0, el: leaf });
    });
  }

  private redrawDesignVeins(board: Record<string, Tile | null>, overlay: Overlay) {
    const layer = this.svg.querySelector<SVGGElement>('.l-veins');
    if (!layer) return;
    layer.replaceChildren();
    this.designVeins = [];
    const now = new Set<string>();
    const hadPrevious = this.shownDesignVeins.size > 0;

    for (const owner of [0, 1] as const) {
      const group = el('g', { class: `design-v2-veins ${owner === 0 ? 'forest' : 'volcano'}` }, layer);
      for (const edge of networkEdges(board, this.designConfig, owner)) {
        const fragile = edge.fragile && (owner === 0 || overlay.botFragile);
        const id = `${owner}:${[edge.a, edge.b].sort().join('|')}`;
        now.add(id);
        const grow = hadPrevious && !this.shownDesignVeins.has(id);
        const visual = veinLook(edge.load, fragile);
        const w = 2.4 * visual.width * (owner === 0 ? 1.1 : 0.95);
        const geom = this.continuousPath(edge.a, edge.b);

        if (owner === 0) {
          this.addLinkLayer(group, geom.d, `forest-shadow${fragile ? ' fragile' : ''}`, w + 2.2, visual.opacity * 0.9, grow);
          this.addLinkLayer(group, geom.d, `forest-bark${fragile ? ' fragile' : ''}`, w + 1.05, visual.opacity, grow);
          const main = this.addLinkLayer(group, geom.d, `forest-living${fragile ? ' fragile' : ''}`, Math.max(0.9, w * 0.62), visual.opacity, grow);
          this.addLinkLayer(group, geom.d, 'forest-highlight', Math.max(0.45, w * 0.16), visual.opacity * 0.72, grow);
          this.designVeins.push({ a: edge.a, b: edge.b, owner, el: main });
          this.drawForestLeaves(group, geom, edge.a, edge.b);
        } else {
          this.addLinkLayer(group, geom.d, `lava-glow${fragile ? ' fragile' : ''}`, w + 3.6, visual.opacity * 0.18, grow);
          this.addLinkLayer(group, geom.d, `lava-crust${fragile ? ' fragile' : ''}`, w + 2.25, visual.opacity, grow);
          this.addLinkLayer(group, geom.d, `lava-seam${fragile ? ' fragile' : ''}`, w + 1.05, visual.opacity, grow);
          const main = this.addLinkLayer(group, geom.d, `lava-molten${fragile ? ' fragile' : ''}`, Math.max(0.8, w * 0.74), visual.opacity, grow);
          this.addLinkLayer(group, geom.d, 'lava-core', Math.max(0.42, w * 0.2), visual.opacity * 0.95, grow);
          this.designVeins.push({ a: edge.a, b: edge.b, owner, el: main });
        }
      }

      // Loose links still use the same continuous pair geometry, just visually quieter.
      for (const edge of looseEdges(board, this.designConfig, owner)) {
        const geom = this.continuousPath(edge.a, edge.b);
        const w = 2.4 * 0.55 * (owner === 0 ? 1.1 : 0.95);
        const main = this.addLinkLayer(
          group,
          geom.d,
          owner === 0 ? 'forest-living loose' : 'lava-molten loose',
          w,
          0.55,
          false,
        );
        this.designVeins.push({ a: edge.a, b: edge.b, owner, el: main });
      }
    }
    this.shownDesignVeins = now;
  }
}
