// The player's profile — a SKELETON (owner brief, 2026-10-21).
//
// "if logged in it says name on it - clicked shows a draft of players profile - built just skeleton
//  for it now, showing basic info about the player"
//
// Exactly five read-only lines: name, sign-in status, Seeds, tiles, matches won. No editing, no
// sign-out, no avatar: Settings already owns everything a player can change. The panel borrows the
// pause panel's language (one axis, hairline rules, neutral digits) because it is a read-out, not a
// second app — its CSS lives beside `#sheet-menu` in web/src/style.css.
//
// The VALUES are facts or they are an em dash. `profileRows` is pure, so a number can never be
// invented in the DOM: a null/NaN/negative Seeds, tiles or wins value renders as `PROFILE.unknown`,
// never as 0. Seeds and tiles come from the SAME read the Territory entry uses (one wallet + one
// map read, cached by web/src/online/territory-cache.ts); matches won has no player-facing source
// in this build, so its fact is honestly null.
import { PROFILE } from '../../../src/strings.js';
import { SEEDS_WORD } from '../online/seed-icon.js';
import { enterSurface, exitSurface } from '../ui/interface-motion.js';

export type ProfileFacts = {
  /** The player's display name with its #TAG, or null when the device has none. */
  name: string | null;
  /** Signed in with Google (true) or playing as a guest (false). */
  signedIn: boolean;
  /** The server wallet balance, or null when the read is unknown. */
  seeds: number | null;
  /** Cells this player OWNS in the shared world, or null when the read is unknown. */
  tiles: number | null;
  /** Finished online matches this player won, or null when there is no source for it. */
  matchesWon: number | null;
};

export type ProfileRow = Readonly<{ label: string; value: string }>;

/** A known, sane count, or the honest em dash. A count is a whole, non-negative number. */
const count = (n: number | null): string =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 ? String(Math.floor(n)) : PROFILE.unknown;

/**
 * The five lines, in the owner's order. Pure: the panel's DOM writes these strings verbatim, so
 * there is no second place where a value could be guessed differently.
 */
export const profileRows = (facts: ProfileFacts): readonly ProfileRow[] => [
  { label: PROFILE.name, value: facts.name && facts.name.trim() ? facts.name : PROFILE.unknown },
  { label: PROFILE.signIn, value: facts.signedIn ? PROFILE.signedIn : PROFILE.guest },
  { label: SEEDS_WORD, value: count(facts.seeds) },
  { label: PROFILE.tiles, value: count(facts.tiles) },
  { label: PROFILE.matchesWon, value: count(facts.matchesWon) },
];

export type ProfileUI = {
  /** Open the sheet, remember the key that opened it, and focus the close control. */
  open(facts: ProfileFacts, trigger?: HTMLElement | null): void;
  /** Re-render the same five lines while the sheet is open (a read settled after opening). */
  show(facts: ProfileFacts): void;
  /** Close and give focus back to the key that opened it. */
  close(): void;
  isOpen(): boolean;
};

const VALUE_IDS = ['profile-name', 'profile-signin', 'profile-seeds', 'profile-tiles', 'profile-wins'] as const;
/**
 * Wire the markup once. The panel traps no focus: Tab moves through the page as it always does, a
 * scrim tap or Escape closes it, and closing returns focus to the account key. Nothing here fetches.
 */
export const installProfileUI = (doc: Document = document): ProfileUI => {
  const sheet = doc.getElementById('sheet-profile');
  const scrim = doc.getElementById('profile-scrim');
  const values = VALUE_IDS.map((id) => doc.getElementById(id));
  if (!sheet || !scrim || values.some((el) => !el)) {
    return { open: () => undefined, show: () => undefined, close: () => undefined, isOpen: () => false };
  }

  let opened = false;
  let trigger: HTMLElement | null = null;

  // The words come from the one strings module (the currency's noun comes from the economy module,
  // exactly as the Territory wallet takes it), and the markup carries them as a no-JS fallback.
  const title = doc.getElementById('profile-title');
  if (title) title.textContent = PROFILE.title;
  const labels = [PROFILE.name, PROFILE.signIn, SEEDS_WORD, PROFILE.tiles, PROFILE.matchesWon];
  sheet.querySelectorAll('.sp-row dt').forEach((dt, index) => {
    const label = labels[index];
    if (label) dt.textContent = label;
  });

  const fill = (facts: ProfileFacts) => {
    const rows = profileRows(facts);
    rows.forEach((row, index) => {
      const el = values[index];
      if (el) el.textContent = row.value;
    });
  };

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
      sheet.hidden = false;
      scrim.hidden = false;
      opened = true;
      enterSurface(sheet);
      (sheet.querySelector('[data-profile-close]') as HTMLElement | null)?.focus({ preventScroll: true });
    },
    show(facts) {
      if (opened) fill(facts);
    },
    close,
    isOpen: () => opened,
  };
};
