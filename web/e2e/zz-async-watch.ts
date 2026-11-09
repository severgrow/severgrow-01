// TEMP probe (delete before commit): how fast does a watcher on the REAL site see each Blitz move?
import { chromium } from 'playwright-core';
import { openMenuEntry } from './helpers/menu-nav.js';
import { expandYourMatches } from './helpers/lobby-matches.js';
const APP = process.env.APP ?? 'https://www.futasaku.com/';
const API = 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel';
const H = { accept: 'application/json', 'content-type': 'application/json', 'x-futasaku-client-version': '0.5.0', 'x-futasaku-rules-version': 'futasaku0.4-strength-draw' };
const T0 = Date.now(); const t = () => Date.now() - T0;
const call = async (method: string, path: string, token?: string, body?: unknown): Promise<any> => {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(API + path + sep + 'forceFunctionRegion=eu-west-1', { method, headers: { ...H, ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const d = await r.json() as any;
  if (!r.ok || d.ok === false) throw new Error(path + ' ' + JSON.stringify(d).slice(0, 150));
  return d;
};
const a = await call('POST', '/v1/guests', undefined, {}), b = await call('POST', '/v1/guests', undefined, {});
const made = await call('POST', '/v1/matches', a.token, {});
const matchId = made.match.matchId;
await call('POST', '/v1/matches/join', b.token, { inviteCode: made.match.inviteCode });
const va = (await call('GET', `/v1/matches/${matchId}/view`, a.token)).player;
// the watcher is whoever does NOT move first; the mover is driven by the API
const [mover, watcher] = va.actor === va.seat ? [a, b] : [b, a];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, proxy: { server: process.env.HTTPS_PROXY! }, args: ['--no-sandbox', '--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ...(process.env.PHONE ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : { viewport: { width: 1280, height: 800 } }), ignoreHTTPSErrors: true });
await ctx.addInitScript((id) => {
  for (const p of ['', 'main2:', 'futa04:', 'futa05:']) { localStorage.setItem(`${p}severgrow.duel.identity.v1`, id); localStorage.setItem(`${p}severgrow.duel.firstCard.v1`, '1'); localStorage.setItem(`${p}severgrow.seen`, '1'); }
  (window as any).__name = (f: unknown) => f;
}, JSON.stringify({ token: watcher.token, playerId: watcher.player.id, displayName: watcher.player.displayName, kind: 'guest' }));
const page = await ctx.newPage();
const log: string[] = [];
page.on('websocket', (ws) => ws.on('framereceived', (f) => { const s = String(f.payload); if (s.includes('"broadcast"')) log.push(`[${t()}] WS ${s.match(/"event":"(\w+)","payload":\{[^}]*\}/)?.[0]?.slice(0, 90)}`); }));
page.on('request', (r) => { if (r.url().includes('/view')) log.push(`[${t()}] view req since=${new URL(r.url()).searchParams.get('since')}`); });
page.on('response', (r) => { if (r.url().includes('/view')) log.push(`[${t()}] view resp ${r.status()}`); });
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await openMenuEntry(page, 'menu-online', { timeout: 40_000 });
await page.waitForTimeout(2500);
await page.getByText('Play as guest').click({ timeout: 5000 }).catch(() => 0);
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/claude-0/-home-user-severgrow-01/dc3110b3-0927-56ec-9d02-a48ba7724a28/scratchpad/hub.png' });
await expandYourMatches(page);
await page.waitForSelector('.online-row', { timeout: 20_000 });
await page.click('.online-row');
await page.waitForSelector('#game:not([hidden])', { timeout: 20_000 });
await page.waitForTimeout(2000);
// watch the page's board state every frame
await page.evaluate((t0) => {
  const w = window as any; w.__seen = [];
  let last = '';
  const tick = () => {
    const st = w.__severgrow?.state?.(); const o = w.__severgrow?.online?.();
    const tiles = st ? JSON.stringify(st.board).length : 0;
    const key = `${st?.phase}|${st?.actor}|deck${st?.deck?.length ?? st?.deckCount}|tiles${tiles}|rev${o?.revealing ? 'R' : ''}|busy${w.__severgrow?.busy?.() ? 1 : 0}`;
    if (key !== last) { w.__seen.push(`[${Date.now() - t0}] page ${key}`); last = key; }
    requestAnimationFrame(tick);
  };
  tick();
}, T0);
const step = async (label: string, pick: (v: any) => any) => {
  const v = (await call('GET', `/v1/matches/${matchId}/view`, mover.token)).player;
  const act = pick(v);
  if (!act) { log.push(`[${t()}] (no ${label})`); return; }
  log.push(`[${t()}] >>> mover sends ${label}`);
  await call('POST', `/v1/matches/${matchId}/actions`, mover.token, { expectedRevision: v.revision, requestId: label + Date.now(), action: act });
  log.push(`[${t()}] <<< server accepted ${label}`);
  await page.waitForTimeout(3500);
};
await step('Draw', (v) => v.legalActions.find((x: any) => x.t === 'Draw'));
// async: the rest of the turn is one batch, like the page sends it
{
  const v = (await call('GET', `/v1/matches/${matchId}/view`, mover.token)).player;
  log.push(`[${t()}] >>> mover throws (EndAct+Discard batch)`);
  const end = v.legalActions.find((x: any) => x.t === 'EndAct');
  const after = await call('POST', `/v1/matches/${matchId}/actions`, mover.token, { expectedRevision: v.revision, requestId: 'b' + Date.now(), actions: [end] });
  const v2 = after.player;
  const disc = v2.legalActions.find((x: any) => x.t === 'Discard');
  if (disc) await call('POST', `/v1/matches/${matchId}/actions`, mover.token, { expectedRevision: v2.revision, requestId: 'c' + Date.now(), actions: [disc] });
  log.push(`[${t()}] <<< server accepted the throw`);
  await page.waitForTimeout(20000);
}
const seen = await page.evaluate(() => (window as any).__seen as string[]);
console.log([...log, ...seen].sort((x, y) => Number(x.slice(1, x.indexOf(']'))) - Number(y.slice(1, y.indexOf(']')))).join('\n'));
await call('POST', `/v1/matches/${matchId}/resign`, mover.token, {}).catch(() => 0);
await browser.close();
