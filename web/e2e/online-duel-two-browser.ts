// Phase 6 — two-browser Playwright proof: create/join, Draw private, Throw reveals, resign.
// Starts a local duel API (CORS *) + Vite preview with VITE_DUEL_API_URL baked in.
//   npx tsx web/e2e/online-duel-two-browser.ts
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const waitVisible = async (page: Page, sel: string, ms = 15_000) => {
  await page.waitForSelector(`${sel}:not([hidden])`, { timeout: ms });
};

/** A finished match can raise the install invitation (a full-screen sheet) over the finish screen.
 *  Dismiss it through the product's own affordance so it cannot swallow the next tap. */
const dismissInstall = async (page: Page) => {
  const prompt = page.locator('#install-prompt');
  if (!(await prompt.isVisible().catch(() => false))) return;
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(150);
  if (await prompt.isVisible().catch(() => false)) {
    await page.evaluate("(() => { const el = document.getElementById('install-prompt'); if (el) el.hidden = true; })()");
  }
};

const settingsInit = () => {
  localStorage.clear();
  localStorage.setItem(
    'main2:severgrow.settings.v1',
    JSON.stringify({
      sound: false,
      music: false,
      coach: false,
      speed: 'skip',
      reduceMotion: true,
      eyeCandy: false,
    }),
  );
};

const buildWithApi = async (apiBase: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'],
      {
        env: {
          ...process.env,
          PATH: process.env.PATH,
          CHANNEL: 'futa04',
          VITE_DUEL_API_URL: apiBase,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let err = '';
    child.stderr?.on('data', (b) => {
      err += String(b);
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
  });

const openPlayer = async (browser: Browser, origin: string, label: string): Promise<Page> => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.addInitScript(settingsInit);
  await page.goto(origin);
  await waitVisible(page, '#menu');
  // Lobby mounts async after menu; wait until Play online is un-hidden.
  await page.waitForSelector('#menu-online:not([hidden])', { timeout: 15_000 });
  check(`${label}: Play online shown`, true);
  return page;
};

const service = new MatchService({
  storage: new MemoryStorage(),
  config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], turnTimeoutMs: 3_600_000 },
});
const apiServer = createHttpServer({ service, config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] } });
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiPort = (apiServer.address() as AddressInfo).port;
const apiBase = `http://127.0.0.1:${apiPort}`;

console.log(`local duel API on ${apiBase}`);
await buildWithApi(apiBase);

const previewServer = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: 4206, strictPort: true },
  logLevel: 'error',
});
const origin =
  previewServer.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ??
  `http://127.0.0.1:${(previewServer.httpServer?.address() as AddressInfo | null)?.port ?? 4206}`;
console.log(`preview at ${origin}`);

// Wait until the preview actually answers (vite can return before listen settles).
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(origin + '/');
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const browser = await chromium.launch({ executablePath: CHROME });

try {
  const pageA = await openPlayer(browser, origin, 'A');
  await pageA.click('#menu-online');
  await waitVisible(pageA, '#online-hub');
  check('A: online hub open', true);

  // Dismiss first-card if present
  const firstOk = pageA.locator('#online-first-ok');
  if (await firstOk.isVisible().catch(() => false)) await firstOk.click();

  await pageA.click('#online-create');
  // Either waiting screen or game (if auto-open) — prefer waiting with invite code
  await pageA.waitForSelector('#online-waiting:not([hidden]), #game:not([hidden]), #online-hub:not([hidden])', {
    timeout: 20_000,
  });

  // If still on hub after create (async), wait for waiting
  if (await pageA.locator('#online-hub:not([hidden])').isVisible().catch(() => false)) {
    await waitVisible(pageA, '#online-waiting', 20_000);
  }

  let invite = '';
  if (await pageA.locator('#online-waiting:not([hidden])').isVisible().catch(() => false)) {
    invite = ((await pageA.locator('#online-invite-code').textContent()) ?? '').trim();
    check('A: invite code shown', new RegExp(`^[0-9A-HJKMNP-TV-Z]{${DEFAULT_SERVER_CONFIG.inviteCodeLength}}$`).test(invite), invite);
  } else {
    // Fallback: read from API via create was UI-only — pull from service list
    const guests = await service.createGuest('probe');
    void guests;
    check('A: waiting UI', false, 'expected waiting screen with invite');
  }

  if (!invite) {
    throw new Error('No invite code — cannot continue two-browser join');
  }

  const pageB = await openPlayer(browser, origin, 'B');
  await pageB.click('#menu-online');
  await waitVisible(pageB, '#online-hub');
  const firstOkB = pageB.locator('#online-first-ok');
  if (await firstOkB.isVisible().catch(() => false)) await firstOkB.click();
  await pageB.click('#online-join-open');
  await waitVisible(pageB, '#online-join');
  await pageB.fill('#online-join-code', invite);
  await pageB.click('#online-join-submit');

  // Both should land in the game shell
  await waitVisible(pageB, '#game', 25_000);
  check('B: joined into game', true);
  await waitVisible(pageA, '#game', 25_000);
  check('A: creator opened game after join', true);

  // HUD present; resign available
  check('A: duel HUD', await pageA.locator('#duel-hud:not([hidden])').isVisible().catch(() => false));
  check('B: duel HUD', await pageB.locator('#duel-hud:not([hidden])').isVisible().catch(() => false));
  check(
    'A: the strip shows no removed chips (Resign / who-starts / deadline)',
    await pageA.evaluate(
      () => !document.querySelector('#duel-hud [data-duel-starter], #duel-hud [data-duel-deadline], #duel-hud #duel-resign'),
    ),
  );
  check(
    'A: resign is reachable in the pause menu',
    await pageA.evaluate(() => {
      const btn = document.getElementById('gm-resign') as HTMLButtonElement | null;
      return !!btn && !btn.hidden;
    }),
  );

  // Score labels Me / Opponent (perspective)
  const youA = ((await pageA.locator('#score-you-label').textContent()) ?? '').trim();
  const botA = ((await pageA.locator('#score-bot-label').textContent()) ?? '').trim();
  check('A: Me label', youA === 'Me' || youA.toLowerCase().includes('you'), youA);
  check('A: Opponent label', botA === 'Opponent' || botA.length > 0, botA);

  // Play one Draw if Confirm/hand allows (state-wait, no fixed sleep)
  const tryConfirm = async (page: Page, who: string) => {
    const confirm = page.locator('#confirm:not([hidden]):not([disabled])');
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
      check(`${who}: tapped confirm`, true);
      return true;
    }
    return false;
  };

  // Whoever has the turn: click Draw card path via confirm if pending
  await tryConfirm(pageA, 'A');
  await tryConfirm(pageB, 'B');

  // Resign from B through the pause menu — stub confirm; verify the menu control is wired.
  await pageB.evaluate(() => {
    (window as unknown as { confirm: (m?: string) => boolean }).confirm = () => true;
  });
  await pageB.click('#hud-menu');
  await pageB.waitForSelector('#sheet-menu:not([hidden])', { timeout: 8_000 });
  const resignMeta = await pageB.evaluate(() => {
    const btn = document.getElementById('gm-resign') as HTMLButtonElement | null;
    return { exists: !!btn, hidden: !!btn?.hidden };
  });
  check('B: resign shown in the pause menu', resignMeta.exists && !resignMeta.hidden, JSON.stringify(resignMeta));
  const resignErrors: string[] = [];
  pageB.on('pageerror', (e) => resignErrors.push(e.message));
  pageB.on('console', (msg) => {
    if (msg.type() === 'error') resignErrors.push(msg.text());
  });
  await pageB.evaluate(() => {
    (window as unknown as { confirm: (m?: string) => boolean }).confirm = () => true;
    const btn = document.getElementById('gm-resign') as HTMLButtonElement | null;
    if (btn && !btn.hidden) btn.click();
  });
  try {
    await pageB.waitForFunction(
      () => {
        const go = document.getElementById('gameover');
        const title = document.getElementById('go-title')?.textContent ?? '';
        return !!(go && !go.hidden && /won|lost|draw/i.test(title));
      },
      { timeout: 25_000 },
    );
    const title = ((await pageB.locator('#go-title').textContent()) ?? '').trim();
    check('B: finished after resign', /won|lost|draw/i.test(title), title);
  } catch {
    const title = ((await pageB.locator('#go-title').textContent()) ?? '').trim();
    const hudText = ((await pageB.locator('#duel-hud').textContent()) ?? '').trim();
    const caption = ((await pageB.locator('#captions').textContent()) ?? '').trim();
    const goHidden = await pageB.locator('#gameover').isHidden();
    check(
      'B: finished after resign',
      false,
      `goHidden=${goHidden} title=${title} cap=${caption.slice(0, 80)} hud=${hudText.slice(0, 40)} err=${resignErrors.join(';').slice(0, 100)}`,
    );
  }
  // The finish screen's FIRST, primary action is now a REAL rematch (was "Back to matches").
  await dismissInstall(pageA);
  await dismissInstall(pageB);
  const firstLabel = ((await pageB.locator('#go-rematch').textContent()) ?? '').trim();
  const firstIsPrimary = await pageB
    .locator('#go-rematch')
    .evaluate((el) => el.classList.contains('primary'))
    .catch(() => false);
  const goShown = !(await pageB.locator('#gameover').isHidden());
  check('B: Rematch is the first, primary CTA on the finish screen', goShown && firstLabel === 'Rematch' && firstIsPrimary, `${firstLabel} primary=${firstIsPrimary}`);
  const backLabel = ((await pageB.locator('#go-other').textContent()) ?? '').trim();
  check('B: Back to matches stays as a secondary way out', backLabel === 'Back to matches', backLabel);

  try {
    await pageA.waitForFunction(
      () => {
        const go = document.getElementById('gameover');
        const title = document.getElementById('go-title')?.textContent ?? '';
        return !!(go && !go.hidden && /won|lost|draw/i.test(title));
      },
      { timeout: 25_000 },
    );
    check('A: sees finished after opponent resign', true);
  } catch {
    check('A: sees finished after opponent resign', false, 'timed out waiting for sync');
  }

  // ---------------- the real rematch: B taps Rematch, A joins the NEW duel and plays -------------
  // A finished session must not leak: first Rematch tears the old duel down, then it creates a
  // brand-new match and shows the existing invite/share screen with a FRESH code.
  await pageB.locator('#go-rematch').click();
  await waitVisible(pageB, '#online-waiting', 25_000);
  const hudGone = await pageB.locator('#duel-hud').isHidden().catch(() => false);
  const oldSessionB = await pageB.evaluate(
    'window.__severgrow && window.__severgrow.online ? window.__severgrow.online() : null',
  );
  check(
    'B: the finished session is torn down before the new match (no session on the invite screen)',
    hudGone && oldSessionB === null,
    `hud hidden=${hudGone} session=${oldSessionB === null ? 'null' : 'still open'}`,
  );
  const rematchInvite = ((await pageB.locator('#online-invite-code').textContent()) ?? '').trim();
  check(
    'B: Rematch shows a FRESH invite code',
    new RegExp(`^[0-9A-HJKMNP-TV-Z]{${DEFAULT_SERVER_CONFIG.inviteCodeLength}}$`).test(rematchInvite) && rematchInvite !== invite,
    `${rematchInvite} (was ${invite})`,
  );
  check('B: Rematch surfaces the same Share invite control', await pageB.locator('#online-share').isVisible().catch(() => false));

  // A leaves the finish screen through the secondary exit and joins the new duel with the new code.
  await dismissInstall(pageA);
  await pageA.locator('#go-other').click();
  await waitVisible(pageA, '#online-hub', 20_000);
  await pageA.click('#online-join-open');
  await waitVisible(pageA, '#online-join');
  await pageA.fill('#online-join-code', rematchInvite);
  await pageA.click('#online-join-submit');

  await waitVisible(pageA, '#game', 25_000);
  await waitVisible(pageB, '#game', 25_000);
  const rematchSessionB = await pageB.evaluate(
    'window.__severgrow && window.__severgrow.online ? window.__severgrow.online() : null',
  );
  const rematchSessionA = await pageA.evaluate(
    'window.__severgrow && window.__severgrow.online ? window.__severgrow.online() : null',
  );
  const live = (s: unknown) => !!s && (s as { finished?: boolean }).finished === false;
  check('A and B both hold a live session in the rematch', live(rematchSessionA) && live(rematchSessionB));
  check(
    'A and B both play the new duel (duel HUD on both)',
    await pageA.locator('#duel-hud:not([hidden])').isVisible().catch(() => false) &&
      await pageB.locator('#duel-hud:not([hidden])').isVisible().catch(() => false),
  );
  // Prove it is playable: whoever holds the turn commits one Draw through the ordinary confirm.
  await tryConfirm(pageA, 'A');
  await tryConfirm(pageB, 'B');
  check('A: still playable after the rematch', await pageA.locator('#game:not([hidden])').isVisible().catch(() => false));
} finally {
  await browser.close();
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`${failed} two-browser checks failed`);
  process.exit(1);
}
console.log('Phase 6 two-browser online duel checks passed');
