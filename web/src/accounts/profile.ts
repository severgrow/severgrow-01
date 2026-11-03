// The player's profile (owner brief, 2026-10-21; redesigned 2026-11-01).
//
// Owner, 2026-11-01: "keep NAME but say NAME & TAG and remove sign in signed in - that's silly",
// "matches won should be summary of any matches ever - keep seeds and tiles", "3 on top become
// offline and 3 bottom online", "the sections changed to games / win rate / longest streak",
// "add a flag of the country they're at", "add 1 tile with their chosen colour", "make sure futasaku
// logo is visible somewhere where it makes sense".
//
// So: four identity lines (name & tag, Seeds, tiles, matches won), then YOUR GAMES as two rows of
// the SAME three tiles — offline above, online below — each row carrying its word down the left
// edge. The sign-in line is gone: the panel only opens for a signed-in player, so saying so was
// telling them what they already knew.
//
// The VALUES are facts or they are an em dash. `profileRows` is pure, so a number can never be
// invented in the DOM: a null/NaN/negative Seeds, tiles or wins value renders as `PROFILE.unknown`,
// never as 0. The two records go through the same builder (logic/match-record.ts), which is what
// keeps the halves identical in rounding and in the em dash rule.
import { PROFILE } from '../../../src/strings.js';
import { colourById, colourIdFor } from '../../../src/tile-colours.js';
import type { Record3 } from '../logic/match-record.js';
import { recordRows } from '../logic/match-record.js';
import { countryName, flagOf } from '../logic/country.js';
import { SEEDS_WORD } from '../online/seed-icon.js';
import { createWordmarkMark } from '../player/branding.js';
import { HEX_TILE_POINTS } from '../player/hex-tile.js';
import { groupDigits } from '../logic/format.js';
import { enterSurface, exitSurface } from '../ui/interface-motion.js';

/** The one tile colour the profile draws, in the shape the map already knows. */
export type ProfileColour = Readonly<{ css: string; name: string }>;

export type ProfileFacts = {
  /** The player's display name with its #TAG, or null when the device has none. */
  name: string | null;
  /** ISO 3166-1 alpha-2 of the country the device places itself in, or null when unknown. */
  country: string | null;
  /** The colour this player's Territory tiles wear. Never null for a signed-in player. */
  colour: ProfileColour;
  /** The server wallet balance, or null when the read is unknown. */
  seeds: number | null;
  /** Cells this player OWNS in the shared world, or null when the read is unknown. */
  tiles: number | null;
  connectedTiles?: number | null;
  /** Every match this player ever won — offline and online — or null when a read is unknown. */
  matchesWon: number | null;
  /** The offline record: this device plus, signed in, the account's other devices. */
  offline: Record3 | null;
  /** The online record, from the server's public aggregate. */
  online: Record3 | null;
};

export type ProfileRow = Readonly<{ label: string; value: string }>;

/**
 * THE PLAYER ALWAYS HAS A COLOUR, so the profile's one tile is never absent (owner, 2026-11-02:
 * "i cant see the color hex in profile"). A player who has never picked one still HAS one: the
 * game derives it deterministically from their player id (`colourIdFor` → FNV-1a → one of the
 * twenty), which is the colour their Territory tiles already wear on the map. The old profile
 * asked the server and rendered `nothing` when the answer was an empty body — which is exactly
 * what a player who never chose sees. Reading the derived value first makes the tile a FACT, not
 * a request that may fail; the endpoint can only ever replace it with the stored choice.
 */
export const profileColour = (
  playerId: string,
  chosen: number | null = null,
): NonNullable<ProfileFacts['colour']> => {
  const colour = colourById(colourIdFor(playerId, chosen));
  return { css: colour.css, name: colour.name };
};

/**
 * WHAT A VISITOR MAY SEE (owner, 2026-11-01: "allow to look up other peoples profile on
 * territory"). Same sheet, same hairlines, but only the public facts the server allow-lists:
 * name & tag, level, tiles, their colour, and their ONLINE record. There is deliberately no Seeds
 * field and no offline field on this type, so the visitor renderer cannot even receive one.
 */
export type VisitorFacts = {
  name: string | null;
  level: number | null;
  tiles: number | null;
  connectedTiles?: number | null;
  /** The colour as the map draws it, plus its palette name and its hex for the visitor's line. */
  colour: { css: string; name: string; hex: string | null } | null;
  online: Record3 | null;
};

/** A known, sane count, or the honest em dash. A count is a whole, non-negative number. */
const count = (n: number | null | undefined): string =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 ? groupDigits(Math.floor(n)) : PROFILE.unknown;

/**
 * The identity values, retaining their existing indices for callers. The DOM places connected
 * tiles immediately before total tiles. Unknown reads always retain the honest em dash.
 */
export const profileRows = (facts: ProfileFacts): readonly ProfileRow[] => [
  { label: PROFILE.nameTag, value: facts.name && facts.name.trim() ? facts.name : PROFILE.unknown },
  { label: SEEDS_WORD, value: count(facts.seeds) },
  { label: PROFILE.tiles, value: count(facts.tiles) },
  { label: PROFILE.matchesWon, value: count(facts.matchesWon) },
  { label: PROFILE.connectedTiles, value: count(facts.connectedTiles) },
];

export type ProfileUI = {
  /** Open the sheet, remember the key that opened it, and focus the close control. */
  open(facts: ProfileFacts, trigger?: HTMLElement | null): void;
  /** Re-render the same lines while the sheet is open (a read settled after opening). */
  show(facts: ProfileFacts): void;
  /**
   * The SAME sheet in VISITOR mode. `null` is the honest loading/failed state: every fact it would
   * show is an em dash, never an invented number. Only the public facts are rendered.
   */
  openVisitor(facts: VisitorFacts | null, trigger?: HTMLElement | null): void;
  /** Repaint the visitor sheet when the read lands (ignored for an own profile). */
  showVisitor(facts: VisitorFacts | null): void;
  /** Close and give focus back to the key that opened it. */
  close(): void;
  isOpen(): boolean;
};

const NONE: ProfileUI = {
  open: () => undefined, show: () => undefined, openVisitor: () => undefined,
  showVisitor: () => undefined, close: () => undefined, isOpen: () => false,
};

/**
 * Wire the markup once. The panel traps no focus: Tab moves through the page as it always does, a
 * scrim tap or Escape closes it, and closing returns focus to the account key. Nothing here fetches.
 */
export const installProfileUI = (doc: Document = document): ProfileUI => {
  const sheet = doc.getElementById('sheet-profile');
  const scrim = doc.getElementById('profile-scrim');
  if (!sheet || !scrim) return NONE;

  const nameText = doc.getElementById('profile-name');
  const seedsValue = doc.getElementById('profile-seeds');
  const tilesValue = doc.getElementById('profile-tiles');
  const winsValue = doc.getElementById('profile-wins');
  const offlineGrid = doc.getElementById('profile-play-offline');
  const onlineGrid = doc.getElementById('profile-play-online');
  const values = [nameText, seedsValue, tilesValue, winsValue];
  if (values.some((el) => !el) || !offlineGrid || !onlineGrid) return NONE;

  // The words come from the one strings module (the currency's noun comes from the economy module,
  // exactly as the Territory wallet takes it), and the markup carries them as a no-JS fallback.
  const setText = (id: string, text: string) => {
    const el = doc.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('profile-title', PROFILE.title);
  setText('profile-name-label', PROFILE.nameTag);
  setText('profile-tiles-label', PROFILE.tiles);
  setText('profile-connected-label', PROFILE.connectedTiles);
  setText('profile-wins-label', PROFILE.matchesWon);
  setText('profile-seeds-label', SEEDS_WORD);
  setText('profile-play-title', PROFILE.playTitle);
  setText('profile-play-offline-label', PROFILE.offline);
  setText('profile-play-online-label', PROFILE.online);

  // The Futasaku WORDMARK — the tree-less mark the HUD badge and the online header carry — rather
  // than the emblem: the owner asked for "the logo without tree like one in game".
  const brand = doc.getElementById('profile-brand');
  if (brand && !brand.firstChild) brand.append(createWordmarkMark('futasaku-profile-white'));

  // The colour swatch's silhouette: the board's own hex, filled once here (the markup carries the
  // SVG, this writes the points).
  const swatchFace = doc.querySelector('#profile-colour .sp-swatch-face');
  if (swatchFace) swatchFace.setAttribute('points', HEX_TILE_POINTS);

  const flag = doc.getElementById('profile-flag');
  const swatch = doc.getElementById('profile-colour');
  // VISITOR MODE's two additive marks: the one quiet line that says whose sheet this is, and the
  // level inside the name line (the Territory tile bar's own `LEVEL 22` word). Own mode renders
  // neither, so its four rows and two records are byte-for-byte the layout they were.
  const levelText = doc.getElementById('profile-level');
  const playTitle = doc.getElementById('profile-play-title');

  const fillGrid = (grid: HTMLElement, record: Record3 | null) => {
    grid.replaceChildren(
      ...recordRows(record).map((row) => {
        const tile = doc.createElement('div');
        tile.className = 'sp-tile';
        const dt = doc.createElement('dt');
        dt.textContent = row.label;
        const dd = doc.createElement('dd');
        dd.textContent = row.value;
        tile.append(dt, dd);
        return tile;
      }),
    );
  };

  const fill = (facts: ProfileFacts) => {
    const rows = profileRows(facts);
    nameText!.textContent = rows[0]!.value;
    // Own mode has no level line (the sheet never had one): clear any visitor leftover.
    if (levelText) {
      levelText.hidden = true;
      levelText.textContent = '';
    }
    seedsValue!.textContent = rows[1]!.value;
    tilesValue!.textContent = rows[2]!.value;
    winsValue!.textContent = rows[3]!.value;
    setText('profile-connected', rows[4]!.value);

    // The flag: decoration, so it never says anything the name line does not — but it is named for
    // a screen reader rather than left as an unlabelled glyph.
    if (flag) {
      const glyph = flagOf(facts.country);
      flag.textContent = glyph;
      flag.hidden = glyph === '';
      if (glyph) {
        flag.setAttribute('role', 'img');
        flag.setAttribute('aria-label', countryName(facts.country) || facts.country || '');
        flag.setAttribute('title', countryName(facts.country) || facts.country || '');
      } else {
        flag.removeAttribute('role');
        flag.removeAttribute('aria-label');
        flag.removeAttribute('title');
      }
    }

    // The player's own tile colour, drawn as the MAP draws a hex (flat left/right edges, a point
    // top and bottom), so the profile shows the same object as the board.
    paintSwatch(facts.colour);

    fillGrid(offlineGrid!, facts.offline);
    fillGrid(onlineGrid!, facts.online);
  };

  /** The one place the colour tile is drawn, shared by the own and visitor modes. */
  const paintSwatch = (colour: { css: string; name: string } | null) => {
    if (!swatch) return;
    // THE ATTRIBUTE IS THE STATE. `hidden` is an IDL property of HTMLElement and this is an <svg>,
    // so `swatch.hidden = …` writes an expando and leaves the markup's `hidden` in place — which is
    // exactly why the tile never appeared on the live site (measured 0x0 with the attribute set).
    if (colour) swatch.removeAttribute('hidden');
    else swatch.setAttribute('hidden', '');
    if (colour) {
      // A named swatch must not also be aria-hidden, or the player's only colour indicator is
      // silent to assistive tech. The two states move together.
      swatch.removeAttribute('aria-hidden');
      swatch.style.setProperty('--tile', colour.css);
      swatch.setAttribute('role', 'img');
      swatch.setAttribute('aria-label', colour.name);
      swatch.setAttribute('title', colour.name);
    } else {
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.removeProperty('--tile');
      swatch.removeAttribute('role');
      swatch.removeAttribute('aria-label');
      swatch.removeAttribute('title');
    }
  };

  /**
   * The visitor face. ONLY public facts reach it: the type itself has no Seeds and no offline
   * record, so neither can be painted by accident. Unknowns are em dashes, and an unknown level is
   * simply absent rather than a made-up 1.
   */
  const fillVisitor = (facts: VisitorFacts | null) => {
    nameText!.textContent = facts?.name && facts.name.trim() ? facts.name : PROFILE.unknown;
    tilesValue!.textContent = count(facts?.tiles ?? null);
    setText('profile-connected', count(facts?.connectedTiles));
    const level =
      typeof facts?.level === 'number' && Number.isInteger(facts.level) && facts.level > 0 ? facts.level : null;
    if (levelText) {
      // Visible short form ("Lvl 7"); the element spells it out for a screen reader below.
      levelText.textContent = level === null ? '' : PROFILE.levelShort(level);
      if (level !== null) levelText.setAttribute('aria-label', `Level ${level}`);
      levelText.hidden = level === null;
    }
    // The colour TILE says the colour (owner, 2026-11-02: "what's the hashtag and number next to
    // tile in profile? color? remove"). The `#2C7A5B` code was a designer's label, not something a
    // player reads: the swatch already shows it, and its name is the swatch's own aria-label.
    paintSwatch(facts?.colour ?? null);
    // No country is derivable without an IP lookup, so a visitor never gets a flag.
    if (flag) {
      flag.textContent = '';
      flag.hidden = true;
      flag.removeAttribute('role');
      flag.removeAttribute('aria-label');
      flag.removeAttribute('title');
    }
    // The rows a visitor must not see carry no value at all — the CSS hides them by mode, and
    // these em dashes mean even a style-less render can never expose a number that was there for
    // an own profile a moment ago. The online record is the only record rendered.
    if (seedsValue) seedsValue.textContent = PROFILE.unknown;
    if (winsValue) winsValue.textContent = PROFILE.unknown;
    fillGrid(offlineGrid!, null);
    fillGrid(onlineGrid!, facts?.online ?? null);
    if (playTitle) playTitle.textContent = PROFILE.theirGames;
  };

  let opened = false;
  let trigger: HTMLElement | null = null;

  const close = () => {
    if (!opened) return;
    opened = false;
    const back = trigger;
    trigger = null;
    const done = () => {
      if (opened) return; // a rapid reopen interrupts the exit and keeps the panel painted
      sheet!.hidden = true;
      scrim!.hidden = true;
      back?.focus({ preventScroll: true });
    };
    if (!exitSurface(sheet, { onDone: done })) done();
  };

  scrim.addEventListener('click', close);
  sheet.querySelector('[data-profile-close]')?.addEventListener('click', close);
  // CAPTURE phase on purpose: the game's own Escape handler (web/src/main.ts) also listens on the
  // document, and closing this read-only sheet must not cancel a board selection behind it. Being
  // first in the path lets Escape close the profile and go no further.
  doc.addEventListener(
    'keydown',
    (e) => {
      if (!opened || e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    },
    true,
  );

  /** One reveal for both modes: ownership of `hidden`, the entrance and the focus live here. */
  const reveal = (opener?: HTMLElement | null) => {
    trigger = opener ?? (doc.activeElement instanceof HTMLElement ? doc.activeElement : null);
    sheet!.hidden = false;
    scrim!.hidden = false;
    opened = true;
    enterSurface(sheet!);
    (sheet!.querySelector('[data-profile-close]') as HTMLElement | null)?.focus({ preventScroll: true });
  };

  return {
    open(facts, opener) {
      // ONE panel, two modes: `data-mode` is the only switch. Own mode restores its own title and
      // shows every row it always had.
      sheet!.dataset.mode = 'own';
      if (playTitle) playTitle.textContent = PROFILE.playTitle;
      fill(facts);
      reveal(opener);
    },
    show(facts) {
      if (opened && sheet!.dataset.mode !== 'visitor') fill(facts);
    },
    openVisitor(facts, opener) {
      sheet!.dataset.mode = 'visitor';
      fillVisitor(facts);
      reveal(opener);
    },
    showVisitor(facts) {
      if (opened && sheet!.dataset.mode === 'visitor') fillVisitor(facts);
    },
    close,
    isOpen: () => opened,
  };
};
