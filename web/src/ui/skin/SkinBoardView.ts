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
import { allNeighbors, connectedKeys, coordKey, parseKey } from '../../../../src/engine/index.js';
import type { Player, Terrain, Tile } from '../../../../src/engine/index.js';
import { looseEdges, networkEdges } from '../../logic/network.js';
import { getOrient, toScreen } from '../../logic/orient.js';
import { vigour } from '../../logic/vigour.js';
import { BoardView, S, centerOf, el } from '../board.js';
import type { BoardHandlers, Overlay } from '../board.js';
import { cornerPts, hash, hexPath } from '../geom.js';
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
  /** butterflies, a leaf, flames and soot around the territories (rebuilt when they change) */
  private life: SVGGElement | null = null;
  private lifeSig = '';
  /** painted hex tiles by material, then by strength 1-9 */
  private tileArt: Record<string, string[][]> = {};
  /** props for cut-off tiles and severed hexes, by material */
  private cutoffDefs: Record<string, PropDef[]> = {};
  /** ambient motes on screen (kept across renders so their motion never restarts) */
  private motes = new Map<string, SVGElement>();
  /** tiles joined to their home in the board being drawn */
  private joinedNow = new Set<string>();
  private strips: ({ url: string; w: number; h: number } | null)[] = [null, null];
  /** whole painted links for each player (url and aspect) */
  private linkArt: { url: string; aspect: number }[][] = [[], []];
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
    const fg = el('linearGradient', { id: this.id('skin-flame-grad'), x1: 0, y1: 1, x2: 0, y2: 0 }, defs);
    el('stop', { offset: 0, 'stop-color': '#ffd25a' }, fg);
    el('stop', { offset: 0.45, 'stop-color': '#ff7a1a' }, fg);
    el('stop', { offset: 1, 'stop-color': '#c22a0a', 'stop-opacity': 0.2 }, fg);
    this.life = null;
    this.lifeSig = '';
    this.paintedSig = '';
    this.paintedPpu = 0;
    this.motes = new Map();
    this.checkView();
    this.decorate();
  }

  protected override drawCell(g: SVGGElement, key: string, t: Terrain) {
    // the ground is one picture: every hex reaches over the grid gap; a faint seam keeps the grid readable
    const d = hexPath(key, S * 1.035, 'flat');
    const mat = this.skin.materials[this.skin.cells[t === 'rich' ? 'rich' : t === 'rock' ? 'rock' : 'normal']];
    el('path', { d, class: 'skin-proxy', fill: mat?.proxy.base ?? '#262a28' }, g);
    el('path', { d, class: `skin-cell ${t}`, fill: this.url('skin-ground') }, g);
    void key;
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
    this.tileArt = {};
    for (const [id, { dir }] of Object.entries(this.skin.tiles ?? {})) {
      const byS: string[][] = Array.from({ length: 10 }, () => []);
      for (const f of a.list(dir)) {
        const m = /\/s([1-9])_[^/]*$/.exec(f);
        if (m) byS[Number(m[1])]!.push(f);
      }
      if (byS.some((l) => l.length)) this.tileArt[id] = byS;
    }
    for (const [id, set] of Object.entries(this.skin.props)) {
      this.propDefs[id] = a.list(set.dir).map((src): PropDef => {
        const r = set.rules?.find((x) => src.includes(x.match));
        const anim = r?.anim === null ? undefined : (r?.anim ?? set.anim);
        return { src, size: r?.size ?? set.size, ...(r?.minStrength ? { minStrength: r.minStrength } : {}), ...(anim ? { anim } : {}) };
      });
    }
    this.linkArt = await Promise.all(
      this.net.map(async (n) =>
        n.links
          ? (await Promise.all(a.list(n.links).map(async (f) => ({ f, img: await a.image(f) })))).flatMap(({ f, img }) => (img ? [{ url: a.url(f), aspect: img.width / img.height }] : []))
          : [],
      ),
    );
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
      // a hex picture turns with the board (inline, about its own centre)
      const o = toScreen(1, 0);
      const turn = l.turn ? (Math.atan2(o.y, o.x) * 180) / Math.PI : 0;
      const style = `${l.delay ? `animation-delay:${-l.delay}s;` : ''}${turn ? `transform-box:fill-box;transform-origin:center;transform:rotate(${turn.toFixed(2)}deg);` : ''}`;
      el('image', { href: this.assets.url(l.src), x: (l.dx ?? 0) - l.size / 2, y: (l.dy ?? 0) - l.size / 2, width: l.size, height: l.size, class: `skin-home-layer${l.anim ? ` skin-${l.anim}` : ''}${l.delay ? ' skin-later' : ''}`, opacity: l.opacity ?? 1, preserveAspectRatio: l.turn ? 'none' : 'xMidYMid meet', ...(style ? { style } : {}) }, art);
    }
  }

  /**
   * Blocked hexes get one big boulder cluster, gold (x2) hexes one pile of nuggets (picked per hex),
   * in a layer over all the ground (they may overhang). A gold pile hides once a tile stands on it.
   */
  private dressRocks() {
    this.layers.base.querySelector('.skin-rocks')?.remove();
    const g = el('g', { class: 'skin-rocks', 'aria-hidden': 'true' }, this.layers.base);
    for (const key of this.keys) {
      const t = this.terrain[key];
      if (t !== 'rock' && t !== 'rich') continue;
      const defs = this.propDefs[this.skin.cells[t]] ?? [];
      if (!defs.length) continue;
      const def = defs[Math.floor(hash(`${key}:${t}`) * defs.length)]!;
      const { x, y } = centerOf(key);
      // rock clusters are painted to a pointy-top hex: turned with the board so they sit in theirs
      const o = toScreen(1, 0);
      const turn = t === 'rock' ? (Math.atan2(o.y, o.x) * 180) / Math.PI : 0;
      el('image', { href: this.assets.url(def.src), x: x - def.size / 2, y: y - def.size / 2, width: def.size, height: def.size, class: `skin-prop${t === 'rich' ? ' skin-gold' : ''}`, 'data-key': key, preserveAspectRatio: 'xMidYMid meet', ...(turn ? { transform: `rotate(${turn.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})` } : {}) }, g);
    }
    if (this.lastRender) this.hideTakenGold(this.lastRender[0]);
  }

  private hideTakenGold(board: Record<string, Tile | null>) {
    for (const i of this.layers.base.querySelectorAll<SVGImageElement>('.skin-gold')) i.style.display = board[i.dataset.key ?? ''] ? 'none' : '';
  }

  // ---------- each render ----------

  override render(board: Record<string, Tile | null>, o: Overlay) {
    this.netDefs?.replaceChildren();
    if (!this.wantedTier) this.checkView();
    this.joinedNow = this.joined(board);
    super.render(board, o);
    this.hideTakenGold(board);
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
      } else if (scars.has(key) && !this.propDefs.dead?.length) {
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
    this.drawLife(board);
  }

  /**
   * Life around the territories, now and then: on the player's connected land a few butterflies
   * and a drifting leaf wander a loose loop over their tiles (sometimes straying past the edge);
   * around the enemy's land a small flame licks up at a tile's edge or a curl of black smoke rises.
   * Drawn in vector (no files), rebuilt only when the territories change; the timing follows the
   * clock, so a rebuild never restarts anything. Off with Reduce motion or on tiny boards.
   */
  private drawLife(board: Record<string, Tile | null>) {
    const on = this.look.motion && (this.tilePx() || 0) >= 40;
    const sides = [0, 1].map((p) => this.keys.filter((k) => board[k]?.owner === p && this.joinedNow.has(k)).sort());
    const sig = on ? sides.map((k) => k.join(',')).join('|') : '';
    if (sig === this.lifeSig && this.life?.isConnected) return;
    this.lifeSig = sig;
    this.life?.remove();
    this.life = null;
    if (!on) return;
    const g = (this.life = el('g', { class: 'skin-life', 'aria-hidden': 'true' }, this.layers.glow));
    const now = performance.now() / 1000;
    const timing = (dur: number, salt: string) => `animation-duration:${dur.toFixed(2)}s;animation-delay:${(-((now + hash(salt) * dur) % dur)).toFixed(2)}s;`;
    const smil = (dur: number, salt: string) => ({ dur: `${dur.toFixed(2)}s`, begin: `${(-((now + hash(salt) * dur) % dur)).toFixed(2)}s`, repeatCount: 'indefinite' });
    // a loose loop over a few of these tiles, with one wide swing beyond the last
    const loop = (keys: string[], salt: string) => {
      const set = new Set(keys);
      let cur = keys[Math.floor(hash(`${salt}:start`) * keys.length)]!;
      const pts = [centerOf(cur)];
      for (let i = 0; i < 4; i++) {
        const next = allNeighbors(parseKey(cur)).map(coordKey).filter((k) => set.has(k));
        if (!next.length) break;
        cur = next[Math.floor(hash(`${salt}:${i}`) * next.length)]!;
        pts.push(centerOf(cur));
      }
      const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
      const last = pts[pts.length - 1]!;
      const ang = Math.atan2(last.y - c.y, last.x - c.x) + (hash(`${salt}:o`) - 0.5);
      pts.push({ x: last.x + Math.cos(ang) * 46, y: last.y + Math.sin(ang) * 46 });
      const jit = pts.map((p, i) => ({ x: p.x + (hash(`${salt}:x${i}`) - 0.5) * 30, y: p.y + (hash(`${salt}:y${i}`) - 0.5) * 30 }));
      const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => `${((a.x + b.x) / 2).toFixed(1)},${((a.y + b.y) / 2).toFixed(1)}`;
      let d = `M${mid(jit[jit.length - 1]!, jit[0]!)}`;
      for (let i = 0; i < jit.length; i++) d += `Q${jit[i]!.x.toFixed(1)},${jit[i]!.y.toFixed(1)} ${mid(jit[i]!, jit[(i + 1) % jit.length]!)}`;
      return d;
    };
    const mine = sides[0]!;
    if (mine.length >= 2) {
      const colours = [['#fff6c8', '#f2c94c'], ['#f4f1ff', '#b9c7ff'], ['#ffe2ef', '#f5a3c0']] as const;
      const n = Math.min(3, Math.ceil(mine.length / 5));
      for (let i = 0; i < n; i++) {
        const salt = `bfly${i}`;
        const [a, b] = colours[Math.floor(hash(`${salt}:c`) * colours.length)]!;
        const show = el('g', { class: 'skin-wander', style: timing(26 + hash(`${salt}:v`) * 14, `${salt}:v`) }, g);
        const fly = el('g', {}, show);
        el('animateMotion', { path: loop(mine, salt), ...smil(30 + hash(`${salt}:d`) * 16, `${salt}:d`) }, fly);
        const bob = el('g', { class: 'skin-bob', style: timing(1.7 + hash(`${salt}:b`), `${salt}:b`) }, el('g', { transform: 'scale(2.1)' }, fly));
        for (const side of [-1, 1]) {
          const w = el('g', { class: 'skin-wing', style: `transform-origin:0 0;${timing(0.32 + hash(`${salt}:f`) * 0.1, `${salt}:f`)}` }, bob);
          el('ellipse', { cx: side * 1.9, cy: -0.9, rx: 2, ry: 1.5, fill: a, stroke: b, 'stroke-width': 0.35 }, w);
          el('ellipse', { cx: side * 1.4, cy: 1, rx: 1.3, ry: 1.05, fill: b }, w);
        }
        el('path', { d: 'M0,-1.6L0,1.8', stroke: '#3a2a1a', 'stroke-width': 0.55, 'stroke-linecap': 'round' }, bob);
      }
      const leaf = this.skin.ambient?.motes.find((m) => m.material === this.skin.owners[0])?.src;
      if (leaf && this.assets.has(leaf)) {
        const salt = 'leaf0';
        const show = el('g', { class: 'skin-wander', style: timing(34, `${salt}:v`) }, g);
        const fly = el('g', {}, show);
        el('animateMotion', { path: loop(mine, salt), ...smil(40, `${salt}:d`) }, fly);
        const spin = el('g', { class: 'skin-spin', style: timing(5.5, `${salt}:s`) }, fly);
        el('image', { href: this.assets.url(leaf), x: -4, y: -4, width: 8, height: 8 }, spin);
      }
    }
    const theirs = sides[1]!;
    if (theirs.length) {
      const flames = Math.min(4, Math.ceil(theirs.length / 3));
      for (let i = 0; i < flames; i++) {
        const k = theirs[Math.floor(hash(`flame${i}:k`) * theirs.length)]!;
        const { x, y } = centerOf(k);
        const a = hash(`flame${i}:a`) * Math.PI * 2;
        const r = 14 + hash(`flame${i}:r`) * 10;
        const f = el('g', { class: 'skin-flame', transform: `translate(${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)})`, style: timing(6 + hash(`flame${i}:d`) * 7, `flame${i}:d`) }, g);
        const lick = el('g', { class: 'skin-lick', style: timing(0.45 + hash(`flame${i}:l`) * 0.2, `flame${i}:l`) }, el('g', { transform: 'scale(1.7)' }, f));
        el('path', { d: 'M0,0C-2.4,-1 -2.2,-4.2 0,-7.5C0.9,-4.6 2.6,-3.3 1.9,-1C1.5,0 0.6,0.3 0,0Z', fill: 'url(#' + this.id('skin-flame-grad') + ')' }, lick);
        el('path', { d: 'M0,-0.4C-1,-1 -0.9,-2.6 0,-4.2C0.5,-2.8 1.1,-1.8 0.7,-0.8Z', fill: '#fff3b0', opacity: 0.85 }, lick);
      }
      const smoke = 'homes/volcano_smoke_01.webp';
      if (this.assets.has(smoke))
        for (let i = 0; i < Math.min(2, Math.ceil(theirs.length / 5)); i++) {
          const k = theirs[Math.floor(hash(`soot${i}:k`) * theirs.length)]!;
          const { x, y } = centerOf(k);
          const sm = el('g', { class: 'skin-soot', style: timing(10 + hash(`soot${i}:d`) * 6, `soot${i}:d`) }, g);
          el('image', { href: this.assets.url(smoke), x: x + (hash(`soot${i}:x`) - 0.5) * 24 - 8, y: y + (hash(`soot${i}:y`) - 0.5) * 18 - 8, width: 16, height: 16 }, sm);
        }
    }
  }

  protected override drawScars(board: Record<string, Tile | null>, o: Overlay, scars: SVGGElement) {
    // with dead-wood sprites (props.dead): the empty ground and one burnt stump or log per lost hex
    const dead = this.propDefs.dead ?? [];
    for (const s of o.scars) {
      if (board[s.key] || !dead.length) continue;
      const def = dead[Math.floor(hash(`${s.key}:dead`) * dead.length)]!;
      const { x, y } = centerOf(s.key);
      const g = el('g', { class: `scar-g age-${Math.min(2, s.age ?? 0)}` }, scars);
      el('image', { href: this.assets.url(def.src), x: x - def.size / 2, y: y - def.size / 2, width: def.size, height: def.size, class: 'skin-prop', preserveAspectRatio: 'xMidYMid meet' }, g);
    }
    if (dead.length) return;
    // otherwise the ground paints what is left (cut-off tint); a scar decal on top when the skin has one
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
          art: this.linkArt[p]?.length ? this.linkArt[p]![Math.floor(hash(`${a}|${b}`) * this.linkArt[p]!.length)]! : null,
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

  /**
   * Living lava on a painted lava tile: a brighter copy of the picture whose glow swells and ebbs
   * (screen blend, so the dark rock barely changes and the lava breathes), embers that spark and
   * rise now and then (more on hotter tiles), and on strong tiles an occasional smoke puff. Each
   * tile runs its own pace, and the phase follows the clock, so a redraw never restarts it.
   */
  private liveLava(g: SVGGElement, holder: SVGGElement, key: string, src: string, x: number, y: number, sz: number, turn: number, s9: number) {
    if (!this.look.motion) return;
    const now = performance.now() / 1000;
    const phase = (dur: number, salt: string) => `animation-duration:${dur.toFixed(2)}s;animation-delay:${(-((now + hash(`${key}:${salt}`) * dur) % dur)).toFixed(2)}s;`;
    const rot = turn ? `transform-box:fill-box;transform-origin:center;transform:rotate(${turn.toFixed(2)}deg);` : '';
    el('image', { href: this.assets.url(src), x: x - sz / 2, y: y - sz / 2, width: sz, height: sz, class: 'skin-lava-glow', preserveAspectRatio: 'none', style: rot + phase(3.6 + hash(`${key}:gd`) * 2.6, 'g') }, holder);
    const embers = s9 >= 7 ? 2 : s9 >= 3 ? 1 : 0;
    const ember = this.skin.ambient?.motes.find((m) => m.material === this.skin.owners[1])?.src;
    if (ember && this.assets.has(ember))
      for (let i = 0; i < embers; i++) {
        const a = hash(`${key}:ea${i}`) * Math.PI * 2;
        const r = 7 + hash(`${key}:er${i}`) * 13;
        const e = el('g', { class: 'skin-ember', style: phase(5 + hash(`${key}:ed${i}`) * 4, `e${i}`) }, g);
        el('image', { href: this.assets.url(ember), x: x + Math.cos(a) * r - 2.2, y: y + Math.sin(a) * r - 2.2, width: 4.4, height: 4.4 }, e);
      }
    const smoke = 'homes/volcano_smoke_02.webp';
    if (s9 >= 6 && this.assets.has(smoke) && hash(`${key}:sm`) < 0.6) {
      const a = hash(`${key}:sa`) * Math.PI * 2;
      const sm = el('g', { class: 'skin-tile-smoke', style: phase(9 + hash(`${key}:sd`) * 5, 'sm') }, g);
      el('image', { href: this.assets.url(smoke), x: x + Math.cos(a) * 10 - 7, y: y + Math.sin(a) * 10 - 7, width: 14, height: 14, opacity: 0.7 }, sm);
    }
  }

  /** Which side of hex `key` (0-5, between corners i and i+1) faces the neighbour `nk`. */
  private sideToward(key: string, nk: string) {
    const c = centerOf(key);
    const nc = centerOf(nk);
    const mx = (c.x + nc.x) / 2;
    const my = (c.y + nc.y) / 2;
    const corners = cornerPts(key, S);
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < 6; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 6]!;
      const dd = Math.hypot((a[0] + b[0]) / 2 - mx, (a[1] + b[1]) / 2 - my);
      if (dd < bd) (bd = dd), (best = i);
    }
    return best;
  }

  /**
   * A mask for a painted tile: the hex in six slices (centre to each side); a slice whose side is
   * shared fades from full at the centre to faint at that side. Slices never overlap, so corners
   * between two shared sides fade cleanly.
   */
  private seamMask(key: string, shared: Set<number>) {
    const id = `${this.id('seam-')}${key.replace(/[^\w-]/g, '_')}`;
    const m = el('mask', { id, maskUnits: 'userSpaceOnUse', x: -1e4, y: -1e4, width: 2e4, height: 2e4 }, this.netDefs!);
    const c = centerOf(key);
    const corners = cornerPts(key, S * 1.04);
    const far = cornerPts(key, S * 1.14);
    for (let i = 0; i < 6; i++) {
      const sh = shared.has(i);
      // a shared slice reaches past the side (into the neighbour, which fades the other way)
      const a = (sh ? far : corners)[i]!;
      const b = (sh ? far : corners)[(i + 1) % 6]!;
      let fill = '#fff';
      if (sh) {
        const gid = `${id}-${i}`;
        const gr = el('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: c.x, y1: c.y, x2: ((a[0] + b[0]) / 2).toFixed(2), y2: ((a[1] + b[1]) / 2).toFixed(2) }, m);
        el('stop', { offset: 0.6, 'stop-color': '#fff' }, gr);
        el('stop', { offset: 1, 'stop-color': '#000' }, gr);
        fill = `url(#${gid})`;
      }
      el('path', { d: `M${c.x.toFixed(2)},${c.y.toFixed(2)}L${a[0].toFixed(2)},${a[1].toFixed(2)}L${b[0].toFixed(2)},${b[1].toFixed(2)}Z`, fill, stroke: fill === '#fff' ? '#fff' : 'none', 'stroke-width': 0.3 }, m);
    }
    return id;
  }

  protected override drawTile(parent: SVGGElement, key: string, t: Tile): SVGGElement {
    const skin = this.skin;
    const g = el('g', { class: `tile ${t.owner === 0 ? 'you' : 'bot'}${t.root ? ' root' : ''} skin-tile`, 'data-key': key }, parent);
    const d = hexPath(key, S * 0.995, this.style.tileShape);
    const mat = skin.materials[skin.owners[t.owner]];
    // one territory, not separate tiles: the fill reaches a little past the hex (over the grid gap,
    // the ground picture is continuous there), and an outline is drawn only on the sides that face
    // something else (another side, empty ground, rock, the board's edge)
    const big = hexPath(key, S * 1.035, 'flat');
    const look = skin.tiles?.[skin.owners[t.owner]];
    const painted = !!(look && this.tileArt[skin.owners[t.owner]]);
    el('path', { d: big, class: 'skin-proxy', fill: painted ? look!.base : (mat?.proxy.base ?? '#333') }, g);
    if (!painted) el('path', { d: big, class: 'skin-fill', fill: this.url('skin-ground') }, g);
    const board = this.lastRender?.[0] ?? {};
    const c = centerOf(key);
    const corners = cornerPts(key, S * 1.0);
    let edge = '';
    const shared = new Set<number>();
    for (const n of allNeighbors(parseKey(key))) {
      const nk = coordKey(n);
      if (board[nk]?.owner === t.owner) {
        shared.add(this.sideToward(key, nk));
        continue;
      }
      const nc = centerOf(nk);
      const mx = (c.x + nc.x) / 2;
      const my = (c.y + nc.y) / 2;
      // the side between the two corners nearest that neighbour's direction
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < 6; i++) {
        const a = corners[i]!;
        const b = corners[(i + 1) % 6]!;
        const dd = Math.hypot((a[0] + b[0]) / 2 - mx, (a[1] + b[1]) / 2 - my);
        if (dd < bd) (bd = dd), (best = i);
      }
      const a = corners[best]!;
      const b = corners[(best + 1) % 6]!;
      edge += `M${a[0].toFixed(2)},${a[1].toFixed(2)}L${b[0].toFixed(2)},${b[1].toFixed(2)}`;
    }
    const { x, y } = centerOf(key);
    const s9 = this.strength9(t);
    const cut = !this.joinedNow.has(key);
    // a painted hex for this strength (the nearest strength that has one), turned with the board
    const art = this.tileArt[skin.owners[t.owner]];
    if (art) {
      let list: string[] = [];
      for (let d = 0; d < 9 && !list.length; d++) list = art[s9 - d]?.length ? art[s9 - d]! : (art[s9 + d] ?? []);
      const src = list[Math.floor(hash(`${key}:tile`) * list.length)];
      if (src) {
        const o = toScreen(1, 0);
        const turn = (Math.atan2(o.y, o.x) * 180) / Math.PI;
        // a little larger where it crossfades, so two neighbours overlap across their shared side
        const sz = S * 2.07 * (shared.size ? 1.1 : 1);
        // sides shared with the same player fade into the territory's ground below (one continuous
        // painting), so neighbouring tiles melt into one field; outer sides stay crisp
        const holder = shared.size && this.netDefs ? el('g', { mask: `url(#${this.seamMask(key, shared)})` }, g) : g;
        el('image', { href: this.assets.url(src), x: x - sz / 2, y: y - sz / 2, width: sz, height: sz, class: `skin-tile-art${cut ? ' cut' : ''}`, preserveAspectRatio: 'none', ...(turn ? { style: `transform-box:fill-box;transform-origin:center;transform:rotate(${turn.toFixed(2)}deg)` } : {}) }, holder);
        if (look?.lava && !cut) this.liveLava(g, holder, key, src, x, y, sz, turn, s9);
      }
    }
    if (edge) el('path', { d: edge, class: 'tile-edge skin-edge skin-rim' }, g);
    void d;
    if (t.root) return g;
    // a tile cut off from its home shows wilted / ashen props instead of its living ones (painted
    // tiles carry their own plants, so they get none)
    const defs = art ? [] : ((cut ? this.cutoffDefs : this.propDefs)[skin.owners[t.owner]] ?? []);
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
