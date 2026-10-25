// THE RITUAL FROM LEVEL 10 ON — in the real product page.
//
// Owner, 2026-10-24: "from level 10 onwards - the ritual card for picking who starts the game
// should be visible and use exactly the same system as other games - on level 10 show a lesson
// window message saying 'You are ready now for your first game of Futasaku. Good luck!'"
//
// What this proves, in the browser and through the real menu:
//   * a campaign LEVEL 10 starts with the same ritual as a practice match (deck, reveal, result),
//     and the cards agree with the seat the engine already chose;
//   * the send-off appears afterwards, in the lesson's own info box, word for word;
//   * dismissal is one tap, and the board is playable straight after it;
//   * LEVEL 3 (a hand-held lesson) still has NO ritual at all — the control.
//
// Build CHANNEL=futa04 first. Then:
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     node --import tsx web/e2e/ritual-from-level-10.ts
// Screenshots go to /tmp/ritual10/.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { closePreview, servePreview } from './helpers/preview-port.js';

const CHROME = process.env.PW_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT_DIR = '/tmp/ritual10';
const SENTENCE = 'You are ready now for your first game of Futasaku. Good luck!';

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

type StarterState = { startingPlayer?: number; turnPlayer: number; actor: number; phase: string; history?: unknown[] };
type LessonNow = { level: number; beat: { id: string; line?: string; lit: { t: string } } | null; stage: boolean; handSettled: boolean };

/** The preview serves on 127.0.0.1 with no /futa0.4/ path, so futa04's storage prefix is `main2:`
 *  (web/src/channel.ts). These are the page's own keys, written before it boots. */
const settings = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    sound: false,
    music: false,
    coach: false,
    speed: 'normal',
    reduceMotion: false,
    eyeCandy: false,
    vibration: false,
    largeText: false,
    weakSpots: false,
    weakPulse: false,
    placementList: false,
    autoSkip: false,
    bloomHints: false,
    ...over,
  });

/** A campaign record whose first `completed` levels are won, so PLAY opens level `completed + 1`. */
const progress = (completed: number): string =>
  JSON.stringify({
    version: 1,
    unlocked: completed + 1,
    completed: Array.from({ length: completed }, (_, i) => `c1-${String(i + 1).padStart(2, '0')}`),
    best: {},
  });

const served = await servePreview(0, { logLevel: 'error' });

/** The prefix `web/src/channel.ts` prepends to every key on THIS build.
 *
 *  The app patches `Storage.prototype` (channel.ts), so the page's own `localStorage.setItem('x')`
 *  lands on `<prefix>x`. Writing one sentinel and reading back the key that was actually stored
 *  derives the prefix from the app itself instead of keeping a second copy of the channel table in
 *  the test. A futa04 build opened off the deployed paths reads `main2:`; a futa05 build reads
 *  `futa05:`. Seeding the wrong one is not a loud error — the campaign simply starts FRESH, so this
 *  suite used to open level 1 while believing it was level 10 and assert the ritual against a level
 *  that has no ritual at all.
 */
const PROBE_KEY = 'severgrow.e2e.prefix-probe';

const detectStoragePrefix = async (browser: Browser): Promise<string> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(served.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => !!(window as unknown as { __severgrow?: unknown }).__severgrow,
      undefined,
      { timeout: 20_000 },
    );
    const found = await page.evaluate((key) => {
      localStorage.setItem(key, '1');
      const raw = Object.keys(localStorage).find((k) => k.endsWith(key));
      localStorage.removeItem(key);
      return raw ? raw.slice(0, raw.length - key.length) : null;
    }, PROBE_KEY);
    if (found === null) throw new Error('e2e: the page installed no storage prefix; cannot seed a campaign');
    return found;
  } finally {
    await context.close();
  }
};

/** Filled once the browser is up, before any page is seeded. */
let storagePrefix = '';

const open = async (
  browser: Browser,
  viewport: { width: number; height: number },
  completed: number,
  over: Record<string, unknown> = {},
): Promise<{ page: Page; errors: string[] }> => {
  const touch = viewport.width < 700;
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
  await context.addInitScript(({ s, p, prefix }) => {
    localStorage.setItem(`${prefix}severgrow.settings.v1`, s);
    localStorage.setItem(`${prefix}severgrow.campaign.progress.v3`, p);
    const win = window as unknown as {
      __name?: (f: unknown) => unknown;
      __ritualPhases: { phase: string; t: number }[];
      __ritualTimes: { visibleAt: number; hiddenAt: number };
    };
    // Vite's bundle helper is referenced by class fields; an init-script page must define it.
    win.__name = (f) => f;
    win.__ritualPhases = [];
    win.__ritualTimes = { visibleAt: 0, hiddenAt: 0 };
    let last = '';
    setInterval(() => {
      const el = document.getElementById('starter-lottery');
      const phase = el?.dataset.phase ?? '';
      if (phase && phase !== last) {
        last = phase;
        win.__ritualPhases.push({ phase, t: performance.now() });
      }
      if (!phase) last = '';
    }, 8);
    // The ritual's own on-screen window, timed at the DOM event (Node's round trips are not it).
    const watch = (): void => {
      const el = document.getElementById('starter-lottery');
      if (!el) { setTimeout(watch, 20); return; }
      new MutationObserver(() => {
        const times = win.__ritualTimes;
        if (!el.hidden) {
          if (times.visibleAt === 0 || times.hiddenAt !== 0) { times.visibleAt = performance.now(); times.hiddenAt = 0; }
        } else if (times.visibleAt !== 0 && times.hiddenAt === 0) {
          times.hiddenAt = performance.now();
        }
      }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    };
    watch();
  }, { s: settings(over), p: progress(completed), prefix: storagePrefix });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource/i.test(text)) return; // the dummy online endpoint is unreachable by design
    errors.push(text);
  });
  await page.goto(served.url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu-play:not([hidden])', { timeout: 20_000 });
  return { page, errors };
};

const state = (page: Page): Promise<StarterState | null> =>
  page.evaluate(() => (window as unknown as { __severgrow: { state: () => StarterState | null } }).__severgrow.state());

const lesson = (page: Page): Promise<LessonNow | null> =>
  page.evaluate(() => (window as unknown as { __severgrow: { lesson: () => LessonNow | null } }).__severgrow.lesson());

const plate = (page: Page): Promise<{ shown: boolean; text: string }> =>
  page.evaluate(() => {
    const el = document.getElementById('lesson-plate');
    return { shown: !!el && !el.hidden, text: el?.querySelector('.lesson-copy')?.textContent?.trim() ?? '' };
  });

const shot = async (page: Page, name: string): Promise<string> => {
  mkdirSync(SHOT_DIR, { recursive: true });
  const path = `${SHOT_DIR}/${name}.png`;
  await page.screenshot({ path });
  return path;
};

const dismissInstall = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    for (const id of ['install-close', 'install-later', 'install-dismiss']) document.getElementById(id)?.click();
    const prompt = document.getElementById('install-prompt');
    if (prompt && !prompt.hidden) prompt.hidden = true;
  });
};

/** The menu's ONE way in: PLAY → LEVEL <n>. The label is the campaign's own decision. */
const openCampaignEntry = async (page: Page, level: number): Promise<void> => {
  await dismissInstall(page);
  await page.click('#menu-play');
  await page.waitForSelector('#menu-campaign:not([hidden])', { timeout: 10_000 });
  const label = (await page.textContent('#menu-campaign'))?.trim() ?? '';
  check(`the PLAY menu offers LEVEL ${level}`, new RegExp(`LEVEL\\s*${level}\\b`).test(label), label);
  await page.evaluate(() => (document.getElementById('menu-campaign') as HTMLButtonElement | null)?.click());
};

const waitHidden = (page: Page, timeout = 10_000): Promise<unknown> =>
  page.waitForSelector('#starter-lottery', { state: 'hidden', timeout });

const waitLive = async (page: Page, phase: string, timeout = 20_000): Promise<boolean> => {
  try {
    await page.waitForFunction(
      (p) => document.getElementById('starter-lottery')?.dataset.phase === p,
      phase,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
};

/**
 * The ritual's own record, sampled in the page as each phase begins (Node's round trips are slow
 * under load and must never decide what the cards said). Geometry is measured at the same instant.
 */
const installRitualRecorder = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const win = window as unknown as { __ritualRecord: unknown[] };
    win.__ritualRecord = [];
    const box = (id: string) => {
      const r = document.getElementById(id)?.getBoundingClientRect();
      return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : null;
    };
    const hex = (key: string) => {
      const r = document.querySelector(`#board .hex-cell[data-key="${key}"] .hex`)?.getBoundingClientRect();
      return r ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : null;
    };
    let last = '';
    setInterval(() => {
      const el = document.getElementById('starter-lottery');
      const phase = el?.dataset.phase ?? '';
      if (!phase) { last = ''; return; }
      if (phase === last) return;
      last = phase;
      (win.__ritualRecord as unknown[]).push({
        phase,
        starter: el?.dataset.starter,
        youRank: Number(el?.dataset.youRank),
        opponentRank: Number(el?.dataset.opponentRank),
        title: document.getElementById('lottery-title')?.textContent?.trim() ?? '',
        layers: document.querySelectorAll('#lottery-deck .ritual-deck-layer').length,
        // The lesson window must never stand over the ceremony (or the ceremony over it).
        plateShown: (() => { const p = document.getElementById('lesson-plate'); return !!p && !p.hidden; })(),
        glassShown: (() => { const g = document.getElementById('futasaku-glass'); return !!g && !g.hidden; })(),
        you: box('lottery-card-you'),
        opponent: box('lottery-card-opponent'),
        deck: box('lottery-deck'),
        youHome: hex('-2,2'),
        opponentHome: hex('2,-2'),
        vw: innerWidth,
        vh: innerHeight,
      });
    }, 8);
  });

type RitualSnap = {
  phase: string; starter?: string; youRank: number; opponentRank: number; title: string; layers: number;
  you: { l: number; t: number; r: number; b: number; cx: number; cy: number } | null;
  opponent: { l: number; t: number; r: number; b: number; cx: number; cy: number } | null;
  deck: { l: number; t: number; r: number; b: number; cx: number; cy: number } | null;
  youHome: { cx: number; cy: number } | null;
  opponentHome: { cx: number; cy: number } | null;
  plateShown: boolean; glassShown: boolean;
  vw: number; vh: number;
};

const recorded = (page: Page): Promise<RitualSnap[]> =>
  page.evaluate(() => (window as unknown as { __ritualRecord: RitualSnap[] }).__ritualRecord);

const waitHandSettled = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => {
    const l = (window as unknown as { __severgrow: { lesson: () => { handSettled: boolean; stage: boolean } | null } })
      .__severgrow.lesson();
    return !!l && l.handSettled && !l.stage;
  }, undefined, { timeout: 15_000 });

const main = async (): Promise<void> => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    // Seed the keys this BUILD actually reads. A futa05 build reads `futa05:`, not `main2:`.
    storagePrefix = await detectStoragePrefix(browser);
    console.log(`  storage prefix: ${JSON.stringify(storagePrefix)}`);
    // ---------------------------------------------------------------- LEVEL 10 · phone 390x844
    {
      const { page, errors } = await open(browser, { width: 390, height: 844 }, 9);
      // Install BEFORE the level opens. `arrive` is set synchronously as the ritual starts, so a
      // recorder attached after the overlay is already visible can miss the first phase under load
      // and report a shorter trace than the ritual actually played.
      await installRitualRecorder(page);
      await openCampaignEntry(page, 10);
      await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 25_000 });
      // The three moments, best effort for the eye: the ritual's own record below decides the facts.
      const shotDeal = (await waitLive(page, 'deal')) ? await shot(page, 'l10-390x844-1-deal') : '(deal missed)';
      const shotReveal = (await waitLive(page, 'reveal')) ? await shot(page, 'l10-390x844-2-reveal') : '(reveal missed)';
      const shotResult = (await waitLive(page, 'result')) ? await shot(page, 'l10-390x844-3-result') : '(result missed)';
      const during = await state(page);
      const snaps = await recorded(page);
      const trace = snaps.map((x) => x.phase);
      const result = snaps.find((x) => x.phase === 'result') ?? null;
      const dist = (a: { cx: number; cy: number } | null, b: { cx: number; cy: number } | null): number =>
        a && b ? Math.hypot(a.cx - b.cx, a.cy - b.cy) : Number.NaN;
      const inside = !!result && [result.you, result.opponent, result.deck].every((r) =>
        !!r && r.l >= -1 && r.t >= -1 && r.r <= result.vw + 1 && r.b <= result.vh + 1);
      const overlap = (a: RitualSnap['you'], b: RitualSnap['you']): boolean =>
        !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      check('L10: a campaign level 10 game opens with the ritual',
        ['arrive', 'deal', 'reveal', 'result'].every((p) => trace.includes(p)), trace.join('>'));
      check('L10: nine cards in the ritual deck', result?.layers === 9, `layers=${result?.layers}`);
      check('L10: the result names the engine’s seat',
        result?.starter === 'you' && /^you start$/i.test(result?.title ?? ''),
        `${result?.starter} / "${result?.title}"`);
      check('L10: the higher card is the seat that starts', (result?.youRank ?? 0) > (result?.opponentRank ?? 9),
        `${result?.youRank} vs ${result?.opponentRank}`);
      check('L10: no lesson window stands over the ceremony',
        snaps.every((x) => !x.plateShown && !x.glassShown),
        snaps.filter((x) => x.plateShown || x.glassShown).map((x) => x.phase).join(','));
      check('L10: the engine’s starting seat is unchanged while the cards are on screen',
        during?.startingPlayer === 0 && during?.actor === 0 && during?.phase === 'DRAW',
        `startingPlayer=${during?.startingPlayer} actor=${during?.actor} phase=${during?.phase}`);
      check('L10: both cards are dealt at their own home, the deck clear of them, all inside the page',
        inside && dist(result?.you ?? null, result?.youHome ?? null) <= 55
          && dist(result?.opponent ?? null, result?.opponentHome ?? null) <= 55
          && !overlap(result?.deck ?? null, result?.you ?? null)
          && !overlap(result?.deck ?? null, result?.opponent ?? null),
        `you-home=${dist(result?.you ?? null, result?.youHome ?? null).toFixed(0)}px opp-home=${dist(result?.opponent ?? null, result?.opponentHome ?? null).toFixed(0)}px inside=${inside}`);
      await waitHidden(page);

      // The send-off: level 10 has no stage card, so it appears as soon as the hand has settled.
      await waitHandSettled(page);
      const shown = await plate(page);
      const beat = (await lesson(page))?.beat;
      const fitPhone = await page.evaluate(() => {
        const el = document.getElementById('lesson-plate');
        const r = el?.getBoundingClientRect();
        const key = ['#hand', '#deck', '#discard', '#smart-led', '#hud'].map((s) => {
          const b = document.querySelector(s)?.getBoundingClientRect();
          return b ? { s, l: b.left, t: b.top, r: b.right, b: b.bottom } : null;
        }).filter((x): x is { s: string; l: number; t: number; r: number; b: number } => !!x);
        return {
          plate: r ? { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), h: Math.round(r.height) } : null,
          overlaps: r ? key.filter((b) => r.left < b.r && b.l < r.right && r.top < b.b && b.t < r.bottom).map((b) => b.s) : [],
          vw: innerWidth,
          vh: innerHeight,
        };
      });
      const shotMessage = await shot(page, 'l10-390x844-4-message');
      check('L10: the send-off is on screen, word for word', shown.shown && shown.text === SENTENCE,
        JSON.stringify(shown.text));
      check('L10 phone: the box sits inside the page and covers no control',
        !!fitPhone.plate && fitPhone.plate.l >= -1 && fitPhone.plate.t >= -1
          && fitPhone.plate.r <= fitPhone.vw + 1 && fitPhone.plate.b <= fitPhone.vh + 1
          && fitPhone.overlaps.length === 0,
        `${JSON.stringify(fitPhone.plate)} over ${fitPhone.overlaps.join(',') || 'nothing'}`);
      check('L10: it is a start-of-level explanation with nothing lit',
        !!beat && beat.id === '10:intro:first-game' && beat.lit.t === 'none', `${beat?.id} lit=${beat?.lit.t}`);
      check('L10: the glass panel is not stacked over it (the lesson plate carries the words)',
        await page.evaluate(() => !!document.getElementById('futasaku-glass')?.hidden));

      // Dismissal: one tap anywhere on the board, after the reading floor (~3 s).
      const shownAt = Date.now();
      await page.waitForTimeout(3_300);
      await page.touchscreen.tap(195, 300);
      await page.waitForFunction(() => document.getElementById('lesson-plate')?.hidden !== false, undefined, { timeout: 3_000 });
      const afterTap = await plate(page);
      check('L10: one tap dismisses it', !afterTap.shown, `${Date.now() - shownAt}ms after it appeared`);
      check('L10: it never comes back', (await lesson(page))?.beat?.id !== '10:intro:first-game');

      // Playable straight after: the real Draw pile is tapped and the game moves on. A coordinate
      // tap, not a locator click: the pile is alive (its own breath animation) and never "stable".
      const deckBox = await page.locator('#deck').boundingBox();
      if (!deckBox) throw new Error('the Draw pile is not on screen');
      await page.touchscreen.tap(deckBox.x + deckBox.width / 2, deckBox.y + deckBox.height / 2);
      await page.waitForFunction(() => (window as unknown as { __severgrow: { state: () => StarterState | null } })
        .__severgrow.state()?.phase === 'ACT', undefined, { timeout: 8_000 });
      const afterDraw = await state(page);
      const shotPlayable = await shot(page, 'l10-390x844-5-playable');
      const legal = await page.evaluate(() =>
        (window as unknown as { __severgrow: { legal: () => unknown[] } }).__severgrow.legal().length);
      check('L10: the board is playable right after the message', afterDraw?.phase === 'ACT' && legal > 0,
        `phase=${afterDraw?.phase} legal=${legal}`);
      // No stage card on level 10 now, so the idle net must still arm itself: after ~6 s of a quiet
      // step the watch raises its stage on its own. (The beat itself stays quiet here while a power
      // is legal and has no goal to serve — level 10's own rule, never a nag.)
      await page.waitForFunction(() => {
        const l = (window as unknown as { __severgrow: { lesson: () => { idle: boolean } | null } }).__severgrow.lesson();
        return !!l && l.idle;
      }, undefined, { timeout: 14_000 });
      const idleStage = await page.evaluate(() =>
        (window as unknown as { __severgrow: { lesson: () => { idle: boolean; idleStage: number } } })
          .__severgrow.lesson().idleStage);
      check('L10: the idle net still arms without the stage card', idleStage >= 1, `idleStage=${idleStage}`);
      check('L10: the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      console.log(`  shots: ${[shotDeal, shotReveal, shotResult, shotMessage, shotPlayable].join(', ')}`);
      await page.context().close();
    }

    // ---------------------------------------------------------------- LEVEL 10 · desktop 1280x800
    {
      const { page, errors } = await open(browser, { width: 1280, height: 800 }, 9);
      await openCampaignEntry(page, 10);
      await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 25_000 });
      await waitLive(page, 'reveal');
      const shotReveal = await shot(page, 'l10-1280x800-1-reveal');
      await waitHidden(page);
      await waitHandSettled(page);
      const shown = await plate(page);
      const fit = await page.evaluate(() => {
        const el = document.getElementById('lesson-plate');
        const r = el?.getBoundingClientRect();
        const key = ['#hand', '#deck', '#discard', '#smart-led', '#hud'].map((s) => {
          const b = document.querySelector(s)?.getBoundingClientRect();
          return b ? { s, l: b.left, t: b.top, r: b.right, b: b.bottom } : null;
        }).filter((x): x is { s: string; l: number; t: number; r: number; b: number } => !!x);
        return {
          plate: r ? { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), h: Math.round(r.height) } : null,
          overlaps: r ? key.filter((b) => r.left < b.r && b.l < r.right && r.top < b.b && b.t < r.bottom).map((b) => b.s) : [],
          vw: innerWidth,
          vh: innerHeight,
        };
      });
      const shotMessage = await shot(page, 'l10-1280x800-2-message');
      check('L10 desktop: the same sentence in the same box', shown.shown && shown.text === SENTENCE,
        JSON.stringify(shown.text));
      check('L10 desktop: the box sits inside the page',
        !!fit.plate && fit.plate.l >= -1 && fit.plate.t >= -1 && fit.plate.r <= fit.vw + 1 && fit.plate.b <= fit.vh + 1,
        JSON.stringify(fit.plate));
      check('L10 desktop: the box covers no control', fit.overlaps.length === 0, fit.overlaps.join(','));
      check('L10 desktop: the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      console.log(`  shots: ${[shotReveal, shotMessage].join(', ')}`);
      await page.context().close();
    }

    // ------------------------------------------- LEVEL 10 · reduced motion + Escape cancels cleanly
    {
      const { page, errors } = await open(browser, { width: 390, height: 844 }, 9, { reduceMotion: true });
      await openCampaignEntry(page, 10);
      await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 25_000 });
      const reduced = await page.evaluate(() =>
        !!document.getElementById('starter-lottery')?.classList.contains('is-reduced'));
      check('L10 reduced motion: the ritual takes its short form', reduced);
      await page.keyboard.press('Escape');
      await waitHidden(page, 5_000);
      const times = await page.evaluate(() =>
        (window as unknown as { __ritualTimes: { visibleAt: number; hiddenAt: number } }).__ritualTimes);
      const onScreen = times.hiddenAt - times.visibleAt;
      check('L10 reduced motion: one key ends it promptly',
        onScreen > 0 && onScreen < 1_500, `${Math.round(onScreen)}ms on screen`);
      // The gate lifted: the match is live and its send-off is the next thing on screen.
      await waitHandSettled(page);
      const shown = await plate(page);
      const after = await state(page);
      const legal = await page.evaluate(() =>
        (window as unknown as { __severgrow: { legal: () => unknown[] } }).__severgrow.legal().length);
      check('L10 reduced motion: the match is prepared and unmuted after the ceremony',
        after?.startingPlayer === 0 && after?.phase === 'DRAW' && legal > 0,
        `startingPlayer=${after?.startingPlayer} phase=${after?.phase} legal=${legal}`);
      check('L10 reduced motion: the send-off still comes, and is the last beat before play',
        shown.shown && shown.text === SENTENCE, JSON.stringify(shown.text));
      check('L10 reduced motion: the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      await shot(page, 'l10-390x844-6-reduced-message');
      await page.context().close();
    }

    // ---------------------------------------------------------------- CONTROL: LEVEL 3 has no ritual
    {
      const { page, errors } = await open(browser, { width: 390, height: 844 }, 2);
      await openCampaignEntry(page, 3);
      await page.waitForFunction(() =>
        !!(window as unknown as { __severgrow: { state: () => unknown } }).__severgrow.state(), undefined, { timeout: 20_000 });
      await page.waitForTimeout(2_500);
      const ritualSeen = await page.evaluate(() => ({
        phases: (window as unknown as { __ritualPhases: unknown[] }).__ritualPhases.length,
        visible: (() => { const el = document.getElementById('starter-lottery'); return !!el && !el.hidden; })(),
      }));
      const l3 = await lesson(page);
      const shotControl = await shot(page, 'l3-390x844-control-no-ritual');
      check('L3 control: no ritual plays on a hand-held lesson',
        ritualSeen.phases === 0 && !ritualSeen.visible, JSON.stringify(ritualSeen));
      check('L3 control: the level is its own lesson, with its own opening', l3?.level === 3, `lesson=${l3?.level}`);
      check('L3 control: its own sentence, never level 10’s',
        !!l3?.beat?.id && l3.beat.id.startsWith('3:'), `beat=${l3?.beat?.id}`);
      check('L3 control: the level 10 send-off never appears', await page.evaluate(() =>
        !(document.getElementById('lesson-plate')?.textContent ?? '').includes('ready now')));
      check('L3 control: the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      console.log(`  shots: ${shotControl}`);
      await page.context().close();
    }
  } finally {
    await browser.close();
    await closePreview(served.server);
  }
};

await main();
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
