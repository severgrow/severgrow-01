// EARNING SEEDS, made visible (owner ask, 2026-10-16): the whole reward used to be one muted
// sentence, so a win that paid Seeds had no moment. This gives it a small, tactile one in
// Futasaku's own register — and stays LIGHT:
//
//   * it paints into the finish card's EXISTING seed line (`#go-seeds`), so the card cannot grow;
//     the one-screen / no-scrolling rule is untouched (see web/e2e/finish-fit.ts);
//   * the emblem is the app's own `seedIcon()` (the world map's wallet one). No new image, no
//     library, no canvas, no grain;
//   * the motion is a few Web Animations on transform/opacity plus a SHORT, discrete count
//     (five `setTimeout` steps, never a rAF loop, never per-frame JS);
//   * Reduce motion, and Speed off, get the same line in its static form: no count, no bloom.
//
// Not every game pays: only wins, daily caps apply, and the number is verified server-side AFTER
// the finish card is already up. So there are three honest states — nothing, a calm notice, and an
// award — and an award may replace a notice late, in the same single line, without reflowing.
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
  position: relative; isolation: isolate; display: inline-flex; align-items: center; gap: 6px;
  line-height: 1; white-space: nowrap;
}
.seed-gain-bloom {
  position: absolute; inset: -10px -14px; z-index: -1; border-radius: 999px; opacity: 0;
  pointer-events: none;
  background: radial-gradient(closest-side, color-mix(in srgb, #8fae6a 30%, transparent), transparent 76%);
}
.seed-gain-emblem { display: inline-flex; flex: none; width: 16px; height: 16px; color: #e8ddbe; }
.seed-gain-emblem .seed-icon { display: block; width: 16px; height: 16px; }
.seed-gain-num {
  font-family: var(--font-display, inherit); font-weight: var(--w-num, 700);
  font-size: 0.95rem; letter-spacing: 0.02em; color: #e8ddbe;
  font-variant-numeric: lining-nums tabular-nums;
}
.seed-gain-word {
  font-family: var(--font-ui, inherit); font-weight: var(--w-ui-medium, 500);
  font-size: 0.7rem; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--fu-cream-62, #aaa8a3);
}
/* Reduce motion: the line still appears, just still. */
.reduce-motion .seed-gain-bloom { display: none; }
`;

const STYLE_ID = 'futa04-seed-reveal-style';
const COUNT_STEPS = 5;
const STEP_MS = 62;
const DELAY_MS = 96;

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
    // Pending / capped / unavailable: the calm sentence the game already wrote, untouched (and the
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
  emblem.append(seedIcon(16));
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
  row.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { ...timing, duration: 240 * scale });
  // The emblem settles in: one short scale/rotate beat, once the line has arrived.
  emblem.animate([
    { transform: 'scale(.72) rotate(-9deg)', opacity: 0 },
    { transform: 'scale(1.08) rotate(0deg)', opacity: 1, offset: 0.62 },
    { transform: 'scale(1) rotate(0deg)', opacity: 1 },
  ], { ...timing, duration: 420 * scale, delay: 60 * scale, easing: EASE.spring });
  // One dark-glass bloom behind the line: transform + opacity, one shot, gone.
  bloom.animate([
    { opacity: 0, transform: 'scale(.78)' },
    { opacity: 0.85, transform: 'scale(1)', offset: 0.34 },
    { opacity: 0, transform: 'scale(1.1)' },
  ], { ...timing, duration: 560 * scale });

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
