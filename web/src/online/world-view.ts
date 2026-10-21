import type { DuelClient } from '../../../server/src/client.js';
import type { WorldMapPayload } from '../../../server/src/protocol.js';
import type { SeedWallet, WorldChallengeWire, WorldChallengesPayload } from '../../../server/src/seeds/types.js';
import { worldNeighbours } from '../../../server/src/world.js';
import { CHALLENGE } from './challenge-copy.js';
import {
  challengeForCell as challengeOnCell,
  isLow,
  opponentName,
  playerName,
  remainingLabel,
  ringFraction,
  sheetModeFor,
  winnerName,
} from './challenge-view.js';
import { seedBalanceLabel, seedIcon } from './seed-icon.js';
import { ownerLine } from './world-selection.js';

type Identity = { token: string; playerId: string };
type World = WorldMapPayload['world'];
const NS = 'http://www.w3.org/2000/svg';
const R = 10;
const X = Math.sqrt(3);
/**
 * THE MAP'S OWN GUTTER, in world units, on all four sides of the world's extent. It is the inner
 * padding of the pannable content (owner, 2026-10-21: an edge cell must clear the panel's 14px
 * rounded corner at the end of a pan). At 18 units — a little under one hex height — it is ~40px at
 * the large view's scale, so the outermost column/row is never clipped by the border.
 */
const PAD = 18;
/**
 * THE SMALLEST A CELL MAY BE DRAWN in the large view, in CSS pixels. The owner's touch minimum is
 * 44px; one hex is √3·R = 17.32 world units wide, so the framed view is capped at the width that
 * keeps a cell at 46px — two pixels of headroom over the minimum, for stroke and rounding. FIT mode
 * is exempt: there the whole silhouette is a preview.
 */
const MIN_CELL_PX = 46;
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
  /**
   * THE FIT TOGGLE (owner, 2026-10-21: "keep it large and pannable in both axes, with a 'fit'
   * toggle"). FIT is a PURE VIEW change: it draws `containFor` in place of `box` and leaves `box`,
   * `touched` and every cell untouched, so turning it off restores the exact view the player had.
   */
  private fitted = false;
  /** The panel's measured aspect from the last paint/resize, so a FIT view can be rebuilt on demand. */
  private aspect = 0;
  /** The panel's measured width in CSS pixels — the only way to hold the MIN_CELL_PX floor. */
  private pixels = 0;
  private observer: ResizeObserver | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragged = false;

  // ---- Territory challenges -------------------------------------------------
  /** The authenticated challenge lists. Empty for a guest until identity resolves. */
  private challenges: WorldChallengesPayload = { incoming: [], outgoing: [], serverNow: Date.now() };
  /** When the payload landed, so the ring keeps draining between 12 s polls. */
  private challengeReceivedAt = Date.now();
  private challengeSignature = '';
  /** The live ring paths, reused across polls so `stroke-dashoffset` can transition smoothly. */
  private readonly ringPaths = new Map<string, { path: SVGPathElement; challenge: WorldChallengeWire }>();
  private ringsGroup: SVGGElement | null = null;
  private marksGroup: SVGGElement | null = null;
  /** Set by lobby-ui once `openMatch` exists, so an accepted challenge can open its duel. */
  private matchOpener: ((matchId: string) => void) | null = null;
  private sheet: {
    root: HTMLElement;
    line: HTMLElement;
    meta: HTMLElement;
    primary: HTMLButtonElement;
    secondary: HTMLButtonElement;
    notice: HTMLElement;
  } | null = null;
  private sheetMode: 'send' | 'defend' | 'wait' | 'duel' | 'confirm' | 'resolved' | 'closed' = 'closed';
  private sheetCellId: string | null = null;
  private sheetChallenge: WorldChallengeWire | null = null;
  private sheetRequestId: string | null = null;
  private sheetBusy = false;
  private sheetReturnFocus: HTMLElement | null = null;
  private readonly onSheetKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.sheet && !this.sheet.root.hidden) {
      event.preventDefault();
      this.closeSheet();
    }
  };

  constructor(private readonly client: DuelClient, private readonly ensureIdentity: () => Promise<Identity | null>) {
    document.addEventListener('visibilitychange', () => { if (this.active && !document.hidden) void this.refresh(); });
    // ONE quiet control (see `fitted`). A toggle button: aria-pressed carries the state, the label
    // is set from `ONLINE.worldFit` in lobby-ui.ts. Keyboard and screen readers get it for free
    // because it is a real <button>.
    document.getElementById('online-world-fit')?.addEventListener('click', () => this.setFitted(!this.fitted));
  }

  /** lobby-ui owns opening a duel; the challenge layer only knows the match id. */
  setMatchOpener(open: (matchId: string) => void): void {
    this.matchOpener = open;
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
    this.closeSheet(false);
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
      const [map, wallet, challenges] = await Promise.all([
        this.client.worldMap(),
        identityAtRequest ? this.client.seedWallet(identityAtRequest.token).catch(() => null) : Promise.resolve(null),
        identityAtRequest ? this.client.worldChallenges(identityAtRequest.token).catch(() => null) : Promise.resolve(null),
      ]);
      if (!this.active) return;
      const sameIdentity = identityAtRequest === this.identity;
      const walletChanged = sameIdentity && this.wallet?.balance !== wallet?.balance;
      if (sameIdentity) this.wallet = wallet;
      if (sameIdentity && challenges) {
        this.challenges = challenges;
        this.challengeReceivedAt = Date.now();
      } else if (!this.identity) {
        this.challenges = { incoming: [], outgoing: [], serverNow: Date.now() };
      }
      const signature = this.challengeSignatureOf();
      const challengeChanged = signature !== this.challengeSignature;
      this.challengeSignature = signature;
      const ownerChanged = this.world?.claims.length !== map.world.claims.length ||
        map.world.claims.some((claim, index) => {
          const previous = this.world?.claims[index];
          return !previous || previous.cellId !== claim.cellId || previous.ownerName !== claim.ownerName ||
            previous.ownerId !== claim.ownerId;
        });
      if (!this.world || map.world.revision > this.world.revision ||
        (map.world.revision === this.world.revision && (force || walletChanged || ownerChanged || challengeChanged))) {
        this.world = map.world;
        this.paint();
      }
      this.paintWallet();
      this.paintSelection();
      // The ring must keep draining even when the world revision is unchanged (a 24 h timer does not
      // bump ownership). These two only touch attributes and the challenge strip, never the map.
      this.paintRings();
      this.paintChallenges();
    } catch {
      if (this.active) this.notice('The world could not refresh. Tap here to try again.');
    } finally { this.schedule(); }
  }

  private challengeSignatureOf(): string {
    return [...this.challenges.incoming, ...this.challenges.outgoing]
      .map((c) => `${c.id}:${c.status}:${c.matchFinished}:${c.winnerId ?? ''}`)
      .join('|');
  }

  private get allChallenges(): WorldChallengeWire[] {
    return [...this.challenges.incoming, ...this.challenges.outgoing];
  }

  /** Server time plus the time elapsed since the payload landed (no client-clock dependency). */
  private challengeNow(): number {
    return (this.challenges.serverNow || Date.now()) + Math.max(0, Date.now() - this.challengeReceivedAt);
  }
    private paintWallet() {
      const node = document.getElementById('online-world-wallet')!;
      node.replaceChildren();
      node.append(seedIcon(22), document.createTextNode(this.wallet ? seedBalanceLabel(this.wallet.balance) : 'SIGN IN TO GROW'));
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
      // NO per-path click handler: a tap is resolved once, on the SVG, by snapping to the nearest
      // cell centre (see `tapAt`). That is the touch-target guarantee — a tap never lands on the
      // wrong neighbour and never selects nothing. Keyboard selection stays per tile.
      path.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.select(cell.id); }
      });
      lines.append(path);
    }
    // THE CHALLENGE LAYER (docs/TERRITORY-CHALLENGES.md): a frontier mark and a timer ring are the
    // only additions to the map, and both are above every tile edge so no neighbour can bury them.
    // The ring traces the cell's OWN `hexPath` — the same six points as the tile — so it is the
    // shape of the ground, not a circle stuck on top of it.
    const marks = document.createElementNS(NS, 'g');
    marks.classList.add('world-frontier-marks');
    const rings = document.createElementNS(NS, 'g');
    rings.classList.add('world-rings');
    svg.append(faces, lines, marks, rings);
    // The accent: ONE path, above every outline, that carries the selection highlight.
    const accentGroup = document.createElementNS(NS, 'g');
    accentGroup.classList.add('world-accent');
    const accent = document.createElementNS(NS, 'path');
    accent.classList.add('world-accent-line');
    accentGroup.append(accent);
    svg.append(accentGroup);
    this.accent = accent;
    this.marksGroup = marks;
    this.ringsGroup = rings;
    this.ringPaths.clear();
    this.paintAccent();
    // THE FIT BOX carries `PAD` on all four sides, so the outermost cell can be panned clear of the
    // panel's rounded corner (see `PAD`).
    if (!this.fit) this.fit = [minX - PAD, minY - PAD, maxX - minX + 2 * PAD, maxY - minY + 2 * PAD];
    // Frame the view to the WINDOW, so the map scales up to fill it. A portrait phone crops the
    // surplus width and pans to the edges; a wide screen resolves to the whole world. The DEFAULT
    // view is then the framed view capped so one cell is at least MIN_CELL_PX (see `detailFor`).
    const rect = container.getBoundingClientRect();
    this.aspect = rect.height > 0 ? rect.width / rect.height : 0;
    this.pixels = rect.width;
    this.bounds = this.boundsFor(this.aspect);
    if (!this.box || !this.touched) {
      this.box = [...(this.detailFor(this.aspect, rect.width) ?? this.bounds ?? this.fit)];
    }
    this.observer?.disconnect();
    this.installPanZoom(svg);
    // Keep the ONE control: the panel's markup owns the FIT button, and only the SVG is replaced.
    container.querySelector('.world-map-svg')?.remove();
    container.append(svg);
    this.svg = svg;
    this.applyView();
    this.paintFrontier();
    this.paintRings();
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
  /**
   * THE LARGE VIEW AT REST (owner, 2026-10-21: "keep it large and pannable in both axes"). It is the
   * framed view, shrunk no further than the width that keeps one cell at MIN_CELL_PX. A smaller box
   * is the same window aspect, so the SVG still fills the panel — it is a zoom-in, never a stretch.
   * Phones are the only place the cap binds; a wide screen's frame is already well above it.
   */
  private detailFor(aspect: number, pixelWidth: number): [number, number, number, number] | null {
    const frame = this.boundsFor(aspect);
    if (!frame || !(pixelWidth > 0)) return frame;
    const [fx, fy, fw, fh] = frame;
    const width = Math.min(fw, pixelWidth * (X * R) / MIN_CELL_PX);
    const height = width / aspect;
    return [fx + (fw - width) / 2, fy + (fh - height) / 2, width, height];
  }
  /**
   * The widest view that still draws one cell at MIN_CELL_PX, in world units. A view WIDER than this
   * would shrink the touch target below the owner's 44px minimum, so it is a hard limit of the large
   * view (FIT is exempt).
   */
  private cellFloor(): number {
    return this.pixels > 0 ? this.pixels * (X * R) / MIN_CELL_PX : Infinity;
  }
  /**
   * THE FIT VIEW: the smallest rect with the panel's own aspect that CONTAINS the whole fit box.
   * The silhouette is entirely on screen with `PAD` as a visible frame — hexes are small here, and
   * that is expected (the owner: "with a 'fit' toggle"). Used only while `fitted` is on.
   */
  private containFor(aspect: number): [number, number, number, number] | null {
    if (!this.fit || !Number.isFinite(aspect) || aspect <= 0) return null;
    const [fx, fy, fw, fh] = this.fit;
    let w = fw, h = fh;
    if (fw / fh > aspect) h = fw / aspect; else w = fh * aspect;
    return [fx + (fw - w) / 2, fy + (fh - h) / 2, w, h];
  }
  /**
   * The view's aspect is ALWAYS the panel's. A box measured a frame too early (the panel is a flex
   * child, so its height can change with the chrome under it) would make `preserveAspectRatio` centre
   * the map inside a box of the wrong shape — a letterbox band, the exact thing the owner rejected on
   * 2026-10-16. Keeping the box's WIDTH and re-deriving its height (about the same centre) is the
   * smallest correction: the pan's horizontal window is untouched.
   */
  private reconcile(box: [number, number, number, number] | null, aspect: number): [number, number, number, number] | null {
    if (!box || !(aspect > 0) || !(box[3] > 0)) return box;
    if (Math.abs(box[2] / box[3] - aspect) <= 0.002) return box;
    const height = box[2] / aspect;
    return [box[0], box[1] + (box[3] - height) / 2, box[2], height];
  }
  /**
   * Write the view. FIT is a pure viewBox change on the SAME svg: cell identity, `box` and
   * `touched` are untouched, so toggling back lands exactly where the player left the map. There is
   * no transition either way — a viewBox animation would be motion the owner did not ask for (and
   * the reduce-motion rule forbids adding it), so the switch is instant by construction.
   */
  private applyView(measure = true) {
    if (!this.svg) return;
    // The LIVE measured aspect, not a remembered one: see `reconcile`. A PAN passes `false`: the
    // panel cannot change shape between two pointer moves, and the ResizeObserver already refreshes
    // `this.aspect` when it does, so a drag does not force a layout read on every move — one style
    // write per frame, never a measure.
    const rect = measure ? this.svg.getBoundingClientRect() : null;
    const aspect = rect && rect.width > 0 && rect.height > 0 ? rect.width / rect.height : this.aspect;
    if (rect && aspect > 0) { this.aspect = aspect; this.pixels = rect.width; }
    const box = this.fitted ? this.containFor(aspect) : this.reconcile(this.box, aspect);
    const target = box ?? this.fit;
    if (target) this.svg.setAttribute('viewBox', target.join(' '));
  }
  /** The one control: FIT shows the whole silhouette; off is the large, pannable view. */
  private setFitted(on: boolean) {
    this.fitted = on;
    const button = document.getElementById('online-world-fit');
    button?.setAttribute('aria-pressed', String(on));
    document.getElementById('online-world-grid')?.classList.toggle('fitted', on);
    this.applyView();
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
    this.paintFrontier();
    this.paintAccent();
    this.paintSelection();
    // A challenged tile opens the challenge sheet; a rival tile on my frontier opens the challenge
    // offer. Everything else keeps the claim bar, so the map's original behaviour is unchanged.
    const challenge = challengeOnCell(this.allChallenges, cellId);
    if (challenge) return this.openChallengeSheet(challenge);
    if (this.isFrontier(cellId)) this.openSendSheet(cellId);
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
    label.textContent = available ? `FREE TILE · ${this.world.cost} SEEDS` : this.wallet && this.wallet.balance < this.world.cost ? '100 SEEDS NEEDED' : 'GROW NEXT TO YOUR TILES';
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
  // ---- the challenge layer -------------------------------------------------

  /**
   * THE FRONTIER mark. It appears only when a cell of MINE is selected: each rival tile that shares
   * a hex side with it gets a quietly lifted `--territory` edge and a small notched corner. No other
   * tile changes, so the map stays a map rather than becoming a wall of affordances.
   */
  private paintFrontier() {
    const group = this.marksGroup;
    if (!group || !this.world) return;
    group.replaceChildren();
    const me = this.identity?.playerId ?? null;
    const selected = this.selected;
    const selectedMine = !!me && !!selected &&
      this.world.claims.some((claim) => claim.cellId === selected && claim.ownerId === me);
    const frontier = new Set<string>();
    if (selectedMine && selected) {
      for (const id of worldNeighbours(selected)) {
        const claim = this.world.claims.find((candidate) => candidate.cellId === id);
        if (claim && claim.ownerId !== me) frontier.add(id);
      }
    }
    for (const path of this.svg?.querySelectorAll('.world-hex') ?? []) {
      path.classList.toggle('frontier', frontier.has(path.getAttribute('data-cell-id') ?? ''));
    }
    for (const id of frontier) {
      const cell = this.world.cells.find((candidate) => candidate.id === id);
      const claim = this.world.claims.find((candidate) => candidate.cellId === id);
      if (!cell || !claim) continue;
      const at = coords(cell.q, cell.r);
      // The top-right vertex of this tile: a small L inset from it reads as a notched corner.
      const vx = at.x + (X / 2) * R;
      const vy = at.y - 0.5 * R;
      const notch = document.createElementNS(NS, 'path');
      notch.setAttribute('d',
        `M${(vx - 2.6).toFixed(2)},${(vy + 0.15).toFixed(2)} ` +
        `L${(vx + 0.15).toFixed(2)},${(vy + 0.15).toFixed(2)} ` +
        `L${(vx + 0.15).toFixed(2)},${(vy + 2.6).toFixed(2)}`);
      notch.classList.add('world-frontier-mark');
      notch.style.setProperty('--territory', claim.colour);
      group.append(notch);
    }
  }

  /** A rival tile that shares a side with any of my cells can be challenged from the map. */
  private isFrontier(cellId: string): boolean {
    const me = this.identity?.playerId;
    if (!me || !this.world) return false;
    const claim = this.world.claims.find((candidate) => candidate.cellId === cellId);
    if (!claim || claim.ownerId === me) return false;
    return worldNeighbours(cellId).some((id) =>
      this.world!.claims.some((candidate) => candidate.cellId === id && candidate.ownerId === me));
  }

  /**
   * THE TIMER RING. One `stroke-dashoffset` on the cell's own six-point `hexPath`, `pathLength=1` so
   * no measurement is ever needed. Paths are REUSED between polls, so the CSS transition drains the
   * ring continuously; a ring whose challenge has closed collapses over 400 ms and is removed.
   */
  private paintRings() {
    const group = this.ringsGroup;
    if (!group || !this.world) return;
    const now = this.challengeNow();
    const open = this.allChallenges.filter((challenge) => challenge.status === 'pending');
    const byId = new Map(open.map((challenge) => [challenge.id, challenge]));
    for (const [id, entry] of [...this.ringPaths]) {
      if (byId.has(id)) continue;
      this.ringPaths.delete(id);
      entry.path.classList.add('done');
      entry.path.setAttribute('stroke-dashoffset', '1');
      setTimeout(() => entry.path.remove(), 450);
    }
    for (const challenge of open) {
      const cell = this.world.cells.find((candidate) => candidate.id === challenge.cellId);
      const claim = this.world.claims.find((candidate) => candidate.cellId === challenge.cellId);
      if (!cell || !claim) continue;
      let entry = this.ringPaths.get(challenge.id);
      if (!entry) {
        const at = coords(cell.q, cell.r);
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', hexPath(at.x, at.y));
        path.setAttribute('pathLength', '1');
        path.setAttribute('stroke-dasharray', '1');
        path.setAttribute('fill', 'none');
        path.classList.add('world-ring');
        path.setAttribute('data-challenge-id', challenge.id);
        path.setAttribute('data-cell-id', challenge.cellId);
        path.setAttribute('aria-hidden', 'true');
        group.append(path);
        entry = { path, challenge };
        this.ringPaths.set(challenge.id, entry);
      }
      entry.challenge = challenge;
      entry.path.style.setProperty('--territory', claim.colour);
      entry.path.setAttribute('stroke-dashoffset', String(1 - ringFraction(challenge, now)));
      entry.path.classList.toggle('low', isLow(challenge, now));
      entry.path.setAttribute('data-remaining-ms', String(Math.max(0, challenge.expiresAt - now)));
    }
  }

  /** The incoming/outgoing strip. Hidden when there is nothing to answer, so the map keeps its room. */
  private paintChallenges() {
    const strip = document.getElementById('online-world-challenges');
    if (!strip) return;
    const rows = this.allChallenges.slice(0, 8);
    strip.replaceChildren();
    if (rows.length === 0) {
      strip.hidden = true;
      strip.setAttribute('aria-label', CHALLENGE.listLabel);
      return;
    }
    strip.hidden = false;
    strip.setAttribute('aria-label', CHALLENGE.listLabel);
    const now = this.challengeNow();
    for (const challenge of rows) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'world-challenge-chip';
      chip.dataset.challengeId = challenge.id;
      chip.append(this.smallRing(challenge, now));
      const copy = document.createElement('span');
      copy.className = 'world-challenge-chip-copy';
      const head = document.createElement('strong');
      const other = challenge.fromMe ? challenge.defenderName : challenge.challengerName;
      head.textContent = `${challenge.fromMe ? CHALLENGE.outgoing : CHALLENGE.incoming} · ${other ?? 'Player'}`;
      const sub = document.createElement('span');
      sub.textContent = this.chipStatus(challenge, now);
      copy.append(head, sub);
      chip.append(copy);
      chip.setAttribute('aria-label', `${head.textContent}. ${sub.textContent}`);
      chip.addEventListener('click', () => this.openChallengeSheet(challenge));
      strip.append(chip);
    }
  }

  private chipStatus(challenge: WorldChallengeWire, now: number): string {
    switch (challenge.status) {
      case 'pending':
        return `${challenge.cellId} · ${CHALLENGE.remaining(remainingLabel(challenge.expiresAt - now))}`;
      case 'accepted':
        return `${challenge.cellId} · ${challenge.matchFinished ? CHALLENGE.ready : CHALLENGE.duel}`;
      case 'resolved':
        return `${challenge.cellId} · ${CHALLENGE.settledShort}`;
      case 'expired':
        return `${challenge.cellId} · ${CHALLENGE.forfeited}`;
      case 'stale':
        return `${challenge.cellId} · ${CHALLENGE.stale}`;
      default:
        return `${challenge.cellId} · ${CHALLENGE.declinedShort}`;
    }
  }

  /** The same ring at chip size: the cell's own hex outline, never a circle. */
  private smallRing(challenge: WorldChallengeWire, now: number): SVGSVGElement {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-12 -12 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('world-chip-ring');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', hexPath(0, 0));
    if (challenge.status === 'pending') {
      path.setAttribute('pathLength', '1');
      path.setAttribute('stroke-dasharray', '1');
      path.setAttribute('stroke-dashoffset', String(1 - ringFraction(challenge, now)));
      path.classList.add('world-chip-ring-path');
      path.classList.toggle('low', isLow(challenge, now));
    } else {
      path.classList.add('world-chip-hex');
    }
    const claim = this.world?.claims.find((candidate) => candidate.cellId === challenge.cellId);
    if (claim) path.style.setProperty('--territory', claim.colour);
    svg.append(path);
    return svg;
  }

  // ---- the two-state challenge sheet ---------------------------------------

  private ensureSheet(): NonNullable<WorldView['sheet']> {
    if (this.sheet) return this.sheet;
    const root = document.createElement('div');
    root.className = 'world-invitation world-challenge-sheet';
    root.hidden = true;
    const card = document.createElement('div');
    card.className = 'world-invitation-card world-challenge-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'world-challenge-title');
    const title = document.createElement('strong');
    title.id = 'world-challenge-title';
    title.textContent = CHALLENGE.title;
    const line = document.createElement('p');
    line.className = 'world-challenge-line';
    const meta = document.createElement('p');
    meta.className = 'world-challenge-meta';
    const keys = document.createElement('div');
    keys.className = 'world-challenge-keys';
    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'world-challenge-primary';
    const secondary = document.createElement('button');
    secondary.type = 'button';
    secondary.className = 'world-challenge-secondary';
    const notice = document.createElement('p');
    notice.className = 'world-challenge-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    keys.append(primary, secondary);
    card.append(title, line, meta, keys, notice);
    root.append(card);
    document.body.append(root);
    // Dismiss on POINTERDOWN, not click: the tap that opens the sheet is followed by a synthetic
    // click whose target is now this overlay, and a click listener would close it in the same
    // gesture. A pointerdown can only belong to a new touch.
    root.addEventListener('pointerdown', (event) => { if (event.target === root) this.closeSheet(); });
    primary.addEventListener('click', () => void this.sheetPrimary());
    secondary.addEventListener('click', () => this.sheetSecondary());
    this.sheet = { root, line, meta, primary, secondary, notice };
    return this.sheet;
  }

  private setSheetKeys(primary: string | null, secondary: string) {
    const sheet = this.ensureSheet();
    sheet.primary.hidden = primary === null;
    sheet.primary.textContent = primary ?? '';
    sheet.secondary.hidden = false;
    sheet.secondary.textContent = secondary;
    sheet.primary.disabled = false;
    sheet.secondary.disabled = false;
    this.sheetBusy = false;
  }

  private showSheet() {
    const sheet = this.ensureSheet();
    sheet.root.hidden = false;
    this.sheetReturnFocus = (document.activeElement as HTMLElement | null) ?? null;
    document.addEventListener('keydown', this.onSheetKey);
    const target = !sheet.primary.hidden ? sheet.primary : sheet.secondary;
    target.focus({ preventScroll: true });
  }

  private closeSheet(restoreFocus = true) {
    const sheet = this.sheet;
    if (!sheet) return;
    sheet.root.hidden = true;
    document.removeEventListener('keydown', this.onSheetKey);
    this.sheetMode = 'closed';
    this.sheetChallenge = null;
    this.sheetCellId = null;
    this.sheetRequestId = null;
    this.sheetBusy = false;
    if (restoreFocus && this.sheetReturnFocus?.isConnected) this.sheetReturnFocus.focus({ preventScroll: true });
    this.sheetReturnFocus = null;
  }

  /** The challenger's offer: one sentence, one primary key. */
  private openSendSheet(cellId: string) {
    const tile = this.world?.claims.find((claim) => claim.cellId === cellId);
    if (!tile || !this.identity) return;
    const sheet = this.ensureSheet();
    const stake = this.world?.cost ?? 100;
    this.sheetMode = 'send';
    this.sheetCellId = cellId;
    this.sheetChallenge = null;
    this.sheetRequestId = crypto.randomUUID();
    sheet.line.textContent = CHALLENGE.sendLine(tile.ownerName ?? 'Player', stake);
    sheet.meta.textContent = `${cellId} · ${stake} SEEDS`;
    sheet.notice.textContent = '';
    if (this.wallet && this.wallet.balance < stake) {
      this.setSheetKeys(null, CHALLENGE.notNow);
      sheet.notice.textContent = CHALLENGE.noFunds;
    } else {
      this.setSheetKeys(CHALLENGE.sendKey, CHALLENGE.notNow);
    }
    this.showSheet();
  }

  /** Every other state of the same sheet. The server's status chooses it; the client never guesses. */
  private openChallengeSheet(challenge: WorldChallengeWire) {
    const me = this.identity?.playerId;
    if (!me) return;
    const sheet = this.ensureSheet();
    this.sheetChallenge = challenge;
    this.sheetCellId = challenge.cellId;
    this.sheetRequestId = crypto.randomUUID();
    this.sheetMode = sheetModeFor(challenge, me);
    const now = this.challengeNow();
    const other = opponentName(challenge, me);
    sheet.notice.textContent = '';
    switch (this.sheetMode) {
      case 'defend':
        sheet.line.textContent = CHALLENGE.defendLine(challenge.challengerName ?? 'Player', challenge.stake);
        sheet.meta.textContent = CHALLENGE.stakeMeta(challenge.stake, remainingLabel(challenge.expiresAt - now));
        this.setSheetKeys(CHALLENGE.acceptKey, CHALLENGE.declineKey);
        break;
      case 'wait':
        sheet.line.textContent = CHALLENGE.waitLine(challenge.defenderName ?? 'Player');
        sheet.meta.textContent = CHALLENGE.remaining(remainingLabel(challenge.expiresAt - now));
        this.setSheetKeys(null, CHALLENGE.close);
        break;
      case 'duel':
        sheet.line.textContent = CHALLENGE.duelLine;
        sheet.meta.textContent = `${challenge.cellId} · ${other}`;
        this.setSheetKeys(CHALLENGE.openDuelKey, CHALLENGE.close);
        break;
      case 'confirm': {
        const winner = playerName(challenge, challenge.matchWinnerId);
        if (winner === null) {
          sheet.line.textContent = CHALLENGE.drawLine;
          this.setSheetKeys(CHALLENGE.drawKey, CHALLENGE.notNow);
        } else {
          sheet.line.textContent = CHALLENGE.confirmLine(winner);
          this.setSheetKeys(CHALLENGE.takeKey, CHALLENGE.notNow);
        }
        sheet.meta.textContent = `${challenge.cellId} · ${challenge.stake} SEEDS`;
        break;
      }
      case 'resolved':
        sheet.line.textContent = CHALLENGE.resolvedLine(winnerName(challenge));
        sheet.meta.textContent = challenge.cellId;
        this.setSheetKeys(null, CHALLENGE.close);
        break;
      default:
        sheet.line.textContent = CHALLENGE.closedLine;
        sheet.meta.textContent = challenge.cellId;
        this.setSheetKeys(null, CHALLENGE.close);
    }
    this.showSheet();
  }

  private async sheetPrimary(): Promise<void> {
    if (this.sheetBusy) return;
    switch (this.sheetMode) {
      case 'send': return this.sheetSend();
      case 'defend': return this.sheetRespond(true);
      case 'confirm': return this.sheetConfirm();
      case 'duel': {
        const matchId = this.sheetChallenge?.matchId;
        this.closeSheet();
        if (matchId) this.matchOpener?.(matchId);
        return;
      }
      default: return;
    }
  }

  private sheetSecondary(): void {
    if (this.sheetMode === 'defend') return void this.sheetRespond(false);
    this.closeSheet();
  }

  private async runSheet(work: () => Promise<void>, failure: string): Promise<void> {
    const sheet = this.sheet;
    if (!sheet || this.sheetBusy) return;
    this.sheetBusy = true;
    sheet.primary.disabled = true;
    sheet.secondary.disabled = true;
    sheet.notice.textContent = '';
    try {
      await work();
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      sheet.notice.textContent =
        code === 'NO_FUNDS' ? CHALLENGE.noFunds :
          code === 'CELL_BUSY' ? CHALLENGE.busy : failure;
    } finally {
      this.sheetBusy = false;
      if (this.sheet) {
        this.sheet.primary.disabled = false;
        this.sheet.secondary.disabled = false;
      }
    }
  }

  private async sheetSend(): Promise<void> {
    const me = this.identity;
    const cellId = this.sheetCellId;
    if (!me || !cellId) return;
    this.sheetRequestId ??= crypto.randomUUID();
    const requestId = this.sheetRequestId;
    await this.runSheet(async () => {
      await this.client.sendWorldChallenge(me.token, cellId, requestId);
      this.notice(CHALLENGE.sent);
      this.closeSheet();
      await this.refresh(true);
    }, CHALLENGE.sendFailed);
  }

  private async sheetRespond(accept: boolean): Promise<void> {
    const me = this.identity;
    const challenge = this.sheetChallenge;
    if (!me || !challenge) return;
    await this.runSheet(async () => {
      const result = await this.client.respondWorldChallenge(me.token, challenge.id, accept, this.sheetRequestId ?? undefined);
      this.closeSheet();
      await this.refresh(true);
      if (accept && result.matchId) this.matchOpener?.(result.matchId);
    }, CHALLENGE.answerFailed);
  }

  private async sheetConfirm(): Promise<void> {
    const me = this.identity;
    const challenge = this.sheetChallenge;
    if (!me || !challenge) return;
    this.sheetRequestId ??= crypto.randomUUID();
    const requestId = this.sheetRequestId;
    await this.runSheet(async () => {
      const result = await this.client.confirmWorldChallenge(me.token, challenge.id, requestId);
      this.notice(result.settled
        ? (result.winnerId === me.playerId ? CHALLENGE.settled : CHALLENGE.resultSettled)
        : CHALLENGE.alreadySettled);
      this.closeSheet();
      await this.refresh(true);
    }, CHALLENGE.confirmFailed);
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
      // As far in as a quarter of the framed view — but never so far that the 44px floor could not be
      // drawn: on a narrow (landscape-phone) window a quarter is still wider than one cell at 46px.
      const closest = Math.min(frame[2] / 4, this.cellFloor());
      this.box[2] = Math.max(closest, Math.min(frame[2], this.box[2]));
      this.box[3] = this.box[2] / aspect;
      // Panning clamps to the FIT BOX, which carries `PAD` on every side: the outermost column/row
      // can therefore come fully inside the panel, clear of its rounded corner, on both axes.
      this.box[0] = Math.max(fx, Math.min(fx + fw - this.box[2], this.box[0]));
      this.box[1] = Math.max(fy, Math.min(fy + fh - this.box[3], this.box[1]));
      // A pan never re-measures: `this.aspect` is kept by the ResizeObserver (and by open/repaint).
      this.applyView(false);
    };
    const zoom = (scale: number, x: number, y: number) => {
      if (!this.box || !this.fit || this.fitted) return;
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
    /**
     * A TAP RESOLVES TO THE CELL THE FINGER IS NEAREST (owner, 2026-10-21). The large view already
     * draws a cell at MIN_CELL_PX, so a hex is its own >=44px target; this is the second half of the
     * guarantee — a tap in the padding, between two cells, or anywhere in the small FIT view still
     * selects the nearest cell and never nothing. Nearest CENTRE is the honest rule: the hexagons
     * tile the plane, so "nearest centre" is the cell under the finger, and a shared edge cannot pick
     * an arbitrary neighbour from DOM paint order.
     */
    const tapAt = (event: PointerEvent) => {
      const cells = this.world?.cells;
      if (!cells?.length) return;
      // The box ACTUALLY on screen, read from the SVG: it is the only mapping that cannot disagree
      // with what the finger saw (FIT, pan and the aspect correction all land in this attribute).
      const box = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
      if (box.length !== 4 || box.some((value) => !Number.isFinite(value))) return;
      const rect = svg.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) return;
      const wx = box[0]! + (event.clientX - rect.left) / rect.width * box[2]!;
      const wy = box[1]! + (event.clientY - rect.top) / rect.height * box[3]!;
      let best: string | null = null;
      let bestDistance = Infinity;
      for (const cell of cells) {
        const at = coords(cell.q, cell.r);
        const distance = (at.x - wx) ** 2 + (at.y - wy) ** 2;
        if (distance < bestDistance) { bestDistance = distance; best = cell.id; }
      }
      if (best) this.select(best);
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
        // FIT mode is a preview of the whole silhouette: a drag there must not move the saved view,
        // so the finger can still be lifted without selecting a tile.
        if (!this.fitted) {
          this.touched = true;
          // Capturing on pointerdown retargets a touch tap's click to the SVG,
          // so a tile never receives it. Capture only once the gesture is a pan.
          if (!svg.hasPointerCapture(event.pointerId)) svg.setPointerCapture(event.pointerId);
        }
      }
      if (this.fitted) {
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        return;
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
    svg.addEventListener('pointerup', (event) => {
      end(event);
      // A tap, not the end of a pan: select the nearest cell. (Mouse's right/middle buttons and a
      // second finger are not taps.)
      if (!this.dragged && event.button === 0) tapAt(event);
      this.dragged = false;
    });
    svg.addEventListener('pointercancel', (event) => { end(event); this.dragged = false; });
    // Re-frame when the WINDOW changes shape (a phone rotating, the on-screen keyboard, a notice line
    // changing the column's chrome). Untouched: the view follows the new frame exactly. Touched: the
    // player's zoom level is kept and re-derived at the new aspect, so the view stays band-free.
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => {
        const r = svg.getBoundingClientRect();
        const aspect = r.height > 0 ? r.width / r.height : 0;
        const next = this.boundsFor(aspect);
        if (!next || !this.box) return;
        const prev = this.bounds;
        this.aspect = aspect;
        this.pixels = r.width;
        this.bounds = next;
        if (!this.touched || !prev) {
          // The large view is re-derived too, so a rotated phone keeps the 44px floor.
          this.box = [...(this.detailFor(aspect, r.width) ?? next)];
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
