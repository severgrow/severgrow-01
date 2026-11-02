// LESSON 9 IS A FULL GAME — in the real product page.
//
// Owner, 2026-11-01: "make 9 level a full game but on small map, so still showing action thats
// showing now when its actually happening - but there is opening ritual cards who starts - and the
// whole game starts from scratch and goes until the end".
//
// What this proves, through the real menu and real pointer taps:
//   * level 9 opens with the Who-starts ritual, and its cards agree with the engine's seat;
//   * the board is the small map (19 hexes, radius 2) and the deal is a real one (the engine's
//     deck, no authored position);
//   * the info box never eats a tap: the first Draw is one tap while the sentence is open;
//   * the live cue appears WHILE each action happens (DRAW, a card/tile, the throw, WAIT), and the
//     old guided-lesson input lock is not active;
//   * the game plays to a real GAME_OVER, a win completes level 9 and unlocks 10;
//   * no page errors.
//
// Build CHANNEL=futa04 first. Then:
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     node --import tsx web/e2e/futa04-lesson-9-free.ts
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { closePreview, servePreview } from './helpers/preview-port.js';
import { LESSON } from '../../src/strings.js';

const SHOT_DIR = '/tmp/lesson9-free';

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

type Beat = {
  id: string; say?: string; line?: string; always?: boolean; explain?: boolean; status?: boolean; hello?: string;
  lit: { t: string; key?: string; id?: number; keys?: number[] };
};
type LessonNow = {
  level: number; beat: Beat | null; stage: boolean; handSettled: boolean; seen: string[];
  answers: number;
};
type State = {
  phase: 'DRAW' | 'ACT' | 'DISCARD' | 'GAME_OVER';
  actor: number; turnNumber: number; startingPlayer?: number;
  config: { boardRadius: number };
  history?: { t: string; player?: number }[];
  result?: { winner: number | null; reason: string; scores: number[] };
};
/** One paint of the real display, stamped with whose turn it was at that instant. */
type LedRecord = { at: number; text: string; actor: number | null; phase: string | null };

const served = await servePreview(0, { logLevel: 'error' });

/** The prefix `web/src/channel.ts` prepends on THIS build (derived from the page, not copied). */
const PROBE_KEY = 'severgrow.e2e.prefix-probe';
const detectStoragePrefix = async (browser: Browser): Promise<string> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(served.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!(window as unknown as { __severgrow?: unknown }).__severgrow, undefined, { timeout: 20_000 });
    const found = await page.evaluate((key) => {
      localStorage.setItem(key, '1');
      const raw = Object.keys(localStorage).find((k) => k.endsWith(key));
      localStorage.removeItem(key);
      return raw ? raw.slice(0, raw.length - key.length) : null;
    }, PROBE_KEY);
    if (found === null) throw new Error('e2e: the page installed no storage prefix');
    return found;
  } finally {
    await context.close();
  }
};
let storagePrefix = '';

/** Levels 1-8 won; level 9 is the place. */
const progress = (): string => JSON.stringify({
  version: 1,
  unlocked: 9,
  completed: Array.from({ length: 8 }, (_, i) => `c1-${String(i + 1).padStart(2, '0')}`),
  best: {},
});

const settings = JSON.stringify({
  sound: false, music: false, coach: false, autoSkip: false, reducedMotion: false,
  reduceMotion: false, eyeCandy: false, vibration: false, bloomHints: false, speed: 'normal',
});

const open = async (browser: Browser): Promise<{ page: Page; errors: string[] }> => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await context.addInitScript(({ s, p, prefix }) => {
    // tsx/esbuild compiles this suite with `keepNames`, which wraps a named inner function (or a
    // `const fn = () => …`) with its `__name(fn, "fn")` helper. When such a function is handed to
    // `page.evaluate` it is injected as SOURCE, so the helper must exist on the page or the observer
    // below dies with "ReferenceError: __name is not defined". Same workaround as
    // web/e2e/ritual-from-level-10.ts. The assignment itself is an inline arrow argument, which the
    // transform never wraps — so it cannot recurse.
    (window as unknown as { __name?: (f: unknown) => unknown }).__name = (f) => f;
    localStorage.setItem(`${prefix}severgrow.settings.v1`, s);
    localStorage.setItem(`${prefix}severgrow.campaign.progress.v3`, p);
  }, { s: settings, p: progress(), prefix: storagePrefix });
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

const state = (page: Page): Promise<State | null> =>
  page.evaluate(() => (window as unknown as { __severgrow: { state: () => State | null } }).__severgrow.state());
const lesson = (page: Page): Promise<LessonNow | null> =>
  page.evaluate(() => (window as unknown as { __severgrow: { lesson: () => LessonNow | null } }).__severgrow.lesson());
const gate = (page: Page): Promise<{ active: boolean; mode: string } | null> =>
  page.evaluate(() => (window as unknown as { __severgrow: { tutorialGate: () => { active: boolean; mode: string } | null } })
    .__severgrow.tutorialGate());
const lessonMove = (page: Page): Promise<{ t: string; card?: number } | null> =>
  page.evaluate(() => (window as unknown as { __severgrow: { lessonMove: () => { t: string; card?: number } | null } })
    .__severgrow.lessonMove());
const idle = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => {
    const h = (window as unknown as { __severgrow: { busy: () => boolean } }).__severgrow;
    return !!h && !h.busy();
  }, undefined, { timeout: 30_000 });

const shot = async (page: Page, name: string): Promise<void> => {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
};

const dismissInstall = (page: Page): Promise<void> => page.evaluate(() => {
  for (const id of ['install-close', 'install-later', 'install-dismiss']) document.getElementById(id)?.click();
  const prompt = document.getElementById('install-prompt');
  if (prompt && !prompt.hidden) prompt.hidden = true;
});

const main = async (): Promise<void> => {
  const browser = await chromium.launch({
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
    args: ['--no-sandbox'],
  });
  try {
    storagePrefix = await detectStoragePrefix(browser);
    console.log(`  storage prefix: ${JSON.stringify(storagePrefix)}`);

    const { page, errors } = await open(browser);
    // ---------------------------------------------------------------- open level 9
    await dismissInstall(page);
    await page.click('#menu-play');
    await page.waitForSelector('#menu-campaign:not([hidden])', { timeout: 10_000 });
    const label = (await page.textContent('#menu-campaign'))?.trim() ?? '';
    check('PLAY offers LEVEL 9', /LEVEL\s*9\b/.test(label), label);
    await page.evaluate(() => (document.getElementById('menu-campaign') as HTMLButtonElement | null)?.click());

    // The ritual: a real campaign level 9 opens with the same ceremony as a practice match.
    await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 25_000 });
    await shot(page, '1-ritual');
    await page.waitForFunction(() => document.getElementById('starter-lottery')?.dataset.phase === 'result', undefined, { timeout: 25_000 });
    const ritual = await page.evaluate(() => {
      const el = document.getElementById('starter-lottery');
      return {
        starter: el?.dataset.starter ?? '',
        youRank: Number(el?.dataset.youRank),
        opponentRank: Number(el?.dataset.opponentRank),
        title: document.getElementById('lottery-title')?.textContent?.trim() ?? '',
        layers: document.querySelectorAll('#lottery-deck .ritual-deck-layer').length,
        plate: !!document.getElementById('lesson-plate') && !document.getElementById('lesson-plate')!.hidden,
        glass: !!document.getElementById('futasaku-glass') && !document.getElementById('futasaku-glass')!.hidden,
        during: (window as unknown as { __severgrow: { state: () => State | null } }).__severgrow.state(),
      };
    });
    check('L9: the opening ritual plays (nine cards, deal → reveal → result)', ritual.layers === 9, `layers=${ritual.layers}`);
    const engineSeat = ritual.during?.startingPlayer === 0 ? 'you' : 'opponent';
    check('L9: the ritual names the engine’s starting seat', ritual.starter === engineSeat && /start/i.test(ritual.title),
      `${ritual.starter} / "${ritual.title}" / engine ${engineSeat}`);
    check('L9: the higher card belongs to the seat that starts',
      ritual.starter === 'you' ? ritual.youRank > ritual.opponentRank : ritual.opponentRank > ritual.youRank,
      `${ritual.youRank} vs ${ritual.opponentRank}`);
    check('L9: no lesson box or glass stands over the ceremony', !ritual.plate && !ritual.glass);
    await page.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 15_000 });

    // The board is the small map, and the game is a real deal.
    await page.waitForFunction(() => {
      const l = (window as unknown as { __severgrow: { lesson: () => LessonNow | null } }).__severgrow.lesson();
      return !!l && !l.stage && l.handSettled;
    }, undefined, { timeout: 15_000 });
    const opened = await state(page);
    const hexes = await page.evaluate(() => document.querySelectorAll('#board .hex-cell').length);
    check('L9: the board is the small map (19 hexes, radius 2)', hexes === 19 && opened?.config.boardRadius === 2,
      `${hexes} hexes, radius ${opened?.config.boardRadius}`);
    check('L9: it is a real deal, not a scripted position',
      (opened?.history?.length ?? -1) === 0 && (opened?.phase === 'DRAW'),
      `history=${opened?.history?.length} phase=${opened?.phase}`);
    check('L9: the guided-lesson input gate is not active', (await gate(page))?.active !== true, JSON.stringify(await gate(page)));

    // Record EVERY value the real display shows, with the turn it was shown on. A paint can be
    // replaced between two CDP samples (the opponent's turn is short), so polling the DOM cannot
    // be trusted to see the WAIT cue; this observer cannot miss it.
    await page.evaluate(() => {
      const w = window as unknown as {
        __severgrow: { state: () => State | null };
        __l9led?: LedRecord[];
      };
      const el = document.querySelector('#smart-led-text');
      if (!el) throw new Error('L9: the display is not on screen');
      const rows: LedRecord[] = w.__l9led = [];
      let last: string | null = null;
      const record = (): void => {
        const text = el.textContent?.trim() ?? '';
        if (text === last) return;
        last = text;
        const s = w.__severgrow.state();
        rows.push({ at: Math.round(performance.now()), text, actor: s?.actor ?? null, phase: s?.phase ?? null });
      };
      new MutationObserver(record).observe(el, { childList: true, characterData: true, subtree: true });
      record();
    });
    const led = (): Promise<LedRecord[]> => page.evaluate(() => (window as unknown as { __l9led?: LedRecord[] }).__l9led ?? []);

    // ---------------------------------------------------------------- the box never eats a tap
    await page.waitForFunction(() => {
      const l = (window as unknown as { __severgrow: { lesson: () => LessonNow | null } }).__severgrow.lesson();
      return l?.beat?.id === '9:intro:pile-gold';
    }, undefined, { timeout: 15_000 });
    await shot(page, '2-opening-line');
    const beforeTap = (await state(page))!;
    const deck = await page.locator('#deck').boundingBox();
    if (!deck) throw new Error('the Draw pile is not on screen');
    await page.touchscreen.tap(deck.x + deck.width / 2, deck.y + deck.height / 2);
    await page.waitForFunction((n) => (window as unknown as { __severgrow: { state: () => State | null } })
      .__severgrow.state()?.history?.length === n + 1, beforeTap.history?.length ?? 0, { timeout: 10_000 });
    const afterTap = (await state(page))!;
    const afterLesson = await lesson(page);
    check('L9: ONE tap on the Draw pile draws while the sentence is open (the box never blocks play)',
      (afterTap.history?.length ?? 0) === (beforeTap.history?.length ?? 0) + 1
        && afterTap.history?.at(-1)?.t === 'Draw', `${(afterTap.history?.length ?? 0) - (beforeTap.history?.length ?? 0)} move`);
    check('L9: that same tap marks the sentence read', afterLesson?.seen.includes('9:intro:pile-gold') === true,
      JSON.stringify(afterLesson?.seen ?? []));

    // ---------------------------------------------------------------- the live cues, while the actions happen
    const seenCues: { phase: string; say: string; id: string; always: boolean; shown: boolean }[] = [];
    let realTaps = 1;
    const sawBeat = async (s: State, l: LessonNow): Promise<void> => {
      const b = l.beat;
      // A one-time power hello is a notification, not the action of the moment: it is skipped.
      if (!b?.say || b.explain || b.hello) return;
      const say = b.say;
      if (!seenCues.some((c) => c.phase === s.phase && c.say === say && c.id === b.id)) {
        // The display is the SAME line, while the action is live. The cockpit holds a line for a
        // moment before replacing it, so allow the dwell; a cue that never appears is a failure.
        const shown = await page.waitForFunction((t) => document.querySelector('#smart-led-text')?.textContent?.trim() === t,
          say, { timeout: 4_000 }).then(() => true).catch(() => false);
        seenCues.push({ phase: s.phase, say, id: b.id, always: b.always === true || b.status === true, shown });
        if (seenCues.length === 1) await shot(page, '3-live-cue');
      }
    };

    const recordWaitCue = async (): Promise<void> => {
      // The opponent's turn can be over before the loop's next sample (an idle() waits through it),
      // so read the observer's history rather than the DOM at one instant: the WAIT cue must have
      // been on the real display WHILE the actor was the opponent.
      if (seenCues.some((c) => c.say === LESSON.theirTurn)) return;
      const shown = await page.waitForFunction((wait) => {
        const rows = (window as unknown as { __l9led?: { text: string; actor: number | null }[] }).__l9led ?? [];
        return rows.some((r) => r.text === wait && r.actor === 1);
      }, LESSON.theirTurn, { timeout: 6_000 }).then(() => true).catch(() => false);
      seenCues.push({ phase: 'WAIT', say: LESSON.theirTurn, id: 'their-turn', always: true, shown });
      if (shown) await shot(page, '3b-wait-cue');
    };

    /** Read the beat the position just moved into, before the next loop iteration can play past it. */
    const notePhaseCue = async (): Promise<void> => {
      const s2 = await state(page);
      const l2 = await lesson(page);
      if (s2 && l2 && s2.actor === 0 && s2.phase !== 'GAME_OVER') await sawBeat(s2, l2);
    };

    for (let guard = 0; guard < 400; guard++) {
      const s = (await state(page))!;
      if (!s || s.phase === 'GAME_OVER') break;
      const l = await lesson(page);
      if (!l) throw new Error('L9: the lesson disappeared');
      await sawBeat(s, l);
      if (s.actor !== 0) {
        // Their turn: the display must carry the one steady WAIT status line, not go silent while
        // the bot's own play facts animate. Checked on EVERY opponent turn, not only after a throw.
        await recordWaitCue();
        continue;
      }
      // A real pointer tap on the lit thing counts as a real move; the test hook only makes the
      // rest of the game quick (the engine still plays the same legal moves).
      if (l.beat?.explain) {
        await page.mouse.click(195, 300); // anywhere: a free lesson passes it through
        await page.waitForTimeout(120);
        realTaps++;
        continue;
      }
      if (l.beat?.hello) { await page.waitForTimeout(2_900); continue; }
      // A real two-tap Grow when the light names a card: pick the card, then tap the lit tile.
      // This is the lit-tile cue in a real game, and it proves a card tap is not eaten either.
      if (s.phase === 'ACT' && l.beat?.lit.t === 'card') {
        const planned = await lessonMove(page);
        if (planned?.t === 'Sprout') {
          const cardPt = await page.evaluate((id) => {
            const el = document.querySelector(`#hand .card[data-card="${id}"]`);
            const r = el?.getBoundingClientRect();
            return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
          }, l.beat.lit.id);
          if (cardPt) {
            const before = s.history?.length ?? 0;
            await page.mouse.click(cardPt.x, cardPt.y);
            realTaps++;
            await page.waitForTimeout(200);
            const s2 = (await state(page))!;
            if ((s2.history?.length ?? 0) === before) {
              const l2 = await lesson(page);
              if (l2?.beat?.lit.t === 'hex') {
                await sawBeat(s2, l2);
                const hexPt = await page.evaluate((key) => {
                  const el = document.querySelector(`#board .hex-cell[data-key="${key}"] path.hex`);
                  const r = el?.getBoundingClientRect();
                  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
                }, l2.beat.lit.key);
                if (hexPt) {
                  await page.mouse.click(hexPt.x, hexPt.y);
                  realTaps++;
                  await notePhaseCue();
                  await idle(page);
                  continue;
                }
              }
            }
            // The card tap already played (the game auto-placed) or the target changed: let the
            // normal loop take over from the live state.
            await idle(page);
            continue;
          }
        }
      }
      const move = await page.evaluate(() => {
        const h = (window as unknown as { __severgrow: { lessonMove: () => unknown } }).__severgrow;
        return h.lessonMove() as unknown;
      });
      if (move) {
        const played = await page.evaluate((a) => (window as unknown as { __severgrow: { playFor: (a: unknown, p: number) => boolean } })
          .__severgrow.playFor(a, 0), move);
        if (!played) throw new Error(`L9: the page refused ${JSON.stringify(move)}`);
        await notePhaseCue();
        if ((move as { t?: string }).t === 'Discard') await recordWaitCue();
      } else {
        const end = await page.evaluate(() => {
          const h = (window as unknown as { __severgrow: { legal: () => { t: string }[]; playFor: (a: unknown, p: number) => boolean } })
            .__severgrow;
          const a = h.legal().find((x) => x.t === 'EndAct');
          return a ? h.playFor(a, 0) : false;
        });
        if (!end) throw new Error('L9: my turn with no move');
      }
      await idle(page);
      await page.waitForTimeout(60);
    }

    check('L9: every live cue is marked as live coaching (never an idle wait)', seenCues.length > 0 && seenCues.every((c) => c.always),
      seenCues.map((c) => `${c.phase}:${c.say}`).join(' | '));
    check('L9: each cue is actually on the display while its action is happening', seenCues.every((c) => c.shown),
      seenCues.filter((c) => !c.shown).map((c) => c.say).join(' | '));
    check('L9: the DRAW cue appeared at the Draw step',
      seenCues.some((c) => c.phase === 'DRAW' && c.say === LESSON.tapDraw), seenCues.map((c) => `${c.phase}:${c.say}`).join(' | '));
    const GROW_CUES: readonly string[] = [LESSON.chooseCard, LESSON.tapTile, LESSON.tapTheirTile, LESSON.tapBloom, LESSON.chooseBomb, 'TAP TO BLOOM', LESSON.bombHello];
    const THROW_CUES: readonly string[] = [LESSON.throwCard, LESSON.tapThrowPile, LESSON.tapThrow];
    check('L9: a card/tile cue appeared at the Grow step',
      seenCues.some((c) => c.phase === 'ACT' && GROW_CUES.includes(c.say)),
      seenCues.map((c) => `${c.phase}:${c.say}`).join(' | '));
    check('L9: the throw cue appeared at the Throw step',
      seenCues.some((c) => THROW_CUES.includes(c.say)),
      seenCues.map((c) => `${c.phase}:${c.say}`).join(' | '));
    const ledRows = await led();
    const waitPaints = ledRows.filter((r) => r.text === LESSON.theirTurn);
    check('L9: the WAIT cue appeared on their turn', waitPaints.some((r) => r.actor === 1),
      `${waitPaints.map((r) => `actor=${r.actor}@${r.at}ms`).join(', ') || 'no WAIT paint'} | ` +
      seenCues.map((c) => `${c.phase}:${c.say}`).join(' | '));

    const end = (await state(page))!;
    check('L9: the game plays to a real GAME_OVER', end.phase === 'GAME_OVER' && !!end.result,
      `${end.phase} ${JSON.stringify(end.result)}`);
    check('L9: the result is the engine’s own (a winner and two scores)',
      !!end.result && (end.result.winner === 0 || end.result.winner === 1 || end.result.winner === null)
        && Array.isArray(end.result.scores) && end.result.scores.length === 2,
      JSON.stringify(end.result));
    await page.waitForSelector('#gameover:not([hidden])', { timeout: 20_000 });
    const card = await page.evaluate(() => ({
      title: document.getElementById('go-title')?.textContent?.trim() ?? '',
      learned: document.getElementById('go-learned')?.textContent?.trim() ?? '',
      learnedHidden: document.getElementById('go-learned')?.hidden ?? true,
    }));
    await shot(page, '4-finish');
    if (end.result?.winner === 0) {
      check('L9: a win says what it taught', !card.learnedHidden && /PLAY A FULL GAME/.test(card.learned), card.learned);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('severgrow.campaign.progress.v3') ?? 'null'));
      check('L9: a win completes level 9 and unlocks level 10',
        !!saved && Array.isArray(saved.completed) && saved.completed.includes('c1-09') && saved.unlocked >= 10,
        JSON.stringify(saved));
    } else {
      // A real game may be lost; the finish card must be honest, and nothing may be blocked.
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('severgrow.campaign.progress.v3') ?? 'null'));
      check('L9: a loss takes nothing away and leaves level 9 open',
        !!saved && !saved.completed.includes('c1-09') && saved.unlocked >= 9, JSON.stringify(saved));
    }
    // DECISION 1 (owner, 2026-11-01): lesson 9 is chapter 1 level 9, so a finished match belongs in
    // the offline record. Read the device's own stats key: the guided-lesson guard excludes the old
    // scripted TUTORIAL, never a campaign game — including a loss, which is why this sits outside
    // the win branch.
    const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('severgrow.stats.v1') ?? 'null'));
    check('L9: the finished match counts in the offline record (win or loss)',
      !!stats && stats.played >= 1 && (stats.wins + stats.losses + stats.draws) >= 1,
      JSON.stringify(stats));
    check('L9: the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    console.log(`  cues seen: ${seenCues.map((c) => `${c.phase}:${c.say}`).join(' | ')}`);
    console.log(`  real pointer taps: ${realTaps}`);
    console.log(`  shots: ${SHOT_DIR}`);
    await page.context().close();
  } finally {
    await browser.close();
    await closePreview(served.server);
  }
};

await main();
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
