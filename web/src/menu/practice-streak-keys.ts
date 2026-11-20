// THE PRACTICE KEYS' STREAKS (owner, 2026-11-18): "The Practice keys EASY / MEDIUM / HARD / BLITZ each
// show two numbers on their sides, the same pattern as the Planet key (tiles and Seeds): LEFT =
// current streak (muted), RIGHT = best streak (slightly brighter)." Asked, the owner chose: a "0" when
// there is nothing yet, and the same sides in left-hand mode.
//
// The numbers wear the Planet key's read-out exactly (style.css `.menu-territory-side`: UI font,
// .95rem, medium weight, tabular lining figures, 1 line, .02em, the same three-cell grid with a 6px
// gap and a 3ch cell). Nothing else goes inside the key: no icon, no label. The label stays centred
// whatever the numbers are, so a 9 becoming a 10 never moves it. Values are updated in place.
import type { PracticeStreaks, PracticeTier } from '../../../server/src/streaks/rules.js';

const CSS = `
/* THE KEY'S THREE CELLS (owner, 2026-11-18: "numbers ... centered under [the legend words] - but with
   equal spaces from the edges of the buttons so its symmetric"). The two number cells are exactly as
   wide as the legend's words (--streak-col, measured once when painted) and sit 3px inside the key's
   edge, like the words; the label takes the middle. The key's 1px (transparent) border + 3px. */
#levels .level-grid .difficulty-tile.practice-streak-key {
  display: grid;
  grid-template-columns: var(--streak-col, 7.5em) minmax(0, 1fr) var(--streak-col, 7.5em);
  align-items: center;
  column-gap: 0;
  padding-inline: 3px;
}
#levels .practice-streak-key > .practice-streak-label { grid-area: 1 / 2; display: inline-flex; align-items: center; justify-content: center; gap: .28em; white-space: nowrap; }
#levels .practice-streak-key > .practice-streak-side {
  min-width: 0;
  justify-self: stretch;
  text-align: center;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: var(--w-ui-medium, 500);
  font-variant-numeric: lining-nums tabular-nums;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: none;
}
/* Current is muted, best slightly brighter. Opacity of the key's own ink, so both read on the plain
   key and on the selected (filled) key alike. */
#levels .practice-streak-key > .practice-streak-current { grid-area: 1 / 1; opacity: .52; }
#levels .practice-streak-key > .practice-streak-best { grid-area: 1 / 3; opacity: .74; }
/* THE LEGEND (owner, 2026-11-18: "between easy and practice match make it say 'current streak' and
   'longest streak' cleanly. All aligned symmetric"). One quiet line above the first key, in the
   instrument label style; each word sits exactly over its own column of numbers (the key's 1px
   border + 16px padding), mirror images of each other. Not spoken: each key says its own numbers. */
#levels .level-grid > .practice-streak-legend {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  /* "aligned inside to the button['s] left border with 3px margin" (owner): 1px border + 3px. */
  padding: 0 4px;
  /* "a tiny bit more margin between [the] titles and [the] first button" (owner, 2026-11-18). */
  margin-bottom: 2px;
  font-family: var(--font-ui);
  font-size: var(--instrument-label-size, .6875rem);
  letter-spacing: var(--instrument-tracking, .08em);
  line-height: 1;
  text-transform: uppercase;
  color: var(--instrument-muted, #e8ddc5b3);
  opacity: .8;
  white-space: nowrap;
}
#levels .practice-streak-legend > span:last-child { text-align: end; }
@media (max-width: 340px) {
  #levels .practice-streak-key > .practice-streak-side { font-size: 0.8rem; }
  #levels .level-grid > .practice-streak-legend { font-size: .5625rem; letter-spacing: .06em; }
}
`;

/** The Blitz key's compatibility id is `pro` (blitz/practice.ts). */
export const tierOfKey = (key: HTMLElement): PracticeTier | null => {
  const id = key.dataset.difficulty;
  return id === 'easy' || id === 'medium' || id === 'hard' ? id : id === 'pro' ? 'blitz' : null;
};

const ensureCss = (doc: Document) => {
  if (doc.getElementById('practice-streak-keys-css')) return;
  const style = doc.createElement('style');
  style.id = 'practice-streak-keys-css';
  style.textContent = CSS;
  doc.head.append(style);
};

const spoken = (base: string, current: number, best: number): string =>
  `${base} Current streak ${current}, longest streak ${best}.`;

/** The legend's two words (owner, 2026-11-18). */
export const STREAK_LEGEND = Object.freeze({ current: 'Current streak', best: 'Longest streak' });

/**
 * Put a key back exactly as the Practice screen built it: the numbers and legend are removed, the
 * original children return, and its class / inline layout / spoken label are restored. Used when a
 * guest (or an account with fewer than three completed games) must not see the streaks at all.
 */
const restoreKey = (key: HTMLElement): void => {
  if (!key.classList.contains('practice-streak-key')) return;
  const label = key.querySelector('.practice-streak-label');
  if (label) key.replaceChildren(...Array.from(label.childNodes));
  key.classList.remove('practice-streak-key');
  // Restore the key's own spoken name: it must not keep "Current streak…" while showing no numbers.
  const spoken = key.dataset.streakSpoken;
  if (spoken !== undefined) key.setAttribute('aria-label', spoken);
  key.removeAttribute('data-streak-spoken');
  const style = key.dataset.streakStyle;
  if (style !== undefined) key.setAttribute('style', style);
  delete key.dataset.streakStyle;
};

/**
 * Give every Practice key in `grid` its two numbers (once), or refresh them in place. The key's own
 * content becomes the centre cell untouched; its spoken label gains the two numbers.
 *
 * `revealed` is the owner's visibility rule (2026-11-20): guests never see the legend or the
 * numbers, and a signed-in account sees them only after three fully completed Practice matches
 * across the tiers. When false this is a no-op that also restores any key painted before, so an
 * account switch or a sign-out can never leave numbers behind.
 */
export const paintPracticeStreakKeys = (grid: HTMLElement, streaks: PracticeStreaks, options: { revealed?: boolean } = {}): void => {
  ensureCss(grid.ownerDocument);
  if (options.revealed === false) {
    grid.querySelector(':scope > .practice-streak-legend')?.remove();
    for (const key of grid.querySelectorAll<HTMLElement>('.difficulty-tile')) restoreKey(key);
    grid.style.removeProperty('--streak-col');
    return;
  }
  if (!grid.querySelector(':scope > .practice-streak-legend') && grid.querySelector('.difficulty-tile')) {
    const legend = grid.ownerDocument.createElement('div');
    legend.className = 'practice-streak-legend';
    legend.setAttribute('aria-hidden', 'true');
    const current = grid.ownerDocument.createElement('span');
    current.textContent = STREAK_LEGEND.current;
    const best = grid.ownerDocument.createElement('span');
    best.textContent = STREAK_LEGEND.best;
    legend.append(current, best);
    grid.prepend(legend);
  }
  // The number cells take the legend words' exact width (the wider of the two, so both sides match).
  // Measured on every paint (the screen opening, a streak changing) and once the fonts settle.
  const fit = () => {
    const words = grid.querySelectorAll<HTMLElement>(':scope > .practice-streak-legend > span');
    const width = Math.max(0, ...Array.from(words, (w) => w.getBoundingClientRect().width));
    if (width > 0) grid.style.setProperty('--streak-col', `${Math.ceil(width * 100) / 100}px`);
  };
  fit();
  void grid.ownerDocument.fonts?.ready.then(fit);
  for (const key of grid.querySelectorAll<HTMLElement>('.difficulty-tile')) {
    const tier = tierOfKey(key);
    if (!tier) continue;
    if (!key.classList.contains('practice-streak-key')) {
      const label = grid.ownerDocument.createElement('span');
      label.className = 'practice-streak-label';
      label.append(...Array.from(key.childNodes));
      const current = grid.ownerDocument.createElement('span');
      current.className = 'practice-streak-side practice-streak-current';
      current.setAttribute('aria-hidden', 'true');
      const best = grid.ownerDocument.createElement('span');
      best.className = 'practice-streak-side practice-streak-best';
      best.setAttribute('aria-hidden', 'true');
      key.dataset.streakSpoken = key.getAttribute('aria-label') ?? '';
      // Remember the original inline layout (the Blitz key sets one), so a hidden state can put the
      // key back byte-for-byte if the numbers are hidden again (a sign-out or another account).
      key.dataset.streakStyle = key.getAttribute('style') ?? '';
      // The key's own inline layout (the Blitz key sets one) yields to the shared three-cell grid.
      key.style.removeProperty('display');
      key.style.removeProperty('justify-content');
      key.style.removeProperty('gap');
      key.classList.add('practice-streak-key');
      key.replaceChildren(current, label, best);
    }
    const s = streaks[tier];
    const current = key.querySelector('.practice-streak-current');
    const best = key.querySelector('.practice-streak-best');
    if (current && current.textContent !== String(s.current)) current.textContent = String(s.current);
    if (best && best.textContent !== String(s.best)) best.textContent = String(s.best);
    key.setAttribute('aria-label', spoken(key.dataset.streakSpoken ?? '', s.current, s.best));
  }
};
