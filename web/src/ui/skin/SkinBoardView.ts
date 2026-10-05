// A board drawn in a skin's art (test copy only: the Lab's V3 mode). It IS the game's BoardView
// (taps, painting, overlays, badges, animations, homes' states all inherited) with its drawing
// steps replaced: the ground is one continuous world-space picture (ui/skin/ground.ts), the
// network one continuous code path per linked pair skinned by the skin's look (network.ts),
// props deterministic sprites with LOD (props.ts), homes the skin's upright sprites. Numbers,
// plates, edges, badges and every interaction overlay stay vector and sharp.
//
// Art tiers: only one of lo/hi is loaded at a time, picked from the tile's effective size
// (tier.ts). Anything the skin's files don't have yet falls back (greybox colours from the
// skin, the board's own home drawings, no props), so final art drops in without code changes.
import { connectedKeys } from '../../../../src/engine/index.js';
import type { Player, Terrain, Tile } from '../../../../src/engine/index.js';
import { looseEdges, networkEdges } from '../../logic/network.js';
import { getOrient } from '../../logic/orient.js';
import { vigour } from '../../logic/vigour.js';
import { BoardView, S, centerOf, el } from '../board.js';
import type { BoardHandlers, Overlay } from '../board.js';
import { hash, hexPath } from '../geom.js';
import { SkinAssets } from './assets.js';
import { GroundPainter } from './ground.js';
import type { Box, GroundCell, Tint } from './ground.js';
import { drawLink, linkPath, widthFor } from './network.js';
import { placeProps, propBudget } from './props.js';
import { pickTier } from './tier.js';
import type { HomeLayer, NetworkLook, PropDef, SkinDef, Tier } from './types.js';
import { SKIN_CSS } from './skin-css.js';

/** Most ground-canvas pixels: phones (coarse pointer) and the rest. */
const MAX_PX = { coarse: 3_000_000, fine: 6_500_000 };

let cssIn = false;

export class SkinBoardView extends BoardView {
  readonly assets: SkinAssets;
  private painter: GroundPainter;
  private terrain: Record<string, Terrain> = {};
  private box: Box | null = null;
  private groundImg: SVGImageElement | null = null;
  private groundUrl: string | null = null;
  private netDefs: SVGGElement | null = null;
  private paintedSig = '';
  private paintedPpu = 0;
  private paintSeq = 0;
  private wantedTier: Tier | null = null;
  private net: [NetworkLook, NetworkLook];
  private tints: Record<string, Tint | null> = {};
  /** prop sprites by material, from what this tier has */
  private propDefs: Record<string, PropDef[]> = {};
  /** props for cut-off tiles and severed hexes, by material */
  private cutoffDefs: Record<string, PropDef[]> = {};
  /** ambient motes on screen (kept across renders so their motion never restarts) */
  private motes = new Map<string, SVGElement>();
  /** tiles joined to their home in the board being drawn */
  private joinedNow = new Set<string>();
  private strips: ({ url: string; w: number; h: number } | null)[] = [null, null];
  private recheck: ReturnType<typeof setTimeout> | undefined;
  private readonly coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  constructor(
    svg: SVGSVGElement,
    handlers: BoardHandlers,
    readonly skin: SkinDef,
  ) {
    super(svg, handlers);
    this.assets = new SkinAssets(skin);
    this.painter = new GroundPainter(skin, this.assets);
    this.net = [{ ...skin.network[0] }, { ...skin.network[1] }];
    svg.classList.add('skin-board');
    svg.dataset.skin = skin.id;
    if (!cssIn) {
      cssIn = true;
      const st = document.createElement('style');
      st.textContent = SKIN_CSS;
      document.head.appendChild(st);
    }
    // the camera moves the viewBox (zoom), the window resizes: check the tier and the ground's resolution
    const later = () => {
      clearTimeout(this.recheck);
      this.recheck = setTimeout(() => this.checkView(), 220);
    };
    new MutationObserver(later).observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
    addEventListener('resize', later);
  }

  // ---------- setup ----------

  protected override usesWorldLayer() {
    return false;
  }

  protected override afterSetup(terrain: Record<string, Terrain>) {
    this.terrain = terrain;
    const vb = this.svg.viewBox.baseVal;
    this.box = { x0: vb.x, y0: vb.y, w: vb.width, h: vb.height };
    const defs = this.svg.querySelector('defs')!;
    // the ground picture, shown through one pattern in board units (like the world layer)
    const pat = el('pattern', { id: this.id('skin-ground'), patternUnits: 'userSpaceOnUse', x: vb.x, y: vb.y, width: vb.width, height: vb.height }, defs);
    this.groundImg = el('image', { x: 0, y: 0, width: vb.width, height: vb.height, preserveAspectRatio: 'none' }, pat);
    if (this.groundUrl) this.groundImg.setAttribute('href', this.groundUrl);
    this.netDefs = el('g', {}, defs);
    // the number plates: a soft disc behind the digit, in each player's colours
    this.skin.numbers.forEach((n, p) => {
      const gr = el('radialGradient', { id: this.id(`skin-plate-${p}`), cx: 0.5, cy: 0.5, r: 0.5 }, defs);
      el('stop', { offset: 0, 'stop-color': n.plate, 'stop-opacity': 1 }, gr);
      el('stop', { offset: 0.62, 'stop-color': n.plate, 'stop-opacity': 0.92 }, gr);
      el('stop', { offset: 1, 'stop-color': n.plate, 'stop-opacity': 0 }, gr);
    });
    this.paintedSig = '';
    this.paintedPpu = 0;
    this.motes = new Map();
    this.checkView();
    this.decorate();
  }

  protected override drawCell(g: SVGGElement, key: string, t: Terrain) {
    const d = hexPath(key, S - 1.2, this.style.tileShape);
    const mat = this.skin.materials[this.skin.cells[t === 'rich' ? 'rich' : t === 'rock' ? 'rock' : 'normal']];
    el('path', { d, class: 'skin-proxy', fill: mat?.proxy.base ?? '#262a28' }, g);
    el('path', { d, class: `skin-cell ${t}`, fill: this.url('skin-ground') }, g);
    if (t === 'rock') el('g', { class: 'skin-rock', 'data-key': key }, g);
  }

  protected override drawHome(p: Player, key: string): SVGGElement {
    const g = super.drawHome(p, key);
    g.classList.add('skin-home');
    return g;
  }

  // ---------- art tiers ----------

  /** The rendered size of one hex (60 board units across its corners), CSS px, at the current zoom. */
  tilePx() {
    const r = this.svg.getBoundingClientRect();
    const vb = this.svg.viewBox.baseVal;
    if (!vb.width || !vb.height || !r.width || !r.height) return 0;
    return 2 * S * Math.min(r.width / vb.width, r.height / vb.height);
  }

  private dpr() {
    return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  }

  /** Picks the tier (with hysteresis) and repaints the ground when its resolution is off. */
  private checkView() {
    // not on screen yet (the menu is up): decide when the board shows, never on a guess
    if (!this.tilePx()) return;
    const eff = this.tilePx() * this.dpr();
    const next = pickTier(this.wantedTier, eff, this.coarse, this.skin.policy);
    if (next !== this.wantedTier) {
      this.wantedTier = next;
      this.svg.dataset.tier = next;
      void this.assets.setTier(next).then(() => {
        if (this.assets.tier !== next) return;
        this.paintedSig = '';
        this.decorate();
      });
      return;
    }
    if (this.lastRender && this.paintedPpu && Math.abs(this.targetPpu() / this.paintedPpu - 1) > 0.3) {
      this.paintedSig = '';
      this.syncGround(...this.lastRender);
    }
  }

  /** Ground canvas pixels per board unit: the screen's, never past the tier's texture detail or the pixel budget. */
  private targetPpu() {
    const t = this.skin.tiers[this.assets.tier ?? 'lo'];
    const screen = ((this.tilePx() || 60) / (2 * S)) * this.dpr();
    const art = t.texPx / this.skin.worldUnits;
    const box = this.box!;
    const budget = Math.sqrt((this.coarse ? MAX_PX.coarse : MAX_PX.fine) / (box.w * box.h));
    return Math.max(0.5, Math.min(screen, art * 1.15, budget));
  }

  /** Loads what this tier has (network look, tints, strips) and redraws homes, rocks and the board. */
  private async decorate() {
    const a = this.assets;
    if (!a.tier) return;
    const tier = a.tier;
    const style = await a.json<Record<string, Partial<NetworkLook>>>(this.skin.networkStyle);
    if (a.tier !== tier) return;
    const merge = (n: SkinDef['network'][number]): NetworkLook => ({ ...n, ...(style?.[n.key] ?? {}), widths: { ...n.widths, ...(style?.[n.key]?.widths ?? {}) } });
    this.net = [merge(this.skin.network[0]), merge(this.skin.network[1])];
    this.propDefs = {};
    this.cutoffDefs = {};
    for (const [id, m] of Object.entries(this.skin.materials)) if (m.cutoffProps) this.cutoffDefs[id] = a.list(m.cutoffProps.dir).map((src) => ({ src, size: m.cutoffProps!.size }));
    for (const [id, set] of Object.entries(this.skin.props)) {
      this.propDefs[id] = a.list(set.dir).map((src): PropDef => {
        const r = set.rules?.find((x) => src.includes(x.match));
        const anim = r?.anim === null ? undefined : (r?.anim ?? set.anim);
        return { src, size: r?.size ?? set.size, ...(r?.minStrength ? { minStrength: r.minStrength } : {}), ...(anim ? { anim } : {}) };
      });
    }
    this.strips = await Promise.all(
      this.net.map(async (n) => {
        const img = n.strip ? await a.image(n.strip) : null;
        return img && n.strip ? { url: a.url(n.strip), w: img.width, h: img.height } : null;
      }),
    );
    for (const id of Object.keys(this.skin.materials)) {
      const c = this.skin.materials[id]!.cutoff;
      this.tints[id] = c ? await a.json<Tint>(c) : null;
    }
    if (a.tier !== tier) return;
    this.homeEls.forEach((g, p) => this.dressHome(g, this.skin.homes[p] ?? []));
    this.dressRocks();
    if (this.lastRender) this.render(...this.lastRender);
  }

  /** The home's sprite layers (when every one of them is in this tier), else the board's own drawing. */
  private dressHome(g: SVGGElement, all: HomeLayer[]) {
    g.querySelector('.skin-home-art')?.remove();
    // several looks (variant 0, 1, ...): one per home tile, only among looks this tier has in full
    const looks = [...new Set(all.map((l) => l.variant ?? -1).filter((v) => v >= 0))].filter((v) => all.filter((l) => l.variant === v).every((l) => this.assets.has(l.src)));
    const pick = looks.length ? looks[Math.floor(hash(`${g.dataset.key ?? ''}:home`) * looks.length)] : undefined;
    const layers = all.filter((l) => l.variant === undefined || l.variant === pick);
    const ok = layers.length > 0 && layers.every((l) => this.assets.has(l.src));
    g.classList.toggle('skin-has-art', ok);
    if (!ok) return;
    const body = g.querySelector('.lm-body') ?? g;
    const art = el('g', { class: 'skin-home-art' });
    body.insertBefore(art, body.firstChild);
    for (const l of layers) {
      el('image', { href: this.assets.url(l.src), x: (l.dx ?? 0) - l.size / 2, y: (l.dy ?? 0) - l.size / 2, width: l.size, height: l.size, class: `skin-home-layer${l.anim ? ` skin-${l.anim}` : ''}${l.delay ? ' skin-later' : ''}`, opacity: l.opacity ?? 1, preserveAspectRatio: 'xMidYMid meet', ...(l.delay ? { style: `animation-delay:${-l.delay}s` } : {}) }, art);
    }
  }

  /** Blocked hexes: one calm boulder cluster each (when the skin has them). */
  private dressRocks() {
    const defs = this.propDefs[this.skin.cells.rock] ?? [];
    for (const g of this.svg.querySelectorAll<SVGGElement>('.skin-rock')) {
      g.replaceChildren();
      const key = g.dataset.key!;
      if (!defs.length) continue;
      const def = defs[Math.floor(hash(`${key}:rock`) * defs.length)]!;
      const { x, y } = centerOf(key);
      el('image', { href: this.assets.url(def.src), x: x - def.size / 2, y: y - def.size / 2, width: def.size, height: def.size, class: 'skin-prop', preserveAspectRatio: 'xMidYMid meet' }, g);
    }
  }

  // ---------- each render ----------

  override render(board: Record<string, Tile | null>, o: Overlay) {
    this.netDefs?.replaceChildren();
    if (!this.wantedTier) this.checkView();
    this.joinedNow = this.joined(board);
    super.render(board, o);
    this.syncGround(board, o);
  }

  private strength9(t: Tile) {
    return t.root ? 9 : 1 + Math.round(vigour(t.strength, this.config.maxRank) * 8);
  }

  private joined(board: Record<string, Tile | null>) {
    const j = new Set<string>();
    for (const p of [0, 1] as const) {
      try {
        for (const k of connectedKeys(board, this.config, p)) j.add(k);
      } catch {
        /* no home on this board */
      }
    }
    return j;
  }

  /** What the ground shows for every hex; repaints only when that (or the resolution) changes. */
  private syncGround(board: Record<string, Tile | null>, o: Overlay) {
    if (!this.box || !this.assets.tier) return;
    const skin = this.skin;
    const joined = this.joined(board);
    const scars = new Map(o.scars.filter((s) => !board[s.key]).map((s) => [s.key, s]));
    const cells: GroundCell[] = [];
    for (const key of this.keys) {
      const { x, y } = centerOf(key);
      const terr = this.terrain[key] ?? 'normal';
      const cellMat = skin.cells[terr === 'rich' ? 'rich' : terr === 'rock' ? 'rock' : 'normal'];
      const t = board[key];
      const base = { key, x, y, rich: terr === 'rich', mirror: hash(`${key}:m`) > 0.5 };
      if (t) {
        const mat = skin.owners[t.owner];
        cells.push({ ...base, material: mat, coverage: this.strength9(t), tint: joined.has(key) ? null : (this.tints[mat] ?? null) });
      } else if (scars.has(key)) {
        const s = scars.get(key)!;
        const mat = skin.owners[s.owner];
        const age = Math.min(2, s.age ?? 0);
        cells.push({ ...base, under: cellMat, material: mat, coverage: 0, alpha: [0.8, 0.5, 0.25][age]!, tint: this.tints[mat] ?? { desaturate: 0.5, darken: 0.25 } });
      } else cells.push({ ...base, material: cellMat, coverage: 0 });
    }
    const ppu = this.targetPpu();
    const sig = `${this.assets.tier}|${getOrient()}|${ppu.toFixed(2)}|${cells.map((c) => `${c.material}${c.coverage}${c.tint ? 't' : ''}${c.alpha ?? ''}`).join(',')}`;
    if (sig === this.paintedSig) return;
    this.paintedSig = sig;
    const seq = ++this.paintSeq;
    const tier = this.assets.tier;
    void this.painter.paint(this.box, ppu, cells, getOrient()).then((canvas) => {
      if (!canvas || seq !== this.paintSeq || tier !== this.assets.tier) return;
      this.paintedPpu = ppu;
      const land = (url: string) => {
        if (seq !== this.paintSeq) return URL.revokeObjectURL(url);
        const old = this.groundUrl;
        this.groundUrl = url;
        this.groundImg?.setAttribute('href', url);
        this.svg.classList.add('skin-ground-ready');
        if (old?.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(old), 1200);
      };
      try {
        canvas.toBlob((b) => (b ? land(URL.createObjectURL(b)) : land(canvas.toDataURL('image/png'))));
      } catch {
        /* no picture: the greybox colours under it still show */
      }
      // the canvas has been handed over: free its pixels
      canvas.width = canvas.height = 0;
    });
  }

  // ---------- the drawing steps ----------

  /** No top-rank glow (the ground and network carry rank); instead a little ambient life. */
  protected override drawGlows(board: Record<string, Tile | null>) {
    const layer = this.layers.glow;
    const amb = this.skin.ambient;
    const want = new Map<string, { key: string; m: NonNullable<SkinDef['ambient']>['motes'][number] }>();
    if (amb && this.look.motion && (this.tilePx() || 0) >= 48) {
      for (const m of amb.motes) {
        if (!this.assets.has(m.src)) continue;
        const keys = this.keys.filter((k) => {
          const t = board[k];
          return t && !t.root && this.skin.owners[t.owner] === m.material && this.strength9(t) >= m.minStrength && this.joinedNow.has(k);
        });
        // the same tiles every time (by key), at most `max` per kind
        keys.sort((a, b) => hash(`${a}:mote`) - hash(`${b}:mote`));
        for (const k of keys.slice(0, amb.max)) want.set(`${k}|${m.src}`, { key: k, m });
      }
    }
    for (const [id, e] of this.motes) if (!want.has(id) || !e.isConnected) (e.remove(), this.motes.delete(id));
    for (const [id, { key, m }] of want) {
      if (this.motes.has(id)) continue;
      const { x, y } = centerOf(key);
      const h = hash(id);
      const dx = (h - 0.5) * 16;
      const dy = m.kind === 'rise' ? 4 : -10;
      const g = el('g', { class: `skin-mote ${m.kind}`, style: `animation-duration:${(m.kind === 'rise' ? 4.6 : 7) + h * 2.5}s;animation-delay:${(-h * 9).toFixed(2)}s` }, layer);
      el('image', { href: this.assets.url(m.src), x: x + dx - m.size / 2, y: y + dy - m.size / 2, width: m.size, height: m.size, preserveAspectRatio: 'xMidYMid meet' }, g);
      this.motes.set(id, g);
    }
  }

  protected override drawScars(board: Record<string, Tile | null>, o: Overlay, scars: SVGGElement) {
    // the ground paints what is left (cut-off tint); a scar decal on top when the skin has one
    for (const s of o.scars) {
      const src = this.skin.scars?.[s.owner];
      if (board[s.key] || !this.assets.has(src)) continue;
      const { x, y } = centerOf(s.key);
      const g = el('g', { class: `scar-g age-${Math.min(2, s.age ?? 0)}` }, scars);
      el('image', { href: this.assets.url(src), x: x - 22, y: y - 22, width: 44, height: 44, class: 'skin-scar', preserveAspectRatio: 'xMidYMid meet' }, g);
      // what was left behind: one wilted plant or ash heap (big enough tiles only)
      const left = this.cutoffDefs[this.skin.owners[s.owner]] ?? [];
      if ((this.tilePx() || 0) >= 40) for (const pr of placeProps(`${s.key}:scar`, left, 1, 9)) this.prop(g, x, y, pr);
    }
  }

  protected override drawVeins(board: Record<string, Tile | null>, o: Overlay, veins: SVGGElement) {
    const now = new Set<string>();
    const fresh = this.shownVeins.size > 0;
    const tilePx = this.tilePx() || 60;
    const motion = this.look.motion;
    for (const p of [0, 1] as const) {
      const g = el('g', { class: `skin-net p${p}` }, veins);
      const link = (a: string, b: string, load: number, fragile: boolean, loose: boolean) => {
        const id = `${p}:${a}|${b}`;
        if (!loose) now.add(id);
        const path = linkPath(centerOf(a), centerOf(b));
        const els = drawLink(g, path, {
          look: this.net[p],
          width: loose ? 'thin' : widthFor(load),
          tilePx,
          strip: this.strips[p] ?? null,
          motion,
          grow: !loose && fresh && !this.shownVeins.has(id),
          loose,
          fragile,
          id: this.id(`l${p}-${a}-${b}`.replace(/[^a-z0-9_-]/gi, '_')),
          defs: this.netDefs as unknown as SVGDefsElement,
        });
        for (const e of els) this.veinEls.push({ a, b, owner: p, el: e });
      };
      for (const e of networkEdges(board, this.config, p)) link(e.a, e.b, e.load, e.fragile && (p === 0 || o.botFragile), false);
      for (const e of looseEdges(board, this.config, p)) link(e.a, e.b, 0, true, true);
    }
    this.shownVeins = now;
  }

  private prop(g: SVGGElement, x: number, y: number, pr: ReturnType<typeof placeProps>[number], key = '') {
    el('image', { href: this.assets.url(pr.def.src), x: x + pr.x - pr.size / 2, y: y + pr.y - pr.size / 2, width: pr.size, height: pr.size, class: `skin-prop${pr.def.anim ? ` skin-${pr.def.anim}` : ''}`, preserveAspectRatio: 'xMidYMid meet', style: `animation-delay:${(-hash(key) * 5).toFixed(2)}s` }, g);
  }

  protected override drawTile(parent: SVGGElement, key: string, t: Tile): SVGGElement {
    const skin = this.skin;
    const g = el('g', { class: `tile ${t.owner === 0 ? 'you' : 'bot'}${t.root ? ' root' : ''} skin-tile`, 'data-key': key }, parent);
    const d = hexPath(key, S * 0.995, this.style.tileShape);
    const mat = skin.materials[skin.owners[t.owner]];
    el('path', { d, class: 'skin-proxy', fill: mat?.proxy.base ?? '#333' }, g);
    el('path', { d, class: 'skin-fill', fill: this.url('skin-ground') }, g);
    el('path', { d, class: 'tile-edge skin-edge' }, g);
    if (t.root) return g;
    const { x, y } = centerOf(key);
    const s9 = this.strength9(t);
    // a tile cut off from its home shows wilted / ashen props instead of its living ones
    const cut = !this.joinedNow.has(key);
    const defs = (cut ? this.cutoffDefs : this.propDefs)[skin.owners[t.owner]] ?? [];
    const budget = cut ? Math.min(1, propBudget(this.tilePx(), 9)) : propBudget(this.tilePx(), s9);
    for (const pr of placeProps(key, defs, budget, cut ? 9 : s9)) this.prop(g, x, y, pr, key);
    // the channel's ownership shape (a circle or diamond) where it keeps them, for colour-blind players
    this.mark(g, x, y + S * 0.56, t.owner === 0 ? this.style.youMark : this.style.botMark);
    const n = skin.numbers[t.owner];
    el('circle', { cx: x, cy: y - S * 0.06, r: S * 0.34, class: 'num-plate', fill: this.url(`skin-plate-${t.owner}`), style: `opacity:${n.plateAlpha}` }, g);
    el('text', { x, y: y - S * 0.06, class: 'num tile-num world skin-num', style: `fill:${n.ink}` }, g).textContent = String(t.strength);
    return g;
  }
}
