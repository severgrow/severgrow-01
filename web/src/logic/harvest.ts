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
// the board itself uses. S is 10 drawing units; the card scales the SVG with CSS. For a seat-1
// viewer the whole picture is mirrored through the centre, exactly as a duel paints their board
// (`online/perspective.ts`), so each player reads their own network from their own side.
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
  width: number;
  height: number;
  /** The one-sentence alternative: both masses, the touching sides, any sealed home. */
  label: string;
};

const centre = (q: number, r: number): { x: number; y: number } => ({
  x: SQ3 * S * q + (SQ3 / 2) * S * r,
  y: 1.5 * S * r,
});
/** Six vertices of one hex, starting at the product's own corner (−30°). */
const vertices = (x: number, y: number, size = S): { x: number; y: number }[] =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return { x: x + size * Math.cos(a), y: y + size * Math.sin(a) };
  });

/** A hex as an SVG path, at drawing-unit precision. */
export const cellPath = (x: number, y: number, size = S): string =>
  `M${vertices(x, y, size)
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
  const displayCentre = (c: Coord): { x: number; y: number } => {
    const d = seenAs(c);
    return centre(d.q, d.r);
  };

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
    const p = displayCentre(c);
    pointOf.set(key, p);
    const tile: Tile | null = board[key] ?? null;
    hexes.push({ q: seenAs(c).q, r: seenAs(c).r, x: p.x, y: p.y, rock: terrain?.[key] === 'rock', occupied: !!tile });
    if (!tile) continue;
    const owner = displayOwner(tile.owner);
    tilesByOwner[owner] += 1;
    const joined = massesBySeat[tile.owner]!.has(key);
    if (joined) masses[owner] += 1;
    const cell: HarvestCell = {
      key,
      q: seenAs(c).q,
      r: seenAs(c).r,
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
      outline.push(sharedEdge(p, centre(seenAs(n).q, seenAs(n).r)));
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const h of hexes) {
    minX = Math.min(minX, h.x);
    maxX = Math.max(maxX, h.x);
    minY = Math.min(minY, h.y);
    maxY = Math.max(maxY, h.y);
  }
  const width = maxX - minX + S * SQ3 + PAD * 2;
  const height = maxY - minY + S * 2 + PAD * 2;
  const dx = PAD + (S * SQ3) / 2 - minX;
  const dy = PAD + S - minY;

  return {
    hexes: hexes.map((h) => ({ ...h, x: h.x + dx, y: h.y + dy })),
    cells: cells.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy })),
    frontier: frontier.map((e) => ({ x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy })),
    outline: outline.map((e) => ({ x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy })),
    masses,
    tiles: tilesByOwner,
    sealed,
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
      .map((c) => `<path d="${cellPath(c.x, c.y)}"/>`)
      .join('');
  const cutOff = f.cells
    .filter((c) => !c.joined)
    .map((c) => `<path class="hv-cutoff" d="${cellPath(c.x, c.y)}"/>`)
    .join('');
  const homes = f.cells
    .filter((c) => c.home)
    .map((c) => {
      const sealed = f.sealed.includes(c.owner);
      return `<g class="hv-home${sealed ? ' hv-sealed' : ''}"><circle cx="${n(c.x)}" cy="${n(c.y)}" r="4.6"/><circle class="hv-home-dot" cx="${n(c.x)}" cy="${n(c.y)}" r="1.5"/></g>`;
    })
    .join('');
  const frontier = f.frontier.map((e) => `<line x1="${n(e.x1)}" y1="${n(e.y1)}" x2="${n(e.x2)}" y2="${n(e.y2)}"/>`).join('');
  const outline = f.outline.map((e) => `<line x1="${n(e.x1)}" y1="${n(e.y1)}" x2="${n(e.x2)}" y2="${n(e.y2)}"/>`).join('');
  return [
    `<svg class="go-harvest-svg" viewBox="0 0 ${n(f.width)} ${n(f.height)}" role="img" aria-label="${f.label}" focusable="false" xmlns="http://www.w3.org/2000/svg">`,
    `<defs><pattern id="go-harvest-hatch" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2.6"/></pattern></defs>`,
    `<g class="hv-plate">${f.hexes
      .filter((h) => !h.occupied)
      .map((h) => `<path d="${cellPath(h.x, h.y)}"/>`)
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

