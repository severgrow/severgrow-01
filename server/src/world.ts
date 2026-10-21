/** Frozen shared world geometry. IDs are axial coordinates; expansion only ADDS IDs. */
export type WorldCell = { id: string; q: number; r: number };

// v2 (2026-10-21, owner's Territory brief): v1's landmass grew by ~50% to 274 cells along a COASTLINE.
// The table below is the whole map, v1 and growth together, so nothing is computed at runtime and two
// servers can never disagree about the shape.
//
// How it was produced (scripts/gen-world-v2.mjs, committed with it):
//   · v1 is WIDTHS/SHIFT, exactly as it was — every v1 id is still here, unchanged, so a claim keyed
//     by a cell id can never be orphaned by this change;
//   · the ring around v1 is land all the way round; the ring outside it is land only between three
//     DELIBERATE BAYS, which are held back in both rings so the sea cuts into the shore;
//   · a cell is added only with at least TWO neighbours already in the map, and never in a position
//     that leaves a LONE TOOTH (one cell alone in its row with land above or below it) — the comb the
//     owner rejected. A cell that would leave one is added only together with an adjacent partner;
//   · candidates are scored by how many neighbours they already have, so 3+ neighbour cells are taken
//     before 2-neighbour ones: the edge grows in RUNS, not pimples. The fixed hash only breaks ties.
// The result is verified by tests (v1 subset, connected, >=2 neighbours each, no lone teeth, a
// coastline profile and the panel's near-square ratio).
export const WORLD_VERSION = 2;

/** Row r, then every q present in that row. Rows run from the top of the map to the bottom. */
const ROWS: readonly (readonly [number, readonly number[]])[] = Object.freeze([
  [-10, [3,4,5,6,7,8]],
  [-9, [2,3,4,5,6,7,8]],
  [-8, [1,2,3,4,5,6,7,8,9]],
  [-7, [-3,-2,-1,0,1,2,3,4,5,6,7,8,9]],
  [-6, [-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9]],
  [-5, [-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9]],
  [-4, [-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9]],
  [-3, [-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8]],
  [-2, [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8]],
  [-1, [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8]],
  [0, [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8]],
  [1, [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7]],
  [2, [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7]],
  [3, [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6]],
  [4, [-8,-7,-6,-5,-4,-3,-2,-1,0,1,2]],
  [5, [-8,-7,-6,-5,-4,-3,-2,-1,0,1]],
  [6, [-8,-7,-6,-5,-4,-3,-2,-1,0,1]],
  [7, [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1]],
  [8, [-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0]],
  [9, [-10,-9,-8,-7,-6,-5,-4,-3,-2,-1]],
  [10, [-9,-8,-7,-6,-5,-4,-3,-2]],
 ] as const);

export const WORLD_CELLS: readonly WorldCell[] = Object.freeze(ROWS.flatMap(([r, qs]) =>
  qs.map((q) => Object.freeze({ id: `${q},${r}`, q, r }))));

export const WORLD_CELL_IDS: ReadonlySet<string> = new Set(WORLD_CELLS.map((cell) => cell.id));
const CELL_BY_ID = new Map(WORLD_CELLS.map((cell) => [cell.id, cell]));
export const worldCell = (id: string): WorldCell | null => CELL_BY_ID.get(id) ?? null;
export const worldNeighbours = (id: string): string[] => {
  const cell = worldCell(id);
  if (!cell) return [];
  return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
    .map(([dq, dr]) => `${cell.q + dq!},${cell.r + dr!}`)
    .filter((key) => WORLD_CELL_IDS.has(key));
};

/** Stable mapping for the 64 historical automatically awarded cells. Unchanged in v2. */
export const legacyWorldCell = (oldCell: number): string => `${oldCell % 8 - 4},${Math.floor(oldCell / 8) - 4}`;

/** Presentation only: names may change, identity and colour do not. */
export const territoryColour = (playerId: string): string => {
  let hash = 2166136261;
  for (const character of playerId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `hsl(${(hash >>> 0) % 360} 34% 49%)`;
};
