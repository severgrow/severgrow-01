// The Seed A/B test in a real browser, the way the owner will use it:
//   menu -> SPROUT VERSION -> a complete game -> menu -> SEED VERSION -> a complete game
// Human turns are played through the page (deck, a card, a glowing hex, Confirm, throw);
// the opponent plays itself. Checks the right rules, the right look and the right words in
// each version, a Seed worth 1 whatever the card, a Strengthen of that seed, replay of the
// opponent's turn, the game over screen, and no stale state when switching versions.
//   npx tsx web/e2e/seed-ab.ts [--shots=docs/screens/seed]
// Needs a built page (npm run web:build) and Chromium (PW_CHROMIUM=/path/to/chrome).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import type { State } from '../../src/engine/index.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const SHOTS = arg('shots');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4193, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4193/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

type Hook = { state: () => State | null; busy: () => boolean };
const getState = (page: Page) => page.evaluate(() => (window as unknown as { __severgrow: Hook }).__severgrow.state());
const idle = async (page: Page, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const busy = await page.evaluate(() => (window as unknown as { __severgrow: Hook }).__severgrow.busy());
    if (!busy) return;
    await page.waitForTimeout(60);
  }
};
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.jpg`, quality: 82 });
};
/** The game screen's visible text (not the hidden menu or sheets). */
const gameText = (page: Page) => page.evaluate(`(() => { const g = document.getElementById('game'); return g && !g.hidden ? g.innerText : ''; })()`) as Promise<string>;
const domSeeds = (page: Page) => page.evaluate(`[...document.querySelectorAll('.l-tiles .tile.seed-tile')].map((e) => e.getAttribute('data-key'))`) as Promise<string[]>;
const seedKeys = (s: State) => Object.keys(s.board).filter((k) => s.board[k]?.seed).sort();
const tapHex = async (page: Page, key: string) => {
  const box = await page.locator(`.hex-cell[data-key="${key}"]`).boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
};

/** One human Grow step: plays the one-card move with `card` on `hex` through the page. */
const playOneCard = async (page: Page, cardId: number, hex: string) => {
  await page.click(`#hand [data-card="${cardId}"]`, { timeout: 5000 });
  await page.waitForTimeout(120);
  await tapHex(page, hex);
  await page.waitForTimeout(150);
  if (await page.locator('#confirm-play:visible').count()) await page.click('#confirm-play');
  await idle(page);
};

type Version = 'sprout' | 'seed';
type Report = { turns: number; mine: { card: number; rank: number; hex: string; strength: number; seedMark: boolean }[]; strengthened: { hex: string; from: number; to: number; seedMarkAfter: boolean; domSeedAfter: boolean } | null; leaks: string[]; domMismatch: string[]; chip: string; resultShown: boolean; goSub: string; replayKept: boolean | null; freshMax: number; freshBad: string[]; goVersion: string; goMoves: string; chipTip: string };

/** Plays one complete game through the page; the human seeds/sprouts every turn it can. */
const playGame = async (page: Page, version: Version): Promise<Report> => {
  const r: Report = { turns: 0, mine: [], strengthened: null, leaks: [], domMismatch: [], chip: '', resultShown: false, goSub: '', replayKept: null, freshMax: 0, freshBad: [], goVersion: '', goMoves: '', chipTip: '' };
  const wrong = version === 'seed' ? /sprout/i : /\bseeds?\b/i;
  for (let guard = 0; guard < 400; guard++) {
    await idle(page);
    const s = await getState(page);
    if (!s) break;
    // words and look, in every state the human sees
    const text = await gameText(page);
    const m = text.match(wrong);
    if (m) r.leaks.push(`${s.phase}: "${text.slice(Math.max(0, m.index! - 30), m.index! + 30).replace(/\s+/g, ' ')}"`);
    // the page's seeds and the state's, read together in one step (the opponent may move between two reads)
    const both = (await page.evaluate(`(() => {
      const h = window.__severgrow;
      if (h.busy()) return null;
      const st = h.state();
      return { dom: [...document.querySelectorAll('.l-tiles .tile.seed-tile')].map((e) => e.getAttribute('data-key')).sort(), state: Object.keys(st.board).filter((k) => st.board[k] && st.board[k].seed).sort(), at: st.phase + ' t' + st.turnNumber };
    })()`)) as { dom: string[]; state: string[]; at: string } | null;
    if (both && JSON.stringify(both.dom) !== JSON.stringify(both.state)) r.domMismatch.push(`${both.at}: page ${both.dom.join(' ')} / state ${both.state.join(' ')}`);
    if (s.phase === 'GAME_OVER') break;
    if (s.actor !== 0) {
      await page.waitForTimeout(100);
      continue;
    }
    if (s.phase === 'DRAW') {
      r.turns++;
      // UX pass: what the opponent changed last turn is marked, only on its own tiles
      const fresh = (await page.evaluate(`(() => { const st = window.__severgrow.state(); return [...document.querySelectorAll('.l-over .fresh-mark')].map((e) => { const k = e.getAttribute('data-key'); return [k, st.board[k] ? st.board[k].owner : -1]; }); })()`)) as [string, number][];
      r.freshMax = Math.max(r.freshMax, fresh.length);
      for (const [k, o] of fresh) if (o !== 1) r.freshBad.push(k);
      // UX pass: the version label explains the version when tapped
      if (r.turns === 2) {
        await page.click('#version-chip');
        await page.waitForTimeout(150);
        r.chipTip = (await page.textContent('#captions')) ?? '';
      }
      // replay the opponent's last turn once (seeds must stay seeds during the replay)
      if (r.turns === 4 && version === 'seed' && (await page.locator('#tool-replay:visible').count())) {
        await page.click('#tool-replay');
        await page.waitForTimeout(200);
        await idle(page);
        const after = await getState(page);
        r.replayKept = JSON.stringify((await domSeeds(page)).sort()) === JSON.stringify(seedKeys(after!));
      }
      await page.click('#deck');
      continue;
    }
    if (s.phase === 'ACT') {
      const hand = s.hands[0];
      // a Strengthen of my own seed once (Seed version): the highest card on my oldest seed
      const mySeed = seedKeys(s).find((k) => s.board[k]!.owner === 0);
      if (version === 'seed' && !r.strengthened && mySeed && s.sproutsThisTurn === 0) {
        const best = [...hand].sort((a, b) => b.rank - a.rank)[0];
        if (best && best.rank > 1) {
          await playOneCard(page, best.id, mySeed);
          const after = (await getState(page))!;
          const t = after.board[mySeed];
          r.strengthened = { hex: mySeed, from: 1, to: t?.strength ?? -1, seedMarkAfter: !!t?.seed, domSeedAfter: (await domSeeds(page)).includes(mySeed) };
          if (r.strengthened.to === best.rank) {
            await shot(page, 'seed-after-strengthen');
            continue;
          }
        }
      }
      // otherwise the one-card move with the highest card on the first glowing hex
      if (s.sproutsThisTurn === 0 && hand.length) {
        const card = [...hand].sort((a, b) => b.rank - a.rank)[0]!;
        await page.click(`#hand [data-card="${card.id}"]`);
        await page.waitForTimeout(120);
        const target = await page.evaluate(`(() => { const t = [...document.querySelectorAll('.l-over .target')].find((e) => !e.classList.contains('kind-strengthen')); return t ? t.getAttribute('data-key') : null; })()`) as string | null;
        if (target) {
          if (version === 'seed' && r.mine.length === 0) await shot(page, 'seed-targets');
          await tapHex(page, target);
          await page.waitForTimeout(150);
          if (await page.locator('#confirm-play:visible').count()) await page.click('#confirm-play');
          await idle(page);
          const after = (await getState(page))!;
          const t = after.board[target];
          if (t && t.owner === 0 && after.lastResolution?.sprout) {
            r.mine.push({ card: card.id, rank: card.rank, hex: target, strength: t.strength, seedMark: !!t.seed });
            if (r.mine.length === 1) await shot(page, `${version}-after-first-move`);
          }
          continue;
        }
        await page.keyboard.press('Escape');
      }
      // done growing: throw (or skip)
      // (the moves row is redrawn often: click it in the page itself, never wait on a stale button)
      const clicked = await page.evaluate(`(() => { const b = document.querySelector('#moves .end'); if (b) b.click(); return !!b; })()`);
      if (!clicked) await page.keyboard.press('Escape');
      await page.waitForTimeout(80);
      continue;
    }
    if (s.phase === 'DISCARD') {
      await page.evaluate(`(() => { const c = document.querySelector('#hand .card'); if (c) c.click(); })()`);
      await page.waitForTimeout(80);
      continue;
    }
    await page.waitForTimeout(100);
  }
  r.chip = (await page.textContent('#version-chip')) ?? '';
  await idle(page);
  await page.waitForTimeout(500);
  r.resultShown = await page.locator('#gameover:visible').count().then((n) => n > 0);
  r.goSub = (await page.textContent('#go-sub')) ?? '';
  r.goVersion = (await page.textContent('#go-version')) ?? '';
  r.goMoves = (await page.textContent('#go-moves')) ?? '';
  await shot(page, `${version}-game-over`);
  return r;
};

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => void d.accept());
await page.addInitScript(() => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.clear();
  localStorage.setItem('severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'skip' }));
  localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
  localStorage.setItem('severgrow.seen', '1');
});
await page.goto(BASE);
await page.waitForTimeout(300);
await shot(page, 'menu');
check('the menu shows SEVEROR with SPROUT VERSION and SEED VERSION', (await page.textContent('h1.title')) === 'Severor' && (await page.isVisible('#menu-sprout')) && (await page.isVisible('#menu-seed')) && (await page.title()) === 'Severor');

// ---- Sprout ----
await page.click('#menu-sprout');
check('the level screen says which version', ((await page.textContent('#levels-version')) ?? '').includes('Sprout version'));
await page.click('#level-grid [data-level="3"]');
await idle(page);
const s1 = (await getState(page))!;
check('Sprout version: the game runs the Sprout rules (no ruleset key, as before)', s1.config.ruleset === undefined && s1.config.strengthenLimitPerGame === 2);
const sprout = await playGame(page, 'sprout');
check('Sprout version: a complete game ends normally with the result screen', sprout.resultShown, `${sprout.turns} turns`);
check('Sprout version: every sprout is worth its card, never a seed', sprout.mine.length > 0 && sprout.mine.every((m) => m.strength === m.rank && !m.seedMark), sprout.mine.map((m) => `${m.rank}->${m.strength}`).join(' '));
check('Sprout version: no seed graphic anywhere, page and state agree', sprout.domMismatch.length === 0, sprout.domMismatch.slice(0, 2).join(' | '));
check('Sprout version: the words never say "seed"', sprout.leaks.length === 0, sprout.leaks.slice(0, 2).join(' | '));
check('Sprout version: the label says "Sprout version" (in play and on the result)', /sprout version/i.test(sprout.chip) && /Sprout version/.test(sprout.goSub), `${sprout.chip} / ${sprout.goSub}`);

// ---- back to the menu, then Seed ----
await page.click('#go-menu');
await page.waitForTimeout(250);
check('back at the menu: both versions are offered again', (await page.isVisible('#menu-sprout')) && (await page.isVisible('#menu-seed')));
await page.click('#menu-seed');
check('the level screen says Seed version', ((await page.textContent('#levels-version')) ?? '').includes('Seed version'));
await page.click('#level-grid [data-level="3"]');
await idle(page);
const s2 = (await getState(page))!;
check('Seed version: a fresh game with the Seed rules (no stale state from the Sprout game)', s2.config.ruleset === 'seed' && s2.config.strengthenLimitPerGame === -1 && s2.turnNumber === 1 && Object.values(s2.board).filter((t) => t && !t.root).length === 0);
const seed = await playGame(page, 'seed');
check('Seed version: a complete game ends normally with the result screen', seed.resultShown, `${seed.turns} turns`);
check('Seed version: every seed is worth exactly 1, whatever the card', seed.mine.length > 0 && seed.mine.every((m) => m.strength === 1 && m.seedMark) && seed.mine.some((m) => m.rank > 1), seed.mine.map((m) => `${m.rank}->${m.strength}`).join(' '));
check('Seed version: Strengthen grows a seed into a normal tile of the card (no seed mark or graphic left)', !!seed.strengthened && seed.strengthened.to > 1 && !seed.strengthened.seedMarkAfter && !seed.strengthened.domSeedAfter, JSON.stringify(seed.strengthened));
check('Seed version: the page draws exactly the seeds the state has (both sides), all game long', seed.domMismatch.length === 0, seed.domMismatch.slice(0, 2).join(' | '));
check('Seed version: the words never say "sprout"', seed.leaks.length === 0, seed.leaks.slice(0, 2).join(' | '));
check('Seed version: the label says "Seed version" (in play and on the result)', /seed version/i.test(seed.chip) && /Seed version/.test(seed.goSub), `${seed.chip} / ${seed.goSub}`);
check("Seed version: replaying the opponent's turn keeps seeds drawn as seeds", seed.replayKept !== false, String(seed.replayKept));
// ---- the UX pass ----
check("UX: the opponent's last-turn changes are marked at the start of my turn, only on its tiles", seed.freshMax + sprout.freshMax > 0 && seed.freshBad.length + sprout.freshBad.length === 0, `max ${sprout.freshMax}/${seed.freshMax}, bad ${[...sprout.freshBad, ...seed.freshBad].join(' ')}`);
check('UX: tapping the version label explains the version', /Sprout version: a single card/.test(sprout.chipTip) && /Seed version: a single card plants a seed/.test(seed.chipTip), `${sprout.chipTip} | ${seed.chipTip}`);
check('UX: the result screen offers the other version and says what I did', sprout.goVersion === 'Try the Seed version' && seed.goVersion === 'Try the Sprout version' && /^You (sprouted|strengthened)/.test(sprout.goMoves) && /^You (planted \d+ seeds?|strengthened)/.test(seed.goMoves), `${sprout.goVersion}: ${sprout.goMoves} | ${seed.goVersion}: ${seed.goMoves}`);

// ---- a saved Seed game continues as Seed ----
await page.click('#go-menu');
await page.click('#menu-seed');
await page.click('#level-grid [data-level="1"]');
await idle(page);
await page.click('#deck');
await idle(page);
await page.click('#hud-menu');
await page.click('#gm-main');
await page.waitForTimeout(200);
const cont = (await page.textContent('#menu-continue')) ?? '';
const record = (await page.textContent('#menu-stats')) ?? '';
check('UX: the menu shows the record in each version played', /Sprout version: won \d of 1/.test(record) && /Seed version: won \d of 1/.test(record), record.replace(/\n/g, ' / '));
await page.reload();
await page.waitForTimeout(300);
await page.click('#menu-continue');
await idle(page);
const s3 = (await getState(page))!;
check('a saved Seed game continues as a Seed game after a reload (Continue says where: version, level, turn)', /Seed version · Level 1 · turn 1/.test(cont) && s3.config.ruleset === 'seed' && ((await page.textContent('#version-chip')) ?? '').includes('Seed'), cont);
// narrow phones: the version label (and everything else in the game screen) stays on screen
const widths: string[] = [];
for (const w of [320, 360, 375]) {
  await page.setViewportSize({ width: w, height: 700 });
  await page.waitForTimeout(250);
  const right = (await page.evaluate(`Math.max(...[...document.getElementById('game').querySelectorAll('.hud, .steps-row, .play, #hud-history, #hint-btn, #version-chip')].map((e) => Math.round(e.getBoundingClientRect().right)))`)) as number;
  if (process.env.SEED_TRACE) console.log(w, await page.evaluate(`JSON.stringify([...document.getElementById('game').querySelectorAll('.hud, .hud > *, .steps-row, .play, #version-chip')].map((e) => [e.id || e.className.slice(0, 20), Math.round(e.getBoundingClientRect().right), e.textContent.slice(0, 30)]))`));
  widths.push(`${w}px: ${right}`);
}
check('narrow phones (320, 360, 375px): nothing in the game screen is wider than the screen', widths.every((x) => Number(x.split(': ')[1]) <= Number(x.split('px')[0])), widths.join(', '));
await page.setViewportSize({ width: 390, height: 844 });
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
await server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
