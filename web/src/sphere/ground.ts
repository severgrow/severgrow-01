// WHAT EACH PLANET TILE IS, from the live Territory data. Pure: no DOM, no clock, no network.
//
// Owner, 2026-11-04: "Make sure to distinguish empty tiles + inhabitable black pentagons etc ... Use
// the tiles data from territory with real players tiles on it in a random spot of the sphere, it's
// okay if the rest of the sphere is empty for now." The flat world is laid on the planet by
// `latticeMap`; everything outside it is ground nobody has reached yet.
import type { LatticeMap, Sphere } from './geometry.js';
import { colourRgb } from './colour.js';

/** Ordered by how "alive" a tile is. The renderer reads these numbers, so they are fixed. */
export const KIND = Object.freeze({
  /** Off the known map: the planet nobody has reached. */
  void: 0,
  /** The two undiscovered rings around the known land (the flat map's fog). */
  fog: 1,
  /** Known, free ground: can be grown on. */
  land: 2,
  /** Someone else's tile. */
  owned: 3,
  /** The viewer's own tile. */
  mine: 4,
  /** One of the twelve pentagons: black, uninhabitable, never part of the map. */
  pentagon: 5,
});
export type Kind = (typeof KIND)[keyof typeof KIND];

export type GroundInput = {
  /** The known (seen) cells of the flat world. */
  cells: readonly { id: string }[];
  claims: readonly { cellId: string; ownerId: string; colour: string }[];
  /** The undiscovered rings beyond the known land, by flat id. */
  fog?: Iterable<string>;
  /** Cells under an open challenge. */
  disputes?: Iterable<string>;
  me: string | null;
};

export type Ground = {
  kind: Uint8Array;
  /** Linear-ish 0..1 RGB per cell, three per cell. */
  colour: Float32Array;
  /** Per cell: bit i set when edge i borders a different owner or a different kind of ground. */
  border: Uint8Array;
  disputed: Uint8Array;
  /** Per cell: the owner's id, for "same owner" questions; null where nobody owns it. */
  owner: (string | null)[];
};

/** The ground's own colours, tuned against the flat Territory map (dark field, warm cream lines). */
export const GROUND_RGB = Object.freeze({
  void: [0.050, 0.058, 0.054] as const,
  fog: [0.083, 0.094, 0.088] as const,
  land: [0.205, 0.222, 0.205] as const,
  pentagon: [0.012, 0.012, 0.015] as const,
});

export const groundOf = (sphere: Sphere, map: LatticeMap, input: GroundInput): Ground => {
  const count = sphere.cells.length;
  const kind = new Uint8Array(count).fill(KIND.void);
  const colour = new Float32Array(count * 3);
  const border = new Uint8Array(count);
  const disputed = new Uint8Array(count);
  const owner: (string | null)[] = new Array<string | null>(count).fill(null);
  const paint = (index: number, k: Kind, rgb: readonly number[]) => {
    kind[index] = k;
    colour[index * 3] = rgb[0]!; colour[index * 3 + 1] = rgb[1]!; colour[index * 3 + 2] = rgb[2]!;
  };
  for (let i = 0; i < count; i++) paint(i, sphere.cells[i]!.pentagon ? KIND.pentagon : KIND.void, sphere.cells[i]!.pentagon ? GROUND_RGB.pentagon : GROUND_RGB.void);
  for (const id of input.fog ?? []) {
    const index = map.cellOf.get(id);
    if (index !== undefined) paint(index, KIND.fog, GROUND_RGB.fog);
  }
  for (const cell of input.cells) {
    const index = map.cellOf.get(cell.id);
    if (index !== undefined) paint(index, KIND.land, GROUND_RGB.land);
  }
  for (const claim of input.claims) {
    const index = map.cellOf.get(claim.cellId);
    if (index === undefined) continue;
    paint(index, claim.ownerId === input.me ? KIND.mine : KIND.owned, colourRgb(claim.colour));
    owner[index] = claim.ownerId;
  }
  for (const id of input.disputes ?? []) {
    const index = map.cellOf.get(id);
    if (index !== undefined) disputed[index] = 1;
  }
  // A border is drawn where the ground CHANGES: owner to owner, owned to free, known to unknown.
  for (const cell of sphere.cells) {
    let bits = 0;
    cell.neighbours.forEach((nb, i) => {
      const a = kind[cell.index]!, b = kind[nb]!;
      const differs = owner[cell.index] !== owner[nb] || (a !== b && !(a <= KIND.fog && b <= KIND.fog));
      if (differs) bits |= 1 << i;
    });
    border[cell.index] = bits;
  }
  return { kind, colour, border, disputed, owner };
};

/** The planet cell under flat tile `id`, or null when that tile is off the planet's map. */
export const cellForTile = (map: LatticeMap, id: string): number | null => map.cellOf.get(id) ?? null;
/** The flat tile id under planet cell `index`, or null for pentagons and unmapped ground. */
export const tileForCell = (map: LatticeMap, index: number): string | null => map.flatOf.get(index) ?? null;
