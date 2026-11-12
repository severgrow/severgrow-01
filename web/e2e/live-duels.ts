// FUTASAKU live duels — two separate browser contexts against a local live-enabled duel API
// (memory storage, LIVE_TURN_MS = 15 s). Every wait is on STATE (polled), never a fixed sleep.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx web/e2e/live-duels.ts
//   SHOTS=1 ... also writes docs/screens/live/*.png at 390x844.
import { applyAs, legalActions, matchSetup, stateFromSetup, viewFor } from '../../src/engine/index.js';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike } from '../../server/src/client.js';
import { DEFAULT_LIVE_CONFIG } from '../../server/src/live/config.js';
import { MemoryLiveStore } from '../../server/src/live/memory.js';
import { createLiveRuntime } from '../../server/src/live/runtime.js';
import type { MatchListEntry } from '../../server/src/protocol.js';
import { CHROME, openDuel, openSeat } from './helpers/local-duel.js';
import type { LocalDuel, LocalMatch, SeatSession } from './helpers/local-duel.js';

const PORT = 4231;
const dist = process.env.FUTA_DIST;
const SHOTS = process.env.SHOTS === '1';
const SHOT_DIR = process.env.LIVE_SHOTS_DIR ?? 'docs/screens/live';
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);
const LIVE_TURN_MS = 15_000;

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const tick = (ms = 100) => new Promise((r) => setTimeout(r, ms));

/** Poll a condition until true (state-based wait). */
const waitFor = async (cond: () => Promise<boolean> | boolean, timeout = 20_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await cond()) return true;
    } catch {
      /* page navigating */
    }
    await tick(100);
  }
  return false;
};

// ---------------------------------------------------------------- server + build

const memory = new MemoryStorage();
let nextFixtureSeed: number | null = null;
const createStoredMatch = memory.createMatch.bind(memory);
memory.createMatch = async match => {
  if (nextFixtureSeed !== null) {
    const setup=matchSetup(nextFixtureSeed,match.rulesVersion);nextFixtureSeed=null;
    match={...match,seed:setup.seed,config:setup.config,startingPlayer:setup.startingPlayer,state:stateFromSetup(setup)};
  }
  return createStoredMatch(match);
};
// A persistent draft needs an optional Bloom still available. Otherwise the product's fixed
// Auto-skip legitimately commits EndAct after the Grow, making a transient draft a bad fixture.
const persistentDraftFixture = () => {
  for(let seed=1;seed<=1000;seed++) {
    const setup=matchSetup(seed,server.rulesVersion);if(setup.startingPlayer!==1)continue;
    const drawn=applyAs(stateFromSetup(setup),1,{t:'Draw',from:'deck'});
    const legal=legalActions(viewFor(drawn,1));
    const bloomCards=new Set(legal.flatMap(a=>a.t==='Bloom'?a.cards:[]));
    const sprouts=legal.filter(a=>a.t==='Sprout'&&!bloomCards.has(a.card));
    for(const card of new Set(sprouts.map(a=>a.t==='Sprout'?a.card:-1))) {
      if(sprouts.filter(a=>a.t==='Sprout'&&a.card===card).every(a=>legalActions(viewFor(applyAs(drawn,1,a),1)).some(next=>next.t==='Bloom')))return {seed,card};
    }
  }
  throw new Error('No persistent-draft fixture found');
};
const server = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], turnTimeoutMs: 24 * 3_600_000 };
const live = createLiveRuntime({
  storage: memory,
  live: new MemoryLiveStore(memory),
  server,
  config: {
    ...DEFAULT_LIVE_CONFIG,
    turnMs: LIVE_TURN_MS,
    replayAllowanceMs: 3_000,
    entryAllowanceMs: 4_000,
    challengeTtlMs: 12_000,
    challengesPerPlayerPerHour: 1000,
    presencePerPlayerPerMinute: 1000,
  },
});
const service = new MatchService({ storage: live.storage, config: server });
const apiServer = createHttpServer({ service, config: server, live: live.router(service) });
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}`;
console.log(`local live duel API on ${apiBase}`);

await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts', ...(dist ? ['--outDir',dist] : [])], {
    env: {
      ...process.env,
      CHANNEL: 'futa05',
      VITE_LIVE_DUELS: '1',
      VITE_DUEL_API_URL: apiBase,
      VITE_SUPABASE_URL: 'http://127.0.0.1:9',
      VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => (err += String(b)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
});
const previewServer = await preview({ ...(dist ? {build:{outDir:dist}} : {}), configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const origin = previewServer.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;
const nodeFetch: FetchLike = (url, init) => fetch(url, init);
const api = new DuelClient({ baseUrl: apiBase, fetch: nodeFetch });
const browser: Browser = await chromium.launch({ executablePath: CHROME });

/**
 * Guests this harness created, so a scenario can hand back the matches it opened before the next one
 * starts. Every scenario gets its OWN fresh guests (`newMatch` mints a new guest unless the scenario
 * deliberately reuses one, as 3 and 4 do to prove the multi-match behaviour), so each guest's
 * open-match baseline is 0 and the invariant is simply that it returns to 0.
 */
let scenarioGuests: string[] = [];
const runGuests: string[] = [];
const rememberGuest = (token: string): void => {
  scenarioGuests.push(token);
  runGuests.push(token);
};

const newMatch = async (guests?: [LocalMatch['guests'][0] | null, LocalMatch['guests'][1] | null]): Promise<LocalMatch> => {
  const g = async () => {
    const r = await api.createGuest();
    rememberGuest(r.token);
    return { token: r.token, playerId: r.player.id, displayName: r.player.displayName };
  };
  const creator = guests?.[0] ?? (await g());
  const joiner = guests?.[1] ?? (await g());
  const created = await api.createMatch(creator.token);
  const joined = await api.joinMatch(joiner.token, created.match.inviteCode);
  const starterSeat: 0 | 1 = created.player.startingPlayer === created.player.seat ? created.player.seat : joined.player.seat;
  return { matchId: created.match.matchId, guests: [creator, joiner], inviteCode: created.match.inviteCode, starterSeat };
};
const duel = { origin, browser } as unknown as LocalDuel;

// ---------------------------------------------------------------- match hygiene

/**
 * A guest's OPEN matches, read from the product's own list endpoint — the same rows the lobby renders
 * as `#online-matches li[data-match-id]`. `finished` never counts: the per-player cap is on open
 * matches only (`server/src/config.ts` `maxOpenMatchesPerPlayer = 10`).
 */
const openMatchesOf = async (token: string): Promise<MatchListEntry[]> => {
  const list = await api.listMatches(token);
  return list.matches.filter((m) => m.status !== 'finished');
};

/**
 * Hand back everything a scenario left open, through the REAL product paths: an in-play match is
 * resigned (`POST /v1/matches/:id/resign`), a parked search is retired with the matchmaking `cancel`.
 * Nothing is deleted directly, so the cleanup also exercises those paths, and both calls are
 * tolerated-when-unnecessary (a match the scenario already resigned answers MATCH_FINISHED).
 *
 * Without this the harness would creep toward the 10-open-match cap and a scenario that hit it would
 * fail on a missing lobby row instead of proving anything — a false signal, worse than a failure.
 */
const closeOpenMatches = async (token: string): Promise<void> => {
  for (let round = 0; round < 3; round++) {
    const open = await openMatchesOf(token).catch(() => [] as MatchListEntry[]);
    if (open.length === 0) return;
    for (const m of open) {
      if (m.status === 'active') await api.resign(token, m.matchId).catch(() => undefined);
      else await api.cancelSearch(token).catch(() => undefined);
    }
  }
};

/**
 * Finish this scenario's matches and PROVE the open-match count is back where it started. The
 * verifying read is deliberately NOT error-tolerant: a guest whose state cannot be read is a failed
 * proof, not a pass, so an unreachable API can never look like a clean teardown.
 */
const teardownScenario = async (name: string): Promise<void> => {
  const guests = [...new Set(scenarioGuests)];
  scenarioGuests = [];
  for (const token of guests) await closeOpenMatches(token);
  const left: string[] = [];
  let unreadable = 0;
  for (const token of guests) {
    try {
      for (const m of await openMatchesOf(token)) left.push(`${m.matchId}(${m.status})`);
    } catch {
      unreadable += 1;
    }
  }
  check(
    `${name}: cleanup — open-match count back to its baseline`,
    left.length === 0 && unreadable === 0,
    `${guests.length} guest(s), ${left.length} left open${left.length ? `: ${left.join(', ')}` : ''}${unreadable ? `, ${unreadable} unreadable` : ''}`,
  );
};

// ---------------------------------------------------------------- page helpers

type LiveDebug = {
  status: null | { live: boolean; matchId: string; mySeat: 0 | 1; actor: 0 | 1; endedReason: string | null; turnDeadlineAt: number | null; opponent: { presence: string } };
  target: null | { kind: string; matchId?: string };
  popup: boolean;
};
const dbg = (s: SeatSession): Promise<LiveDebug | null> =>
  s.page.evaluate(() => (window as unknown as { __futasakuLive?: () => unknown }).__futasakuLive?.() ?? null).catch(() => null) as Promise<LiveDebug | null>;
const vis = (p: Page, sel: string) => p.locator(sel).first().isVisible().catch(() => false);
const text = (p: Page, sel: string) => p.locator(sel).first().textContent().then((t) => (t ?? '').trim()).catch(() => '');
const currentMatch = (s: SeatSession): Promise<string | null> =>
  s.page.evaluate(() => {
    const st = (window as unknown as { __futasakuLive?: () => { status: { matchId: string } | null } }).__futasakuLive?.();
    return st?.status?.matchId ?? null;
  });
const myTurn = (s: SeatSession): Promise<boolean> =>
  s.page.evaluate(() => !!(window as unknown as { __severgrow: { online: () => { myTurn: boolean } | null } }).__severgrow.online()?.myTurn);
const phase = (s: SeatSession): Promise<string> =>
  s.page.evaluate(() => (window as unknown as { __severgrow: { state: () => { phase: string } | null } }).__severgrow.state()?.phase ?? '');
const shot = async (s: SeatSession, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await s.page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
};

/** One whole turn through the page's own controls: Draw from the deck, skip Grow, throw a card. */
const playTurn = async (s: SeatSession): Promise<boolean> => {
  if (!(await waitFor(() => myTurn(s), 30_000))) return false;
  await waitFor(async () => (await phase(s)) === 'DRAW', 5_000);
  for (let i = 0; i < 6 && (await phase(s)) === 'DRAW'; i++) {
    await s.page.locator('#deck').click({ force: true }).catch(() => undefined);
    await waitFor(async () => (await phase(s)) !== 'DRAW', 3_000);
  }
  await waitFor(() => s.page.evaluate('!window.__severgrow.busy()') as Promise<boolean>, 8_000);
  for (let i = 0; i < 6 && (await phase(s)) === 'ACT'; i++) {
    await s.page.evaluate(`(() => { const b = document.querySelector('#moves .end, #moves .futa04-skip, .futa04-skip, .end'); if (b && !b.disabled) b.click(); })()`);
    await waitFor(async () => (await phase(s)) !== 'ACT', 3_000);
  }
  for (let i = 0; i < 6 && (await phase(s)) === 'DISCARD'; i++) {
    const card = (await s.page.evaluate(`(() => { const d = window.__severgrow.legal().filter(a => a.t === 'Discard')[0]; return d ? d.card : null; })()`)) as number | null;
    if (card === null) break;
    await s.page.locator(`#hand [data-card="${card}"]`).click({ force: true }).catch(() => undefined);
    // Product Throw selects the card, then taps the pile. Tapping the card again deselects it.
    await s.page.locator('#discard').click({ force: true });
    await waitFor(async () => (await phase(s)) !== 'DISCARD', 3_000);
  }
  return waitFor(async () => !(await myTurn(s)), 8_000);
};

const openBoth = async (m: LocalMatch, opts: { reduceMotion?: boolean; speed?: 'normal' | 'skip' } = {}) => {
  const a = await openSeat(duel, m, 0, { reduceMotion: opts.reduceMotion ?? true, speed: opts.speed ?? 'skip' });
  const b = await openSeat(duel, m, 1, { reduceMotion: opts.reduceMotion ?? true, speed: opts.speed ?? 'skip' });
  await openDuel(a, m.matchId);
  await openDuel(b, m.matchId);
  return { a, b };
};

/**
 * What the duel strip's time slot shows right now. While a live duel runs the LIVE clock owns this
 * element (`data-live-clock`), so the 24-hour urgency words are suppressed there by design — see
 * `fillDuelHud` in `web/src/online/duel-hud.ts` and the strip-clock rules in
 * `web/src/online/live/ui.ts`. "No 24-hour warning" is therefore about the WORDS, not about the
 * element being invisible: the visible strip clock is a separate, deliberate thing.
 */
const urgencySlot = (p: Page): Promise<string> =>
  (
    p.evaluate(`(() => {
      const u = document.querySelector('#duel-hud [data-duel-urgency]');
      if (!u || u.closest('[hidden]')) return 'absent';
      const r = u.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return 'hidden';
      const who = u.dataset.liveClock === '1' ? 'live-clock' : u.dataset.tone ? 'warning:' + u.dataset.tone : 'warning';
      return who + ':' + (u.textContent || '').trim();
    })()`) as Promise<string>
  ).catch(() => 'unreadable');

const pillState = (s: SeatSession) => s.page.evaluate(() => {
  const p = document.querySelector<HTMLElement>('[data-live="pill"]');
  return p && !p.hidden ? `${p.dataset.state}:${p.querySelector('.label')?.textContent ?? ''}` : 'hidden';
});

const challengeAndAccept = async (a: SeatSession, b: SeatSession, label: string) => {
  check(`${label}: Real time pill ready`, await waitFor(async () => (await pillState(a)).startsWith('ready'), 20_000), await pillState(a));
  // The bolt ASKS first (owner, 2026-10-26): one tap opens the confirm window,
  // the second sends. A tap alone must never start a duel.
  await a.page.locator('[data-live="pill"]').click();
  await a.page.locator('[data-live="confirm-send"]').click();
  check(`${label}: sender waits`, await waitFor(async () => (await pillState(a)).startsWith('waiting'), 8_000), await pillState(a));
  check(`${label}: pop-up appears for the recipient`, await waitFor(() => vis(b.page, '[data-mode="challenge"]'), 15_000));
  await b.page.locator('[data-live="accept"]').click();
  if (label === '1') {
    const lit = await waitFor(() => b.page.evaluate(`!!document.querySelector('[data-live="chip"].lighting')`) as Promise<boolean>, 5_000);
    check('1: the 600 ms real-time moment plays (the homes pulse)', lit);
    await shot(b, '09-go-live-transition');
  }
  const both = await waitFor(async () => !!(await dbg(a))?.status?.live && !!(await dbg(b))?.status?.live, 15_000);
  check(`${label}: both screens are live`, both);
  // The framed "LIVE 60s" chip is gone (owner's cleanup): the plain m:ss clock is the header's
  // only number now, so that is what proves the real-time mode is on for both seats.
  const clockOn = (s: SeatSession) =>
    s.page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('#smart-panel #blitz-clock');
      return !!el && !el.hidden && el.getBoundingClientRect().width > 1;
    });
  check(`${label}: the authoritative Blitz clock is in the cockpit (both)`, (await clockOn(a)) && (await clockOn(b)));
};

const closeAll = async (...s: SeatSession[]) => {
  for (const x of s) await x.context.close().catch(() => undefined);
};

const run = async (name: string, fn: () => Promise<void>) => {
  if (ONLY.length && !ONLY.includes(name)) return;
  console.log(`\n--- ${name}`);
  try {
    await fn();
  } catch (e) {
    check(`${name}: no crash`, false, String(e).slice(0, 300));
  } finally {
    // Always, even when the scenario threw: one failure must never poison every later scenario by
    // leaving an open match (and so a step closer to the cap) behind.
    await teardownScenario(name);
  }
};

// ---------------------------------------------------------------- the scenarios

try {
  await run('1-flow', async () => {
    const m = await newMatch();
    const { a, b } = await openBoth(m, { reduceMotion: false });
    await waitFor(async () => (await pillState(a)).startsWith('ready'), 20_000);
    await shot(a, '01-pill-ready');
    await challengeAndAccept(a, b, '1');
    await shot(a, '05-live-hud-seat0');
    await shot(b, '06-live-hud-seat1');
    check('1: the cockpit clock is visible', await waitFor(() => vis(a.page, '#blitz-clock'), 5_000));
    const ringOk = async (s: SeatSession) => {
      const st = (await dbg(s))?.status;
      const side = await s.page.evaluate(`document.querySelector('#blitz-clock')?.getAttribute('data-side') ?? ''`);
      return !!st && side === (st.actor === st.mySeat ? 'mine' : 'theirs');
    };
    check('1: the clock identifies the ACTIVE seat on both screens', (await waitFor(() => ringOk(a), 5_000)) && (await waitFor(() => ringOk(b), 5_000)));
    const slotA = await urgencySlot(a.page);
    const slotB = await urgencySlot(b.page);
    check('1: no 24-hour warning while live', !slotA.startsWith('warning') && !slotB.startsWith('warning'), `${slotA} | ${slotB}`);
    const before = (await api.getState(m.guests[0].token, m.matchId)).player.view.turnNumber;
    // BLITZ: EVERY MOVE IS SEEN AS IT LANDS (owner, 2026-11-09: "if opp draws - i see it"). The mover
    // draws; the watcher's page reaches the mover's Grow step while the turn is still theirs.
    {
      await waitFor(async () => (await myTurn(a)) || (await myTurn(b)), 20_000);
      const mover = (await myTurn(a)) ? a : b;
      const watcher = mover === a ? b : a;
      await waitFor(async () => (await phase(mover)) === 'DRAW', 5_000);
      await mover.page.locator('#deck').click({ force: true }).catch(() => undefined);
      const seen = await waitFor(async () => (await phase(watcher)) === 'ACT' && !(await myTurn(watcher)), 8_000);
      check('1: Blitz: the watcher sees the mover\'s Draw before the turn ends', seen, await phase(watcher));
    }
    for (let t = 0; t < 3; t++) {
      await waitFor(async () => (await myTurn(a)) || (await myTurn(b)), 20_000);
      const actor = (await myTurn(a)) ? a : b;
      check(`1: live turn ${t + 1} played through the UI`, await playTurn(actor));
    }
    const after = (await api.getState(m.guests[0].token, m.matchId)).player.view.turnNumber;
    check('1: three live turns advanced the match', after === before + 3, `${before} -> ${after}`);
    const s1 = (await dbg(a))!.status!;
    check('1: still live after three turns (no strikes, nothing ended)', s1.live && s1.endedReason === null, JSON.stringify({ live: s1.live, ended: s1.endedReason }));
    await api.resign(m.guests[0].token, m.matchId);
    check('1: finish → end-of-live window (both)', await waitFor(async () => (await vis(a.page, '[data-live="end"]')) && (await vis(b.page, '[data-live="end"]')), 15_000));
    check('1: Rematch offered after a finish', await vis(b.page, '[data-live="rematch"]'));
    await shot(b, '08-end-window');
    await closeAll(a, b);
  });

  await run('2-bot-return', async () => {
    const m = await newMatch();
    const a = await openSeat(duel, m, 0, { reduceMotion: true, speed: 'skip' });
    await openDuel(a, m.matchId);
    const b = await openSeat(duel, m, 1, { reduceMotion: true, speed: 'skip' });
    await b.page.goto(`${origin}/?seed=4242`);
    await waitFor(() => vis(b.page, '#game'), 20_000);
    await waitFor(async () => (await phase(b)) === 'DRAW' || (await phase(b)) === 'ACT', 20_000);
    // Make one human move so the save is a real position, then wait for the bot to answer.
    await b.page.locator('#deck').click({ force: true }).catch(() => undefined);
    await waitFor(() => b.page.evaluate('!window.__severgrow.busy()') as Promise<boolean>, 10_000);
    const before = await b.page.evaluate(() => JSON.stringify((window as unknown as { __severgrow: { state: () => unknown } }).__severgrow.state()));
    await challengeAndAccept(a, b, '2');
    check('2: return target is the bot game', (await dbg(b))?.target?.kind === 'bot');
    await a.page.evaluate(() => document.getElementById('hud-menu')?.click());
    await waitFor(() => vis(a.page, '[data-live="leave"]'), 5_000);
    a.page.once('dialog', (d) => void d.accept());
    await a.page.locator('[data-live="leave"]').click();
    check('2: end window offers Back to your game', await waitFor(() => vis(b.page, '[data-live="back"]'), 15_000));
    await b.page.locator('[data-live="back"]').click();
    check('2: the bot game is back on screen', await waitFor(async () => !(await b.page.evaluate(() => !!(window as unknown as { __severgrow: { online: () => unknown } }).__severgrow.online())), 15_000));
    await waitFor(() => b.page.evaluate('!window.__severgrow.busy()') as Promise<boolean>, 10_000);
    const after = await b.page.evaluate(() => JSON.stringify((window as unknown as { __severgrow: { state: () => unknown } }).__severgrow.state()));
    check('2: the bot game resumes at the IDENTICAL position', after === before, after === before ? '' : `${before.length} vs ${after.length}`);
    await closeAll(a, b);
  });

  await run('3-draft-return', async () => {
    const m1 = await newMatch();
    // B also has match 2 with a third player, where it is B's turn.
    const fixture=persistentDraftFixture();nextFixtureSeed=fixture.seed;
    const m2 = await newMatch([null, m1.guests[1]]);
    const a = await openSeat(duel, m1, 0, { reduceMotion: true, speed: 'skip' });
    await openDuel(a, m1.matchId);
    const b = await openSeat(duel, m2, 1, { reduceMotion: true, speed: 'skip' });
    await openDuel(b, m2.matchId);
    check('3: B holds the turn in match 2', await waitFor(() => myTurn(b), 20_000));
    await b.page.locator('#deck').click({ force: true });
    await waitFor(async () => (await phase(b)) === 'ACT', 8_000);
    await waitFor(() => b.page.evaluate('!window.__severgrow.busy()') as Promise<boolean>, 8_000);
    // An unsent Grow draft: a card in no Bloom recipe, tapped with a finger, then its target hex.
    const plans = (await b.page.evaluate(`(() => {
      const legal = window.__severgrow.legal();
      const inBloom = {};
      for (const a of legal) if (a.t === 'Bloom') for (const c of a.cards) inBloom[c] = true;
      const out = [];
      for (const a of legal) if (a.t === 'Sprout' && a.card === ${fixture.card} && !inBloom[a.card]) out.push({ card: a.card, key: a.coord.q + ',' + a.coord.r });
      return out.slice(0, 4);
    })()`)) as { card: number; key: string }[];
    const tapAt = async (sel: string) => {
      const pt = (await b.page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect();
        for (const yf of [0.5, 0.35, 0.65, 0.22]) for (const xf of [0.5, 0.3, 0.7]) { const x = r.left + r.width * xf, y = r.top + r.height * yf; const h = document.elementFromPoint(x, y); if (h && (h === el || el.contains(h))) return { x, y }; }
        return null; })()`)) as { x: number; y: number } | null;
      if (pt) await b.page.touchscreen.tap(pt.x, pt.y);
    };
    const draftKey = `(() => Object.keys(sessionStorage).some(k => k.indexOf('severgrow.duel.draft.v1.') !== -1))()`;
    let drafted = false;
    for (const g of plans) {
      await tapAt(`#hand [data-card="${g.card}"]`);
      if ((drafted = await waitFor(() => b.page.evaluate(draftKey) as Promise<boolean>, 800))) break;
      await tapAt(`#board .hex-cell[data-key="${g.key}"]`);
      if ((drafted = await waitFor(() => b.page.evaluate(draftKey) as Promise<boolean>, 2_000))) break;
    }
    check('3: an unsent draft exists in match 2', drafted);
    const draftBefore=await b.page.evaluate(mid=>sessionStorage.getItem('severgrow.duel.draft.v1.'+mid),m2.matchId);
    const revisionBefore=(await api.getState(m2.guests[1].token,m2.matchId)).player.revision;
    const boardBefore = await b.page.evaluate(() => JSON.stringify((window as any).__severgrow.state()?.board));
    // A challenges B in match 1 (B is in match 2 → presence in_match).
    await waitFor(async () => (await pillState(a)).startsWith('ready'), 20_000);
    // The bolt ASKS first (owner, 2026-10-26): one tap opens the confirm window,
    // the second sends. A tap alone must never start a duel.
    await a.page.locator('[data-live="pill"]').click();
    await a.page.locator('[data-live="confirm-send"]').click();
    check('3: pop-up on B over the other match', await waitFor(() => vis(b.page, '[data-mode="challenge"]'), 15_000));
    await b.page.locator('[data-live="accept"]').click();
    check('3: B is moved to the live match', await waitFor(async () => (await currentMatch(b)) === m1.matchId, 15_000));
    check('3: return target is match 2', (await dbg(b))?.target?.matchId === m2.matchId);
    a.page.once('dialog', (d) => void d.accept());
    await a.page.evaluate(() => document.getElementById('hud-menu')?.click());
    await a.page.locator('[data-live="leave"]').click();
    check('3: B gets Back to your match', await waitFor(() => vis(b.page, '[data-live="back"]'), 15_000));
    await b.page.locator('[data-live="back"]').click();
    check('3: B is back in match 2', await waitFor(async () => (await currentMatch(b)) === m2.matchId, 15_000));
    const draftAfter=await b.page.evaluate(mid=>sessionStorage.getItem('severgrow.duel.draft.v1.'+mid),m2.matchId);
    check('3: return preserves the exact draft without committing it',draftAfter===draftBefore&&(await api.getState(m2.guests[1].token,m2.matchId)).player.revision===revisionBefore);
    check('3: the unsent draft is still stored for match 2', (await b.page.evaluate(draftKey)) as boolean);
    const boardAfter = await b.page.evaluate(() => JSON.stringify((window as any).__severgrow.state()?.board));
    check('3: the drafted board is exactly as left', boardAfter === boardBefore);
    await closeAll(a, b);
  });

  await run('4-busy-live', async () => {
    const m = await newMatch();
    const { a, b } = await openBoth(m);
    await challengeAndAccept(a, b, '4');
    const m2 = await newMatch([null, m.guests[1]]);
    const c = await openSeat(duel, m2, 0, { reduceMotion: true, speed: 'skip' });
    await openDuel(c, m2.matchId);
    check('4: third player sees "In Blitz"', await waitFor(async () => (await pillState(c)) === 'disabled:In Blitz', 15_000), await pillState(c));
    await shot(c, '02-pill-in-live-game');
    const res = await fetch(`${apiBase}/v1/matches/${m2.matchId}/live/challenge`, { method: 'POST', headers: { authorization: `Bearer ${m2.guests[0].token}`, 'content-type': 'application/json' }, body: '{}' });
    check('4: the server answers BUSY_LIVE', ((await res.json()) as { code?: string }).code === 'BUSY_LIVE');
    await closeAll(a, b, c);
  });

  await run('5-notnow-expiry', async () => {
    const m = await newMatch();
    const { a, b } = await openBoth(m);
    await waitFor(async () => (await pillState(a)).startsWith('ready'), 20_000);
    // The bolt ASKS first (owner, 2026-10-26): one tap opens the confirm window,
    // the second sends. A tap alone must never start a duel.
    await a.page.locator('[data-live="pill"]').click();
    await a.page.locator('[data-live="confirm-send"]').click();
    await waitFor(() => vis(b.page, '[data-mode="challenge"]'), 15_000);
    await shot(a, '03-waiting');
    // Owner, 2026-10-26: the bolt now sits IMMEDIATELY RIGHT OF THE MENU in the header, so it can
    // never fight the chat's own keys or the wordmark. Assert that, not the old rail position.
    check('5: the waiting bolt sits beside the menu key, clear of the wordmark', (await a.page.evaluate(`(() => {
      const p = document.querySelector('[data-live="pill"]').getBoundingClientRect();
      const menu = document.getElementById('hud-menu').getBoundingClientRect();
      const brand = document.getElementById('hud-brand');
      const b = brand ? brand.getBoundingClientRect() : null;
      const sameRow = Math.abs((p.top + p.bottom) / 2 - (menu.top + menu.bottom) / 2) <= 6;
      const rightOfMenu = p.left >= menu.right - 1;
      const close = p.left - menu.right <= 12;
      const clearBrand = !b || b.width === 0 || p.right <= b.left + 1 || p.bottom <= b.top + 1;
      return sameRow && rightOfMenu && close && clearBrand;
    })()`)) as boolean);
    await shot(b, '04-challenge-popup');
    await b.page.locator('[data-live="decline"]').click();
    check('5: sender sees a quiet "Not now"', await waitFor(async () => (await text(a.page, '[data-mode="note"]')).includes('Not now') && (await vis(a.page, '[data-mode="note"]')), 10_000));
    check('5: re-challenge is held back', await waitFor(async () => (await pillState(a)).startsWith('disabled'), 8_000), await pillState(a));
    // Expiry, on a fresh pair (12 s test TTL).
    const m2 = await newMatch();
    const s2 = await openBoth(m2);
    await waitFor(async () => (await pillState(s2.a)).startsWith('ready'), 20_000);
    // The bolt ASKS first (owner, 2026-10-26): one tap opens the confirm window,
    // the second sends. A tap alone must never start a duel.
    await s2.a.page.locator('[data-live="pill"]').click();
    await s2.a.page.locator('[data-live="confirm-send"]').click();
    await waitFor(() => vis(s2.b.page, '[data-mode="challenge"]'), 15_000);
    check('5: an unanswered challenge expires on both screens', await waitFor(async () => !(await vis(s2.b.page, '[data-mode="challenge"]')) && (await text(s2.a.page, '[data-mode="note"]')).includes('No answer'), 25_000));
    await closeAll(a, b, s2.a, s2.b);
  });

  await run('6-timeout', async () => {
    const m = await newMatch();
    const { a, b } = await openBoth(m);
    await challengeAndAccept(a, b, '6');
    const st = (await dbg(a))!.status!;
    const sleeper = st.actor === st.mySeat ? a : b;
    const other = sleeper === a ? b : a;
    const seat = st.actor;
    // Current Blitz rule: a connected timeout completes the turn, without losing the match.
    const before=(await api.getState(m.guests[0].token,m.matchId)).player.view.turnNumber;
    check('6: a connected timeout passes the turn on both screens', await waitFor(async()=>{
      const left=(await dbg(a))?.status,right=(await dbg(b))?.status;
      return !!left?.live&&!!right?.live&&left.actor!==seat&&right.actor!==seat;
    },30_000));
    await shot(sleeper,'07-timeout-continues');
    const after=(await api.getState(m.guests[0].token,m.matchId)).player;
    check('6: the authoritative match remains active',after.status==='active'&&after.result===null);
    check('6: the timed-out turn was completed',after.view.turnNumber>before);
    check('6: the short Blitz clock remains active',after.turnDeadlineAt!==null&&after.turnDeadlineAt<Date.now()+60_000);
    check('6: neither player receives a false end window',!(await vis(other.page,'[data-live="end"]'))&&!(await vis(sleeper.page,'[data-live="end"]')));
    await closeAll(a, b);
  });

  await run('7-leave-forfeit', async () => {
    const m = await newMatch();
    const { a, b } = await openBoth(m);
    await challengeAndAccept(a, b, '7');
    const st = (await dbg(a))!.status!;
    const leaver = st.actor === st.mySeat ? a : b;
    const other = leaver === a ? b : a;
    const leaverSeat = st.actor;
    const dialogs: string[] = [];
    leaver.page.once('dialog', (d) => {
      dialogs.push(d.message());
      void d.accept();
    });
    await leaver.page.evaluate(() => document.getElementById('hud-menu')?.click());
    await leaver.page.locator('[data-live="leave"]').click();
    check('7: the confirm states the forfeit outright', dialogs.some((msg) => /lose/i.test(msg)), dialogs.join(' | '));
    check('7: live ends for both', await waitFor(async () => (await dbg(other))?.status?.live === false && (await dbg(leaver))?.status?.live === false, 10_000));
    const ended = (await api.getState(m.guests[0].token, m.matchId)).player;
    check('7: the match is FINISHED (not handed back to 24-hour turns)', ended.status === 'finished' && (ended.turnDeadlineAt ?? null) === null);
    check('7: the leaver loses, reason resigned', ended.result?.reason === 'resigned' && ended.result?.winner === (leaverSeat === 0 ? 1 : 0));
    // The winner must not be left on the board.
    check('7: the winner reaches the end screen promptly', await waitFor(() => vis(other.page, '[data-live="end"]'), 15_000));
    await closeAll(a, b);
  });

  await run('8-rematch', async () => {
    const m = await newMatch();
    const { a, b } = await openBoth(m);
    await challengeAndAccept(a, b, '8');
    await api.resign(m.guests[1].token, m.matchId);
    await waitFor(async () => (await vis(a.page, '[data-live="rematch"]')) && (await vis(b.page, '[data-live="rematch"]')), 15_000);
    await a.page.locator('[data-live="rematch"]').click();
    await b.page.locator('[data-live="rematch"]').click().catch(() => undefined);
    // If B's window closed because A's rematch arrived first as a pop-up, B accepts it.
    if (await waitFor(() => vis(b.page, '[data-mode="challenge"]'), 3_000)) await b.page.locator('[data-live="accept"]').click();
    const moved = await waitFor(async () => {
      const ma = await currentMatch(a);
      const mb = await currentMatch(b);
      return !!ma && ma === mb && ma !== m.matchId && !!(await dbg(a))?.status?.live;
    }, 25_000);
    check('8: both land in a NEW match that is already live', moved);
    await closeAll(a, b);
  });

  await run('9-legacy-preference-recovery', async()=>{
    const m=await newMatch();const {a,b}=await openBoth(m);
    const player=await service.authenticate(m.guests[1].token);
    await live.service.setChallengesEnabled(player,false);
    await b.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    check('9: legacy disabled preference is repaired',await waitFor(async()=>(await live.service.myChallenges(player)).challengesEnabled,10_000));
    check('9: the removed preference has no stale settings control',await b.page.locator('#live-allow').count()===0);
    check('9: Blitz becomes available again',await waitFor(async()=>(await pillState(a)).startsWith('ready'),15_000));
    await closeAll(a,b);
  });

  await run('10-mid-replay', async () => {
    const m = await newMatch();
    const a = await openSeat(duel, m, 0, { reduceMotion: false, speed: m.starterSeat === 0 ? 'skip' : 'slow', clock: m.starterSeat !== 0 });
    const b = await openSeat(duel, m, 1, { reduceMotion: false, speed: m.starterSeat === 1 ? 'skip' : 'slow', clock: m.starterSeat !== 1 });
    await openDuel(a, m.matchId);
    await openDuel(b, m.matchId);
    const actorIsA = m.starterSeat === 0;
    const actor = actorIsA ? a : b;
    const watcher = actorIsA ? b : a;
    const challenger = actor;
    await waitFor(async () => (await pillState(challenger)).startsWith('ready'), 20_000);
    // The watcher records every moment the pop-up and the replay overlap.
    await watcher.page.evaluate(`(() => {
      window.__overlap = 0;
      window.__sawReplay = false;
      const step = () => {
        const o = window.__severgrow.online();
        const rev = !!(o && o.revealing);
        if (rev) window.__sawReplay = true;
        const lv = window.__futasakuLive && window.__futasakuLive();
        const open = !!(lv && lv.popup);
        if (rev && open && !window.__wasOpen) window.__overlap += 1; // opened ON TOP of a running replay
        if (rev && open && window.__wasOpen) window.__under = (window.__under || 0) + 1; // a replay began under an open pop-up
        window.__wasOpen = open;
        if (rev && lv && !lv.popup && lv.inbox && lv.inbox.incoming.length > 0) window.__deferred = (window.__deferred || 0) + 1;
        requestAnimationFrame(step);
      };
      step();
    })()`);
    // The challenge is sent while the actor's turn is still in flight, so it reaches the watcher
    // around the replay of that very turn.
    // Finish the move before opening a modal on the mover: its own scrim deliberately blocks
    // board input. The previous test deadlocked its discard behind its own send confirmation.
    // Hold browser time before the turn arrives. Foregrounding below delivers the actual view
    // through the existing sync path, while its replay's timed steps remain under test control.
    await watcher.page.clock.pauseAt(new Date());
    const played = await playTurn(actor);
    if (!played) console.log('turn diagnostic',JSON.stringify(await actor.page.evaluate(()=>{
      const h=(window as any).__severgrow;
      return {phase:h.state()?.phase,busy:h.busy(),online:h.online(),modal:[...document.querySelectorAll<HTMLElement>('.live-glass')].filter(e=>!e.hidden).map(e=>e.dataset.mode)};
    })));
    check('10: actor plays a turn',played);
    await watcher.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    check('10: watcher is actively replaying before the challenge',await waitFor(()=>watcher.page.evaluate(()=>(window as any).__severgrow.online()?.revealing===true),15_000));
    // Dispatch through the actual UI handlers in one task so automation's actionability waits
    // cannot consume the short opponent animation we are explicitly trying to overlap.
    await challenger.page.evaluate(()=>{
      document.querySelector<HTMLButtonElement>('[data-live="pill"]')!.click();
      document.querySelector<HTMLButtonElement>('[data-live="confirm-send"]')!.click();
    });
    await waitFor(async()=>(await pillState(challenger)).startsWith('waiting'),5000);
    await watcher.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    check('10: inbox arrives while replay time is held',await waitFor(()=>watcher.page.evaluate(()=>{
      const live=(window as any).__futasakuLive?.();
      return !!(window as any).__severgrow.online()?.revealing&&live?.inbox?.incoming.some((c:any)=>c.status==='pending');
    }),5000));
    check('10: pending invitation does not interrupt the held replay',!(await dbg(watcher))?.popup);
    await watcher.page.clock.runFor(50);
    await watcher.page.clock.resume();
    check('10: the replay ran on the watcher', await waitFor(() => watcher.page.evaluate('window.__sawReplay') as Promise<boolean>, 15_000));
    check('10: the pop-up appears after the replay', await waitFor(() => vis(watcher.page, '[data-mode="challenge"]'), 25_000));
    check('10: never on top of the running replay', (await watcher.page.evaluate('window.__overlap')) === 0, `held back ${await watcher.page.evaluate('window.__deferred || 0')} frames; replay under an already-open pop-up ${await watcher.page.evaluate('window.__under || 0')} frames`);
    check('10: the invitation was actually deferred during the replay',(await watcher.page.evaluate('window.__deferred || 0') as number)>0);
    await closeAll(a, b);
  });
  await run('11-widths', async () => {
    for (const [width, height] of [[360,844],[390,844],[844,390],[768,1024],[1280,800]] as const) {
      const m = await newMatch();
      const a = await openSeat(duel, m, 0, { reduceMotion: true, speed: 'skip', viewport: { width, height }, hasTouch: width < 500, isMobile: width < 500 });
      const b = await openSeat(duel, m, 1, { reduceMotion: true, speed: 'skip', viewport: { width, height }, hasTouch: width < 500, isMobile: width < 500 });
      await openDuel(a, m.matchId);
      await openDuel(b, m.matchId);
      await waitFor(async () => (await pillState(a)).startsWith('ready'), 20_000);
      // The bolt ASKS first (owner, 2026-10-26): one tap opens the confirm window,
      // the second sends. A tap alone must never start a duel.
      await a.page.locator('[data-live="pill"]').click();
      await a.page.locator('[data-live="confirm-send"]').click();
      await waitFor(() => vis(b.page, '[data-mode="challenge"]'), 15_000);
      const fit = (await b.page.evaluate(`(() => {
        const r = document.querySelector('[data-mode="challenge"]').getBoundingClientRect();
        const btns = [...document.querySelectorAll('[data-mode="challenge"] button')].map(x => x.getBoundingClientRect());
        return { inside: r.left >= 0 && r.right <= innerWidth, big: btns.every(x => x.height >= 44 && x.width >= 44), scroll: document.documentElement.scrollWidth <= innerWidth };
      })()`)) as { inside: boolean; big: boolean; scroll: boolean };
      const pill = (await a.page.evaluate(`(() => { const r = document.querySelector('[data-live="pill"]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()`)) as boolean;
      check(`11: ${width}px — pop-up inside the screen, 44px buttons, no sideways scroll`, fit.inside && fit.big && fit.scroll, JSON.stringify(fit));
      check(`11: ${width}px — pill inside the screen`, pill);
      await shot(b, `10-popup-${width}x${height}`);
      await closeAll(a, b);
    }
  });

  // Whole-run invariant: the harness leaves the live service exactly as it found it, so the suite is
  // re-runnable back to back and a later scenario can never start from a drifted open-match count.
  // As above, an unreadable guest counts as a FAILED proof rather than a silent pass.
  const guests = [...new Set(runGuests)];
  const openAtStart = 0; // no guest exists before the first scenario creates one, so the baseline is 0
  let openAtEnd = 0;
  let unreadable = 0;
  for (const token of guests) {
    try {
      openAtEnd += (await openMatchesOf(token)).length;
    } catch {
      unreadable += 1;
    }
  }
  check(
    'run: the open-match count is the same at the start and the end',
    openAtEnd === openAtStart && unreadable === 0,
    `start ${openAtStart} → end ${openAtEnd}${unreadable ? ` (${unreadable} unreadable)` : ''}, across ${guests.length} guest(s) this run created`,
  );
} finally {
  await browser.close().catch(() => undefined);
  await previewServer.close().catch(() => undefined);
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
