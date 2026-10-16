import type { DuelClient } from '../../../server/src/client.js';
import type { WorldMapPayload } from '../../../server/src/protocol.js';
import type { SeedWallet } from '../../../server/src/seeds/types.js';
import { seedIcon } from './seed-icon.js';
import { ownerLine } from './world-selection.js';

type Identity = { token: string; playerId: string };
type World = WorldMapPayload['world'];
const NS = 'http://www.w3.org/2000/svg';
const R = 10;
const X = Math.sqrt(3);
const coords = (q: number, r: number) => ({ x: X * (q + r / 2) * R, y: 1.5 * r * R });
const hexPath = (x: number, y: number) => {
  const points = [[0, -1], [X / 2, -0.5], [X / 2, 0.5], [0, 1], [-X / 2, 0.5], [-X / 2, -0.5]];
  return points.map(([dx, dy], index) => `${index ? 'L' : 'M'}${(x + dx! * R).toFixed(2)},${(y + dy! * R).toFixed(2)}`).join(' ') + 'Z';
};
/**
 * An owner colour at a different lightness: `territoryColour` hands out `hsl(<h> 34% 49%)`, so one
 * hue and saturation is all a tile's own gradient needs. Shading in JS from the colour the server
 * already sent keeps the palette closed — no new tokens, and it cannot drift from `--territory`.
 */
const shade = (colour: string, lightness: number): string => {
  const m = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+[\d.]+%/.exec(colour);
  return m ? `hsl(${m[1]} ${m[2]}% ${lightness}%)` : colour;
};

/** One shared map, with a stable viewport and revision-only refresh. No game-state logic here. */
export class WorldView {
  private active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private identity: Identity | null = null;
  private wallet: SeedWallet | null = null;
  private world: World | null = null;
  private selected: string | null = null;
  private pendingRequest: string | null = null;
  private busy = false;
  private svg: SVGSVGElement | null = null;
  /** The single top-most path that carries the selection highlight (see `paintAccent`). */
  private accent: SVGPathElement | null = null;
  private box: [number, number, number, number] | null = null;
  private fit: [number, number, number, number] | null = null;
  /** The smallest view the window allows — the framed view; see `boundsFor`. */
  private bounds: [number, number, number, number] | null = null;
  /** True once the player has panned or zoomed, so a re-frame never throws their view away. */
  private touched = false;
  private observer: ResizeObserver | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragged = false;

  constructor(private readonly client: DuelClient, private readonly ensureIdentity: () => Promise<Identity | null>) {
    document.addEventListener('visibilitychange', () => { if (this.active && !document.hidden) void this.refresh(); });
  }

  async open() {
    this.active = true;
    // A fresh visit starts FRAMED to the window (see `boundsFor`), not wherever the last visit was
    // panned to, and re-frames itself if the window's shape changes.
    this.touched = false;
    this.box = null;
    this.notice('');
    // The world is public. A guest token may be slow, offline or rate-limited; it must never
    // prevent the player from seeing the map. Attach the private wallet when identity resolves.
    const publicRefresh = this.refresh(true);
    void this.ensureIdentity().then((identity) => {
      if (!this.active) return;
      this.identity = identity;
      void this.refresh(true);
    }).catch(() => { /* Public world remains usable without an identity. */ });
    await publicRefresh;
  }
  close() {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  private notice(text: string) { document.getElementById('online-world-notice')!.textContent = text; }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    if (this.active) this.timer = setTimeout(() => { if (!document.hidden) void this.refresh(); else this.schedule(); }, 12_000);
  }
  async refresh(force = false) {
    if (!this.active) return;
    try {
      const identityAtRequest = this.identity;
      const [map, wallet] = await Promise.all([
        this.client.worldMap(),
        identityAtRequest ? this.client.seedWallet(identityAtRequest.token).catch(() => null) : Promise.resolve(null),
      ]);
      if (!this.active) return;
      const walletChanged = identityAtRequest === this.identity && this.wallet?.balance !== wallet?.balance;
      if (identityAtRequest === this.identity) this.wallet = wallet;
      const ownerChanged = this.world?.claims.length !== map.world.claims.length ||
        map.world.claims.some((claim, index) => {
          const previous = this.world?.claims[index];
          return !previous || previous.cellId !== claim.cellId || previous.ownerName !== claim.ownerName ||
            previous.ownerId !== claim.ownerId;
        });
      if (!this.world || map.world.revision > this.world.revision ||
        (map.world.revision === this.world.revision && (force || walletChanged || ownerChanged))) {
        this.world = map.world;
        this.paint();
      }
      this.paintWallet();
      this.paintSelection();
    } catch {
      if (this.active) this.notice('The world could not refresh. Tap here to try again.');
    } finally { this.schedule(); }
  }
    private paintWallet() {
      const node = document.getElementById('online-world-wallet')!;
      node.replaceChildren();
      node.append(seedIcon(22), document.createTextNode(this.wallet ? `${this.wallet.balance} SEEDS` : 'SIGN IN TO GROW'));
      // The old "N / 183 grown - one shared world" caption is GONE (owner, 2026-10-16): the map shows
      // the world, so a caption counting it was noise. The element no longer exists in the markup, and
      // this method no longer writes to it.
    }
  private paint() {
    const container = document.getElementById('online-world-grid')!;
    const world = this.world!;
    const occupied = new Map(world.claims.map((claim) => [claim.cellId, claim]));
    const own = new Set(world.claims.filter((claim) => claim.ownerId === this.identity?.playerId).map((claim) => claim.cellId));
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', 'Shared hexagonal world. Choose a tile to inspect it.');
    svg.classList.add('world-map-svg');
    // Every tile is shaded by its OWN gradient, so a hex reads as a physical surface with a light
    // from the top-left rather than as flat paint (owner, 2026-10-16: "give it some personality and
    // some life"). One gradient per distinct owner colour, built from that colour's own hue and
    // saturation, plus ONE deliberately flat dark one for unclaimed ground so empty tiles stay
    // recessive. Nothing here changes geometry: the paths and the viewBox maths are untouched.
    const defs = document.createElementNS(NS, 'defs');
    let seq = 0;
    const face = (from: string, mid: string, to: string): string => {
      const id = `world-face-${seq++}`;
      const g = document.createElementNS(NS, 'linearGradient');
      g.setAttribute('id', id);
      g.setAttribute('x1', '0'); g.setAttribute('y1', '0');
      g.setAttribute('x2', '1'); g.setAttribute('y2', '1');
      for (const [offset, colour] of [['0', from], ['.55', mid], ['1', to]] as const) {
        const stop = document.createElementNS(NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', colour);
        g.append(stop);
      }
      defs.append(g);
      return `url(#${id})`;
    };
    const EMPTY_FACE = face('#2b322c', '#242a25', '#1a1f1b');
    const heldFace = new Map<string, string>();
    const mineFace = new Map<string, string>();
    for (const claim of world.claims) {
      if (!heldFace.has(claim.colour)) heldFace.set(claim.colour, face(shade(claim.colour, 60), shade(claim.colour, 49), shade(claim.colour, 34)));
      // Your own territory: the same hue one step brighter, so it is spotted at a glance without a
      // second colour entering the palette.
      if (!mineFace.has(claim.colour)) mineFace.set(claim.colour, face(shade(claim.colour, 71), shade(claim.colour, 57), shade(claim.colour, 40)));
    }
    svg.append(defs);
    // TWO LAYERS, so a stroke is never buried by a neighbour's fill — the cause of the owner's
    // uneven highlight (2026-10-16: a cream edge only on the sides facing open ground, and no line
    // at all between two highlighted tiles). Every FILL goes in `faces` and paints first; every
    // STROKE, plus the whole touch target, goes in `lines` and paints ABOVE all fills, so a tile
    // edge is always drawn over its neighbour's surface. The selected tile then draws once more,
    // last of all, in `world-accent`, so its highlight is never half-eaten by a neighbour's edge.
    // Each line is still the `world-hex` element (data, focus, pointer target), so nothing else
    // about the map changes.
    const faces = document.createElementNS(NS, 'g');
    faces.classList.add('world-faces');
    const lines = document.createElementNS(NS, 'g');
    lines.classList.add('world-lines');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cell of world.cells) {
      const at = coords(cell.q, cell.r);
      const d = hexPath(at.x, at.y);
      minX = Math.min(minX, at.x - R); maxX = Math.max(maxX, at.x + R);
      minY = Math.min(minY, at.y - R); maxY = Math.max(maxY, at.y + R);
      const owner = occupied.get(cell.id);
      const mine = !!owner && owner.ownerId === this.identity?.playerId;
      // The FACE: the tile's surface, and nothing else. Its fill is inline so it beats the
      // stylesheet's flat fallback; the per-owner gradient carries the colour.
      const face = document.createElementNS(NS, 'path');
      face.setAttribute('d', d);
      face.setAttribute('data-cell-id', cell.id);
      face.classList.add('world-hex-face');
      if (owner) {
        face.classList.add(mine ? 'mine' : 'held');
        face.style.fill = (mine ? mineFace : heldFace).get(owner.colour)!;
      } else {
        face.style.fill = EMPTY_FACE;
      }
      faces.append(face);
      // The LINE: the tile's edge, its owner and its state — and the element the player touches.
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('data-cell-id', cell.id);
      path.setAttribute('data-owner-id', owner?.ownerId ?? '');
      path.classList.add('world-hex');
      if (owner) {
        path.classList.add(mine ? 'mine' : 'held');
        path.style.setProperty('--territory', owner.colour);
      } else if (this.wallet && this.wallet.balance >= world.cost &&
        (!own.size || [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
          .some(([dq, dr]) => own.has(`${cell.q + dq!},${cell.r + dr!}`)))) path.classList.add('available');
      path.classList.toggle('selected', this.selected === cell.id);
      path.tabIndex = 0;
      path.setAttribute('aria-label', owner
        ? `${owner.ownerName ?? 'Player'} #${owner.ownerTag} territory` : `Free world tile ${cell.id}`);
      path.addEventListener('click', () => { if (!this.dragged) this.select(cell.id); this.dragged = false; });
      path.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.select(cell.id); }
      });
      lines.append(path);
    }
    svg.append(faces, lines);
    // The accent: ONE path, above every outline, that carries the selection highlight.
    const accentGroup = document.createElementNS(NS, 'g');
    accentGroup.classList.add('world-accent');
    const accent = document.createElementNS(NS, 'path');
    accent.classList.add('world-accent-line');
    accentGroup.append(accent);
    svg.append(accentGroup);
    this.accent = accent;
    this.paintAccent();
    if (!this.fit) this.fit = [minX - 6, minY - 6, maxX - minX + 12, maxY - minY + 12];
    // Frame the view to the WINDOW, so the map scales up to fill it. A portrait phone crops the
    // surplus width and pans to the edges; a wide screen resolves to the whole world.
    const rect = container.getBoundingClientRect();
    this.bounds = this.boundsFor(rect.height > 0 ? rect.width / rect.height : 0);
    if (!this.box || !this.touched) this.box = [...(this.bounds ?? this.fit)];
    svg.setAttribute('viewBox', this.box.join(' '));
    this.observer?.disconnect();
    this.installPanZoom(svg);
    container.replaceChildren(svg);
    this.svg = svg;
  }
  /**
   * The smallest view the window allows: the largest rect with the WINDOW's own aspect that fits
   * inside the world's fit box. On a portrait phone that keeps the full height and takes a narrower
   * width, so the map scales up to the window and the surplus is cropped, pannable to the edges
   * because panning clamps to `fit`. On a wide screen it resolves to the whole world. Keeping the
   * box's aspect equal to the window's is what makes the SVG scale both axes equally — the hexes
   * stay true hexagons however the view is framed.
   */
  private boundsFor(aspect: number): [number, number, number, number] | null {
    if (!this.fit || !Number.isFinite(aspect) || aspect <= 0) return null;
    const [fx, fy, fw, fh] = this.fit;
    let w = fh * aspect, h = fh;
    if (w > fw) { w = fw; h = fw / aspect; }
    return [fx + (fw - w) / 2, fy + (fh - h) / 2, w, h];
  }
  /** The selection highlight, drawn in the ONE accent path above every tile edge. */
  private paintAccent() {
    if (!this.accent) return;
    const cell = this.selected ? this.world?.cells.find((candidate) => candidate.id === this.selected) : null;
    if (!cell) { this.accent.removeAttribute('d'); return; }
    const at = coords(cell.q, cell.r);
    this.accent.setAttribute('d', hexPath(at.x, at.y));
  }
  private select(cellId: string) {
    this.selected = cellId;
    this.pendingRequest = null;
    const owner = this.world?.claims.find((claim) => claim.cellId === cellId)?.ownerId;
    for (const path of this.svg?.querySelectorAll('.world-hex') ?? []) {
      path.classList.toggle('selected', path.getAttribute('data-cell-id') === cellId);
      path.classList.toggle('same-owner', !!owner && path.getAttribute('data-owner-id') === owner);
    }
    this.paintAccent();
    this.paintSelection();
  }
  private paintSelection(confirm = false) {
    const pane = document.getElementById('online-world-selection')!;
    pane.replaceChildren();
    if (!this.world || !this.selected) {
      pane.textContent = 'Choose a tile to see who holds it.';
      return;
    }
    const tile = this.world.claims.find((claim) => claim.cellId === this.selected);
    if (tile) {
      pane.textContent = ownerLine(tile, tile.ownerId === this.identity?.playerId);
      return;
    }
    const label = document.createElement('span');
    const available = this.svg?.querySelector(`.world-hex[data-cell-id="${this.selected}"]`)?.classList.contains('available');
    // OWNER WORDING (2026-10-16): "when placing a tile dont say 'claim hex' say grow a tile
    // everywhere". The verb is GROW and the noun is TILE throughout this screen - it also matches
    // the game's own Grow action, so the world map and the board speak the same language.
    label.textContent = available ? `FREE TILE · ${this.world.cost} SEEDS` : this.wallet && this.wallet.balance < this.world.cost ? '100 SEEDS NEEDED' : 'GROW NEXT TO YOUR TERRITORY';
    pane.append(label);
    if (!available || this.busy) return;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'world-claim-button';
    action.textContent = confirm ? 'CONFIRM GROW' : 'GROW A TILE';
    action.addEventListener('click', () => {
      if (!confirm) return this.paintSelection(true);
      void this.claim();
    });
    pane.append(action);
  }
  private async claim() {
    if (!this.identity || !this.selected || this.busy) return;
    this.busy = true;
    const cellId = this.selected;
    this.pendingRequest ??= crypto.randomUUID();
    this.paintSelection();
    try {
      await this.client.claimWorld(this.identity.token, cellId, this.pendingRequest);
      this.notice('A little place in the world is yours.');
      this.pendingRequest = null;
      await this.refresh(true);
    } catch {
      this.notice('That tile may have changed. The map has refreshed; no Seeds were taken.');
      this.pendingRequest = null;
      await this.refresh(true);
    } finally { this.busy = false; this.paintSelection(); }
  }
  private installPanZoom(svg: SVGSVGElement) {
    const set = () => {
      if (!this.box || !this.fit) return;
      const [fx, fy, fw, fh] = this.fit;
      // The framed view is BOTH zoom limits. Its width is the most zoomed-OUT view that still fills
      // the window (any wider and the box's aspect leaves the window's, so the SVG would letterbox
      // again); a quarter of it is as far in as the map goes. Height follows the box's own aspect, so
      // the two axes always scale together and the hexes stay true.
      const frame = this.bounds ?? this.fit;
      const aspect = this.box[3] > 0 ? this.box[2] / this.box[3] : 1;
      this.box[2] = Math.max(frame[2] / 4, Math.min(frame[2], this.box[2]));
      this.box[3] = this.box[2] / aspect;
      this.box[0] = Math.max(fx, Math.min(fx + fw - this.box[2], this.box[0]));
      this.box[1] = Math.max(fy, Math.min(fy + fh - this.box[3], this.box[1]));
      svg.setAttribute('viewBox', this.box.join(' '));
    };
    const zoom = (scale: number, x: number, y: number) => {
      if (!this.box || !this.fit) return;
      const [bx, by, bw, bh] = this.box;
      const rect = svg.getBoundingClientRect();
      const fx = (x - rect.left) / rect.width, fy = (y - rect.top) / rect.height;
      const frame = this.bounds ?? this.fit;
      const width = Math.max(frame[2] / 4, Math.min(frame[2], bw / scale));
      // Scaled by the box's OWN aspect (which is the window's), not the world's, so zooming keeps the
      // view framed and the two axes scale equally at every zoom level.
      const height = width * bh / bw;
      this.box = [bx + fx * (bw - width), by + fy * (bh - height), width, height];
      this.touched = true;
      set();
    };
    svg.addEventListener('wheel', (event) => {
      event.preventDefault(); zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
    }, { passive: false });
    svg.addEventListener('pointerdown', (event) => {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.dragged = false;
    });
    svg.addEventListener('pointermove', (event) => {
      const old = this.pointers.get(event.pointerId);
      if (!old || !this.box) return;
      const dx = event.clientX - old.x, dy = event.clientY - old.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        this.dragged = true;
        this.touched = true;
        // Capturing on pointerdown retargets a touch tap's click to the SVG,
        // so a tile never receives it. Capture only once the gesture is a pan.
        if (!svg.hasPointerCapture(event.pointerId)) svg.setPointerCapture(event.pointerId);
      }
      const rect = svg.getBoundingClientRect();
      if (this.pointers.size === 1) {
        this.box[0] -= dx / rect.width * this.box[2]; this.box[1] -= dy / rect.height * this.box[3]; set();
      } else {
        const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
        if (other) {
          const before = Math.hypot(old.x - other.x, old.y - other.y);
          const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
          if (before > 0) zoom(after / before, (event.clientX + other.x) / 2, (event.clientY + other.y) / 2);
        }
      }
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });
    const end = (event: PointerEvent) => { this.pointers.delete(event.pointerId); };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    // Re-frame when the WINDOW changes shape (a phone rotating, the on-screen keyboard, a notice line
    // changing the column's chrome). Untouched: the view follows the new frame exactly. Touched: the
    // player's zoom level is kept and re-derived at the new aspect, so the view stays band-free.
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => {
        const r = svg.getBoundingClientRect();
        const next = this.boundsFor(r.height > 0 ? r.width / r.height : 0);
        if (!next || !this.box) return;
        const prev = this.bounds;
        this.bounds = next;
        if (!this.touched || !prev) {
          this.box = [...next];
        } else {
          const z = this.box[2] / prev[2];
          this.box[2] = next[2] * z;
          this.box[3] = next[3] * z;
        }
        set();
      });
      this.observer.observe(svg);
    }
  }
}
