import { hexDistance, parseWorldCell } from '../world.js';

/**
 * WHICH TILE THE CHALLENGER PUTS AT STAKE (owner, 2026-10-29: "challenging is like putting your tile
 * at stake ... make challenging free"). One rule, one answer, with no tile-picker step:
 *
 *   the challenger's OWN tile NEAREST the contested tile.
 *
 * Ties are broken by the cell id in byte order (the lowest id wins), so the same claim set and the
 * same request always stake the same tile — on the server, in the in-memory test store, and in the
 * client's preview sentence. This is the ONE definition: `memory.ts` and `postgres.ts` both call it,
 * and `web/src/online/world-view.ts` calls it to name the tile before the send.
 *
 * `null` means the player holds no tile at all, which the service refuses as `NO_TILE`. (A challenger
 * normally has one anyway — the contested tile must share a side with their land — but the rule is
 * stated once here instead of relying on adjacency to imply it.)
 */
export type StakeClaim = { cellId: string; ownerId: string };

export const stakedCellFor = (
  challengerId: string,
  contestedCellId: string,
  claims: Iterable<StakeClaim>,
): string | null => {
  const target = parseWorldCell(contestedCellId);
  if (!target) return null;
  const own: { id: string; distance: number }[] = [];
  for (const claim of claims) {
    if (claim.ownerId !== challengerId) continue;
    const cell = parseWorldCell(claim.cellId);
    if (!cell) continue;
    own.push({ id: claim.cellId, distance: hexDistance(cell.q - target.q, cell.r - target.r) });
  }
  own.sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return own[0]?.id ?? null;
};
