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
/** v3 (2026-10-27): the map grows around its tiles (see `seenWorld`). v2 ids are all still land. */
export const WORLD_VERSION = 3;

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

/** The v2 coastline: the land every player saw before the map started to grow. */
export const WORLD_CELL_IDS: ReadonlySet<string> = new Set(WORLD_CELLS.map((cell) => cell.id));

// ---- v3: THE MAP GROWS (owner, 2026-10-27) ---------------------------------------------------------
//
// "There's never a tile at the edge because the map is always expanding when someone is placing a tile
// next to the edge ... have the map underneath it, but leave whatever you can see right now and
// uncover parts of the map tile by tile."
//
// The land UNDERNEATH is every hex within WORLD_LIMIT of the centre. What anyone can SEE (and grow on)
// is the v2 coastline plus every hex within WORLD_REACH of a grown tile. Nothing is stored: the seen
// map is a pure function of the claims, so the server and every client always agree on it, and a new
// tile near the coast uncovers the land around it the moment it is grown. A tile can never be grown
// on land nobody can see, so the coast always stays WORLD_REACH hexes beyond the nearest tile.
export const WORLD_REACH = 2;
/** The land underneath: hex distance from the centre. Far beyond any realistic growth. */
export const WORLD_LIMIT = 48;

const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const;
export const hexDistance = (q: number, r: number): number => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

/** `q,r` → the cell, when it names land in the world underneath; null otherwise. */
export const parseWorldCell = (id: string): WorldCell | null => {
  const m = /^(-?\d{1,3}),(-?\d{1,3})$/.exec(id);
  if (!m) return null;
  const q = Number(m[1]), r = Number(m[2]);
  if (`${q},${r}` !== id || hexDistance(q, r) > WORLD_LIMIT) return null;
  return { id, q, r };
};
export const worldCell = (id: string): WorldCell | null => parseWorldCell(id);
/** The neighbours of a cell, in the world underneath (seen or not). */
export const worldNeighbours = (id: string): string[] => {
  const cell = parseWorldCell(id);
  if (!cell) return [];
  return DIRECTIONS
    .map(([dq, dr]) => `${cell.q + dq},${cell.r + dr}`)
    .filter((key) => parseWorldCell(key) !== null);
};

/** Every hex within `reach` of a cell (the cell included), in the world underneath. */
export const worldAround = (id: string, reach: number = WORLD_REACH): string[] => {
  const cell = parseWorldCell(id);
  if (!cell) return [];
  const out: string[] = [];
  for (let dq = -reach; dq <= reach; dq++) {
    for (let dr = Math.max(-reach, -dq - reach); dr <= Math.min(reach, -dq + reach); dr++) {
      const key = `${cell.q + dq},${cell.r + dr}`;
      if (parseWorldCell(key)) out.push(key);
    }
  }
  return out;
};

/** The seen map's cell ids: the v2 coastline plus WORLD_REACH around every grown tile. */
export const seenCellIds = (claimIds: Iterable<string>): Set<string> => {
  const seen = new Set(WORLD_CELL_IDS);
  for (const id of claimIds) for (const key of worldAround(id)) seen.add(key);
  return seen;
};

/** The seen map, top row first, left to right (a stable order for the wire and for drawing). */
export const seenWorld = (claimIds: Iterable<string>): WorldCell[] =>
  [...seenCellIds(claimIds)]
    .map((id) => parseWorldCell(id)!)
    .sort((a, b) => a.r - b.r || a.q - b.q);

/** Stable mapping for the 64 historical automatically awarded cells. Unchanged in v2. */
export const legacyWorldCell = (oldCell: number): string => `${oldCell % 8 - 4},${Math.floor(oldCell / 8) - 4}`;

/** Presentation only: names may change, identity and colour do not. */
export const territoryColour = (playerId: string): string => {
  let hash = 2166136261;
  for (const character of playerId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `hsl(${(hash >>> 0) % 360} 34% 49%)`;
};
