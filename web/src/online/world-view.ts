import type { DuelClient } from '../../../server/src/client.js';
import type { WorldMapPayload } from '../../../server/src/protocol.js';
import type { SeedWallet, WorldChallengeWire, WorldChallengesPayload, WorldDispute } from '../../../server/src/seeds/types.js';
import { worldNeighbours } from '../../../server/src/world.js';
import {
  HELD_DARK,
  HELD_LIGHT,
  MINE_DARK,
  MINE_LIGHT,
  MINE_MID,
  TILE_COLOURS,
  shiftLightness,
} from '../../../src/tile-colours.js';
import { CHALLENGE } from './challenge-copy.js';
import type { ChallengeMarker } from './challenge-view.js';
import {
  CHALLENGE_RAIL_MAX,
  SWORDS_HIT_RADIUS,
  challengeForCell as challengeOnCell,
  defendSheetCopy,
  disputeMarkersFor,
  isLow,
  opponentName,
  remainingLabel,
  resolvedSheetCopy,
  ringFraction,
  settlementSheetCopy,
  sheetModeFor,
  stakeMarkersFor,
} from './challenge-view.js';
import { stakedCellFor } from '../../../server/src/seeds/stake.js';
import { stakeName } from './challenge-copy.js';
import { seedBalanceLabel, seedIcon } from './seed-icon.js';
import type { AchievementView } from '../../../server/src/seeds/achievements.js';
import { ACHIEVEMENT_COPY, ACHIEVEMENTS_UI } from './achievement-copy.js';
import { SWORD_PATH } from './swords-glyph.js';
import { ownerLine } from './world-selection.js';
import { browserStorage } from '../../../server/src/client.js';
import { lastWorld, rememberWorld } from './world-memory.js';
import { enterSurface, exitSurface, interfaceMotionAllowed, resetSurface } from '../ui/interface-motion.js';
import { WORLD_CLAIMED_EVENT } from './world-events.js';
import { TerritoryChat } from './territory-chat.js';
import { borderSegments, cellXY, fogAtLastLook, fogRings, fogShift, loopPhase, newCellIds, ownCentre, ranking, standing, takeovers } from './world-growth.js';
import type { FogRing, FogShift, Takeover } from './world-growth.js';
import { ONLINE } from '../../../src/strings.js';

/** A tile grown this recently keeps its halo (the map shows where the world is moving). */
const FRESH_MS = 6 * 60 * 60 * 1000;
/** The wide-screen layout (online-css.ts, THE DESKTOP STAGE): the same media query. */
/** One cell's width on the stage at rest: big enough to read, small enough to see a region. */
const STAGE_CELL_PX = 54;
const desktopStage = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(min-width: 960px) and (min-height: 560px) and (min-aspect-ratio: 5/4)').matches;

/**
 * THE KEY ROW'S TRAVEL ORDER, as a pure list, so it is testable without a browser.
 *
 * The row is laid out next to MENU, so the key nearest MENU is the LAST in document order. That one
 * leads the roll-out (`--key-i` 0); the farthest trails it. The array is the `--key-i` for each key
 * in document order: `[count-1, …, 1, 0]`. Derived from the live row's length, never from a fixed
 * selector list, so a fourth or fifth key is indexed the moment it exists.
 */
export const keyRowOrder = (count: number): number[] =>
  Array.from({ length: Math.max(0, count) }, (_, index) => count - 1 - index);
/** How long a freshly opened challenge sheet ignores presses: longer than a tap's own click, shorter than a deliberate answer. */
const SHEET_GUARD_MS = 450;
/**
 * THE OTHER PLAYERS' MARK, drawn smaller (owner, 2026-10-29: "clear distinction between my tiles that
 * are challenged -- and challenges other people have over tiles"). The distinction is SHAPE and
 * weight, never colour alone: my mark is the filled trace at full size with a tap target, theirs is
 * the outline of the same trace at 78%, dimmer, with no target. One constant, so the two weights
 * cannot drift.
 */
const QUIET_SWORDS_SCALE = 0.78;
/** Motes drifting off held ground: few on purpose (they are atmosphere, not effects). */
const SPORE_COUNT = 7;
/**
 * THE KEYS' ICONS (owner, 2026-10-28: "ranking -123 style podium, challenges swords, chat chat
 * icon"; LATEST and its book were removed for now the same day). Line icons in the key's own ink on a 24-unit grid; the swords are
 * the map's own traced glyph, so one mark means challenges everywhere.
 */
const KEY_ICON = (body: string, viewBox = '0 0 24 24') =>
  `<svg class="world-key-icon" viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;
const WORLD_KEY_ICONS = {
  ranking: KEY_ICON('<path class="line" d="M3 20.5h18M9 20.5V8.5h6v12M3.5 20.5v-8h5.5M20.5 20.5V14H15"/>' +
    '<text x="12" y="14.6" text-anchor="middle">1</text><text x="6.2" y="18.4" text-anchor="middle">2</text><text x="17.8" y="19.1" text-anchor="middle">3</text>', '2.5 5 19 19'),
  challenges: KEY_ICON(`<path class="fill" d="${SWORD_PATH}"/>`, '-7.6 -7.6 15.2 15.2'),
  chat: KEY_ICON('<path class="line" d="M5 5h14v11H10l-5 4V5Z"/><path class="line" d="M8 9h8M8 12h5"/>'),
  // ACHIEVEMENTS (owner, 2026-10-29): a medal on its ribbon, the star in the key's own ink.
  achievements: KEY_ICON('<path class="line" d="M8.2 3.5 12 9.2l3.8-5.7"/><circle class="line" cx="12" cy="15" r="5.6"/>' +
    '<path class="fill" d="m12 11.9 1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3Z"/>'),
  // YOUR COLOUR (owner, 2026-10-30): a paint drop, half filled — the key's own ink, like the rest.
  colour: KEY_ICON('<path class="line" d="M12 3.6c3.5 3.9 5.9 6.9 5.9 9.4a5.9 5.9 0 0 1-11.8 0c0-2.5 2.4-5.5 5.9-9.4Z"/>' +
    '<path class="fill" d="M12 11.2a3.6 3.6 0 0 1 3.6 3.6H8.4A3.6 3.6 0 0 1 12 11.2Z"/>'),
} as const;
type Pane = 'ranking' | 'challenges' | 'achievements' | 'colour';
/**
 * HOW LONG THE GLIDE TAKES, AND HOW IT MOVES (owner, 2026-10-29: "the 'out of map' territory
 * animation is too fast and too jumpy - a bit slower, way smoother, without costing much CPU at all").
 *
 * 380 ms was too quick for a move across the whole map, but the speed was only half of it: the old
 * curve `1 - (1 - t) ** 3` is an ease-OUT cubic with no ease-in at all, so the camera covered ~87.5%
 * of the distance in the FIRST HALF of the time — it snapped, then crawled. A longer duration on
 * that curve would only have made the crawl longer, so the curve had to change too.
 *
 * 560 ms is one slow breath (inside 520–620 ms). `glideProgress` is a true smoothstep: it leaves
 * rest gently, arrives gently, and is exactly half-way at half-time. It is NOT the CSS
 * `easeOpen` bezier (0.22, 1, 0.36, 1): that bezier is another hard ease-out — 96% of the travel at
 * the midpoint — so the same words would have measured like the old curve.
 */
export const GLIDE_MS = 560;
/**
 * The glide's curve, as a pure function so a test can hold it: 3t² - 2t³ (true smoothstep).
 * Zero speed at both ends, 1.5x the average speed at the middle, `glideProgress(0.5) === 0.5`.
 * Exported only so `web/tests/territory-glide.test.ts` can prove the shape without a browser.
 */
export const glideProgress = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};
/** The soft-focus layers stay off this long after a gesture ends, so a quick second flick never re-blurs mid-motion. */
const SETTLE_MS = 140;
/**
 * THE MIST'S HAND-OFF (owner, 2026-10-28: "the way the empty tiles around the 'discovered' is
 * changing colors, shading — i like that, but make it smooth more transition like rather than
 * sudden changes"). The same 520 ms as `world-rise` (online-css.ts): the uncovered mist lifting and
 * the fresh land rising are ONE moment, not two tempos, so no new duration token is introduced.
 */
const FOG_LIFT_MS = 520;
/**
 * THE TAKEOVER'S ONE MOMENT (owner, 2026-10-29: "create a special animation for that tile take over
 * - simple but impressive"). Long enough to read a colour drain and a single edge flash, short
 * enough that the map never feels stuck; the same order of magnitude as the mist's 520 ms hand-off
 * and shorter than the old settle ring's 1.25 s. No new duration token, no blur: a fill's opacity
 * and one stroke's opacity, both composited.
 */
const TAKEOVER_MS = 900;
/**
 * TAP, DRAG AND DOUBLE TAP (owner, 2026-10-28: "it should be possible to 'scroll' around the map
 * always when holding and dragging finger. quick double tap should zoom out / zoom in, right now
 * all of this is a bit buggy and glitchy").
 *
 * The map had no double tap at all, and its drag threshold was 3 CSS pixels — so a finger that
 * jittered 4px while tapping panned the map and swallowed the selection instead. These are the
 * numbers the gestures now share, in CSS pixels and milliseconds:
 *
 * - `TAP_SLOP`: how far a finger may travel and still be a TAP. The map does not move at all below
 *   it, so a tap can never nudge the view, and a slightly unsteady tap still selects.
 * - `DOUBLE_TAP_MS` / `DOUBLE_TAP_SLOP`: two taps inside both are ONE double tap (a zoom toggle).
 *   A slower second tap, or one further away, is two ordinary taps and selects twice.
 * - `DOUBLE_TAP_IN` / `DOUBLE_TAP_OUT`: the toggle's two factors. `set()` clamps either way, so the
 *   "in" level can never pass a quarter of the framed view.
 */
const TAP_SLOP = 6;
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_SLOP = 30;
const DOUBLE_TAP_IN = 2.2;
const DOUBLE_TAP_OUT = 0.46;
/**
 * How long a released finger is remembered for (see `lastRelease`). A finger that the browser
 * reported gone but keeps moving comes back within a frame or two; anything longer is a genuinely
 * finished gesture and must not be resurrected by a later move.
 */
const RESUME_MS = 700;

/**
 * A VIEW OF THE MAP: x, y, width and height in world units — the four numbers of `viewBox`.
 */
export type ViewBox = [number, number, number, number];

/**
 * THE MAP CANNOT LOSE ITS ZOOM (owner, 2026-10-29: "sometimes zoom in zoom out on territory doesnt
 * work — i was just testing on desktop and wasnt able to zoom at some point randomly — add a fix").
 *
 * The view used to be trusted. `zoom()` divided the finger's position by the map's measured box, and
 * a box of 0 x 0 — measured while the panel was hidden, mid-transition or mid-repaint — made that
 * anchor Infinity (or 0/0), so the new view inherited it. From then on EVERY clamp was arithmetic on
 * NaN (`Math.max(closest, Math.min(frame, NaN))` is NaN), `viewBox` was written as
 * "NaN NaN NaN NaN", the map drew nothing and zoom could never come back: no error, no way out but
 * a reload. The same trust let a view that is `null` (a fresh visit drops it, see `open`) freeze the
 * wheel and the double tap, because each path began with `if (!this.box) return`.
 *
 * So the view is checked at ONE boundary, in the numbers, not in the DOM: every read goes through
 * `usableView`, and every write goes through the two pure steps below (`zoomedView`, `clampedView`),
 * which are allowed to return four finite numbers and nothing else. A view that cannot be trusted is
 * replaced by the frame it was standing in, never propagated. Tested by web/tests/world-zoom.test.ts.
 */
export const usableView = (box: readonly number[] | null | undefined): box is ViewBox =>
  !!box && box.length === 4 && box.every((value) => Number.isFinite(value)) && box[2]! > 0 && box[3]! > 0;

/** The same view, or a copy of `fallback` — never a reference a caller could write through. */
export const finiteView = (box: readonly number[] | null | undefined, fallback: ViewBox): ViewBox =>
  usableView(box) ? [box[0], box[1], box[2], box[3]] : [fallback[0], fallback[1], fallback[2], fallback[3]];

/**
 * A FRACTION OF THE MAP, clamped to it. Anything that is not a number has no honest position, and a
 * wrong anchor is worse than a dull one, so it becomes the centre.
 */
const unit = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;

/**
 * WHERE THE FINGER (or the pointer) IS, as a fraction of the map: 0..1 on each axis, clamped so a
 * point that somehow arrives from outside the map can never throw the view past the world.
 *
 * A map that cannot be measured has NO honest anchor, and a wrong one is worse than a dull one: the
 * centre (0.5, 0.5) keeps the zoom where the player is looking and, above all, keeps it finite.
 */
export const viewAnchor = (
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
): [number, number] => {
  const fraction = (at: number, from: number, size: number): number =>
    !Number.isFinite(at) || !Number.isFinite(from) || !Number.isFinite(size) || size <= 0
      ? 0.5
      : unit((at - from) / size);
  return [fraction(x, rect.left, rect.width), fraction(y, rect.top, rect.height)];
};

/**
 * ONE ZOOM STEP about an anchor — the map's zoom, as arithmetic. The anchor stays under the same
 * point, both axes scale by the same factor (the view's OWN aspect, so hexes stay true), and the
 * framed view is both ends: `frame / 4` is as far in as it goes, `frame` as far out.
 *
 * Identical to the numbers it replaced whenever the view is sound, which is what keeps the feel.
 */
export const zoomedView = (
  box: readonly number[] | null | undefined,
  anchor: readonly [number, number],
  scale: number,
  frame: ViewBox,
): ViewBox => {
  const [bx, by, bw, bh] = finiteView(box, frame);
  const step = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const ax = unit(anchor[0]);
  const ay = unit(anchor[1]);
  const width = Math.max(frame[2] / 4, Math.min(frame[2], bw / step));
  const height = width * bh / bw;
  return finiteView([bx + ax * (bw - width), by + ay * (bh - height), width, height], frame);
};

/**
 * THE ONE PLACE A VIEW IS MADE LEGAL: the framed view is both zoom limits, the width keeps the
 * view's own aspect, and the pan is clamped to the world's fit box (which carries `PAD`, so the
 * outermost column can come clear of the panel's rounded corner on both axes). A view wider than
 * the world is centred on it instead.
 */
export const clampedView = (
  box: readonly number[] | null | undefined,
  fit: ViewBox,
  frame: ViewBox,
  closest: number,
): ViewBox => {
  const [bx, by, bw, bh] = finiteView(box, frame);
  const aspect = bw / bh;
  const floor = Number.isFinite(closest) && closest > 0 ? closest : frame[2] / 4;
  const width = Math.max(floor, Math.min(frame[2], bw));
  const height = width / aspect;
  const [fx, fy, fw, fh] = fit;
  const x = width >= fw ? fx + (fw - width) / 2 : Math.max(fx, Math.min(fx + fw - width, bx));
  const y = height >= fh ? fy + (fh - height) / 2 : Math.max(fy, Math.min(fy + fh - height, by));
  return finiteView([x, y, width, height], frame);
};

/**
 * THE POINTERS A NEW EVENT PROVES ARE GONE (see `pointers`). A mouse is ONE pointer: it has one
 * position and one button state, so a second tracked mouse id, or a tracked mouse id at the moment
 * the event says every button is up, is a release this map never saw — the browser delivered the
 * `pointerup` to its own chrome, or the window lost the event. Left in `pointers`, such a ghost made
 * `size > 1` forever: `finish` never cleared `dragged`/`multiGesture`, and every later tap — and so
 * every double tap, and so the zoom toggle — was swallowed by a pinch that had ended.
 *
 * A FINGER is exempt: touch releases are the browser's own business (see `recapture`, `lastRelease`),
 * and a mouse press must never drop a finger that is still on the map.
 */
export const stalePointers = (
  pointers: ReadonlyMap<number, { touch: boolean }>,
  event: { id: number; pointerType: string; buttons: number; down: boolean },
): number[] => {
  if (event.pointerType === 'touch') return [];
  const stale: number[] = [];
  for (const [id, pointer] of pointers) {
    if (pointer.touch) continue;
    // A press: any OTHER mouse id cannot be down at the same time. A move/release: every button up
    // means no mouse id can be held at all.
    if (event.down ? id !== event.id : event.buttons === 0) stale.push(id);
  }
  return stale;
};

type Identity = { token: string; playerId: string };

/**
 * The wallet line above the map (2026-10-22). It never tells a signed-in player to sign in: before
 * the identity resolves it says nothing, a player with an identity sees their balance once it
 * arrives (and nothing while it has not), and only a player with NO identity is asked to sign in.
 */
export const walletLine = (s: { identityKnown: boolean; hasIdentity: boolean; wallet: SeedWallet | null }): string | null => {
  if (s.wallet) return seedBalanceLabel(s.wallet.balance);
  if (!s.identityKnown || s.hasIdentity) return null;
  return 'SIGN IN TO GROW';
};
type World = WorldMapPayload['world'];
const NS = 'http://www.w3.org/2000/svg';
const R = 10;
const X = Math.sqrt(3);
/**
 * THE MAP'S OWN GUTTER, in world units, on all four sides of the world's extent. It is the inner
 * padding of the pannable content (owner, 2026-10-21: an edge cell must clear the panel's 14px
 * rounded corner at the end of a pan). At 18 units — a little under one hex height — it is ~40px at
 * the large view's scale, so the outermost column/row is never clipped by the border.
 */
const PAD = 18;
/**
 * THE FIT VIEW'S EDGE, in world units (owner, 2026-10-23: "max zoom out leaves minimal margin on
 * the sides of the whole map"). Zoomed all the way out nothing is panned, so the large view's PAD
 * gutter is not needed: the silhouette is framed with just this hairline of sea (~4px on a phone).
 */
const FIT_EDGE = 3;
/**
 * THE SMALLEST A CELL MAY BE DRAWN in the large view, in CSS pixels. The owner's touch minimum is
 * 44px; one hex is √3·R = 17.32 world units wide, so the framed view is capped at the width that
 * keeps a cell at 46px — two pixels of headroom over the minimum, for stroke and rounding. FIT mode
 * is exempt: there the whole silhouette is a preview.
 */
const MIN_CELL_PX = 46;
const coords = (q: number, r: number) => ({ x: X * (q + r / 2) * R, y: 1.5 * r * R });
/**
 * THE CROSSED SWORDS are a literal vector trace of the owner's reference (2026-10-25: "i want you
 * to trace the reference picture as it is and use that"), not a redrawing. `swords-glyph.ts` holds
 * the one closed silhouette of the whole X — both swords, both guards, both grips and both pommels
 * — already centred on 0,0 and scaled so its furthest point is 7.0 map units from the centre. The
 * hex inradius is 8.66, so the mark keeps its air to the timer ring. Because the X is IN the path,
 * `makeMarker` draws it once; it must never go back to rotating two copies into an X.
 */
const hexPath = (x: number, y: number) => {
  const points = [[0, -1], [X / 2, -0.5], [X / 2, 0.5], [0, 1], [-X / 2, 0.5], [-X / 2, -0.5]];
  return points.map(([dx, dy], index) => `${index ? 'L' : 'M'}${(x + dx! * R).toFixed(2)},${(y + dy! * R).toFixed(2)}`).join(' ') + 'Z';
};
/**
 * TILE JITTER (owner, 2026-10-30: "a slight per-tile hue/brightness jitter derived from the CELL id
 * (so a mass of one colour is not a single flat slab)"). `TILE_JITTER` are lightness offsets in
 * points; a cell picks its band from its own id, so the patchwork is stable for ever (no flicker
 * between polls, no random re-roll on a repaint) and costs no per-frame work — the band only selects
 * one of the gradients already built in `<defs>`.
 */
export const TILE_JITTER = [-2.6, -0.9, 0.9, 2.6] as const;
/** FNV-1a over the CELL id → which jitter band that tile wears. Pure, so both paints agree. */
export const jitterBand = (cellId: string): number => {
  let hash = 2166136261;
  for (const character of cellId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % TILE_JITTER.length;
};
/**
 * An owner colour at a different lightness. Everything a tile's gradient needs is its own hue and
 * saturation; the ladder (`HELD_*` / `MINE_*` in `src/tile-colours.ts`) is shared with the palette,
 * so one definition dresses both a swatch and a tile (`shiftLightness`). Shading in JS from the
 * colour the server already sent keeps the palette closed — it cannot drift from `--territory`.
 */

/** One shared map, with a stable viewport and revision-only refresh. No game-state logic here. */
export class WorldView {
  private active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private identity: Identity | null = null;
  private wallet: SeedWallet | null = null;
  private world: World | null = null;
  /**
   * THIS PLAYER'S COLOUR (owner, 2026-10-30): the palette slot the server reports (a stored choice or
   * the derived default), the slot a save is in flight for, and whether this server knows the route
   * at all (a server that predates the palette hides the key instead of failing).
   */
  private myColourId: number | null = null;
  private colourSaving: number | null = null;
  private colourAvailable = true;
  private colourSignature = '';
  /** The map on screen came from the device's memory (./world-memory.ts), not this session's server. */
  private fromMemory = false;
  /** The player's identity has resolved (to someone, or to nobody). Until then the wallet line is blank. */
  private identityKnown = false;
  private selected: string | null = null;
  /** The cells on the map at the last paint: new ones rise in (null before the first paint). */
  private knownCells: Set<string> | null = null;
  /**
   * The fog at the last paint, and the hand-off still in flight. The map is rebuilt wholesale on
   * every paint, so the old mist nodes cannot animate out — these two are the DATA that lets the
   * next paint redraw the same hand-off instead of cutting it (see `fogShift`).
   */
  private fogCells: Map<string, FogRing> | null = null;
  private mistShift: FogShift | null = null;
  private mistShiftAt = 0;
  /** When the fog's slow breath started, so a rebuilt map continues it instead of restarting it. */
  private mistAt: number | null = null;
  /** MENU's row of four keys is out (owner, 2026-10-28). */
  private keysOpen = false;
  /** The one window, and which key's page it shows; null when shut. */
  private pane: Pane | null = null;
  /** Territory chat (web/src/online/territory-chat.ts): opens from its key in the row. */
  private readonly chat: TerritoryChat;
  /** The grow and sell keys ask once more before they act; this is the tile that was asked about. */
  private growArmed: string | null = null;
  private sellArmed: string | null = null;
  /** A grow or sell on its way to the server: its key stays in the bar, dimmed, so nothing jumps. */
  private working: 'grow' | 'sell' | null = null;
  /** What the tile bar and the window last drew, so a 12 s poll that changes nothing touches no DOM. */
  private selectionSignature = '';
  private paneSignature = '';
  /**
   * TERRITORY ACHIEVEMENTS, as the server last reported them. `null` = not available (a guest, or a
   * server that predates them): the key stays hidden, so the page is safe on either server.
   */
  private achievements: AchievementView[] | null = null;
  /** The achievement whose CLAIM is on its way, and the one that just paid (for its moment). */
  private claimingAchievement: string | null = null;
  private justClaimed: string | null = null;
  /** What the map was last drawn from: an unchanged world is never rebuilt. */
  private paintSignature = '';
  /** One pending viewBox write per frame, however many pointer events arrive in it. */
  private viewFrame = 0;
  private glideFrame = 0;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRequest: string | null = null;
  private busy = false;
  private svg: SVGSVGElement | null = null;
  /** The single top-most path that carries the selection highlight (see `paintAccent`). */
  private accent: SVGPathElement | null = null;
  private box: ViewBox | null = null;
  private fit: ViewBox | null = null;
  /** The smallest view the window allows — the framed view; see `boundsFor`. */
  private bounds: ViewBox | null = null;
  /** True once the player has panned or zoomed, so a re-frame never throws their view away. */
  private touched = false;
  /** The panel's measured aspect from the last paint/resize. */
  private aspect = 0;
  /** The panel's measured width in CSS pixels — the only way to hold the MIN_CELL_PX floor. */
  private pixels = 0;
  private observer: ResizeObserver | null = null;
  private pointers = new Map<number, { x: number; y: number; touch: boolean }>();
  private dragged = false;
  private multiGesture = false;
  /** The tap that just landed, waiting to find out whether a second one makes it a double tap. */
  private lastTap: { at: number; x: number; y: number } | null = null;
  /** Where the gesture began, in client coordinates, in this gesture's own scratch space. */
  private gestureStart: { x: number; y: number } | null = null;
  /** Removes the gesture's window-level listeners when the map is repainted (see installPanZoom). */
  private gestureCleanup: (() => void) | null = null;
  /**
   * THE RELEASE THE FINGER DISAGREED WITH (owner, 2026-10-28 on an iPhone: "it selects a tile but
   * dragging doesn't move the map and zooming stops working too").
   *
   * iOS can report the END of a gesture — a release that lands on the browser's own chrome, or a
   * `pointerup` dispatched at the document — and then keep sending moves for the SAME finger under
   * the same `pointerId`. A gesture that is cleared on that report and then ignores those moves is
   * a map that is dead until the finger lifts: no pan, no pinch, while a tap (which needs no move)
   * still selects. That is exactly the symptom the owner saw.
   *
   * This is the position the finger had when the map was told it was gone, kept for `RESUME_MS`:
   * if a move for that finger arrives with it still down, the gesture is taken back AT that
   * position, so the pan continues from where it was instead of jumping or being lost.
   *
   * ONLY a `pointerup` is remembered. A `pointercancel` means the browser has taken the gesture, so
   * it is a hard end (see `end`): nothing of a cancelled gesture may be resumed, or a stray move
   * could drag the map by the distance that gesture had already spent.
   */
  private lastRelease: { id: number; x: number; y: number; at: number } | null = null;

  // ---- Territory challenges -------------------------------------------------
  /** The authenticated challenge lists. Empty for a guest until identity resolves. */
  private challenges: WorldChallengesPayload = { incoming: [], outgoing: [], serverNow: Date.now() };
  /** When the payload landed, so the ring keeps draining between 12 s polls. */
  private challengeReceivedAt = Date.now();
  private challengeSignature = '';
  /** The live ring paths, reused across polls so `stroke-dashoffset` can transition smoothly. */
  private readonly ringPaths = new Map<string, { path: SVGPathElement; challenge: WorldChallengeWire }>();
  private ringsGroup: SVGGElement | null = null;
  /**
   * The crossed swords on a contested tile, keyed by challenge id and REUSED across polls exactly as
   * the ring paths are: a focused marker must survive the 12 s refresh, and removing a marker takes
   * it off the map in the same frame the data closes the challenge.
   */
  private readonly markerNodes = new Map<string, { group: SVGGElement; hit: SVGCircleElement }>();
  /**
   * THE OTHER PLAYERS' DISPATCH (owner, 2026-10-29): one `<path>` per disputed tile that is not
   * mine, keyed by `others:<cellId>`. No wrapper, no hit disc, no listener — a hollow glyph is one
   * node, so 100 disputes cost 100 nodes on a map that already draws thousands.
   */
  private readonly quietNodes = new Map<string, SVGPathElement>();
  /** The public dispute list from the last `/v1/world` read. Never cached to the device. */
  private disputes: WorldDispute[] = [];
  private disputesGroup: SVGGElement | null = null;
  private swordsGroup: SVGGElement | null = null;
  private marksGroup: SVGGElement | null = null;
  /**
   * THE TAKEOVER, kept as DATA across paints (see `takeovers` in world-growth.ts). The map is rebuilt
   * wholesale, so the hand-off is redrawn by `paint()` from this record with a negative animation
   * delay — a repaint mid-animation continues the same moment instead of cutting it.
   */
  private takeoverShift: Takeover[] = [];
  private takeoverAt = 0;
  /** The quiet hexes that ring the challenger's own tile at risk, keyed by challenge id. */
  private readonly stakeNodes = new Map<string, SVGPathElement>();
  /** Set by lobby-ui once `openMatch` exists, so an accepted challenge can open its duel. */
  private matchOpener: ((matchId: string) => void) | null = null;
  private sheet: {
    root: HTMLElement;
    card: HTMLElement;
    glyph: SVGSVGElement;
    glyphPath: SVGPathElement;
    line: HTMLElement;
    meta: HTMLElement;
    primary: HTMLButtonElement;
    secondary: HTMLButtonElement;
    notice: HTMLElement;
  } | null = null;
  private sheetMode: 'send' | 'defend' | 'wait' | 'duel' | 'settling' | 'resolved' | 'closed' = 'closed';
  private sheetCellId: string | null = null;
  private sheetChallenge: WorldChallengeWire | null = null;
  private sheetRequestId: string | null = null;
  private sheetBusy = false;
  private sheetReturnFocus: HTMLElement | null = null;
  /** When the sheet last appeared: the tap that opened it must not also press a key on it. */
  private sheetShownAt = -Infinity;
  /**
   * The defender's (and the waiting challenger's) clock. The sheet is opened once per tap, but the
   * deadline is live: this re-reads it every second while the sheet is up, so the countdown the
   * player is deciding on is the one the server will apply. It only ever writes when the text
   * actually changes (the label moves once a minute), and it stops with the sheet.
   */
  private sheetClock = 0;
  private readonly onSheetKey = (event: KeyboardEvent): void => {
    const sheet = this.sheet;
    if (!sheet || sheet.root.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeSheet();
      return;
    }
    // The dialog declares `aria-modal`, so Tab must not walk out of it into the map behind. Only
    // the keys actually on the card are in the ring (a hidden primary is not a stop).
    if (event.key !== 'Tab') return;
    const stops = [sheet.primary, sheet.secondary].filter((key) => !key.hidden && !key.disabled);
    if (stops.length === 0) return;
    const active = document.activeElement;
    const at = stops.indexOf(active as HTMLButtonElement);
    event.preventDefault();
    const next = event.shiftKey
      ? (at <= 0 ? stops[stops.length - 1]! : stops[at - 1]!)
      : (at === -1 || at === stops.length - 1 ? stops[0]! : stops[at + 1]!);
    next.focus({ preventScroll: true });
  };

  constructor(private readonly client: DuelClient, private readonly ensureIdentity: () => Promise<Identity | null>) {
    document.addEventListener('visibilitychange', () => { if (this.active && !document.hidden) void this.refresh(); });
    // ONE WINDOW AT A TIME: the chat shuts the menu window, and the menu window shuts the chat.
    this.chat = new TerritoryChat(client, () => this.identity?.token ?? null, () => this.setPane(null, false));
    // THE MENU KEY slides the four keys out; pressing it again folds them, and any open window, away.
    const menu = document.getElementById('online-world-menu');
    if (menu) {
      menu.setAttribute('aria-label', ONLINE.worldMenu);
      menu.title = ONLINE.worldMenu;
      menu.addEventListener('click', () => this.setKeys(!this.keysOpen));
    }
    const row = document.getElementById('online-world-keys');
    row?.setAttribute('aria-label', ONLINE.worldMenu);
    // THE ROW'S ORDER, stamped once from the row itself (never a hardcoded count): `--key-i` 0 is
    // the key nearest MENU, the last is the farthest, and `--key-count` lets the closed state use
    // the SAME stagger formula mirrored. A fourth or fifth key therefore joins the wave the moment
    // it is added to the markup - the old `:nth-last-child(1..3)` list silently left it unindexed.
    const rowKeys = [...(row?.querySelectorAll<HTMLButtonElement>('.world-key') ?? [])];
    const order = keyRowOrder(rowKeys.length);
    rowKeys.forEach((key, index) => key.style.setProperty('--key-i', String(order[index] ?? 0)));
    row?.style.setProperty('--key-count', String(rowKeys.length));
    const names: Record<Pane | 'chat', string> = {
      ranking: ONLINE.worldRanking, challenges: ONLINE.worldChallenges,
      achievements: ACHIEVEMENTS_UI.title, colour: ONLINE.worldColour, chat: ONLINE.worldChat,
    };
    for (const key of rowKeys) {
      const pane = key.dataset.pane as Pane | undefined;
      key.insertAdjacentHTML('afterbegin', WORLD_KEY_ICONS[pane ?? 'chat']);
      key.setAttribute('aria-label', names[pane ?? 'chat']);
      key.title = names[pane ?? 'chat'];
      // The chat key is TerritoryChat's own; the other three open their page of the window.
      if (pane) key.addEventListener('click', () => this.setPane(this.pane === pane ? null : pane));
    }
    document.getElementById('world-panel-close')?.addEventListener('click', () => this.setPane(null));
    const labels: [string, string][] = [['world-current-label', ONLINE.worldCurrent], ['world-history-label', ONLINE.worldHistory]];
    for (const [id, text] of labels) { const node = document.getElementById(id); if (node) node.textContent = text; }
    // Escape steps back one layer: the window, then the row of keys, then the tile.
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.active || (this.sheet && !this.sheet.root.hidden)) return;
      if (this.pane) this.setPane(null);
      else if (this.keysOpen) this.setKeys(false);
      else if (this.selected) this.deselect();
      else return;
      event.stopPropagation();
    });
  }

  /** lobby-ui owns opening a duel; the challenge layer only knows the match id. */
  setMatchOpener(open: (matchId: string) => void): void {
    this.matchOpener = open;
  }

  /** The game's own cue bank, injected by lobby-ui. Absent, the screen stays silent. */
  private cueHook: ((name: string) => void) | null = null;
  setCue(play: (name: string) => void): void {
    this.cueHook = play;
  }
  private cue(name: string) {
    try {
      this.cueHook?.(name);
    } catch {
      /* a missing or muted bank is not an error */
    }
  }

  /**
   * THIS DEVICE's campaign level, injected by lobby-ui from the same progress record the PLAY entry
   * reads (owner report, 2026-10-24: "im at level 23 - but on territory it says im level 11").
   * The server's `ownerLevel` is the last clear it was ever TOLD about, so it lags behind a player
   * whose proofs are still queued; this device knows where the player actually is. Used for the
   * viewer's own tiles only — nobody can know another account's progress.
   */
  private myLevelHook: (() => number | null) | null = null;
  setMyLevel(read: () => number | null): void {
    this.myLevelHook = read;
  }
  private myLevel(): number | null {
    try {
      return this.myLevelHook?.() ?? null;
    } catch {
      return null;
    }
  }

  async open() {
    this.active = true;
    // A fresh visit starts FRAMED to the window (see `boundsFor`), not wherever the last visit was
    // panned to, and re-frames itself if the window's shape changes.
    this.touched = false;
    this.box = null;
    this.notice('');
    // Drawn at once from the last good map this device saw, so the panel is never empty while the
    // server answers (owner, 2026-10-22). The first fresh answer replaces it, whatever its revision.
    if (!this.world) {
      const remembered = lastWorld(browserStorage());
      if (remembered) {
        this.world = remembered;
        this.fromMemory = true;
        this.paint();
      }
    }
    // The world is public. A guest token may be slow, offline or rate-limited; it must never
    // prevent the player from seeing the map. Attach the private wallet when identity resolves.
    const publicRefresh = this.refresh(true);
    void this.ensureIdentity().then((identity) => {
      this.identityKnown = true;
      if (!this.active) return;
      this.identity = identity;
      if (identity) void this.loadColour(identity);
      void this.refresh(true);
    }).catch(() => {
      // Public world remains usable without an identity; the wallet line may now say so.
      this.identityKnown = true;
      if (this.active) this.paintWallet();
    });
    await publicRefresh;
  }
  close(instant = false) {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.chat.setOpen(false);
    // LEAVING FOR A MATCH IS NOT THE SAME AS BACKING OUT (owner, 2026-10-28). Backing out lets the
    // sheet settle away in its own time; going to the duel tears it down now, because the card lives
    // on `<body>` (outside this screen) and would otherwise float over the board during the map's
    // exit beat. `instant` is the only difference: no animation, same teardown.
    this.closeSheet(false, instant);
    // Leaving folds everything away, so the next visit opens on the bare map with only MENU.
    this.setKeys(false, false);
    this.stopGlide();
  }
  private notice(text: string) { document.getElementById('online-world-notice')!.textContent = text; }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    if (this.active) this.timer = setTimeout(() => { if (!document.hidden) void this.refresh(); else this.schedule(); }, 12_000);
  }
  async refresh(force = false) {
    if (!this.active) return;
    try {
      const identityAtRequest = this.identity;
      const [map, wallet, challenges] = await Promise.all([
        this.client.worldMap(),
        // A failed wallet read is `undefined`, not null: the last known balance stays on screen.
        identityAtRequest ? this.client.seedWallet(identityAtRequest.token).catch(() => undefined) : Promise.resolve(null),
        identityAtRequest ? this.client.worldChallenges(identityAtRequest.token).catch(() => null) : Promise.resolve(null),
      ]);
      if (!this.active) return;
      const sameIdentity = identityAtRequest === this.identity;
      const walletChanged = sameIdentity && wallet !== undefined && this.wallet?.balance !== wallet?.balance;
      if (sameIdentity && wallet !== undefined) this.wallet = wallet;
      if (sameIdentity && challenges) {
        this.challenges = challenges;
        this.challengeReceivedAt = Date.now();
      } else if (!this.identity) {
        this.challenges = { incoming: [], outgoing: [], serverNow: Date.now() };
      }
      const signature = this.challengeSignatureOf();
      const challengeChanged = signature !== this.challengeSignature;
      this.challengeSignature = signature;
      // THE PUBLIC DISPUTE LAYER: taken from EVERY read, before the "should the map be replaced"
      // decision below. A dispute appearing or closing does not bump the world's revision, so
      // keeping this on `this.world` would have shown a stale layer for as long as ownership stood
      // still. It is one array reference — no repaint, no timer.
      this.disputes = map.world.disputes ?? [];
      const ownerChanged = this.world?.claims.length !== map.world.claims.length ||
        map.world.claims.some((claim, index) => {
          const previous = this.world?.claims[index];
          return !previous || previous.cellId !== claim.cellId || previous.ownerName !== claim.ownerName ||
            previous.ownerId !== claim.ownerId;
        });
      // A COLOUR IS NOT OWNERSHIP (owner, 2026-10-30): choosing a colour moves no tile and bumps no
      // revision, so the map must notice the colour itself or another device would keep showing the
      // old one until something unrelated happened. Comparing the colours costs one string compare
      // per claim on a read that already happened.
      const colourChanged = this.world?.claims.length !== map.world.claims.length ||
        map.world.claims.some((claim, index) => this.world?.claims[index]?.colour !== claim.colour);
      // The ground that changed hands, captured BEFORE the new map replaces the old one: this is the
      // only moment that knows both answers, and it is what the takeover ceremony points at.
      const moved = takeovers(this.world?.claims ?? null, map.world.claims, interfaceMotionAllowed());
      if (this.fromMemory || !this.world || map.world.revision > this.world.revision ||
        (map.world.revision === this.world.revision && (force || walletChanged || ownerChanged || challengeChanged || colourChanged))) {
        this.world = map.world;
        this.fromMemory = false;
        // Keep the takeover as DATA before the paint, so `paint()` can draw the hand-off (and a later
        // repaint can resume it) rather than relying on an ephemeral DOM node.
        if (moved.length) {
          this.takeoverShift = moved;
          this.takeoverAt = Date.now();
        }
        // SMOOTH REFRESH (owner, 2026-10-28): rebuilding the map throws away every node, its running
        // glints and halos, and a focused tile. Only a change in what the map is drawn from may do
        // that; a forced re-read that brings the same world back keeps the drawn one.
        if (this.paintSignatureOf() !== this.paintSignature) this.paint();
        rememberWorld(browserStorage(), map.world);
        if (moved.length) this.cueTakeover(moved);
      }
      this.paintWallet();
      this.paintPanel();
      this.paintSelection();
      // The ring must keep draining even when the world revision is unchanged (a 24 h timer does not
      // bump ownership). These only touch attributes, the swords and the challenge strip, never the map.
      this.paintRings();
      this.paintSwords();
      this.paintStakes();
      this.paintChallenges();
      // Achievements are re-read only when something they count may have moved (never every poll).
      if (force || ownerChanged || challengeChanged || walletChanged) void this.loadAchievements();
      // LAST: a finished duel is settled by the server on this very read. If this client is the one
      // that has not seen the resolved row yet (or a read raced the settlement), it posts the same
      // idempotent confirm in the background — never a key the player must press.
      this.settleAutomatically();
    } catch {
      if (this.active) this.notice('The world could not refresh. Tap here to try again.');
    } finally { this.schedule(); }
  }

  private challengeSignatureOf(): string {
    return [...this.challenges.incoming, ...this.challenges.outgoing]
      .map((c) => `${c.id}:${c.status}:${c.matchFinished}:${c.winnerId ?? ''}`)
      .join('|');
  }

  private get allChallenges(): WorldChallengeWire[] {
    return [...this.challenges.incoming, ...this.challenges.outgoing];
  }

  /** Server time plus the time elapsed since the payload landed (no client-clock dependency). */
  private challengeNow(): number {
    return (this.challenges.serverNow || Date.now()) + Math.max(0, Date.now() - this.challengeReceivedAt);
  }
    private paintWallet() {
      const node = document.getElementById('online-world-wallet')!;
      node.replaceChildren();
      const line = walletLine({ identityKnown: this.identityKnown, hasIdentity: this.identity !== null, wallet: this.wallet });
      if (line) node.append(seedIcon(22), document.createTextNode(line));
      // The old "N / 183 grown - one shared world" caption is GONE (owner, 2026-10-16): the map shows
      // the world, so a caption counting it was noise. The element no longer exists in the markup, and
      // this method no longer writes to it.
    }
  /** Everything `paint` draws from: the ground, its owners, who is looking and whether they can grow. */
  private paintSignatureOf(): string {
    const world = this.world;
    if (!world) return '';
    const canGrow = !!this.wallet && this.wallet.balance >= world.cost;
    return [world.revision, world.version, world.cost, this.identity?.playerId ?? '', canGrow,
      world.cells.map((cell) => cell.id).join(';'),
      world.claims.map((c) => `${c.cellId}:${c.ownerId}:${c.colour}:${c.ownerName ?? ''}:${c.ownerTag}:${c.claimedAt}`).join(';')].join('|');
  }
  /**
   * The shade the two fog rings were ACTUALLY showing a moment ago, read from the map that is about
   * to be replaced. The rings breathe between their resting opacity and a lower one, so copying the
   * resting value onto the outgoing mist would brighten the very cells being uncovered — a shade
   * jump of exactly the kind this pass removes. Called once per paint, before the rebuild.
   */
  private mistShades(): [number, number] {
    const rings = this.svg?.querySelectorAll<SVGGElement>('.world-fog-ring');
    const shade = (index: number, resting: number): number => {
      const group = rings?.[index];
      if (!group) return resting;
      const value = Number.parseFloat(getComputedStyle(group).opacity);
      return Number.isFinite(value) ? value : resting;
    };
    return [shade(0, 0.42), shade(1, 0.16)];
  }
  private paint() {
    const container = document.getElementById('online-world-grid')!;
    const world = this.world!;
    this.paintSignature = this.paintSignatureOf();
    const occupied = new Map(world.claims.map((claim) => [claim.cellId, claim]));
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', 'Shared hexagonal world. Choose a tile to inspect it.');
    svg.classList.add('world-map-svg');
    // Every tile is shaded by its OWN gradient, so a hex reads as a physical surface with a light
    // from the top-left rather than as flat paint (owner, 2026-10-16: "give it some personality and
    // some life"). One gradient per distinct owner colour, built from that colour's own hue and
    // saturation, plus ONE deliberately flat dark one for unclaimed ground so empty tiles stay
    // recessive. Nothing here changes geometry: the paths and the viewBox maths are untouched.
    //
    // LESS PLAIN, FOR NO PER-FRAME COST (owner, 2026-10-30: "add another 2 things that make them
    // less 'plain' but wont take any time to load / cpu"). Two additions, both pure paint:
    //
    //  1. TILE JITTER. Each colour gets `JITTER_BANDS` gradients whose lightness is nudged a couple
    //     of points apart, and each CELL picks its band from its own id. A territory therefore reads
    //     as land rather than as one flat slab — the highest-value change for a big blob of one
    //     colour. It costs a few more gradients in `<defs>` (built once, with the map) and NOTHING
    //     per frame: the same path still references a static `url(#…)`.
    //  2. A TOP-LEFT RIM. One shared white-to-transparent gradient used as the FACE's stroke, so the
    //     light catches the upper-left arc of every held tile. One extra `<linearGradient>` for the
    //     WHOLE map and no new nodes at all — it rides the paths that already exist.
    const defs = document.createElementNS(NS, 'defs');
    let seq = 0;
    const face = (from: string, mid: string, to: string): string => {
      const id = `world-face-${seq++}`;
      const g = document.createElementNS(NS, 'linearGradient');
      g.setAttribute('id', id);
      g.setAttribute('x1', '0'); g.setAttribute('y1', '0');
      g.setAttribute('x2', '1'); g.setAttribute('y2', '1');
      for (const [offset, colour] of [['0', from], ['.55', mid], ['1', to]] as const) {
        const stop = document.createElementNS(NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', colour);
        g.append(stop);
      }
      defs.append(g);
      return `url(#${id})`;
    };
    const EMPTY_FACE = face('#2b322c', '#242a25', '#1a1f1b');
    // THE RIM: one gradient for the whole map, from the top-left corner to the bottom-right, used as
    // a stroke on every held face. White at the light end, gone by the middle, so only the arc that
    // faces the light is drawn. No filter, no blur, no new path.
    const rim = document.createElementNS(NS, 'linearGradient');
    rim.setAttribute('id', 'world-rim');
    rim.setAttribute('x1', '0'); rim.setAttribute('y1', '0');
    rim.setAttribute('x2', '1'); rim.setAttribute('y2', '1');
    for (const [offset, opacity] of [['0', '0.42'], ['.5', '0.06'], ['1', '0']] as const) {
      const stop = document.createElementNS(NS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', '#fff6e2');
      stop.setAttribute('stop-opacity', opacity);
      rim.append(stop);
    }
    defs.append(rim);
    /** The rim as a `stroke` value, and how thick it is: 0.7 world units ≈ 1.9 CSS px at 46 px cells. */
    const RIM = 'url(#world-rim)';
    const RIM_WIDTH = '0.7';
    /** `TILE_JITTER` bands of one colour: the SAME hue, a couple of lightness points apart. */
    const faceBands = (colour: string, mine: boolean): string[] => {
      const mid = mine ? MINE_MID : 0;
      const light = mine ? MINE_LIGHT : HELD_LIGHT;
      const dark = mine ? MINE_DARK : HELD_DARK;
      return TILE_JITTER.map((offset) => face(
        shiftLightness(colour, light + mid + offset),
        shiftLightness(colour, mid + offset),
        shiftLightness(colour, -dark + mid + offset),
      ));
    };
    const heldFace = new Map<string, string[]>();
    const mineFace = new Map<string, string[]>();
    for (const claim of world.claims) {
      if (!heldFace.has(claim.colour)) heldFace.set(claim.colour, faceBands(claim.colour, false));
      // Your own territory: the same hue one step brighter, so it is spotted at a glance without a
      // second colour entering the palette.
      if (!mineFace.has(claim.colour)) mineFace.set(claim.colour, faceBands(claim.colour, true));
    }
    svg.append(defs);
    // SOFT FOCUS (owner, 2026-10-28: "blur it slightly, so everything looks natural and organic
    // rather than rendered 2d basic stuff"). One Gaussian per depth, in map units, shared by every
    // living layer: mist, motes, halos, the outline's glow and the grow ripple.
    for (const [id, sd] of [['world-blur-mist', 0.9], ['world-blur-mote', 0.45], ['world-blur-glow', 1.1]] as const) {
      const filter = document.createElementNS(NS, 'filter');
      filter.id = id;
      for (const [k, v] of [['x', '-60%'], ['y', '-60%'], ['width', '220%'], ['height', '220%'], ['color-interpolation-filters', 'sRGB']]) filter.setAttribute(k!, v!);
      const blur = document.createElementNS(NS, 'feGaussianBlur');
      blur.setAttribute('stdDeviation', String(sd));
      filter.append(blur);
      defs.append(filter);
    }
    // TWO LAYERS, so a stroke is never buried by a neighbour's fill — the cause of the owner's
    // uneven highlight (2026-10-16: a cream edge only on the sides facing open ground, and no line
    // at all between two highlighted tiles). Every FILL goes in `faces` and paints first; every
    // STROKE, plus the whole touch target, goes in `lines` and paints ABOVE all fills, so a tile
    // edge is always drawn over its neighbour's surface. The selected tile then draws once more,
    // last of all, in `world-accent`, so its highlight is never half-eaten by a neighbour's edge.
    // Each line is still the `world-hex` element (data, focus, pointer target), so nothing else
    // about the map changes.
    // THE FOG (owner, 2026-10-27): the land underneath that nobody has uncovered yet, two faint
    // rings beyond the coast, so the map visibly has somewhere to grow. Never a tap target.
    const seenIds = new Set(world.cells.map((cell) => cell.id));
    const anywhere = world.version >= 3;
    const own = new Set(world.claims.filter((claim) => claim.ownerId === this.identity?.playerId).map((claim) => claim.cellId));
    // THE MIST'S HAND-OFF (owner, 2026-10-28). This whole map is rebuilt on every paint, so a cell
    // that becomes seen used to lose its fog in the same frame: a cut, with the land's shading
    // arriving at full strength. Instead the fog of the LAST paint is remembered on the view and the
    // diff is drawn once more as a short overlay — the old mist fades off the new face while the
    // ring beyond fades to its new shade underneath it. `fogShift` owns the diff and the
    // Reduce-motion gate; `fogAtLastLook` is what makes it survive a repaint (it rebuilds the fog
    // the eye was actually seeing, including a hand-off that is still in flight).
    const nowMs = Date.now();
    const inFlight = this.mistShift && nowMs - this.mistShiftAt < FOG_LIFT_MS ? this.mistShift : null;
    const fogNow = fogRings(seenIds);
    const shift = fogShift(fogAtLastLook(this.fogCells, inFlight), fogNow, interfaceMotionAllowed());
    // Nothing NEW to hand off, but one is still running: keep drawing it, so a repaint that changes
    // no fog cannot snap a half-lifted mist to settled.
    const shown = shift.lift.length || shift.deepen.length || shift.arrive.length ? shift : inFlight;
    // Resumed, not restarted: a second paint inside the hand-off keeps the layer's own clock.
    const resume = inFlight ? Math.min(FOG_LIFT_MS, nowMs - this.mistShiftAt) : 0;
    // The shade the old mist was really showing. The ring groups breathe, so their resting opacity
    // is not what the eye last saw; this is read from the map about to be replaced (see `mistShades`).
    const mist = this.mistShades();
    const shiftingCells = new Set<string>();
    if (shown) {
      for (const cell of shown.lift) shiftingCells.add(cell.id);
      for (const cell of shown.deepen) shiftingCells.add(cell.id);
      for (const cell of shown.arrive) shiftingCells.add(cell.id);
    }
    const fogLayer = document.createElementNS(NS, 'g');
    fogLayer.classList.add('world-fog-layer');
    fogLayer.setAttribute('aria-hidden', 'true');
    fogLayer.setAttribute('filter', 'url(#world-blur-mist)');
    // Two groups, one per ring, so the mist can breathe as TWO animations, not one per hex.
    const fogRing = [1, 2].map((ring) => {
      const g = document.createElementNS(NS, 'g');
      g.classList.add('world-fog-ring', `ring-${ring}`);
      fogLayer.append(g);
      return g;
    });
    // THE BREATH CONTINUES. A new node would start both loops at full strength (.42 / .16) on every
    // repaint — the whole fog flashing brighter whenever anyone grows a tile, which is the other
    // half of the owner's "sudden changes". The elapsed time is fed back as a negative delay.
    if (this.mistAt === null) this.mistAt = nowMs;
    const mistElapsed = nowMs - this.mistAt;
    fogRing[0]!.style.animationDelay = loopPhase(mistElapsed, 9000);
    fogRing[1]!.style.animationDelay = loopPhase(mistElapsed, 13000);
    const fogPath = (id: string, ring: FogRing): SVGPathElement => {
      const [q, r] = id.split(',').map(Number) as [number, number];
      const at = coords(q, r);
      const fog = document.createElementNS(NS, 'path');
      fog.setAttribute('d', hexPath(at.x, at.y));
      fog.setAttribute('data-cell-id', id);
      fog.classList.add('world-fog', `ring-${ring}`);
      return fog;
    };
    for (const [id, ring] of fogNow) {
      // A cell in the hand-off is drawn by the overlay BELOW, once: never two mists on one hex.
      if (shiftingCells.has(id)) continue;
      fogRing[ring - 1]!.append(fogPath(id, ring));
    }
    // The overlay: two halves, one clock each. `was` is the mist the eye last saw (fading away),
    // `now` is the shade the coast has just reached (fading up). Both are blurred exactly like the
    // ambient fog and both carry `pointer-events: none`.
    let fogShiftLayer: SVGGElement | null = null;
    if (shiftingCells.size) {
      fogShiftLayer = document.createElementNS(NS, 'g');
      fogShiftLayer.classList.add('world-fog-shift');
      fogShiftLayer.setAttribute('aria-hidden', 'true');
      const shiftWas = document.createElementNS(NS, 'g');
      shiftWas.classList.add('world-fog-shift-was');
      shiftWas.setAttribute('filter', 'url(#world-blur-mist)');
      const shiftNow = document.createElementNS(NS, 'g');
      shiftNow.classList.add('world-fog-shift-now');
      shiftNow.setAttribute('filter', 'url(#world-blur-mist)');
      if (resume > 0) {
        shiftWas.style.animationDelay = `-${resume}ms`;
        shiftNow.style.animationDelay = `-${resume}ms`;
      }
      const wasPath = (id: string, ring: FogRing) => {
        const path = fogPath(id, ring);
        path.style.opacity = String(mist[ring - 1]);
        return path;
      };
      if (shown) {
        for (const cell of shown.lift) shiftWas.append(wasPath(cell.id, cell.ring));
        for (const cell of shown.deepen) shiftWas.append(wasPath(cell.id, cell.from));
        for (const cell of shown.arrive) shiftNow.append(fogPath(cell.id, cell.ring));
        for (const cell of shown.deepen) shiftNow.append(fogPath(cell.id, cell.to));
      }
      fogShiftLayer.append(shiftWas, shiftNow);
    }
    this.fogCells = fogNow;
    this.mistShift = shown;
    this.mistShiftAt = inFlight ? this.mistShiftAt : nowMs;
    // NEW LAND RISES IN: cells that were not on the map at the last look come up one after another,
    // nearest the newest tile first, so an uncovering reads as the land being discovered.
    const fresh = newCellIds(this.knownCells, world.cells.map((cell) => cell.id));
    const newest = [...world.claims].sort((a, b) => b.claimedAt - a.claimedAt)[0];
    const origin = newest ? world.cells.find((cell) => cell.id === newest.cellId) : undefined;
    const from = origin ? cellXY(origin.q, origin.r) : { x: 0, y: 0 };
    const riseOrder = new Map(fresh
      .map((id) => { const [q, r] = id.split(',').map(Number) as [number, number]; const at = cellXY(q, r); return { id, d: Math.hypot(at.x - from.x, at.y - from.y) }; })
      .sort((a, b) => a.d - b.d)
      .map((entry, index) => [entry.id, index] as const));
    if (fresh.length && !this.fromMemory) this.notice(ONLINE.worldNewLand(fresh.length));
    this.knownCells = seenIds;
    const faces = document.createElementNS(NS, 'g');
    faces.classList.add('world-faces');
    const lines = document.createElementNS(NS, 'g');
    lines.classList.add('world-lines');
    // The view's extent is the SEEN land only: FIT keeps its hairline margin (the fog shows in the
    // pan gutter beyond the coast).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const now = this.challengeNow();
    let glint = 0;
    // HALOS: fresh ground glows from underneath, blurred, so the tile's own edge stays crisp.
    const halos = document.createElementNS(NS, 'g');
    halos.classList.add('world-halos');
    halos.setAttribute('aria-hidden', 'true');
    halos.setAttribute('filter', 'url(#world-blur-glow)');
    for (const cell of world.cells) {
      const at = coords(cell.q, cell.r);
      const d = hexPath(at.x, at.y);
      minX = Math.min(minX, at.x - R); maxX = Math.max(maxX, at.x + R);
      minY = Math.min(minY, at.y - R); maxY = Math.max(maxY, at.y + R);
      const owner = occupied.get(cell.id);
      const mine = !!owner && owner.ownerId === this.identity?.playerId;
      // The FACE: the tile's surface, and nothing else. Its fill is inline so it beats the
      // stylesheet's flat fallback; the per-owner gradient carries the colour.
      const face = document.createElementNS(NS, 'path');
      face.setAttribute('d', d);
      face.setAttribute('data-cell-id', cell.id);
      face.classList.add('world-hex-face');
      const rise = riseOrder.get(cell.id);
      if (rise !== undefined) {
        face.classList.add('rising');
        face.style.setProperty('--rise-delay', `${Math.min(rise, 24) * 55}ms`);
      }
      if (owner) {
        face.classList.add(mine ? 'mine' : 'held');
        // The tile's own jitter band, then the light catching its top-left arc (the shared rim).
        const bands = (mine ? mineFace : heldFace).get(owner.colour)!;
        face.style.fill = bands[jitterBand(cell.id)]!;
        face.style.stroke = RIM;
        face.style.strokeWidth = RIM_WIDTH;
        // THE GLINT: your own tiles catch the light now and then, one after another.
        if (mine) face.style.setProperty('--glint-delay', `${-((glint++ * 1.37) % 11).toFixed(2)}s`);
      } else {
        face.style.fill = EMPTY_FACE;
      }
      faces.append(face);
      // The LINE: the tile's edge, its owner and its state — and the element the player touches.
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('data-cell-id', cell.id);
      path.setAttribute('data-owner-id', owner?.ownerId ?? '');
      path.classList.add('world-hex');
      if (owner) {
        path.classList.add(mine ? 'mine' : 'held');
        path.style.setProperty('--territory', owner.colour);
        // FRESH GROUND: a tile grown in the last six hours keeps a slow halo, so the map shows
        // where the world is moving.
        if (now - owner.claimedAt < FRESH_MS) {
          path.classList.add('fresh');
          const halo = document.createElementNS(NS, 'path');
          halo.setAttribute('d', d);
          halo.classList.add('world-halo');
          halo.style.setProperty('--territory', owner.colour);
          halo.style.setProperty('--halo-delay', `${-((halos.childElementCount * 0.9) % 3.6).toFixed(1)}s`);
          halos.append(halo);
        }
      } else if (this.wallet && this.wallet.balance >= world.cost && (anywhere || !own.size ||
        [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].some(([dq, dr]) => own.has(`${cell.q + dq!},${cell.r + dr!}`)))) {
        // Any free tile on the seen map (owner, 2026-10-27: no longer next to your own tiles) — once
        // the server says it plays by that rule (world v3). An older server still wants a neighbour.
        path.classList.add('available');
      }
      path.classList.toggle('selected', this.selected === cell.id);
      path.tabIndex = 0;
      path.setAttribute('aria-label', owner
        ? `${owner.ownerName ?? 'Player'} #${owner.ownerTag} territory` : `Free world tile ${cell.id}`);
      // NO per-path click handler: a tap is resolved once, on the SVG, by snapping to the nearest
      // cell centre (see `tapAt`). That is the touch-target guarantee — a tap never lands on the
      // wrong neighbour and never selects nothing. Keyboard selection stays per tile.
      path.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.select(cell.id); }
      });
      lines.append(path);
    }
    // THE CHALLENGE LAYER (docs/TERRITORY-CHALLENGES.md): a frontier mark and a timer ring are the
    // only additions to the map, and both are above every tile edge so no neighbour can bury them.
    // The ring traces the cell's OWN `hexPath` — the same six points as the tile — so it is the
    // shape of the ground, not a circle stuck on top of it.
    const marks = document.createElementNS(NS, 'g');
    marks.classList.add('world-frontier-marks');
    const rings = document.createElementNS(NS, 'g');
    rings.classList.add('world-rings');
    // THE SWORDS LAYER: the contested tile's marker, in the map's own coordinates. It sits ABOVE the
    // ring (the two never overlap: the ring is the tile's outline, the glyph is in the middle) and
    // below the selection accent, so pan and zoom move it with its tile for free — no HTML overlay.
    // TWO layers, in drawing order (owner, 2026-10-29): `quiet` is everybody else's dispute — the
    // hollow, untappable mark — and `swords` is MINE, on top, because a call to action outranks
    // background news. Two groups rather than one because nodes are reused by key and their order in
    // a single group would then depend on arrival order.
    const quiet = document.createElementNS(NS, 'g');
    quiet.classList.add('world-disputes-layer');
    const swords = document.createElementNS(NS, 'g');
    swords.classList.add('world-swords-layer');
    // the fog lies under every tile, so the coast always reads on top of it
    svg.append(fogLayer);
    // SPORES: a few motes drift up off held ground and fade — the land is alive, quietly.
    const spores = document.createElementNS(NS, 'g');
    spores.classList.add('world-spores');
    spores.setAttribute('aria-hidden', 'true');
    spores.setAttribute('filter', 'url(#world-blur-mote)');
    const held = world.claims.length ? world.claims : world.cells.slice(0, 1).map((cell) => ({ cellId: cell.id }));
    for (let i = 0; i < SPORE_COUNT; i++) {
      const pick = held[(i * 7 + world.revision) % held.length];
      const cell = pick ? world.cells.find((c) => c.id === pick.cellId) : undefined;
      if (!cell) continue;
      const at = coords(cell.q, cell.r);
      const mote = document.createElementNS(NS, 'circle');
      mote.setAttribute('cx', (at.x + ((i * 37) % 9) - 4).toFixed(1));
      mote.setAttribute('cy', (at.y + ((i * 53) % 7) - 3).toFixed(1));
      mote.setAttribute('r', i % 3 === 0 ? '0.9' : '0.6');
      mote.classList.add('world-spore');
      mote.style.setProperty('--spore-delay', `${-(i * 1.9).toFixed(1)}s`);
      spores.append(mote);
    }
    svg.append(faces, lines, marks, rings, quiet, swords);
    // THE TAKEOVER paints ABOVE the tile edges so the losing colour drains over the whole ground and
    // its flash cannot be buried by a neighbour's stroke. It is data-driven (see `takeoverNodes`) and
    // is redrawn by any paint that lands inside its 900 ms beat.
    const takeover = this.takeoverNodes();
    if (takeover) svg.append(takeover);
    // The mist's hand-off paints ABOVE the new faces (so the old mist is still visible over the land
    // it is leaving) and BELOW the tile edges (so the coast's outline is crisp from the first
    // frame). It is inserted, not appended, so the faces/lines order above is untouched.
    if (fogShiftLayer) svg.insertBefore(fogShiftLayer, lines);
    // THE OUTLINE OF YOUR LAND: one soft line around every piece of it, so your tiles read as one
    // country rather than scattered cells. A blurred glow under a fine crisp edge.
    const border = document.createElementNS(NS, 'g');
    border.classList.add('world-border');
    border.setAttribute('aria-hidden', 'true');
    const ownCells = world.cells.filter((cell) => own.has(cell.id));
    if (ownCells.length) {
      const d = borderSegments(ownCells).map(([x1, y1, x2, y2]) => `M${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}`).join('');
      const colour = world.claims.find((claim) => own.has(claim.cellId))?.colour;
      for (const kind of ['glow', 'edge'] as const) {
        const line = document.createElementNS(NS, 'path');
        line.setAttribute('d', d);
        line.classList.add(`world-border-${kind}`);
        if (kind === 'glow') line.setAttribute('filter', 'url(#world-blur-glow)');
        if (colour) line.style.setProperty('--territory', colour);
        border.append(line);
      }
    }
    svg.insertBefore(halos, lines);
    svg.insertBefore(border, marks);
    svg.append(spores);
    // The accent: ONE path, above every outline, that carries the selection highlight.
    const accentGroup = document.createElementNS(NS, 'g');
    accentGroup.classList.add('world-accent');
    const accent = document.createElementNS(NS, 'path');
    accent.classList.add('world-accent-line');
    accentGroup.append(accent);
    svg.append(accentGroup);
    this.accent = accent;
    this.marksGroup = marks;
    this.ringsGroup = rings;
    this.ringPaths.clear();
    this.swordsGroup = swords;
    this.disputesGroup = quiet;
    this.markerNodes.clear();
    this.quietNodes.clear();
    this.paintAccent();
    // THE FIT BOX carries `PAD` on all four sides, so the outermost cell can be panned clear of the
    // panel's rounded corner (see `PAD`).
    // Re-measured on every paint: the map GROWS (owner, 2026-10-27), so its extent is not fixed.
    this.fit = [minX - PAD, minY - PAD, maxX - minX + 2 * PAD, maxY - minY + 2 * PAD];
    // Frame the view to the WINDOW, so the map scales up to fill it. A portrait phone crops the
    // surplus width and pans to the edges; a wide screen resolves to the whole world. The DEFAULT
    // view is then the framed view capped so one cell is at least MIN_CELL_PX (see `detailFor`).
    const rect = container.getBoundingClientRect();
    this.aspect = rect.height > 0 ? rect.width / rect.height : 0;
    this.pixels = rect.width;
    this.bounds = this.boundsFor(this.aspect);
    if (!this.box || !this.touched) {
      this.box = [...(this.detailFor(this.aspect, rect.width) ?? this.bounds ?? this.fit)];
    }
    this.observer?.disconnect();
    this.installPanZoom(svg);
    // Only the SVG is replaced: the keys, windows and tile bar over it are the page's own markup.
    container.querySelector('.world-map-svg')?.remove();
    container.append(svg);
    this.svg = svg;
    this.applyView();
    this.paintFrontier();
    this.paintRings();
    this.paintSwords();
  }
  /**
   * The smallest view the window allows: the largest rect with the WINDOW's own aspect that fits
   * inside the world's fit box. On a portrait phone that keeps the full height and takes a narrower
   * width, so the map scales up to the window and the surplus is cropped, pannable to the edges
   * because panning clamps to `fit`. On a wide screen it resolves to the whole world. Keeping the
   * box's aspect equal to the window's is what makes the SVG scale both axes equally — the hexes
   * stay true hexagons however the view is framed.
   */
  private boundsFor(aspect: number): [number, number, number, number] | null {
    if (!this.fit || !Number.isFinite(aspect) || aspect <= 0) return null;
    // THE STAGE's widest view is the whole world with sea around it (its pills float over the sea).
    if (desktopStage()) return this.containFor(aspect);
    const inset = PAD - FIT_EDGE;
    const [fx, fy, fw, fh] = [this.fit[0] + inset, this.fit[1] + inset, this.fit[2] - 2 * inset, this.fit[3] - 2 * inset];
    let w = fh * aspect, h = fh;
    if (w > fw) { w = fw; h = fw / aspect; }
    return [fx + (fw - w) / 2, fy + (fh - h) / 2, w, h];
  }
  /**
   * THE LARGE VIEW AT REST (owner, 2026-10-21: "keep it large and pannable in both axes"). It is the
   * framed view, shrunk no further than the width that keeps one cell at MIN_CELL_PX. A smaller box
   * is the same window aspect, so the SVG still fills the panel — it is a zoom-in, never a stretch.
   * Phones are the only place the cap binds; a wide screen's frame is already well above it.
   */
  private detailFor(aspect: number, pixelWidth: number): [number, number, number, number] | null {
    const frame = this.boundsFor(aspect);
    if (!frame || !(pixelWidth > 0)) return frame;
    const [fx, fy, fw, fh] = frame;
    if (desktopStage()) {
      // THE STAGE AT REST: close enough to read every tile (one cell STAGE_CELL_PX wide), and
      // centred on the player's own land when they have some — the first thing you see is yours.
      const width = Math.min(fw, pixelWidth * (X * R) / STAGE_CELL_PX);
      const height = width / aspect;
      const home = this.world ? ownCentre(this.world.cells, this.world.claims, this.identity?.playerId ?? null) : null;
      const cx = home ? home.x : fx + fw / 2, cy = home ? home.y : fy + fh / 2;
      return this.clampBox([cx - width / 2, cy - height / 2, width, height]);
    }
    const width = Math.min(fw, pixelWidth * (X * R) / MIN_CELL_PX);
    const height = width / aspect;
    return [fx + (fw - width) / 2, fy + (fh - height) / 2, width, height];
  }
  /**
   * The widest view that still draws one cell at MIN_CELL_PX, in world units. A view WIDER than this
   * would shrink the touch target below the owner's 44px minimum, so it is a hard limit of the large
   * view (FIT is exempt).
   */
  private cellFloor(): number {
    return this.pixels > 0 ? this.pixels * (X * R) / MIN_CELL_PX : Infinity;
  }
  /**
   * THE WHOLE-WORLD VIEW: the smallest rect with the panel's own aspect that CONTAINS the whole fit
   * box, with only FIT_EDGE of sea around it. The desktop stage's widest zoom (see `boundsFor`); the
   * phone's FIT key that also used it was removed (owner, 2026-10-28).
   */
  private containFor(aspect: number): [number, number, number, number] | null {
    if (!this.fit || !Number.isFinite(aspect) || aspect <= 0) return null;
    const inset = PAD - FIT_EDGE;
    const [fx, fy, fw, fh] = [this.fit[0] + inset, this.fit[1] + inset, this.fit[2] - 2 * inset, this.fit[3] - 2 * inset];
    let w = fw, h = fh;
    if (fw / fh > aspect) h = fw / aspect; else w = fh * aspect;
    // THE DESKTOP STAGE floats its pills over the map (Seeds on top; notice, selection and the menu
    // key at the foot), so the whole-world view leaves them a band of sea above and below.
    // The foot carries more than the top, so the island sits a touch above the stage's centre.
    if (desktopStage()) { w *= 1.24; h *= 1.24; return [fx + (fw - w) / 2, fy + (fh - h) / 2 + h * 0.035, w, h]; }
    return [fx + (fw - w) / 2, fy + (fh - h) / 2, w, h];
  }
  /**
   * The view's aspect is ALWAYS the panel's. A box measured a frame too early (the panel is a flex
   * child, so its height can change with the chrome under it) would make `preserveAspectRatio` centre
   * the map inside a box of the wrong shape — a letterbox band, the exact thing the owner rejected on
   * 2026-10-16. Keeping the box's WIDTH and re-deriving its height (about the same centre) is the
   * smallest correction: the pan's horizontal window is untouched.
   */
  private reconcile(box: ViewBox | null, aspect: number): ViewBox | null {
    if (!box || !usableView(box) || !(aspect > 0)) return box;
    if (Math.abs(box[2] / box[3] - aspect) <= 0.002) return box;
    const height = box[2] / aspect;
    return [box[0], box[1] + (box[3] - height) / 2, box[2], height];
  }
  /**
   * THE VIEW, RECOVERED IF IT IS EVER MISSING OR POISONED (see the note at `usableView`).
   *
   * `open()` drops the view so a visit re-frames itself to the window, but that re-frame lives in
   * `paint()`, and a paint is SKIPPED when the world has not changed (see `refresh`). The second
   * visit therefore used to leave `this.box === null` while the map was still on screen: every
   * gesture guarded on it and returned, so the wheel and the double tap stopped answering — for the
   * rest of the session, because nothing but a repaint could restore it.
   *
   * So a view that cannot be used is REPLACED by the frame the map is standing in (the window's own
   * framed view, capped so a cell keeps its touch size), never merely refused. Every path that needs
   * the view goes through here, and the field is healed as a side effect, so a poisoned view can
   * never outlive the next gesture. Returns null only before the world's fit box exists at all.
   */
  private recoverBox(): ViewBox | null {
    if (usableView(this.box)) return this.box;
    const recovered = this.detailFor(this.aspect, this.pixels) ?? this.bounds ?? this.fit;
    if (!recovered || !usableView(recovered)) return null;
    this.box = [...recovered];
    return this.box;
  }
  /**
   * Write the view: one viewBox attribute on the SAME svg, so cell identity is never touched.
   */
  private applyView(measure = true) {
    if (!this.svg) return;
    // The LIVE measured aspect, not a remembered one: see `reconcile`. A PAN passes `false`: the
    // panel cannot change shape between two pointer moves, and the ResizeObserver already refreshes
    // `this.aspect` when it does, so a drag does not force a layout read on every move — one style
    // write per frame, never a measure.
    const rect = measure ? this.svg.getBoundingClientRect() : null;
    const aspect = rect && rect.width > 0 && rect.height > 0 ? rect.width / rect.height : this.aspect;
    if (rect && aspect > 0) { this.aspect = aspect; this.pixels = rect.width; }
    // NOTHING BUT FOUR FINITE NUMBERS EVER REACHES THE ATTRIBUTE. "NaN NaN NaN NaN" is a map that
    // draws nothing and can never be zoomed back (see `usableView`); the fallback is the world's own
    // fit box, which is always a real view.
    const box = this.recoverBox();
    if (!box) return;
    const target = this.reconcile(box, aspect);
    if (usableView(target)) this.svg.setAttribute('viewBox', target.join(' '));
  }
  /**
   * ONE VIEW WRITE PER FRAME (owner, 2026-10-28: "always looks smooth"). A phone can deliver several
   * pointer moves inside one frame; each used to re-draw the whole map. They now only move `box`,
   * and the frame that follows writes it once.
   */
  private queueView() {
    if (this.viewFrame) return;
    this.viewFrame = requestAnimationFrame(() => { this.viewFrame = 0; this.applyView(false); });
  }
  /**
   * THE MAP IN MOTION. The soft-focus layers (mist, halos, the outline's glow, the motes) are SVG
   * Gaussian blurs, and a blur is re-rendered on every frame the view moves: measured at 4x CPU
   * throttle that alone took a pan from 17 ms to 50 ms frames (web/e2e/territory-smooth.ts). While
   * the map moves they are drawn sharp and still; they soften again a moment after it rests.
   */
  private setMoving(on: boolean) {
    const grid = document.getElementById('online-world-grid');
    if (this.settleTimer) { clearTimeout(this.settleTimer); this.settleTimer = null; }
    if (on) { grid?.classList.add('moving'); return; }
    this.settleTimer = setTimeout(() => { this.settleTimer = null; grid?.classList.remove('moving'); }, SETTLE_MS);
  }
  /** The selection highlight, drawn in the ONE accent path above every tile edge. */
  private paintAccent() {
    if (!this.accent) return;
    const cell = this.selected ? this.world?.cells.find((candidate) => candidate.id === this.selected) : null;
    if (!cell) { this.accent.removeAttribute('d'); return; }
    const at = coords(cell.q, cell.r);
    this.accent.setAttribute('d', hexPath(at.x, at.y));
  }
  /**
   * A TAP SELECTS, NOTHING MORE (owner, 2026-10-28: "tapping empty tile should NOT open the menu and
   * still have option to grow/sell/challenge without opening the menu"). The tile bar at the map's
   * foot shows who holds it and its one action; a second tap on the same tile lets it go. A tap on
   * the map also shuts an open window, the way a tap outside any sheet does.
   */
  private select(cellId: string, toggle = true) {
    if (this.pane) this.setPane(null, false);
    if (toggle && this.selected === cellId) return this.deselect();
    this.selected = cellId;
    this.pendingRequest = null;
    this.growArmed = null;
    this.sellArmed = null;
    this.markSelection();
  }
  private deselect() {
    this.selected = null;
    this.pendingRequest = null;
    this.growArmed = null;
    this.sellArmed = null;
    this.markSelection();
  }
  private markSelection() {
    const cellId = this.selected;
    const owner = cellId ? this.world?.claims.find((claim) => claim.cellId === cellId)?.ownerId : undefined;
    for (const path of this.svg?.querySelectorAll('.world-hex') ?? []) {
      path.classList.toggle('selected', !!cellId && path.getAttribute('data-cell-id') === cellId);
      path.classList.toggle('same-owner', !!owner && path.getAttribute('data-owner-id') === owner);
    }
    this.paintFrontier();
    this.paintAccent();
    this.paintSelection();
  }
  /**
   * THE TILE BAR: one line and at most one key. Free ground grows, your own ground sells, a rival's
   * ground beside yours can be challenged, and contested ground opens its challenge. Grow and sell ask
   * twice. The bar is rebuilt only when what it says changes, so the 12 s poll never resets a press
   * or an armed key; the key's action is re-pointed at the current state on every paint.
   */
  private paintSelection() {
    const bar = document.getElementById('online-world-selection')!;
    const world = this.world;
    const cellId = this.selected;
    let line = '';
    let action: { label: string; run: () => void; armed?: boolean; working?: boolean } | null = null;
    if (world && cellId && this.working) {
      const tile = world.claims.find((claim) => claim.cellId === cellId);
      line = tile ? ownerLine(tile, true, this.myLevel()) : `FREE TILE · ${world.cost} SEEDS`;
      action = { label: this.working === 'grow' ? ONLINE.worldGrowing : ONLINE.worldSelling, run: () => undefined, working: true };
    } else if (world && cellId) {
      const tile = world.claims.find((claim) => claim.cellId === cellId);
      const challenge = this.identity ? challengeOnCell(this.allChallenges, cellId) : null;
      if (tile) {
        const mine = tile.ownerId === this.identity?.playerId;
        // Own ground: this device's real level beats the server's last-paid one (2026-10-24 report).
        line = ownerLine(tile, mine, mine ? this.myLevel() : null);
        if (challenge) {
          action = { label: CHALLENGE.viewKey, run: () => this.openChallengeSheet(challenge) };
        } else if (mine && !this.busy && world.version >= 3) {
          // Your own tile can be sold back (owner, 2026-10-27).
          const armed = this.sellArmed === cellId;
          action = {
            label: armed ? ONLINE.worldSellConfirm : ONLINE.worldSell(world.cost), armed,
            run: () => { if (armed) void this.sell(cellId); else { this.sellArmed = cellId; this.paintSelection(); } },
          };
        } else if (!mine && this.isFrontier(cellId)) {
          action = { label: CHALLENGE.sendKey, run: () => this.openSendSheet(cellId) };
        }
      } else {
        const available = !!this.svg?.querySelector(`.world-hex[data-cell-id="${cellId}"]`)?.classList.contains('available');
        // OWNER WORDING (2026-10-16): "when placing a tile dont say 'claim hex' say grow a tile
        // everywhere". The verb is GROW and the noun is TILE throughout this screen - it also matches
        // the game's own Grow action, so the world map and the board speak the same language.
        line = !available && this.wallet && this.wallet.balance < world.cost ? `${world.cost} SEEDS NEEDED` : `FREE TILE · ${world.cost} SEEDS`;
        if (available && !this.busy) {
          const armed = this.growArmed === cellId;
          action = {
            label: armed ? 'CONFIRM GROW' : 'GROW A TILE', armed,
            run: () => { if (armed) void this.claim(); else { this.growArmed = cellId; this.paintSelection(); } },
          };
        }
      }
    }
    bar.hidden = !line;
    bar.classList.toggle('has-action', !!action);
    const signature = `${cellId}|${line}|${action?.label ?? ''}`;
    if (signature !== this.selectionSignature) {
      this.selectionSignature = signature;
      const text = document.createElement('span');
      text.className = 'world-selection-line';
      text.textContent = line;
      bar.replaceChildren(text);
      if (action) {
        const key = document.createElement('button');
        key.type = 'button';
        key.className = 'world-claim-button';
        key.textContent = action.label;
        bar.append(key);
      }
    }
    const key = bar.querySelector<HTMLButtonElement>('.world-claim-button');
    if (key && action) {
      key.onclick = action.run;
      key.disabled = !!action.working;
      key.classList.toggle('armed', !!action.armed);
      key.classList.toggle('working', !!action.working);
    }
  }
  private async claim() {
    if (!this.identity || !this.selected || this.busy) return;
    this.busy = true;
    this.working = 'grow';
    const cellId = this.selected;
    this.growArmed = null;
    this.pendingRequest ??= crypto.randomUUID();
    this.paintSelection();
    try {
      await this.client.claimWorld(this.identity.token, cellId, this.pendingRequest);
      this.notice('A little place in the world is yours.');
      this.pendingRequest = null;
      await this.refresh(true);
      this.ripple(cellId);
      // Told to whoever is waiting for a placement (the Daily Puzzle's PLACE IT step), without this
      // screen knowing who that is.
      document.dispatchEvent(new CustomEvent(WORLD_CLAIMED_EVENT, { detail: { cellId } }));
    } catch {
      this.notice('That tile may have changed. The map has refreshed; no Seeds were taken.');
      this.pendingRequest = null;
      await this.refresh(true);
    } finally { this.busy = false; this.working = null; this.paintSelection(); }
  }
  /** THE GROW RIPPLE: the new tile sends two soft rings out over the land around it. */
  private ripple(cellId: string) {
    const svg = this.svg;
    const cell = this.world?.cells.find((candidate) => candidate.id === cellId);
    if (!svg || !cell) return;
    const at = coords(cell.q, cell.r);
    const colour = this.world?.claims.find((claim) => claim.cellId === cellId)?.colour;
    const group = document.createElementNS(NS, 'g');
    group.classList.add('world-ripples');
    group.setAttribute('aria-hidden', 'true');
    group.setAttribute('filter', 'url(#world-blur-mote)');
    for (const wave of [0, 1]) {
      const ring = document.createElementNS(NS, 'path');
      ring.setAttribute('d', hexPath(at.x, at.y));
      ring.classList.add('world-ripple');
      ring.style.setProperty('--ripple-delay', `${wave * 180}ms`);
      if (colour) ring.style.setProperty('--territory', colour);
      group.append(ring);
    }
    svg.append(group);
    window.setTimeout(() => group.remove(), 1600);
  }

  // ---- the growing territory: ranking, gliding to a place (owner, 2026-10-27) -------------------

  /** Keep a view on the world: inside the fit box, or centred on it when it is the larger. */
  private clampBox(box: [number, number, number, number]): [number, number, number, number] {
    if (!this.fit) return box;
    const [fx, fy, fw, fh] = this.fit;
    const [x, y, w, h] = box;
    return [
      w >= fw ? fx + (fw - w) / 2 : Math.max(fx, Math.min(fx + fw - w, x)),
      h >= fh ? fy + (fh - h) / 2 : Math.max(fy, Math.min(fy + fh - h, y)),
      w, h,
    ];
  }
  /**
   * Centre the view on a point of the map, keeping the zoom. It GLIDES there (a smoothstep over
   * GLIDE_MS, one viewBox write per frame, no measuring) instead of jumping, so the player sees
   * where they went; under reduced motion it arrives at once.
   *
   * A second tap mid-flight (`stopGlide` from pointerdown, or a new `flyTo`) simply starts the new
   * glide from the CURRENT box, so a re-target continues from the pixel the camera is on — the
   * curve restarts, the position never jumps.
   */
  private flyTo(x: number, y: number) {
    if (!this.box || !this.fit) return;
    this.stopGlide();
    const [, , w, h] = this.box;
    const to = this.clampBox([x - w / 2, y - h / 2, w, h]);
    this.touched = true;
    if (!interfaceMotionAllowed()) { this.box = to; this.applyView(false); return; }
    const from = [...this.box] as [number, number, number, number];
    const start = performance.now();
    this.setMoving(true);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / GLIDE_MS);
      const eased = glideProgress(t);
      this.box = from.map((value, i) => value + (to[i]! - value) * eased) as [number, number, number, number];
      this.applyView(false);
      if (t < 1) { this.glideFrame = requestAnimationFrame(step); return; }
      this.glideFrame = 0;
      this.setMoving(false);
    };
    this.glideFrame = requestAnimationFrame(step);
  }
  /** A finger on the map takes the view back from a glide at once. */
  private stopGlide() {
    if (!this.glideFrame) return;
    cancelAnimationFrame(this.glideFrame);
    this.glideFrame = 0;
    this.setMoving(false);
  }
  private flyToOwner(ownerId: string) {
    if (!this.world) return;
    const centre = ownCentre(this.world.cells, this.world.claims, ownerId);
    if (centre) this.flyTo(centre.x, centre.y);
  }

  private async sell(cellId: string) {
    if (!this.identity || this.busy) return;
    this.busy = true;
    this.working = 'sell';
    this.sellArmed = null;
    this.paintSelection();
    try {
      await this.client.sellWorld(this.identity.token, cellId, crypto.randomUUID());
      this.notice(ONLINE.worldSold(this.world?.cost ?? 100));
      if (this.selected === cellId) this.selected = null;
    } catch (error) {
      const code = (error as { code?: string }).code;
      this.notice(code === 'CELL_BUSY' ? ONLINE.worldSellBusy : ONLINE.worldSellFailed);
    } finally {
      this.busy = false;
      this.working = null;
      await this.refresh(true);
      this.markSelection();
    }
  }

  /**
   * MENU's row of keys (owner, 2026-10-28: "MENU button stays and it's the only button visible
   * straight away, 4 other keys open after clicking menu"). Folding the row also shuts whatever window
   * or chat it had open.
   *
   * INSTANT BY CONSTRUCTION (owner, 2026-10-28: "built it in a smart way so it loads instantly
   * always"): the row already rests at opacity 0 ON SCREEN and is pre-promoted (CSS `will-change`),
   * so opening is compositor work only. This handler therefore MEASURES nothing and awaits nothing -
   * no layout read, no rAF, no timer - and the one class that starts the motion is its last write,
   * so the first animated frame is the very next one. Every other update (the lamps, ARIA, the
   * window) lands first, in the same task, before that class.
   */
  private setKeys(open: boolean, focus = true) {
    this.keysOpen = open;
    const keys = document.getElementById('online-world-keys');
    const menu = document.getElementById('online-world-menu');
    menu?.setAttribute('aria-expanded', String(open));
    menu?.classList.toggle('on', open);
    document.getElementById('online-world-grid')?.classList.toggle('keys-open', open);
    if (!open) {
      this.chat.setOpen(false);
      this.setPane(null, false);
      if (focus) menu?.focus({ preventScroll: true });
    }
    this.paintPanel();
    // LAST, and the only change that starts a transition: `.open` drives the roll-out, `inert`
    // takes the folded row out of the tap and Tab order. Neither needs a prior measurement.
    keys?.toggleAttribute('inert', !open);
    keys?.classList.toggle('open', open);
  }

  /** Open one key's page of the window, switch to another, or shut it (null). */
  private setPane(pane: Pane | null, focus = true) {
    const panel = document.getElementById('online-world-panel');
    const was = this.pane;
    if (pane === was) return;
    if (pane) this.chat.setOpen(false);
    this.pane = pane;
    this.paneSignature = '';
    this.sellArmed = null;
    document.getElementById('online-world-grid')?.classList.toggle('pane-open', !!pane);
    if (panel) {
      if (pane && !was) { panel.hidden = false; enterSurface(panel); }
      else if (!pane) exitSurface(panel, { onDone: () => { if (!this.pane) panel.hidden = true; } });
      // Switching keys swaps the page in place with the same small breath.
      else enterSurface(panel.querySelector<HTMLElement>('.world-panel-body'), { travel: 2 });
    }
    this.paintPanel();
    this.paintSelection();
    if (!focus) return;
    if (pane) document.getElementById('world-panel-close')?.focus({ preventScroll: true });
    else if (was) document.querySelector<HTMLElement>(`#online-world-keys [data-pane="${was}"]`)?.focus({ preventScroll: true });
  }

  /** The lamps on MENU and the challenges key, which key is lit, and the window's open page. */
  private paintPanel() {
    const panel = document.getElementById('online-world-panel');
    if (!panel || !this.world) return;
    const me = this.identity?.playerId ?? null;
    const isOpen = (c: WorldChallengeWire) => c.status === 'pending' || c.status === 'accepted';
    const open = this.allChallenges.filter(isOpen);
    const waiting = this.allChallenges.some((c) => c.status === 'pending' && !c.fromMe);
    for (const count of document.querySelectorAll<HTMLElement>('#world-key-challenges .world-deck-count')) {
      count.hidden = open.length === 0;
      count.textContent = String(open.length);
      count.classList.toggle('waiting', waiting);
    }
    // Achievements ready to claim light their own key, and MENU carries the sum of everything that
    // wants the player: open challenges plus rewards waiting.
    const ready = (this.achievements ?? []).filter((a) => a.done && !a.claimed).length;
    const reward = document.querySelector<HTMLElement>('#world-key-achievements .world-deck-count');
    if (reward) { reward.hidden = ready === 0; reward.textContent = String(ready); reward.classList.toggle('ready', ready > 0); }
    const menuCount = document.querySelector<HTMLElement>('#online-world-menu .world-deck-count');
    if (menuCount) {
      menuCount.hidden = open.length + ready === 0;
      menuCount.textContent = String(open.length + ready);
      menuCount.classList.toggle('waiting', waiting);
      menuCount.classList.toggle('ready', !waiting && ready > 0);
    }
    const achievementsKey = document.getElementById('world-key-achievements');
    if (achievementsKey) achievementsKey.hidden = this.achievements === null;
    // The colour key exists only where the server has the palette route.
    const colourKey = document.getElementById('world-key-colour');
    if (colourKey) colourKey.hidden = !this.colourAvailable;
    for (const key of document.querySelectorAll<HTMLButtonElement>('#online-world-keys .world-key[data-pane]')) {
      const on = key.dataset.pane === this.pane;
      key.setAttribute('aria-expanded', String(on));
      key.classList.toggle('on', on);
    }
    panel.dataset.pane = this.pane ?? '';
    if (!this.pane) return;
    const title = document.getElementById('world-panel-title');
    if (title) title.textContent = { ranking: ONLINE.worldRanking, challenges: ONLINE.worldChallenges, achievements: ACHIEVEMENTS_UI.title, colour: ONLINE.worldColour }[this.pane];
    if (this.pane === 'challenges') {
      const history = this.allChallenges.filter((c) => !isOpen(c));
      const empty = document.getElementById('world-challenges-empty');
      if (empty) { empty.hidden = open.length > 0; empty.textContent = ONLINE.worldNoChallenges; }
      const past = document.getElementById('world-history-empty');
      if (past) { past.hidden = history.length > 0; past.textContent = ONLINE.worldNoHistory; }
    }
    if (this.pane === 'ranking') this.paintRanking(me);
    if (this.pane === 'achievements') this.paintAchievements();
    if (this.pane === 'colour') this.paintColourPane();
  }

  /** Re-read achievements (only on a change that could move them; see `refresh`). */
  private async loadAchievements(): Promise<void> {
    const identity = this.identity;
    if (!identity) return;
    try {
      const views = await this.client.achievements(identity.token);
      if (identity !== this.identity || !this.active) return;
      this.achievements = views;
    } catch (error) {
      // A server without the route answers 404: hide the key rather than show a broken page.
      const status = (error as { status?: number } | null)?.status;
      if (status === 404 || (error as { code?: string } | null)?.code === 'NOT_FOUND') this.achievements = null;
      else return;
    }
    this.paintPanel();
  }

  // ---- YOUR COLOUR (owner, 2026-10-30) ------------------------------------------------------
  //
  // WHERE IT LIVES, AND WHY: a 5th key in the MENU row. The row is the map's only menu, is already
  // where the personal pages live (ranking, achievements, chat), and is open to the whole map by
  // one tap. The alternatives were worse for a PREFERENCE rather than an action:
  //   · the tile bar (tap your own tile) would put a cosmetic key beside GROW and SELL, on every
  //     tap of your own ground, and it is where in-game decisions live;
  //   · the standing card sits inside the ranking page — two taps in, and invisible before you
  //     hold a tile at all;
  //   · the lobby is a different screen, so it could not be reached "from the map".
  // The key carries the player's CURRENT colour as its own glyph background, so the row also answers
  // "what colour am I?" without opening anything.

  /** Read the player's colour (a stored choice, or the palette default). Once per visit. */
  private async loadColour(identity: Identity): Promise<void> {
    try {
      const answer = await this.client.worldColour(identity.token);
      if (identity !== this.identity || !this.active) return;
      this.myColourId = answer.colourId;
      this.colourAvailable = true;
      this.paintKeyColour();
      this.paintPanel();
    } catch (error) {
      // A server that predates the palette answers 404: the key goes away rather than lying.
      const status = (error as { status?: number } | null)?.status;
      if (status !== 404 && (error as { code?: string } | null)?.code !== 'NOT_FOUND') return;
      this.colourAvailable = false;
      this.paintPanel();
      if (this.pane === 'colour') this.setPane(null, false);
    }
  }

  /** Paint the key's own swatch: a 2px bar of the player's colour, under the drop. */
  private paintKeyColour(): void {
    const key = document.getElementById('world-key-colour');
    if (!key || this.myColourId === null) return;
    key.style.setProperty('--territory', TILE_COLOURS[this.myColourId]!.css);
    key.dataset.colour = String(this.myColourId);
  }

  /**
   * The picker: twenty swatches, four to a row, each with its NAME under it (never colour alone).
   * Rebuilt only when the current colour or the saving state changes — a 12 s poll must not reset a
   * press or the grid's scroll.
   */
  private paintColourPane() {
    const grid = document.getElementById('world-colour-grid');
    const label = document.getElementById('world-colour-label');
    const note = document.getElementById('world-colour-note');
    if (!grid) return;
    if (label) label.textContent = ONLINE.worldColourLabel;
    if (note) note.textContent = this.colourSaving === null ? ONLINE.worldColourHint : ONLINE.worldColourSaving;
    const signature = `colour|${this.myColourId ?? -1}|${this.colourSaving ?? -1}`;
    if (signature === this.colourSignature) return;
    this.colourSignature = signature;
    const current = this.myColourId;
    grid.replaceChildren(...TILE_COLOURS.map((colour) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'world-colour-swatch';
      swatch.dataset.colourId = String(colour.id);
      swatch.style.setProperty('--swatch', colour.css);
      swatch.style.setProperty('--swatch-light', colour.light);
      swatch.style.setProperty('--swatch-dark', colour.dark);
      const on = current === colour.id;
      swatch.classList.toggle('current', on);
      swatch.setAttribute('aria-pressed', String(on));
      // The name is the accessible label AND the visible caption: a swatch is never colour alone.
      swatch.setAttribute('aria-label', on ? `${colour.name}. ${ONLINE.worldColourCurrent}` : colour.name);
      swatch.title = colour.name;
      const chip = document.createElement('span');
      chip.className = 'world-colour-chip';
      chip.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'world-colour-name';
      name.textContent = colour.name;
      swatch.append(chip, name);
      swatch.addEventListener('click', () => void this.chooseColour(colour.id));
      return swatch;
    }));
  }

  /**
   * Save a colour, then re-read the map: the tiles themselves are the server's answer, so the map
   * must not be re-coloured optimistically from this side (a collision nudge can change one tile).
   * The swatch marks update at once, so the press feels immediate.
   */
  private async chooseColour(colourId: number): Promise<void> {
    const identity = this.identity;
    if (!identity || this.colourSaving !== null) return;
    // Tapping the colour you already have is not a change: the picker stays open, nothing is sent,
    // and the swatch's own "current" mark is the answer.
    if (colourId === this.myColourId) return;
    this.colourSaving = colourId;
    this.myColourId = colourId;
    this.paintKeyColour();
    this.paintColourPane();
    try {
      const saved = await this.client.chooseWorldColour(identity.token, colourId);
      if (identity !== this.identity) return;
      this.myColourId = saved.colourId;
      this.cue('chime');
      this.notice(ONLINE.worldColourPicked(saved.name));
    } catch {
      if (identity === this.identity) this.notice(ONLINE.worldColourFailed);
      // Put the marks back on whatever the server actually has.
      void this.loadColour(identity);
    } finally {
      this.colourSaving = null;
      this.colourSignature = '';
      this.paintColourPane();
      this.paintKeyColour();
    }
    // The tiles: one map read, which also refreshes the picker's marks on a failure path.
    await this.refresh(true);
  }

  /** The achievements page: each row a goal, its progress, and CLAIM when it is earned. */
  private paintAchievements() {
    const list = document.getElementById('online-world-achievements');
    const intro = document.getElementById('world-achievements-intro');
    if (!list) return;
    if (intro) intro.textContent = ACHIEVEMENTS_UI.intro;
    const views = this.achievements ?? [];
    const signature = `achievements|${this.claimingAchievement}|${this.justClaimed}|${JSON.stringify(views)}`;
    if (signature === this.paneSignature) return;
    this.paneSignature = signature;
    list.replaceChildren(...views.map((view) => {
      const copy = ACHIEVEMENT_COPY[view.id];
      const item = document.createElement('li');
      item.className = `world-achievement${view.claimed ? ' claimed' : view.done ? ' ready' : ''}${this.justClaimed === view.id ? ' just-claimed' : ''}`;
      const text = document.createElement('span');
      text.className = 'world-achievement-text';
      const title = document.createElement('strong');
      title.textContent = copy.title;
      const detail = document.createElement('span');
      detail.textContent = view.goal > 1 && !view.claimed ? `${copy.detail} · ${view.progress}/${view.goal}` : copy.detail;
      text.append(title, detail);
      const meter = document.createElement('span');
      meter.className = 'world-achievement-meter';
      meter.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('i');
      fill.style.width = `${Math.round(100 * view.progress / view.goal)}%`;
      meter.append(fill);
      text.append(meter);
      let action: HTMLElement;
      if (view.claimed) {
        action = document.createElement('span');
        action.className = 'world-achievement-done';
        action.textContent = '✓';
        action.setAttribute('aria-label', ACHIEVEMENTS_UI.claimed);
      } else if (view.done) {
        const key = document.createElement('button');
        key.type = 'button';
        key.className = 'world-claim-button world-achievement-claim';
        const busy = this.claimingAchievement === view.id;
        key.textContent = busy ? ACHIEVEMENTS_UI.claiming : ACHIEVEMENTS_UI.claim(view.seeds);
        key.disabled = busy;
        key.addEventListener('click', () => void this.claimAchievement(view.id));
        action = key;
      } else {
        action = document.createElement('span');
        action.className = 'world-achievement-reward';
        action.textContent = ACHIEVEMENTS_UI.reward(view.seeds);
      }
      item.append(text, action);
      return item;
    }));
  }

  private async claimAchievement(id: string): Promise<void> {
    const identity = this.identity;
    if (!identity || this.claimingAchievement) return;
    this.claimingAchievement = id;
    this.paintPanel();
    try {
      const claim = await this.client.claimAchievement(identity.token, id);
      this.wallet = claim.wallet;
      this.paintWallet();
      const view = this.achievements?.find((a) => a.id === id);
      if (view) view.claimed = true;
      this.justClaimed = id;
      this.cue('chime');
      this.notice(ACHIEVEMENTS_UI.paid(claim.awarded));
      // The moment is CSS (finite); the flag only marks which row plays it on this paint.
      window.setTimeout(() => { if (this.justClaimed === id) { this.justClaimed = null; this.paintPanel(); } }, 1400);
    } catch {
      this.notice(ACHIEVEMENTS_UI.failed);
      void this.loadAchievements();
    } finally {
      this.claimingAchievement = null;
      this.paintPanel();
    }
  }

  private paintRanking(me: string | null) {
    const list = document.getElementById('online-world-ranking');
    if (!list || !this.world) return;
    const rows = ranking(this.world.claims, me);
    // An unchanged table is left alone: a poll must not reset a press or the list's scroll.
    const signature = `ranking|${JSON.stringify(rows)}`;
    if (signature === this.paneSignature) return;
    this.paneSignature = signature;
    this.paintStanding(rows);
    list.replaceChildren(...rows.map((row) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `world-ranking-row${row.mine ? ' mine' : ''}`;
      button.style.setProperty('--territory', row.colour);
      const rank = document.createElement('span');
      rank.className = 'world-ranking-rank';
      rank.textContent = String(row.rank).padStart(2, '0');
      const swatch = document.createElement('span');
      swatch.className = 'world-ranking-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'world-ranking-name';
      name.textContent = row.mine ? `${row.name} · ${ONLINE.worldMe}` : row.name;
      // THE TAG IS NOT SHOWN (owner, 2026-10-28: "dont show tag id of players, only their name").
      // It stays on the row as its accessible name and its tooltip, because names are not unique —
      // two players called the same thing are still tellable apart without putting `#1234` in the
      // list the player reads. The row's own data-owner is unchanged, so nothing that identifies a
      // player by tag ever broke.
      button.setAttribute('aria-label', `${row.name}${row.mine ? ` · ${ONLINE.worldMe}` : ''} #${row.tag}`);
      button.title = `#${row.tag}`;
      const tiles = document.createElement('span');
      tiles.className = 'world-ranking-tiles';
      tiles.textContent = String(row.tiles);
      tiles.setAttribute('aria-label', ONLINE.worldTiles(row.tiles));
      button.append(rank, swatch, name, tiles);
      button.addEventListener('click', () => { this.setPane(null, false); this.flyToOwner(row.ownerId); });
      item.append(button);
      return item;
    }));
  }

  /** YOUR STANDING: rank, tiles, and the next player to pass — the one number to chase. */
  private paintStanding(rows: ReturnType<typeof ranking>) {
    const card = document.getElementById('world-standing');
    if (!card) return;
    card.hidden = !this.identity;
    if (!this.identity) return;
    const at = standing(rows);
    const mineRow = rows.find((row) => row.mine);
    if (mineRow) card.style.setProperty('--territory', mineRow.colour);
    else card.style.removeProperty('--territory');
    const big = document.createElement('strong');
    big.className = 'world-standing-place';
    const line = document.createElement('span');
    line.className = 'world-standing-line';
    const meter = document.createElement('span');
    meter.className = 'world-standing-meter';
    meter.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('i');
    meter.append(fill);
    if (!at) {
      big.textContent = '—';
      line.textContent = ONLINE.worldNoStanding;
      fill.style.width = '0%';
    } else {
      big.textContent = ONLINE.worldPlace(at.rank, at.players);
      line.textContent = at.next ? ONLINE.worldToPass(at.next.gap, at.next.name) : ONLINE.worldLeading;
      // the meter: how close you are to the player above (full when you lead)
      fill.style.width = `${at.next ? Math.max(6, Math.round(100 * at.tiles / (at.next.tiles + 1))) : 100}%`;
    }
    const tiles = document.createElement('span');
    tiles.className = 'world-standing-tiles';
    tiles.textContent = ONLINE.worldTiles(at?.tiles ?? 0);
    card.replaceChildren(big, tiles, line, meter);
  }

  // ---- the challenge layer -------------------------------------------------

  /**
   * THE FRONTIER mark. It appears only when a cell of MINE is selected: each rival tile that shares
   * a hex side with it gets a quietly lifted `--territory` edge and a small notched corner. No other
   * tile changes, so the map stays a map rather than becoming a wall of affordances.
   */
  private paintFrontier() {
    const group = this.marksGroup;
    if (!group || !this.world) return;
    group.replaceChildren();
    const me = this.identity?.playerId ?? null;
    const selected = this.selected;
    const selectedMine = !!me && !!selected &&
      this.world.claims.some((claim) => claim.cellId === selected && claim.ownerId === me);
    const frontier = new Set<string>();
    if (selectedMine && selected) {
      for (const id of worldNeighbours(selected)) {
        const claim = this.world.claims.find((candidate) => candidate.cellId === id);
        if (claim && claim.ownerId !== me) frontier.add(id);
      }
    }
    for (const path of this.svg?.querySelectorAll('.world-hex') ?? []) {
      path.classList.toggle('frontier', frontier.has(path.getAttribute('data-cell-id') ?? ''));
    }
    for (const id of frontier) {
      const cell = this.world.cells.find((candidate) => candidate.id === id);
      const claim = this.world.claims.find((candidate) => candidate.cellId === id);
      if (!cell || !claim) continue;
      const at = coords(cell.q, cell.r);
      // The top-right vertex of this tile: a small L inset from it reads as a notched corner.
      const vx = at.x + (X / 2) * R;
      const vy = at.y - 0.5 * R;
      const notch = document.createElementNS(NS, 'path');
      notch.setAttribute('d',
        `M${(vx - 2.6).toFixed(2)},${(vy + 0.15).toFixed(2)} ` +
        `L${(vx + 0.15).toFixed(2)},${(vy + 0.15).toFixed(2)} ` +
        `L${(vx + 0.15).toFixed(2)},${(vy + 2.6).toFixed(2)}`);
      notch.classList.add('world-frontier-mark');
      notch.style.setProperty('--territory', claim.colour);
      group.append(notch);
    }
  }

  /** A rival tile that shares a side with any of my cells can be challenged from the map. */
  private isFrontier(cellId: string): boolean {
    const me = this.identity?.playerId;
    if (!me || !this.world) return false;
    const claim = this.world.claims.find((candidate) => candidate.cellId === cellId);
    if (!claim || claim.ownerId === me) return false;
    return worldNeighbours(cellId).some((id) =>
      this.world!.claims.some((candidate) => candidate.cellId === id && candidate.ownerId === me));
  }

  /**
   * THE TIMER RING. One `stroke-dashoffset` on the cell's own six-point `hexPath`, `pathLength=1` so
   * no measurement is ever needed. Paths are REUSED between polls, so the CSS transition drains the
   * ring continuously; a ring whose challenge has closed collapses over 400 ms and is removed.
   */
  private paintRings() {
    const group = this.ringsGroup;
    if (!group || !this.world) return;
    const now = this.challengeNow();
    const open = this.allChallenges.filter((challenge) => challenge.status === 'pending');
    const byId = new Map(open.map((challenge) => [challenge.id, challenge]));
    for (const [id, entry] of [...this.ringPaths]) {
      if (byId.has(id)) continue;
      this.ringPaths.delete(id);
      entry.path.classList.add('done');
      entry.path.setAttribute('stroke-dashoffset', '1');
      setTimeout(() => entry.path.remove(), 450);
    }
    for (const challenge of open) {
      const cell = this.world.cells.find((candidate) => candidate.id === challenge.cellId);
      const claim = this.world.claims.find((candidate) => candidate.cellId === challenge.cellId);
      if (!cell || !claim) continue;
      let entry = this.ringPaths.get(challenge.id);
      if (!entry) {
        const at = coords(cell.q, cell.r);
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', hexPath(at.x, at.y));
        path.setAttribute('pathLength', '1');
        path.setAttribute('stroke-dasharray', '1');
        path.setAttribute('fill', 'none');
        path.classList.add('world-ring');
        path.setAttribute('data-challenge-id', challenge.id);
        path.setAttribute('data-cell-id', challenge.cellId);
        path.setAttribute('aria-hidden', 'true');
        group.append(path);
        entry = { path, challenge };
        this.ringPaths.set(challenge.id, entry);
      }
      entry.challenge = challenge;
      entry.path.style.setProperty('--territory', claim.colour);
      entry.path.setAttribute('stroke-dashoffset', String(1 - ringFraction(challenge, now)));
      entry.path.classList.toggle('low', isLow(challenge, now));
      entry.path.setAttribute('data-remaining-ms', String(Math.max(0, challenge.expiresAt - now)));
    }
  }

  /**
   * THE CROSSED SWORDS (owner, 2026-10-24). Two white swords, red-glow, drawn at the centre of the
   * tile a challenge is WAITING on — the defender's tiles and the challenger's alike. The owner's
   * 2026-10-29 report ("I have a duel over a tile ... but theres no swords icon") is why the mark
   * now follows the CHALLENGE, not the timer: `pending` AND `accepted` (a live duel has resolved
   * nothing), and it leaves only when the row CLOSES. No local timer, no guess about acceptance.
   *
   * The same pass draws EVERYBODY'S disputes: `disputeMarkersFor` merges my private rows with the
   * public list on the map, one marker per cell, mine outranking theirs. Other pairs get the quiet
   * hollow mark (see `makeQuietMarker`), which is why there are two groups.
   *
   * Nodes are keyed by `marker.key` and reused, so a marker under the player's keyboard focus is not
   * destroyed by the 12 s poll. MY mark is the tile's own tap: the SVG's nearest-cell resolution turns
   * a tap (or Enter on the marker) into `select()`, and the tile bar's one key opens the existing
   * challenge sheet, which already names the challenger — so there is no second popover to keep in
   * step. The quiet mark is deliberately NOT a tap target: it has nothing of mine to open.
   */
  private paintSwords() {
    const group = this.swordsGroup;
    const quietGroup = this.disputesGroup;
    // Both layers are created together in `paint()`; without either there is nothing to draw into.
    if (!group || !quietGroup || !this.world) return;
    const me = this.identity?.playerId ?? null;
    const markers = disputeMarkersFor(this.allChallenges, this.disputes, me);
    // One Map for the cells instead of a linear search per marker: with many disputes the old
    // `world.cells.find` was markers × cells on every poll.
    const cells = new Map(this.world.cells.map((cell) => [cell.id, cell] as const));
    const mine = new Set<string>();
    const theirs = new Set<string>();
    for (const marker of markers) {
      const cell = cells.get(marker.cellId);
      if (!cell) continue;
      const at = coords(cell.q, cell.r);
      const transform = `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})`;
      if (marker.mine) {
        mine.add(marker.key);
        let node = this.markerNodes.get(marker.key);
        if (!node) {
          node = this.makeMarker(marker);
          group.append(node.group);
          this.markerNodes.set(marker.key, node);
        }
        // The tile never moves in world space, but keeping this write here means a marker made before a
        // world revision still lands on its cell after a re-frame (the SVG paints in world units).
        node.group.setAttribute('transform', transform);
        node.group.setAttribute('data-side', marker.side);
        node.hit.setAttribute('aria-label', marker.label);
        continue;
      }
      theirs.add(marker.key);
      let path = this.quietNodes.get(marker.key);
      if (!path) {
        path = this.makeQuietMarker(marker);
        quietGroup.append(path);
        this.quietNodes.set(marker.key, path);
      }
      path.setAttribute('transform', `${transform} scale(${QUIET_SWORDS_SCALE})`);
      path.setAttribute('aria-label', marker.label);
    }
    // Data-driven removal, before the additions: a challenge that closed this poll takes its swords
    // with it in the same paint.
    for (const [key, node] of [...this.markerNodes]) {
      if (mine.has(key)) continue;
      node.group.remove();
      this.markerNodes.delete(key);
    }
    for (const [key, node] of [...this.quietNodes]) {
      if (theirs.has(key)) continue;
      node.remove();
      this.quietNodes.delete(key);
    }
  }

  /**
   * THE STAKE RING (owner, 2026-10-29: "challenging is like putting your tile at stake"). A quiet
   * dashed outline on the challenger's OWN auto-chosen tile for as long as the challenge is open.
   * It is the same six-point hex as every other outline (never a circle), carries no animation, and
   * leaves in the same frame the data closes the challenge. The tile's own accessible name gains the
   * stake sentence, so a keyboard or screen-reader user is told exactly which tile is at risk.
   */
  private paintStakes() {
    const group = this.ringsGroup;
    if (!group || !this.world) return;
    const me = this.identity?.playerId ?? null;
    const wanted = me ? stakeMarkersFor(this.allChallenges, me) : [];
    const byId = new Map(wanted.map((marker) => [marker.challengeId, marker]));
    for (const [id, node] of [...this.stakeNodes]) {
      if (byId.has(id)) continue;
      node.remove();
      this.stakeNodes.delete(id);
    }
    for (const [id, marker] of byId) {
      const cell = this.world.cells.find((candidate) => candidate.id === marker.cellId);
      if (!cell) continue;
      let path = this.stakeNodes.get(id);
      if (!path) {
        path = document.createElementNS(NS, 'path');
        path.setAttribute('pathLength', '1');
        path.setAttribute('fill', 'none');
        path.setAttribute('aria-hidden', 'true');
        path.classList.add('world-stake');
        group.append(path);
        this.stakeNodes.set(id, path);
      }
      const at = coords(cell.q, cell.r);
      path.setAttribute('d', hexPath(at.x, at.y));
      path.setAttribute('data-challenge-id', id);
      path.setAttribute('data-cell-id', marker.cellId);
      const claim = this.world.claims.find((candidate) => candidate.cellId === marker.cellId);
      if (claim) path.style.setProperty('--territory', claim.colour);
    }
    // The spoken sentence lives on the tile itself. `ariaBase` keeps the original label so a poll
    // never appends the sentence twice.
    const staked = new Map(wanted.map((marker) => [marker.cellId, marker.label] as const));
    for (const hex of this.svg?.querySelectorAll<SVGPathElement>('.world-hex') ?? []) {
      const cellId = hex.getAttribute('data-cell-id') ?? '';
      if (hex.dataset.ariaBase === undefined) hex.dataset.ariaBase = hex.getAttribute('aria-label') ?? '';
      const base = hex.dataset.ariaBase;
      const label = staked.has(cellId) ? `${base}. ${staked.get(cellId)}` : base;
      if (hex.getAttribute('aria-label') !== label) hex.setAttribute('aria-label', label);
    }
  }

  /**
   * AUTOMATIC SETTLEMENT'S CLIENT HALF. The server settles a finished linked duel on the read that
   * follows (`WorldEconomyService.settleFinished`); this is only the harmless fallback for a client
   * whose read raced it — it posts the same idempotent `confirm` in the background, once per
   * challenge per session, then re-reads. The player never presses a key for this.
   */
  private readonly autoSettleTried = new Set<string>();

  private settleAutomatically() {
    const identity = this.identity;
    if (!identity) return;
    for (const challenge of this.allChallenges) {
      if (challenge.status !== 'accepted' || !challenge.matchFinished || challenge.winnerId !== null) continue;
      if (this.autoSettleTried.has(challenge.id)) continue;
      this.autoSettleTried.add(challenge.id);
      void this.settleInBackground(identity.token, challenge.id);
    }
  }

  private async settleInBackground(token: string, challengeId: string): Promise<void> {
    try {
      await this.client.confirmWorldChallenge(token, challengeId, crypto.randomUUID());
    } catch {
      // A failed fallback is not a player-facing error: the sheet keeps its SETTLE NOW key, and the
      // server's own lazy settlement will apply on the next read anyway.
      return;
    }
    if (this.active) void this.refresh(true);
  }

  private makeMarker(marker: ChallengeMarker): { group: SVGGElement; hit: SVGCircleElement } {
    const group = document.createElementNS(NS, 'g');
    group.classList.add('world-swords');
    group.setAttribute('data-challenge-id', marker.challengeId ?? '');
    group.setAttribute('data-cell-id', marker.cellId);
    // The touch target: an invisible disc inside the hex, 44.6 px at the map's 46 px cell floor
    // (SWORDS_HIT_RADIUS) and larger at every zoom-in. It is a real button to assistive tech.
    const hit = document.createElementNS(NS, 'circle');
    hit.setAttribute('r', SWORDS_HIT_RADIUS.toFixed(2));
    hit.setAttribute('role', 'button');
    hit.setAttribute('tabindex', '0');
    hit.setAttribute('aria-label', marker.label);
    hit.classList.add('world-swords-hit');
    hit.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.select(marker.cellId);
      }
    });
    const glyph = document.createElementNS(NS, 'g');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.classList.add('world-swords-glyph');
    // The trace already contains BOTH swords and the crossing block, so this is ONE filled path,
    // not two rotated copies. A rotation loop here would draw a second X on top of the trace.
    const blade = document.createElementNS(NS, 'path');
    blade.setAttribute('d', SWORD_PATH);
    glyph.append(blade);
    group.append(hit, glyph);
    return { group, hit };
  }

  /**
   * SOMEBODY ELSE'S DISPUTE (owner, 2026-10-29): the same traced glyph, drawn as its OUTLINE, at
   * 78%, with no bloom, no tap target and no key handler. One `<path>` — the whole node — so the
   * layer costs one element per disputed tile however many challenges exist. `role="img"` rather
   * than a button: a screen reader is told the ground is being fought over, a keyboard is not asked
   * to stop on it, and nothing promises an action that does not exist.
   */
  private makeQuietMarker(marker: ChallengeMarker): SVGPathElement {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', SWORD_PATH);
    path.setAttribute('role', 'img');
    path.setAttribute('aria-label', marker.label);
    path.setAttribute('data-side', marker.side);
    path.setAttribute('data-cell-id', marker.cellId);
    path.classList.add('world-swords', 'world-swords-quiet');
    return path;
  }

  /**
   * THE TAKEOVER'S SOUND (owner, 2026-10-29). The ground is the reward, so a gain is heard as well as
   * seen. A loss is left to the list and the sheet: a sad noise at a stranger's good news would be a
   * punishment, not information. The animation itself is drawn by `takeoverNodes()`.
   */
  private cueTakeover(moved: readonly Takeover[]) {
    const me = this.identity?.playerId ?? null;
    if (me && moved.some((tile) => tile.toOwnerId === me)) this.cue('chime');
  }

  /**
   * THE TAKEOVER LAYER, rebuilt from the stored diff on every paint so it survives a repaint.
   *
   * For each cell whose owner changed: the LOSING owner's colour is drawn over the tile and drains
   * away, revealing the winner's face that the map has already settled into underneath; the tile's
   * edge flashes once in the winner's colour; a short label names the moment. Both halves carry the
   * same clock (`takeoverAt`), re-fed as a negative `animation-delay` when a repaint lands mid-beat,
   * exactly the trick `fogShift` uses. Opacity only — no blur, no layout, no new duration token.
   */
  private takeoverNodes(): SVGGElement | null {
    const moved = this.takeoverShift;
    if (!moved.length || !this.world) return null;
    const elapsed = Date.now() - this.takeoverAt;
    if (!(elapsed >= 0) || elapsed >= TAKEOVER_MS) {
      this.takeoverShift = [];
      return null;
    }
    const layer = document.createElementNS(NS, 'g');
    layer.classList.add('world-takeover');
    layer.setAttribute('aria-hidden', 'true');
    // Resumed, not restarted: a repaint inside the beat keeps the layer's own clock.
    const delay = `-${elapsed}ms`;
    for (const tile of moved) {
      const cell = this.world.cells.find((candidate) => candidate.id === tile.cellId);
      if (!cell) continue;
      const at = coords(cell.q, cell.r);
      const d = hexPath(at.x, at.y);
      const was = document.createElementNS(NS, 'path');
      was.setAttribute('d', d);
      was.classList.add('world-takeover-was');
      was.style.fill = tile.fromColour;
      was.style.animationDelay = delay;
      const edge = document.createElementNS(NS, 'path');
      edge.setAttribute('d', d);
      edge.classList.add('world-takeover-edge');
      edge.style.setProperty('--territory', tile.toColour);
      edge.style.animationDelay = delay;
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', at.x.toFixed(2));
      label.setAttribute('y', (at.y - R * 1.55).toFixed(2));
      label.setAttribute('text-anchor', 'middle');
      label.classList.add('world-takeover-label');
      label.style.animationDelay = delay;
      label.textContent = `${tile.winnerName.toUpperCase()} TAKES IT`;
      layer.append(was, edge, label);
    }
    return layer.childElementCount ? layer : null;
  }

  /**
   * The incoming/outgoing strip. Hidden when there is nothing to answer, so the map keeps its room.
   *
   * The chips are REUSED by challenge id, exactly as the ring paths are. Rebuilding them on every
   * 12 s poll destroyed the node under the player's focus (Tab onto a chip and it vanished under
   * you within 12 s) and made any arrival animation impossible: it would restart on every poll.
   */
  private readonly chipNodes = new Map<string, {
    chip: HTMLButtonElement;
    ring: SVGPathElement;
    head: HTMLElement;
    sub: HTMLElement;
  }>();

  private paintChallenges() {
    // TWO SECTIONS of one window (owner, 2026-10-28): what is open now, and what is settled.
    const strip = document.getElementById('online-world-challenges');
    const past = document.getElementById('online-world-history');
    if (!strip || !past) return;
    const all = this.allChallenges;
    const rows = all.slice(0, CHALLENGE_RAIL_MAX);
    if (rows.length === 0) {
      for (const [id, node] of this.chipNodes) {
        node.chip.remove();
        this.chipNodes.delete(id);
      }
      return;
    }
    const now = this.challengeNow();
    const wanted = new Set(rows.map((challenge) => challenge.id));
    // A chip whose challenge has left the list goes away in the same frame; it is not information.
    for (const [id, node] of [...this.chipNodes]) {
      if (wanted.has(id)) continue;
      node.chip.remove();
      this.chipNodes.delete(id);
    }
    const index = new Map<HTMLElement, number>([[strip, 0], [past, 0]]);
    for (const challenge of rows) {
      let node = this.chipNodes.get(challenge.id);
      if (!node) {
        node = this.makeChip(challenge);
        this.chipNodes.set(challenge.id, node);
        // ONE arrival: a chip that is new to this player settles in. It is the only entrance in the
        // rail, and it never repeats because the node is reused from here on.
        node.chip.classList.add('is-arriving');
        const chip = node.chip;
        window.setTimeout(() => chip.classList.remove('is-arriving'), 600);
      }
      const other = challenge.fromMe ? challenge.defenderName : challenge.challengerName;
      const head = `${challenge.fromMe ? CHALLENGE.outgoing : CHALLENGE.incoming} · ${other ?? 'Player'}`;
      const sub = this.chipStatus(challenge, now);
      node.head.textContent = head;
      node.sub.textContent = sub;
      node.chip.setAttribute('aria-label', `${head}. ${sub}`);
      node.chip.dataset.status = challenge.status;
      // The same ring at chip size: the cell's own hex outline, never a circle.
      if (challenge.status === 'pending') {
        node.ring.setAttribute('pathLength', '1');
        node.ring.setAttribute('stroke-dasharray', '1');
        node.ring.setAttribute('stroke-dashoffset', String(1 - ringFraction(challenge, now)));
        node.ring.classList.remove('world-chip-hex');
        node.ring.classList.add('world-chip-ring-path');
        node.ring.classList.toggle('low', isLow(challenge, now));
      } else {
        node.ring.removeAttribute('pathLength');
        node.ring.removeAttribute('stroke-dasharray');
        node.ring.removeAttribute('stroke-dashoffset');
        node.ring.classList.remove('world-chip-ring-path', 'low');
        node.ring.classList.add('world-chip-hex');
      }
      const claim = this.world?.claims.find((candidate) => candidate.cellId === challenge.cellId);
      if (claim) node.ring.style.setProperty('--territory', claim.colour);
      // Keep the DOM order equal to the list order without moving (and possibly blurring) a chip
      // that is already in place.
      const into = challenge.status === 'pending' || challenge.status === 'accepted' ? strip : past;
      const n = index.get(into)!;
      const at = into.children[n];
      if (at !== node.chip) into.insertBefore(node.chip, at ?? null);
      index.set(into, n + 1);
    }
    // Anything past the cap is counted, never silently dropped.
    const rest = all.length - rows.length;
    let more = past.querySelector<HTMLElement>('.world-challenge-more');
    if (rest > 0) {
      if (!more) {
        more = document.createElement('span');
        more.className = 'world-challenge-more';
        past.append(more);
      }
      more.textContent = CHALLENGE.more(rest);
      more.hidden = false;
      past.append(more);
    } else if (more) {
      more.remove();
    }
    this.announceChallenges(rows);
  }

  /**
   * A quiet live line for a player who cannot see the rail appear: the sheet's own notice is
   * `aria-live`, and this says only what changed since the last paint.
   */
  private announced = new Set<string>();
  private announceChallenges(rows: readonly WorldChallengeWire[]) {
    const fresh = rows.filter((challenge) =>
      challenge.status === 'pending' && !challenge.fromMe && !this.announced.has(challenge.id));
    for (const challenge of rows) this.announced.add(challenge.id);
    const region = document.getElementById('online-world-live');
    if (!region || fresh.length === 0) return;
    region.textContent = fresh
      .map((challenge) => CHALLENGE.incomingAnnounce(challenge.challengerName ?? 'Player'))
      .join(' ');
  }

  private makeChip(challenge: WorldChallengeWire) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'world-challenge-chip';
    chip.dataset.challengeId = challenge.id;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-12 -12 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('world-chip-ring');
    const ring = document.createElementNS(NS, 'path');
    ring.setAttribute('d', hexPath(0, 0));
    svg.append(ring);
    const copy = document.createElement('span');
    copy.className = 'world-challenge-chip-copy';
    const head = document.createElement('strong');
    const sub = document.createElement('span');
    copy.append(head, sub);
    chip.append(svg, copy);
    chip.addEventListener('click', () => {
      const live = this.allChallenges.find((candidate) => candidate.id === challenge.id);
      if (live) this.openChallengeSheet(live);
    });
    return { chip, ring, head, sub };
  }

  private chipStatus(challenge: WorldChallengeWire, now: number): string {
    switch (challenge.status) {
      case 'pending':
        // The clock, not the coordinate: the chip already names the player.
        return CHALLENGE.remaining(remainingLabel(challenge.expiresAt - now));
      case 'accepted':
        return challenge.matchFinished ? CHALLENGE.settlingShort : CHALLENGE.duel;
      case 'resolved':
        return CHALLENGE.settledShort;
      case 'expired':
        return CHALLENGE.forfeited;
      case 'stale':
        return CHALLENGE.stale;
      default:
        return CHALLENGE.declinedShort;
    }
  }

  // ---- the two-state challenge sheet ---------------------------------------

  private ensureSheet(): NonNullable<WorldView['sheet']> {
    if (this.sheet) return this.sheet;
    const root = document.createElement('div');
    root.className = 'world-invitation world-challenge-sheet';
    root.hidden = true;
    const card = document.createElement('div');
    card.className = 'world-invitation-card world-challenge-card';
    card.dataset.ixSurface = '1';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'world-challenge-title');
    // The ground itself, at the top of the card: a small copy of the contested hex in the holder's
    // own colour, so the sentence has something to point at. It is the same six-point outline the
    // map and the timer ring use, never a second shape.
    const head = document.createElement('div');
    head.className = 'world-challenge-head';
    const glyph = document.createElementNS(NS, 'svg');
    glyph.setAttribute('viewBox', '-12 -12 24 24');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.classList.add('world-challenge-glyph');
    const glyphPath = document.createElementNS(NS, 'path');
    glyphPath.setAttribute('d', hexPath(0, 0));
    glyph.append(glyphPath);
    const title = document.createElement('strong');
    title.id = 'world-challenge-title';
    title.textContent = CHALLENGE.title;
    head.append(glyph, title);
    const line = document.createElement('p');
    line.className = 'world-challenge-line';
    const meta = document.createElement('p');
    meta.className = 'world-challenge-meta';
    const keys = document.createElement('div');
    keys.className = 'world-challenge-keys';
    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'world-challenge-primary';
    const secondary = document.createElement('button');
    secondary.type = 'button';
    secondary.className = 'world-challenge-secondary';
    const notice = document.createElement('p');
    notice.className = 'world-challenge-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    keys.append(primary, secondary);
    card.append(head, line, meta, keys, notice);
    root.append(card);
    document.body.append(root);
    // Dismiss on POINTERDOWN, not click: the tap that opens the sheet is followed by a synthetic
    // click whose target is now this overlay, and a click listener would close it in the same
    // gesture. A pointerdown can only belong to a new touch.
    // THE OPENING TAP IS SPENT (owner, 2026-10-28: "it closes in half a second, just blinking"). The
    // sheet opens on the map's pointerup, so the same tap's synthetic click — or a quick second tap
    // on the tile — lands on whatever key is now under the finger (usually NOT NOW). For a short
    // moment after the sheet appears, neither the keys nor the scrim answer.
    root.addEventListener('pointerdown', (event) => { if (event.target === root && this.sheetSettled()) this.closeSheet(); });
    primary.addEventListener('click', () => { if (this.sheetSettled()) void this.sheetPrimary(); });
    secondary.addEventListener('click', () => { if (this.sheetSettled()) void this.sheetSecondary(); });
    this.sheet = { root, card, glyph, glyphPath, line, meta, primary, secondary, notice };
    return this.sheet;
  }

  private setSheetKeys(primary: string | null, secondary: string) {
    const sheet = this.ensureSheet();
    if (this.declineArmed) {
      window.clearTimeout(this.declineArmed);
      this.declineArmed = 0;
    }
    sheet.secondary.classList.remove('is-armed');
    sheet.primary.hidden = primary === null;
    sheet.primary.textContent = primary ?? '';
    sheet.secondary.hidden = false;
    sheet.secondary.textContent = secondary;
    this.setSheetBusy(false);
  }

  /**
   * An in-flight key says so with the app's own convention (`aria-busy` + the calmer face the
   * online actions already use). Both keys are disabled so a second tap cannot double-send, but the
   * player is told WHY the key they pressed has gone quiet.
   */
  private setSheetBusy(busy: boolean) {
    const sheet = this.sheet;
    if (!sheet) return;
    this.sheetBusy = busy;
    for (const key of [sheet.primary, sheet.secondary]) {
      key.disabled = busy;
      if (busy) key.setAttribute('aria-busy', 'true');
      else key.removeAttribute('aria-busy');
    }
  }

  /** Paint the contested ground's own colour into the card's hex, so the glyph is not decoration. */
  private setSheetGround(colour: string | null) {
    const sheet = this.ensureSheet();
    if (colour) sheet.glyphPath.style.setProperty('--territory', colour);
    else sheet.glyphPath.style.removeProperty('--territory');
    sheet.glyph.classList.toggle('is-rock', !colour);
  }

  private sheetSettled(): boolean {
    return performance.now() - this.sheetShownAt >= SHEET_GUARD_MS;
  }

  private showSheet() {
    const sheet = this.ensureSheet();
    this.sheetShownAt = performance.now();
    sheet.root.hidden = false;
    // The same two-part arrival every other surface in the game uses: the scrim only changes
    // density (no travel, no scale), and the card becomes present — it is never a hard cut.
    enterSurface(sheet.root, { travel: 0, scale: 1, duration: 150 });
    enterSurface(sheet.card);
    // A challenge that is waiting for THIS player's answer gets one low note: the sheet is asking,
    // not merely informing. Every other state of the sheet is silent so the ask stays singular.
    if (this.sheetMode === 'defend') this.cue('thud');
    this.sheetReturnFocus = (document.activeElement as HTMLElement | null) ?? null;
    document.addEventListener('keydown', this.onSheetKey);
    this.startSheetClock();
    const target = !sheet.primary.hidden ? sheet.primary : sheet.secondary;
    target.focus({ preventScroll: true });
  }

  /** Only states with a deadline tick: the defender's ask and the challenger's wait. */
  private startSheetClock() {
    this.stopSheetClock();
    if (this.sheetMode !== 'defend' && this.sheetMode !== 'wait') return;
    this.sheetClock = window.setInterval(() => this.paintSheetClock(), 1000);
    this.paintSheetClock();
  }

  private stopSheetClock() {
    if (this.sheetClock) window.clearInterval(this.sheetClock);
    this.sheetClock = 0;
  }

  /** Write only when the text changes: the label moves once a minute, the check runs once a second. */
  private setSheetText(node: HTMLElement, text: string) {
    if (node.textContent !== text) node.textContent = text;
  }

  /**
   * THE DEFENDER'S SHEET IS LIVE (owner, 2026-10-28: "respond to keep your tile in 23:59 (timer)").
   * The countdown is the thing the decision is made against, so it is re-read from the server's own
   * deadline while the sheet is open — never a second clock started on open.
   *
   * At zero it stops asking. `expireChallenges` forfeits the tile to the challenger, and the sheet
   * says that in the same words the closed state uses (`deadlineLine`) instead of leaving an ACCEPT
   * key that the server would refuse. Expiry is lazy server-side, so this is the rule, not a claim
   * that the transfer has already been written.
   */
  private paintSheetClock() {
    const sheet = this.sheet;
    const challenge = this.sheetChallenge;
    if (!sheet || !challenge || sheet.root.hidden) return this.stopSheetClock();
    const now = this.challengeNow();
    const leftMs = challenge.expiresAt - now;
    if (this.sheetMode === 'defend') {
      const copy = defendSheetCopy(challenge, now);
      this.setSheetText(sheet.line, copy.line);
      this.setSheetText(sheet.meta, copy.meta);
      if (!copy.expired) return;
      // The deadline has passed with the sheet still open. Say what happens; stop asking.
      this.stopSheetClock();
      this.sheetMode = 'closed';
      this.setSheetKeys(null, CHALLENGE.close);
      return;
    }
    if (this.sheetMode === 'wait') {
      this.setSheetText(sheet.meta, leftMs > 0 ? CHALLENGE.remaining(remainingLabel(leftMs)) : CHALLENGE.forfeited);
      if (leftMs <= 0) this.stopSheetClock();
    }
  }

  private closeSheet(restoreFocus = true, instant = false) {
    const sheet = this.sheet;
    if (!sheet) return;
    // The sheet's STATE is released now (this match is not "in" a challenge any more); only the
    // pixels take 180ms to leave, and a re-open in that window simply takes the card back.
    document.removeEventListener('keydown', this.onSheetKey);
    this.stopSheetClock();
    if (this.declineArmed) {
      window.clearTimeout(this.declineArmed);
      this.declineArmed = 0;
    }
    this.sheetMode = 'closed';
    this.sheetChallenge = null;
    this.sheetCellId = null;
    this.sheetRequestId = null;
    this.sheetBusy = false;
    const returnTo = this.sheetReturnFocus;
    this.sheetReturnFocus = null;
    let finished = false;
    const done = () => {
      if (finished || this.sheet?.root !== sheet.root) return;
      finished = true;
      sheet.root.hidden = true;
      resetSurface(sheet.card);
      resetSurface(sheet.root);
      if (restoreFocus && returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    };
    // `instant` is the route into a duel: the card is outside the screen that is leaving, so it must
    // be gone before the map's exit beat rather than fading over the board on its own.
    if (instant) {
      done();
      return;
    }
    exitSurface(sheet.card, { onDone: done });
    exitSurface(sheet.root, { travel: 0, scale: 1, duration: 150 });
  }

  /** The challenger's offer: what it costs (nothing), what is at stake (their own tile), one key. */
  private openSendSheet(cellId: string) {
    const tile = this.world?.claims.find((claim) => claim.cellId === cellId);
    if (!tile || !this.identity) return;
    const sheet = this.ensureSheet();
    this.sheetMode = 'send';
    this.sheetCellId = cellId;
    this.sheetChallenge = null;
    this.sheetRequestId = crypto.randomUUID();
    this.setSheetGround(tile.colour ?? null);
    // The SAME deterministic chooser the server uses (`server/src/seeds/stake.ts`), so the tile this
    // sentence names is exactly the tile the send will put at risk.
    // One tile backs one stake: tiles already staked in my open challenges, or contested by any open
    // challenge (the public dispute list), are skipped exactly as the server skips them.
    const me = this.identity.playerId;
    const unavailable = new Set<string>([
      ...(this.world?.disputes ?? []).map((d) => d.cellId),
      ...this.allChallenges.filter((c) => c.fromMe && (c.status === 'pending' || c.status === 'accepted') && c.stakeCellId)
        .map((c) => c.stakeCellId!),
    ]);
    const stakeCellId = this.world ? stakedCellFor(me, cellId, this.world.claims, unavailable) : null;
    const holdsTiles = !!this.world?.claims.some((claim) => claim.ownerId === me);
    sheet.notice.textContent = '';
    if (stakeCellId === null) {
      sheet.line.textContent = holdsTiles ? CHALLENGE.allStaked : CHALLENGE.noTile;
      sheet.meta.textContent = CHALLENGE.defendMeta;
      this.setSheetKeys(null, CHALLENGE.notNow);
    } else {
      const stake = stakeName(stakeCellId);
      sheet.line.textContent = CHALLENGE.sendLine(tile.ownerName ?? 'Player', stake);
      sheet.meta.textContent = CHALLENGE.sendMeta(stake);
      this.setSheetKeys(CHALLENGE.sendKey, CHALLENGE.notNow);
    }
    this.showSheet();
  }

  /** Every other state of the same sheet. The server's status chooses it; the client never guesses. */
  private openChallengeSheet(challenge: WorldChallengeWire) {
    const me = this.identity?.playerId;
    if (!me) return;
    const sheet = this.ensureSheet();
    this.sheetChallenge = challenge;
    this.sheetCellId = challenge.cellId;
    this.sheetRequestId = crypto.randomUUID();
    this.sheetMode = sheetModeFor(challenge, me);
    const now = this.challengeNow();
    // A PENDING CHALLENGE PAST ITS DEADLINE IS ALREADY A FORFEIT (expiry is applied lazily, but the
    // rule is not): never offer ACCEPT on one. The closed branch below says what happened instead.
    const overdue = challenge.status === 'pending' && challenge.expiresAt <= now;
    if (overdue) this.sheetMode = 'closed';
    const other = opponentName(challenge, me);
    // The glyph carries the contested ground's colour (the same `--territory` the tile and its ring
    // use), so the card is anchored to the map it came from. Rock holds no tile and has no colour.
    this.setSheetGround(this.world?.claims.find((claim) => claim.cellId === challenge.cellId)?.colour ?? null);
    sheet.notice.textContent = '';
    switch (this.sheetMode) {
      case 'defend': {
        // The countdown, not a price (owner report, 2026-10-28). `showSheet` starts the live clock
        // and repaints this every second, so the number here is already honest on the first frame.
        const copy = defendSheetCopy(challenge, now);
        sheet.line.textContent = copy.line;
        sheet.meta.textContent = copy.meta;
        this.setSheetKeys(CHALLENGE.acceptKey, CHALLENGE.declineKey);
        break;
      }
      case 'wait': {
        const stake = challenge.stakeCellId === null ? null : stakeName(challenge.stakeCellId);
        sheet.line.textContent = CHALLENGE.waitLine(challenge.defenderName ?? 'Player');
        sheet.meta.textContent = stake
          ? `${CHALLENGE.stakeMeta(stake)} · ${CHALLENGE.remaining(remainingLabel(challenge.expiresAt - now))}`
          : CHALLENGE.remaining(remainingLabel(challenge.expiresAt - now));
        this.setSheetKeys(null, CHALLENGE.close);
        break;
      }
      case 'duel':
        sheet.line.textContent = CHALLENGE.duelLine;
        sheet.meta.textContent = other;
        this.setSheetKeys(CHALLENGE.openDuelKey, CHALLENGE.close);
        break;
      case 'settling': {
        // AUTOMATIC (owner, 2026-10-29). The server applies this on the read; there is NO primary key
        // to press. SETTLE NOW is a harmless fallback on the secondary key (same idempotent confirm).
        const copy = settlementSheetCopy(challenge, me);
        sheet.line.textContent = copy.line;
        sheet.meta.textContent = copy.meta;
        this.setSheetKeys(null, CHALLENGE.settleKey);
        break;
      }
      case 'resolved': {
        const copy = resolvedSheetCopy(challenge);
        sheet.line.textContent = copy.line;
        sheet.meta.textContent = copy.meta;
        this.setSheetKeys(null, CHALLENGE.close);
        break;
      }
      default:
        // An unanswered challenge that ran out is a FORFEIT, not a neutral close: the contested tile
        // went to the challenger (`expireChallenges`); their own staked tile was never at risk on a
        // lapse. Say so in words rather than "this challenge is over".
        if (challenge.status === 'expired' || (challenge.status === 'pending' && challenge.expiresAt <= now)) {
          sheet.line.textContent = CHALLENGE.deadlineLine(challenge.challengerName ?? 'The challenger');
          sheet.meta.textContent = CHALLENGE.forfeited;
        } else {
          sheet.line.textContent = CHALLENGE.closedLine;
          sheet.meta.textContent = CHALLENGE.closedShort;
        }
        this.setSheetKeys(null, CHALLENGE.close);
    }
    this.showSheet();
  }

  private async sheetPrimary(): Promise<void> {
    if (this.sheetBusy) return;
    switch (this.sheetMode) {
      case 'send': return this.sheetSend();
      case 'defend': return this.sheetRespond(true);
      case 'duel': {
        const matchId = this.sheetChallenge?.matchId;
        this.closeSheet();
        if (matchId) this.matchOpener?.(matchId);
        return;
      }
      default: return;
    }
  }

  /**
   * DECLINE is the one irreversible key in the sheet, and it sits beside ACCEPT on a thumb-sized
   * target. A single mis-tap would end a neighbour's challenge, so the first press only arms it:
   * the key says what the second press will do, and disarms itself after a beat.
   */
  private declineArmed = 0;

  private sheetSecondary(): void {
    // The fallback for a finished duel the server has not applied yet: same idempotent confirm.
    if (this.sheetMode === 'settling') return void this.sheetConfirm();
    if (this.sheetMode === 'defend') {
      const sheet = this.sheet;
      if (!sheet || this.sheetBusy) return;
      if (this.declineArmed) {
        window.clearTimeout(this.declineArmed);
        this.declineArmed = 0;
        sheet.secondary.textContent = CHALLENGE.declineKey;
        return void this.sheetRespond(false);
      }
      sheet.secondary.textContent = CHALLENGE.declineConfirm;
      sheet.secondary.classList.add('is-armed');
      this.declineArmed = window.setTimeout(() => {
        this.declineArmed = 0;
        if (!this.sheet) return;
        this.sheet.secondary.textContent = CHALLENGE.declineKey;
        this.sheet.secondary.classList.remove('is-armed');
      }, 4000);
      return;
    }
    this.closeSheet();
  }

  private async runSheet(work: () => Promise<void>, failure: string): Promise<void> {
    const sheet = this.sheet;
    if (!sheet || this.sheetBusy) return;
    this.sheetBusy = true;
    this.setSheetBusy(true);
    sheet.notice.textContent = '';
    try {
      await work();
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      sheet.notice.textContent =
        code === 'CELL_BUSY' ? CHALLENGE.busy : code === 'NO_TILE' ? CHALLENGE.allStaked : failure;
    } finally {
      if (this.sheet) this.setSheetBusy(false);
    }
  }

  private async sheetSend(): Promise<void> {
    const me = this.identity;
    const cellId = this.sheetCellId;
    if (!me || !cellId) return;
    this.sheetRequestId ??= crypto.randomUUID();
    const requestId = this.sheetRequestId;
    await this.runSheet(async () => {
      const sent = await this.client.sendWorldChallenge(me.token, cellId, requestId);
      // The stake is a weight, so it lands as one.
      this.cue('thud');
      const stake = sent.challenge.stakeCellId;
      this.notice(stake ? CHALLENGE.sent(stakeName(stake)) : CHALLENGE.sendFailed);
      this.closeSheet();
      await this.refresh(true);
    }, CHALLENGE.sendFailed);
  }

  private async sheetRespond(accept: boolean): Promise<void> {
    const me = this.identity;
    const challenge = this.sheetChallenge;
    if (!me || !challenge) return;
    await this.runSheet(async () => {
      const result = await this.client.respondWorldChallenge(me.token, challenge.id, accept, this.sheetRequestId ?? undefined);
      this.closeSheet();
      await this.refresh(true);
      if (accept && result.matchId) this.matchOpener?.(result.matchId);
    }, CHALLENGE.answerFailed);
  }

  private async sheetConfirm(): Promise<void> {
    const me = this.identity;
    const challenge = this.sheetChallenge;
    if (!me || !challenge) return;
    this.sheetRequestId ??= crypto.randomUUID();
    const requestId = this.sheetRequestId;
    await this.runSheet(async () => {
      const result = await this.client.confirmWorldChallenge(me.token, challenge.id, requestId);
      const mine = result.settled && result.winnerId === me.playerId;
      // The one sound the whole loop earns: the ground changed hands, and it is yours.
      if (mine) this.cue('chime');
      this.notice(result.settled
        ? (mine ? CHALLENGE.settled : CHALLENGE.resultSettled)
        : CHALLENGE.alreadySettled);
      this.closeSheet();
      await this.refresh(true);
    }, CHALLENGE.confirmFailed);
  }

  private installPanZoom(svg: SVGSVGElement) {
    const set = () => {
      // A VIEW THAT CANNOT BE USED IS REPLACED, NOT REFUSED (see `recoverBox`). Refusing here is how
      // the map went quiet for a whole visit: every gesture used to start by returning.
      const box = this.recoverBox();
      if (!box || !this.fit) return;
      const frame = this.bounds ?? this.fit;
      // The framed view is BOTH zoom limits. Its width is the most zoomed-OUT view that still fills
      // the window (any wider and the box's aspect leaves the window's, so the SVG would letterbox
      // again); a quarter of it is as far in as the map goes. Height follows the box's own aspect, so
      // the two axes always scale together and the hexes stay true.
      // As far in as a quarter of the framed view — but never so far that the 44px floor could not be
      // drawn: on a narrow (landscape-phone) window a quarter is still wider than one cell at 46px.
      // Panning clamps to the FIT BOX, which carries `PAD` on every side: the outermost column/row
      // can therefore come fully inside the panel, clear of its rounded corner, on both axes.
      // A view wider (or taller) than the world — the stage zoomed out — stays centred on it.
      // The maths is pure (`clampedView`), so a NaN anywhere in it can only ever produce a legal
      // view: this is the gate the poisoning used to walk through.
      this.box = clampedView(box, this.fit, frame, Math.min(frame[2] / 4, this.cellFloor()));
      // A pan never re-measures: `this.aspect` is kept by the ResizeObserver (and by open/repaint).
      // The write itself waits for the next frame (see `queueView`).
      this.queueView();
    };
    // The map's on-screen box, read once when a finger lands rather than on every move: nothing
    // can resize the map mid-gesture, and a layout read per move is time a frame does not have.
    // The ResizeObserver CLEARS it (see below), so a rect measured before the window changed can
    // never be used to place a later zoom.
    let frameRect: DOMRect | null = null;
    /** The cached box, unless it is empty — an empty rect is re-measured rather than divided by. */
    const liveRect = (rect: DOMRect): DOMRect =>
      rect.width > 0 && rect.height > 0 ? rect : svg.getBoundingClientRect();
    const zoom = (scale: number, x: number, y: number, rect: DOMRect = frameRect ?? svg.getBoundingClientRect()) => {
      const box = this.recoverBox();
      if (!box || !this.fit) return;
      const frame = this.bounds ?? this.fit;
      // The anchor is a fraction of the LIVE map, so a rect that cannot be measured falls back to the
      // centre instead of turning into Infinity (see `viewAnchor`). Scaled by the box's OWN aspect
      // (which is the window's), not the world's, so zooming keeps the view framed and the two axes
      // scale equally at every zoom level.
      this.box = zoomedView(box, viewAnchor(x, y, liveRect(rect)), scale, frame);
      this.touched = true;
      set();
    };
    /**
     * A TAP RESOLVES TO THE CELL THE FINGER IS NEAREST (owner, 2026-10-21). The large view already
     * draws a cell at MIN_CELL_PX, so a hex is its own >=44px target; this is the second half of the
     * guarantee — a tap in the padding, between two cells, or anywhere in the small FIT view still
     * selects the nearest cell and never nothing. Nearest CENTRE is the honest rule: the hexagons
     * tile the plane, so "nearest centre" is the cell under the finger, and a shared edge cannot pick
     * an arbitrary neighbour from DOM paint order.
     */
    /** The nearest cell to a point, without selecting it (the double-tap arbiter needs it first). */
    const cellAt = (x: number, y: number): string | null => {
      if (svg !== this.svg) return null;
      const cells = this.world?.cells;
      if (!cells?.length) return null;
      const box = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
      if (box.length !== 4 || box.some((value) => !Number.isFinite(value))) return null;
      const rect = svg.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) return null;
      const wx = box[0]! + (x - rect.left) / rect.width * box[2]!;
      const wy = box[1]! + (y - rect.top) / rect.height * box[3]!;
      let best: string | null = null;
      let bestDistance = Infinity;
      for (const cell of cells) {
        const at = coords(cell.q, cell.r);
        const distance = (at.x - wx) ** 2 + (at.y - wy) ** 2;
        if (distance < bestDistance) { bestDistance = distance; best = cell.id; }
      }
      return best;
    };
    const tapAt = (x: number, y: number) => {
      // The svg may have been replaced by a repaint since the tap was queued; a stale viewBox would
      // select the wrong cell, so a tap on a retired map does nothing at all.
      if (svg !== this.svg) return;
      const best = cellAt(x, y);
      if (best) this.select(best);
    };
    /** The map's current zoom depth, for the toggle's direction. */
    const toggleZoom = (x: number, y: number) => {
      // The same recovery as every other gesture: a double tap must answer even when the visit was
      // opened without a fresh frame (see `recoverBox`).
      const box = this.recoverBox();
      const frame = this.bounds ?? this.fit;
      if (!box || !frame) return;
      const deep = box[2] <= frame[2] * 0.72;
      this.stopGlide();
      this.setMoving(true);
      zoom(deep ? DOUBLE_TAP_OUT : DOUBLE_TAP_IN, x, y, frameRect ?? svg.getBoundingClientRect());
      this.setMoving(false);
    };
    /**
     * A FINGER LIFTED WITHOUT TRAVELLING is either an ordinary tap or the second half of a double
     * tap. The FIRST tap acts IMMEDIATELY — holding it back ~300ms to find out whether it becomes a
     * double tap would make every selection feel laggy, so nothing is ever delayed.
     *
     * The two gestures are told apart by TIME, the way every map does it:
     *   - two taps inside `DOUBLE_TAP_MS`, near each other: ONE double tap, which toggles the zoom
     *     (anchored under the finger) instead of selecting again;
     *   - a slower second tap, or one far away: just another ordinary tap, so tapping the same tile
     *     at a normal pace still selects it and then lets it go.
     * The cost is one visible detail: the first tap of a double tap selects the tile it lands on
     * before the zoom. That is a momentary highlight, never a wrong board.
     */
    const finishTap = (x: number, y: number) => {
      const now = Date.now();
      const previous = this.lastTap;
      this.lastTap = null;
      if (previous && now - previous.at <= DOUBLE_TAP_MS && Math.hypot(x - previous.x, y - previous.y) <= DOUBLE_TAP_SLOP) {
        toggleZoom(x, y);
        return;
      }
      this.lastTap = { at: now, x, y };
      tapAt(x, y);
    };
    svg.addEventListener('wheel', (event) => {
      if (Math.abs(event.deltaY) < .01) return;
      event.preventDefault();
      this.stopGlide();
      this.setMoving(true);
      zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY * (event.deltaMode === 1 ? 16 : 1))) * .002), event.clientX, event.clientY, svg.getBoundingClientRect());
      this.setMoving(false);
    }, { passive: false });
    /**
     * THE POINTERS THE MAP IS HOLDING, and the two ways a desktop release goes missing: the browser
     * delivered the `pointerup` to its own chrome, or the window never saw it at all. A ghost id then
     * made `pointerdown`'s `size > 1` branch fire on the NEXT press — `multiGesture` and `dragged`
     * were set and `finish` could never clear them, because it only clears when `pointers` empties —
     * so every tap was read as a pinch and the double-tap zoom (and the tile selection) stopped
     * answering until the page was reloaded. `stalePointers` is the pure rule; this is the only place
     * it is applied, so both handlers and `recapture` agree.
     */
    const forget = (ids: number[]): void => {
      if (!ids.length) return;
      for (const id of ids) this.pointers.delete(id);
      if (this.pointers.size) return;
      this.dragged = false;
      this.multiGesture = false;
      this.gestureStart = null;
      // Nothing is holding the map any more, so the soft-focus layers may soften again (the missed
      // release is exactly the case `finish` never got to run for).
      this.setMoving(false);
    };
    svg.addEventListener('pointerdown', (event) => {
      this.stopGlide();
      // A MOUSE IS ONE POINTER: a second tracked mouse id cannot be a second finger, so it is the
      // ghost of a release nobody reported. Dropping it before this press means `size` is honest.
      forget(stalePointers(this.pointers, { id: event.pointerId, pointerType: event.pointerType, buttons: event.buttons, down: true }));
      // A FINGER THAT COMES DOWN IS A NEW GESTURE FOR THIS id, whatever the machine was left in by
      // the one before it. The id's tracking and its remembered release are scrubbed BEFORE this
      // gesture's own origin is written, so a cancelled (or phantom-ended) gesture can never lend
      // the new one its last coordinate — which is the residue that made a first drag move the map
      // by the dead gesture's distance as well as its own.
      this.pointers.delete(event.pointerId);
      if (this.lastRelease?.id === event.pointerId) this.lastRelease = null;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' });
      frameRect = svg.getBoundingClientRect();
      if (this.pointers.size > 1) { this.multiGesture = true; this.dragged = true; this.lastTap = null; this.setMoving(true); }
      else { this.dragged = false; this.multiGesture = false; this.gestureStart = { x: event.clientX, y: event.clientY }; }
    });
    /**
     * THE BROWSER SAID THE FINGER WAS GONE AND THEN KEPT MOVING IT (owner, 2026-10-28 on an iPhone:
     * "it selects a tile but dragging doesn't move the map and zooming stops working too").
     *
     * A move for a pointer the map is not tracking means the map was told that finger had ended —
     * `finish` above ran — while the finger itself is still down and still moving. iOS does exactly
     * this: it can dispatch the end of a touch at the DOCUMENT (a `pointercancel` when the browser
     * takes the gesture for, say, a page scroll, or a release that lands on its own chrome) and then
     * keep sending pointer moves for that same `pointerId`. Ignoring those moves is a map that is
     * frozen until the finger lifts: no pan, no pinch — while a tap, which needs no move, still
     * selects. That is precisely the regression the owner reported.
     *
     * `buttons` (or a touch pointer, which only exists while it is down) is the honest answer to
     * "is this finger really still there?", and it contradicts the release. So the gesture is taken
     * back AT THE POSITION IT HAD WHEN IT WAS RELEASED, not at this event's position: a pan picks up
     * where it left off, with no jump and no lost distance.
     */
    const recapture = (event: PointerEvent): boolean => {
      if (!event.buttons && event.pointerType !== 'touch') return false;
      const gone = this.lastRelease;
      const remembered = gone && gone.id === event.pointerId && Date.now() - gone.at <= RESUME_MS ? gone : null;
      const from = remembered ?? { x: event.clientX, y: event.clientY };
      this.lastRelease = null;
      this.pointers.set(event.pointerId, { x: from.x, y: from.y, touch: event.pointerType === 'touch' });
      // Same two branches as a second finger arriving: two fingers are a pinch (never a tap), one
      // finger is a pan again — but a pan still has to pass the tap slop, so a twitchy tap that a
      // stray release interrupted is not turned into a nudge of the view.
      if (this.pointers.size > 1) { this.multiGesture = true; this.dragged = true; this.lastTap = null; this.setMoving(true); }
      else { this.dragged = false; this.multiGesture = false; this.gestureStart = { x: from.x, y: from.y }; }
      return true;
    };
    svg.addEventListener('pointermove', (event) => {
      // A MOVE THAT SAYS EVERY BUTTON IS UP is the second way a desktop release goes missing: the
      // mouse is provably not holding anything, so a tracked non-touch pointer cannot be a live
      // gesture. Drop it (and its latches) rather than panning the map from a dead anchor.
      forget(stalePointers(this.pointers, { id: event.pointerId, pointerType: event.pointerType, buttons: event.buttons, down: false }));
      let old = this.pointers.get(event.pointerId);
      if (!old && !recapture(event)) return;
      old = this.pointers.get(event.pointerId);
      if (!old || !this.recoverBox()) return;
      const dx = event.clientX - old.x, dy = event.clientY - old.y;
      // A finger that has not yet travelled TAP_SLOP is still a tap: the map stays put, so a tap can
      // never nudge the view on its way to selecting a tile — and a slightly unsteady tap is not
      // silently turned into a pan.
      if (!this.dragged) {
        const start = this.gestureStart ?? old;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= TAP_SLOP) return;
      }
      if (!this.dragged) {
        this.dragged = true;
        // The gesture is a PAN, so it can never be the first half of a double tap.
        this.lastTap = null;
        this.touched = true;
        this.setMoving(true);
      }
      // Capturing on pointerdown retargets a touch tap's click to the SVG,
      // so a tile never receives it. Capture only once the gesture is a pan.
      if (!svg.hasPointerCapture(event.pointerId)) svg.setPointerCapture(event.pointerId);
      // A map that cannot be measured cannot be panned by a measured distance: no rect, no move
      // (dividing by its width is exactly how a pan used to write Infinity into the view).
      const rect = liveRect(frameRect ?? svg.getBoundingClientRect());
      if (!(rect.width > 0) || !(rect.height > 0)) {
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' });
        return;
      }
      if (this.pointers.size === 1) {
        const box = this.recoverBox()!;
        this.box = [box[0] - dx / rect.width * box[2], box[1] - dy / rect.height * box[3], box[2], box[3]];
        set();
      } else {
        const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
        if (other) {
          const before = Math.hypot(old.x - other.x, old.y - other.y);
          const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
          if (before > 0 && Math.abs(after - before) >= 1) zoom(after / before, (event.clientX + other.x) / 2, (event.clientY + other.y) / 2, rect);
        }
      }
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' });
    });
    const end = (event: PointerEvent) => {
      // Remember where this finger was ONLY when the browser says it was RELEASED: if that report
      // was a lie, the gesture resumes from here (see `recapture`).
      //
      // A CANCEL is not a release the finger might disagree with — it means the browser has taken
      // the gesture — so it must not arm the resume. Keeping the cancelled gesture's last position
      // here is the one way a dead gesture's distance could still be re-applied: a move that
      // arrives for that finger afterwards (a queued frame of moves, or iOS being late with the
      // cancel) would be anchored at the DEAD position and drag the map by the gap the cancelled
      // gesture had already spent. Without it, such a move re-anchors at the finger's current
      // position and applies nothing, so the next drag moves the map by exactly its own distance.
      const held = this.pointers.get(event.pointerId);
      if (held && event.type === 'pointerup') this.lastRelease = { id: event.pointerId, x: held.x, y: held.y, at: Date.now() };
      else if (this.lastRelease?.id === event.pointerId) this.lastRelease = null;
      this.pointers.delete(event.pointerId);
    };
    /** The one place a gesture finishes: shared by the map and by the window (see below). */
    const finish = (event: PointerEvent) => {
      const wasSingle = this.pointers.size === 1;
      end(event);
      // A tap, not the end of a pan: hand it to the double-tap arbiter. (Mouse's right/middle
      // buttons, a second finger, and a CANCELLED touch are not taps — a cancel means the browser
      // took the gesture, so it can never select a tile.)
      if (wasSingle && !this.dragged && !this.multiGesture && event.type === 'pointerup' && event.button === 0) finishTap(event.clientX, event.clientY);
      if (!this.pointers.size) {
        this.dragged = false;
        this.multiGesture = false;
        this.gestureStart = null;
        this.setMoving(false);
        // THE LAST VIEW IS WRITTEN NOW, NOT ON THE NEXT FRAME (owner, 2026-10-28). `queueView`
        // defers every write to a `requestAnimationFrame`, which is right while a finger is down: a
        // phone delivers several moves per frame and they must land as ONE write. At the end of a
        // gesture there is nothing left to coalesce, and WebKit does not run frames while the page
        // sits idle between touches — so a deferred write can leave the svg showing the position
        // from before the gesture that just ended (one whole gesture behind) until the next touch
        // makes it paint. Flushing here keeps `viewBox` equal to the map's own box the instant the
        // finger lifts: whichever frame comes next, the gesture has already been written.
        if (this.viewFrame) { cancelAnimationFrame(this.viewFrame); this.viewFrame = 0; }
        this.applyView(false);
      }
    };
    svg.addEventListener('pointerup', finish);
    // A RELEASE THAT LANDS OUTSIDE THE MAP STILL ENDS THE GESTURE (owner, 2026-10-28: the map felt
    // "buggy and glitchy"). The finger is captured once a pan starts, but the capture itself only
    // covers events the browser routes back to the SVG: an interrupted gesture (a system swipe, a
    // notification, the browser taking the touch for a page gesture) delivered `pointercancel` and
    // left `pointers` holding a finger that no longer exists — after which every later drag was
    // offset by the ghost. Listening on the window means the state is always cleared exactly once.
    const finishOutside = (event: PointerEvent) => {
      if (!this.pointers.has(event.pointerId)) return;
      finish(event);
    };
    window.addEventListener('pointerup', finishOutside);
    window.addEventListener('pointercancel', finishOutside);
    // A repaint builds a NEW svg (and a new set of closures). The previous gesture's window
    // listeners and pending tap are released here, so they cannot pile up across repaints or fire
    // against a retired map.
    this.gestureCleanup?.();
    this.gestureCleanup = () => {
      window.removeEventListener('pointerup', finishOutside);
      window.removeEventListener('pointercancel', finishOutside);
      this.lastTap = null;
    };
    // Re-frame when the WINDOW changes shape (a phone rotating, the on-screen keyboard, a notice line
    // changing the column's chrome). Untouched: the view follows the new frame exactly. Touched: the
    // player's zoom level is kept and re-derived at the new aspect, so the view stays band-free.
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => {
        const r = svg.getBoundingClientRect();
        const aspect = r.height > 0 ? r.width / r.height : 0;
        const next = this.boundsFor(aspect);
        // A hidden / mid-transition map measures 0: keep the last good frame rather than invent one.
        if (!next) return;
        // THE MAP'S BOX JUST MOVED, so the one cached at `pointerdown` is stale: a zoom after a
        // resize must be anchored on the new box, not the old one.
        frameRect = null;
        const prev = this.bounds;
        this.aspect = aspect;
        this.pixels = r.width;
        this.bounds = next;
        // A MISSING OR POISONED VIEW IS RE-FRAMED HERE, not skipped. `open()` drops the view so a
        // visit frames itself afresh; when it is shown again this callback is the only thing that
        // runs, and the old `!this.box` guard made it a no-op — the second visit was a map that
        // could not be zoomed or panned at all (see `recoverBox`).
        if (!this.touched || !prev || !usableView(this.box)) {
          // The large view is re-derived too, so a rotated phone keeps the 44px floor.
          this.box = [...(this.detailFor(aspect, r.width) ?? next)];
        } else {
          const z = prev[2] > 0 ? this.box[2] / prev[2] : 1;
          this.box[2] = next[2] * z;
          this.box[3] = next[3] * z;
        }
        set();
      });
      this.observer.observe(svg);
    }
  }
}
