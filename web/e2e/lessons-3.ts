// LEVELS 1-10 AS THE TUTORIAL, played in a real browser at /3/ with real pointer taps.
//
//   npm run web:build (CHANNEL=futa05 + its online config), then:  npx tsx web/e2e/lessons-3.ts
//
// Players: (c) taps ONLY the lit thing, (random) taps anywhere, then the robustness cases:
// cards before drawing, wrong tiles again and again, hints off, refresh mid-level, L11 board.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { LESSON } from '../../src/strings.js';

const DIST = process.env.FUTA_DIST ?? 'web/dist';
const SHOTS = process.env.SHOTS ?? '';
const ONLY = process.env.ONLY ?? 'all';
const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};
// The /3/ copy is served at /3/, as on futasaku.com, so its own storage prefix is the one in use.
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  if (!path.startsWith('/3/')) { res.writeHead(404); res.end(); return; }
  let file = join(DIST, path.slice(3) || 'index.html');
  if (!existsSync(file) || file.endsWith('/')) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const URL3 = `http://127.0.0.1:${(server.address() as AddressInfo).port}/3/`;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});
const check = (ok: boolean, what: string) => { assert.ok(ok, what); console.log(`  ok  ${what}`); };

type Lit = { t: string; key?: string; keys?: string[]; id?: number; ids?: number[]; player?: number };
type Beat = { id: string; title: string; line?: string; lit: Lit; explain?: boolean };
const hook = <T>(p: Page, f: string): Promise<T> => p.evaluate((name) => {
  const h = (window as any).__severgrow;
  const v = h?.[name]?.();
  return v === undefined ? null : JSON.parse(JSON.stringify(v));
}, f) as Promise<T>;
const idle = (p: Page) => p.waitForFunction(() => { const h = (window as any).__severgrow; return !!h && !h.busy(); }, undefined, { timeout: 30000 });

const newPage = async (w = 390, h = 844) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|127\.0\.0\.1:9/.test(m.text())) errors.push(m.text()); });
  return { page, errors };
};

/** Close the install invitation the way a person does, and only when it is actually showing. */
const dismissInstall = (p: Page) => p.evaluate(`(() => {
  const prompt = document.getElementById('install-prompt');
  if (!prompt || prompt.hidden) return;
  for (const id of ['install-close', 'install-later', 'install-dismiss']) document.getElementById(id)?.click();
  if (!prompt.hidden) prompt.hidden = true;
})()`);

/** From the menu: PLAY → the next level (the only way in). */
const openNextLevel = async (p: Page) => {
  await p.waitForSelector('#menu-play:not([hidden])', { timeout: 20000 });
  await dismissInstall(p);
  await p.evaluate(() => (document.getElementById('menu-play') as HTMLButtonElement).click());
  await p.waitForSelector('#menu-campaign:not([hidden])', { timeout: 10000 });
  await dismissInstall(p);
  await p.evaluate(() => (document.getElementById('menu-campaign') as HTMLButtonElement).click());
  // A saved match asks first (owner decision); resume it so the level continues where it was.
  await p.waitForSelector('#game:not([hidden]), #sheet-campaign-start:not([hidden])', { timeout: 15000 });
  const asked = await p.evaluate(() => !document.getElementById('sheet-campaign-start')!.hidden);
  if (asked) await p.evaluate(() => (document.getElementById('csa-resume') as HTMLButtonElement).click());
  await p.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 15000 });
  // The stage intro and the opening deal both finish before the board is live; a card tapped
  // before that would skip the intro instead of answering DRAW FIRST.
  await p.waitForFunction(() => {
    const l = (window as any).__severgrow?.lesson?.();
    return !l || (!l.stage && l.handSettled);
  }, undefined, { timeout: 15000 });
  await p.waitForTimeout(300);
};

/**
 * Watch the very first light: it may only appear once the opening hand has stopped moving. The
 * observer runs from before the level starts, so it sees the stage intro and the deal too.
 */
const installDealAudit = (p: Page) => p.evaluate(`(() => {
  const g = window.__severgrow;
  const audit = window.__dealAudit = { beatBeforeSettled: false, firstAfterSettled: false, stageSeen: false };
  let stop = false;
  window.__dealAuditStop = () => { stop = true; };
  const tick = () => {
    const l = g && g.lesson && g.lesson();
    if (l) {
      if (l.stage) audit.stageSeen = true;
      if (l.beat && !l.handSettled) audit.beatBeforeSettled = true;
      if (l.beat && l.handSettled) audit.firstAfterSettled = true;
    }
    if (!stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`);
const checkDealAudit = async (p: Page, level: number, expectLight: boolean) => {
  const audit = await p.evaluate(`(() => { window.__dealAuditStop && window.__dealAuditStop(); return window.__dealAudit; })()`) as
    { beatBeforeSettled: boolean; firstAfterSettled: boolean; stageSeen: boolean } | null;
  if (expectLight) check(!!audit && audit.firstAfterSettled, `L${level}: first light appears after the deal settles`);
  check(!!audit && !audit.beatBeforeSettled, `L${level}: no light while the hand is still moving`);
  check(!!audit && audit.stageSeen, `L${level}: stage intro came first`);
};

/** The centre of the thing a lit beat points at (a real element on screen), or null. */
// Page code as a plain string: the test runner's name helpers do not exist inside the page.
const LIT_POINTS = `(l) => {
  function centre(el) {
    if (!el) return null;
    var box = (el.querySelector(':scope > path.hex') || el).getBoundingClientRect();
    return box.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
  }
  function hex(k) { return centre(document.querySelector('#board .hex-cell[data-key="' + k + '"]')); }
  function card(id) { return centre(document.querySelector('#hand .card[data-card="' + id + '"]')); }
  switch (l.t) {
    case 'hex': return [hex(l.key)];
    case 'hexes': return l.keys.map(hex);
    case 'card': return [card(l.id)];
    case 'cards': return [card(l.ids[0])];
    case 'deck': return [centre(document.querySelector('#deck .pile-card') || document.getElementById('deck'))];
    case 'discard': return [centre(document.querySelector('#discard .pile-card') || document.getElementById('discard'))];
    case 'end': return [centre(document.getElementById('smart-context'))];
    case 'bloom': return [centre(document.getElementById('smart-bloom-button'))];
    default: return [];
  }
}`;
const litPoints = (p: Page, lit: Lit) =>
  p.evaluate(`(${LIT_POINTS})(${JSON.stringify(lit)})`) as Promise<({ x: number; y: number } | null)[]>;

/** A tap somewhere neutral on the map (an explanation moves on with a tap anywhere). */
const tapAnywhere = async (p: Page) => {
  const box = await p.evaluate(() => { const r = document.getElementById('board-wrap')!.getBoundingClientRect(); return { x: r.left + 12, y: r.top + r.height * 0.5 }; });
  await p.mouse.click(box.x, box.y);
};

/**
 * Player (c): ignores the words, taps only the lit thing (and anywhere on an explanation). Counts
 * every answer the game gives (a wrong tap). Returns when the level is over.
 */
const tapOnlyTheLight = async (p: Page, level: number) => {
  let wrong = 0; let taps = 0; let still = 0; let last = '';
  const t0 = Date.now();
  for (let guard = 0; Date.now() - t0 < 360000; guard++) {
    const s = await hook<any>(p, 'state');
    if (!s) throw new Error('no state');
    if (s.phase === 'GAME_OVER') return { wrong, taps, ms: Date.now() - t0, winner: s.result?.winner, reason: s.result?.reason, turns: s.turnNumber };
    const busy = await p.evaluate(() => (window as any).__severgrow.busy());
    if (s.actor !== 0 || busy) { await p.waitForTimeout(120); continue; }
    // The install invitation may follow a closed finish card (from level 4): a person closes it.
    await dismissInstall(p);
    const lesson = await hook<{ beat: Beat | null; answer: string; idle: boolean; stage: boolean; handSettled: boolean } | null>(p, 'lesson');
    if (!lesson) throw new Error(`L${level}: no lesson on screen`);
    const pos = `${s.turnNumber}|${s.phase}|${s.history?.length}|${lesson.beat?.id}|${JSON.stringify(lesson.beat?.lit)}`;
    still = pos === last ? still + 1 : 0;
    last = pos;
    // A silent tier deliberately shows nothing; the 6 s safety net brings a whisper. Wait past
    // that before calling it stuck.
    if (still > 70) {
      const pts = lesson.beat ? await litPoints(p, lesson.beat.lit) : [];
      const under = pts[0] ? await p.evaluate(`(() => { const e = document.elementFromPoint(${pts[0].x}, ${pts[0].y}); return e ? (e.tagName + '#' + e.id + '.' + (e.getAttribute('class') || '') + ' < ' + (e.closest('[id]') || {}).id) : 'none'; })()`) : 'no point';
      const sel = await hook(p, 'sel');
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/stuck-L${level}.png` });
      throw new Error(`L${level}: stuck at ${pos}; point ${JSON.stringify(pts[0])} is ${under}; sel ${JSON.stringify(sel)}; lesson ${JSON.stringify(lesson)}`);
    }
    const beat = lesson.beat;
    if (!beat) {
      // SILENT is a real state: the light deliberately says nothing. A player who already knows
      // the move makes it; the test does the same rather than waiting out the 6 s safety net.
      if (lesson.stage || !lesson.handSettled) { await p.waitForTimeout(120); continue; }
      const move = await hook<any>(p, 'lessonMove');
      if (move) {
        const ok = await p.evaluate((a) => (window as any).__severgrow.playFor(a, 0), move);
        if (ok) { taps++; await idle(p); continue; }
      }
      await p.waitForTimeout(250);
      continue;
    }
    if (beat.explain) { await tapAnywhere(p); taps++; await p.waitForTimeout(250); continue; }
    // A power hello is information, not a target. It fades by itself; then the ordinary move.
    if ((beat as { hello?: string }).hello) { await p.waitForTimeout(2800); continue; }
    const points = (await litPoints(p, beat.lit)).filter((x): x is { x: number; y: number } => !!x);
    if (!points.length) { await p.waitForTimeout(200); continue; }
    for (const pt of points) {
      const seq = (await hook<{ answers: number } | null>(p, 'lesson'))?.answers ?? 0;
      await p.mouse.click(pt.x, pt.y);
      taps++;
      await p.waitForTimeout(140);
      const after = await hook<{ answer: string; answers: number } | null>(p, 'lesson');
      if (after && after.answers > seq) { wrong++; console.log(`     L${level} answer after a lit tap: ${after.answer} (${beat.id})`); break; }
    }
    await idle(p);
  }
  throw new Error(`L${level}: never finished`);
};

/** With hints off there is no light: play the page's legal moves (the lesson's own suggestion). */
const tapOnlyTheLightHintsOff = async (p: Page, level: number) => {
  const t0 = Date.now();
  for (; Date.now() - t0 < 240000;) {
    const s = await hook<any>(p, 'state');
    if (s.phase === 'GAME_OVER') return { winner: s.result?.winner, reason: s.result?.reason };
    if (s.actor !== 0 || (await p.evaluate(() => (window as any).__severgrow.busy()))) { await p.waitForTimeout(120); continue; }
    const ok = await p.evaluate(`(() => { const g = window.__severgrow; const a = g.lessonMove(); return a ? g.playFor(a, 0) : false; })()`);
    if (!ok) throw new Error(`L${level}: hints off, no move`);
    await idle(p);
  }
  throw new Error(`L${level}: hints off, never finished`);
};

const results: string[] = [];
try {
  if (ONLY === 'all' || ONLY === 'run') {
    console.log('Levels 1-10 in a row, tapping only the light:');
    const { page, errors } = await newPage();
    await page.goto(URL3, { waitUntil: 'networkidle' });
    await installDealAudit(page);
    await openNextLevel(page);
    for (let level = 1; level <= 10; level++) {
      if (level > 1) {
        await page.waitForSelector('#gameover:not([hidden])', { timeout: 30000 });
        await dismissInstall(page);
        await installDealAudit(page);
        await page.evaluate(() => (document.getElementById('go-rematch') as HTMLButtonElement).click());
        await page.waitForFunction((n) => (window as any).__severgrow?.lesson?.()?.level === n, level, { timeout: 15000 });
      }
      await page.waitForFunction(() => {
        const l = (window as any).__severgrow?.lesson?.();
        return !!l && !l.stage && l.handSettled;
      }, undefined, { timeout: 15000 });
      if (SHOTS && (level === 1 || level === 5 || level === 10)) await page.screenshot({ path: `${SHOTS}/L${level}-first-frame.png` });
      const hexes = await page.evaluate(() => document.querySelectorAll('#board .hex-cell').length);
      check(hexes === 19, `L${level} plays on the 19-hex map (${hexes})`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/L${level}-open.png` });
      const r = await tapOnlyTheLight(page, level);
      // The observer saw the whole level: no hint may have appeared before the deal settled, and
      // the first one (where the level has one) came after it.
      await checkDealAudit(page, level, level !== 10);
      check(r.winner === 0, `L${level} won by ${r.reason} in ${r.turns} turns, ${r.taps} taps, ${r.wrong} wrong, ${(r.ms / 1000).toFixed(0)}s`);
      if (level === 1) {
        check(r.wrong === 0, 'L1: zero wrong taps');
        check(r.ms < 180000, 'L1: under 3 minutes');
      }
      await page.waitForSelector('#gameover:not([hidden])', { timeout: 30000 });
      const card = await page.evaluate(() => ({
        title: document.getElementById('go-title')?.textContent?.trim(),
        line: document.getElementById('go-learned')?.textContent?.trim(),
        seeds: !(document.getElementById('go-seeds')?.hidden ?? true) ? document.getElementById('go-seeds')?.textContent?.trim() : '',
      }));
      check(!!card.line, `L${level} finish card: ${card.title} / ${card.line}`);
      check(!card.seeds, `L${level} finish card has no Seeds line`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/L${level}-finish.png` });
      results.push(`L${level}: ${r.reason}, ${r.turns} turns, ${r.wrong} wrong taps`);
      const words = await page.evaluate(() => document.querySelectorAll('.tap-why').length);
      check(words === 0, `L${level}: no text drawn on the map`);
    }
    // Level 11 hands over to the 37-hex board, with no lesson.
    await dismissInstall(page);
    await page.evaluate(() => (document.getElementById('go-rematch') as HTMLButtonElement).click());
    await page.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 15000 });
    await page.waitForTimeout(900);
    const big = await page.evaluate(() => document.querySelectorAll('#board .hex-cell').length);
    check(big === 37, `level 11 is the 37-hex board (${big})`);
    check((await hook(page, 'lesson')) === null, 'level 11 has no lesson');
    // /3 kept its own storage: nothing written under the root's prefix.
    const keys = await page.evaluate(() => Object.keys(localStorage));
    check(keys.some((k) => k.startsWith('futa05-3:')), '/3 writes under its own prefix');
    check(!keys.some((k) => k.startsWith('futa05:')), '/3 never writes the root or /2 keys');
    assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
    await page.close();
  }
  if (ONLY === 'all' || ONLY === 'robust') {
    console.log('\nRobustness:');
    // --- Level 1, a player who ignores the words and taps anywhere ---
    {
      const { page, errors } = await newPage();
      await page.goto(URL3, { waitUntil: 'networkidle' });
      await openNextLevel(page);
      // Cards before drawing: every one is answered, none is played.
      const st0 = await hook<any>(page, 'state');
      // (the two explanations first: a tap anywhere, at a person's pace: a tap in an
      // explanation's first moments is deliberately ignored)
      for (let i = 0; i < 6 && (await hook<any>(page, 'lesson'))?.beat?.explain; i++) { await page.waitForTimeout(700); await tapAnywhere(page); await page.waitForTimeout(300); }
      const cardPt = await page.evaluate(`(() => { const r = document.querySelector('#hand .card').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`) as { x: number; y: number };
      await page.mouse.click(cardPt.x, cardPt.y);
      await page.waitForTimeout(150);
      const ans = (await hook<any>(page, 'lesson')).answer;
      check(ans === 'DRAW FIRST', `a card tapped before drawing: "${ans}"`);
      check((await hook<any>(page, 'state')).history.length === st0.history.length, 'and nothing was played');
      // Random taps all over the screen. Every tap on a game thing either does something or is answered.
      let silent = 0; let tries = 0;
      const rnd = (() => { let x = 12345; return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); })();
      const vp = page.viewportSize()!;
      for (let i = 0; i < 160; i++) {
        const s = await hook<any>(page, 'state');
        if (s.phase === 'GAME_OVER') break;
        if (s.actor !== 0 || (await page.evaluate(() => (window as any).__severgrow.busy()))) { await page.waitForTimeout(150); continue; }
        const x = 8 + rnd() * (vp.width - 16); const y = 60 + rnd() * (vp.height - 70);
        const kind = await page.evaluate(`(() => { const e = document.elementFromPoint(${x}, ${y}); if (!e) return 'other';
          if (e.closest('#hud, #hud-menu, #futasaku-glass, .sheet, #scrim, #gameover')) return 'chrome';
          if (e.closest('#hand [data-card]')) return 'card'; if (e.closest('#deck')) return 'deck'; if (e.closest('#discard')) return 'discard';
          if (e.closest('#board [data-key]')) return 'hex'; return 'other'; })()`) as string;
        if (kind === 'chrome') continue;
        const before = JSON.stringify([s.history.length, s.phase, await hook(page, 'sel'), (await hook<any>(page, 'lesson'))?.seen?.length]);
        await page.mouse.click(x, y);
        await page.waitForTimeout(160);
        const s2 = await hook<any>(page, 'state');
        const l2 = await hook<any>(page, 'lesson');
        const after = JSON.stringify([s2.history.length, s2.phase, await hook(page, 'sel'), l2?.seen?.length]);
        if (kind !== 'other') {
          tries++;
          if (before === after && !l2?.answer) { silent++; console.log(`     silent ${kind} tap at ${x.toFixed(0)},${y.toFixed(0)} (${l2?.beat?.id})`); }
        }
      }
      check(silent === 0, `random taps: ${tries} taps on game things, every one did something or was answered`);
      // Never stuck: the light still finishes the level from wherever the random taps left it.
      const r = await tapOnlyTheLight(page, 1);
      check(r.winner === 0, `after random taps, L1 still finishes and is won (${r.reason})`);
      check((await page.evaluate(() => document.querySelectorAll('.tap-why').length)) === 0, 'no text drawn on the map');
      assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
      await page.close();
    }
    // --- Every reason line fits in two lines in the real window, on the smallest phone ---
    {
      const { page } = await newPage(320, 568);
      await page.goto(URL3, { waitUntil: 'networkidle' });
      await openNextLevel(page);
      const shownAfter: Record<string, string> = { youGrewLine: 'You grew. ', pileLowLine: 'Pile almost empty. ' };
      const over: string[] = [];
      for (const [k, v] of Object.entries(LESSON)) {
        if (typeof v !== 'string' || !k.endsWith('Line')) continue;
        const text = (shownAfter[k] ?? '') + v;
        const n = await page.evaluate(`(() => { const el = document.querySelector('#futasaku-glass .glass-why'); el.style.minHeight = '0';
          el.textContent = ${JSON.stringify(text)}; const lh = parseFloat(getComputedStyle(el).lineHeight); return Math.round(el.getBoundingClientRect().height / lh); })()`) as number;
        if (n > 2) over.push(`${k} (${n} lines)`);
      }
      check(over.length === 0, `every reason line fits in two lines at 320 px${over.length ? `: ${over.join(', ')}` : ''}`);
      await page.close();
    }
    // --- Level 3: the same wrong hex again and again; a refresh in the middle; hints off ---
    {
      const { page, errors } = await newPage(360, 640);
      await page.goto(URL3, { waitUntil: 'networkidle' });
      // Levels 1-2 already cleared on this device (the progress record, as a player who did them).
      const done = CAMPAIGN_LEVELS.slice(0, 2).map((l) => l.id);
      await page.evaluate(`localStorage.setItem('severgrow.campaign.progress.v3', ${JSON.stringify(JSON.stringify({ version: 1, unlocked: 3, completed: done, best: {} }))})`);
      await page.reload({ waitUntil: 'networkidle' });
      await openNextLevel(page);
      const lv = (await hook<any>(page, 'lesson'))?.level;
      if (lv !== 3) console.log(`     (progress format differs: opened level ${lv}; robustness continues there)`);
      // Through the intro, draw, then tap the rock five times.
      const level = lv ?? 1;
      for (let i = 0; i < 6 && (await hook<any>(page, 'lesson'))?.beat?.explain; i++) { await page.waitForTimeout(700); await tapAnywhere(page); await page.waitForTimeout(300); }
      const deck = (await litPoints(page, { t: 'deck' }))[0]!;
      await page.mouse.click(deck.x, deck.y); await idle(page); await page.waitForTimeout(300);
      if (level === 3) {
        const rock = (await litPoints(page, { t: 'hex', key: '-1,0' }))[0]!;
        const answers = new Set<string>();
        const h0 = (await hook<any>(page, 'state')).history.length;
        for (let i = 0; i < 5; i++) { await page.mouse.click(rock.x, rock.y); await page.waitForTimeout(120); answers.add((await hook<any>(page, 'lesson')).answer); }
        check(answers.size === 1 && answers.has('ROCK BLOCKS THIS'), `the rock tapped 5 times: always "${[...answers].join('/')}"`);
        check((await hook<any>(page, 'state')).history.length === h0, 'and nothing was played');
      }
      // Refresh in the middle of the level: the same position, the explanations stay read.
      const before = await hook<any>(page, 'state');
      const seen = (await hook<any>(page, 'lesson')).seen;
      await page.reload({ waitUntil: 'networkidle' });
      await openNextLevel(page);
      const after = await hook<any>(page, 'state');
      check(after.history.length === before.history.length && after.phase === before.phase, `refresh mid-level resumes the same position (${after.phase}, ${after.history.length} events)`);
      check(JSON.stringify((await hook<any>(page, 'lesson')).seen) === JSON.stringify(seen), 'and the explanations already read stay read');
      // Hints off: the glass and the light step away; a wrong tap is answered on the LED instead.
      await page.evaluate(() => localStorage.setItem('severgrow-guide', 'off'));
      await page.reload({ waitUntil: 'networkidle' });
      await openNextLevel(page);
      await page.waitForTimeout(500);
      const glass = await page.evaluate(() => { const g = document.getElementById('futasaku-glass'); return !!g && !g.hidden; });
      check(!glass, 'hints off: no glass window');
      const r = await tapOnlyTheLightHintsOff(page, level);
      check(r.winner === 0, `hints off: the level still plays to a win (${r.reason})`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/hints-off-finish.png` });
      assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
      await page.close();
    }
  }
  if (ONLY === 'all' || ONLY === 'tiers') {
    console.log('\nTier fade on the real window:');
    const openWith = async (counts: Record<string, number>) => {
      const { page, errors } = await newPage(390, 844);
      await page.goto(URL3, { waitUntil: 'networkidle' });
      await page.evaluate((c) => {
        localStorage.clear();
        localStorage.setItem('severgrow.campaign.progress.v3', JSON.stringify({ version: 1, unlocked: 1, completed: [], best: {} }));
        localStorage.setItem('severgrow.lesson.meta.v1', JSON.stringify({ level: 1, version: 2, seen: ['1:intro:tree', '1:intro:their-home'] }));
        localStorage.setItem('severgrow.lesson.mastery.v1', JSON.stringify({ version: 2, counts: c, spotlights: {}, hellos: [] }));
      }, counts);
      await page.reload({ waitUntil: 'networkidle' });
      await openNextLevel(page);
      // A fresh level replays its two opening explanations; move past them to the first Draw.
      for (let i = 0; i < 4; i++) {
        const b = (await hook<any>(page, 'lesson'))?.beat;
        if (!b?.explain) break;
        await page.waitForTimeout(700);
        await tapAnywhere(page);
        await page.waitForTimeout(220);
      }
      await page.waitForTimeout(350);
      const info = await page.evaluate(() => {
        const f = document.getElementById('tutorial-focus');
        const dim = f?.querySelector('.focus-dim');
        return {
          tier: f?.getAttribute('data-tier') ?? '',
          hidden: !!f?.hasAttribute('hidden'),
          fill: dim ? getComputedStyle(dim).fill : '',
          lesson: (window as any).__severgrow?.lesson?.() ?? null,
        };
      });
      return { page, errors, info };
    };

    {
      const { page, errors, info } = await openWith({});
      check(info.tier === 'spotlight', `L1 first Draw is SPOTLIGHT (${info.tier})`);
      check(!info.hidden && /0\.45\)/.test(info.fill), `SPOTLIGHT dim is the strong L1 dim (${info.fill})`);
      check(info.lesson?.beat?.title === 'TAP THE DRAW PILE', 'and it speaks fully');
      assert.deepEqual(errors, []);
      await page.close();
    }
    {
      const { page, errors, info } = await openWith({ draw: 1 });
      check(info.tier === 'guide', `second Draw is GUIDE (${info.tier})`);
      check(/0\.15\)/.test(info.fill), `GUIDE dim is light (${info.fill})`);
      check(!!info.lesson?.beat?.title && !info.lesson?.beat?.line, 'and it says one short line');
      assert.deepEqual(errors, []);
      await page.close();
    }
    {
      const { page, errors, info } = await openWith({ draw: 2 });
      check(info.tier === 'whisper', `third Draw is WHISPER (${info.tier})`);
      check(/rgba\(0, 0, 0, 0\)/.test(info.fill), `WHISPER has no dim (${info.fill})`);
      check(info.lesson?.beat?.title === 'DRAW' && !info.lesson?.beat?.line, 'and only one word');
      assert.deepEqual(errors, []);
      await page.close();
    }
    {
      const { page, errors, info } = await openWith({ draw: 9 });
      check(info.lesson?.beat == null, 'a well-practised Draw shows no light');
      check(info.lesson?.mission === 'Draw, Grow, Throw.', 'the mission still says what the level is for');
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  console.log('\n' + results.join('\n'));
} finally {
  await browser.close();
  server.close();
}
