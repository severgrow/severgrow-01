// THE SKINNED BOARD IN THE REAL SCREEN. The lab's art (uploads held as blob: URLs) is handed to the
// skin system as a skin root, and the game's own SkinBoardView draws the generator's position inside
// the phone frame: it takes the game board's place (id="board", so the game's own CSS sizes and
// styles it), while the game's board stays hidden underneath.
import type { State, Tile } from '../../../src/engine/index.js';
import { NO_OVERLAY } from '../ui/board.js';
import { S, SQ3, centerOf, el, hash, hexPath } from '../ui/geom.js';
import type { Overlay } from '../ui/board.js';
import { createEffects } from '../ui/effects.js';
import { forgetSkinFiles, provideSkinFiles } from '../ui/skin/assets.js';
import { SkinBoardView } from '../ui/skin/SkinBoardView.js';
import { SKIN_CSS } from '../ui/skin/skin-css.js';
import type { SkinDef, Tier } from '../ui/skin/types.js';
import { homeRotation, setOrient, setRotation, toScreen } from '../logic/orient.js';
import { materialLook } from '../logic/materials.js';
import { THEMES } from '../logic/themes.js';
import type { PhoneFrame } from './frame.js';
import { filePath, skinOf, tierFiles } from './pack.js';
import type { LabState, SystemFiles } from './pack.js';
import { TIERS, slotById } from './slots.js';

const typeOf = (path: string) => (path.endsWith('.json') ? 'application/json' : path.endsWith('.png') ? 'image/png' : path.endsWith('.svg') ? 'image/svg+xml' : 'image/webp');

let seq = 0;

/** The pack's tier folders as an in-memory skin root (blob: URLs); `release` frees them. */
export const memorySkin = (state: LabState, system: SystemFiles) => {
  const root = `art-lab-${++seq}`;
  const files = tierFiles(state, system);
  const urls = {} as Record<Tier, Map<string, string>>;
  const byPath = new Map<string, Set<string>>();
  for (const t of TIERS) {
    urls[t] = new Map();
    for (const [p, d] of files[t]) {
      const u = URL.createObjectURL(new Blob([d as Uint8Array<ArrayBuffer>], { type: typeOf(p) }));
      urls[t].set(p, u);
      (byPath.get(p) ?? byPath.set(p, new Set()).get(p)!).add(u);
    }
  }
  provideSkinFiles(root, urls);
  const skin: SkinDef = skinOf(state, root);
  return {
    skin,
    /** blob: URLs of a pack path (both tiers), so the lab can point at where a slot appears */
    urlsOf: (path: string) => [...(byPath.get(path) ?? [])],
    urlAt: (path: string, tier: Tier) => urls[tier].get(path),
    release: () => {
      forgetSkinFiles(root);
      for (const t of TIERS) for (const u of urls[t].values()) URL.revokeObjectURL(u);
    },
  };
};

export type Scar = Overlay['scars'][number];

/** The tiles lost between two positions (what a Bomb, Blast or cut leaves on the ground). */
export const lostTiles = (before: Record<string, Tile | null>, after: Record<string, Tile | null>) =>
  Object.keys(before).filter((k) => before[k] && !after[k] && !before[k]!.root);

export class BoardOverlay {
  view: SkinBoardView | null = null;
  private svg: SVGSVGElement | null = null;
  private memory: ReturnType<typeof memorySkin> | null = null;
  private key = '';
  private watch: MutationObserver | null = null;
  private artWatch: MutationObserver | null = null;
  private bleedLayer: SVGGElement | null = null;
  private bleedDefs: SVGDefsElement | null = null;
  private bleed = false;
  private boardNow: State['board'] = {};
  private goldPaths: string[] = [];
  private maskId = 0;

  constructor(private frame: PhoneFrame) {}

  /** Draws `state` with this art in the frame; rebuilds the board only when the art or the board shape changed. */
  draw(art: LabState, system: SystemFiles, artRev: number, state: State, scars: Scar[], reduceMotion: boolean, fresh: string[] = []) {
    const d = this.frame.doc;
    const game = d?.getElementById('board-game') ?? d?.getElementById('board');
    if (!d || !game) return;
    if (game.id === 'board') {
      game.id = 'board-game';
      game.setAttribute('aria-hidden', 'true');
    }
    if (!d.getElementById('art-lab-skin-css')) {
      const st = d.createElement('style');
      st.id = 'art-lab-skin-css';
      st.textContent = `${SKIN_CSS}\n#board-game{position:absolute !important;inset:0;opacity:0 !important;pointer-events:none}`;
      d.head.append(st);
    }
    // Ordinary imported painted tiles can have transparent grass tips beyond their hex.
    // Never add this extra painting pass for today's built-in art or for the live game.
    const bleed = ['p1-tiles', 'p2-tiles'].some((id) => art.slots[id]?.files.some((f) => f.source === 'designer'));
    const shape = `${artRev}|${state.config.boardRadius}|${this.frame.orient()}|${reduceMotion}|${bleed}`;
    if (shape !== this.key || !this.svg?.isConnected) {
      this.key = shape;
      this.artWatch?.disconnect();
      this.bleedLayer?.remove();
      this.bleedDefs?.remove();
      this.bleed = bleed;
      this.svg?.remove();
      this.memory?.release();
      this.memory = memorySkin(art, system);
      // the lab draws in the frame's orientation, with the player's home at the bottom (as the game does)
      const orient = this.frame.orient();
      setOrient(orient);
      setRotation(homeRotation(orient, state.config, 0));
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'board';
      svg.setAttribute('class', game.getAttribute('class') ?? 'board');
      svg.setAttribute('preserveAspectRatio', game.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'The board, drawn with the art pack');
      game.after(svg);
      this.svg = svg as SVGSVGElement;
      // Keep the *real* 1-9 physical stones and glint instead of the skin-system text plates.
      // Size any designer bleed sprites only in this isolated Art Lab board.
      this.view = new SkinBoardView(this.svg, { tap: () => {}, inspect: () => {} }, this.memory.skin,
        { full: true, nativeStones: true, overhangingTiles: bleed });
      this.view.setup(state.config, state.terrain, THEMES.soil.style, materialLook('soil', 'normal', reduceMotion), 'soil');
      // the game's layout frames its board (room for the hand below): use the same window onto it
      const follow = () => {
        for (const a of ['viewBox', 'preserveAspectRatio']) { const v = game.getAttribute(a); if (v && this.svg?.getAttribute(a) !== v) this.svg?.setAttribute(a, v); }
      };
      this.watch?.disconnect();
      this.watch = new MutationObserver(follow);
      this.watch.observe(game, { attributes: true, attributeFilter: ['viewBox', 'preserveAspectRatio'] });
      if (state.config.boardRadius === 3) follow();
      if (bleed) {
        // Tiles also redraw when their sprites finish decoding, not just after a move.
        // Observe only the actual tile layer: the added visual layer cannot trigger itself.
        const tileLayer = this.svg.querySelector('.l-tiles');
        if (tileLayer) {
          this.artWatch = new MutationObserver(() => this.paintBleed());
          this.artWatch.observe(tileLayer, { childList: true, subtree: true });
        }
      }
    }
    this.boardNow = state.board;
    // Gold is a full-hex tile *treatment*, not an overhanging prop. The visual must
    // touch each real point-up edge while remaining clipped inside that same path.
    this.goldPaths = (art.slots.gold?.files ?? []).flatMap((f, i) =>
      f.source === 'designer' ? [filePath(slotById('gold')!, i, f)] : []);
    this.view!.render(state.board, { ...NO_OVERLAY, scars, fresh });
    this.paintBleed();
    this.paintGold();
  }

  /** Draw ONLY the transparent overhang outside each tile's point-up hit polygon.
   * The existing tile art keeps its seam blending. This visual-only copy is between
   * tiles and the game's real overlays, and cannot receive or steal any pointer event.
   */
  private paintBleed() {
    this.bleedLayer?.remove();
    this.bleedDefs?.remove();
    this.bleedLayer = null;
    this.bleedDefs = null;
    if (!this.bleed || !this.svg) return;
    const svg = this.svg;
    const images = [...svg.querySelectorAll<SVGImageElement>('.l-tiles .skin-tile-art')];
    if (!images.length) return;
    this.bleedDefs = el('defs', { class: 'art-lab-overhang-defs' }, svg);
    const layer = el('g', { class: 'art-lab-overhangs', 'aria-hidden': 'true', 'pointer-events': 'none' }, svg);
    this.bleedLayer = layer;
    svg.insertBefore(layer, svg.querySelector('.l-glow'));
    const occupied = Object.keys(this.boardNow).filter((k) => this.boardNow[k] && !this.boardNow[k]!.root)
      .map((k) => centerOf(k));
    for (const img of images) {
      const key = img.closest('.skin-tile')?.getAttribute('data-key');
      if (!key) continue;
      const here = centerOf(key);
      const id = `art-lab-bleed-${++this.maskId}`;
      const margin = S * 1.6;
      const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', maskContentUnits: 'userSpaceOnUse',
        x: here.x - margin, y: here.y - margin, width: margin * 2, height: margin * 2 }, this.bleedDefs);
      el('rect', { x: here.x - margin, y: here.y - margin, width: margin * 2, height: margin * 2, fill: '#fefefe' }, mask);
      // Keep the source tile's owned hex from painting a second time over its neighbours.
      el('path', { d: hexPath(key, S, 'flat'), fill: '#000' }, mask);
      // Neighbouring numbers remain fully visible (and their original stones still receive glints).
      for (const p of occupied) if (Math.hypot(p.x - here.x, p.y - here.y) < S * 3)
        el('circle', { cx: p.x, cy: p.y, r: S * 0.42, fill: '#000' }, mask);
      const clip = el('g', { mask: `url(#${id})`, 'pointer-events': 'none' }, layer);
      const copy = img.cloneNode(false) as SVGImageElement;
      copy.classList.add('art-lab-overhang-image');
      copy.setAttribute('pointer-events', 'none');
      copy.setAttribute('aria-hidden', 'true');
      clip.append(copy);
    }
  }

  /** A supplied Gold tile fills the exact six-sided gameplay footprint, never its neighbours.
   *
   * Gold artwork belongs on the existing rich overlay layer, not on an enlarged
   * 64-unit prop which would leak across adjacent cells. It must not claim pointer
   * events or change which hex the board considers rich.
   */
  private paintGold() {
    const layer = this.svg?.querySelector<SVGGElement>('.l-rich-frames');
    if (!layer || !this.memory || !this.goldPaths.length) return; // current game frames untouched
    layer.replaceChildren();
    const defs = this.svg!.querySelector<SVGDefsElement>('defs')!;
    const boardTurn = Math.atan2(toScreen(1, 0).y, toScreen(1, 0).x) * 180 / Math.PI;
    for (const key of this.view!.richKeysForLab()) {
      const { x, y } = centerOf(key);
      const which = Math.floor(hash(`${key}:art-lab-gold`) * this.goldPaths.length);
      const path = this.goldPaths[which]!;
      const src = this.memory.urlAt(path, this.view!.assets.tier ?? 'lo');
      if (!src) continue;
      const id = `art-lab-gold-clip-${++this.maskId}`;
      const clip = el('clipPath', { id, clipPathUnits: 'userSpaceOnUse' }, defs);
      el('path', { d: hexPath(key, S, 'flat') }, clip);
      const g = el('g', { class: 'art-lab-gold-frame', 'data-key': key, 'data-variant': which,
        'pointer-events': 'none', 'aria-hidden': 'true', 'clip-path': `url(#${id})` }, layer);
      // A point-up hex is SQ3*S wide by 2*S high. No 10% shared-edge boost,
      // and no spacing inset: the art ends precisely on the gameplay polygon.
      const image = el('image', { href: src, x: x - SQ3 * S / 2, y: y - S,
        width: SQ3 * S, height: S * 2, preserveAspectRatio: 'none',
        'pointer-events': 'none' }, g);
      if (boardTurn) image.setAttribute('transform', `rotate(${boardTurn.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})`);
    }
  }

  /** The game's own board effects, on the skinned board (flash, sparks, cut flash, shake). */
  effects(reduceMotion: boolean) {
    return this.view ? { fx: createEffects(this.view, () => 1, () => (reduceMotion ? 0 : 1)), view: this.view } : null;
  }

  /** Every place a picture of this pack path is drawn right now (to point at a slot on the board). */
  where(path: string): Element[] {
    if (!this.svg || !this.memory) return [];
    const urls = new Set(this.memory.urlsOf(path));
    return [...this.svg.querySelectorAll('image')].filter((i) => urls.has(i.getAttribute('href') ?? ''));
  }

  tier(): string { return this.svg?.dataset.tier ?? ''; }
}
