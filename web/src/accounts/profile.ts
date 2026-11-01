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
import type { Record3 } from '../logic/match-record.js';
import { recordRows } from '../logic/match-record.js';
import { countryName, flagOf } from '../logic/country.js';
import { SEEDS_WORD } from '../online/seed-icon.js';
import { createEmblemMark } from '../player/branding.js';
import { enterSurface, exitSurface } from '../ui/interface-motion.js';

export type ProfileFacts = {
  /** The player's display name with its #TAG, or null when the device has none. */
  name: string | null;
  /** ISO 3166-1 alpha-2 of the country the device places itself in, or null when unknown. */
  country: string | null;
  /** The colour this player's Territory tiles wear, or null when it could not be read. */
  colour: { css: string; name: string } | null;
  /** The server wallet balance, or null when the read is unknown. */
  seeds: number | null;
  /** Cells this player OWNS in the shared world, or null when the read is unknown. */
  tiles: number | null;
  /** Every match this player ever won — offline and online — or null when a read is unknown. */
  matchesWon: number | null;
  /** The offline record: this device plus, signed in, the account's other devices. */
  offline: Record3 | null;
  /** The online record, from the unbounded match list. */
  online: Record3 | null;
};

export type ProfileRow = Readonly<{ label: string; value: string }>;

/** A known, sane count, or the honest em dash. A count is a whole, non-negative number. */
const count = (n: number | null): string =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 ? String(Math.floor(n)) : PROFILE.unknown;

/**
 * The four identity lines, in the owner's order. Pure: the panel's DOM writes these strings verbatim,
 * so there is no second place where a value could be guessed differently.
 */
export const profileRows = (facts: ProfileFacts): readonly ProfileRow[] => [
  { label: PROFILE.nameTag, value: facts.name && facts.name.trim() ? facts.name : PROFILE.unknown },
  { label: SEEDS_WORD, value: count(facts.seeds) },
  { label: PROFILE.tiles, value: count(facts.tiles) },
  { label: PROFILE.matchesWon, value: count(facts.matchesWon) },
];

export type ProfileUI = {
  /** Open the sheet, remember the key that opened it, and focus the close control. */
  open(facts: ProfileFacts, trigger?: HTMLElement | null): void;
  /** Re-render the same lines while the sheet is open (a read settled after opening). */
  show(facts: ProfileFacts): void;
  /** Close and give focus back to the key that opened it. */
  close(): void;
  isOpen(): boolean;
};

const NONE: ProfileUI = { open: () => undefined, show: () => undefined, close: () => undefined, isOpen: () => false };

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
  setText('profile-wins-label', PROFILE.matchesWon);
  setText('profile-seeds-label', SEEDS_WORD);
  setText('profile-play-title', PROFILE.playTitle);
  setText('profile-play-offline-label', PROFILE.offline);
  setText('profile-play-online-label', PROFILE.online);

  // The Futasaku mark, the same asset and the same tinted-SVG treatment the HUD badge and the
  // online submenu header use — one brand, built once, not a second logo for this sheet.
  const brand = doc.getElementById('profile-brand');
  if (brand && !brand.firstChild) brand.append(createEmblemMark('futasaku-profile-white'));

  const flag = doc.getElementById('profile-flag');
  const swatch = doc.getElementById('profile-colour');

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
    seedsValue!.textContent = rows[1]!.value;
    tilesValue!.textContent = rows[2]!.value;
    winsValue!.textContent = rows[3]!.value;

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

    // The player's own tile colour, so the profile answers "what colour am I?" without the map.
    if (swatch) {
      swatch.hidden = !facts.colour;
      if (facts.colour) {
        swatch.style.setProperty('--tile', facts.colour.css);
        swatch.setAttribute('role', 'img');
        swatch.setAttribute('aria-label', facts.colour.name);
        swatch.setAttribute('title', facts.colour.name);
      } else {
        swatch.style.removeProperty('--tile');
        swatch.removeAttribute('role');
        swatch.removeAttribute('aria-label');
        swatch.removeAttribute('title');
      }
    }

    fillGrid(offlineGrid!, facts.offline);
    fillGrid(onlineGrid!, facts.online);
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

  return {
    open(facts, opener) {
      trigger = opener ?? (doc.activeElement instanceof HTMLElement ? doc.activeElement : null);
      fill(facts);
      sheet!.hidden = false;
      scrim!.hidden = false;
      opened = true;
      enterSurface(sheet!);
      (sheet!.querySelector('[data-profile-close]') as HTMLElement | null)?.focus({ preventScroll: true });
    },
    show(facts) {
      if (opened) fill(facts);
    },
    close,
    isOpen: () => opened,
  };
};
