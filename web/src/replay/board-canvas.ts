// THE REPLAY'S BOARD, PAINTED ON A CANVAS (owner brief, 2026-10-26).
//
// One painter for both canvas pictures the replay makes: the shared poster (a still of the finished
// match) and the exported video (the same board at every beat of the match). They must not drift,
// so neither of them draws a hex: this module owns the geometry, the palette, the sprite faces, the
// seed stones and the rim, and `poster.ts` / `frames.ts` only put text around it.
//
// It is a canvas port of `ui/defaultArtBoard.ts`, the board the match itself paints: the same
// ground picture at 360 board units, the same 80/76-unit tile faces keyed by the same `hash`, the
// same 68-unit homes, the same 54-unit rocks at -30 degrees, the same carved strength stones and
// the same quiet rim (rgba(178,174,163,.18) at 0.75 units). A video that showed a different board
// than the game would be worse than no video.
//
// The artwork is the game's own, handed over as URLs by the module the board already loaded: every
// picture is already decoded by the time a match ends, so this is a cache hit, never a download.
// A picture that is missing leaves the board's own flat territory colour underneath, exactly as
// `defaultArtBoard` does — so painting can never fail or stall.
import { allCoords, coordKey, mirror, parseKey } from '../../../src/engine/index.js';
import type { Player, Terrain, Tile } from '../../../src/engine/index.js';
import { getOrient, toScreen } from '../logic/orient.js';
import { centerOf, hash, S } from '../ui/geom.js';
import { SEED_STONE_ATLAS, seedStoneCrop } from '../ui/seedstone.js';
import type { ReplayModel } from './timeline.js';

/** The board's own pictures, as URLs (the game decodes these before a match ends). */
export type BoardArt = {
  sprites: readonly string[];
  ground: string;
  rocks: readonly string[];
};

/** The territory colours `DefaultArtBoardView` fills under its sprites. */
export const TERRITORY_BASE: readonly [string, string] = ['#315321', '#302c2c'];
/** The board's quiet rim, drawn over the art (never a bright seam). */
export const CELL_RIM = 'rgba(178,174,163,0.18)';
/** The rock clusters' own drop shadow, under the picture. */
export const ROCK_SHADOW = 'rgba(0,0,0,.17)';
/** The carved counter's shadow (the board's `--seed-stone-shadow` fallback). */
export const STONE_SHADOW = 'rgba(0,0,0,.4)';

const decoded = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();
let source: BoardArt | null = null;

/**
 * Decode the board's pictures once for the canvas painters (idempotent, cached, never rejects).
 * Called with the URLs the on-screen board already used; the images are a browser-cache hit.
 */
export const warmBoardArt = (art: BoardArt | null = null): Promise<void> => {
  if (art) source = art;
  const urls = [...(source?.sprites ?? []), source?.ground ?? '', ...(source?.rocks ?? []), SEED_STONE_ATLAS].filter(
    (url): url is string => !!url,
  );
  return Promise.all(urls.map(decode)).then(() => undefined);
};

const decode = (url: string): Promise<void> => {
  const had = pending.get(url);
  if (had) return had;
  if (typeof Image === 'undefined') {
    const done = Promise.resolve();
    pending.set(url, done);
    return done;
  }
  const one = new Promise<void>((done) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (img.naturalWidth > 0) decoded.set(url, img);
      done();
    };
    img.onerror = () => done();
    img.src = url;
  });
  pending.set(url, one);
  return one;
};

let artUrls: Promise<BoardArt | null> | null = null;

/**
 * The pictures the on-screen board already loaded, or null when this channel has no art. The import
 * is the module `main.ts` used for the game, so it resolves from memory: no second download and no
 * second copy of the sprite URLs in a second chunk.
 */
export const loadBoardArtUrls = (): Promise<BoardArt | null> => {
  artUrls ??= import('../ui/defaultArtBoard.js')
    .then((mod) => ({ sprites: mod.DEFAULT_ART_SPRITES, ground: mod.BOARD_GROUND, rocks: mod.BOARD_ROCKS }))
    .catch(() => null);
  return artUrls;
};

/** What the painter has to work with (a test can ask; the share path uses it to report). */
export const boardArtSource = (): BoardArt | null => source;

const picture = (url: string | undefined): HTMLImageElement | null => (url ? decoded.get(url) ?? null : null);

/** The sprite's own rotation, shared with `DefaultArtBoardView` (its visual base at the bottom). */
const artAngle = () => {
  const axis = toScreen(1, 0);
  return ((Math.atan2(axis.y, axis.x) * 180) / Math.PI + 120) * (Math.PI / 180);
};

/** The square each board sprite occupies, in board units (radius = S). Same table as the board. */
const artSize = (index: number) => (index >= 18 ? 68 : index < 9 ? 80 : 76);

export type BoardData = {
  /** The position's tiles, by screen key. */
  board: Record<string, Tile | null>;
  /** Every cell of the match's board shape, empty or not (screen keys). */
  coords: readonly string[];
  terrain: Record<string, Terrain>;
  /** Whose phone this is: the seat whose ink the picture speaks in. */
  me: Player;
};

export type BoardCell = {
  key: string;
  x: number;
  y: number;
  owner: Player | null;
  strength: number;
  root: boolean;
  terrain: Terrain;
};

export type BoardLayout = {
  /** The hex radius in pixels (the board's own S = 30 units). */
  hex: number;
  cells: BoardCell[];
};

export type BoardArea = {
  /** The box the board must fit, in canvas pixels. */
  w: number;
  h: number;
  /** Where the board's middle goes, in canvas pixels. */
  cx: number;
  cy: number;
};

/** Every cell of the model's board shape, in the viewer's own screen coordinates. */
export const screenCoordsOf = (model: Pick<ReplayModel, 'me' | 'config'>): string[] => {
  const toScreenKey = (key: string) => (model.me === 0 ? key : coordKey(mirror(parseKey(key))));
  // A set board's cell list comes from the engine, so it gets the same turn; the classic hexagon is
  // symmetric but is mapped anyway, through the one rule.
  return model.config.board?.cells?.length
    ? model.config.board.cells.map(toScreenKey)
    : allCoords(model.config.boardRadius).map((c) => toScreenKey(coordKey(c)));
};

/**
 * The one layout: the SAME screen mapping the match uses (`centerOf`), so the picture carries the
 * board's real orientation (flat on the product channel) and rotation, not a second hex convention.
 */
export const layoutBoard = (d: BoardData, area: BoardArea): BoardLayout => {
  if (d.coords.length === 0) return { hex: 1, cells: [] };
  const centres = d.coords.map((key) => centerOf(key));
  const px = centres.map((p) => p.x);
  const py = centres.map((p) => p.y);
  const midX = (Math.min(...px) + Math.max(...px)) / 2;
  const midY = (Math.min(...py) + Math.max(...py)) / 2;
  const flat = getOrient() === 'flat';
  const unitW = Math.max(...px) - Math.min(...px) + (flat ? 2 : Math.sqrt(3)) * S;
  const unitH = Math.max(...py) - Math.min(...py) + (flat ? Math.sqrt(3) : 2) * S;
  const hex = Math.min(area.w / unitW, area.h / unitH) * S;
  const cells = d.coords.map((key, i) => {
    const tile = d.board[key] ?? null;
    return {
      key,
      x: area.cx + hex * ((centres[i]!.x - midX) / S),
      y: area.cy + hex * ((centres[i]!.y - midY) / S),
      owner: tile ? tile.owner : null,
      strength: tile ? tile.strength : 0,
      root: !!tile?.root,
      terrain: d.terrain[key] ?? ('normal' as const),
    };
  });
  return { hex, cells };
};

/** One hex outline, in the board's own screen units (the same six corners `cornerPts` uses). */
const hexAt = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const o = toScreen(r * Math.cos(a), r * Math.sin(a));
    if (i === 0) g.moveTo(x + o.x, y + o.y);
    else g.lineTo(x + o.x, y + o.y);
  }
  g.closePath();
};

export type BoardPaint = {
  me: Player;
  /** The rim/edge ink (the surface's `--rp-line`), used for the quiet seam between cells. */
  line: string;
  /** The font stack for the flat strength number (only when the stone atlas is unavailable). */
  font: string;
};

/** Paint the whole board at one position. The caller owns the background. */
export const paintBoard = (g: CanvasRenderingContext2D, L: BoardLayout, o: BoardPaint): void => {
  if (L.cells.length === 0) return;
  const k = L.hex / S;
  const ground = picture(source?.ground);
  let pattern: CanvasPattern | null = null;
  if (ground) {
    pattern = g.createPattern(ground, 'repeat');
    // One ground tile is 360 board units on the live board; keep that scale here.
    pattern?.setTransform?.(new DOMMatrix().scale(k, k));
  }
  const angle = artAngle();
  const atlas = picture(SEED_STONE_ATLAS);
  const rocks = source?.rocks ?? [];

  for (const cell of L.cells) {
    const r = L.hex;
    g.save();
    hexAt(g, cell.x, cell.y, r);
    g.clip();
    if (pattern) {
      g.fillStyle = pattern;
      g.fillRect(cell.x - r, cell.y - r, r * 2, r * 2);
    }
    if (cell.owner !== null) {
      // The territory colour only shows through the art's own edges, exactly as on the board.
      g.fillStyle = TERRITORY_BASE[cell.owner];
      g.fillRect(cell.x - r, cell.y - r, r * 2, r * 2);
      const index = cell.root
        ? cell.owner === 0
          ? 18
          : 19
        : cell.owner * 9 + Math.floor(hash(`${cell.key}:default-tile`) * 9);
      const sprite = picture(source?.sprites[index]);
      if (sprite) {
        const side = artSize(index) * k;
        g.translate(cell.x, cell.y);
        g.rotate(angle);
        g.drawImage(sprite, -side / 2, -side / 2, side, side);
      }
    } else if (!pattern) {
      // No ground picture: the board's own empty-cell tints, from the poster's palette.
      g.fillStyle =
        cell.terrain === 'rich'
          ? 'rgba(233, 216, 173, .12)'
          : cell.terrain === 'rock'
            ? 'rgba(255, 255, 255, .045)'
            : 'rgba(255, 255, 255, .035)';
      g.fillRect(cell.x - r, cell.y - r, r * 2, r * 2);
    }
    if (cell.terrain === 'rock' && rocks.length) {
      const rock = picture(rocks[Math.floor(hash(`${cell.key}:v3-rock`) * rocks.length)]);
      if (rock) {
        // The board's own soft footprint under the cluster, then the cluster at -30 degrees.
        g.beginPath();
        g.ellipse(cell.x, cell.y + 7 * k, 22 * k, 13 * k, 0, 0, Math.PI * 2);
        g.fillStyle = ROCK_SHADOW;
        g.fill();
        const side = 54 * k;
        g.translate(cell.x, cell.y);
        g.rotate((-30 * Math.PI) / 180);
        g.drawImage(rock, -side / 2, -side / 2, side, side);
      }
    }
    g.restore();

    // The board's quiet rim, drawn over the art (never a bright seam).
    hexAt(g, cell.x, cell.y, Math.max(1, r - 1.1 * k));
    g.strokeStyle = o.line;
    g.lineWidth = Math.max(1, 0.75 * k);
    g.stroke();

    if (cell.owner !== null && !cell.root && cell.strength > 0) {
      if (atlas) {
        // The same carved counter the board places, cropped from the same atlas, at the board's
        // own 0.66 scale and with its own soft shadow.
        const q = 0.66 * k;
        g.beginPath();
        g.ellipse(cell.x + 1.7 * q, cell.y + 9.1 * q, 8.9 * q, 2.6 * q, 0, 0, Math.PI * 2);
        g.fillStyle = STONE_SHADOW;
        g.fill();
        const crop = seedStoneCrop(cell.owner, cell.strength);
        const stone = 21 * q;
        g.drawImage(
          atlas,
          crop.x,
          crop.y,
          crop.size,
          crop.size,
          cell.x - stone / 2,
          cell.y - stone / 2,
          stone,
          stone,
        );
      } else {
        g.font = `700 ${Math.round(L.hex * 0.48)}px ${o.font}`;
        g.fillStyle = 'rgba(7, 9, 8, .84)';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(cell.strength), cell.x, cell.y + 1);
      }
    }
    if (cell.owner !== null && cell.root) {
      // A ring, never a disc over the home: the root stays identifiable on the picture.
      g.beginPath();
      g.arc(cell.x, cell.y, L.hex * 0.27, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(240, 233, 220, .72)';
      g.lineWidth = Math.max(2, L.hex * 0.045);
      g.stroke();
    }
  }
};
