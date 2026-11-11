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
import { isPlanetCell, worldNeighbours } from '../../../server/src/world.js';
import type { Planet, PlanetInput } from '../sphere/planet.js';
import { PLANET_PANE, PLANET_TEACH, SEEDS_WORD, seedBalanceLabel, seedIcon } from './seed-icon.js';
import { homeTile } from './world-planet.js';
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
  dispose: () => void;
};

/**
 * WHAT THE BAR SAYS for the selected tile. Pure, so the whole matrix is a unit test instead of a
 * source-text guess. `armed` is the second press of the grow's two-press safety.
 */
export type PaneBar = {
  line: string;
  spoken: string;
  key: 'grow' | 'confirm' | 'retry' | null;
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
  if (!tile.account) return { line: ONLINE.worldSignInToGrow, spoken: ONLINE.worldSignInToGrow, key: null };
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
export const growKeyLabel = (key: 'grow' | 'confirm' | 'retry'): string =>
  key === 'confirm' ? ONLINE.worldGrowConfirm : key === 'retry' ? RESULT.planetRetry : ONLINE.worldGrowKey;

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

const CSS = `
/* THE WINDOW AND ITS ONE GUTTER (owner feedback, 2026-11-11: "one optical axis ... the wallet chip
   and the hint line on the same gutter as the card's text"). --go-gutter is set by the card and is
   the same value the card's own text sits on, so the window's chrome and the words above it share
   one vertical line. No border: the window is the tonal shift into space, nothing stacked. */
#go-world { position: relative; min-height: 0; }
.go-world-surface {
  position: relative; overflow: hidden; isolation: isolate; height: 100%;
  border-radius: 12px; background: #0e0f10;
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
  padding: 14px var(--go-gutter, 14px) 10px;
  background: linear-gradient(to top, #0b0d0cf2 55%, #0b0d0c00);
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
  padding: 14px var(--go-gutter, 14px) 9px;
  background: linear-gradient(to top, #0b0d0ceb 42%, #0b0d0c00);
}
.go-world-bar[hidden] { display: none; }
.go-world-line {
  min-width: 0; font-family: var(--font-ui); font-size: .56rem; line-height: 1.25;
  letter-spacing: .12em; text-transform: uppercase; color: #e8ddc5d9;
}
.go-world-grow {
  flex: none; min-height: 34px; padding: 0 11px; border-radius: 9px;
  border: 1px solid color-mix(in srgb, var(--fu-cream) 34%, transparent);
  background: color-mix(in srgb, var(--fu-cream) 12%, transparent);
  color: var(--fu-cream); font-family: var(--font-ui); font-size: .6rem;
  letter-spacing: .1em; text-transform: uppercase; cursor: pointer;
}
.go-world-grow[hidden] { display: none; }
.go-world-grow[data-armed='1'] { background: var(--fu-cream); color: var(--fu-ink); }
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
  return { host, surface, title, wallet, bar, line, key, note, teach };
};

export const mountEndgamePlanet = (host: HTMLElement, deps: EndgamePlanetDeps): EndgamePlanet => {
  ensureCss();
  const { surface, title, wallet, bar, line, key, note, teach } = nodesOf(host);
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

  const paintBar = (): void => {
    const state = barFor(tileOf(selected), armed !== null && armed === selected);
    const label = state.key ? growKeyLabel(state.key) : '';
    // THE EXPLAINER GIVES WAY TO THE BAR (owner feedback, 2026-11-11): the level-10 card's two lines
    // own the window's foot until the player picks a tile; from then on the foot is the tile's own
    // line and its one key, on the same gutter — one foot, never two stacked strips.
    const explaining = teachShown && !selected;
    teach.hidden = !explaining;
    bar.hidden = explaining;
    line.textContent = state.line;
    line.title = state.spoken;
    key.hidden = state.key === null || busy;
    key.dataset.armed = state.key === 'confirm' ? '1' : '0';
    if (state.key) key.textContent = busy ? ONLINE.worldGrowing : label;
    key.setAttribute('aria-label', label);
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
      home: homeTile(claims, me),
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
        // The card's window is a window onto the WORLD (owner feedback, 2026-11-11): the globe fills
        // the frame, and one tap that lands on a tile too small to hit flies in and chooses it.
        globe: true,
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
      if (shown) planet?.home(homeTile(shown.claims, me));
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
      const map = await deps.client.worldMap().catch(() => null);
      const wallet = await deps.client.seedWallet(id.token).catch(() => null);
      if (!disposed) applyRead(map, wallet);
    } catch {
      note.textContent = PLANET_PANE.growFailed;
      note.hidden = false;
      const map = await deps.client.worldMap().catch(() => null);
      if (!disposed) applyRead(map, null);
    } finally {
      busy = false;
      paintBar();
    }
  };

  key.addEventListener('click', () => {
    if (busy || !selected || !world) return;
    const state = barFor(tileOf(selected), armed === selected);
    if (state.key === null) return;
    if (state.key === 'retry') { read(); return; }
    if (state.key === 'grow') {
      // THE PLANET PAGE'S OWN TWO-PRESS SAFETY: the first tap asks, the second grows.
      armed = selected;
      paintBar();
      return;
    }
    void grow(selected);
  });

  return {
    open() {
      if (disposed) return;
      host.hidden = false;
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
      teachShown = on;
      if (on) paintPlanetTeach(teach, true);
      else { teach.hidden = true; teach.replaceChildren(); }
      paintBar();
    },
    freeze(on: boolean) {
      frozen = on;
      planet?.freeze(on);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      readAt = 0;
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