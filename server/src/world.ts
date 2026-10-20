/** Frozen shared world geometry. IDs are axial coordinates; expansion only ADDS IDs. */
export type WorldCell = { id: string; q: number; r: number };

// v2 (2026-10-21, owner's Territory brief): the v1 landmass grew by ~50% to 275 cells along an
// irregular edge. The table below is the whole map, v1 and growth together, so nothing is computed
// at runtime and two servers can never disagree about the shape.
//
// How it was produced (scripts/gen-world-v2.mjs, committed with it):
//   · v1 is WIDTHS/SHIFT, exactly as it was — every v1 id is still here, unchanged, so a claim
//     keyed by a cell id can never be orphaned by this change;
//   · candidates were the cells within two steps of v1, ranked by a fixed integer hash of their own
//     coordinate;
//   · a candidate was added only once it touched at least TWO cells of the map, which makes the
//     silhouette irregular (it follows the hash, not a ring) while guaranteeing that the map stays
//     connected and can never grow a one-cell spur;
//   · the loop stopped at 275 cells.
// The result is verified by tests (v1 subset, connected, no tails, irregular, unique ids).
export const WORLD_VERSION = 2;

/** Row r, then every q present in that row. Rows run from the top of the map to the bottom. */
const ROWS: readonly (readonly [number, readonly number[]])[] = Object.freeze([
  [-10, [2,4,7]],
  [-9, [-1,0,1,2,3,4,5,6,7,8]],
  [-8, [-2,-1,0,1,2,3,4,5,6,7,8]],
  [-7, [-3,-2,-1,0,1,2,3,4,5,6,7,8,9]],
  [-6, [-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9]],
  [-5, [-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9]],
  [-4, [-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9]],
  [-3, [-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8]],
  [-2, [-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8]],
  [-1, [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8]],
  [0, [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8]],
  [1, [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7]],
  [2, [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6]],
  [3, [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6]],
  [4, [-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5]],
  [5, [-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3]],
  [6, [-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2]],
  [7, [-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1]],
  [8, [-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0]],
  [9, [-9,-8,-7,-6,-5,-3]],
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
