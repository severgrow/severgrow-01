// LIVE 0.6 certification against https://www.futasaku.com/ — run with tsx, not committed.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { SMALL_HOMES } from '../src/lessons/authored.js';
import { LESSON } from '../../src/strings.js';

const LIVE = 'https://www.futasaku.com/';
const SHOTS = '/Users/patryk/sg-polish2/docs/screens/0.6';
mkdirSync(SHOTS, { recursive: true });

let fails = 0, passes = 0;
const check = (name: string, ok: boolean, note: string | number = '') => {
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note !== '' ? `  (${note})` : ''}`);
};

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox'],
});
const errors: string[] = [];
const newPage = async (w: number, h: number) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 800, hasTouch: w < 800, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${w}x${h}: ${e.message}`));
  await page.addInitScript(() => {
    (window as any).__name = (fn: unknown) => fn;
    localStorage.setItem('futa05:severgrow.settings.v1', JSON.stringify({ sound: false, music: false }));
  });
  return { page, ctx };
};

const MENU_MEASURE = `(() => {
  const menu = document.getElementById('menu');
  const logo = document.getElementById('logo');
  const wordmark = document.querySelector('#menu .title');
  const beta = document.getElementById('menu-beta');
  const foot = document.getElementById('menu-foot');
  const vis = (el) => !!el && el.offsetParent !== null && el.getBoundingClientRect().height > 0;
  const b = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1), right:+r.right.toFixed(1), bottom:+r.bottom.toFixed(1) }; };
  const all = [...document.querySelectorAll('#menu .menu-buttons .btn')].filter(vis)
    .sort((a,c)=>a.getBoundingClientRect().y-c.getBoundingClientRect().y || a.getBoundingClientRect().x-c.getBoundingClientRect().x);
  const gaps = [];
  for (let i = 1; i < all.length; i++) {
    const p = all[i-1].getBoundingClientRect(), c = all[i].getBoundingClientRect();
    if (Math.abs(c.y - p.y) < 1) continue;
    gaps.push(+(c.y - p.bottom).toFixed(1));
  }
  const login = document.getElementById('menu-login');
  const settings = document.getElementById('menu-settings');
  return {
    docScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    menuScroll: Math.max(0, menu.scrollHeight - menu.clientHeight),
    overflowY: getComputedStyle(menu).overflowY,
    logo: b(logo), wordmark: b(wordmark), beta: b(vis(beta) ? beta : null), foot: b(foot),
    login: vis(login) ? b(login) : null, loginText: (login?.textContent || '').trim(),
    settings: vis(settings) ? b(settings) : null,
    keys: [...document.querySelectorAll('#menu .menu-buttons .btn')].filter(vis).map(k => ({ id: k.id, h: +k.getBoundingClientRect().height.toFixed(1) })),
    gaps,
    order: [...document.querySelectorAll('#menu button')].filter(vis).map(x => x.id),
  };
})()`;

for (const [w, h] of [[320, 568], [360, 640], [390, 844]] as const) {
  const tag = `${w}x${h}`;
  const { page, ctx } = await newPage(w, h);
  try {
    await page.goto(LIVE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#menu:not([hidden]) .menu-inner', { timeout: 40000 });
    await page.waitForFunction(() => document.body.classList.contains('acct-on'), undefined, { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    const m = (await page.evaluate(MENU_MEASURE)) as any;
    check(`${tag}: no page scroll`, m.docScroll <= 1, `${m.docScroll}px`);
    check(`${tag}: the menu cannot scroll`, m.overflowY === 'hidden' && m.menuScroll <= 1, `${m.overflowY}/${m.menuScroll}px`);
    check(`${tag}: logo visible`, !!m.logo && m.logo.w > 40 && m.logo.y >= -0.5 && m.logo.bottom <= h + 0.5, JSON.stringify(m.logo));
    check(`${tag}: wordmark inside`, !!m.wordmark && m.wordmark.y >= -0.5 && m.wordmark.bottom <= h + 0.5);
    check(`${tag}: every key is 50px`, m.keys.length >= 3 && m.keys.every((k: any) => Math.abs(k.h - 50) <= 0.5), m.keys.map((k: any) => `${k.id}=${k.h}`).join(','));
    check(`${tag}: equal key spacing`, m.gaps.length > 1 && Math.max(...m.gaps) - Math.min(...m.gaps) <= 1, m.gaps.join('/'));
    check(`${tag}: LOG IN is left of Settings on one row`, !!m.login && !!m.settings && m.login.right <= m.settings.x + 0.5 && Math.abs(m.login.y - m.settings.y) <= 0.5,
      m.login ? `login right ${m.login.right} / settings left ${m.settings.x} / y ${m.login.y}|${m.settings.y}` : 'LOG IN hidden');
    check(`${tag}: LOG IN reads LOG IN`, m.loginText === 'LOG IN', m.loginText);
    check(`${tag}: beta line under the wordmark`, !!m.beta && !!m.wordmark && m.beta.y >= m.wordmark.bottom - 0.5 && m.beta.bottom <= h + 0.5,
      m.beta ? `${m.beta.y} vs ${m.wordmark.bottom}` : 'hidden');
    console.log(`   entries: ${m.order.join(' -> ')}`);
    if (w === 360 || w === 390) await page.screenshot({ path: `${SHOTS}/menu-${tag}.png` });
  } finally { await ctx.close(); }
}

// ---- the game: pause, the lesson's promises, the sign
const { page, ctx } = await newPage(390, 844);
const idle = () => page.waitForFunction(() => { const g = (window as any).__severgrow; return !!g && !g.busy(); }, undefined, { timeout: 30000 });
const lessonOf = () => page.evaluate(() => { const l = (window as any).__severgrow.lesson(); return l && l.beat ? { id: l.beat.id, lit: l.beat.lit, say: l.beat.say ?? null } : null; }) as Promise<any>;
const displayText = () => page.evaluate(() => document.getElementById('smart-led-text')?.textContent ?? '');
const boxText = () => page.evaluate(() => document.querySelector('#lesson-plate .lesson-copy')?.textContent ?? '');
const LIT_POINTS = `(l, homes) => {
  const centre = (el) => { if (!el) return null; var box = (el.querySelector(':scope > path.hex') || el).getBoundingClientRect(); return box.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null; };
  const hex = (k) => centre(document.querySelector('#board .hex-cell[data-key="' + k + '"]'));
  const card = (id) => centre(document.querySelector('#hand .card[data-card="' + id + '"]'));
  switch (l.t) {
    case 'hex': return [hex(l.key)];
    case 'hexes': return l.keys.map(hex);
    case 'home': return [hex(homes[l.player === 1 ? 1 : 0])];
    case 'rock': return [hex(l.key)];
    case 'card': return [card(l.id)];
    case 'cards': return [card(l.ids[0])];
    case 'deck': case 'deckCount': return [centre(document.querySelector('#deck .pile-card') || document.getElementById('deck'))];
    case 'score': return [centre(document.getElementById('smart-led'))];
    case 'discard': return [centre(document.querySelector('#discard .pile-card') || document.getElementById('discard'))];
    case 'end': return [centre(document.getElementById('smart-context'))];
    case 'bloom': return [centre(document.getElementById('smart-bloom-button'))];
    default: return [];
  }
}`;
const litPoints = (lit: any) => page.evaluate(`(${LIT_POINTS})(${JSON.stringify(lit)}, ${JSON.stringify(SMALL_HOMES)})`) as Promise<({ x: number; y: number } | null)[]>;
const LIT_SELECTORS = `(l, homes) => {
  const hex = (k) => '#board .hex-cell[data-key="' + k + '"]';
  const card = (id) => '#hand .card[data-card="' + id + '"]';
  switch (l.t) {
    case 'hex': return [hex(l.key)];
    case 'hexes': return l.keys.map(hex);
    case 'home': return [hex(homes[l.player === 1 ? 1 : 0])];
    case 'rock': return [hex(l.key)];
    case 'card': return [card(l.id)];
    case 'cards': return l.ids.map(card);
    case 'deck': return ['#deck'];
    case 'deckCount': return ['#deck .pile-card', '#deck-count'];
    case 'score': return ['#smart-led'];
    case 'discard': return ['#discard'];
    case 'end': return ['#smart-context'];
    case 'bloom': return ['#smart-bloom-button'];
    default: return [];
  }
}`;
const tapAt = async (pt: { x: number; y: number }) => { await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(380); };

try {
  await page.goto(LIVE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden]) .menu-inner', { timeout: 40000 });
  // The menu's click handlers arrive with late dynamic imports, so a single click can land before
  // they exist. PLAY is a TOGGLE, so never click it blind twice: because closing is as easy as
  // opening, the loop checks the state first and only presses when the submenu is actually shut.
  for (let attempt = 0; attempt < 6; attempt++) {
    const open = await page.evaluate(() => {
      const menu = document.getElementById('play-menu');
      return !!menu && !menu.hidden;
    });
    if (open) break;
    await page.evaluate(() => document.getElementById('menu-play')!.click());
    await page.waitForTimeout(900);
  }
  await page.waitForSelector('#menu-campaign:not([hidden])', { timeout: 20000 });
  await page.evaluate(() => document.getElementById('menu-campaign')!.click());
  await page.waitForSelector('#game:not([hidden]), #sheet-campaign-start:not([hidden])', { timeout: 20000 });
  if (await page.evaluate(() => !document.getElementById('sheet-campaign-start')!.hidden)) {
    await page.evaluate(() => document.getElementById('csa-resume')!.click());
  }
  await page.waitForFunction(() => !!((window as any).__severgrow?.state?.()), undefined, { timeout: 20000 });
  await page.waitForFunction(() => { const l = (window as any).__severgrow?.lesson?.(); return !l || (!l.stage && l.handSettled); }, undefined, { timeout: 20000 });
  await page.waitForTimeout(600);
  console.log(`   entered: ${(await lessonOf())?.id ?? 'no beat'}`);

  // --- pause panel: ONE tap on the menu key
  const tPause = Date.now();
  await page.evaluate(() => document.getElementById('hud-menu')!.click());
  await page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 5000 });
  const pause = (await page.evaluate(() => {
    const sheet = document.getElementById('sheet-menu')!;
    const r = sheet.getBoundingClientRect();
    const s = document.getElementById('gm-settings')!.getBoundingClientRect();
    return {
      overflow: Math.max(0, Math.round(sheet.scrollHeight - sheet.clientHeight)),
      docScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      settings: { right: +s.right.toFixed(1), top: +s.top.toFixed(1), h: +s.height.toFixed(1) },
      inCorner: s.right > r.left + r.width * 0.6 && s.top > r.top + r.height * 0.55,
      title: document.getElementById('gm-title')!.textContent?.trim() ?? '',
    };
  })) as any;
  check('pause: opens on one tap', true, `${pause.title}, ${Date.now() - tPause}ms`);
  check('pause: Settings sits in the panel corner', pause.inCorner, JSON.stringify(pause.settings));
  check('pause: the panel does not scroll', pause.overflow === 0, `${pause.overflow}px`);
  check('pause: the page does not scroll', pause.docScroll <= 1, `${pause.docScroll}px`);
  await page.screenshot({ path: `${SHOTS}/pause-390x844.png` });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#sheet-menu[hidden]', { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(500);

  // --- the caption
  const plate = (await page.evaluate(() => {
    const p = document.getElementById('lesson-plate');
    if (!p || p.hidden) return null;
    const s = getComputedStyle(p);
    return { border: s.borderTopWidth, outline: `${s.outlineStyle} ${s.outlineWidth}`, shadow: s.boxShadow, pointer: s.pointerEvents, buttons: p.querySelectorAll('button,[role="button"]').length };
  })) as any;
  check('lesson: the caption is present', !!plate, JSON.stringify(plate));
  check('lesson: the caption has no border', !!plate && Number.parseFloat(plate.border) === 0, plate?.border);
  check('lesson: the caption has no buttons', !!plate && plate.buttons === 0, plate?.buttons);
  check('lesson: the caption lets taps through', !!plate && plate.pointer === 'none', plate?.pointer);
  const b1 = await lessonOf();
  const spoken1 = (await displayText()).trim();
  check('lesson: the display speaks the action (<=3 words)', spoken1.split(/\s+/).filter(Boolean).length <= 3, `"${spoken1}"`);
  await page.screenshot({ path: `${SHOTS}/lesson-390x844.png` });

  // Walk the intro to the FIRST-DRAW beat: that is where the owner's single-tap rule lives (a tap
  // on the lit pile both closes the sentence and draws).
  let drawBeat: any = null;
  for (let i = 0; i < 30 && !drawBeat; i++) {
    const st = (await page.evaluate(() => ({ phase: (window as any).__severgrow.state().phase, actor: (window as any).__severgrow.state().actor, busy: (window as any).__severgrow.busy() }))) as any;
    if (st.phase === 'GAME_OVER') break;
    const beat = await lessonOf();
    if (beat?.lit?.t === 'deck') { drawBeat = beat; break; }
    if (!beat || st.actor !== 0 || st.busy) { await page.waitForTimeout(150); continue; }
    const p = (await litPoints(beat.lit)).filter((x): x is { x: number; y: number } => !!x);
    if (p.length) await tapAt(p[0]!); else await page.mouse.click(180, 300);
    await idle();
    await page.waitForTimeout(250);
  }
  check('lesson: reached the first-draw beat', !!drawBeat, drawBeat?.id ?? 'never');

  // the pulse: the lit pile carries the lesson's endless breath while the beat waits
  const pulse = (await page.evaluate(`(() => {
    const l = window.__severgrow.lesson(); if (!l || !l.beat) return { n: 0, on: 'no beat' };
    const sels = (${LIT_SELECTORS})(${JSON.stringify(drawBeat?.lit ?? b1.lit)}, ${JSON.stringify(SMALL_HOMES)});
    const els = sels.map((s) => document.querySelector(s)).filter(Boolean);
    const anims = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations === Infinity);
    const onLit = anims.filter((a) => els.some((e) => e && (e === a.effect.target || e.contains(a.effect.target))));
    const board = anims.filter((a) => a.effect.target && document.getElementById('board') && document.getElementById('board').contains(a.effect.target));
    return { n: onLit.length + board.length, ids: anims.map((a) => a.id || a.animationName || 'css'), on: sels.join(',') };
  })()`)) as any;
  check('lesson: the lit target keeps pulsing while idle', pulse.n > 0, `${pulse.n} endless ${JSON.stringify(pulse.ids)} on ${pulse.on}`);

  // ONE tap on the lit pile: it closes the sentence AND draws (the owner's single-tap rule)
  const captionBefore = await boxText();
  const before = await page.evaluate(() => (window as any).__severgrow.state().history.length);
  const pts = (await litPoints(drawBeat?.lit ?? b1.lit)).filter((x): x is { x: number; y: number } => !!x);
  if (pts.length) await tapAt(pts[0]!);
  await idle();
  const after = await page.evaluate(() => (window as any).__severgrow.state().history.length);
  check('lesson: one tap on the lit target acts', after > before, `${before} -> ${after} (sentence was "${captionBefore}")`);

  // walk level 1 to the grow moment
  let grew: any = null;
  for (let i = 0; i < 60; i++) {
    const st = (await page.evaluate(() => ({ phase: (window as any).__severgrow.state().phase, actor: (window as any).__severgrow.state().actor }))) as any;
    if (st.phase === 'GAME_OVER') break;
    const beat = await lessonOf();
    if (beat?.id === '1:grew') { grew = beat; break; }
    if (!beat || st.actor !== 0 || await page.evaluate(() => (window as any).__severgrow.busy())) { await page.waitForTimeout(150); continue; }
    const p = (await litPoints(beat.lit)).filter((x): x is { x: number; y: number } => !!x);
    if (!p.length) { await page.waitForTimeout(150); continue; }
    await tapAt(p[0]!);
    await idle();
  }
  if (grew) {
    const placedKey = grew.lit.t === 'hex' ? grew.lit.key : '';
    check('lesson: the grow sentence lights a hex, not the score', grew.lit.t === 'hex', grew.lit.t);
    const rank = (await page.evaluate(`document.querySelector('#board .tile[data-key="${placedKey}"] .tile-num')?.textContent?.trim() ?? ''`)) as string;
    check('lesson: the lit hex is the tile just placed, and it shows a rank', !!placedKey && /^\d+$/.test(rank), `${placedKey} rank ${rank}`);
    check('lesson: the grow sentence is the caption', (await boxText()) === LESSON.youGrewLine, await boxText());
  } else {
    check('lesson: reached the grow moment', false, 'never reached 1:grew');
  }

  // --- the sign: wait for the resting score face, then read it
  await page.waitForFunction(() => /^\d+:\d+$/.test(document.getElementById('smart-led-text')?.textContent ?? ''), undefined, { timeout: 20000 }).catch(() => undefined);
  const sign = (await page.evaluate(() => {
    const bloom = document.getElementById('smart-led-bloom')!;
    const led = document.getElementById('smart-led')!;
    const cells = document.getElementById('smart-led-cells') as HTMLCanvasElement;
    const ctx = cells?.getContext('2d');
    let left = '', right = '';
    if (ctx) {
      const data = ctx.getImageData(0, 0, cells.width, cells.height).data;
      const mid = Math.floor(cells.width / 2);
      const main = (from: number, to: number) => {
        const m = new Map<string, number>();
        for (let y = 0; y < cells.height; y++) for (let x = from; x < to; x++) {
          const i = (y * cells.width + x) * 4;
          if (data[i + 3]! < 250) continue;
          const k = `${data[i]},${data[i + 1]},${data[i + 2]}`;
          m.set(k, (m.get(k) ?? 0) + 1);
        }
        return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      };
      left = main(0, mid); right = main(mid, cells.width);
    }
    const b = bloom.getBoundingClientRect(), l = led.getBoundingClientRect();
    return {
      opacity: Number(getComputedStyle(bloom).opacity),
      varOp: getComputedStyle(document.documentElement).getPropertyValue('--light-bloom-op').trim(),
      above: +(l.bottom - b.top).toFixed(1), below: +(b.bottom - l.bottom).toFixed(1),
      mode: led.getAttribute('data-mode'), text: document.getElementById('smart-led-text')!.textContent ?? '',
      left, right,
    };
  })) as any;
  check('sign: the bloom rests at the new 0.207', Math.abs(sign.opacity - 0.207) <= 0.006, `${sign.opacity}`);
  check('sign: the CSS var agrees', Math.abs(Number.parseFloat(sign.varOp) - 0.207) <= 0.006, sign.varOp);
  check('sign: the bloom reaches further below than above', sign.above > sign.below * 1.2, `above ${sign.above} below ${sign.below}`);
  const near = (ink: string, r: number, g: number, b: number) => { const [ir, ig, ib] = ink.split(',').map(Number); return Math.abs(ir! - r) < 70 && Math.abs(ig! - g) < 70 && Math.abs(ib! - b) < 70; };
  check('sign: your digits are green', near(sign.left, 169, 216, 134), sign.left);
  check('sign: their digits are red', near(sign.right, 228, 112, 94), sign.right);
  check('sign: the resting face is the score', sign.mode === 'score' && /^\d+:\d+$/.test(sign.text), `${sign.mode} "${sign.text}"`);

  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/lesson-360x640.png` });
} catch (error) {
  check('the live walk completed without throwing', false, String((error as Error)?.message ?? error).slice(0, 300));
} finally {
  check('no page errors on the live site', errors.length === 0, errors.join(' | '));
  await ctx.close();
  await browser.close();
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}
