// EARNING SEEDS, made visible (owner ask, 2026-10-16): the whole reward used to be one muted
// sentence, so a win that paid Seeds had no moment. This gives it one in Futasaku's own register —
// and stays LIGHT:
//
//   * it paints into the finish card's EXISTING seed line (`#go-seeds`), so the card cannot grow;
//     the one-screen / no-scrolling rule is untouched (see web/e2e/finish-fit.ts);
//   * the emblem is the app's own `seedIcon()` (the world map's wallet one). No new image, no
//     library, no canvas, no grain;
//   * the motion is a few Web Animations on transform/opacity (row arrival, one breath on the
//     emblem, one bloom behind it, one small settle on the landing number) plus a discrete,
//     eased count (a handful of `setTimeout` steps — never a rAF loop, never per-frame JS);
//   * Reduce motion, and Speed off, get the same line in its static form: no count, no bloom.
//
// Not every game pays: only wins, daily caps apply, and the number is verified server-side AFTER
// the finish card is already up. So there are three honest states — nothing, a calm notice, and an
// award — and an award may replace a notice late, in the same single line, without reflowing. There
// is deliberately NO "pending" state (owner report, 2026-10-25): a card that rests on "pending"
// is a card that is lying about a receipt nobody has written.
import { EASE } from '../logic/motion.js';
import { seedIcon } from '../online/seed-icon.js';

export type SeedReward =
  | { kind: 'none' }
  | { kind: 'notice'; text: string }
  | { kind: 'award'; amount: number };

/**
 * Reads the reward message the app already builds (`+N Seeds`, or one of its notices). Pure, so the
 * three states are pinned by unit tests. A parsed award of zero is treated as ABSENCE rather than
 * shown: a number to stare at is exactly what "you earned nothing" must never look like.
 */
export function seedReward(message: string): SeedReward {
  const text = message.trim();
  if (!text) return { kind: 'none' };
  const award = /^\+\s*(\d+)\s+seeds?$/i.exec(text);
  if (award) return Number(award[1]) > 0 ? { kind: 'award', amount: Number(award[1]) } : { kind: 'none' };
  return { kind: 'notice', text };
}

/**
 * What the server reported for THIS seat in a finished duel — the shape `store.settle` already
 * returns (`server/src/seeds/types.ts` `RewardResult`: `awarded` plus the denial `reason`).
 * `awarded: 0` with a `*_daily_limit` reason is a real, honest outcome: the cap bit.
 */
export type SettledSeeds = { awarded: number; reason: string | null };

/**
 * The duel result card's Seeds line, from what the server said — NEVER from a guessed rate.
 *
 * Online duels pay per seat (friend 15/4, queue 30/8, draw 6/12), but the client cannot work the
 * number out for itself: a daily cap pays 0 (`planSeedReward` writes a 0-value receipt with a
 * `*_daily_limit` reason) and a resignation or a timeout pays nothing at all. So an absent report
 * means no line, and a denied report is the same calm sentence the campaign card uses rather than a
 * "+0". Pure, so all four states are pinned without a browser.
 */
export function duelSeedsMessage(settled: SettledSeeds | null | undefined): string {
  if (!settled) return '';
  const awarded = settled.awarded;
  if (!Number.isFinite(awarded) || awarded < 0) return '';
  if (awarded > 0) return `+${Math.floor(awarded)} Seeds`;
  // A limit is worth saying: the player did everything right and the day's allowance is gone.
  return settled.reason && /limit/.test(settled.reason) ? 'Seed limit reached today' : '';
}

/**
 * The CAMPAIGN finish card's line, from the receipt the settle actually returned.
 *
 * Same rule as a duel, with one more honest state: `replayed` means this exact first clear was paid
 * before, so the card says NOTHING rather than counting a second `+N` the wallet never received.
 * A `0` whose reason names a cap says so in the calm wording; any other `0` is silence, never "+0".
 */
export function settledSeedsMessage(settled: { awarded: number; reason: string | null; replayed?: boolean }): string {
  if (settled.replayed) return '';
  return duelSeedsMessage(settled);
}

/** The numbers the count passes through: five steps, easing out, always landing on the amount. */
export function seedCountValues(amount: number, steps = 5): number[] {
  const n = Math.max(1, Math.min(steps, amount));
  const values: number[] = [];
  for (let i = 1; i <= n; i++) values.push(Math.round(amount * (1 - (1 - i / n) ** 2)));
  values[values.length - 1] = amount;
  return [...new Set(values)];
}

export type SeedRevealOptions = {
  /** Motion is on (not Reduce motion, not Speed off). Off: the static form, one frame, no count. */
  animate: boolean;
  /** The app's own speed factor; scales every duration so a slow setting stays slow. Default 1. */
  scale?: number;
  /** One very small tick per counted Seed (`last` marks the landing number). */
  tick?: (step: number, last: boolean) => void;
};

/** One line, in place — and a handful of transform/opacity beats. Nothing here changes layout. */
export const SEED_REVEAL_CSS = `
.seed-gain {
  position: relative; isolation: isolate; display: inline-flex; align-items: center; gap: 8px;
  line-height: 1; white-space: nowrap;
}
.seed-gain-bloom {
  position: absolute; inset: -12px -16px; z-index: -1; border-radius: 999px; opacity: 0;
  pointer-events: none;
  background: radial-gradient(closest-side, color-mix(in srgb, #8fae6a 30%, transparent), transparent 76%);
}
.seed-gain-emblem { display: inline-flex; flex: none; width: 20px; height: 20px; color: #e8ddbe; }
.seed-gain-emblem .seed-icon { display: block; width: 20px; height: 20px; }
.seed-gain-num {
  /* The game's own NUMERAL face — the one every other number uses (.go-score, .tile-num, counts).
     A clear step up from the card's body line, still below the final score. */
  font-family: var(--font-num, var(--font-ui, inherit)); font-weight: var(--w-num, 700);
  font-size: 1.65rem; line-height: 0.95; letter-spacing: 0.01em; color: #e8ddbe;
  font-variant-numeric: lining-nums tabular-nums;
  transform-origin: 50% 62%;
}
.seed-gain-word {
  font-family: var(--font-ui, inherit); font-weight: var(--w-ui-medium, 500);
  font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--fu-cream-62, #aaa8a3);
}
/* Reduce motion: the line still appears, just still. */
.reduce-motion .seed-gain-bloom { display: none; }
`;

const STYLE_ID = 'futa04-seed-reveal-style';
/**
 * The count (owner, 2026-10-25: "getting seeds should be slightly animated, very satisfying").
 * Seven eased steps over ~0.68 s starting on the paint frame itself, then a soft landing beat: the
 * whole moment is about 0.85 s at normal speed — long enough to read as earned, short enough to
 * never hold the card. The steps are explicit timeouts (no rAF), so nothing runs after the line
 * has landed.
 */
const COUNT_STEPS = 7;
const STEP_MS = 104;
const DELAY_MS = 60;
/** When the number lands, in ms at scale 1 — the settle beat is timed off it. */
const landingMs = (steps: number, scale: number) => (DELAY_MS + Math.max(0, steps - 1) * STEP_MS) * scale;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = SEED_REVEAL_CSS;
  document.head.append(style);
};

/** The count's pending timeouts, per host, so a re-paint (or a late re-render) never doubles them. */
const pendingCount = new WeakMap<HTMLElement, number[]>();
const cancelCount = (host: HTMLElement): void => {
  const ids = pendingCount.get(host);
  if (!ids) return;
  for (const id of ids) clearTimeout(id);
  pendingCount.delete(host);
};

/**
 * Paints the finish card's seed line. `host` is the card's own `#go-seeds` paragraph: the classes
 * that make it a muted small line stay, and every state is one line, so the card never grows.
 */
export function paintSeedReward(host: HTMLElement, reward: SeedReward, opts: SeedRevealOptions): void {
  cancelCount(host);
  if (reward.kind === 'none') {
    // Absence, not a zero: no line at all, exactly as before this change.
    host.replaceChildren();
    host.hidden = true;
    return;
  }
  host.hidden = false;
  if (reward.kind === 'notice') {
    // Capped / unavailable / not verifiable: the calm sentence the game wrote, untouched (and the
    // reveal's CSS is not even pulled in for it — a notice needs nothing).
    host.replaceChildren(document.createTextNode(reward.text));
    return;
  }
  ensureStyle();

  const amount = reward.amount;
  const scale = Math.max(opts.scale ?? 1, 0.35);
  const row = document.createElement('span');
  row.className = 'seed-gain';
  row.setAttribute('aria-hidden', 'true');
  const bloom = document.createElement('span');
  bloom.className = 'seed-gain-bloom';
  const emblem = document.createElement('span');
  emblem.className = 'seed-gain-emblem';
  emblem.append(seedIcon(20));
  const num = document.createElement('span');
  num.className = 'seed-gain-num';
  const word = document.createElement('span');
  word.className = 'seed-gain-word';
  word.textContent = 'Seeds';
  row.append(bloom, emblem, num, word);
  // The reader hears the same sentence the game always wrote; the visual row is decoration only.
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = `+${amount} Seeds`;
  host.replaceChildren(sr, row);

  const values = seedCountValues(amount, COUNT_STEPS);
  num.textContent = `+${opts.animate ? 0 : amount}`;
  if (!opts.animate) return;

  const timing: KeyframeAnimationOptions = { fill: 'backwards', easing: EASE.out };
  // The length of the count is the length of the moment: everything else is timed off it.
  const landed = landingMs(values.length, scale);
  // The line arrives: a short rise, no bounce (the emblem does the bouncing).
  row.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { ...timing, duration: 280 * scale });
  // One breath on the emblem: it settles in, then lifts again as the count lands, then rests.
  emblem.animate([
    { transform: 'scale(.70) rotate(-10deg)', opacity: 0 },
    { transform: 'scale(1.10) rotate(0deg)', opacity: 1, offset: 0.26 },
    { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.40 },
    { transform: 'scale(1.12) rotate(-2deg)', opacity: 1, offset: 0.80 },
    { transform: 'scale(1) rotate(0deg)', opacity: 1 },
  ], { ...timing, duration: (landed + 180 * scale), delay: 40 * scale, easing: EASE.spring });
  // One soft bloom behind the line — transform + opacity, one shot, then gone. It peaks as the
  // number lands, so the glow and the number are one beat, not two.
  bloom.animate([
    { opacity: 0, transform: 'scale(.74)' },
    { opacity: 0.45, transform: 'scale(.94)', offset: 0.42 },
    { opacity: 0.9, transform: 'scale(1.02)', offset: 0.82 },
    { opacity: 0, transform: 'scale(1.14)' },
  ], { ...timing, duration: (landed + 160 * scale) });
  // The small settle: the number itself takes the landing, once, on the frame it becomes the amount.
  num.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(1.08)', offset: 0.34 },
    { transform: 'scale(1)' },
  ], { duration: 200 * scale, delay: landed, easing: EASE.spring, fill: 'backwards' });

  const ids: number[] = [];
  values.forEach((value, i) => {
    const last = i === values.length - 1;
    ids.push(window.setTimeout(() => {
      num.textContent = `+${value}`;
      opts.tick?.(i, last);
    }, (DELAY_MS + i * STEP_MS) * scale));
  });
  pendingCount.set(host, ids);
}
