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
  await page.locator(`[data-match-id="${id}"]`).click();
  await page.locator('#match-chat-toggle').waitFor();
  return page;
};
const input = (p: Page) => p.locator('.match-chat-form input');
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
  await sender.getByRole('button', { name: 'Retry', exact: true }).waitFor();
  await sender.getByRole('button', { name: 'Retry', exact: true }).click();
  await sender.waitForFunction(
    () => !document.querySelector('.match-chat-outgoing button'),
  );
  check(
    'lost-response retry creates exactly one database message',
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
    [1280, 800],
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
        menu = document.querySelector('#hud-menu')!.getBoundingClientRect(),
        logo = document.querySelector('#hud-brand')?.getBoundingClientRect();
      const buttons = [
        ...document.querySelectorAll<HTMLButtonElement>(
          '.match-chat-panel button',
        ),
      ].filter((b) => b.offsetWidth && b.offsetHeight);
      return {
        reading:
          p.height >= Math.min(500, innerHeight - 80) &&
          parseFloat(
            getComputedStyle(document.querySelector('.match-chat-text')!)
              .fontSize,
          ) >= 18,
        phrasesHidden: (
          document.querySelector('.match-chat-phrases') as HTMLElement
        ).hidden,
        bounds:
          p.left >= 0 &&
          p.right <= innerWidth + 1 &&
          p.bottom <= innerHeight + 1,
        scroll: document.documentElement.scrollWidth <= innerWidth,
        menu: t.left >= menu.right - 1,
        logo: !logo || t.right <= logo.left,
        targets: buttons.every((b) => b.getBoundingClientRect().height >= 43),
        glass: getComputedStyle(document.querySelector('.match-chat-panel')!)
          .backgroundColor,
      };
    });
    check(
      `${width}×${height}: expanded reading panel, larger text, hidden phrases and accessible controls`,
      geometry.reading &&
        geometry.phrasesHidden &&
        geometry.bounds &&
        geometry.scroll &&
        geometry.menu &&
        geometry.logo &&
        geometry.targets,
    );
    check(
      `${width}×${height}: actual shared dark-glass recipe`,
      geometry.glass === 'rgba(8, 10, 10, 0.42)',
    );
    await visual.screenshot({ path: `${out}/chat-${width}x${height}.png` });
    await visual.keyboard.press('Escape');
  }
  await sender.setViewportSize({ width: 390, height: 844 });
  if (
    (await sender
      .locator('#match-chat-toggle')
      .getAttribute('aria-expanded')) !== 'true'
  )
    await sender.locator('#match-chat-toggle').click();
  await sender.locator('.match-chat-panel').waitFor({ state: 'visible' });
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
  await sender.keyboard.press('Escape');
  check(
    'Escape restores focus to chat control',
    await sender
      .locator('#match-chat-toggle')
      .evaluate((e) => e === document.activeElement),
  );
  // Leave each match via the actual menu; the channel must release its last subscription/socket.
  for (const p of [sender, receiver]) {
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
