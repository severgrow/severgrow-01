// THE PLANET ON THE FINISH CARD (owner brief, 2026-11-11): "we integrating a built in view on the
// planet in the end of game screen … same setup and layout as the planet page, but without the
// menu. It is supposed to encourage people to grow a tile on the planet after finishing the game".
//
// This is the Planet page's own renderer, data and wording, in a small window:
//
//   * the SAME public world read (`GET /v1/world`), the same wallet, the same owner line
//     (`world-selection.ts`), the same grow words, the same two-press safety (`world-view.ts`);
//   * NOT the planet page's MENU row: no ranking, challenges, achievements, colour picker or chat;
//   * NOT a second network owner: the lobby hands this module its client and its identity
//     (`installOnlineLobby.mountEndgamePlanet`), so the finish card and the Planet page can never
//     disagree about who the player is or what the wallet holds.
//
// The planet itself is the shared `sphere/planet.ts` renderer in its CONTAINED mode: the canvas is
// the pane's own box, not a sheet over the screen, so the card can sit above it and every tap is
// still the planet's own tap. It is read once when the card appears (never polled: a result is a
// moment, not a dashboard) and again after a grow or a settled award.
//
// ONE ACTION, DELIBERATELY: a free tile can be GROWN. Your own land and a rival's land are read-outs
// here (who holds it, which level), never a SELL or a CHALLENGE key — a stray tap on a result screen
// must never give away land. The full set stays on the Planet page.
import type { DuelClient } from '../../../server/src/client.js';
import type { WorldMapPayload } from '../../../server/src/protocol.js';
import type { SeedWallet } from '../../../server/src/seeds/types.js';
import { ONLINE, PLANET, RESULT } from '../../../src/strings.js';
import { INTERFACE_MOTION, interfaceMotionAllowed } from '../ui/interface-motion.js';
import { isPlanetCell, worldNeighbours } from '../../../server/src/world.js';
import type { Planet, PlanetInput } from '../sphere/planet.js';
import { PLANET_PANE, PLANET_TEACH, SEEDS_WORD, seedBalanceLabel, seedIcon } from './seed-icon.js';
import { isIdentityStorageEvent, subscribeIdentityChanges } from './identity.js';
import { STORAGE_PREFIX } from '../channel.js';
import { focusCell } from './world-planet.js';
import { ownerLine, ownerSpokenLine } from './world-selection.js';

type Identity = { token: string; playerId: string; kind: string };
type World = WorldMapPayload['world'];

export type EndgamePlanetDeps = {
  client: DuelClient;
  /** The lobby's one identity: the same player the Planet page would act as. */
  identity: () => Promise<Identity | null>;
  /** The last public map this device painted, for an instant first frame (may be null). */
  cachedWorld?: () => World | null;
  /** The player's campaign place, for the owner line's LEVEL word (never invented here). */
  level?: () => number | null;
  /** The wallet changed (the card's own wallet chip and anyone else listening). */
  onBalance?: (balance: number | null) => void;
};

export type EndgamePlanet = {
  /** Paint at once from the cached map, then read the world and the wallet. */
  open: () => void;
  /** Read again (an award just settled, or the player came back to the card). */
  refresh: () => void;
  /** Level 10's in-situ explanation, in the window's own foot (it steps aside for the tile bar). */
  teach: (on: boolean) => void;
  /** Stop the planet's own paint loop while a window covers it (the result window). */
  freeze: (on: boolean) => void;
  /** The card is closing: stop the loop NOW, then fade the surface and sink it 6px. */
  leave: () => void;
  dispose: () => void;
};

/**
 * WHAT THE BAR SAYS for the selected tile. Pure, so the whole matrix is a unit test instead of a
 * source-text guess. `armed` is the second press of the grow's two-press safety.
 *
 * `signin` is the GUEST's key (owner, 2026-11-12: "'SIGN IN TO GROW' in the bottom left of planet
 * view, should be a button, that opens a window of login on top of the screen, after loging in
 * player is still able to grow a tile on planet"). The Planet page offers the same key on the same
 * situation; this pane now does too, and it opens the product's ONE login (`#menu-login`).
 */
export type PaneBar = {
  line: string;
  spoken: string;
  key: 'grow' | 'confirm' | 'retry' | 'signin' | null;
};

export type PaneTile =
  | { kind: 'none' }
  | { kind: 'pentagon' }
  | { kind: 'free'; growable: boolean; cost: number; balance: number | null; account: boolean }
  | { kind: 'held'; line: string; spoken: string };

export const barFor = (tile: PaneTile, armed: boolean): PaneBar => {
  if (tile.kind === 'none') return { line: RESULT.planetHint, spoken: RESULT.planetHint, key: null };
  if (tile.kind === 'pentagon') return { line: PLANET.pentagon, spoken: PLANET.pentagon, key: null };
  if (tile.kind === 'held') return { line: tile.line, spoken: tile.spoken, key: null };
  // A GUEST GETS A KEY, NOT AN INSTRUCTION (owner, 2026-11-12): the same words, with the Planet
  // page's own sign-in key beside them, so the player can act on the sentence they just read.
  if (!tile.account) return { line: ONLINE.worldSignInToGrow, spoken: ONLINE.worldSignInToGrow, key: 'signin' };
  if (tile.balance !== null && tile.balance < tile.cost) {
    const line = ONLINE.worldUnclaimedShort(tile.cost, SEEDS_WORD);
    return { line, spoken: line, key: null };
  }
  if (!tile.growable) {
    return { line: ONLINE.worldUnclaimedFar, spoken: ONLINE.worldUnclaimedFar, key: null };
  }
  return {
    line: ONLINE.worldUnclaimed(tile.cost, SEEDS_WORD),
    spoken: armed ? ONLINE.worldGrowConfirm : ONLINE.worldUnclaimed(tile.cost, SEEDS_WORD),
    key: armed ? 'confirm' : 'grow',
  };
};

/** The text on the bar's one key (the Planet page's own words). */
export const growKeyLabel = (key: 'grow' | 'confirm' | 'retry' | 'signin'): string =>
  key === 'confirm' ? ONLINE.worldGrowConfirm
    : key === 'retry' ? RESULT.planetRetry
      : key === 'signin' ? ONLINE.worldSignInKey
        : ONLINE.worldGrowKey;

/** A free tile this server would accept: anywhere the server says, else beside your own land. */
export const canGrowAt = (
  cellId: string,
  world: { claims: readonly { cellId: string; ownerId?: string }[]; growAnywhere?: boolean },
  me: string | null,
): boolean => {
  if (!isPlanetCell(cellId) || world.claims.some((claim) => claim.cellId === cellId)) return false;
  if (world.growAnywhere === true) return true;
  if (!me) return false;
  const mine = new Set(world.claims.filter((claim) => claim.ownerId === me).map((claim) => claim.cellId));
  return worldNeighbours(cellId).some((id) => mine.has(id));
};

/** The window's own tile size: your land as a PLACE, not a smudge (owner, 2026-11-12). The card's
 *  pane is a tall band, and at the Territory page's 44 px the cluster covered a quarter of it and sat
 *  in the middle of empty ground. 76 px reads as a place while leaving enough world around the edges
 *  to say where on the planet you are; it is still above the 30 px tap threshold, so a tap on a tile
 *  is a tap on that tile. */
const PANE_TILE_PX = 76;

const CSS = `
/* THE WINDOW AND ITS ONE GUTTER (owner feedback, 2026-11-11: "one optical axis ... the wallet chip
   and the hint line on the same gutter as the card's text"). --go-gutter is set by the card and is
   the same value the card's own text sits on, so the window's chrome and the words above it share
   one vertical line. No border: the window is the tonal shift into space, nothing stacked. */
#go-world { position: relative; min-height: 0; }
.go-world-surface {
  position: relative; overflow: hidden; isolation: isolate; height: 100%;
  border-radius: 12px; background: #0e0f10;
  /* THE WINDOW'S LIGHT (owner brief, 2026-11-11: "i like the frame on top and fade out on bottom
     on the view - lean into it"). ONE PAIR of scrims, mirrored, in the product's own charcoal:
       --go-sheen-top  a short fall from the frame's top edge, so the head sits in its own darker
                       band and the rounded frame reads as a LIT aperture; weaker than the foot,
                       because the frame's edge already carries the rest;
       --go-sheen-foot the tile bar's ground, deeper and reaching a touch further up, so the hint
                       and the bar always land on darkness and never on a bright tile.
     Every child (head, teach, note, bar) reads these two, so the light cannot drift between them.
     Both are gradient BACKGROUNDS: nothing here animates them (a gradient change is a repaint). */
  --go-scrim: #0b0d0c;
  --go-sheen-top: linear-gradient(to bottom, #0b0d0cf2 0%, #0b0d0c9c 58%, #0b0d0c00 100%);
  --go-sheen-foot: linear-gradient(to top, #0b0d0cf7 0%, #0b0d0cf2 34%, #0b0d0c99 68%, #0b0d0c00 100%);
}
/* The planet's canvas is the pane, not the screen (planet.ts \`contained\`). */
.go-world-surface > .planet-canvas {
  position: absolute; left: 0; top: 0; display: block; z-index: 0;
  touch-action: none; cursor: grab; outline: 0; background: transparent;
  transition: opacity 400ms ease-out;
}
.go-world-surface > .planet-canvas:not([data-planet-ready]) { opacity: 0; }
.go-world-surface > .planet-canvas:active { cursor: grabbing; }
.go-world-surface > .planet-canvas:focus-visible { outline: 2px solid #e8ddc5; outline-offset: -3px; }
.go-world-surface > .planet-fallback {
  position: absolute; inset: 0; z-index: 1; margin: 0; display: flex; align-items: center;
  justify-content: center; padding: 16px; text-align: center;
  font-size: .78rem; line-height: 1.5; color: #e8ddc5a6;
}
.go-world-surface > .planet-fallback[hidden] { display: none; }
/* A grown tile's two rings, in pane coordinates (planet.ts \`grown\`). */
.go-world-surface > .planet-grown {
  position: absolute; z-index: 1; pointer-events: none; border-radius: 50%;
  width: calc(var(--tile) * 1.2); height: calc(var(--tile) * 1.2);
  translate: -50% -50%;
  box-shadow: 0 0 0 1.5px #e8ddc5d9, 0 0 14px #e8ddc540;
  animation: go-world-grown 1150ms cubic-bezier(.2,.7,.2,1) both;
}
.go-world-surface > .planet-grown::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit;
  box-shadow: 0 0 0 1px #e8ddc58c;
  animation: go-world-grown 1150ms 200ms cubic-bezier(.2,.7,.2,1) both;
}
@keyframes go-world-grown { from { scale: .55; opacity: 1; } to { scale: 4.4; opacity: 0; } }
/* LEVEL 10'S EXPLAINER — INSIDE the window (owner feedback: "the one-time explainer reading as part
   of the planet window rather than a separate card"). It takes the foot of the window, on the same
   gutter and the same tonal scrim as the tile bar, and steps aside for the bar the moment a tile is
   chosen: space and tone separate it, never a rule. */
.go-world-teach {
  position: absolute; z-index: 3; inset: auto 0 0 0;
  display: grid; gap: 3px;
  padding: 16px var(--go-gutter, 14px) 10px;
  background: var(--go-sheen-foot);
  pointer-events: none;
}
.go-world-teach[hidden] { display: none; }
.go-world-teach-lines {
  list-style: none; margin: 0; padding: 0; display: grid; gap: 2px;
  font-family: var(--font-ui); font-size: .66rem; line-height: 1.32; color: #e8ddc5cc;
  text-wrap: pretty;
}
/* THE HEAD: the window's own name and this player's balance, on the card's gutter. */
.go-world-head {
  position: absolute; z-index: 2; inset: 0 0 auto 0; display: flex; align-items: center;
  justify-content: space-between; gap: 8px;
  padding: 9px var(--go-gutter, 14px); pointer-events: none;
}
.go-world-title {
  font-family: var(--font-ui); font-size: .58rem; letter-spacing: .22em; text-transform: uppercase;
  color: #e8ddc5a6;
}
.go-world-wallet {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--font-ui); font-size: .6rem; letter-spacing: .1em; color: #e8ddc5cc;
  font-variant-numeric: tabular-nums;
}
.go-world-wallet .seed-icon { display: block; width: 14px; height: 14px; color: #e8ddc5; }
.go-world-note {
  position: absolute; z-index: 2; left: var(--go-gutter, 14px); right: var(--go-gutter, 14px); top: 50%;
  translate: 0 -50%; margin: 0; text-align: center;
  font-family: var(--font-ui); font-size: .68rem; line-height: 1.4; letter-spacing: .06em;
  color: #e8ddc5cc; pointer-events: none;
}
.go-world-note[hidden] { display: none; }
/* THE FOOT: the selected tile's one line and its one key, on the same gutter. The scrim is the
   window's own ground (a tonal shift, no rule), so the words stay legible over any tile. */
.go-world-bar {
  position: absolute; z-index: 3; inset: auto 0 0 0;
  display: flex; align-items: center; gap: 10px; justify-content: space-between;
  padding: 16px var(--go-gutter, 14px) 9px;
  background: var(--go-sheen-foot);
}
.go-world-bar[hidden] { display: none; }
.go-world-line {
  min-width: 0; font-family: var(--font-ui); font-size: .56rem; line-height: 1.25;
  letter-spacing: .12em; text-transform: uppercase; color: #e8ddc5d9;
}
/* NO FRAME (house rule, 2026-11-11): the grow key is a tonal plate on the window's dark foot.
   Its press is a step up in tone and its focus is the shared outer ring — never a contour.
   44px tall (house rule: a real touch target). The sign-in key is the same plate, because it is
   the same one key the foot offers (owner, 2026-11-12: a guest must be able to PRESS it). */
.go-world-grow {
  flex: none; min-height: 44px; padding: 0 13px; border-radius: 10px;
  border: 0;
  background: color-mix(in srgb, var(--fu-cream) 14%, transparent);
  color: var(--fu-cream); font-family: var(--font-ui); font-size: .6rem;
  letter-spacing: .1em; text-transform: uppercase; cursor: pointer;
}
.go-world-grow[hidden], .go-world-line[hidden] { display: none; }
.go-world-grow.go-world-signin { flex:1; text-align:center; }
.go-world-grow[data-armed='1'] { background: var(--fu-cream); color: var(--fu-ink); }
.go-world-grow:active { background: color-mix(in srgb, var(--fu-cream) 24%, transparent); }
.go-world-grow[data-armed='1']:active { background: color-mix(in srgb, var(--fu-cream) 86%, transparent); }
.go-world-grow:focus-visible { outline: 2px solid var(--fu-cream); outline-offset: 2px; }
.go-world-grow[aria-busy='true'] { opacity: .6; pointer-events: none; }
@media (prefers-reduced-motion: reduce) {
  .go-world-surface > .planet-grown { display: none; }
  .go-world-surface > .planet-canvas { transition: none; }
}
`;

const ensureCss = (): void => {
  if (document.getElementById('go-world-css')) return;
  const style = document.createElement('style');
  style.id = 'go-world-css';
  style.textContent = CSS;
  document.head.append(style);
};

/**
 * THE WINDOW'S MOTION (owner brief, 2026-11-11: "make a smooth animation for all transitions when
 * it's showing up, when closing, etc ... cheap to render and snappy").
 *
 * Every beat here touches `opacity` and `translate` ONLY — both compositor properties, so no frame
 * of any of these transitions re-rasterises the planet. Nothing animates width, height, top, left,
 * filter, backdrop-filter or box-shadow, and this pass adds no rAF loop of its own: the only loop in
 * the window is the planet's own, which stops when the window or the tab is hidden.
 *
 * The tokens are the product's: `INTERFACE_MOTION` durations and easings, and
 * `interfaceMotionAllowed()` so Reduce motion / Speed off is instant and provably so (no animation
 * is created at all in that case — the element is simply set to its resting state).
 */
const MOTION = {
  /** The window's own arrival: short and low. */
  windowMs: INTERFACE_MOTION.open + 70,
  /** How far the window rises: 7px (the brief's ceiling is 8). */
  rise: 7,
  /** Its head and scrims follow this far behind the surface — the sheets' own stagger language. */
  stagger: 50,
  /** The exit: quicker than the arrival, and it sinks instead of rising. */
  exitMs: INTERFACE_MOTION.close,
  sink: 6,
  /** The head band and the foot: one short breath. */
  bandMs: INTERFACE_MOTION.open,
  bandTravel: 5,
} as const;

/** Fade + translate a band in. Opacity-only when `travel` is 0 (a scrim). */
const bandIn = (el: HTMLElement | null, travel: number = MOTION.bandTravel, delay = 0): void => {
  if (!el) return;
  for (const a of el.getAnimations()) { try { a.cancel(); } catch { /* already gone */ } }
  if (!interfaceMotionAllowed()) { el.style.removeProperty('opacity'); el.style.removeProperty('translate'); return; }
  el.animate(
    [
      { opacity: 0, translate: travel ? `0 ${travel}px` : '0 0' },
      { opacity: 1, translate: '0 0' },
    ],
    { duration: MOTION.bandMs, delay, easing: INTERFACE_MOTION.easeOpen, fill: 'both' },
  );
};

/** Fade a band out. Opacity only: a scrim that slides would drag its gradient over the ground. */
const bandOut = (el: HTMLElement | null, onDone?: () => void): void => {
  if (!el) return;
  const finish = (): void => { el.style.removeProperty('opacity'); el.style.removeProperty('translate'); onDone?.(); };
  if (!interfaceMotionAllowed()) { finish(); return; }
  const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.exitMs, easing: INTERFACE_MOTION.easeClose, fill: 'both' });
  a.finished.then(finish, finish);
};

/**
 * The pane's own nodes. The markup ships in `index.html`; anything a stale cached shell is missing is
 * built here, so a shell from before this card can never leave the pane half-drawn.
 */
const nodesOf = (host: HTMLElement) => {
  host.classList.add('go-world');
  let surface = host.querySelector<HTMLElement>('.go-world-surface');
  if (!surface) {
    surface = document.createElement('div');
    surface.className = 'go-world-surface';
    host.append(surface);
  }
  const make = <T extends HTMLElement>(selector: string, tag: string, cls: string): T => {
    let el = surface!.querySelector<T>(selector);
    if (!el) {
      el = document.createElement(tag) as T;
      el.className = cls;
      surface!.append(el);
    }
    return el;
  };
  const head = surface.querySelector<HTMLElement>('.go-world-head');
  const headEl = head ?? (() => {
    const el = document.createElement('div');
    el.className = 'go-world-head';
    surface!.prepend(el);
    return el;
  })();
  const title = headEl.querySelector<HTMLElement>('.go-world-title') ?? (() => {
    const el = document.createElement('span');
    el.className = 'go-world-title';
    headEl.append(el);
    return el;
  })();
  const wallet = headEl.querySelector<HTMLElement>('.go-world-wallet') ?? (() => {
    const el = document.createElement('span');
    el.className = 'go-world-wallet';
    headEl.append(el);
    return el;
  })();
  const bar = make<HTMLElement>('.go-world-bar', 'div', 'go-world-bar');
  const line = bar.querySelector<HTMLElement>('.go-world-line') ?? (() => {
    const el = document.createElement('span');
    el.className = 'go-world-line';
    bar.append(el);
    return el;
  })();
  const key = bar.querySelector<HTMLButtonElement>('.go-world-grow') ?? (() => {
    const el = document.createElement('button');
    el.className = 'go-world-grow';
    el.type = 'button';
    bar.append(el);
    return el;
  })();
  const note = make<HTMLElement>('.go-world-note', 'p', 'go-world-note');
  note.setAttribute('role', 'status');
  note.setAttribute('aria-live', 'polite');
  const teach = make<HTMLElement>('.go-world-teach', 'div', 'go-world-teach');
  return { host, surface, head: headEl, title, wallet, bar, line, key, note, teach };
};

export const mountEndgamePlanet = (host: HTMLElement, deps: EndgamePlanetDeps): EndgamePlanet => {
  ensureCss();
  const { surface, head, title, wallet, bar, line, key, note, teach } = nodesOf(host);
  title.textContent = PLANET.title;
  let world: World | null = null;
  let walletNow: SeedWallet | null = null;
  let me: string | null = null;
  let account = false;
  let selected: string | null = null;
  let armed: string | null = null;
  let busy = false;
  let frozen = false;
  let disposed = false;
  let planet: Planet | null = null;
  let mounting = false;
  let readAt = 0;
  /** Level 10's in-situ explanation is wanted on THIS card (main.ts decides, once per card). */
  let teachShown = false;

  const level = () => deps.level?.() ?? null;

  const paintWallet = (): void => {
    wallet.replaceChildren();
    if (!walletNow) { wallet.hidden = true; deps.onBalance?.(null); return; }
    wallet.hidden = false;
    wallet.append(seedIcon(14), document.createTextNode(seedBalanceLabel(walletNow.balance)));
    deps.onBalance?.(walletNow.balance);
  };

  /** THE WALLET'S ONE BEAT after a grow: a short settle on the chip, the card's own seed language. */
  const beatWallet = (): void => {
    if (!interfaceMotionAllowed()) return;
    wallet.animate(
      [{ opacity: 0.45, translate: '0 1px' }, { opacity: 1, translate: '0 0' }],
      { duration: 240, easing: INTERFACE_MOTION.easeOpen },
    );
  };

  const tileOf = (cellId: string | null): PaneTile => {
    if (!cellId || !world) return { kind: 'none' };
    const claim = world.claims.find((candidate) => candidate.cellId === cellId);
    if (claim) {
      const mine = claim.ownerId === me;
      return {
        kind: 'held',
        line: ownerLine(claim, mine, mine ? level() : null),
        spoken: ownerSpokenLine(claim, mine, mine ? level() : null),
      };
    }
    if (!isPlanetCell(cellId)) return { kind: 'pentagon' };
    return {
      kind: 'free',
      growable: canGrowAt(cellId, world, me),
      cost: world.cost,
      balance: walletNow ? walletNow.balance : null,
      account,
    };
  };

  /**
   * THE FOOT, WITH ITS OWN MOTION (owner brief, 2026-11-11: "THE FOOT / TILE BAR ... must fade/rise
   * in from the bottom edge on first appearance and fade out on deselect. Never re-animate on a word
   * change for the same tile").
   *
   * `visible` is the foot's REAL state, so a repaint of the same foot writes text and nothing else: a
   * 12 s world poll (or the same tile re-read) can never make the bar flicker. Only a hidden→shown or
   * shown→hidden edge animates, and only opacity + translate.
   */
  const showFoot = (el: HTMLElement): void => {
    el.hidden = false;
    bandIn(el, MOTION.bandTravel);
  };
  const hideFoot = (el: HTMLElement): void => {
    if (el.hidden) return;
    bandOut(el, () => { el.hidden = true; });
  };

  const paintBar = (): void => {
    const state = barFor(tileOf(selected), armed !== null && armed === selected);
    const label = state.key ? growKeyLabel(state.key) : '';
    // THE EXPLAINER GIVES WAY TO THE BAR (owner feedback, 2026-11-11): the level-10 card's two lines
    // own the window's foot until the player picks a tile; from then on the foot is the tile's own
    // line and its one key, on the same gutter — one foot, never two stacked strips.
    const explaining = teachShown && !selected;
    if (explaining) { hideFoot(bar); }
    else if (bar.hidden) { showFoot(bar); }
    teach.hidden = !explaining;
    line.textContent = state.line;
    line.hidden = state.key === 'signin';
    key.classList.toggle('go-world-signin', state.key === 'signin');
    line.title = state.spoken;
    key.hidden = state.key === null || busy;
    key.dataset.armed = state.key === 'confirm' ? '1' : '0';
    if (state.key) key.textContent = busy ? ONLINE.worldGrowing : state.key === 'signin' ? state.line : label;
    key.setAttribute('aria-label', state.key === 'signin' ? state.spoken : label);
    key.setAttribute('aria-busy', busy ? 'true' : 'false');
  };

  const pushPlanet = (): void => {
    if (!planet) return;
    const claims = world?.claims ?? [];
    planet.update({
      cells: world?.cells ?? [],
      claims,
      me,
      selected,
      // NO WORLD, NO HOME: the opening flight waits for the map, so the window can never start on
      // the world's centre and then jump (owner report, 2026-11-12: "not ALWAYS showing my cluster").
      home: world ? focusCell(claims, me) : null,
      growAnywhere: world?.growAnywhere === true,
    } as PlanetInput);
  };

  const paintSelection = (): void => {
    paintBar();
    pushPlanet();
  };

  const mount = async (): Promise<void> => {
    if (planet || mounting || disposed) return;
    mounting = true;
    try {
      const module = await import('../sphere/planet.js');
      if (disposed) return;
      const box = () => surface.getBoundingClientRect();
      planet = module.mountPlanet(surface, {
        onTile: (id) => { if (!disposed) select(id); },
        onBlocked: () => {
          note.textContent = PLANET.pentagon;
          note.hidden = false;
        },
        label: PLANET.controls,
        unavailable: PLANET.unavailable,
        mode: 'world',
        panel: box,
        contained: box,
        // YOUR LAND, TIGHT (owner, 2026-11-12: "it's not ALWAYS showing my cluster" and the cluster
        // should "fill a good part of the pane"). The window opens on the player's biggest cluster at
        // its own close tile size; a tap that lands on a tile too small to hit still flies in AND
        // chooses it, so one tap is one gesture.
        pickTiny: true,
        openTilePx: PANE_TILE_PX,
      });
      if (frozen) planet.freeze(true);
      pushPlanet();
      // TEST HOOKS, read-only, like `__severgrow`: the pane's own snapshot (what the shared planet
      // renderer last drew and where), and one forced frame. A suite's screenshot taken while the
      // loop is asleep can catch the compositor before the first real paint, so it asks for one.
      (globalThis as unknown as Record<string, unknown>).__goPlanet = () => planet?.snapshot() ?? null;
      (globalThis as unknown as Record<string, unknown>).__goPlanetFrame = () => { planet?.freeze(true); planet?.freeze(false); };
    } catch {
      if (!disposed) {
        note.textContent = PLANET.unavailable;
        note.hidden = false;
      }
    } finally {
      mounting = false;
    }
  };

  const select = (cellId: string | null): void => {
    if (busy) return;
    // A second tap on the same tile lets it go, exactly as the Planet page does.
    selected = selected === cellId ? null : cellId;
    armed = null;
    note.hidden = true;
    paintSelection();
  };

  const selectedKnown = (): boolean => {
    if (!selected || !world) return false;
    if (world.claims.some((claim) => claim.cellId === selected)) return true;
    return world.growAnywhere === true || world.cells.some((cell) => cell.id === selected);
  };

  const applyRead = (map: WorldMapPayload | null, nextWallet: SeedWallet | null): void => {
    if (map) {
      world = map.world;
      if (selected && !selectedKnown()) selected = null;
      const shown = world;
      if (shown) planet?.home(focusCell(shown.claims, me), PANE_TILE_PX);
    }
    if (nextWallet) walletNow = nextWallet;
    if (!world) {
      note.textContent = RESULT.planetUnavailable;
      note.hidden = false;
    }
    paintWallet();
    paintBar();
    pushPlanet();
  };

  const read = (): void => {
    if (disposed) return;
    const token = ++readAt;
    void Promise.all([
      deps.client.worldMap().catch(() => null),
      (async () => {
        const id = await deps.identity().catch(() => null);
        me = id?.playerId ?? null;
        account = id?.kind === 'account';
        if (!id) return null;
        return deps.client.seedWallet(id.token).catch(() => null);
      })(),
    ]).then(([map, nextWallet]) => {
      if (disposed || readAt !== token) return;
      applyRead(map, nextWallet);
    });
  };

  const grow = async (cellId: string): Promise<void> => {
    if (busy || !world) return;
    const id = await deps.identity().catch(() => null);
    if (!id || id.kind !== 'account') { paintBar(); return; }
    busy = true;
    armed = null;
    paintBar();
    try {
      await deps.client.claimWorld(id.token, cellId, crypto.randomUUID());
      note.textContent = PLANET_PANE.grown;
      note.hidden = false;
      planet?.grown(cellId);
      // Fresh (with the token): the server's anonymous cache could still hold the map from before.
      const map = await deps.client.worldMap(id.token).catch(() => null);
      const wallet = await deps.client.seedWallet(id.token).catch(() => null);
      if (!disposed) { applyRead(map, wallet); beatWallet(); }
    } catch {
      note.textContent = PLANET_PANE.growFailed;
      note.hidden = false;
      const map = await deps.client.worldMap(id.token).catch(() => null);
      if (!disposed) applyRead(map, null);
    } finally {
      busy = false;
      paintBar();
    }
  };

  /**
   * THE ONE LOGIN (owner, 2026-11-12): the same entry the Planet page uses — the product's own
   * account key, which opens the email sign-in sheet OVER whatever is on screen (the finish card
   * stays exactly where it is; the sheet is a sibling of it, above it). No second login UI is built
   * here, and the pane never guesses how signing in works.
   */
  const signIn = (): void => {
    // The product's own precedent for "is there a login entry?" is the key's existence
    // (`canSignIn`, web/src/main.ts) — so this asks exactly that, and never invents a second
    // answer. The markup ships the key on every build; a build without accounts leaves it hidden,
    // and a click on a hidden key is a no-op (there is nothing to sign in to).
    (document.getElementById('menu-login') as HTMLButtonElement | null)?.click();
  };

  key.addEventListener('click', () => {
    if (busy || !selected || !world) return;
    const state = barFor(tileOf(selected), armed === selected);
    if (state.key === null) return;
    if (state.key === 'retry') { read(); return; }
    if (state.key === 'signin') { signIn(); return; }
    if (state.key === 'grow') {
      // THE PLANET PAGE'S OWN TWO-PRESS SAFETY: the first tap asks, the second grows.
      armed = selected;
      paintBar();
      return;
    }
    void grow(selected);
  });

  /**
   * SIGNING IN MUST LAND IN THIS PANE (owner, 2026-11-12: "after loging in player is still able to
   * grow a tile on planet please"). The accounts module owns the login; this only listens to the
   * SAME identity-change signal the Planet page and the live layer use — the module's
   * `futasaku:identity` event, its in-tab listener, and another tab's storage write — then re-reads
   * the world and the wallet. Never polled: a card is a moment, not a dashboard.
   */
  const identityChanged = (): void => {
    if (disposed || host.hidden) return;
    read();
  };
  const offIdentity = subscribeIdentityChanges(identityChanged);
  window.addEventListener('futasaku:identity', identityChanged);
  const onStorage = (event: StorageEvent): void => { if (isIdentityStorageEvent(event.key, STORAGE_PREFIX)) identityChanged(); };
  window.addEventListener('storage', onStorage);
  /** The card is gone: not one listener outlives it (a later sign-in must never wake a dead pane). */
  const releaseListeners = (): void => {
    offIdentity();
    window.removeEventListener('futasaku:identity', identityChanged);
    window.removeEventListener('storage', onStorage);
  };

  return {
    open() {
      if (disposed) return;
      host.hidden = false;
      // THE WINDOW'S ARRIVAL (owner brief, 2026-11-11): the surface rises 7px and fades in, and its
      // head and its scrims land a beat behind it — the sheets' own stagger, on opacity + translate
      // only. The canvas is NOT scaled: scaling a WebGL surface is a repaint, not a composite.
      bandIn(surface, MOTION.rise);
      bandIn(head, 0, MOTION.stagger);
      bandIn(bar, MOTION.bandTravel, MOTION.stagger * 2);
      // The cached map makes the first frame real: your land is there before the network answers.
      const cached = deps.cachedWorld?.() ?? null;
      if (cached && !world) {
        world = cached;
        paintBar();
      }
      note.textContent = world ? '' : RESULT.planetLoading;
      note.hidden = !!world;
      // THE CARD LANDS FIRST, THE WORLD ARRIVES A BEAT LATER (owner feedback, 2026-11-11: the result
      // is a read-out, the planet is the hero — but the hero must never delay the read-out). The
      // network read starts now; the WebGL surface is mounted after the card's own entrance, so the
      // score's one count-up and the keys are painted before any 2 MB of buffers are uploaded.
      window.setTimeout(() => { if (!disposed && !host.hidden) void mount(); }, 240);
      read();
    },
    refresh() {
      if (disposed || host.hidden) return;
      read();
    },
    teach(on: boolean) {
      // THE HEAD BAND'S OWN EDGE (owner brief, 2026-11-11): the explainer fades and lifts <= 6px in,
      // and fades out before it is cleared. Opacity + translate only; Reduce motion is instant.
      const was = teachShown;
      teachShown = on;
      if (on && !was) {
        paintPlanetTeach(teach, true);
        bandIn(teach, MOTION.bandTravel);
      } else if (!on && was) {
        bandOut(teach, () => teach.replaceChildren());
      } else if (!on) {
        teach.hidden = true;
        teach.replaceChildren();
      }
      paintBar();
    },
    freeze(on: boolean) {
      frozen = on;
      planet?.freeze(on);
    },
    leave() {
      if (disposed) return;
      // THE LOOP STOPS BEFORE THE FADE: `freeze(true)` cancels the planet's rAF and releases the
      // sky, so not one frame is drawn while the surface leaves. Then the surface fades and sinks.
      planet?.freeze(true);
      bandOut(surface, () => {
        // The band is a WAAPI fade on opacity only; the node is thrown away at the end of it.
        host.hidden = true;
        disposed = true;
        releaseListeners();
        planet?.dispose();
        planet = null;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      readAt = 0;
      releaseListeners();
      // THE WINDOW'S EXIT: the canvas stops its own loop FIRST (the rAF is cancelled inside
      // `dispose`, before any frame of the fade), so nothing is drawn offscreen while it leaves.
      planet?.dispose();
      planet = null;
      host.hidden = true;
    },
  };
};

/** Level 10's teaching band: the Planet explains itself IN SITU, inside the window it describes. */
export const paintPlanetTeach = (teach: HTMLElement, show: boolean): void => {
  teach.hidden = !show;
  teach.replaceChildren();
  if (!show) return;
  // No second title: the window's head already names it ("THE PLANET"), so the band contributes its
  // two lines only — one name per window, one optical axis.
  const lines = document.createElement('ul');
  lines.className = 'go-world-teach-lines';
  for (const text of PLANET_TEACH.lines) {
    const li = document.createElement('li');
    li.textContent = text;
    lines.append(li);
  }
  teach.append(lines);
  teach.setAttribute('aria-label', `${PLANET_TEACH.title}. ${PLANET_TEACH.lines.join(' ')}`);
};