// Owner, 2026-10-25: "Your matches" is a collapsed disclosure in Play online, and both the button
// and the specific match row carry a red "!" when the player must respond.
//
//   npx tsx web/e2e/online-your-matches.ts
//
// A real CHANNEL=futa05 build against an in-memory duel API. The matches are created through the
// REAL service, so "needs my response" is proven against the server payload, not a fixture:
//   * guest A: an active match on A's turn (badged), an active match on the opponent's turn (NOT
//     badged), and a waiting invite A owns (NOT badged — it waits for an opponent);
//   * guest C: an active match on the opponent's turn and a waiting invite (badge absent entirely).
// Then: collapsed by default, badge on the button AND the row, the list survives a poll, a row tap
// still opens its match, and the header does not overflow at 320 / 390 / 1280.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { BrowserContext, Page } from 'playwright-core';
import { preview } from 'vite';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import type { Action } from '../../src/engine/types.js';
import { openMenuEntry } from './helpers/menu-nav.js';
import { expandYourMatches } from './helpers/lobby-matches.js';

const API_PORT = 4311;
const PREVIEW_PORT = 4218;
const OUT = '/tmp/your-matches/';
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const IDENTITY_KEY = 'severgrow.duel.identity.v1';

mkdirSync(OUT, { recursive: true });
const apiBase = `http://127.0.0.1:${API_PORT}`;

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

console.log(`building futa05 for ${apiBase} …`);
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: {
      ...process.env,
      CHANNEL: 'futa05',
      VITE_DUEL_API_URL: apiBase,
      // The futa05 build only checks that these are present; the duel API above is the one used.
      // A LOOPBACK value on purpose: a dummy `.supabase.co` literal would make
      // server/tests/quota-guard.test.ts classify this suite as able to reach the real project,
      // and this suite never leaves 127.0.0.1 (same as beta-feedback / live-duels).
      VITE_SUPABASE_URL: 'http://127.0.0.1:9',
      VITE_SUPABASE_ANON_KEY: 'dummy',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed (${code})`))));
});

const config = {
  ...DEFAULT_SERVER_CONFIG,
  corsOrigins: ['*'],
  rateLimits: {
    ...DEFAULT_SERVER_CONFIG.rateLimits,
    guestPerIpPerHour: 100_000,
    createPerPlayerPerHour: 100_000,
    createPerIpPerHour: 100_000,
    joinPerPlayerPerHour: 100_000,
    joinPerIpPerHour: 100_000,
    actionsPerPlayerPerMinute: 100_000,
  },
};
const service = new MatchService({ storage: new MemoryStorage(), config });
const apiServer = createHttpServer({ service, config });
await new Promise<void>((resolve) => apiServer.listen(API_PORT, '127.0.0.1', resolve));

const previewServer = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: PREVIEW_PORT, strictPort: true },
  logLevel: 'silent',
});
const baseUrl = `http://127.0.0.1:${PREVIEW_PORT}/`;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(baseUrl);
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

type Guest = {
  token: string;
  player: Awaited<ReturnType<MatchService['authenticate']>>;
  identity: { token: string; playerId: string; displayName: string | null; kind: 'guest' };
};

const makeGuest = async (): Promise<Guest> => {
  const created = await service.createGuest();
  const player = await service.authenticate(created.token);
  return {
    token: created.token,
    player,
    identity: {
      token: created.token,
      playerId: created.player.id,
      displayName: created.player.displayName,
      kind: 'guest',
    },
  };
};

/** End the turn of the seat that is to move (Draw → EndAct, then Discard). */
const handOverTurn = async (guest: Guest, matchId: string): Promise<void> => {
  const view = await service.viewPayload(guest.player, matchId);
  if (view.status !== 'active' || view.turnPlayer !== view.seat) {
    throw new Error(`setup: seat ${view.seat} cannot act (turn ${view.turnPlayer}, ${view.status})`);
  }
  const actions: Action[] = [];
  const draw = view.legalActions.find((a) => a.t === 'Draw');
  if (draw) actions.push(draw);
  actions.push({ t: 'EndAct' });
  const afterDraw = await service.submitAction(guest.player, matchId, {
    expectedRevision: view.revision,
    requestId: `ym-draw-${matchId}`,
    actions,
  });
  const discard = afterDraw.player.legalActions.find((a) => a.t === 'Discard');
  if (!discard) throw new Error('setup: no Discard after EndAct');
  await service.submitAction(guest.player, matchId, {
    expectedRevision: afterDraw.player.revision,
    requestId: `ym-discard-${matchId}`,
    action: discard,
  });
};

const startActive = async (creator: Guest, joiner: Guest) => {
  const created = await service.createMatch(creator.player);
  const joined = await service.joinMatch(joiner.player, created.match.inviteCode);
  return { matchId: created.match.matchId, creatorSeat: 0 as const, joinerSeat: joined.player.seat };
};

/**
 * Make a match where `owner` is to move. The server's seeded lottery decides who starts, so if the
 * opponent starts, the opponent simply takes their turn first — through the real action pipeline.
 */
const ensureOwnerToMove = async (owner: Guest, opponent: Guest, matchId: string): Promise<void> => {
  let view = await service.viewPayload(owner.player, matchId);
  if (view.turnPlayer !== view.seat) {
    const other = view.turnPlayer === 0 ? owner : opponent;
    await handOverTurn(other, matchId);
    view = await service.viewPayload(owner.player, matchId);
  }
  if (view.turnPlayer !== view.seat) throw new Error('setup: could not put the owner on move');
};

/** Make a match where the OPPONENT is to move (the case that must never be badged). */
const ensureOpponentToMove = async (owner: Guest, opponent: Guest, matchId: string): Promise<void> => {
  let view = await service.viewPayload(owner.player, matchId);
  if (view.turnPlayer === view.seat) {
    await handOverTurn(owner, matchId);
    view = await service.viewPayload(owner.player, matchId);
  }
  if (view.turnPlayer === view.seat) throw new Error('setup: could not hand the turn to the opponent');
  void opponent;
};

// ---- the players and their matches, all through the real service -----------------------------
const a = await makeGuest();
const b = await makeGuest();
const c = await makeGuest();
const d = await makeGuest();
const e = await makeGuest(); // no matches at all: the empty state

const mine = await startActive(a, b); // A to move
await ensureOwnerToMove(a, b, mine.matchId);

const theirs = await startActive(a, b); // B to move
await ensureOpponentToMove(a, b, theirs.matchId);

const waiting = await service.createMatch(a.player); // A owns an invite nobody joined

const cTheirs = await startActive(c, d); // C's opponent to move
await ensureOpponentToMove(c, d, cTheirs.matchId);
const cWaiting = await service.createMatch(c.player);

const aList = await service.listMyMatches(a.player);
const cList = await service.listMyMatches(c.player);
const aWaitingCount = aList.filter((e) => e.status === 'active' && e.turnPlayer === e.mySeat).length;
const cWaitingCount = cList.filter((e) => e.status === 'active' && e.turnPlayer === e.mySeat).length;
check('setup: A has 3 matches, exactly 1 on A\'s turn', aList.length === 3 && aWaitingCount === 1, `${aList.length} / ${aWaitingCount}`);
check('setup: C has 2 matches, none on C\'s turn', cList.length === 2 && cWaitingCount === 0, `${cList.length} / ${cWaitingCount}`);

const browser = await chromium.launch({ executablePath: CHROME });
const contexts: BrowserContext[] = [];

const openLobby = async (guest: Guest, viewport: { width: number; height: number }): Promise<Page> => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: viewport.width < 600 });
  contexts.push(context);
  const page = await context.newPage();
  await page.addInitScript(
    (payload: { key: string; identity: Guest['identity'] }) => {
      // futa05's channel shim prefixes every key with "futa05:", and the init script runs BEFORE
      // that shim is installed, so the prefix is written literally here (same as online-art-fallback).
      try {
        localStorage.clear();
        localStorage.setItem(`futa05:${payload.key}`, JSON.stringify(payload.identity));
        localStorage.setItem('futa05:severgrow.duel.firstCard.v1', '1');
        localStorage.setItem(
          'futa05:severgrow.settings.v1',
          JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: false }),
        );
      } catch {
        /* storage blocked */
      }
    },
    { key: IDENTITY_KEY, identity: guest.identity },
  );
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await openMenuEntry(page, 'menu-online', { timeout: 40_000 });
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
  if (await page.locator('#online-first-ok').isVisible().catch(() => false)) await page.click('#online-first-ok');
  await page.waitForSelector('#online-matches-toggle', { timeout: 15_000 });
  // The first list request is part of opening the hub; allow it to paint.
  await page.waitForFunction(() => /\(\d+\)/.test(document.getElementById('online-matches-title')?.textContent ?? ''), {
    timeout: 20_000,
  });
  return page;
};

const disclosure = (page: Page) =>
  page.evaluate(() => {
    const toggle = document.getElementById('online-matches-toggle') as HTMLButtonElement;
    const panel = document.getElementById('online-matches-panel') as HTMLElement;
    const badge = document.getElementById('online-matches-attention') as HTMLElement;
    const label = document.getElementById('online-matches-title') as HTMLElement;
    return {
      expanded: toggle.getAttribute('aria-expanded'),
      ariaLabel: toggle.getAttribute('aria-label'),
      label: (label.textContent ?? '').trim(),
      panelHidden: panel.hidden,
      badgeHidden: badge.hidden,
      badgeText: (badge.textContent ?? '').trim(),
      rows: document.querySelectorAll('#online-matches li[data-match-id]').length,
      rowBadges: document.querySelectorAll('#online-matches .online-row-attention').length,
    };
  });

const rowState = (page: Page, matchId: string) =>
  page.evaluate((id) => {
    const row = document.querySelector(`#online-matches li[data-match-id="${id}"]`) as HTMLElement | null;
    if (!row) return null;
    return {
      status: (row.querySelector('.online-row-status')?.textContent ?? '').trim(),
      badge: !!row.querySelector('.online-row-attention'),
      needsResponse: row.classList.contains('needs-response'),
    };
  }, matchId);

// The panel arrives over 300ms (interface-motion); screenshots wait for it to settle so the badge
// is captured at its true red rather than mid-fade.
const settle = (page: Page) => page.waitForTimeout(380);

// A full-page PNG at 2x is megabytes; on a loaded machine the default 30s screenshot timeout
// expires even though the page is fine, so each capture gets a generous ceiling.
const shot = (page: Page, file: string) => page.screenshot({ path: `${OUT}${file}`, timeout: 120_000 });

const layout = (page: Page) =>
  page.evaluate(() => {
    const toggle = document.getElementById('online-matches-toggle') as HTMLElement;
    const label = document.getElementById('online-matches-title') as HTMLElement;
    const t = toggle.getBoundingClientRect();
    const l = label.getBoundingClientRect();
    return {
      docWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      toggleLeft: +t.left.toFixed(1),
      toggleRight: +t.right.toFixed(1),
      toggleHeight: +t.height.toFixed(1),
      labelClipped: label.scrollWidth > label.clientWidth + 1,
      labelInside: l.left >= t.left - 0.5 && l.right <= t.right + 0.5,
    };
  });

try {
  // ---- A: a phone at 390 ---------------------------------------------------------------------
  const page = await openLobby(a, { width: 390, height: 844 });
  let state = await disclosure(page);
  check('starts COLLAPSED by default', state.expanded === 'false' && state.panelHidden === true);
  check('the label carries the count', state.label === 'Your matches (3)', state.label);
  check('the button badge is visible while collapsed', state.badgeHidden === false && state.badgeText === '!');
  check(
    'the badge has an accessible name in words, not a bare "!"',
    state.ariaLabel === 'Your matches (3). 1 match waiting for your move',
    state.ariaLabel ?? '',
  );
  await shot(page, 'collapsed-badge-390x844.png');
  // Small element shots too: the full-page 2x PNGs are ~1 MB and the red disc is a few pixels in
  // them. These are the readable evidence of the mark the owner asked for.
  await page.locator('#online-matches-toggle').screenshot({ path: `${OUT}toggle-badge-390.png`, timeout: 120_000 });

  await expandYourMatches(page);
  state = await disclosure(page);
  check('expanding shows the list', state.expanded === 'true' && state.panelHidden === false);
  check('all 3 matches are listed', state.rows === 3, `${state.rows} rows`);
  check('only the match on my turn carries the row badge', state.rowBadges === 1, `${state.rowBadges} row badge(s)`);

  const mineRow = await rowState(page, mine.matchId);
  const theirsRow = await rowState(page, theirs.matchId);
  const waitingRow = await rowState(page, waiting.match.matchId);
  check('my-turn row: badged, says "Your turn" in words', !!mineRow && mineRow.badge && mineRow.needsResponse && mineRow.status === 'Your turn', JSON.stringify(mineRow));
  check('opponent-turn row: NOT badged, says "Opponent\'s turn"', !!theirsRow && !theirsRow.badge && !theirsRow.needsResponse && theirsRow.status === "Opponent's turn", JSON.stringify(theirsRow));
  check('waiting-for-opponent row: NOT badged, says "Waiting"', !!waitingRow && !waitingRow.badge && waitingRow.status === 'Waiting', JSON.stringify(waitingRow));
  await settle(page);
  await shot(page, 'expanded-badge-390x844.png');
  // The badged row on its own (see the element-shot note above).
  await page
    .locator(`#online-matches li[data-match-id="${mine.matchId}"]`)
    .screenshot({ path: `${OUT}row-badge-390.png`, timeout: 120_000 });
  const phoneLayout = await layout(page);
  check('390px: no horizontal overflow', phoneLayout.docWidth <= phoneLayout.viewport + 1, `${phoneLayout.docWidth} / ${phoneLayout.viewport}`);
  check('390px: the toggle fits and is a 44px target', phoneLayout.toggleLeft >= 0 && phoneLayout.toggleRight <= phoneLayout.viewport + 0.5 && phoneLayout.toggleHeight >= 44, JSON.stringify(phoneLayout));
  check('390px: the label is not clipped', !phoneLayout.labelClipped && phoneLayout.labelInside, JSON.stringify(phoneLayout));
  const badgeColours = await page.evaluate(() => {
    // Resolve the product's ALERT token rather than hard-coding a hex, and prove it is not the
    // `danger` token: every palette rebinds `danger` to #fff4dc (cream weak-spot ink), which is
    // exactly why the first version's disc came out cream. Both tokens are read so the run shows
    // the difference instead of trusting a comment.
    const probe = document.createElement('span');
    probe.style.background = 'var(--c-alert)';
    probe.style.color = 'var(--c-alertInk)';
    document.body.append(probe);
    const token = getComputedStyle(probe);
    const expected = { bg: token.backgroundColor, ink: token.color };
    probe.remove();
    const buttonBadge = getComputedStyle(document.getElementById('online-matches-attention')!);
    const rowBadge = getComputedStyle(document.querySelector('#online-matches .online-row-attention')!);
    return {
      expected,
      dangerToken: getComputedStyle(document.documentElement).getPropertyValue('--c-danger').trim(),
      alertToken: getComputedStyle(document.documentElement).getPropertyValue('--c-alert').trim(),
      buttonBadge: buttonBadge.backgroundColor,
      rowBadge: rowBadge.backgroundColor,
      buttonInk: buttonBadge.color,
      rowInk: rowBadge.color,
      buttonRadius: buttonBadge.borderRadius,
      rowRadius: rowBadge.borderRadius,
    };
  });
  // The badge must be a RED DISC with DARK ink, drawn from the product's alert token — never an
  // invented hex, and never the theme's `danger` token (cream, measured below).
  const rgbOf = (css: string) => css.match(/\d+/g)?.map(Number) ?? [];
  const luminance = (css: string) => {
    const [r = 0, g = 0, b = 0] = rgbOf(css);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const expectedRgb = rgbOf(badgeColours.expected.bg);
  check(
    'both badges use the product alert red (--c-alert #ff6b4a), not an invented hex',
    expectedRgb[0] === 255 && expectedRgb[1] === 107 && expectedRgb[2] === 74 &&
      badgeColours.alertToken === '#ff6b4a' &&
      badgeColours.buttonBadge === badgeColours.expected.bg && badgeColours.rowBadge === badgeColours.expected.bg,
    JSON.stringify(badgeColours),
  );
  check(
    'the theme danger token is still cream, so the badges provably did not use it',
    badgeColours.dangerToken === '#fff4dc',
    `--c-danger ${badgeColours.dangerToken}`,
  );
  check(
    'both badges are red discs with dark ink (not cream, not a bright fill)',
    luminance(badgeColours.buttonBadge) > 120 && luminance(badgeColours.buttonInk) < 60 &&
      luminance(badgeColours.rowBadge) > 120 && luminance(badgeColours.rowInk) < 60 &&
      badgeColours.buttonRadius === '50%' && badgeColours.rowRadius === '50%',
    `button fill ${badgeColours.buttonBadge} ink ${badgeColours.buttonInk} · row fill ${badgeColours.rowBadge} ink ${badgeColours.rowInk}`,
  );

  // The snap-shut bug: wait past a real hub poll and the list must still be open.
  await page.evaluate(() => {
    const hook = window as unknown as { __ymListCalls?: number };
    hook.__ymListCalls = 0;
    const realFetch = window.fetch;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      try {
        const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        if (url.includes('/v1/players/me/matches')) hook.__ymListCalls = (hook.__ymListCalls ?? 0) + 1;
      } catch {
        /* not a URL */
      }
      return realFetch.call(window, input, init);
    } as typeof window.fetch;
  });
  await page.waitForTimeout(11_500);
  const afterPoll = await disclosure(page);
  const listCalls = (await page.evaluate(() => (window as unknown as { __ymListCalls?: number }).__ymListCalls ?? 0)) as number;
  check('a poll really happened while the list was open', listCalls >= 1, `${listCalls} list request(s)`);
  check('the list STAYS OPEN across the poll (no snap shut)', afterPoll.expanded === 'true' && afterPoll.panelHidden === false);

  // Tapping the waiting match still opens it (then back to the hub, still expanded).
  await page.locator(`#online-matches li[data-match-id="${waiting.match.matchId}"]`).click();
  await page.waitForSelector('#online-waiting:not([hidden])', { timeout: 20_000 });
  check('tapping a match still opens it', true, 'waiting match opened');
  await page.click('#online-waiting-back');
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 20_000 });
  check('returning to the hub keeps the disclosure open', (await disclosure(page)).expanded === 'true');

  // ---- 320px ----------------------------------------------------------------------------------
  const narrow = await openLobby(a, { width: 320, height: 844 });
  await shot(narrow, 'collapsed-badge-320x844.png');
  await expandYourMatches(narrow);
  await settle(narrow);
  await shot(narrow, 'expanded-badge-320x844.png');
  const narrowLayout = await layout(narrow);
  check('320px: no horizontal overflow', narrowLayout.docWidth <= narrowLayout.viewport + 1, `${narrowLayout.docWidth} / ${narrowLayout.viewport}`);
  check('320px: the toggle fits and is a 44px target', narrowLayout.toggleLeft >= 0 && narrowLayout.toggleRight <= narrowLayout.viewport + 0.5 && narrowLayout.toggleHeight >= 44, JSON.stringify(narrowLayout));
  check('320px: the label is not clipped', !narrowLayout.labelClipped && narrowLayout.labelInside, JSON.stringify(narrowLayout));

  // ---- 1280px ---------------------------------------------------------------------------------
  const wide = await openLobby(a, { width: 1280, height: 800 });
  await shot(wide, 'collapsed-badge-1280x800.png');
  await expandYourMatches(wide);
  await settle(wide);
  await shot(wide, 'expanded-badge-1280x800.png');
  const wideLayout = await layout(wide);
  check('1280px: no horizontal overflow', wideLayout.docWidth <= wideLayout.viewport + 1, `${wideLayout.docWidth} / ${wideLayout.viewport}`);
  check('1280px: the toggle fits and is a 44px target', wideLayout.toggleLeft >= 0 && wideLayout.toggleRight <= wideLayout.viewport + 0.5 && wideLayout.toggleHeight >= 44, JSON.stringify(wideLayout));
  check('1280px: the label is not clipped', !wideLayout.labelClipped && wideLayout.labelInside, JSON.stringify(wideLayout));

  // ---- C: nothing on his turn -> NO badge anywhere --------------------------------------------
  const none = await openLobby(c, { width: 390, height: 844 });
  let noneState = await disclosure(none);
  check('not-my-turn guest: the button badge is absent', noneState.badgeHidden === true, JSON.stringify(noneState));
  check('not-my-turn guest: the button name has no waiting words', noneState.ariaLabel === 'Your matches (2)', noneState.ariaLabel ?? '');
  await shot(none, 'collapsed-no-badge-390x844.png');
  await expandYourMatches(none);
  noneState = await disclosure(none);
  const cTheirRow = await rowState(none, cTheirs.matchId);
  const cWaitingRow = await rowState(none, cWaiting.match.matchId);
  check('not-my-turn guest: no row badges', noneState.rowBadges === 0, `${noneState.rowBadges}`);
  check('not-my-turn guest: the opponent-turn row is unbadged', !!cTheirRow && !cTheirRow.badge && cTheirRow.status === "Opponent's turn", JSON.stringify(cTheirRow));
  check('not-my-turn guest: the waiting row is unbadged', !!cWaitingRow && !cWaitingRow.badge && cWaitingRow.status === 'Waiting', JSON.stringify(cWaitingRow));
  await settle(none);
  await shot(none, 'expanded-no-badge-390x844.png');

  // The same "nothing of mine to answer" lobby at the narrowest and widest sizes, so the absent
  // badge is proven at every width in the report, not only at 390.
  for (const size of [
    { width: 320, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    const noneAtSize = await openLobby(c, size);
    const collapsedNone = await disclosure(noneAtSize);
    const tag = `${size.width}x${size.height}`;
    check(`${tag} not-my-turn: no badge on the collapsed button`, collapsedNone.badgeHidden === true, collapsedNone.ariaLabel ?? '');
    await shot(noneAtSize, `collapsed-no-badge-${tag}.png`);
    await expandYourMatches(noneAtSize);
    const openedNone = await disclosure(noneAtSize);
    check(`${tag} not-my-turn: no row badges`, openedNone.rowBadges === 0, `${openedNone.rowBadges} row badge(s)`);
    await settle(noneAtSize);
    await shot(noneAtSize, `expanded-no-badge-${tag}.png`);
  }

  // ---- E: no matches at all -> the existing empty state still works behind the disclosure ------
  const empty = await openLobby(e, { width: 390, height: 844 });
  let emptyState = await disclosure(empty);
  check('empty lobby: the button says (0) and carries no badge', emptyState.label === 'Your matches (0)' && emptyState.badgeHidden === true, JSON.stringify(emptyState));
  await expandYourMatches(empty);
  emptyState = await disclosure(empty);
  const emptyText = (await empty.textContent('#online-matches-empty')) ?? '';
  check('empty lobby: expanding shows "No matches yet."', emptyState.panelHidden === false && emptyState.rows === 0 && emptyText.trim() === 'No matches yet.', emptyText.trim());
  await shot(empty, 'empty-390x844.png');

  // ---- reduced motion: the badge is static and the reveal is not animated ----------------------
  const calm = await openLobby(a, { width: 390, height: 844 });
  await calm.emulateMedia({ reducedMotion: 'reduce' });
  const before = await disclosure(calm);
  await calm.click('#online-matches-toggle');
  await calm.waitForTimeout(50);
  const mid = await disclosure(calm);
  const noAnimation = await calm.evaluate(() => {
    const panel = document.getElementById('online-matches-panel') as HTMLElement;
    return panel.getAnimations().length === 0;
  });
  const badgeStatic = await calm.evaluate(
    () => (document.getElementById('online-matches-attention') as HTMLElement).getAnimations().length === 0,
  );
  check('reduce motion: the panel appears without an animation', before.expanded === 'false' && mid.expanded === 'true' && noAnimation);
  check('reduce motion: the badge is static in every mode', badgeStatic);
  await shot(calm, 'expanded-reduced-motion-390x844.png');
} finally {
  await browser.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  await previewServer.close();
}

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
