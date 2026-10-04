// v0.7 Step 9: ONE browser smoke test for the pro pass, by touch on a phone in BOTH board
// orientations (390x844 picks flat hexes, 360x640 too since v0.8), plus the mouse on a desktop:
// Blooms painted by hand (a set, a run with Reverse, 4 tiles, 3 from a longer group, one that
// replaces, one that cuts), the one-tap suggestion, tap-only painting, a Fruit card, both homes,
// the corner icons, Sort, Undo only when available, a Strangle finish, autosave and resume,
// rotating mid-paint, and the word scans. (The empty turn has its own suite, emptyturn.ts.)
//   npx tsx web/e2e/propass.ts      (needs a built page and PW_CHROMIUM)
import { chromium } from 'playwright-core';
import type { Browser, CDPSession, Page } from 'playwright-core';
import { preview } from 'vite';
import { coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, State, Suit } from '../../src/engine/index.js';
import { fixture } from '../../tests/helpers.js';
import { positionSave } from './position.js';
import { fruitOnTop } from './paint-positions.js';
import { chooseBloom, clickKind, drawMeld, hexCenter } from './drawing.js';

const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4191, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4191/';
const browser: Browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };

const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit, number][], rock: string[] = []): State => {
  const g = newGame(5);
  const f = fixture({ tiles, rock });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck].filter((c) => c.suit !== null);
  const h: Card[] = [];
  for (const [su, r] of hand) h.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
  return { ...g, board: f.board, terrain: f.terrain, hands: [h, pool.splice(0, 7)], deck: pool, phase: 'ACT', turnPlayer: 0, actor: 0 };
};
const SET3: [Suit, number][] = [[0, 6], [1, 6], [2, 6]];
const SET4: [Suit, number][] = [[0, 6], [1, 6], [2, 6], [3, 6]];
const RUN: [Suit, number][] = [[0, 3], [0, 4], [0, 5]];

type Phone = { w: number; h: number; orient: 'flat' | 'pointy' };
const PHONES: Phone[] = [
  { w: 390, h: 844, orient: 'flat' },
  // v0.8: with no headroom above the board, flat now measures bigger here too (50.0 vs 49.7pt)
  { w: 360, h: 640, orient: 'flat' },
];

const open = async (state: State, o: { w: number; h: number; touch?: boolean; settings?: Record<string, unknown> }) => {
  const page = await browser.newPage({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: 1, hasTouch: o.touch ?? true, isMobile: o.touch ?? true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([s, saved]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      localStorage.setItem('severgrow.save.v7', saved as string);
      localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
      localStorage.setItem('severgrow.ctools.seen', '1');
    },
    [JSON.stringify({ sound: false, coach: false, speed: 'skip', confirmPolicy: 'always', ...o.settings }), positionSave({ state, coach: doneCoach })],
  );
  await page.goto(BASE);
  await page.click('#menu-continue');
  await page.waitForTimeout(300);
  return { page, errors };
};
const st = (page: Page) => page.evaluate(() => (window as unknown as { __severgrow: { state: () => State } }).__severgrow.state());
const idle = (page: Page) => page.waitForFunction(() => !(window as unknown as { __severgrow: { busy: () => boolean } }).__severgrow.busy(), undefined, { timeout: 15000 }).catch(() => {});
const pick = (page: Page, n: number) => clickKind(page, `#moves [data-kind^="bloom-${n}-"]`);
const confirm = async (page: Page) => {
  if (await page.locator('#confirm-play').isVisible()) await page.click('#confirm-play');
  await page.waitForTimeout(200);
  await idle(page);
};
const ghostKeys = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.l-draw .draw-ghost')].map((g) => g.getAttribute('data-key')!));
const ghostNums = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.l-draw .draw-ghost .ghost-num')].map((t) => Number(t.textContent)));

// touch through Chrome's own touch events
const cdpOf = new WeakMap<Page, CDPSession>();
const cdp = async (page: Page) => {
  if (!cdpOf.has(page)) cdpOf.set(page, await page.context().newCDPSession(page));
  return cdpOf.get(page)!;
};
type P = { x: number; y: number };
const tDown = async (page: Page, p: P) => (await cdp(page)).send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
const tMove = async (page: Page, p: P, steps: number, from: P) => {
  const c = await cdp(page);
  for (let i = 1; i <= steps; i++) await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((p.x - from.x) * i) / steps, y: from.y + ((p.y - from.y) * i) / steps, id: 1 }] });
};
const tUp = async (page: Page) => {
  await (await cdp(page)).send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
};
const tTap = async (page: Page, k: string) => {
  await tDown(page, await hexCenter(page, k));
  await tUp(page);
};
const tDrag = async (page: Page, keys: string[], release = true) => {
  const pts: P[] = [];
  for (const k of keys) pts.push(await hexCenter(page, k));
  await tDown(page, pts[0]!);
  for (let i = 1; i < pts.length; i++) await tMove(page, pts[i]!, 6, pts[i - 1]!);
  if (release) await tUp(page);
};
const BANNED = /\b(?:bots?|clumps?|hyphae?|roots?)\b|grow a line|line of/i;
const scan = (page: Page): Promise<string[]> =>
  page.evaluate(`(() => {
    const re = new RegExp(${JSON.stringify(BANNED.source)}, 'i');
    const bad = [];
    for (const e of document.querySelectorAll('body *')) {
      if (e.closest('[hidden], #debug-corner')) continue;
      for (const n of e.childNodes) if (n.nodeType === 3 && re.test(n.textContent || '')) bad.push((n.textContent || '').trim());
      for (const a of ['aria-label', 'title', 'alt', 'data-tip']) if (re.test(e.getAttribute(a) || '')) bad.push(e.getAttribute(a));
    }
    return bad;
  })()`);

for (const ph of PHONES) {
  const tag = `${ph.w}x${ph.h} (${ph.orient})`;
  {
    // a 3-tile Bloom from a set, painted by hand; the orientation chosen by measurement
    const { page, errors } = await open(stateWith({}, SET3), ph);
    const orient = await page.evaluate(() => document.documentElement.dataset.orient);
    const undoBefore = await page.locator('#tool-undo').isEnabled();
    await pick(page, 3);
    await tDrag(page, ['-1,1', '0,1', '1,0']);
    await confirm(page);
    const b = (await st(page)).board;
    const placed = ['-1,1', '0,1', '1,0'].every((k) => b[k]?.owner === 0 && b[k]?.strength === 6);
    check(`${tag}: the board picks ${ph.orient} hexes`, orient === ph.orient, orient);
    check(`${tag}: a set of 3 painted by hand blooms 3 tiles`, placed && errors.length === 0);
    // Undo shows only when there is something to take back; it takes the Bloom back
    const undoAfter = await page.locator('#tool-undo').isEnabled();
    await page.click('#tool-undo');
    await idle(page);
    const back = (await st(page)).board['-1,1'] === null;
    // positioning pass: Undo keeps its slot; it is disabled (dimmed) when nothing can be undone
    check(`${tag}: Undo off before a move, on after it, takes the Bloom back, off again`, !undoBefore && undoAfter && back && !(await page.locator('#tool-undo').isEnabled()) && (await page.locator('#tool-undo').isVisible()));
    // the word scans, mid-game
    const bad = await scan(page);
    check(`${tag}: none of the retired or banned words (BANNED above) on the page`, bad.length === 0, bad.slice(0, 2).join(' | '));
    await page.close();
  }
  {
    // a run with Reverse: the highest number goes on the first painted hex
    const { page, errors } = await open(stateWith({}, RUN), ph);
    await pick(page, 3);
    await page.click('#moves .draw-reverse');
    await tDrag(page, ['-1,1', '0,1', '1,1'], false);
    const nums = await ghostNums(page);
    await tUp(page);
    await confirm(page);
    const b = (await st(page)).board;
    check(`${tag}: a run with Reverse: numbers 5, 4, 3 in paint order`, JSON.stringify(nums) === '[5,4,3]' && b['-1,1']?.strength === 5 && b['1,1']?.strength === 3 && errors.length === 0, nums.join(','));
    await page.close();
  }
  {
    // the one-tap suggestion, then tap-only painting
    const { page } = await open(stateWith({}, SET3), ph);
    await pick(page, 3);
    await tTap(page, '-1,1');
    // the suggestion is shown as the ready preview (the ghost tiles over the board)
    const suggested = await page.evaluate(() => [...document.querySelectorAll('.l-over .ghost .ghost-num')].length ? [...document.querySelectorAll('.l-over .ghost')].map((g) => g.querySelector('.ghost-num')?.textContent ?? '') : []);
    const sugKeys = (await st(page)).phase && (await page.evaluate(() => JSON.stringify((window as unknown as { __severgrow: { pending: () => unknown } }).__severgrow.pending())));
    const ready = await page.locator('#confirm-play').isVisible();
    const pend = JSON.parse(sugKeys || 'null') as Extract<Action, { t: 'Bloom' }> | null;
    check(`${tag}: one tap shows a whole suggested Bloom through that hex, ready to confirm`, suggested.length === 3 && !!pend && pend.t === 'Bloom' && pend.hexes.some((h) => coordKey(h) === '-1,1') && ready, `${suggested.join(',')} ${pend?.hexes.map(coordKey).join(' ')}`);
    await page.click('#confirm-cancel').catch(() => {});
    await page.waitForTimeout(150);
    await pick(page, 3).catch(() => {});
    for (const k of ['-1,1', '0,1', '1,0']) await tTap(page, k);
    const tapped = await ghostKeys(page);
    await confirm(page);
    const b = (await st(page)).board;
    check(`${tag}: tap-only painting (one hex at a time) blooms exactly those hexes`, ['-1,1', '0,1', '1,0'].every((k) => b[k]?.owner === 0), tapped.join(' '));
    await page.close();
  }
  {
    // 4 tiles, and 3 from a group of 4 ("keep the other")
    const { page } = await open(stateWith({}, SET4), ph);
    // two ways to bloom: one "Bloom" button opens the list; it says "Bloom 3 tiles, keep the other"
    const toggle = await page.locator('#moves .bloom-toggle').isVisible();
    await page.click('#moves .bloom-toggle').catch(() => {});
    const label3 = (await page.locator('#moves [data-kind^="bloom-3-"]').textContent()) ?? '';
    const box = await page.locator('.bloom-options').boundingBox();
    const inView = !!box && box.x >= 0 && box.x + box.width <= ph.w + 0.5 && box.y >= 0;
    await page.click('#moves .bloom-toggle').catch(() => {});
    await pick(page, 4);
    await tDrag(page, ['-1,1', '0,1', '1,0', '1,1']);
    await confirm(page);
    const n4 = Object.values((await st(page)).board).filter((t) => t?.owner === 0 && !t.root).length;
    check(`${tag}: a Bloom of 4 places 4 tiles`, n4 === 4);
    check(`${tag}: two ways to bloom: one button opens the choices, all on screen, one says "Bloom 3 tiles, keep the other"`, toggle && inView && /Bloom 3 tiles, keep the other/.test(label3), `${label3}; toggle ${toggle}; box ${box ? [box.x, box.y, box.width, box.height].map((n) => Math.round(n)).join(',') : 'none'}`);
    await page.close();
    const { page: p2 } = await open(stateWith({}, SET4), ph);
    await pick(p2, 3);
    await tDrag(p2, ['-1,1', '0,1', '1,0']);
    await confirm(p2);
    const s2 = await st(p2);
    check(`${tag}: 3 cards from a group of 4: 3 tiles, the 4th card stays in hand`, Object.values(s2.board).filter((t) => t?.owner === 0 && !t.root).length === 3 && s2.hands[0].filter((c) => c.rank === 6).length === 1);
    await p2.close();
  }
  {
    // a Bloom that replaces an opponent tile, and one that cuts them off
    const { page } = await open(stateWith({ '-1,1': [1, 2] }, SET3), ph);
    await pick(page, 3);
    await tDrag(page, ['-1,1', '0,1', '1,0']);
    await confirm(page);
    check(`${tag}: a Bloom replaces a weaker opponent tile`, (await st(page)).board['-1,1']?.owner === 0);
    await page.close();
    const cut = stateWith({ '-1,1': [0, 3], '1,-1': [1, 2], '0,0': [1, 2], '-1,0': [1, 1] }, SET3);
    const { page: p2, errors } = await open(cut, ph);
    await pick(p2, 3);
    await tDrag(p2, ['0,0', '0,1', '1,0']);
    await confirm(p2);
    const b = (await st(p2)).board;
    check(`${tag}: a Bloom that takes a link cuts the opponent tiles beyond it`, b['0,0']?.owner === 0 && b['-1,0'] === null && errors.length === 0);
    await p2.close();
  }
  {
    // adversarial 10: rotating the phone while painting
    const { page, errors } = await open(stateWith({}, SET3), ph);
    await pick(page, 3);
    await tDrag(page, ['-1,1', '0,1'], false);
    await page.setViewportSize({ width: ph.h, height: ph.w });
    await page.waitForTimeout(400);
    await tUp(page);
    const placedMid = Object.values((await st(page)).board).filter((t) => t?.owner === 0 && !t.root).length;
    const kept = await ghostKeys(page);
    await page.setViewportSize({ width: ph.w, height: ph.h });
    await page.waitForTimeout(400);
    // the half-painted shape survives the turn of the board; one more hex finishes it
    await tTap(page, '1,0');
    await confirm(page);
    const after = Object.values((await st(page)).board).filter((t) => t?.owner === 0 && !t.root).length;
    check(`${tag}: ADVERSARIAL 10: rotating mid-paint places nothing, keeps the half-painted shape, and painting goes on`, placedMid === 0 && kept.length === 2 && after === 3 && errors.length === 0, `${placedMid} then ${after}; kept ${kept.join(' ')}; ${errors[0] ?? ''}`);
    await page.close();
  }
  {
    // both homes: tap them for their tile cards (and the tapped reaction)
    const { page, errors } = await open(stateWith({}, SET3), ph);
    await tTap(page, '-2,2');
    const mine = (await page.textContent('#tooltip')) ?? '';
    const tapped = await page.locator('.landmark.lm-tree.tapped').count();
    await tTap(page, '-2,2');
    await tTap(page, '2,-2');
    const theirs = (await page.textContent('#tooltip')) ?? '';
    check(`${tag}: tapping my home says "Your tree" and its sides; the opponent's says "Opponent's volcano"`, /Your tree/.test(mine) && /of 6 sides blocked/.test(mine) && /Opponent's volcano/.test(theirs) && errors.length === 0, `${mine.slice(0, 40)} | ${theirs.slice(0, 40)} | tapped ${tapped}`);
    // the corner icons: 40pt visible, a ring when on; Sort
    const box = await page.locator('#tool-weak').boundingBox();
    await page.locator('#tool-weak').click();
    const pressed = await page.getAttribute('#tool-weak', 'aria-pressed');
    const sortBefore = (await page.evaluate(() => (window as unknown as { __severgrow: { settings: () => { handSort: string } } }).__severgrow.settings().handSort));
    await page.click('#hand-sort');
    const sortAfter = (await page.evaluate(() => (window as unknown as { __severgrow: { settings: () => { handSort: string } } }).__severgrow.settings().handSort));
    check(`${tag}: corner icons are about 40pt and switch on; Sort switches the order`, !!box && box.width >= 38 && box.width <= 46 && pressed === 'true' && sortBefore !== sortAfter, `${box?.width}pt, ${pressed}, ${sortBefore}->${sortAfter}`);
    await page.close();
  }
  {
    // a Fruit card from the tile card
    const top = fruitOnTop();
    const { page, errors } = await open(top.state, ph);
    await tTap(page, top.target);
    await page.click('#tooltip .tc-fruit');
    await confirm(page);
    check(`${tag}: a Fruit card removes the opponent's top tile`, (await st(page)).board[top.target] === null && errors.length === 0);
    await page.close();
  }
  {
    // the Strangle finish: the volcano is smothered, within about 2 seconds at Normal speed
    const s = stateWith({ '-1,1': [0, 3], '0,0': [0, 3], '1,-1': [0, 3] }, SET3, ['3,-2', '3,-3', '2,-3', '2,-1']);
    const a = legalActions(viewFor(s, 0)).find((x) => x.t === 'Bloom' && x.hexes.some((h) => coordKey(h) === '1,-2')) as Action;
    const { page, errors } = await open(s, { ...ph, settings: { speed: 'normal', confirmPolicy: 'never' } });
    await chooseBloom(page, a);
    const t0 = Date.now();
    await drawMeld(page, a);
    await page.waitForSelector('.landmark.lm-volcano.strangled', { timeout: 8000 }).catch(() => {});
    const ms = Date.now() - t0;
    const smothered = await page.locator('.landmark.lm-volcano.strangled').count();
    await idle(page);
    const over = (await st(page)).result?.reason;
    check(`${tag}: a Strangle finish: the volcano is smothered and the game ends by Strangle`, smothered === 1 && over === 'strangle' && errors.length === 0, `${ms} ms to the smother`);
    await page.close();
  }
  {
    // autosave and resume: reload mid-turn, Continue, the same position
    const { page, errors } = await open(stateWith({}, SET3), ph);
    await pick(page, 3);
    await tDrag(page, ['-1,1', '0,1', '1,0']);
    await confirm(page);
    const before = JSON.stringify(await st(page));
    await page.reload();
    await page.click('#menu-continue');
    await page.waitForTimeout(300);
    const after = JSON.stringify(await st(page));
    check(`${tag}: autosave: reload mid-turn, Continue, the exact same position`, before === after && errors.length === 0);
    await page.close();
  }
}
{
  // the desktop flow with a mouse: click to start, the shape follows, click to finish
  const { page, errors } = await open(stateWith({}, SET3), { w: 1280, h: 800, touch: false });
  await pick(page, 3);
  const a = await hexCenter(page, '-1,1');
  const b = await hexCenter(page, '1,0');
  await page.mouse.click(a.x, a.y);
  await page.mouse.move(b.x, b.y, { steps: 5 });
  const live = await ghostKeys(page);
  await page.mouse.click(b.x, b.y);
  await confirm(page);
  const n = Object.values((await st(page)).board).filter((t) => t?.owner === 0 && !t.root).length;
  check('desktop: click, the Bloom follows the mouse, click, placed', live.length === 3 && n === 3 && errors.length === 0, live.join(' '));
  await page.close();
}

await browser.close();
await new Promise<void>((r) => server.httpServer.close(() => r()));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
