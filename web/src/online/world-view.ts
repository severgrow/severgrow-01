import type { DuelClient } from '../../../server/src/client.js';
import type { WorldMapPayload } from '../../../server/src/protocol.js';
import type { SeedWallet, WorldChallengeWire, WorldChallengesPayload } from '../../../server/src/seeds/types.js';
import { worldNeighbours } from '../../../server/src/world.js';
import { CHALLENGE } from './challenge-copy.js';
import type { ChallengeMarker } from './challenge-view.js';
import {
  CHALLENGE_RAIL_MAX,
  SWORDS_HIT_RADIUS,
  challengeForCell as challengeOnCell,
  challengeMarkerFor,
  defendSheetCopy,
  isLow,
  opponentName,
  playerName,
  remainingLabel,
  ringFraction,
  sheetModeFor,
  winnerName,
} from './challenge-view.js';
import { seedBalanceLabel, seedIcon } from './seed-icon.js';
import { SWORD_PATH } from './swords-glyph.js';
import { ownerLine } from './world-selection.js';
import { browserStorage } from '../../../server/src/client.js';
import { lastWorld, rememberWorld } from './world-memory.js';
import { enterSurface, exitSurface, interfaceMotionAllowed, resetSurface } from '../ui/interface-motion.js';
import { WORLD_CLAIMED_EVENT } from './world-events.js';
import { TerritoryChat } from './territory-chat.js';
import { borderSegments, cellXY, fogRings, newCellIds, ownCentre, ranking, standing } from './world-growth.js';
import { ONLINE } from '../../../src/strings.js';

/** A tile grown this recently keeps its halo (the map shows where the world is moving). */
const FRESH_MS = 6 * 60 * 60 * 1000;
/** The wide-screen layout (online-css.ts, THE DESKTOP STAGE): the same media query. */
/** One cell's width on the stage at rest: big enough to read, small enough to see a region. */
const STAGE_CELL_PX = 54;
const desktopStage = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(min-width: 960px) and (min-height: 560px) and (min-aspect-ratio: 5/4)').matches;
/** How long a freshly opened challenge sheet ignores presses: longer than a tap's own click, shorter than a deliberate answer. */
const SHEET_GUARD_MS = 450;
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
} as const;
type Pane = 'ranking' | 'challenges';
/** How long a glide to a tile or a player takes: one breath, like the interface's own surfaces. */
const GLIDE_MS = 380;
/** The soft-focus layers stay off this long after a gesture ends, so a quick second flick never re-blurs mid-motion. */
const SETTLE_MS = 140;
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
 * An owner colour at a different lightness: `territoryColour` hands out `hsl(<h> 34% 49%)`, so one
 * hue and saturation is all a tile's own gradient needs. Shading in JS from the colour the server
 * already sent keeps the palette closed — no new tokens, and it cannot drift from `--territory`.
 */
const shade = (colour: string, lightness: number): string => {
  const m = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+[\d.]+%/.exec(colour);
  return m ? `hsl(${m[1]} ${m[2]}% ${lightness}%)` : colour;
};

/** One shared map, with a stable viewport and revision-only refresh. No game-state logic here. */
export class WorldView {
  private active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private identity: Identity | null = null;
  private wallet: SeedWallet | null = null;
  private world: World | null = null;
  /** The map on screen came from the device's memory (./world-memory.ts), not this session's server. */
  private fromMemory = false;
  /** The player's identity has resolved (to someone, or to nobody). Until then the wallet line is blank. */
  private identityKnown = false;
  private selected: string | null = null;
  /** The cells on the map at the last paint: new ones rise in (null before the first paint). */
  private knownCells: Set<string> | null = null;
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
  private box: [number, number, number, number] | null = null;
  private fit: [number, number, number, number] | null = null;
  /** The smallest view the window allows — the framed view; see `boundsFor`. */
  private bounds: [number, number, number, number] | null = null;
  /** True once the player has panned or zoomed, so a re-frame never throws their view away. */
  private touched = false;
  /** The panel's measured aspect from the last paint/resize. */
  private aspect = 0;
  /** The panel's measured width in CSS pixels — the only way to hold the MIN_CELL_PX floor. */
  private pixels = 0;
  private observer: ResizeObserver | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
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
   * iOS can report the END of a gesture — a `pointercancel` dispatched at the document, a release
   * that lands on the browser's own chrome — and then keep sending moves for the SAME finger under
   * the same `pointerId`. A gesture that is cleared on that report and then ignores those moves is
   * a map that is dead until the finger lifts: no pan, no pinch, while a tap (which needs no move)
   * still selects. That is exactly the symptom the owner saw.
   *
   * This is the position the finger had when the map was told it was gone, kept for `RESUME_MS`:
   * if a move for that finger arrives with it still down, the gesture is taken back AT that
   * position, so the pan continues from where it was instead of jumping or being lost.
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
  private swordsGroup: SVGGElement | null = null;
  private marksGroup: SVGGElement | null = null;
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
  private sheetMode: 'send' | 'defend' | 'wait' | 'duel' | 'confirm' | 'resolved' | 'closed' = 'closed';
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
    document.getElementById('online-world-keys')?.setAttribute('aria-label', ONLINE.worldMenu);
    const names: Record<Pane | 'chat', string> = { ranking: ONLINE.worldRanking, challenges: ONLINE.worldChallenges, chat: ONLINE.worldChat };
    for (const key of document.querySelectorAll<HTMLButtonElement>('#online-world-keys .world-key')) {
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
      const ownerChanged = this.world?.claims.length !== map.world.claims.length ||
        map.world.claims.some((claim, index) => {
          const previous = this.world?.claims[index];
          return !previous || previous.cellId !== claim.cellId || previous.ownerName !== claim.ownerName ||
            previous.ownerId !== claim.ownerId;
        });
      // The ground that changed hands, captured BEFORE the new map replaces the old one: this is the
      // only moment that knows both answers, and it is what the settle ceremony points at.
      const moving = ownerChanged
        ? map.world.claims
          .filter((claim) => {
            const previous = this.world?.claims.find((candidate) => candidate.cellId === claim.cellId);
            return previous && previous.ownerId !== claim.ownerId;
          })
          .map((claim) => claim.cellId)
        : [];
      if (this.fromMemory || !this.world || map.world.revision > this.world.revision ||
        (map.world.revision === this.world.revision && (force || walletChanged || ownerChanged || challengeChanged))) {
        this.world = map.world;
        this.fromMemory = false;
        // SMOOTH REFRESH (owner, 2026-10-28): rebuilding the map throws away every node, its running
        // glints and halos, and a focused tile. Only a change in what the map is drawn from may do
        // that; a forced re-read that brings the same world back keeps the drawn one.
        if (this.paintSignatureOf() !== this.paintSignature) this.paint();
        rememberWorld(browserStorage(), map.world);
        if (moving.length) this.celebrateGround(moving);
      }
      this.paintWallet();
      this.paintPanel();
      this.paintSelection();
      // The ring must keep draining even when the world revision is unchanged (a 24 h timer does not
      // bump ownership). These only touch attributes, the swords and the challenge strip, never the map.
      this.paintRings();
      this.paintSwords();
      this.paintChallenges();
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
    const heldFace = new Map<string, string>();
    const mineFace = new Map<string, string>();
    for (const claim of world.claims) {
      if (!heldFace.has(claim.colour)) heldFace.set(claim.colour, face(shade(claim.colour, 60), shade(claim.colour, 49), shade(claim.colour, 34)));
      // Your own territory: the same hue one step brighter, so it is spotted at a glance without a
      // second colour entering the palette.
      if (!mineFace.has(claim.colour)) mineFace.set(claim.colour, face(shade(claim.colour, 71), shade(claim.colour, 57), shade(claim.colour, 40)));
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
    for (const [id, ring] of fogRings(seenIds)) {
      const [q, r] = id.split(',').map(Number) as [number, number];
      const at = coords(q, r);
      const fog = document.createElementNS(NS, 'path');
      fog.setAttribute('d', hexPath(at.x, at.y));
      fog.classList.add('world-fog', `ring-${ring}`);
      fogRing[ring - 1]!.append(fog);
    }
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
        face.style.fill = (mine ? mineFace : heldFace).get(owner.colour)!;
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
    svg.append(faces, lines, marks, rings, swords);
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
    this.markerNodes.clear();
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
  private reconcile(box: [number, number, number, number] | null, aspect: number): [number, number, number, number] | null {
    if (!box || !(aspect > 0) || !(box[3] > 0)) return box;
    if (Math.abs(box[2] / box[3] - aspect) <= 0.002) return box;
    const height = box[2] / aspect;
    return [box[0], box[1] + (box[3] - height) / 2, box[2], height];
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
    const target = this.reconcile(this.box, aspect) ?? this.fit;
    if (target) this.svg.setAttribute('viewBox', target.join(' '));
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
   * Centre the view on a point of the map, keeping the zoom. It GLIDES there (an ease-out over
   * GLIDE_MS, one viewBox write per frame) instead of jumping, so the player sees where they went;
   * under reduced motion it arrives at once.
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
      const eased = 1 - (1 - t) ** 3;
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
   */
  private setKeys(open: boolean, focus = true) {
    this.keysOpen = open;
    const keys = document.getElementById('online-world-keys');
    const menu = document.getElementById('online-world-menu');
    keys?.classList.toggle('open', open);
    keys?.toggleAttribute('inert', !open);
    menu?.setAttribute('aria-expanded', String(open));
    menu?.classList.toggle('on', open);
    document.getElementById('online-world-grid')?.classList.toggle('keys-open', open);
    if (!open) {
      this.chat.setOpen(false);
      this.setPane(null, false);
      if (focus) menu?.focus({ preventScroll: true });
    }
    this.paintPanel();
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
    for (const count of document.querySelectorAll<HTMLElement>('#online-world-menu .world-deck-count, #world-key-challenges .world-deck-count')) {
      count.hidden = open.length === 0;
      count.textContent = String(open.length);
      count.classList.toggle('waiting', waiting);
    }
    for (const key of document.querySelectorAll<HTMLButtonElement>('#online-world-keys .world-key[data-pane]')) {
      const on = key.dataset.pane === this.pane;
      key.setAttribute('aria-expanded', String(on));
      key.classList.toggle('on', on);
    }
    panel.dataset.pane = this.pane ?? '';
    if (!this.pane) return;
    const title = document.getElementById('world-panel-title');
    if (title) title.textContent = { ranking: ONLINE.worldRanking, challenges: ONLINE.worldChallenges }[this.pane];
    if (this.pane === 'challenges') {
      const history = this.allChallenges.filter((c) => !isOpen(c));
      const empty = document.getElementById('world-challenges-empty');
      if (empty) { empty.hidden = open.length > 0; empty.textContent = ONLINE.worldNoChallenges; }
      const past = document.getElementById('world-history-empty');
      if (past) { past.hidden = history.length > 0; past.textContent = ONLINE.worldNoHistory; }
    }
    if (this.pane === 'ranking') this.paintRanking(me);
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
   * tile a challenge is waiting on — the defender's tiles and the challenger's alike, because the
   * payload carries both lists and `challengeMarkerFor` reads the pending state of either. The glyphs
   * appear on the refresh that follows a send (the sheet calls `refresh(true)`), and leave in the same
   * frame the challenge stops being pending: no local timer, no guess about acceptance.
   *
   * Nodes are keyed by challenge id and reused, so a marker under the player's keyboard focus is not
   * destroyed by the 12 s poll. The marker is the tile's own tap: the SVG's nearest-cell resolution
   * already turns a tap into `select()`, which opens the existing challenge sheet — that sheet already
   * names the challenger, so there is no second popover to keep in step.
   */
  private paintSwords() {
    const group = this.swordsGroup;
    if (!group || !this.world) return;
    const pending = this.allChallenges.filter((challenge) => challenge.status === 'pending');
    const wanted = new Map<string, ChallengeMarker>();
    for (const cellId of new Set(pending.map((challenge) => challenge.cellId))) {
      const marker = challengeMarkerFor(pending, cellId);
      if (marker) wanted.set(marker.challengeId, marker);
    }
    // Data-driven removal, before the additions: a challenge that closed this poll takes its swords
    // with it in the same paint.
    for (const [id, node] of [...this.markerNodes]) {
      if (wanted.has(id)) continue;
      node.group.remove();
      this.markerNodes.delete(id);
    }
    for (const [id, marker] of wanted) {
      const cell = this.world.cells.find((candidate) => candidate.id === marker.cellId);
      if (!cell) continue;
      const at = coords(cell.q, cell.r);
      const transform = `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})`;
      let node = this.markerNodes.get(id);
      if (!node) {
        node = this.makeMarker(marker);
        group.append(node.group);
        this.markerNodes.set(id, node);
      }
      // The tile never moves in world space, but keeping this write here means a marker made before a
      // world revision still lands on its cell after a re-frame (the SVG paints in world units).
      node.group.setAttribute('transform', transform);
      node.group.setAttribute('data-side', marker.incoming ? 'incoming' : 'outgoing');
      node.hit.setAttribute('aria-label', marker.label);
    }
  }

  private makeMarker(marker: ChallengeMarker): { group: SVGGElement; hit: SVGCircleElement } {
    const group = document.createElementNS(NS, 'g');
    group.classList.add('world-swords');
    group.setAttribute('data-challenge-id', marker.challengeId);
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
   * THE SETTLE BEAT. When a challenge actually moves a tile, the ground is redrawn by `paint()` like
   * any other change — correct, and completely silent. This is the one moment the whole feature
   * exists for, so the cell draws its own outline once in its NEW owner's colour and fades: a
   * receipt for the ground, lasting 1.25 s, then leaving no trace on the map.
   * Opacity and one dash offset only, and reduced motion holds it still instead of drawing it.
   */
  private celebrateGround(cellIds: readonly string[]) {
    const group = this.ringsGroup;
    if (!group || !this.world) return;
    const me = this.identity?.playerId ?? null;
    let gained = false;
    for (const id of cellIds) {
      const cell = this.world.cells.find((candidate) => candidate.id === id);
      if (!cell) continue;
      const claim = this.world.claims.find((candidate) => candidate.cellId === id);
      if (claim && me && claim.ownerId === me) gained = true;
      const at = coords(cell.q, cell.r);
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', hexPath(at.x, at.y));
      path.setAttribute('pathLength', '1');
      path.setAttribute('fill', 'none');
      path.setAttribute('aria-hidden', 'true');
      path.classList.add('world-settle');
      if (claim) path.style.setProperty('--territory', claim.colour);
      group.append(path);
      window.setTimeout(() => path.remove(), 1400);
    }
    // The ground is the reward, so a gain is heard as well as seen. A loss is left to the list and
    // the sheet: a sad noise at a stranger's good news would be a punishment, not information.
    if (gained) this.cue('chime');
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
        return challenge.matchFinished ? CHALLENGE.ready : CHALLENGE.duel;
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

  /** The challenger's offer: one sentence, one primary key. */
  private openSendSheet(cellId: string) {
    const tile = this.world?.claims.find((claim) => claim.cellId === cellId);
    if (!tile || !this.identity) return;
    const sheet = this.ensureSheet();
    const stake = this.challengeStake();
    this.sheetMode = 'send';
    this.sheetCellId = cellId;
    this.sheetChallenge = null;
    this.sheetRequestId = crypto.randomUUID();
    this.setSheetGround(tile.colour ?? null);
    sheet.line.textContent = CHALLENGE.sendLine(tile.ownerName ?? 'Player', stake);
    sheet.meta.textContent = CHALLENGE.sendMeta(stake);
    sheet.notice.textContent = '';
    if (this.wallet && this.wallet.balance < stake) {
      this.setSheetKeys(null, CHALLENGE.notNow);
      sheet.notice.textContent = CHALLENGE.noFunds(stake);
    } else {
      this.setSheetKeys(CHALLENGE.sendKey, CHALLENGE.notNow);
    }
    this.showSheet();
  }

  /** One place reads the challenge price: the server sends it, the sheet only prints it. */
  private challengeStake(): number {
    const stake = this.world?.challengeStake;
    return typeof stake === 'number' && Number.isFinite(stake) && stake > 0 ? stake : 50;
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
      case 'wait':
        sheet.line.textContent = CHALLENGE.waitLine(challenge.defenderName ?? 'Player');
        sheet.meta.textContent = CHALLENGE.remaining(remainingLabel(challenge.expiresAt - now));
        this.setSheetKeys(null, CHALLENGE.close);
        break;
      case 'duel':
        sheet.line.textContent = CHALLENGE.duelLine;
        sheet.meta.textContent = other;
        this.setSheetKeys(CHALLENGE.openDuelKey, CHALLENGE.close);
        break;
      case 'confirm': {
        const winner = playerName(challenge, challenge.matchWinnerId);
        if (winner === null) {
          sheet.line.textContent = CHALLENGE.drawLine;
          this.setSheetKeys(CHALLENGE.drawKey, CHALLENGE.notNow);
        } else {
          sheet.line.textContent = CHALLENGE.confirmLine(winner);
          this.setSheetKeys(CHALLENGE.takeKey, CHALLENGE.notNow);
        }
        // Only the CHALLENGER escrowed Seeds, so only the challenger reads an amount here. For the
        // defender the same line would be the old misreading again — a figure above a key that looks
        // like a price. They are told the one thing that is true for them.
        sheet.meta.textContent = challenge.challengerId === me ? CHALLENGE.stakeOnly(challenge.stake) : CHALLENGE.defendMeta;
        break;
      }
      case 'resolved':
        sheet.line.textContent = CHALLENGE.resolvedLine(winnerName(challenge));
        sheet.meta.textContent = CHALLENGE.settledShort;
        this.setSheetKeys(null, CHALLENGE.close);
        break;
      default:
        // An unanswered challenge that ran out is a FORFEIT, not a neutral close: the tile went to
        // the challenger (`expireChallenges`). Say so in words rather than "this challenge is over".
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
      case 'confirm': return this.sheetConfirm();
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
        code === 'NO_FUNDS' ? CHALLENGE.noFunds(this.challengeStake()) :
          code === 'CELL_BUSY' ? CHALLENGE.busy : failure;
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
      await this.client.sendWorldChallenge(me.token, cellId, requestId);
      // The stake is a weight, so it lands as one.
      this.cue('thud');
      this.notice(CHALLENGE.sent(this.challengeStake()));
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

  private installPanZoom(svg: SVGSVGElement) {    const set = () => {
      if (!this.box || !this.fit) return;
      const [fx, fy, fw, fh] = this.fit;
      // The framed view is BOTH zoom limits. Its width is the most zoomed-OUT view that still fills
      // the window (any wider and the box's aspect leaves the window's, so the SVG would letterbox
      // again); a quarter of it is as far in as the map goes. Height follows the box's own aspect, so
      // the two axes always scale together and the hexes stay true.
      const frame = this.bounds ?? this.fit;
      const aspect = this.box[3] > 0 ? this.box[2] / this.box[3] : 1;
      // As far in as a quarter of the framed view — but never so far that the 44px floor could not be
      // drawn: on a narrow (landscape-phone) window a quarter is still wider than one cell at 46px.
      const closest = Math.min(frame[2] / 4, this.cellFloor());
      this.box[2] = Math.max(closest, Math.min(frame[2], this.box[2]));
      this.box[3] = this.box[2] / aspect;
      // Panning clamps to the FIT BOX, which carries `PAD` on every side: the outermost column/row
      // can therefore come fully inside the panel, clear of its rounded corner, on both axes.
      // A view wider (or taller) than the world — the stage zoomed out — stays centred on it.
      this.box[0] = this.box[2] >= fw ? fx + (fw - this.box[2]) / 2 : Math.max(fx, Math.min(fx + fw - this.box[2], this.box[0]));
      this.box[1] = this.box[3] >= fh ? fy + (fh - this.box[3]) / 2 : Math.max(fy, Math.min(fy + fh - this.box[3], this.box[1]));
      // A pan never re-measures: `this.aspect` is kept by the ResizeObserver (and by open/repaint).
      // The write itself waits for the next frame (see `queueView`).
      this.queueView();
    };
    // The map's on-screen box, read once when a finger lands rather than on every move: nothing
    // can resize the map mid-gesture, and a layout read per move is time a frame does not have.
    let frameRect: DOMRect | null = null;
    const zoom = (scale: number, x: number, y: number, rect: DOMRect = frameRect ?? svg.getBoundingClientRect()) => {
      if (!this.box || !this.fit) return;
      const [bx, by, bw, bh] = this.box;
      const fx = (x - rect.left) / rect.width, fy = (y - rect.top) / rect.height;
      const frame = this.bounds ?? this.fit;
      const width = Math.max(frame[2] / 4, Math.min(frame[2], bw / scale));
      // Scaled by the box's OWN aspect (which is the window's), not the world's, so zooming keeps the
      // view framed and the two axes scale equally at every zoom level.
      const height = width * bh / bw;
      this.box = [bx + fx * (bw - width), by + fy * (bh - height), width, height];
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
      if (!this.box) return;
      const frame = this.bounds ?? this.fit;
      if (!frame) return;
      const deep = this.box[2] <= frame[2] * 0.72;
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
    svg.addEventListener('pointerdown', (event) => {
      this.stopGlide();
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      // A finger that comes down again is a NEW gesture: an older release for the same id must not
      // be able to move it (see `lastRelease`).
      if (this.lastRelease?.id === event.pointerId) this.lastRelease = null;
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
      this.pointers.set(event.pointerId, { x: from.x, y: from.y });
      // Same two branches as a second finger arriving: two fingers are a pinch (never a tap), one
      // finger is a pan again — but a pan still has to pass the tap slop, so a twitchy tap that a
      // stray release interrupted is not turned into a nudge of the view.
      if (this.pointers.size > 1) { this.multiGesture = true; this.dragged = true; this.lastTap = null; this.setMoving(true); }
      else { this.dragged = false; this.multiGesture = false; this.gestureStart = { x: from.x, y: from.y }; }
      return true;
    };
    svg.addEventListener('pointermove', (event) => {
      let old = this.pointers.get(event.pointerId);
      if (!old && !recapture(event)) return;
      old = this.pointers.get(event.pointerId);
      if (!old || !this.box) return;
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
      const rect = frameRect ?? svg.getBoundingClientRect();
      if (this.pointers.size === 1) {
        this.box[0] -= dx / rect.width * this.box[2]; this.box[1] -= dy / rect.height * this.box[3]; set();
      } else {
        const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
        if (other) {
          const before = Math.hypot(old.x - other.x, old.y - other.y);
          const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
          if (before > 0 && Math.abs(after - before) >= 1) zoom(after / before, (event.clientX + other.x) / 2, (event.clientY + other.y) / 2, rect);
        }
      }
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });
    const end = (event: PointerEvent) => {
      // Remember where this finger was: if the browser is wrong about it having gone, the gesture
      // resumes from here (see `recapture`).
      const held = this.pointers.get(event.pointerId);
      if (held) this.lastRelease = { id: event.pointerId, x: held.x, y: held.y, at: Date.now() };
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
        if (!next || !this.box) return;
        const prev = this.bounds;
        this.aspect = aspect;
        this.pixels = r.width;
        this.bounds = next;
        if (!this.touched || !prev) {
          // The large view is re-derived too, so a rotated phone keeps the 44px floor.
          this.box = [...(this.detailFor(aspect, r.width) ?? next)];
        } else {
          const z = this.box[2] / prev[2];
          this.box[2] = next[2] * z;
          this.box[3] = next[3] * z;
        }
        set();
      });
      this.observer.observe(svg);
    }
  }
}
