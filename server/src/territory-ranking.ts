import { worldNeighbours } from './world.js';
export type TerritoryStanding = { ownerId: string; connectedTiles: number; totalTiles: number; rank: number };
type Claim = { cellId: string; ownerId: string; claimedAt?: number };
/** One ownership snapshot, one O(n) traversal. Side neighbours only; never a query per tile/player.
 * Equal scores keep the older holding first, then compare ids without locale-dependent sorting. */
export const territoryStandings = (claims: readonly Claim[]): TerritoryStanding[] => {
  const cells = new Map(claims.map(c => [c.cellId, c]));
  const remaining = new Set(cells.keys());
  const owners = new Map<string, { total: number; connected: number; last: number }>();
  for (const c of cells.values()) {
    const row = owners.get(c.ownerId) ?? { total: 0, connected: 0, last: 0 };
    row.total++; row.last = Math.max(row.last, c.claimedAt ?? 0); owners.set(c.ownerId, row);
  }
  for (const root of cells.values()) {
    if (!remaining.delete(root.cellId)) continue;
    const group = [root.cellId];
    for (let i = 0; i < group.length; i++) for (const id of worldNeighbours(group[i]!)) {
      if (remaining.has(id) && cells.get(id)?.ownerId === root.ownerId) { remaining.delete(id); group.push(id); }
    }
    const row = owners.get(root.ownerId)!; row.connected = Math.max(row.connected, group.length);
  }
  return [...owners].sort(([a, x], [b, y]) => y.connected - x.connected || x.last - y.last || (a < b ? -1 : a > b ? 1 : 0))
    .map(([ownerId, row], i) => ({ ownerId, connectedTiles: row.connected, totalTiles: row.total, rank: i + 1 }));
};
export const connectedCount = (ids: readonly string[]): number =>
  territoryStandings(ids.map(cellId => ({ cellId, ownerId: 'owner' })))[0]?.connectedTiles ?? 0;
