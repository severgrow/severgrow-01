// THE SEEDS LIMIT'S WAIT (owner ask, 2026-11-20): "when 'seeds limit reached' says how many hours
// left round up to 23h, 15h, 1h etc -- smart."
//
// THE RESET IS UTC MIDNIGHT, NOT A ROLLING 24 HOURS. The proof is in the server:
//   * `SEED_ECONOMY.utcDailyRepeatableCap` is the one cap (server/src/seeds/config.ts);
//   * every receipt is filed under `utcDay(input.now)` (seeds/postgres.ts, seeds/memory.ts), and
//     `utcDay` is `new Date(ms).toISOString().slice(0, 10)` — a calendar day in UTC;
//   * `planSeedReward` refuses with `global_daily_limit` once that UTC day's receipts reach the cap.
// So the allowance returns at the next 00:00 UTC, which is what `nextUtcMidnight` computes.
//
// ROUNDING UP is the honesty rule: the card may never say the cap is back before it is.
//   14h 01m -> 15h, exactly 15h -> 15h, 23h 59m -> 24h
// Under an hour, "1h" would over-promise, so it says minutes ("59m", "4m"); at the boundary, "now".
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nextUtcMidnight, seedCapNotice, seedCapResetLabel } from '../src/logic/seed-cap.js';
import { correctedNow, emptyClock, noteServerNow } from '../src/online/clock.js';
import { duelSeedsMessage, settledSeedsMessage } from '../src/ui/seed-reveal.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
/** A UTC instant, so no test depends on the machine's timezone. */
const utc = (h: number, m = 0, s = 0) => Date.UTC(2026, 10, 20, h, m, s);
const HOUR = 3_600_000;
const MIN = 60_000;

describe('the wait rounds up, and an exact hour stays that hour', () => {
  it('is a UTC midnight reset, so the wait is midnight minus now', () => {
    // 20:00 UTC -> four hours to 00:00 UTC. NOT "tomorrow at this time".
    expect(nextUtcMidnight(utc(20))).toBe(Date.UTC(2026, 10, 21, 0));
    expect(seedCapResetLabel(utc(20), nextUtcMidnight(utc(20)))).toBe('4h');
    expect(seedCapResetLabel(utc(0), nextUtcMidnight(utc(0)))).toBe('24h');
  });

  it('pins every boundary the copy can produce', () => {
    const at = utc(12);
    expect(seedCapResetLabel(at, at)).toBe('now'); // 0m: the day has turned
    expect(seedCapResetLabel(at, at + MIN)).toBe('1m'); // 1m
    expect(seedCapResetLabel(at, at + 59 * MIN)).toBe('59m'); // 59m
    expect(seedCapResetLabel(at, at + HOUR)).toBe('1h'); // 60m = 1h exactly
    expect(seedCapResetLabel(at, at + HOUR)).toBe('1h'); // 1h
    expect(seedCapResetLabel(at, at + 23 * HOUR)).toBe('23h'); // 23h
    expect(seedCapResetLabel(at, at + 23 * HOUR + 59 * MIN)).toBe('24h'); // 23h59m
  });

  it('rounds 14h 01m UP to 15h, and keeps 15h at exactly 15h', () => {
    const at = utc(0);
    expect(seedCapResetLabel(at, at + 14 * HOUR + MIN)).toBe('15h');
    expect(seedCapResetLabel(at, at + 15 * HOUR)).toBe('15h');
    expect(seedCapResetLabel(at, at + 15 * HOUR + MIN)).toBe('16h');
    // The most a UTC-midnight reset can ever be, after 00:00:00.
    expect(seedCapResetLabel(utc(0, 0, 1), nextUtcMidnight(utc(0, 0, 1)))).toBe('24h');
  });

  it('never says "1h" for minutes: under an hour is minutes', () => {
    const at = utc(23);
    expect(seedCapResetLabel(at, at + 4 * MIN)).toBe('4m');
    expect(seedCapResetLabel(at, at + 30_000)).toBe('1m'); // seconds round up to a minute
    // 59m59s is still under the hour, so it stays in minutes rather than becoming "60m"/"1h".
    expect(seedCapResetLabel(at, at + 59 * MIN + 59_000)).toBe('59m');
    expect(seedCapResetLabel(at, at + HOUR)).toBe('1h'); // exactly 60m IS the hour
  });

  it('a past or junk reset is "now", never a negative countdown', () => {
    expect(seedCapResetLabel(utc(12), utc(11))).toBe('now');
    expect(seedCapResetLabel(utc(12), utc(12) - 1)).toBe('now');
    expect(seedCapResetLabel(Number.NaN, utc(12))).toBe('now');
  });
});

describe('the whole sentence is pinned at real countdowns', () => {
  it('four hours before midnight', () => {
    expect(seedCapNotice(utc(20))).toBe('Seed limit · 4h to reset');
  });
  it('fifteen hours before midnight', () => {
    expect(seedCapNotice(utc(9))).toBe('Seed limit · 15h to reset');
  });
  it('the longest form still fits the finish card’s one line at 320px Large text', () => {
    // Measured with Fragment Mono at 0.85rem and html.large-text (118%): 25 characters = 249.9px
    // inside the card's 260px line, so this must stay <= 25. (web/src/style.css: `.small`, 320px
    // card inner width.) A longer wording would wrap and grow the card.
    const longest = seedCapNotice(utc(0)); // 24h, just after midnight
    expect(longest).toBe('Seed limit · 24h to reset');
    expect(longest.length).toBeLessThanOrEqual(25);
  });
});

describe('the card gets the wait from SERVER time, so a wrong device clock cannot change it', () => {
  it('a phone five hours fast reads the same notice as the server', () => {
    // The payload said 20:00 UTC; this phone's wall clock was five hours ahead when it arrived.
    const serverNow = utc(20);
    const phoneWhenReceived = utc(20) + 5 * HOUR;
    const clock = noteServerNow(emptyClock(), serverNow, phoneWhenReceived);
    // Five real minutes later, the phone's clock says 01:05 — still the same UTC day boundary in
    // the corrected clock: 3h 55m left, which rounds up to 4h, exactly as the server would say.
    const phoneLater = phoneWhenReceived + 5 * MIN;
    expect(correctedNow(clock, phoneLater)).toBe(utc(20) + 5 * MIN);
    expect(seedCapNotice(correctedNow(clock, phoneLater))).toBe('Seed limit · 4h to reset');
    expect(seedCapNotice(serverNow + 5 * MIN)).toBe('Seed limit · 4h to reset');
  });

  it('a phone five hours slow crosses no boundary the server did not cross', () => {
    const serverNow = utc(20);
    const clock = noteServerNow(emptyClock(), serverNow, serverNow - 5 * HOUR);
    const phoneLater = (serverNow - 5 * HOUR) + 30 * MIN;
    expect(seedCapNotice(correctedNow(clock, phoneLater))).toBe('Seed limit · 4h to reset');
  });

  it('the duel and campaign lines both carry the server countdown', () => {
    const reason = 'global_daily_limit';
    expect(duelSeedsMessage({ awarded: 0, reason }, utc(20))).toBe('Seed limit · 4h to reset');
    expect(settledSeedsMessage({ awarded: 0, reason, replayed: false, serverNow: utc(9) }))
      .toBe('Seed limit · 15h to reset');
    // No server clock: the calm sentence alone, never a guess from this device's clock.
    expect(duelSeedsMessage({ awarded: 0, reason })).toBe('Seed limit reached today');
    // A replayed receipt still says nothing at all (missing Seeds, not a cap).
    expect(settledSeedsMessage({ awarded: 0, reason, replayed: true, serverNow: utc(20) })).toBe('');
  });
});

describe('the cap is configuration, and the reset is the server’s UTC day', () => {
  const config = read('../../server/src/seeds/config.ts');
  const rewards = read('../../server/src/seeds/rewards.ts');
  const postgres = read('../../server/src/seeds/postgres.ts');
  const memory = read('../../server/src/seeds/memory.ts');
  const cap = read('../src/logic/seed-cap.ts');
  const reveal = read('../src/ui/seed-reveal.ts');

  it('one cap value in one place; the award rule reads it, never a literal', () => {
    expect(config).toMatch(/utcDailyRepeatableCap:\s*\d+/);
    expect(rewards).toContain('SEED_ECONOMY.utcDailyRepeatableCap');
    expect(rewards).not.toMatch(/utcDailyRepeatableCap\s*[:=]\s*\d/);
    // The client words the refusal only: it must not restate the economy's number anywhere.
    for (const [name, source] of Object.entries({ cap, reveal })) {
      expect(source, name).not.toMatch(/\b600\b/);
    }
  });

  it('the receipt day is `utcDay`, an ISO UTC date — a midnight reset, not a rolling window', () => {
    expect(config).toMatch(/utcDay[\s\S]{0,120}toISOString\(\)\.slice\(0,\s*10\)/);
    expect(postgres).toContain('const day = utcDay(input.now)');
    expect(memory).toContain('utcDay(r.input.now)');
    // A rolling window would subtract now - X; the server groups by a calendar day instead.
    expect(postgres).not.toMatch(/utc_day\s*>=\s*\$?\w+\s*-\s*\d/);
  });

  it('the countdown reads no clock and starts no timer', () => {
    // Comments name `Date.now()` to explain why it is NOT used; only code is asserted here.
    const code = cap.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('Date.now');
    expect(code).not.toMatch(/new Date\(/);
    expect(code).not.toMatch(/set(?:Timeout|Interval)/);
    // …and the card's line passes the server clock through, not the device's.
    expect(reveal).toContain('seedCapNotice(serverNowMs)');
  });
});
