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
  /** The flat map's undiscovered rings. Not drawn on the planet (owner, 2026-11-04); kept for callers. */
  fog?: Iterable<string>;
  /** Cells under an open challenge. */
  disputes?: Iterable<string>;
  me: string | null;
  /**
   * The server takes a new tile anywhere on the planet (owner, 2026-11-04). Then the whole planet is
   * plain growable ground in its own colour, and only the ring of tiles around each placed tile is
   * lit as known land ("the tiles around get highlighted only when a tile is placed"). The server's
   * seen map and the fog rings belong to the flat map and are ignored.
   */
  growAnywhere?: boolean;
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
  // THE LIT GROUND IS VISUAL ONLY (owner, 2026-11-04: "it expand by 2 tiles around like it did in flat
  // territory - but it's visual only, players can tap and use any tile on the planet"): the two rings
  // of tiles around every placed tile, by the planet's own adjacency. The flat map's coastline and
  // fog are not drawn on the planet; every other hexagon is plain ground, tappable like the rest.
  for (const claim of input.claims) {
    const start = map.cellOf.get(claim.cellId);
    if (start === undefined) continue;
    let ring = [start];
    for (let step = 0; step < 2; step++) {
      const next: number[] = [];
      for (const cell of ring) for (const nb of sphere.cells[cell]!.neighbours) {
        if (sphere.cells[nb]!.pentagon || kind[nb] === KIND.land) continue;
        paint(nb, KIND.land, GROUND_RGB.land);
        next.push(nb);
      }
      ring = next;
    }
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
