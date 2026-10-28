// THE GROWING TERRITORY, the page's side (owner, 2026-10-27). Pure helpers for world-view.ts: the
// fog of undiscovered land beyond the coast, the players' ranking, the recent-activity strip,
// "find my land", and which cells appeared since the last look (they rise in).
import { worldAround } from '../../../server/src/world.js';

type Claim = { cellId: string; ownerId: string; ownerName: string | null; ownerTag: string; colour: string; claimedAt: number };
type Cell = { id: string; q: number; r: number };

const R = 10;
const X = Math.sqrt(3);
/** The map's own coordinates for a cell (the same formula world-view.ts draws with). */
export const cellXY = (q: number, r: number) => ({ x: X * (q + r / 2) * R, y: 1.5 * r * R });

/** Hidden land within two of the seen map: 1 for the ring touching the coast, 2 for the next. */
export const fogRings = (seen: ReadonlySet<string>): Map<string, 1 | 2> => {
  const fog = new Map<string, 1 | 2>();
  for (const id of seen) {
    for (const near of worldAround(id, 1)) if (!seen.has(near)) fog.set(near, 1);
  }
  for (const id of [...fog.keys()]) {
    for (const near of worldAround(id, 1)) if (!seen.has(near) && !fog.has(near)) fog.set(near, 2);
  }
  return fog;
};

export type RankRow = { ownerId: string; name: string; tag: string; colour: string; tiles: number; rank: number; mine: boolean };

/** Players by tiles held; on a tie, whoever reached that count first (their latest tile is older). */
export const ranking = (claims: readonly Claim[], me: string | null): RankRow[] => {
  const by = new Map<string, { claim: Claim; tiles: number; last: number }>();
  for (const c of claims) {
    const row = by.get(c.ownerId);
    if (row) {
      row.tiles++;
      row.last = Math.max(row.last, c.claimedAt);
      if (c.ownerName) row.claim = c;
    } else by.set(c.ownerId, { claim: c, tiles: 1, last: c.claimedAt });
  }
  return [...by.entries()]
    .sort(([, a], [, b]) => b.tiles - a.tiles || a.last - b.last)
    .map(([ownerId, row], i) => ({
      ownerId,
      name: row.claim.ownerName ?? 'Player',
      tag: row.claim.ownerTag,
      colour: row.claim.colour,
      tiles: row.tiles,
      rank: i + 1,
      mine: ownerId === me,
    }));
};

/** "NOW", "2M", "3H", "2D". */
export const agoLabel = (ms: number): string => {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  if (m < 1) return 'NOW';
  if (m < 60) return `${m}M`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}H`;
  return `${Math.floor(h / 24)}D`;
};

export type Activity = { cellId: string; ownerId: string; name: string; colour: string; ago: string };

/** The newest placements, at most five. */
export const recentActivity = (claims: readonly Claim[], now: number, limit = 5): Activity[] =>
  [...claims]
    .sort((a, b) => b.claimedAt - a.claimedAt)
    .slice(0, limit)
    .map((c) => ({ cellId: c.cellId, ownerId: c.ownerId, name: c.ownerName ?? 'Player', colour: c.colour, ago: agoLabel(now - c.claimedAt) }));

/** The middle of my tiles in map units, or null when I hold none. */
export const ownCentre = (cells: readonly Cell[], claims: readonly Claim[], me: string | null): { x: number; y: number } | null => {
  if (!me) return null;
  const mine = new Set(claims.filter((c) => c.ownerId === me).map((c) => c.cellId));
  const pts = cells.filter((c) => mine.has(c.id)).map((c) => cellXY(c.q, c.r));
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
};

/** Cells that were not on the map at the last look (none on the first look). */
export const newCellIds = (before: ReadonlySet<string> | null, now: readonly string[]): string[] =>
  before ? now.filter((id) => !before.has(id)) : [];

/** The fog's two rings, exactly as `fogRings` labels them. */
export type FogRing = 1 | 2;

/**
 * WHAT THE MIST DOES BETWEEN TWO LOOKS (owner, 2026-10-28: "the way the empty tiles around the
 * 'discovered' is changing colors, shading ... make it smooth more transition like rather than
 * sudden changes").
 *
 * `fogRings` is a snapshot, and the map is REBUILT on every paint, so the old mist nodes cannot
 * animate out: the view keeps the previous snapshot instead and asks for this diff. Three things
 * can happen to a cell's mist, and each gets its own half of the hand-off:
 *
 * - `lift`:   the cell is land now — its last mist fades off the top of the new face.
 * - `deepen`: the coast reached it (ring 2 → ring 1) — its old shade fades out while the new,
 *             darker shade fades in, so the empty ring never flips brightness in one frame.
 * - `arrive`: it is in the new outer ring — its mist fades up instead of appearing at full strength.
 *
 * `animated` is the Reduce-motion gate. With motion off the answer is empty and the map is simply
 * drawn in its settled state, which is also the honest answer for the very first look.
 */
export type FogShift = {
  lift: { id: string; ring: FogRing }[];
  deepen: { id: string; from: FogRing; to: FogRing }[];
  arrive: { id: string; ring: FogRing }[];
};

export const emptyFogShift = (): FogShift => ({ lift: [], deepen: [], arrive: [] });

/** Ids compared as text, not by locale, so the DOM order is the same on every machine. */
const byCellId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * THE FOG THE EYE WAS SEEING, rebuilt from data. `settled` is the fog drawn in the ambient rings at
 * the last paint; `inFlight` is the hand-off that had not finished. A repaint inside the hand-off is
 * therefore not a cut: the outgoing mist keeps its old ring, a deepening cell is compared against
 * the shade it still wears, and a mist that was still fading IN is removed from the "before" so it
 * keeps fading in rather than appearing settled.
 */
export const fogAtLastLook = (
  settled: ReadonlyMap<string, FogRing> | null,
  inFlight: FogShift | null,
): Map<string, FogRing> | null => {
  if (!settled) return null;
  const before = new Map(settled);
  if (!inFlight) return before;
  for (const cell of inFlight.lift) before.set(cell.id, cell.ring);
  for (const cell of inFlight.deepen) before.set(cell.id, cell.from);
  for (const cell of inFlight.arrive) before.delete(cell.id);
  return before;
};

export const fogShift = (
  before: ReadonlyMap<string, FogRing> | null,
  after: ReadonlyMap<string, FogRing>,
  animated = true,
): FogShift => {
  const shift = emptyFogShift();
  if (!before || !animated) return shift;
  for (const [id, ring] of before) {
    const now = after.get(id);
    if (now === undefined) shift.lift.push({ id, ring });
    else if (now !== ring) shift.deepen.push({ id, from: ring, to: now });
  }
  for (const [id, ring] of after) if (!before.has(id)) shift.arrive.push({ id, ring });
  shift.lift.sort(byCellId);
  shift.deepen.sort(byCellId);
  shift.arrive.sort(byCellId);
  return shift;
};

/**
 * THE PHASE OF A LOOPING ANIMATION, as a negative `animation-delay`. A rebuilt map is a new node, so
 * its 9 s / 13 s fog breath would otherwise restart at full strength on every repaint — a shade
 * jump over the WHOLE map each time anyone grows a tile, which is the other half of the owner's
 * "sudden changes". Feeding elapsed time back into the delay keeps the breath where the eye left it.
 */
export const loopPhase = (elapsedMs: number, periodMs: number): string => {
  const period = periodMs > 0 ? periodMs : 1;
  const elapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0;
  const at = ((elapsed % period) + period) % period;
  return `-${(at / 1000).toFixed(2)}s`;
};

export type Standing = { rank: number; tiles: number; players: number; next: { name: string; tiles: number; gap: number } | null };

/** Where the viewer stands, and how many more tiles pass the player just above (a tie keeps the earlier one ahead). */
export const standing = (rows: readonly RankRow[]): Standing | null => {
  const at = rows.findIndex((row) => row.mine);
  if (at < 0) return null;
  const me = rows[at]!;
  const above = at > 0 ? rows[at - 1]! : null;
  return {
    rank: me.rank,
    tiles: me.tiles,
    players: rows.length,
    next: above ? { name: above.name, tiles: above.tiles, gap: above.tiles - me.tiles + 1 } : null,
  };
};

/** The six corners of a pointy hex (unit radius), clockwise from the top — world-view's `hexPath`. */
const CORNERS = [[0, -1], [X / 2, -0.5], [X / 2, 0.5], [0, 1], [-X / 2, 0.5], [-X / 2, -0.5]] as const;
/** The neighbour across side i (corner i → corner i+1). */
const ACROSS = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]] as const;

/** The outline of a set of tiles: every side that does not face another tile of the set. */
export const borderSegments = (cells: readonly { q: number; r: number }[]): [number, number, number, number][] => {
  const own = new Set(cells.map((cell) => `${cell.q},${cell.r}`));
  const out: [number, number, number, number][] = [];
  for (const cell of cells) {
    const { x, y } = cellXY(cell.q, cell.r);
    for (let i = 0; i < 6; i++) {
      const [dq, dr] = ACROSS[i]!;
      if (own.has(`${cell.q + dq},${cell.r + dr}`)) continue;
      const a = CORNERS[i]!, b = CORNERS[(i + 1) % 6]!;
      out.push([x + a[0] * R, y + a[1] * R, x + b[0] * R, y + b[1] * R]);
    }
  }
  return out;
};

export type Patch = { cellIds: string[]; tiles: number; centre: { x: number; y: number } };

/** The separate patches of my land (tiles that touch), the biggest first; a tie, the earlier grown first. */
export const ownPatches = (cells: readonly Cell[], claims: readonly Claim[], me: string | null): Patch[] => {
  if (!me) return [];
  const when = new Map(claims.filter((c) => c.ownerId === me).map((c) => [c.cellId, c.claimedAt] as const));
  const mine = cells.filter((c) => when.has(c.id));
  const byId = new Map(mine.map((c) => [c.id, c] as const));
  const seen = new Set<string>();
  const out: (Patch & { first: number })[] = [];
  for (const start of mine) {
    if (seen.has(start.id)) continue;
    const group: Cell[] = [];
    const stack = [start];
    seen.add(start.id);
    while (stack.length) {
      const cell = stack.pop()!;
      group.push(cell);
      for (const [dq, dr] of ACROSS) {
        const near = byId.get(`${cell.q + dq},${cell.r + dr}`);
        if (near && !seen.has(near.id)) { seen.add(near.id); stack.push(near); }
      }
    }
    const pts = group.map((c) => cellXY(c.q, c.r));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    out.push({
      cellIds: group.map((c) => c.id),
      tiles: group.length,
      centre: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 },
      first: Math.min(...group.map((c) => when.get(c.id)!)),
    });
  }
  return out.sort((a, b) => b.tiles - a.tiles || a.first - b.first).map(({ first: _first, ...patch }) => patch);
};
