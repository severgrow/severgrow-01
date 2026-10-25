// Two actual authenticated browser clients + the real local API/Postgres adapter.
// Realtime frames are delivered through Playwright's Supabase wire simulator; no live quota.
// CHAT_TEST_DATABASE_URL=postgres://...localhost... PW_CHROMIUM=/usr/bin/chromium npx tsx web/e2e/match-chat.ts
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { chromium, type Page, type WebSocketRoute } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { openMenuEntry } from './helpers/menu-nav.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import {
  postgresStorage,
  type PgPool,
} from '../../server/src/storage/postgres.js';
import { memoryChatStore } from '../../server/src/chat/memory.js';
import { postgresChatStore } from '../../server/src/chat/postgres.js';
import { createChatRouter } from '../../server/src/chat/router.js';
import { MemoryFeedbackStore } from '../../server/src/feedback/feedback.js';
import { newId } from '../../server/src/ids.js';
import type { MatchBroadcaster } from '../../server/src/broadcast.js';
const out = process.env.SHOTS ?? '/tmp/futasaku-chat-shots';
mkdirSync(out, { recursive: true });
let passed = 0;
const check = (label: string, value: unknown) => {
  assert.ok(value, label);
  console.log(`PASS ${label}`);
  passed++;
};
const db = process.env.CHAT_TEST_DATABASE_URL;
if (db && !['localhost', '127.0.0.1'].includes(new URL(db).hostname))
  throw new Error('Use only an isolated local database.');
const pool = db ? new Pool({ connectionString: db, max: 5 }) : null;
const storage = pool
  ? postgresStorage(pool as unknown as PgPool)
  : new MemoryStorage();
const feedback = new MemoryFeedbackStore();
const chat = pool
  ? postgresChatStore(pool as unknown as PgPool)
  : memoryChatStore(storage as MemoryStorage, feedback);
let now = Date.now();
const wires = new Map<WebSocketRoute, Set<string>>();
let opponentPresence: 'online' | 'offline' = 'online';
let joins = 0,
  connects = 0;
const joinedTopics: string[] = [];
const broadcast = (event: string): MatchBroadcaster => ({
  async publish(matchId, ping) {
    for (const [ws, topics] of wires)
      if (topics.has(`realtime:${matchId}`))
        ws.send(
          JSON.stringify({
            topic: `realtime:${matchId}`,
            event: 'broadcast',
            payload: { event, payload: ping },
          }),
        );
  },
});
const config = {
  ...DEFAULT_SERVER_CONFIG,
  corsOrigins: ['*'],
  rateLimits: {
    ...DEFAULT_SERVER_CONFIG.rateLimits,
    guestPerIpPerHour: 10000,
    createPerIpPerHour: 10000,
  },
};
const service = new MatchService({
  storage,
  config,
  now: () => now,
  broadcaster: broadcast('ping'),
});
const server = createHttpServer({
  service,
  config,
  live: createChatRouter({
    store: chat,
    service,
    storage,
    notifier: broadcast('chat'),
  }),
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const a = await service.createGuest(),
  b = await service.createGuest();
const m = await service.createMatch(await service.authenticate(a.token));
await service.joinMatch(
  await service.authenticate(b.token),
  m.match.inviteCode,
);
const id = m.match.matchId;
await new Promise<void>((resolve, reject) => {
  const p = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'build',
      '--config',
      'web/vite.config.ts',
    ],
    {
      env: {
        ...process.env,
        CHANNEL: 'futa05',
        VITE_DUEL_API_URL: base,
        VITE_SUPABASE_URL: base,
        VITE_SUPABASE_ANON_KEY: 'local-test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  p.stdout.on('data', (b) => (log += b));
  p.stderr.on('data', (b) => (log += b));
  p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(log))));
});
const preview = await servePreview(0, { logLevel: 'error' });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
const errors: string[] = [];
const open = async (identity: typeof a) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await ctx.routeWebSocket('**/realtime/v1/websocket*', (ws) => {
    connects++;
    wires.set(ws, new Set());
    ws.onMessage((raw) => {
      const frame = JSON.parse(String(raw));
      if (frame.event === 'phx_join') {
        if (frame.topic === `realtime:${id}`) joins++;
        joinedTopics.push(frame.topic);
        wires.get(ws)?.add(frame.topic);
        ws.send(
          JSON.stringify({
            topic: frame.topic,
            event: 'phx_reply',
            ref: frame.ref,
            payload: { status: 'ok', response: {} },
          }),
        );
      }
      if (frame.event === 'phx_leave') wires.get(ws)?.delete(frame.topic);
    });
    ws.onClose(() => wires.delete(ws));
  });
  // Feed the EXISTING live-button status loop; chat must not issue another presence request.
  await ctx.route('**/v1/matches/*/live', async route => {
    const matchId = new URL(route.request().url()).pathname.split('/').at(-2);
    await route.fulfill({ json: { live: {
      matchId, status: 'active', live: false, serverNow: Date.now(),
      opponent: { name: 'Opponent', presence: opponentPresence, inLive: false, available: true, reconnecting: false },
      me: { liveMatchId: null, challengesEnabled: true },
      pending: null, block: null, rematchBlock: null, limitMs: 60000,
    } } });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ({ identity, id }) => {
      localStorage.setItem(
        'futa05:severgrow.duel.identity.v1',
        JSON.stringify({
          token: identity.token,
          playerId: identity.player.id,
          displayName: identity.player.displayName,
          kind: 'guest',
        }),
      );
      localStorage.setItem(
        `futa05:severgrow.duel.starterRevealed.v1.${id}`,
        '1',
      );
      localStorage.setItem(
        'futa05:severgrow.settings.v1',
        JSON.stringify({
          sound: false,
          music: false,
          coach: false,
          speed: 'skip',
          reduceMotion: true,
          eyeCandy: false,
        }),
      );
    },
    { identity, id },
  );
  await page.goto(preview.origin);
  await openMenuEntry(page, 'menu-online');
  await page.locator('#online-hub:not([hidden])').waitFor();
  if (await page.locator('#online-first-ok').isVisible())
    await page.locator('#online-first-ok').click();
  await openMatchRow(page, id);
  await page.locator('#match-chat-toggle').waitFor();
  return page;
};
const input = (p: Page) => p.locator('.match-chat-form input');
/** The lobby's "Your matches" list is a closed disclosure by default; open it before a row tap. */
const openMatchRow = async (page: Page, id: string) => {
  const row = page.locator(`#online-matches li[data-match-id="${id}"]`);
  if (!(await row.isVisible()))
    await page.locator('#online-matches-toggle').click();
  await row.click();
};
try {
  const pa = await open(a),
    pb = await open(b);
  await pa.waitForTimeout(200);
  console.log('Realtime diagnostics', { connects, joins, joinedTopics });
  check(
    'one shared Realtime connection and join per match/client',
    joins === 2 &&
      [...wires.values()].filter((t) => t.has(`realtime:${id}`)).length === 2,
  );
  const match = (await storage.matchById(id))!;
  const sender = match.state.actor === 0 ? pb : pa,
    receiver = match.state.actor === 0 ? pa : pb;
  const senderIdentity = match.state.actor === 0 ? b : a,
    receiverIdentity = match.state.actor === 0 ? a : b;
  await sender.locator('#match-chat-toggle').click();
  await input(sender).waitFor({ state: 'visible' });
  await sender.waitForFunction(
    () =>
      !(document.querySelector('.match-chat-form input') as HTMLInputElement)
        .disabled,
  );
  await input(sender).fill('Remember after reload');
  await sender.reload();
  await openMenuEntry(sender, 'menu-online');
  await openMatchRow(sender, id);
  await sender.locator('#match-chat-toggle').click();
  await input(sender).waitFor({ state: 'visible' });
  check(
    'a real page reload restores the match draft without sending',
    (await input(sender).inputValue()) === 'Remember after reload' &&
      (
        await chat.execute(
          senderIdentity.player.id,
          id,
          { kind: 'history' },
          now,
        )
      ).messages.length === 0,
  );
  await input(sender).fill('');
  const motionChecks = await sender.evaluate(async () => {
    const root = document.documentElement,
      panel = document.querySelector<HTMLElement>('.match-chat-panel')!,
      key = document.querySelector<HTMLButtonElement>('#match-chat-toggle')!;
    root.classList.remove('reduce-motion');
    key.click();
    const exit = panel.getAnimations()[0]!;
    const immediateRelease =
      panel.inert &&
      panel.getAttribute('aria-hidden') === 'true' &&
      getComputedStyle(panel).pointerEvents === 'none' &&
      !panel.hidden;
    exit.pause();
    exit.currentTime = 40;
    const opacity = parseFloat(getComputedStyle(panel).opacity);
    key.click();
    const seamless =
      Math.abs(parseFloat(getComputedStyle(panel).opacity) - opacity) < 0.04 &&
      exit.playState === 'idle';
    await Promise.all(panel.getAnimations().map((a) => a.finished));
    for (let i = 0; i < 6; i++) {
      key.click();
      key.click();
    }
    await Promise.all(panel.getAnimations().map((a) => a.finished));
    const survived =
      !panel.hidden &&
      !panel.inert &&
      key.getAttribute('aria-expanded') === 'true';
    const phrase = document.querySelector<HTMLButtonElement>(
      '.match-chat-phrase-toggle',
    )!;
    phrase.click();
    const picker = document.querySelector<HTMLElement>('.match-chat-phrases')!;
    const pickerAnimated = picker.getAnimations().length === 1;
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await Promise.all(picker.getAnimations().map((a) => a.finished));
    root.classList.add('reduce-motion');
    key.click();
    const reducedClose = panel.hidden && panel.getAnimations().length === 0;
    key.click();
    const reducedOpen = !panel.hidden && panel.getAnimations().length === 0;
    return {
      immediateRelease,
      seamless,
      survived,
      pickerAnimated,
      reducedClose,
      reducedOpen,
      settled:
        document.querySelectorAll('.match-chat-line').length === 0 &&
        panel.getAnimations().length === 0,
    };
  });
  check(
    'closing releases input immediately while the glass settles',
    motionChecks.immediateRelease,
  );
  check(
    'interrupted closing reverses without an opacity jump',
    motionChecks.seamless,
  );
  check(
    'rapid open-close sequences settle into the correct state',
    motionChecks.survived,
  );
  check(
    'quick phrases have a finite opening transition',
    motionChecks.pickerAnimated,
  );
  check(
    'reduced motion opens and closes immediately without retained effects',
    motionChecks.reducedClose &&
      motionChecks.reducedOpen &&
      motionChecks.settled,
  );
  await sender.emulateMedia({ reducedMotion: 'reduce' });
  const systemReduced = await sender.evaluate(() => {
    document.documentElement.classList.remove('reduce-motion');
    const key =
        document.querySelector<HTMLButtonElement>('#match-chat-toggle')!,
      panel = document.querySelector<HTMLElement>('.match-chat-panel')!;
    key.click();
    const closed = panel.hidden && panel.getAnimations().length === 0;
    key.click();
    document.documentElement.classList.add('reduce-motion');
    return closed && !panel.hidden && panel.getAnimations().length === 0;
  });
  check(
    'operating-system reduced motion also bypasses chat effects',
    systemReduced,
  );
  await sender.emulateMedia({ reducedMotion: 'no-preference' });
  await receiver.evaluate(() => {
    document.documentElement.classList.remove('reduce-motion');
    const seen = new Set<string>();
    const observer = new MutationObserver(() => {
      for (const a of document.getAnimations()) {
        const target = (a.effect as KeyframeEffect)
          ?.target as HTMLElement | null;
        if (target)
          for (const name of [
            'match-chat-dot',
            'match-chat-preview',
            'match-chat-line',
          ])
            if (target.classList.contains(name)) seen.add(name);
      }
    });
    observer.observe(document.querySelector('#game')!, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
    (window as unknown as { __chatMotionProbe: unknown }).__chatMotionProbe = {
      seen,
      observer,
    };
  });
  check(
    'composer is visibly blank and retains an accessible name',
    await input(sender).evaluate(
      (e) =>
        !(e as HTMLInputElement).placeholder &&
        e.getAttribute('aria-label') === 'Message',
    ),
  );
  check(
    'ready chat has no redundant availability caption',
    await sender.locator('.match-chat-status').isHidden(),
  );
  await receiver.locator('#match-chat-toggle').click();
  check(
    'own-turn composer and every quick phrase are disabled',
    (await input(receiver).isDisabled()) &&
      (await receiver.locator('.match-chat-phrases button:enabled').count()) ===
        0,
  );
  await receiver.keyboard.press('Escape');
  await input(sender).fill('Hello across the board 🌲');
  await input(sender).press('Enter');
  await receiver.locator('.match-chat-dot:not([hidden])').waitFor();
  check(
    'live closed-state unread dot and restrained preview',
    await receiver.locator('.match-chat-preview').isVisible(),
  );
  await receiver.screenshot({ path: `${out}/closed-preview.png` });
  await receiver.locator('#match-chat-toggle').click();
  await receiver
    .locator('.match-chat-log')
    .getByText('Hello across the board 🌲', { exact: true })
    .waitFor();
  check(
    'both actual authenticated clients receive persisted message',
    (await sender.locator('.match-chat-line').count()) === 1 &&
      (await receiver.locator('.match-chat-line').count()) === 1,
  );
  check(
    'open chat clears unread',
    !(await receiver.locator('.match-chat-dot').isVisible()),
  );
  check(
    'reopening unread chat marks where new messages begin',
    (await receiver.locator('.match-chat-unread').count()) === 1,
  );
  now += 2000;
  check(
    'quick phrases stay hidden until requested',
    !(await sender.locator('.match-chat-phrases').isVisible()),
  );
  await sender
    .getByRole('button', { name: 'Quick phrases', exact: true })
    .click();
  await sender.screenshot({ path: `${out}/quick-phrases.png` });
  await sender.keyboard.press('Escape');
  check(
    'Escape closes only the phrase picker and restores its trigger',
    (await sender.locator('.match-chat-panel').isVisible()) &&
      !(await sender.locator('.match-chat-phrases').isVisible()) &&
      (await sender
        .locator('.match-chat-phrase-toggle')
        .evaluate((e) => e === document.activeElement)),
  );
  await sender
    .getByRole('button', { name: 'Quick phrases', exact: true })
    .click();
  await sender.locator('.match-chat-phrases button').first().click();
  check(
    'choosing a quick phrase dismisses the picker',
    !(await sender.locator('.match-chat-phrases').isVisible()),
  );
  await receiver
    .locator('.match-chat-log')
    .getByText('Good luck!', { exact: true })
    .waitFor();
  check('quick phrase ID renders naturally for both clients', true);
  check(
    'consecutive messages share one visible speaker and timestamp',
    (await receiver.locator('.match-chat-line').count()) === 2 &&
      (await receiver.locator('.match-chat-meta:not([hidden])').count()) === 1,
  );
  const incomingMotion = await receiver.evaluate(() => {
    const probe = (
      window as unknown as {
        __chatMotionProbe: { seen: Set<string>; observer: MutationObserver };
      }
    ).__chatMotionProbe;
    probe.observer.disconnect();
    document.documentElement.classList.add('reduce-motion');
    return [...probe.seen];
  });
  check(
    'new messages animate once in the transcript and cue the closed cockpit key',
    ['match-chat-dot', 'match-chat-preview', 'match-chat-line'].every((name) =>
      incomingMotion.includes(name),
    ),
  );

  // A committed message whose HTTP response is deliberately lost: retry must return its row.
  now += 2000;
  await sender.route('**/chat', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fetch();
      await route.abort('failed');
      await sender.unroute('**/chat');
    } else await route.continue();
  });
  await input(sender).fill('Lost response, one message');
  await input(sender).press('Enter');
  await sender
    .locator('.match-chat-log')
    .getByText('Lost response, one message', { exact: true })
    .waitFor();
  await sender.locator('.match-chat-outgoing').waitFor({ state: 'hidden' });
  check(
    'lost-response history recovery creates exactly one database message',
    (
      await chat.execute(senderIdentity.player.id, id, { kind: 'history' }, now)
    ).messages.filter((m) => m.text === 'Lost response, one message').length ===
      1,
  );
  // Script-like input must be text, never executable HTML.
  now += 2000;
  await input(sender).fill('<img src=x onerror=alert(1)>');
  await input(sender).press('Enter');
  await receiver
    .locator('.match-chat-log')
    .getByText('<img src=x onerror=alert(1)>', { exact: true })
    .waitFor();
  check(
    'untrusted text never creates an HTML element',
    (await receiver.locator('.match-chat-log img').count()) === 0,
  );
  await receiver
    .getByRole('button', { name: 'Chat controls', exact: true })
    .click();
  await receiver
    .getByRole('button', { name: 'Mute previews', exact: true })
    .click();
  await receiver.keyboard.press('Escape');
  now += 2000;
  await input(sender).fill('Muted message');
  await input(sender).press('Enter');
  await receiver.waitForTimeout(250);
  check(
    'mute suppresses dot and preview',
    !(await receiver.locator('.match-chat-dot').isVisible()) &&
      !(await receiver.locator('.match-chat-preview').isVisible()),
  );
  await receiver.locator('#match-chat-toggle').click();
  await receiver
    .locator('.match-chat-log')
    .getByText('Muted message', { exact: true })
    .waitFor();
  check('muting preserves readable history', true);
  await receiver.locator('.match-chat-presence[data-presence="online"]').waitFor();
  check('chat reuses the real-time button status for its green opponent dot', true);
  opponentPresence = 'offline';
  await receiver.locator('.match-chat-presence[data-presence="away"]').waitFor();
  check('existing heartbeat marks an offline opponent red', true);
  opponentPresence = 'online';
  await receiver.locator('.match-chat-presence[data-presence="online"]').waitFor();
  check('report actions are hidden until the message menu opens',
    !(await receiver.locator('.match-chat-report').first().isVisible()));
  await receiver.locator('.match-chat-message-actions summary').first().click();
  check('message menu has a comfortable touch target',
    await receiver.locator('.match-chat-message-actions summary').first().evaluate(e => {
      const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44;
    }));
  await receiver.keyboard.press('Escape');
  check('Escape closes message actions without closing chat',
    await receiver.locator('.match-chat-panel').isVisible() &&
    !(await receiver.locator('.match-chat-report').first().isVisible()));
  await receiver.locator('.match-chat-message-actions summary').first().click();
  await receiver.locator('.match-chat-report').first().click();
  await receiver
    .getByRole('button', { name: 'Send report', exact: true })
    .click();
  await receiver
    .getByText('Report sent for review.', { exact: true })
    .waitFor();
  check('real report action succeeds', true);
  await receiver
    .getByRole('button', { name: 'Block chat with opponent', exact: true })
    .click();
  await sender.waitForFunction(
    () =>
      (document.querySelector('.match-chat-form input') as HTMLInputElement)
        .disabled,
  );
  check('block notification disables the other client', true);
  await receiver
    .getByRole('button', { name: 'Unblock opponent', exact: true })
    .click();
  await sender.waitForFunction(
    () =>
      !(document.querySelector('.match-chat-form input') as HTMLInputElement)
        .disabled,
  );
  // Turn changes while an unsent draft is open.
  await input(sender).fill('Keep this draft');
  const actor = await service.authenticate(receiverIdentity.token);
  for (let n = 0; n < 5; n++) {
    const v = await service.viewPayload(actor, id);
    if (v.actor !== v.seat) break;
    const action =
      v.legalActions.find((a) => a.t === 'Draw') ??
      v.legalActions.find((a) => a.t === 'EndAct') ??
      v.legalActions.find((a) => a.t === 'Discard');
    assert.ok(action);
    await service.submitAction(actor, id, {
      action,
      expectedRevision: v.revision,
      requestId: newId(),
    });
  }
  await sender.waitForFunction(
    () =>
      (document.querySelector('.match-chat-form input') as HTMLInputElement)
        .disabled,
  );
  check(
    'turn boundary immediately disables composer and keeps unsent draft',
    (await input(sender).inputValue()) === 'Keep this draft',
  );
  await receiver.waitForFunction(
    () =>
      !(document.querySelector('.match-chat-form input') as HTMLInputElement)
        .disabled,
  );
  // Reconnect the real production channel protocol path and restore missed persisted data.
  for (const ws of [...wires.keys()])
    ws.close({ code: 1001, reason: 'local reconnect test' });
  now += 2000;
  await chat.execute(
    receiverIdentity.player.id,
    id,
    {
      kind: 'send',
      content: { text: 'Stored while disconnected', phrase: null },
      requestId: newId(),
      turnRevision: (await storage.matchById(id))!.turnStartRevision,
    },
    now,
  );
  await sender
    .locator('.match-chat-log')
    .getByText('Stored while disconnected', { exact: true })
    .waitFor();
  check('Realtime reconnect restores offline persisted history', connects >= 4);
  now += 2000;
  await input(receiver).fill('That was a lovely move.');
  await input(receiver).press('Enter');
  await receiver
    .locator('.match-chat-log')
    .getByText('That was a lovely move.', { exact: true })
    .waitFor();

  await receiver.keyboard.press('Escape');
  await sender.keyboard.press('Escape');
  const visual = receiver;
  await visual
    .locator('.match-chat-controls')
    .evaluate((e) => ((e as HTMLDetailsElement).open = false));
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [390, 844],
    [844, 390],
    [1024, 768],
    [1280, 800],
    [1440, 900],
    [1920, 1080],
  ]) {
    await visual.setViewportSize({ width: width!, height: height! });
    if (
      (await visual
        .locator('#match-chat-toggle')
        .getAttribute('aria-expanded')) !== 'true'
    )
      await visual.locator('#match-chat-toggle').click();
    await visual.locator('.match-chat-panel').waitFor({ state: 'visible' });
    await visual.waitForTimeout(150);
    const geometry = await visual.evaluate(() => {
      const p = document
          .querySelector('.match-chat-panel')!
          .getBoundingClientRect(),
        t = document
          .querySelector('#match-chat-toggle')!
          .getBoundingClientRect(),
        context = document
          .querySelector('#smart-context')!
          .getBoundingClientRect();
      const gap = parseFloat(
        getComputedStyle(document.querySelector('#smart-panel')!).rowGap,
      );
      const buttons = [
        ...document.querySelectorAll<HTMLButtonElement>(
          '.match-chat-panel button',
        ),
      ].filter((b) => b.offsetWidth && b.offsetHeight);
      const docked =
        document.querySelector<HTMLElement>('.match-chat')!.dataset
          .desktopDocked === 'true';
      const box = document
        .querySelector('#futa04-box')!
        .getBoundingClientRect();
      return {
        desktopAligned:
          innerWidth < 1000 ||
          document.documentElement.dataset.layout !== 'side' ||
          (docked &&
            Math.abs((p.left + p.right - box.left - box.right) / 2) < 1 &&
            Math.abs(context.top - p.bottom - 8) < 1 &&
            p.width <= box.width + 1),
        reading:
          p.height >= (docked ? 240 : Math.min(500, innerHeight - 80)) &&
          parseFloat(
            getComputedStyle(document.querySelector('.match-chat-text')!)
              .fontSize,
          ) === 14,
        triggerHidden:
          getComputedStyle(document.querySelector('#match-chat-toggle')!)
            .visibility === 'hidden',
        frameless:
          getComputedStyle(document.querySelector('.match-chat-panel')!)
            .borderTopWidth === '0px',
        phrasesHidden: (
          document.querySelector('.match-chat-phrases') as HTMLElement
        ).hidden,
        bounds:
          p.left >= 0 &&
          p.right <= innerWidth + 1 &&
          p.bottom <= innerHeight + 1,
        scroll: document.documentElement.scrollWidth <= innerWidth,
        cockpitKey:
          Math.abs(t.left - context.left) < 1 &&
          Math.abs(t.width - context.width) < 1 &&
          Math.abs(t.height - context.height) < 1 &&
          Math.abs(context.top - t.bottom - gap) < 1,
        hardware:
          getComputedStyle(
            document.querySelector('#match-chat-toggle')!,
            '::before',
          ).backgroundImage ===
          getComputedStyle(
            document.querySelector('#smart-context')!,
            '::before',
          ).backgroundImage,
        targets: buttons.every((b) => b.getBoundingClientRect().height >= 43),
        glass: getComputedStyle(document.querySelector('.match-chat-panel')!)
          .backgroundColor,
      };
    });
    if (Object.values(geometry).some((v) => v === false)) {
      console.log('CHAT_GEOMETRY', width, height, geometry);
      await visual.screenshot({
        path: `${out}/alignment-failure-${width}.png`,
      });
      console.log(
        await visual.evaluate(() => ({
          layout: document.documentElement.dataset.layout,
          box: document
            .querySelector('#futa04-box')!
            .getBoundingClientRect()
            .toJSON(),
          panel: document
            .querySelector('.match-chat-panel')!
            .getBoundingClientRect()
            .toJSON(),
          key: document
            .querySelector('#match-chat-toggle')!
            .getBoundingClientRect()
            .toJSON(),
          vars: document.querySelector<HTMLElement>('.match-chat')!.style
            .cssText,
        })),
      );
    }
    check(
      `${width}×${height}: expanded reading panel, compact message text, hidden phrases and accessible controls`,
      geometry.triggerHidden &&
        geometry.desktopAligned &&
        geometry.frameless &&
        geometry.reading &&
        geometry.phrasesHidden &&
        geometry.bounds &&
        geometry.scroll &&
        geometry.cockpitKey &&
        geometry.hardware &&
        geometry.targets,
    );
    check(
      `${width}×${height}: actual shared dark-glass recipe`,
      geometry.glass === 'rgba(8, 10, 10, 0.42)',
    );
    await visual.screenshot({ path: `${out}/chat-${width}x${height}.png` });
    await visual.keyboard.press('Escape');
    await visual.locator('.match-chat-panel').waitFor({ state: 'hidden' });
    if (width === 390)
      check(
        'cockpit chat focus uses a quiet glow without a bright outline',
        await visual.locator('#match-chat-toggle').evaluate((e) => {
          const s = getComputedStyle(e);
          return (
            e === document.activeElement &&
            s.outlineStyle === 'none' &&
            s.boxShadow !== 'none'
          );
        }),
      );
    await visual.screenshot({ path: `${out}/cockpit-${width}x${height}.png` });
  }
  // Maximum-length unbroken text must wrap on a narrow touch viewport.
  now += 2000;
  const longMessage = 'あ'.repeat(280);
  await receiver.setViewportSize({ width: 320, height: 568 });
  await receiver.locator('#match-chat-toggle').click();
  await input(receiver).fill(longMessage);
  await input(receiver).press('Enter');
  await receiver.locator('.match-chat-log').getByText(longMessage, { exact: true }).waitFor();
  check('maximum-length Unicode message wraps without horizontal mobile scrolling',
    await receiver.locator('.match-chat-text').last().evaluate(e =>
      e.scrollWidth <= e.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth));
  await receiver.screenshot({ path: `${out}/long-message-mobile.png` });
  await receiver.keyboard.press('Escape');
  await sender.setViewportSize({ width: 390, height: 844 });
  if (
    (await sender
      .locator('#match-chat-toggle')
      .getAttribute('aria-expanded')) !== 'true'
  )
    await sender.locator('#match-chat-toggle').click();
  await sender.locator('.match-chat-panel').waitFor({ state: 'visible' });
  // Opening the panel pins the log to its reading start on the NEXT frame (unread divider or the
  // latest message). Let that settle first, so this check really starts from "already at the end".
  await sender.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  await sender.evaluate(() => {
    const v = visualViewport!;
    Object.defineProperty(v, 'height', { configurable: true, value: 430 });
    v.dispatchEvent(new Event('resize'));
  });
  check(
    'visualViewport keyboard resize keeps composer above keyboard',
    await sender.evaluate(
      () =>
        document.querySelector('.match-chat-form')!.getBoundingClientRect()
          .bottom <= 430,
    ),
  );
  check(
    'keyboard resizing keeps the latest message in view when already at the end',
    await sender.evaluate(() => {
      const log = document.querySelector('.match-chat-log')!;
      return log.scrollHeight - log.scrollTop - log.clientHeight < 44;
    }),
  );
  await sender.screenshot({ path: `${out}/keyboard-resize.png` });
  // Real browser offline/online events, preserving an existing draft; no pretend delivery.
  await sender.context().setOffline(true);
  await sender.getByText('Offline · draft saved', { exact: true }).waitFor();
  check('offline status is quiet and retains the draft',
    await input(sender).inputValue() === 'Keep this draft');
  await sender.context().setOffline(false);
  await sender.getByText('Offline · draft saved', { exact: true }).waitFor({ state: 'hidden' });
  await sender.evaluate(() => {
    const v = visualViewport!;
    Object.defineProperty(v, 'height', { configurable: true, value: 260 });
    Object.defineProperty(v, 'offsetTop', { configurable: true, value: 24 });
  });
  await sender.setViewportSize({ width: 844, height: 390 });
  await sender.evaluate(() => visualViewport!.dispatchEvent(new Event('resize')));
  await sender.waitForTimeout(100);
  check('landscape keyboard and viewport offset keep composer visible without page overflow',
    await sender.evaluate(() => {
      const r = document.querySelector('.match-chat-form')!.getBoundingClientRect();
      return r.top >= 24 && r.bottom <= 284 && document.documentElement.scrollWidth <= innerWidth;
    }));
  await sender.screenshot({ path: `${out}/keyboard-landscape.png` });
  await sender.evaluate(() => {
    delete (visualViewport as unknown as {height?: number}).height;
    delete (visualViewport as unknown as {offsetTop?: number}).offsetTop;
  });
  await sender.setViewportSize({ width: 390, height: 844 });

  await sender.keyboard.press('Escape');
  check(
    'Escape restores focus to chat control',
    await sender
      .locator('#match-chat-toggle')
      .evaluate((e) => e === document.activeElement),
  );
  // Leave each match via the actual menu; the channel must release its last subscription/socket.
  const cancelledOnExit = await sender.evaluate(() => {
    document.documentElement.classList.remove('reduce-motion');
    const key =
        document.querySelector<HTMLButtonElement>('#match-chat-toggle')!,
      panel = document.querySelector<HTMLElement>('.match-chat-panel')!;
    key.click();
    key.click();
    const closing = panel.getAnimations()[0]!;
    closing.pause();
    document.getElementById('gm-main')!.click();
    return (
      closing.playState === 'idle' &&
      !document.querySelector('#match-chat-panel')
    );
  });
  check('leaving a match cancels an active closing animation', cancelledOnExit);
  for (const p of [receiver]) {
    await p.locator('#hud-menu').click();
    await p.locator('#gm-main').click();
  }
  await sender.waitForTimeout(150);
  check(
    'leaving both matches removes chat DOM and subscriptions',
    (await sender.locator('#match-chat-panel').count()) === 0 &&
      (await receiver.locator('#match-chat-panel').count()) === 0 &&
      [...wires.values()].every((t) => !t.has(`realtime:${id}`)),
  );
  check('no browser page exceptions', errors.length === 0);
  console.log(
    `${passed} match chat browser checks passed. Screenshots: ${out}`,
  );
} finally {
  await browser.close();
  await new Promise<void>((r) => preview.server.httpServer.close(() => r()));
  await new Promise<void>((r) => server.close(() => r()));
  await pool?.end();
}
