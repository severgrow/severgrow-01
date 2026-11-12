// THE DOUBLE HARVEST (surprise brief, 2026-10-29): the game's name made literal on the finish card.
// Futasaku is 双作 — twin harvest — and the whole match is two root networks strangling each other.
// The finish card already says who won; this stamps the FINAL POSITION of that match as one small
// picture: the board's own hex silhouette, each seat's tiles in its own ink, the sides where the two
// networks touch (the cut line), and any home that ended sealed.
//
// It is INFORMATION, not decoration: every mark comes from the real final board, and a sealed home
// is the engine's own strangle test run on that same board. If the board is not available the
// caller renders nothing — there is no generic graphic to fall back to.
//
// JOINED MASS. A seat's mass is the set of its tiles reachable from its HOME through its own tiles
// — the engine's own definition (`connectedKeys`), computed here locally so a trimmed board without
// a root answers "nothing joined" instead of throwing. At a normal finish every tile is joined,
// because Sever removes the rest; the two numbers can differ only on a board captured mid-turn, and
// those tiles are drawn cut off rather than pretending they are joined.
//
// GEOMETRY. Pointy-top hexes on the product's own lattice (web/src/logic/pixelgrid.ts): the centre
// of (q, r) is (√3·S·q + √3/2·S·r, 1.5·S·r), and a cell's vertices sit at 60°·i − 30° — the shape
// the board itself uses, with FLAT LEFT AND RIGHT SIDES (owner's choice; pinned by a test). S is 10
// drawing units; the card scales the SVG with CSS. For a seat-1 viewer the whole picture is mirrored
// through the centre, exactly as a duel paints their board (`online/perspective.ts`), so each player
// reads their own network from their own side.
//
// ORIENTATION (owner, 2026-11-01): "player directly under opp". After the viewer's mirror, the figure
// is turned by ONE of the lattice's own rigid symmetries — whole 60° steps, optionally reflected — so
// the reader's home sits below the opponent's with the smallest possible horizontal offset. The turn
// is applied to the geometry itself (points, edges, homes, box and viewBox), never with an SVG
// `transform`, so the hexes stay axis-correct and the stamp stays crisp.
//
// The honest limit: a hex lattice may only turn in 60° steps (and mirrors), and a hexagon has no
// neighbour straight above it (its flat sides are left/right, its points top/bottom). So "same X"
// is often impossible. The product's own ring-2 homes are at (-2, 2) and (2, -2): their separation in
// drawing units is (34.64, -60) — exactly one hex-row direction, 60° below the horizontal. Every
// allowed turn keeps it on that same 6-direction star, so the closest two orientations are mirror
// images 30° off vertical (|ΔX| = half the home separation). The helper chooses the deterministic
// best of the twelve, and a test pins that no legal turn shares X exactly on that board.
import { allNeighbors, boardCoords, boardNeighbors, coordKey, homeCoord, onBoard } from '../../../src/engine/index.js';
import { isStrangled } from '../../../src/engine/index.js';
import type { Coord, Player, RulesConfig, Terrain, Tile } from '../../../src/engine/index.js';
import { HARVEST } from '../../../src/strings.js';

/** The lattice unit: one hex's circumradius in drawing units. */
const S = 10;
const SQ3 = Math.sqrt(3);
/** Centre-to-edge distance of one hex. */
const APOTHEM = (S * SQ3) / 2;
/** Padding around the silhouette, in drawing units. */
const PAD = 3;

export type HarvestCell = {
  key: string;
  q: number;
  r: number;
  x: number;
  y: number;
  owner: Player;
  /** True when the tile is reachable from its own home through its own tiles. */
  joined: boolean;
  home: boolean;
};

export type HarvestHex = { q: number; r: number; x: number; y: number; rock: boolean; occupied: boolean };
export type HarvestEdge = { x1: number; y1: number; x2: number; y2: number };

export type HarvestFigure = {
  /** Every hex of the board: the engraved plate, empty ground included. */
  hexes: HarvestHex[];
  /** Every occupied hex of the final position, in board order. */
  cells: HarvestCell[];
  /** The sides where the two networks touch: one segment per shared edge. */
  frontier: HarvestEdge[];
  /** The outer rim of the board: the engraved silhouette the stamp is cut from. */
  outline: HarvestEdge[];
  /** Tiles joined to their own home, by DISPLAY seat (0 = the reader). */
  masses: [number, number];
  /** All tiles each seat still holds, by display seat. */
  tiles: [number, number];
  /** Homes the final position has sealed, by display seat. */
  sealed: Player[];
  /** The rigid turn chosen for this card (see `orientationFor`), applied to every point above. */
  orientation: HexOrientation;
  /** The extra rigid turn (radians) that puts the reader's home exactly under the opponent's. */
  tilt: number;
  width: number;
  height: number;
  /** The one-sentence alternative: both masses, the touching sides, any sealed home. */
  label: string;
};

const centre = (q: number, r: number): { x: number; y: number } => ({
  x: SQ3 * S * q + (SQ3 / 2) * S * r,
  y: 1.5 * S * r,
});
/** Six vertices of one hex. `turn` rotates the hexagon itself (radians): the card draws its plate at
 *  a 30° tilt so the two homes can share one vertical line (see `tiltFor`), and the hexes have to
 *  come with it or the ground would tear away from the homes drawn on it. */
const vertices = (x: number, y: number, size = S, turn = 0): { x: number; y: number }[] =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30) + turn;
    return { x: x + size * Math.cos(a), y: y + size * Math.sin(a) };
  });

/** Rotate a drawing point about the board centre (0, 0) by `turn` radians. */
export const tiltPoint = (p: { x: number; y: number }, turn: number): { x: number; y: number } => ({
  x: p.x * Math.cos(turn) - p.y * Math.sin(turn),
  y: p.x * Math.sin(turn) + p.y * Math.cos(turn),
});

/**
 * THE LAST 30° (owner, 2026-11-01). The homes sit on a hex lattice, so they are always a whole number
 * of 60° steps apart and `orientationFor` can never make them share an X: the best a lattice turn
 * reaches is 30° off vertical. The owner was shown that and chose "rotate it 30° so you sit exactly
 * under them", accepting that the plate's hexes then show a flat edge on TOP and BOTTOM rather than
 * on the sides.
 *
 * This returns that remaining turn in radians, so applying it puts the reader's home exactly below
 * the opponent's. Rotating the whole figure rigidly keeps every distance, every shared side and
 * every count exactly as it was — only the angle changes.
 */
export const tiltFor = (
  reader: { x: number; y: number },
  opponent: { x: number; y: number },
): number => {
  const dx = opponent.x - reader.x;
  const dy = opponent.y - reader.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 0;
  // Point the reader → opponent direction straight up (the drawing's y grows downward, so "up" is
  // −π/2). Normalised into (−π, π] so the same board always produces the same angle.
  const target = -Math.PI / 2;
  let turn = target - Math.atan2(dy, dx);
  while (turn <= -Math.PI) turn += 2 * Math.PI;
  while (turn > Math.PI) turn -= 2 * Math.PI;
  return turn;
};

/** A rigid turn of the drawing: whole 60° steps, optionally mirrored across its vertical axis. */
export type HexOrientation = { rotation: number; mirrored: boolean };

/** cos/sin of 60°·k, k = 0..5, written out so a truly vertical or 30° case lands on 0. */
const TURN = [
  { c: 1, s: 0 },
  { c: 0.5, s: SQ3 / 2 },
  { c: -0.5, s: SQ3 / 2 },
  { c: -1, s: 0 },
  { c: -0.5, s: -SQ3 / 2 },
  { c: 0.5, s: -SQ3 / 2 },
] as const;

/** A turn count normalised into 0..5. */
const turnOf = (steps: number): number => ((Math.round(steps) % 6) + 6) % 6;

/**
 * Rotate a lattice coordinate by `steps` × 60°. A symmetry of the hex lattice: every distance is
 * preserved and the flat-sided hexes never change shape. (q, r) → (−r, q + r) is one step, the same
 * turn as `rotatePoint` below when the coord is drawn at `centre(q, r)`.
 */
export const rotateCoord = (c: Coord, steps: number): Coord => {
  let out: Coord = { q: c.q + 0, r: c.r + 0 };
  for (let i = 0, k = turnOf(steps); i < k; i++) out = { q: -out.r + 0, r: out.q + out.r + 0 };
  return out;
};

/** Reflect a lattice coordinate across the drawing's vertical axis (x → −x). */
export const reflectCoord = (c: Coord): Coord => ({ q: -c.q - c.r + 0, r: c.r + 0 });

/** The coordinate this viewer sees after `orientation`: mirror first, then the turn. */
export const orientCoord = (c: Coord, o: HexOrientation): Coord =>
  rotateCoord(o.mirrored ? reflectCoord(c) : c, o.rotation);

/** Rotate a drawing point by `steps` × 60° (the same turn as `rotateCoord`). */
export const rotatePoint = (p: { x: number; y: number }, steps: number): { x: number; y: number } => {
  const { c, s } = TURN[turnOf(steps)]!;
  return { x: c * p.x - s * p.y + 0, y: s * p.x + c * p.y + 0 };
};

/** The point this viewer sees after `orientation`: mirror across the vertical axis, then the turn. */
export const orientPoint = (p: { x: number; y: number }, o: HexOrientation): { x: number; y: number } =>
  rotatePoint(o.mirrored ? { x: -p.x + 0, y: p.y } : p, o.rotation);

/** True when key `a` sorts before key `b` (lexicographic, fixed length). */
const before = (a: readonly number[], b: readonly number[]): boolean => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
};

/**
 * The turn that puts the reader's home directly below the opponent's, as closely as the lattice
 * allows. It first insists the opponent is above (smaller y; the drawing's y grows downward), then
 * minimises |Δx| between the two homes, then prefers the unmirrored, lowest-index turn so the same
 * board always reads the same way.
 *
 * Inputs are DISPLAY coords (already after the viewer's mirror). Reflections are searched because
 * they are legal lattice symmetries; on this lattice they can only tie the six turns, but the caller
 * still gets the decision stated rather than implied. An equal pair answers the identity.
 */
export const orientationFor = (reader: Coord, opponent: Coord): HexOrientation => {
  const r = centre(reader.q, reader.r);
  const o = centre(opponent.q, opponent.r);
  let best: HexOrientation = { rotation: 0, mirrored: false };
  let bestKey: [number, number, number, number] = [1, Infinity, 1, 0];
  for (let m = 0; m < 2; m++) {
    for (let rotation = 0; rotation < 6; rotation++) {
      const candidate: HexOrientation = { rotation, mirrored: m === 1 };
      const rp = orientPoint(r, candidate);
      const op = orientPoint(o, candidate);
      // Priority: a real "above" (0), then the smallest |Δx|, then the plain turn, then the lowest
      // index — a total order, so the same board can never choose two different pictures.
      const key: [number, number, number, number] = [
        op.y - rp.y < -1e-9 ? 0 : 1,
        Math.round(Math.abs(op.x - rp.x) * 1e6),
        m,
        rotation,
      ];
      if (before(key, bestKey)) {
        best = candidate;
        bestKey = key;
      }
    }
  }
  return best;
};

/** A hex as an SVG path, at drawing-unit precision. */
export const cellPath = (x: number, y: number, size = S, turn = 0): string =>
  `M${vertices(x, y, size, turn)
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join('L')}Z`;

/** The shared side between two adjacent hexes, from their two centres. */
const sharedEdge = (a: { x: number; y: number }, b: { x: number; y: number }): HarvestEdge => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const cx = a.x + (dx / len) * APOTHEM;
  const cy = a.y + (dy / len) * APOTHEM;
  const px = (-dy / len) * (S / 2);
  const py = (dx / len) * (S / 2);
  return { x1: cx - px, y1: cy - py, x2: cx + px, y2: cy + py };
};

/**
 * The tiles of `player` joined to their own home through their own tiles — the engine's own
 * definition (`connectedKeys`), written tolerantly: a missing root answers an empty set.
 */
export const joinedMass = (board: Record<string, Tile | null>, config: RulesConfig, player: Player): Set<string> => {
  const root = homeCoord(player, config);
  const rootKey = coordKey(root);
  const rootTile = board[rootKey];
  if (!rootTile || rootTile.owner !== player) return new Set();
  const seen = new Set<string>([rootKey]);
  const stack: Coord[] = [root];
  while (stack.length > 0) {
    for (const n of boardNeighbors(stack.pop()!, config)) {
      const k = coordKey(n);
      if (!seen.has(k) && board[k]?.owner === player) {
        seen.add(k);
        stack.push(n);
      }
    }
  }
  return seen;
};

/**
 * The figure for one finished position, or null when there is no board to draw.
 *
 * `board` and `config` are the engine's own (engine seat order); `viewer` is the seat reading the
 * card, whose network is drawn solid and whose side of the board is treated as "yours".
 */export const harvestFigure = (
  board: Record<string, Tile | null> | null | undefined,
  config: RulesConfig,
  viewer: Player,
  terrain?: Record<string, Terrain>,
): HarvestFigure | null => {
  if (!board) return null;
  const mirror = viewer === 1;
  /** Engine coord → the coord this viewer sees (a duel mirrors seat 1's board). */
  const seenAs = (c: Coord): Coord => (mirror ? { q: -c.q + 0, r: -c.r + 0 } : c);
  const displayOwner = (owner: Player): Player => (owner === viewer ? 0 : 1);
  // The owner's one turn: the reader's home under the opponent's (see `orientationFor`). It is read
  // from the two HOME centres in display coords, before anything is drawn, then applied to every
  // point the figure draws — points, edges, homes, box and viewBox — so nothing is left un-turned.
  const orientation = orientationFor(
    seenAs(homeCoord(viewer, config)),
    seenAs(homeCoord(viewer === 0 ? 1 : 0, config)),
  );
  /** Engine coord → the coord this viewer sees, after the chosen turn. */
  const shownAs = (c: Coord): Coord => orientCoord(seenAs(c), orientation);
  // The last 30°: a lattice turn can only get the two homes 30° off vertical, so the whole drawing
  // takes one more rigid turn to put the reader's home exactly under the opponent's (owner chose
  // this over keeping the hexes' flat sides; see `tiltFor`).
  const homeOf = (seat: Player) => {
    const d = shownAs(homeCoord(seat, config));
    return centre(d.q, d.r);
  };
  const tilt = tiltFor(homeOf(viewer), homeOf(viewer === 0 ? 1 : 0));
  /** A lattice point, in the card's own frame: turned about the board centre by `tilt`. */
  const place = (q: number, r: number): { x: number; y: number } => tiltPoint(centre(q, r), tilt);

  const massesBySeat: [Set<string>, Set<string>] = [joinedMass(board, config, 0), joinedMass(board, config, 1)];
  const tilesByOwner: [number, number] = [0, 0];
  const masses: [number, number] = [0, 0];

  const coords = boardCoords(config);
  const hexes: HarvestHex[] = [];
  const cells: HarvestCell[] = [];
  const byKey = new Map<string, HarvestCell>();
  const pointOf = new Map<string, { x: number; y: number }>();

  for (const c of coords) {
    const key = coordKey(c);
    const d = shownAs(c);
    const p = place(d.q, d.r);
    pointOf.set(key, p);
    const tile: Tile | null = board[key] ?? null;
    hexes.push({ q: d.q, r: d.r, x: p.x, y: p.y, rock: terrain?.[key] === 'rock', occupied: !!tile });
    if (!tile) continue;
    const owner = displayOwner(tile.owner);
    tilesByOwner[owner] += 1;
    const joined = massesBySeat[tile.owner]!.has(key);
    if (joined) masses[owner] += 1;
    const cell: HarvestCell = {
      key,
      q: d.q,
      r: d.r,
      x: p.x,
      y: p.y,
      owner,
      joined,
      home: !!tile.root,
    };
    cells.push(cell);
    byKey.set(key, cell);
  }
  if (!hexes.length) return null;

  // The cut line: every shared side between the two networks, one segment each (never twice).
  const frontier: HarvestEdge[] = [];
  for (const c of coords) {
    const key = coordKey(c);
    const cell = byKey.get(key);
    if (!cell) continue;
    for (const n of boardNeighbors(c, config)) {
      const nk = coordKey(n);
      const other = byKey.get(nk);
      if (!other || other.owner === cell.owner) continue;
      if (key > nk) continue; // count each shared side once
      frontier.push(sharedEdge(pointOf.get(key)!, pointOf.get(nk)!));
    }
  }

  // A sealed home is a fact of the final board, not of the result: the engine's own strangle test.
  const sealed: Player[] = [];
  for (const seat of [0, 1] as const) {
    if (isStrangled({ board, terrain: terrain ?? {}, config }, seat)) sealed.push(displayOwner(seat));
  }

  // The rim: every hex side with no neighbour on the board. This is the silhouette the stamp is
  // cut from, so the shape of the ground reads even where nothing grew.
  const outline: HarvestEdge[] = [];
  for (const c of coords) {
    const p = pointOf.get(coordKey(c))!;
    for (const n of allNeighbors(c)) {
      if (onBoard(n, config)) continue;
      const d = shownAs(n);
      outline.push(sharedEdge(p, place(d.q, d.r)));
    }
  }

  // Bounds measured from the ACTUAL corners of every hex at this tilt: a tilted hexagon is wider or
  // taller than an untilted one, so the old fixed padding would crop the plate.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const h of hexes) {
    for (const v of vertices(h.x, h.y, S, tilt)) {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
  }
  const width = maxX - minX + PAD * 2;
  const height = maxY - minY + PAD * 2;
  const dx = PAD - minX;
  const dy = PAD - minY;

  return {
    hexes: hexes.map((h) => ({ ...h, x: h.x + dx, y: h.y + dy })),
    cells: cells.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy })),
    frontier: frontier.map((e) => ({ x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy })),
    outline: outline.map((e) => ({ x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy })),
    masses,
    tiles: tilesByOwner,
    sealed,
    orientation,
    tilt,
    width,
    height,
    label: HARVEST.sentence(
      masses[0],
      masses[1],
      frontier.length,
      tilesByOwner[0] + tilesByOwner[1] - masses[0] - masses[1],
      sealed.includes(0) ? 'your' : sealed.includes(1) ? 'their' : null,
    ),
  };
};

/** The SVG for one figure: static, no animation, colours from the theme. */
export const harvestSvg = (f: HarvestFigure): string => {
  const n = (v: number) => v.toFixed(1);
  const cells = (owner: Player) =>
    f.cells
      .filter((c) => c.owner === owner && c.joined)
      .map((c) => `<path d="${cellPath(c.x, c.y, S, f.tilt)}"/>`)
      .join('');
  const cutOff = f.cells
    .filter((c) => !c.joined)
    .map((c) => `<path class="hv-cutoff" d="${cellPath(c.x, c.y, S, f.tilt)}"/>`)
    .join('');
  const homes = f.cells
    .filter((c) => c.home)
    .map((c) => {
      const sealed = f.sealed.includes(c.owner);
      const who = c.owner === 0 ? 'hv-home-you' : 'hv-home-them';
      return `<g class="hv-home ${who}${sealed ? ' hv-sealed' : ''}"><circle cx="${n(c.x)}" cy="${n(c.y)}" r="4.6"/><circle class="hv-home-dot" cx="${n(c.x)}" cy="${n(c.y)}" r="1.5"/></g>`;
    })
    .join('');
  const frontier = f.frontier.map((e) => `<line x1="${n(e.x1)}" y1="${n(e.y1)}" x2="${n(e.x2)}" y2="${n(e.y2)}"/>`).join('');
  const outline = f.outline.map((e) => `<line x1="${n(e.x1)}" y1="${n(e.y1)}" x2="${n(e.x2)}" y2="${n(e.y2)}"/>`).join('');
  return [
    `<svg class="go-harvest-svg" viewBox="0 0 ${n(f.width)} ${n(f.height)}" role="img" aria-label="${f.label}" focusable="false" xmlns="http://www.w3.org/2000/svg">`,
    `<defs><pattern id="go-harvest-hatch" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2.6"/></pattern></defs>`,
    `<g class="hv-plate">${f.hexes
      .filter((h) => !h.occupied)
      .map((h) => `<path d="${cellPath(h.x, h.y, S, f.tilt)}"/>`)
      .join('')}</g>`,
    `<g class="hv-them">${cells(1)}</g>`,
    `<g class="hv-hatch">${cells(1)}</g>`,
    `<g class="hv-you">${cells(0)}</g>`,
    cutOff,
    `<g class="hv-frontier">${frontier}</g>`,
    `<g class="hv-outline">${outline}</g>`,
    `<g class="hv-homes">${homes}</g>`,
    `</svg>`,
  ].join('');
};

