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
