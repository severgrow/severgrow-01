// THE DAILY PUZZLE IS GONE (owner, 2026-10-30: "get rid of whole Daily infrastructure we have —
// it was an experiment but i dont like it, so happy to remove completely").
//
// This is the tombstone: it fails if any of the Daily's identifiers, copy or DOM ids come back into
// the browser source, so a half-removed feature cannot creep back in. The plain English word "daily"
// is NOT forbidden — the Seeds economy still has an honest daily cap/limit (web/src/online/*,
// web/src/ui/seed-reveal.ts), and that is a different thing. Only the exact patterns below are.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

/** Every file the guard reads: all of web/src, the page markup, and the strings module. */
const sources = (): { path: string; text: string }[] => {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:ts|css)$/.test(entry.name)) out.push({ path: full, text: readFileSync(full, 'utf8') });
    }
  };
  walk(`${root}web/src`);
  for (const rel of ['web/index.html', 'src/strings.ts']) {
    out.push({ path: `${root}${rel}`, text: readFileSync(`${root}${rel}`, 'utf8') });
  }
  return out;
};

/**
 * The exact patterns the removed feature owned, and why each one is forbidden:
 *  - `#daily-*` / `sheet-daily` / `menu-daily`: the removed DOM ids (header strip, caption, tile
 *    strip, sheet and PLAY key). A leftover is a dead id and a dangling menu key.
 *  - `dailyActive` / `dailyAnswering`: the removed "a puzzle owns the board" match flags.
 *  - `beginDaily` / `endDaily` / `playDailyAnswer` / `mountDaily`: the removed wiring functions.
 *  - `DAILY` (whole word): the removed `src/strings.ts` export and every line of its copy.
 *  - `Daily Puzzle`: the removed feature's own name in prose/comments.
 *  - `severgrow.daily`: the removed per-device record key (never read again).
 *  - `submitDailySolve` / `src/daily` / `kind: 'daily'` / `daily:<no>`: the removed server call,
 *    modules and seed-proof kind.
 *  - `DAILY #nnn`: the removed menu copy.
 */
const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /#daily-/, why: 'removed Daily DOM ids (#daily-hud, #daily-readout, #daily-place…)' },
  { re: /\bsheet-daily\b/, why: 'removed Daily sheet id' },
  { re: /\bmenu-daily\b/, why: 'removed PLAY submenu key id/class' },
  { re: /\bdailyActive\b|\bdailyAnswering\b/, why: 'removed match-mode flags' },
  { re: /\bbeginDaily\b|\bendDaily\b|\bplayDailyAnswer\b|\bmountDaily\b/, why: 'removed wiring functions' },
  { re: /\bDAILY\b/, why: 'removed src/strings.ts DAILY export and its copy' },
  { re: /Daily Puzzle/, why: 'removed feature name' },
  { re: /\bsevergrow\.daily\b/, why: 'removed per-device Daily record key' },
  { re: /\bsubmitDailySolve\b/, why: 'removed server call' },
  { re: /(?:^|[^A-Za-z0-9_])src\/daily\//, why: 'removed src/daily module path' },
  { re: /\bkind:\s*'daily'/, why: 'removed seed-proof kind' },
  { re: /\bdaily:\s*`|\bdaily:\s*'/, why: 'removed daily receipt key' },
  { re: /DAILY #/, why: 'removed DAILY #nnn menu copy' },
];

describe('the Daily Puzzle is gone, root and branch', () => {
  it('leaves none of its identifiers, DOM ids or copy in web/src, web/index.html or src/strings.ts', () => {
    const offenders: string[] = [];
    for (const file of sources()) {
      file.text.split('\n').forEach((line, i) => {
        for (const { re, why } of FORBIDDEN) {
          if (re.test(line)) offenders.push(`${file.path.slice(root.length)}:${i + 1}: ${why} — ${line.trim().slice(0, 120)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the word "daily" for the Seeds economy caps, which are NOT the removed feature', () => {
    // A sanity check that the guard is not just "the word daily is banned": the separate daily
    // award caps still exist and still say so.
    const rewards = readFileSync(`${root}server/src/seeds/config.ts`, 'utf8');
    expect(rewards).toMatch(/utcDailyRepeatableCap/);
  });

  it('has deleted the Daily modules and their tooling entirely', () => {
    for (const rel of ['src/daily', 'web/src/daily', 'src/sim/daily-gen.ts', 'src/sim/daily-pick.ts', 'tests/daily', 'docs/DAILY-PUZZLE.md']) {
      expect(existsSync(`${root}${rel}`), `${rel} must be deleted with the feature`).toBe(false);
    }
  });
});
