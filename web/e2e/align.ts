// Positioning pass, Step 4: ONE browser smoke test of the aligned screen, by touch at 390x844 and
// by mouse at 1280x800. Paints a Bloom near the top and near the bottom of the board, taps both
// homes, uses the corner tools, Undo and Sort (nothing else moves when they change), runs the
// word scans, and the 5 adversarial tests:
//   1. the header at 360px with Large text and the longest scores
//   2. the homes at the top and bottom of the board zone stay inside it
//   3. the dock with the largest hand and a Fruit card, centred
//   4. a resize from portrait to landscape mid-game (state unchanged, still centred)
//   5. painting a Bloom at each board rotation the page uses (phone and desktop)
//   npx tsx web/e2e/align.ts
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { coordKey, legalActions, newGame, rootCoord, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, State, Suit } from '../../src/engine/index.js';
import { fixture } from '../../tests/helpers.js';
import { positionSave } from './position.js';
import { chooseBloom, drawMeld } from './drawing.js';

const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const server = await preview({ configFile: 'web/vite.config.ts', ...(process.env.DIST ? { build: { outDir: process.env.DIST } } : {}), preview: { port: 4195, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4195/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };

/** My Grow step with my tiles up the middle of the board (so Blooms fit near both homes). */
const position = (hand: [Suit | null, number][]): State => {
  const g = newGame(5);
  const tiles: Record<string, [Player, number]> = { '-1,1': [0, 3], '0,0': [0, 3], '1,-1': [0, 3], '-2,1': [0, 2], '-1,2': [0, 2] };
  const f = fixture({ tiles });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const h: Card[] = [];
  for (const [su, r] of hand) h.push(pool.splice(pool.findIndex((c) => c.suit === su && (su === null || c.rank === r)), 1)[0]!);
  return { ...g, board: f.board, terrain: f.terrain, hands: [h, pool.filter((c) => c.suit !== null).splice(0, 7)], deck: pool.filter((c) => !h.includes(c)), phase: 'ACT', turnPlayer: 0, actor: 0 };
};

const open = async (state: State, o: { w: number; h: number; mouse?: boolean; settings?: Record<string, unknown> }) => {
  const page = await browser.newPage(o.mouse ? { viewport: { width: o.w, height: o.h } } : { viewport: { width: o.w, height: o.h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript({ content: 'window.__name = (f) => f;' });
  await page.addInitScript(
    ([s, saved]) => {
      if (sessionStorage.getItem('ready')) return;
      sessionStorage.setItem('ready', '1');
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      localStorage.setItem('severgrow.save.v7', saved as string);
      localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
      localStorage.setItem('severgrow.seen', '1');
      localStorage.setItem('severgrow.ctools.seen', '1');
    },
    [JSON.stringify({ sound: false, coach: false, speed: 'skip', confirmPolicy: 'never', ...o.settings }), positionSave({ state, coach: doneCoach, level: 7 })] as const,
  );
  await page.goto(BASE);
  await page.locator('#menu-continue').click({ force: true });
  await page.waitForTimeout(700);
  await idle(page);
  return { page, errors };
};
const idle = (page: Page) => page.waitForFunction('!window.__severgrow.busy()', undefined, { timeout: 15000 }).catch(() => {});
const st = (page: Page) => page.evaluate('window.__severgrow.state()') as Promise<State>;

/** Centres (x) of the parts that must sit on the centre line, and the screen's centre. */
const centres = (page: Page) =>
  page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)?.getBoundingClientRect();
    const mid = (b?: DOMRect) => (b && b.width ? (b.left + b.right) / 2 : NaN);
    const dock = r('#dock');
    const wrap = r('#board-wrap');
    const board = document.querySelector('.l-base')?.getBoundingClientRect();
    const cards = [...document.querySelectorAll('#hand .card')].map((c) => c.getBoundingClientRect());
    const fan = cards.length ? (Math.min(...cards.map((c) => c.left)) + Math.max(...cards.map((c) => c.right))) / 2 : NaN;
    const deck = r('#deck');
    const discard = r('#discard');
    return {
      screen: window.innerWidth / 2,
      dock: mid(dock),
      zone: mid(wrap),
      pill: mid(r('#turn')),
      board: mid(board),
      piles: deck && discard ? (deck.left + discard.right) / 2 : NaN,
      hint: mid(r('#hint')),
      fan,
      boardAbove: board && wrap ? board.top - wrap.top : NaN,
      boardBelow: board && wrap ? wrap.bottom - board.bottom : NaN,
    };
  });
const boxes = (page: Page, sels: string[]) =>
  page.evaluate((sels) => sels.map((s) => {
    const b = document.querySelector(s)?.getBoundingClientRect();
    return b ? [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10, Math.round(b.width * 10) / 10] : null;
  }), sels);

/** The Bloom whose hexes sit highest (or lowest) on screen. */
const pickBloom = async (page: Page, s: State, where: 'top' | 'bottom') => {
  const blooms = legalActions(viewFor(s, 0)).filter((a): a is Extract<Action, { t: 'Bloom' }> => a.t === 'Bloom');
  const ys: number[] = [];
  for (const b of blooms) {
    let y = 0;
    for (const h of b.hexes) {
      const box = (await page.locator(`.hex-cell[data-key="${coordKey(h)}"]`).boundingBox())!;
      y += box.y + box.height / 2;
    }
    ys.push(y / b.hexes.length);
  }
  const i = ys.indexOf(where === 'top' ? Math.min(...ys) : Math.max(...ys));
  return { bloom: blooms[i]!, y: ys[i]! };
};

const hand3: [Suit, number][] = [[0, 5], [1, 5], [2, 5], [3, 2], [0, 7], [1, 8], [2, 9]];

for (const v of [{ w: 390, h: 844, mouse: false, tag: 'phone' }, { w: 1280, h: 800, mouse: true, tag: 'desktop' }]) {
  const tag = `${v.tag} ${v.w}x${v.h}`;
  // ---- painting a Bloom near the top, then near the bottom (adversarial 5: each rotation used) ----
  for (const where of ['top', 'bottom'] as const) {
    const s = position(hand3);
    const { page, errors } = await open(s, v);
    const { bloom, y } = await pickBloom(page, s, where);
    await chooseBloom(page, bloom);
    await page.waitForTimeout(200);
    await drawMeld(page, bloom);
    await page.waitForTimeout(300);
    if (await page.locator('#confirm-play').isVisible().catch(() => false)) await page.click('#confirm-play');
    await idle(page);
    const after = await st(page);
    const ok = bloom.hexes.every((h) => after.board[coordKey(h)]?.owner === 0);
    check(`${tag}: painting a Bloom near the ${where} of the board lands on the painted hexes`, ok, `${bloom.hexes.map(coordKey).join(' ')} at y≈${Math.round(y)}`);
    if (where === 'top') {
      // Undo appears (it is always in its slot: only its state changes) and nothing else moves
      const sels = ['#hand', '#deck', '#discard', '#hint', '#hand-sort', '#tool-undo', '#turn'];
      const before = await boxes(page, sels);
      const on = await page.locator('#tool-undo').isEnabled();
      await page.click('#tool-undo');
      await idle(page);
      const back = await st(page);
      const after2 = await boxes(page, sels);
      check(`${tag}: Undo was on after the Bloom and takes it back`, on && bloom.hexes.every((h) => back.board[coordKey(h)] === null));
      check(`${tag}: Undo switching off moves nothing (hand, piles, hint, Sort, Undo, pill)`, JSON.stringify(before) === JSON.stringify(after2), `${JSON.stringify(before)} vs ${JSON.stringify(after2)}`);
    }
    check(`${tag}: no page errors (${where})`, errors.length === 0, errors[0]);
    await page.close();
  }

  // ---- the homes, the corner tools, Sort, centring, word scans ----
  {
    const s = position(hand3);
    const { page, errors } = await open(s, v);
    const c = await centres(page);
    const line = v.mouse ? c.zone : c.screen;
    const dockLine = v.mouse ? c.dock : c.screen;
    const offs = { pill: c.pill - c.screen, board: c.board - line, piles: c.piles - dockLine, hint: c.hint - dockLine, hand: c.fan - dockLine };
    check(`${tag}: pill, board, pile pair, hint and hand centred within 1pt`, Object.values(offs).every((x) => Math.abs(x) <= 1), JSON.stringify(Object.fromEntries(Object.entries(offs).map(([k, x]) => [k, +x.toFixed(2)]))));
    check(`${tag}: the board has the same space above and below (within 2pt)`, Math.abs(c.boardAbove - c.boardBelow) <= 2, `${c.boardAbove.toFixed(1)} / ${c.boardBelow.toFixed(1)}`);
    // the homes: on phones the volcano straight above the tree; tap each
    const tree = coordKey(rootCoord(0, s.config.rootStyle, s.config.boardRadius));
    const volcano = coordKey(rootCoord(1, s.config.rootStyle, s.config.boardRadius));
    const tb = (await page.locator(`.hex-cell[data-key="${tree}"]`).boundingBox())!;
    const vb = (await page.locator(`.hex-cell[data-key="${volcano}"]`).boundingBox())!;
    const tx = tb.x + tb.width / 2;
    const vx = vb.x + vb.width / 2;
    if (!v.mouse) check(`${tag}: the volcano straight above the tree on the centre line`, Math.abs(tx - vx) <= 1 && Math.abs(tx - c.screen) <= 1 && vb.y < tb.y, `tree x ${tx.toFixed(1)}, volcano x ${vx.toFixed(1)}`);
    else check(`${tag}: my tree on the left, the volcano on the right, level`, tx < vx && Math.abs(tb.y + tb.height / 2 - (vb.y + vb.height / 2)) <= 1.5, `tree ${Math.round(tx)},${Math.round(tb.y)} volcano ${Math.round(vx)},${Math.round(vb.y)}`);
    for (const [name, key] of [['tree', tree], ['volcano', volcano]] as const) {
      const b = (await page.locator(`.hex-cell[data-key="${key}"]`).boundingBox())!;
      if (v.mouse) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      else await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForTimeout(300);
      const card = (await page.textContent('#tooltip').catch(() => '')) ?? '';
      check(`${tag}: tapping the ${name} opens its card`, (await page.locator('#tooltip').isVisible()) && /tree|volcano/i.test(card), card.slice(0, 50));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
    // corner tools: the shield and the target toggle; replay is in its slot (dimmed: nothing yet)
    for (const id of ['tool-weak', 'tool-targets']) {
      const a = await page.getAttribute(`#${id}`, 'aria-pressed');
      await page.click(`#${id}`);
      await page.waitForTimeout(150);
      check(`${tag}: ${id} toggles`, (await page.getAttribute(`#${id}`, 'aria-pressed')) !== a);
      await page.click(`#${id}`);
    }
    check(`${tag}: Replay holds its slot, dimmed until the opponent has moved`, (await page.locator('#tool-replay').isVisible()) && ((await page.getAttribute('#tool-replay', 'class')) ?? '').includes('off'));
    const corners = await page.evaluate(() => ['#tool-weak', '#tool-targets', '#tool-replay', '#hint-btn'].map((s) => {
      const b = document.querySelector(s)!.getBoundingClientRect();
      const w = document.querySelector('#board-wrap')!.getBoundingClientRect();
      return { l: b.left - w.left, r: w.right - b.right, t: b.top - w.top, b: w.bottom - b.bottom };
    }));
    const [tl, tr, bl, br] = corners;
    check(`${tag}: the four corner tools mirror each other (same insets)`, Math.abs(tl!.l - tr!.r) <= 0.5 && Math.abs(bl!.l - br!.r) <= 0.5 && Math.abs(tl!.t - tr!.t) <= 0.5 && Math.abs(bl!.b - br!.b) <= 0.5, JSON.stringify(corners.map((x) => Object.values(x).map((n) => Math.round(n)))));
    await page.click('#hint-btn');
    await page.waitForTimeout(300);
    check(`${tag}: "?" opens How to play`, await page.locator('#sheet-howto').isVisible());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    // Sort: the fan stays centred, nothing else moves
    const sels = ['#deck', '#discard', '#hint', '#tool-undo', '#hand-sort'];
    const before = await boxes(page, sels);
    const fanBefore = (await centres(page)).fan;
    await page.click('#hand-sort');
    await page.waitForTimeout(400);
    const after = await boxes(page, sels);
    const fanAfter = (await centres(page)).fan;
    check(`${tag}: Sort reorders without moving anything; the fan stays centred`, JSON.stringify(before) === JSON.stringify(after) && Math.abs(fanAfter - fanBefore) <= 0.5);
    // word scans
    const text = (await page.evaluate('document.body.innerText + " " + [...document.querySelectorAll("[aria-label],[title],[data-tip]")].map((e) => (e.getAttribute("aria-label") || "") + " " + (e.getAttribute("title") || "") + " " + (e.getAttribute("data-tip") || "")).join(" ")')) as string;
    const banned = ['bot', 'bots', 'seed', 'seeds', 'plant', 'plants', 'clump', 'clumps', 'hypha', 'hyphae'].filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
    check(`${tag}: word scans (no bot, seed, plant, clump, hypha)`, banned.length === 0, banned.join(', '));
    check(`${tag}: no page errors (tools)`, errors.length === 0, errors[0]);
    await page.close();
  }
}

// ---- ADVERSARIAL 1: the header at 360px with Large text and the longest scores ----
// (a score can't reach three digits: 37 hexes, gold counting double, is at most 74; 99 is the
// widest score that can happen)
{
  const s = position(hand3);
  const { page, errors } = await open(s, { w: 360, h: 640, settings: { largeText: true } });
  await page.evaluate(() => {
    document.querySelector('#score-you')!.textContent = '99';
    document.querySelector('#score-bot')!.textContent = '99';
  });
  // a resize makes the page fit the header again (as a real score change does)
  await page.setViewportSize({ width: 361, height: 640 });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const hud = document.querySelector('.hud')!;
    const scores = [...hud.querySelectorAll<HTMLElement>('.score')];
    const pill = document.querySelector('#turn')!.getBoundingClientRect();
    const words = [...hud.querySelectorAll<HTMLElement>('.who')].map((w) => getComputedStyle(w).display !== 'none');
    return {
      pillOff: (pill.left + pill.right) / 2 - window.innerWidth / 2,
      clipped: scores.some((e) => e.scrollWidth > e.clientWidth + 1), // 1px: a fractional column's rounding
      words,
      inside: [...hud.children].every((c) => c.getBoundingClientRect().right <= window.innerWidth + 0.5 && c.getBoundingClientRect().left >= -0.5),
    };
  });
  check('ADVERSARIAL 1: header at 360px, Large text, scores 99-99: pill centred, nothing cut off, the words go together', Math.abs(r.pillOff) <= 1 && !r.clipped && r.inside && r.words[0] === r.words[1], JSON.stringify(r));
  check('ADVERSARIAL 1: no page errors', errors.length === 0, errors[0]);
  await page.close();
}

// ---- ADVERSARIAL 2: the homes at the top and bottom of the board zone stay inside it ----
for (const v of [{ w: 360, h: 640 }, { w: 430, h: 932 }]) {
  const s = position(hand3);
  const { page } = await open(s, v);
  const r = await page.evaluate(() => {
    const zone = document.querySelector('#board-wrap')!.getBoundingClientRect();
    const head = document.querySelector('.hud')!.getBoundingClientRect();
    const dock = document.querySelector('#dock')!.getBoundingClientRect();
    return [...document.querySelectorAll('.landmark .lm-body')].map((l) => {
      const b = l.getBoundingClientRect();
      return { inZone: b.top >= zone.top - 0.5 && b.bottom <= zone.bottom + 0.5, clearOfHeader: b.top >= head.bottom - 0.5, clearOfDock: b.bottom <= dock.top + 0.5 };
    });
  });
  check(`ADVERSARIAL 2: ${v.w}x${v.h}: both homes (top and bottom of the board) stay inside the board zone`, r.length === 2 && r.every((x) => x.inZone && x.clearOfHeader && x.clearOfDock), JSON.stringify(r));
  await page.close();
}

// ---- ADVERSARIAL 3: the largest hand with a Fruit card, centred, every card on screen ----
for (const v of [{ w: 360, h: 640 }, { w: 390, h: 844 }, { w: 1280, h: 800, mouse: true }]) {
  const s = position([[0, 5], [1, 5], [2, 5], [3, 2], [0, 7], [1, 8], [2, 9], [null, 0]]);
  const { page } = await open(s, v);
  const r = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#hand .card')].map((c) => c.getBoundingClientRect());
    const dock = document.querySelector('#dock')!.getBoundingClientRect();
    const undo = document.querySelector('#tool-undo')!.getBoundingClientRect();
    const sort = document.querySelector('#hand-sort')!.getBoundingClientRect();
    const l = Math.min(...cards.map((c) => c.left));
    const rr = Math.max(...cards.map((c) => c.right));
    // the end cards are tilted: test the slots against the cards' real corners near the slots'
    // height band (a card's tilted corner passing above or below a slot is fine)
    const hits = (slot: DOMRect) =>
      [...document.querySelectorAll('#hand .card')].some((c) => {
        const b = c.getBoundingClientRect();
        const x = slot.left + slot.width / 2;
        const y = slot.top + slot.height / 2;
        return document.elementsFromPoint(x, y).includes(c) && b.width > 0;
      });
    return { n: cards.length, fruit: !!document.querySelector('#hand .card.fruit'), off: (l + rr) / 2 - (dock.left + dock.right) / 2, onScreen: l >= -0.5 && rr <= window.innerWidth + 0.5, clearOfSlots: !hits(undo) && !hits(sort), gaps: [Math.round(l - undo.right), Math.round(sort.left - rr)] };
  });
  check(`ADVERSARIAL 3: ${v.w}x${v.h}: 8 cards with a Fruit card, centred within 1pt, all on screen, clear of Undo and Sort`, r.n === 8 && r.fruit && Math.abs(r.off) <= 1 && r.onScreen && r.clearOfSlots, JSON.stringify(r));
  await page.close();
}

// ---- ADVERSARIAL 4: portrait to landscape mid-game and back: the state never changes ----
{
  const s = position(hand3);
  const { page, errors } = await open(s, { w: 390, h: 844 });
  const before = JSON.stringify(await st(page));
  const offs: number[] = [];
  for (const [w, h] of [[844, 390], [390, 844], [1024, 768], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    const c = await centres(page);
    offs.push(Math.abs(c.board - c.zone));
  }
  const after = JSON.stringify(await st(page));
  check('ADVERSARIAL 4: portrait → landscape → back mid-game: the game state is unchanged, the board centred each time', before === after && offs.every((o) => o <= 1) && errors.length === 0, `${offs.map((o) => o.toFixed(2)).join(' ')}${errors[0] ? ` · ${errors[0]}` : ''}`);
  await page.close();
}

await browser.close();
server.httpServer.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
