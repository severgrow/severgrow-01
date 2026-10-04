// Fruit cards in the browser: the smoke test of the Fruit cards task (Steps 4 and 7), with touch
// and mouse. The card in the hand (at the right, glowing, or dimmed with a reason), no chip
// near the deck (v0.8), picking it lights calm targets with the "any strength" note, a Fruit card on a
// 9 (forecast, Confirm, burst, cut), Undo, v0.8's one Fruit card per turn then the throw, the tile card shortcut,
// an empty turn, a Sprout, a Strengthen, an opponent's Fruit card, a full game to the end, the
// word scans (no "bot", no "seed"/"plant"), and no sideways scroll at 360px with a full hand.
// Saves screenshots (390x844) to docs/screens/fruit-cards/ with --shots.
//   npx tsx web/e2e/fruitcards.ts [--shots]
import { positionSave } from './position.js';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { isFruitCard } from '../../src/engine/index.js';
import type { Player, State } from '../../src/engine/index.js';
import { NINE_CHAIN, NINE_PAIR, fruitPosition } from './fruitcards-pos.js';
import { hexCenter } from './drawing.js';

const SHOTS = process.argv.includes('--shots') ? 'docs/screens/fruit-cards' : null;
const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
// DIST=/other/dir serves another build
const server = await preview({ configFile: 'web/vite.config.ts', ...(process.env.DIST ? { build: { outDir: process.env.DIST } } : {}), preview: { port: 4194, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4194/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };

const idle = (page: Page) => page.waitForFunction(`!window.__severgrow.busy()`, undefined, { timeout: 15000 }).catch(() => {});
const open = async (state: State, o: { w?: number; settings?: Record<string, unknown>; tips?: Record<string, boolean>; mouse?: boolean } = {}) => {
  const page = await browser.newPage(o.mouse ? { viewport: { width: 1280, height: 800 } } : { viewport: { width: o.w ?? 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([s, saved, tips]) => {
      if (sessionStorage.getItem('ready')) return;
      sessionStorage.setItem('ready', '1');
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      localStorage.setItem('severgrow.save.v7', saved as string);
      localStorage.setItem('severgrow.tips.v1', tips as string);
      localStorage.setItem('severgrow.seen', '1');
      // record every caption as it appears (they replace each other quickly)
      const w = window as unknown as { __caps: string[] };
      w.__caps = [];
      document.addEventListener('DOMContentLoaded', () => {
        new MutationObserver((ms) => {
          for (const m of ms) for (const n of m.addedNodes) if (n.textContent) w.__caps.push(n.textContent);
        }).observe(document.getElementById('captions')!, { childList: true });
      });
    },
    [
      JSON.stringify({ sound: false, coach: false, speed: 'fast', ...o.settings }),
      positionSave({ state, coach: doneCoach, level: 7 }),
      JSON.stringify({ fruit: true, strengthen: true, draw: true, ...o.tips }),
    ] as const,
  );
  await page.goto(BASE);
  // a finger on a phone (a mouse click would leave a hover tile card over the board)
  if (o.mouse) await page.click('#menu-continue');
  else await page.tap('#menu-continue');
  // let the board's deal-in finish (screenshots), then wait until nothing animates
  await page.waitForTimeout(SHOTS ? 1600 : 400);
  await idle(page);
  return { page, errors };
};
const st = (page: Page) => page.evaluate(`window.__severgrow.state()`) as Promise<State>;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const tap = async (page: Page, key: string) => {
  const c = await hexCenter(page, key);
  await page.touchscreen.tap(c.x, c.y);
  await page.waitForTimeout(200);
};

// ---- 1. the card in the hand, the chip, picking it, a Fruit card on a 9, Undo ----
console.log(`[1] the card in the hand, the chip, picking `);
{
  const state = fruitPosition(NINE_CHAIN, [[0, 2], [1, 5], [2, 7]], 1);
  const { page, errors } = await open(state, { tips: { fruit: false } });
  await shot(page, '01-hand-and-tip');
  const tip = (await page.locator('#first-tip:visible').textContent().catch(() => '')) ?? '';
  check('the one-time tip: "Fruit cards: play one on an opponent tile that touches yours to remove it, even a 9."', tip.includes('play one on an opponent tile that touches yours to remove it, even a 9.'), tip.slice(0, 90));
  await page.click('#first-tip-ok').catch(() => {});
  const last = page.locator('#hand .card').last();
  check('Sort puts the Fruit card at the right, glowing (it has a target)', ((await last.getAttribute('class')) ?? '').includes('fruit') && ((await last.getAttribute('class')) ?? '').includes('fruit-ready'));
  // v0.8 UI pass: no "Fruit cards unseen" chip any more (no hidden-information indicator)
  check('no Fruit-unseen chip', (await page.locator('#fruit-chip').count()) === 0);
  await last.click();
  await page.waitForTimeout(250);
  const targets = await page.locator('.l-over .target.kind-fruit').count();
  const hint = (await page.textContent('#hint').catch(() => '')) ?? '';
  check('picking it lights its targets only (calm rings), with the "any strength" note', targets === 2 && hint.includes('Any strength'), `${targets} targets · ${hint}`);
  await shot(page, '02-targets-any-strength');
  await tap(page, '1,0');
  const asks = await page.locator('#confirm-play').isVisible();
  await shot(page, '03-forecast-confirm');
  check('a target shows the forecast and waits for Confirm (Confirm moves: Smart)', asks);
  await page.click('#confirm-play');
  await page.waitForTimeout(500);
  await shot(page, '04-burst');
  await idle(page);
  const after = await st(page);
  check('the 9 is removed, and the tiles that hung on it are cut', after.board['1,0'] === null && after.board['2,0'] === null && after.board['3,-1'] === null && after.board['1,-1']?.strength === 9);
  check('the card left the game (not in the throw pile)', !after.discard.some(isFruitCard) && after.fruitPlayed === 1);
  await shot(page, '05-after-cut');
  await page.click('#tool-undo');
  await page.waitForTimeout(300);
  const undone = await st(page);
  check('Undo takes it back (until the throw)', undone.board['1,0']?.strength === 9 && undone.hands[0].some(isFruitCard));
  check('no page errors (1)', errors.length === 0, errors[0]);
  await page.close();
}

// ---- 2. v0.8: a Fruit card uses the turn's sprout; the tile card shortcut; Throw is next ----
console.log(`[2] v0.8: one Fruit card per turn, then the throw`);
{
  const state = fruitPosition(NINE_PAIR, [[0, 2], [1, 5]], 2);
  // Auto-skip off: the turn waits after the Fruit card, so each step can be checked (with it on,
  // the page goes straight to the throw: emptyturn.ts)
  const { page, errors } = await open(state, { settings: { confirmPolicy: 'never', autoSkip: false } });
  const hint0 = (await page.textContent('#hint')) ?? '';
  check('after the draw the hint offers the Fruit card next to the sprout', hint0.includes('Sprout a card, or play your Fruit card'), hint0);
  await tap(page, '1,-1');
  const card = (await page.textContent('#tooltip')) ?? '';
  check('the tile card on a 9: "No combo can replace this. A Fruit card can." and "Use Fruit card"', card.includes('No combo can replace this. A Fruit card can.') && card.includes('Use Fruit card'));
  await shot(page, '06-tile-card-shortcut');
  await page.click('#tooltip .tc-fruit');
  await idle(page);
  const one = await st(page);
  check('Confirm moves "Never": the shortcut plays at once', one.board['1,-1'] === null && one.fruitPlayed === 1);
  const lit = await page.locator('.l-over .target.kind-fruit').count();
  check('the second Fruit card has no targets this turn (it used the sprout)', lit === 0, `${lit}`);
  const fruitCards = page.locator('#hand .card.fruit');
  const cls = (await fruitCards.last().getAttribute('class')) ?? '';
  check('the second Fruit card is dimmed, not glowing', cls.includes('dim') && !cls.includes('fruit-ready'), cls);
  const hint1 = (await page.textContent('#hint')) ?? '';
  check('the hint says the Fruit card used the turn and points at the throw', hint1.includes('Fruit used') && hint1.includes('Throw'), hint1);
  await fruitCards.last().click();
  await page.waitForTimeout(250);
  const why = (await page.textContent('#hint')) ?? '';
  check('tapping it explains: "Sprout used this turn. Fruit is back next turn."', why.includes('Sprout used this turn'), why);
  const sprouts = (await st(page)).sproutsThisTurn;
  check('the engine agrees: the sprout is used', sprouts === 1);
  await shot(page, '07-second-fruit-waits');
  // the throw: the moves row's "Throw a card", then a card, and the turn passes
  await page.click('#moves .btn:has-text("Throw")').catch(() => {});
  await page.waitForTimeout(250);
  const inThrow = (await st(page)).phase;
  check('"Throw a card" moves on to the throw', inThrow === 'DISCARD', inThrow);
  await page.locator('#hand .card:not(.fruit)').first().click();
  await page.waitForTimeout(250);
  if ((await page.locator('#confirm-play').isVisible().catch(() => false))) await page.click('#confirm-play');
  await page.waitForFunction(`(() => { const s = window.__severgrow.state(); return s.turnPlayer === 0 && s.phase !== 'DISCARD' && s.turnNumber > ${one.turnNumber}; })()`, undefined, { timeout: 20000 }).catch(() => {});
  await idle(page);
  const back = await st(page);
  check('the opponent moves and my next turn starts clean (sprout free again)', back.turnPlayer === 0 && back.turnNumber > one.turnNumber && back.sproutsThisTurn === 0, `turn ${back.turnNumber} phase ${back.phase}`);
  check('no page errors (2)', errors.length === 0, errors[0]);
  await page.close();
}

/** The word scans of the page as it is now: whole words "bot(s)", and "seed(s)/seeded/plant(ed)". */
const BANNED = String.raw`\b(?:bots?|seeds?|seeded|plant|planted)\b`;
const scanWords = (page: Page): Promise<string[]> =>
  page.evaluate(`(() => {
    const re = new RegExp(${JSON.stringify(BANNED)}, 'i');
    const out = [];
    const push = (w, t) => { if (t && re.test(t)) out.push(w + ': ' + t.trim().slice(0, 60)); };
    push('text', document.body.innerText);
    for (const el of document.querySelectorAll('[aria-label],[alt],[title]')) for (const a of ['aria-label', 'alt', 'title']) push(a, el.getAttribute(a));
    return out;
  })()`);
const words: string[] = [];

// ---- 4. a Sprout (with its wording), a Strengthen, a dimmed Fruit card, the word scan ----
console.log(`[4] a Sprout (with its wording), a Strengthe`);
{
  // mine: root - (-1,1)=3 - (0,0)=3; theirs far away: (2,-1)=6 - (3,-1)=4 (nothing of theirs touches mine)
  const far: Record<string, [Player, number]> = { '-1,1': [0, 3], '0,0': [0, 3], '2,-1': [1, 6], '3,-1': [1, 4] };
  const state = fruitPosition(far, [[0, 2], [1, 7], [2, 5]], 1);
  const { page, errors } = await open(state);
  const hint = (await page.textContent('#hint')) ?? '';
  const skip = (await page.locator('#moves .skip').textContent().catch(() => '')) ?? '';
  check('the single-tile move is called Sprout: "Tap a card to sprout it", "Skip sprout"', hint.includes('Tap a card to sprout it') && skip.includes('Skip sprout'), `${hint} · ${skip}`);
  await shot(page, '09-sprout-wording-and-tracker');
  const fruitEl = page.locator('#hand .card.fruit');
  check('a Fruit card with no target is dimmed, and says why', ((await fruitEl.getAttribute('class')) ?? '').includes('dim') && ((await fruitEl.getAttribute('aria-label')) ?? '').includes('No opponent tile touches yours.'));
  await fruitEl.click();
  await page.waitForTimeout(250);
  await shot(page, '10-fruit-dimmed-reason');
  words.push(...(await scanWords(page)).map((w) => `dimmed · ${w}`));
  await page.click('#moves .cancel').catch(() => {});
  // a Sprout: the 2 on an empty hex next to my (0,0)
  const two = state.hands[0].find((c) => c.suit === 0 && c.rank === 2)!.id;
  await page.locator(`#hand [data-card="${two}"]`).click();
  await tap(page, '0,1');
  if (await page.locator('#confirm-play').isVisible()) await page.click('#confirm-play');
  await idle(page);
  const sprouted = await st(page);
  check('a Sprout: one card, one tile', sprouted.board['0,1']?.owner === 0 && sprouted.board['0,1']?.strength === 2 && sprouted.sproutsThisTurn === 1);
  await page.close();
  // a Strengthen (a fresh turn): the 7 raises my 3 at (0,0)
  const s2 = await open(state);
  const seven = state.hands[0].find((c) => c.suit === 1 && c.rank === 7)!.id;
  await s2.page.locator(`#hand [data-card="${seven}"]`).click();
  await tap(s2.page, '0,0');
  if (await s2.page.locator('#confirm-play').isVisible()) await s2.page.click('#confirm-play');
  await idle(s2.page);
  const strong = await st(s2.page);
  check('a Strengthen: my 3 becomes a 7', strong.board['0,0']?.strength === 7 && strong.board['0,0']?.owner === 0);
  words.push(...(await scanWords(s2.page)).map((w) => `strengthen · ${w}`));
  check('no page errors (4)', errors.length === 0 && s2.errors.length === 0, errors[0] ?? s2.errors[0]);
  await s2.page.close();
}

// ---- 5. the opponent plays a Fruit card on my 9 (calmer: a caption, no banner) ----
console.log(`[5] the opponent plays a Fruit card on my 9 `);
{
  // late in the game: my 9 at (0,0) holds a chain of four; their 9s touch it; they hold a Fruit card
  const tiles: Record<string, [Player, number]> = { '-1,1': [0, 2], '0,0': [0, 9], '0,-1': [0, 3], '-1,-1': [0, 3], '-2,0': [0, 3], '-3,1': [0, 3], '1,0': [1, 9], '1,-1': [1, 9] };
  const base = fruitPosition(tiles, [[0, 2], [1, 5]], 0);
  const fruit = [...base.deck, ...base.discard].find(isFruitCard)!;
  const deck = base.deck.filter((c) => c.id !== fruit.id).slice(0, 6); // a few cards left: no reason to hold it
  // their Grow step comes after their draw: they start at DRAW holding the Fruit card
  const state: State = { ...base, deck, hands: [base.hands[0], [fruit, ...base.hands[1].slice(0, 6)]], turnPlayer: 1, actor: 1, phase: 'DRAW' };
  const { page, errors } = await open(state, { settings: { speed: 'normal' } });
  let caps: string[] = [];
  for (let i = 0; i < 80 && !caps.some((c) => c.includes('Opponent used a Fruit card on your 9')); i++) {
    await page.waitForTimeout(100);
    caps = (await page.evaluate('window.__caps')) as string[];
  }
  await shot(page, '11-opponent-fruit-caption');
  await idle(page);
  const after = await st(page);
  check("the opponent's Fruit card on my 9: removed, with the caption \"Opponent used a Fruit card on your 9\"", after.board['0,0'] === null && caps.some((c) => c.includes('Opponent used a Fruit card on your 9')), caps.join(' | ').slice(0, 120));
  words.push(...(await scanWords(page)).map((w) => `opponent · ${w}`));
  check('no page errors (5)', errors.length === 0, errors[0]);
  await page.close();
}

// ---- 6. with a mouse (desktop): a Fruit card on a 9, click by click ----
console.log(`[6] with a mouse (desktop): a Fruit card on `);
{
  const state = fruitPosition(NINE_CHAIN, [[0, 2], [1, 5]], 1);
  const { page, errors } = await open(state, { mouse: true, settings: { confirmPolicy: 'always' } });
  await page.locator('#hand .card.fruit').click();
  const c = await hexCenter(page, '1,0');
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(200);
  await page.click('#confirm-play');
  await idle(page);
  const after = await st(page);
  check('mouse: a Fruit card on a 9 (Confirm moves: Always)', after.board['1,0'] === null && after.fruitPlayed === 1 && errors.length === 0, errors[0]);
  await page.close();
}

// ---- 7. an empty turn (auto-skip), then a whole game to the end, word scans on the way ----
console.log(`[7] an empty turn (auto-skip), then a whole `);
{
  const { stuckBoard } = await import('./empty-positions.js');
  const { page, errors } = await open({ ...stuckBoard(), phase: 'DRAW' });
  await page.click('#deck');
  await page.waitForFunction(`window.__severgrow.state()?.phase === 'DISCARD' && !window.__severgrow.busy()`, undefined, { timeout: 8000 }).catch(() => {});
  const empty = (await st(page)).phase === 'DISCARD' && ((await page.locator('body').innerText()).includes('Nothing to play this turn'));
  check('an empty turn skips itself: "Nothing to play this turn", straight to the Throw step', empty);
  await page.close();
  // a whole game against level 7, tapping the first playable card each time
  const g = await open(fruitPosition(NINE_CHAIN, [[0, 2], [1, 5], [2, 7], [3, 3], [0, 4], [1, 6]], 1), { settings: { speed: 'skip', confirmPolicy: 'never' } });
  const t0 = Date.now();
  let tried = -1;
  for (let i = 0; i < 400 && Date.now() - t0 < 180_000; i++) {
    const s = await st(g.page);
    if (!s || s.phase === 'GAME_OVER') break;
    if (s.actor !== 0) {
      await idle(g.page);
      await g.page.waitForTimeout(50);
      continue;
    }
    if (s.phase === 'DRAW') await g.page.click('#deck').catch(() => {});
    else if (s.phase === 'ACT') {
      // one try per turn: a playable card (a Fruit card too) and its first target; then end the Grow step
      if (await g.page.locator('#confirm-play').isVisible()) await g.page.click('#confirm-play').catch(() => {});
      else if (tried !== s.turnNumber) {
        tried = s.turnNumber;
        const card = g.page.locator('#hand .card.playable, #hand .card.fruit-ready').first();
        if ((await card.count()) > 0) {
          await card.click().catch(() => {});
          const t = g.page.locator('.l-over .target').first();
          if ((await t.count()) > 0) {
            const b = await t.boundingBox();
            if (b) await g.page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
          }
        }
      } else {
        await g.page.locator('#moves .cancel').first().click({ timeout: 500 }).catch(() => {});
        await g.page.locator('#moves .end').first().click({ timeout: 1000 }).catch(() => {});
      }
    } else if (s.phase === 'DISCARD') await g.page.locator('#hand .card').first().click().catch(() => {});
    await g.page.waitForTimeout(40);
    if (i % 25 === 0) words.push(...(await scanWords(g.page)).map((w) => `game · ${w}`));
  }
  const end = await st(g.page);
  check('a whole game to the end with Fruit cards in the deck, no page errors', end.phase === 'GAME_OVER' && g.errors.length === 0 && errors.length === 0, `${end.phase} · ${g.errors[0] ?? ''}`);
  words.push(...(await scanWords(g.page)).map((w) => `game over · ${w}`));
  await g.page.close();
}
check('the word scans: no "bot", "seed", "plant" (whole words) in text, aria-labels, alt or titles, in every state above', words.length === 0, words.slice(0, 3).join(' | '));

// ---- 3. a full hand at 360px: everything visible, no sideways scroll ----
console.log(`[3] a full hand at 360px: everything visible`);
{
  const state = fruitPosition(NINE_CHAIN, [[0, 2], [0, 3], [1, 5], [2, 7], [3, 9], [1, 1]], 2);
  const { page, errors } = await open(state, { w: 360 });
  const fit = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#hand .card')].map((c) => c.getBoundingClientRect());
    return { n: cards.length, inside: cards.every((r) => r.left >= 0 && r.right <= innerWidth + 0.5), scroll: document.documentElement.scrollWidth - innerWidth };
  });
  check('360px wide, 8 cards with 2 Fruit cards: all visible, no sideways scroll', fit.n === 8 && fit.inside && fit.scroll <= 0, JSON.stringify(fit));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/08-360px-full-hand.png` });
  check('no page errors (3)', errors.length === 0, errors[0]);
  await page.close();
}

await browser.close();
server.httpServer.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
