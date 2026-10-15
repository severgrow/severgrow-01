/** Frozen v1 world geometry. IDs are axial coordinates; expansion only adds new IDs. */
export type WorldCell = { id: string; q: number; r: number };

// The row widths make one compact, gently asymmetric landmass (183 hexes). The central
// 8×8 parallelogram is reserved for the legacy map so existing owners retain a place.
const WIDTHS = [6, 8, 10, 11, 12, 13, 13, 14, 14, 13, 13, 12, 11, 10, 9, 8, 6] as const;
const SHIFT = [0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0] as const;

export const WORLD_VERSION = 1;
export const WORLD_CELLS: readonly WorldCell[] = Object.freeze(WIDTHS.flatMap((width, index) => {
  const r = index - 8;
  const first = Math.floor(-r / 2 - width / 2) + SHIFT[index]!;
  return Array.from({ length: width }, (_, offset) => {
    const q = first + offset;
    return Object.freeze({ id: `${q},${r}`, q, r });
  });
}));
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

/** Stable mapping for the 64 historical automatically awarded cells. */
export const legacyWorldCell = (oldCell: number): string => `${oldCell % 8 - 4},${Math.floor(oldCell / 8) - 4}`;

/** Presentation only: names may change, identity and colour do not. */
export const territoryColour = (playerId: string): string => {
  let hash = 2166136261;
  for (const character of playerId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `hsl(${(hash >>> 0) % 360} 34% 49%)`;
};
