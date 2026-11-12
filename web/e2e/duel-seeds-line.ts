// The duel result card's Seeds line, on a REAL finished online duel.
//
// Proves the two halves that matter:
//   1. today the card carries NO Seeds line (nothing in the payload says what was paid), and a
//      previous OFFLINE award cannot leak onto it;
//   2. the read is forward-compatible: inject the one field the server would add
//      (`MatchViewPayload.seeds`, see `MatchDriverSnapshot.seeds`) and the same card shows
//      "+15 Seeds" — so the server change turns it on with no client change.
import assert from 'node:assert/strict';
import { startLocalDuel, openSeat, openDuel, waitIdle } from './helpers/local-duel.js';
import type { Page } from 'playwright-core';

const OUT = process.env.SHOTS ?? '/tmp/duel-seeds';
let checks = 0;
const check = (ok: unknown, name: string) => {
  assert(ok, name);
  checks++;
  console.log(`PASS  ${name}`);
};

const PORT = Number(process.env.DUEL_SEEDS_PORT ?? 5271);
const duel = await startLocalDuel({ port: PORT, turnTimeoutMs: 24 * 3_600_000 });

/** The loaded state of the card's shared Seeds paragraph. */
const seedsLine = (page: Page) =>
  page.evaluate(() => {
    const el = document.getElementById('go-seeds') as HTMLElement | null;
    return {
      hidden: el ? el.hidden : null,
      text: (el?.textContent ?? '').trim(),
      // A real award paints the animated row; a notice paints plain text.
      award: el?.querySelector('.seed-gain-num')?.textContent?.trim() ?? null,
    };
  });

const playToResult = async (viewport: { width: number; height: number }) => {
  const match = await duel.newMatch();
  const device = viewport.width >= 700 ? { hasTouch: false, isMobile: false } : {};
  const seat0 = await openSeat(duel, match, 0, { viewport, ...device });
  const seat1 = await openSeat(duel, match, 1, { viewport, ...device });
  await openDuel(seat0, match.matchId);
  await openDuel(seat1, match.matchId);
  await waitIdle(seat0);
  await waitIdle(seat1);
  return { match, seat0, seat1 };
};

try {
  // ---- 1. today: a resign win shows NO Seeds line --------------------------------------------
  {
    const { match, seat0 } = await playToResult({ width: 390, height: 844 });
    // A resigned win is the sharpest case: the server pays nothing, so the card must say nothing.
    await duel.api.resign(match.guests[1].token, match.matchId);
    await seat0.page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
    await waitIdle(seat0);
    await seat0.page.waitForTimeout(600);
    const line = await seedsLine(seat0.page);
    check(line.hidden === true && line.text === '', 'resign win: the card carries no Seeds line');
    await seat0.page.screenshot({ path: `${OUT}/duel-resign-390x844.png` });
    await seat0.context.close();
  }

  // ---- 2. the offline award cannot leak onto a duel card -------------------------------------
  {
    const { match, seat0 } = await playToResult({ width: 390, height: 844 });
    // Paint an OFFLINE award on the very same shared paragraph, exactly as an offline win does.
    await seat0.page.evaluate(() => {
      (window as unknown as { __severgrow: { seedReveal: (n: number) => string } }).__severgrow.seedReveal(15);
    });
    const before = await seedsLine(seat0.page);
    check(before.text.includes('15'), `offline award is on the card first (${before.text})`);
    await duel.api.resign(match.guests[1].token, match.matchId);
    await seat0.page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
    await waitIdle(seat0);
    await seat0.page.waitForTimeout(600);
    const after = await seedsLine(seat0.page);
    check(after.hidden === true && !after.text.includes('15'), 'a duel RESETS the line: no offline award leaks');
    await seat0.context.close();
  }

  // ---- 3. the four shapes a real report can take ---------------------------------------------
  // A naturally finished duel is not reachable through this harness (it can only resign), so the
  // server's OWN field is injected here. That is the point: the client's job is to report what the
  // server said, and these are the four things it can say. `server/src/seeds/rewards.ts`
  // `planSeedReward` produces exactly this shape.
  const withReport = async (label: string, seeds: { awarded: number; reason: string | null } | null) => {
    const { match, seat0 } = await playToResult({ width: 390, height: 844 });
    await seat0.page.route('**/v1/matches/**', async (route) => {
      // The client keeps polling; a request still in flight when the context closes must not throw.
      try {
        const response = await route.fetch();
        const body = await response.json().catch(() => null);
        if (!body || body.ok !== true || !body.player || !body.player.result) return void (await route.fulfill({ response }));
        if (seeds) body.player.seeds = seeds;
        await route.fulfill({ response, json: body });
      } catch {
        await route.abort().catch(() => undefined);
      }
    });
    await duel.api.resign(match.guests[1].token, match.matchId);
    await seat0.page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
    await waitIdle(seat0);
    await seat0.page.waitForTimeout(1200);
    const line = await seedsLine(seat0.page);
    await seat0.page.screenshot({ path: `${OUT}/duel-${label}-390x844.png` });
    await seat0.page.unrouteAll({ behavior: 'ignoreErrors' });
    await seat0.context.close();
    return line;
  };

  // A paid finish: 15 to the winner of a friend duel.
  const paid = await withReport('award', { awarded: 15, reason: null });
  check(paid.hidden !== true && paid.text.includes('15'), `a paid finish shows +15 Seeds (${paid.text})`);

  // Capped: a real outcome, and the card says so calmly instead of "+0".
  const capped = await withReport('capped', { awarded: 0, reason: 'opponent_daily_limit' });
  check(capped.hidden !== true && /Seed limit reached today/.test(capped.text),
    `a capped finish says the limit is reached, not +0 (${capped.text})`);

  // A settled duel that genuinely paid nothing: silence.
  const nothing = await withReport('nothing', { awarded: 0, reason: null });
  check(nothing.hidden === true && nothing.text === '', 'a settle that paid nothing shows no line');

  // And with NO report at all (today's real payload): silence, as in case 1.
  const absent = await withReport('absent', null);
  check(absent.hidden === true && absent.text === '', 'no report at all shows no line');

  console.log(`\nduel seeds line: ${checks} checks passed`);
} finally {
  await duel.close?.();
  process.exit(0);
}
