import type { DuelClient } from '../../../server/src/client.js';
import type { WorldMapPayload } from '../../../server/src/protocol.js';
import type { SeedWallet } from '../../../server/src/seeds/types.js';
import { seedIcon } from './seed-icon.js';

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
  private box: [number, number, number, number] | null = null;
  private fit: [number, number, number, number] | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragged = false;

  constructor(private readonly client: DuelClient, private readonly ensureIdentity: () => Promise<Identity | null>) {
    document.addEventListener('visibilitychange', () => { if (this.active && !document.hidden) void this.refresh(); });
  }

  async open() {
    this.active = true;
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
    node.append(seedIcon(22), document.createTextNode(this.wallet ? `${this.wallet.balance} SEEDS` : 'SIGN IN TO CLAIM'));
    const summary = document.getElementById('online-world-summary')!;
    summary.textContent = this.world ? `${this.world.claims.length} / ${this.world.cells.length} claimed · one shared world` : '';
  }
  private paint() {
    const container = document.getElementById('online-world-grid')!;
    const world = this.world!;
    const occupied = new Map(world.claims.map((claim) => [claim.cellId, claim]));
    const own = new Set(world.claims.filter((claim) => claim.ownerId === this.identity?.playerId).map((claim) => claim.cellId));
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Shared hexagonal world. Choose a tile to inspect it.');
    svg.classList.add('world-map-svg');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cell of world.cells) {
      const at = coords(cell.q, cell.r);
      minX = Math.min(minX, at.x - R); maxX = Math.max(maxX, at.x + R);
      minY = Math.min(minY, at.y - R); maxY = Math.max(maxY, at.y + R);
      const owner = occupied.get(cell.id);
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', hexPath(at.x, at.y));
      path.setAttribute('data-cell-id', cell.id);
      path.setAttribute('data-owner-id', owner?.ownerId ?? '');
      path.classList.add('world-hex');
      if (owner) {
        path.classList.add(owner.ownerId === this.identity?.playerId ? 'mine' : 'held');
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
      svg.append(path);
    }
    if (!this.fit) this.fit = [minX - 6, minY - 6, maxX - minX + 12, maxY - minY + 12];
    if (!this.box) this.box = [...this.fit];
    svg.setAttribute('viewBox', this.box.join(' '));
    this.installPanZoom(svg);
    container.replaceChildren(svg);
    this.svg = svg;
  }
  private select(cellId: string) {
    this.selected = cellId;
    this.pendingRequest = null;
    const owner = this.world?.claims.find((claim) => claim.cellId === cellId)?.ownerId;
    for (const path of this.svg?.querySelectorAll('.world-hex') ?? []) {
      path.classList.toggle('selected', path.getAttribute('data-cell-id') === cellId);
      path.classList.toggle('same-owner', !!owner && path.getAttribute('data-owner-id') === owner);
    }
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
      pane.textContent = `${tile.ownerName ?? 'Player'} #${tile.ownerTag}${tile.ownerId === this.identity?.playerId ? ' · YOUR TERRITORY' : ''}`;
      return;
    }
    const label = document.createElement('span');
    const available = this.svg?.querySelector(`.world-hex[data-cell-id="${this.selected}"]`)?.classList.contains('available');
    label.textContent = available ? `FREE HEX · ${this.world.cost} SEEDS` : this.wallet && this.wallet.balance < this.world.cost ? '100 SEEDS NEEDED' : 'GROW NEXT TO YOUR TERRITORY';
    pane.append(label);
    if (!available || this.busy) return;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'world-claim-button';
    action.textContent = confirm ? 'CONFIRM CLAIM' : 'CLAIM HEX';
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
      this.notice('That hex may have changed. The map has refreshed; no Seeds were taken.');
      this.pendingRequest = null;
      await this.refresh(true);
    } finally { this.busy = false; this.paintSelection(); }
  }
  private installPanZoom(svg: SVGSVGElement) {
    const set = () => { if (this.box) svg.setAttribute('viewBox', this.box.join(' ')); };
    const zoom = (scale: number, x: number, y: number) => {
      if (!this.box || !this.fit) return;
      const [bx, by, bw, bh] = this.box;
      const rect = svg.getBoundingClientRect();
      const fx = (x - rect.left) / rect.width, fy = (y - rect.top) / rect.height;
      const width = Math.max(this.fit[2] / 4, Math.min(this.fit[2], bw / scale));
      const height = width * this.fit[3] / this.fit[2];
      this.box = [bx + fx * (bw - width), by + fy * (bh - height), width, height];
      set();
    };
    svg.addEventListener('wheel', (event) => {
      event.preventDefault(); zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
    }, { passive: false });
    svg.addEventListener('pointerdown', (event) => { this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); this.dragged = false; });
    svg.addEventListener('pointermove', (event) => {
      const old = this.pointers.get(event.pointerId);
      if (!old || !this.box) return;
      const dx = event.clientX - old.x, dy = event.clientY - old.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.dragged = true;
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
  }
}
