// THE FIRST-RUN NUDGE — ten lamps on the PLAY key (owner brief, 2026-11-01).
//
// Owner's words: "find a smart elegant way to direct people into level 1 campaign when first logged
// in. not needed in accounts, but needed when someone just enters the game for the first time.
// nothing crazy, futasaku style indicator that levels 1-10 are suggested to complete before doing
// anything else .. dissapers when level 10 cleared . 150iq efficiency design etc".
//
// WHAT IT IS. Ten hairline lamps set into the PLAY key's lower bezel, one per lesson (campaign levels
// 1-10). An empty ring is a lesson not yet cleared; a ring filled with the key's own ink is one that
// is. Ten is the whole target, the filled ones are how far the player is, and the strip is simply not
// painted once the tenth is cleared — so its own disappearance, not a fanfare, is the completion.
//
// WHY ON THE PLAY KEY RATHER THAN BESIDE IT. It must be the first thing a new player meets: the menu
// is the first screen, so the strip has to live in that one column WITHOUT moving anything, because
// the menu's key spacing is pinned (tests/menu-fit.ts measures it at 320x568). A row of lamps is not
// a key: made pressable it would be a control that does not look like one, and a 44px key of its own
// would add a row this menu does not have room for. PLAY is the one key that already leads to LEVEL 1
// (the cream entry at the top of the PLAY submenu), so the nudge costs no tap target, steals no tap
// from the key beneath it, and adds no step the player was not already taking.
//
// THE COST (the "150iq" part). `firstRun` is ONE pure function of two things the menu already has:
// this device's progress record and the account's cleared level numbers. Nothing HERE fetches,
// subscribes, stores or ticks: the lamps are painted in the same pass that lays the menu out
// (main.ts → layoutMenu), and the paint is a `hidden` flag plus one class per lamp. The account read
// lives in menu/account-clears.ts (one bounded read, cached by player id); this module only unions
// its answer. A missing or failed answer is `null` and leaves the device lamps exactly as they are.
import type { CampaignLevel, CampaignProgress } from '../../../src/campaign/index.js';
import { CAMPAIGN_CHAPTERS } from '../../../src/campaign/index.js';
import { CAMPAIGN, MENU } from '../../../src/strings.js';
import { EASE, MOTION } from '../logic/motion.js';

/**
 * THE TEN LESSONS: campaign levels 1-10, which ARE chapter 1 (docs/SPEC.md). Read from the level
 * data rather than hard-coded, so the strip can never show a number of lamps the campaign does not
 * have, and the last one — `c1-10` — is the level whose clearing ends the nudge.
 */
const LESSONS: readonly CampaignLevel[] = Object.freeze(
  [...(CAMPAIGN_CHAPTERS.find((chapter) => chapter.number === 1)?.levels ?? [])].sort((a, b) => a.number - b.number),
);

/** How much of the ten lessons is behind this player. `null` means: the nudge is over (no lamps). */
export type FirstRun = Readonly<{ lit: number; total: number }>;

/**
 * The account's cleared levels — campaign level NUMBERS (1-10) from the server's own
 * `campaign_clears` rows. `null`/`undefined` means "not answered (or no account)": the device's
 * record alone decides, exactly as before. An empty array is a real answer ("this account has
 * cleared nothing") and is equivalent to none for the union.
 */
export type AccountClears = readonly number[] | null | undefined;

/**
 * THE ONE PREDICATE — the UNION of the device and the account.
 *
 * A level counts as cleared when EITHER source says so:
 *
 *   * Source A (`completed`, this device): the record the menu already reads. A guest, a fresh
 *     device, or a failed account read always has this.
 *   * Source B (`account`, the signed-in account): level numbers from the server's verified
 *     `campaign_clears`. A returning player on a NEW phone must not be walked through levels the
 *     account already finished.
 *
 * The nudge is hidden once the TENTH lesson is cleared in either source. `c1-10` is the marker:
 * levels unlock in order, so clearing it means the ten are done. Its own disappearance is the
 * completion — a replay, a practice match, an online duel or a cleared tenth on the account can
 * never bring it back.
 *
 *   fresh player                         → { lit: 0, total: 10 }   (visible)
 *   device c1-01…c1-03                   → { lit: 3, total: 10 }   (visible)
 *   account cleared 1-7 (new phone)      → { lit: 7, total: 10 }   (visible)
 *   device 1-3 + account 4-7             → { lit: 7, total: 10 }   (union)
 *   c1-10 on the device OR account 10    → null                    (gone, for ever)
 */
export const firstRun = (
  progress: Pick<CampaignProgress, 'completed'>,
  account?: AccountClears,
): FirstRun | null => {
  const last = LESSONS[LESSONS.length - 1];
  if (!last) return null;
  // Read the account's answer ONCE into a set of ids; a missing answer (null/undefined) is an
  // empty set, never a hidden nudge.
  const accountNumbers = new Set((account ?? []).filter((n) => Number.isInteger(n)));
  const cleared = (lesson: CampaignLevel): boolean =>
    progress.completed.includes(lesson.id) || accountNumbers.has(lesson.number);
  if (cleared(last)) return null;
  return { lit: LESSONS.filter(cleared).length, total: LESSONS.length };
};

/** Reduced motion is a designed static state: a lamp that arrived simply arrived. */
const reducedMotion = (): boolean => {
  if (typeof document === 'undefined') return true;
  if (document.documentElement.classList.contains('reduce-motion')) return true;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * The one animated moment: a lamp that was NOT lit last time breathes once, on opacity only, at the
 * shared acknowledgement tempo. It fires on a real change (a lesson just cleared) and never on the
 * first paint, so the strip does not blink when the menu is laid out.
 */
const settle = (el: HTMLElement): void => {
  if (reducedMotion() || typeof el.animate !== 'function') return;
  try {
    el.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: MOTION.ack, easing: EASE.standard });
  } catch {
    /* An engine without Web Animations simply shows the lamp. */
  }
};

export type FirstRunUI = {
  /**
   * Paint the union of this device's record and the account's clears. Never throws, never reads
   * storage, never fetches. Two writes: the PLAY key's spoken line (so a screen reader hears the
   * count the shapes carry) and the lamps themselves. Call it first with the device record alone
   * (the account has not answered yet), then again when the account answer arrives.
   */
  paint(progress: Pick<CampaignProgress, 'completed'>, account?: AccountClears): void;
};

/**
 * Build the lamps once and hand back the painter. The markup ships ONE empty, hidden strip inside
 * the PLAY key; this fills it with one lamp per lesson, in order, and nothing else in the page is
 * touched.
 */
export const installFirstRunLamps = (doc: Document = document): FirstRunUI => {
  const key = doc.getElementById('menu-play');
  const strip = doc.getElementById('menu-play-lessons');
  const quiet: FirstRunUI = { paint: () => undefined };
  if (!key || !strip) return quiet;
  if (strip.childElementCount !== LESSONS.length) {
    strip.replaceChildren(...LESSONS.map(() => doc.createElement('i')));
  }
  const lamps = [...strip.children] as HTMLElement[];
  // The count last painted here, so a settle can tell a real change from the first paint.
  let lit = -1;
  return {
    paint(progress, account) {
      const nudge = firstRun(progress, account);
      // The key's spoken line is the one place the count is SAID; the strip itself never speaks
      // (it is aria-hidden decoration, like the Territory entry's lamp). The words are the PLAY
      // submenu's own existing sentence, so no new copy is coined for this.
      key.setAttribute('aria-label', nudge ? `${MENU.play}. ${CAMPAIGN.lessonsCompleted(nudge.lit, nudge.total)}` : MENU.play);
      if (!nudge) {
        // The tenth lesson is cleared: the strip leaves the menu and no later pass can bring it
        // back, because the predicate reads nothing but the record.
        strip.hidden = true;
        lit = -1;
        return;
      }
      strip.hidden = false;
      const was = lit;
      lit = nudge.lit;
      for (let i = 0; i < lamps.length; i++) lamps[i]?.classList.toggle('on', i < lit);
      if (was >= 0 && lit > was) settle(lamps[lit - 1]!);
    },
  };
};
