// THROWAWAY verification tool for the 0.55 ten-tester rehearsal (2026-10-16).
//
// Sends real traffic to the deployed Edge duel API. Run each command on purpose, modest volume:
//
//   npx tsx server/scripts/verify-0.55-playtest.ts guests 10
//   npx tsx server/scripts/verify-0.55-playtest.ts duels 10
//   npx tsx server/scripts/verify-0.55-playtest.ts full
//   npx tsx server/scripts/verify-0.55-playtest.ts resign
//   npx tsx server/scripts/verify-0.55-playtest.ts wallet <token>
//   npx tsx server/scripts/verify-0.55-playtest.ts world
//   npx tsx server/scripts/verify-0.55-playtest.ts claim <token> <cellId>
//   npx tsx server/scripts/verify-0.55-playtest.ts campaign <token>
//
// It keeps guest tokens in /tmp so the commands can be run one at a time without re-minting.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { apply, viewFor } from '../../src/engine/index.js';
import type { Action, State, Player } from '../../src/engine/index.js';
import { campaignLevelById, campaignOpening } from '../../src/campaign/index.js';
import { botFor, CURRENT_BOT_VERSION } from '../../src/bots/versions.js';
import { botSeed } from '../../src/bots/levels.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { worldNeighbours } from '../src/world.js';

const BASE = process.env.BASE_URL ?? 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel';
const STATE_FILE = '/tmp/futa055-state.json';
const HDRS = {
  accept: 'application/json',
  'content-type': 'application/json',
  'x-futasaku-client-version': '0.5.0',
  'x-futasaku-rules-version': 'futasaku0.4-strength-draw',
};

type State55 = { tokens: { id: string; name: string; token: string }[]; notes: string[] };
const load = (): State55 => (existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State55) : { tokens: [], notes: [] });
const save = (s: State55) => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

let calls = 0;
const call = async (method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; ms: number; json: any }> => {
  calls++;
  const headers: Record<string, string> = { ...HDRS };
  if (token) headers.authorization = `Bearer ${token}`;
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const ms = Date.now() - started;
  let json: any = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, ms, json };
};

const mintGuest = async (name: string) => {
  const r = await call('POST', '/v1/guests', {});
  if (r.status !== 200 && r.status !== 201) throw new Error(`guest ${name}: ${r.status} ${JSON.stringify(r.json)}`);
  return { id: r.json.player.id as string, name, token: r.json.token as string, ms: r.ms };
};

// ---------------------------------------------------------------- commands

const cmdGuests = async (n: number) => {
  const s = load();
  const lat: number[] = [];
  for (let i = 0; i < n; i++) {
    const g = await mintGuest(`pt-${s.tokens.length + i + 1}`);
    s.tokens.push({ id: g.id, name: g.name, token: g.token });
    lat.push(g.ms);
    console.log(`guest ${i + 1}/${n}: ${g.id.slice(0, 8)}… token ${g.token.slice(0, 6)}… ${g.ms}ms`);
  }
  save(s);
  lat.sort((a, b) => a - b);
  console.log(`\nguests created: ${n}  median ${lat[Math.floor(n / 2)]}ms  max ${lat[n - 1]}ms  (total API calls: ${calls})`);
};

/** Ten guests requested SIMULTANEOUSLY (true 9am burst), unlike cmdGuests' sequential loop. */
const cmdBurst = async (n: number) => {
  const s = load();
  const t0 = Date.now();
  const results = await Promise.allSettled(Array.from({ length: n }, (_, i) => mintGuest(`burst-${i + 1}`)));
  const wall = Date.now() - t0;
  let ok = 0;
  const lat: number[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      ok++;
      lat.push(r.value.ms);
      s.tokens.push({ id: r.value.id, name: r.value.name, token: r.value.token });
      console.log(`  burst ${i + 1}: ${r.value.id.slice(0, 8)}… ${r.value.ms}ms`);
    } else {
      console.log(`  burst ${i + 1}: REJECTED ${String(r.reason)}`);
    }
  });
  save(s);
  lat.sort((a, b) => a - b);
  console.log(`\nparallel guests: ${ok}/${n} ok  wall ${wall}ms  median ${lat[Math.floor(lat.length / 2)]}ms  max ${lat[lat.length - 1]}ms`);
  console.log(`API calls this command: ${calls}`);
};

const cmdDuels = async (n: number) => {
  const s = load();
  while (s.tokens.length < 2 * n) s.tokens.push({ ...(await mintGuest(`pt-${s.tokens.length + 1}`)) });
  save(s);
  const creators = s.tokens.slice(0, n);
  const joiners = s.tokens.slice(n, 2 * n);
  // Create all n duels in parallel (simulates ten people tapping at once).
  const t0 = Date.now();
  const created = await Promise.all(creators.map(async (g) => {
    const r = await call('POST', '/v1/matches', {}, g.token);
    return { g, r };
  }));
  console.log(`create x${n} wall ${Date.now() - t0}ms`);
  for (const { g, r } of created) {
    console.log(`  create ${g.name}: ${r.status} ${r.ms}ms ${r.json?.match ? `code=${r.json.match.inviteCode} status=${r.json.match.status}` : JSON.stringify(r.json)}`);
  }
  const t1 = Date.now();
  const joined = await Promise.all(created.map(async ({ g, r }, i) => {
    if (!r.json?.match) return { g, status: 0, ms: 0, json: { skipped: true } };
    const jr = await call('POST', '/v1/matches/join', { inviteCode: r.json.match.inviteCode }, joiners[i]!.token);
    return { g, status: jr.status, ms: jr.ms, json: jr.json };
  }));
  console.log(`join x${n} wall ${Date.now() - t1}ms`);
  for (const { g, status, ms, json } of joined) {
    console.log(`  join ${g.name}: ${status} ${ms}ms ${json?.match ? `status=${json.match.status} seat=${json.player?.seat}` : JSON.stringify(json)}`);
  }
  console.log(`\nAPI calls this command: ${calls}`);
};

type Handle = { label: string; token: string; seat: Player; matchId: string };

const getView = async (h: Handle) => {
  const r = await call('GET', `/v1/matches/${h.matchId}/view`, undefined, h.token);
  if (r.status !== 200) throw new Error(`view ${h.label}: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.player;
};

const submit = async (h: Handle, actions: Action[], expectedRevision: number, rid: string) => {
  const r = await call('POST', `/v1/matches/${h.matchId}/actions`, { expectedRevision, requestId: rid, actions }, h.token);
  return r;
};

const GROW = new Set(['Sprout', 'Bloom', 'PlayFruit', 'MegaBomb']);
let seq = 0;

/** Play one full turn for the seat that is on the clock. Returns 'finished' | 'ok' | 'blocked'. */
const playTurn = async (h: Handle, verbose = false): Promise<'finished' | 'ok' | 'blocked'> => {
  let v = await getView(h);
  let guard = 0;
  while (guard++ < 40) {
    if (v.status !== 'active' || v.view.phase === 'GAME_OVER') return 'finished';
    if (v.actor !== h.seat) return 'ok';
    let action: Action | undefined;
    if (v.view.phase === 'DRAW') action = v.legalActions.find((a: Action) => a.t === 'Draw');
    else if (v.view.phase === 'ACT') action = v.legalActions.find((a: Action) => GROW.has(a.t)) ?? v.legalActions.find((a: Action) => a.t === 'EndAct');
    else if (v.view.phase === 'DISCARD') action = v.legalActions.find((a: Action) => a.t === 'Discard');
    if (!action) { if (verbose) console.log(`    no legal action in phase ${v.view.phase}`); return 'blocked'; }
    const r = await submit(h, [action], v.revision, `pt-${h.label}-${++seq}`);
    if (r.status !== 200) { console.log(`    submit ${action.t} -> ${r.status} ${JSON.stringify(r.json)}`); return 'blocked'; }
    v = r.json.player;
  }
  return 'blocked';
};

const newDuel = async (label0: string, label1: string) => {
  const a = await mintGuest(`${label0}`);
  const b = await mintGuest(`${label1}`);
  const c = await call('POST', '/v1/matches', {}, a.token);
  const j = await call('POST', '/v1/matches/join', { inviteCode: c.json.match.inviteCode }, b.token);
  const h0: Handle = { label: label0, token: a.token, seat: c.json.player.seat, matchId: c.json.match.matchId };
  const h1: Handle = { label: label1, token: b.token, seat: j.json.player.seat, matchId: c.json.match.matchId };
  return { a, b, c, j, h0, h1 };
};

const cmdFull = async () => {
  const { a, b, c, h0, h1 } = await newDuel('full-A', 'full-B');
  console.log(`duel ${c.json.match.matchId} code ${c.json.match.inviteCode} seats A=${h0.seat} B=${h1.seat} starter=${c.json.player.startingPlayer}`);
  console.log(`deadline in ${Math.round((c.json.player.turnDeadlineAt - Date.now()) / 3_600_000 * 10) / 10}h`);
  let actor: Player = c.json.player.startingPlayer;
  let turns = 0;
  const t0 = Date.now();
  while (turns++ < 80) {
    const h = actor === h0.seat ? h0 : h1;
    const res = await playTurn(h);
    if (res === 'finished') break;
    if (res === 'blocked') { console.log('  BLOCKED mid-duel'); break; }
    actor = (1 - actor) as Player;
  }
  const elapsed = Date.now() - t0;
  const endA = await getView(h0);
  const endB = await getView(h1);
  console.log(`\nfinished after ${turns} turns in ${elapsed}ms (${calls} calls so far)`);
  console.log(`A seat ${h0.seat}: status=${endA.status} result=${JSON.stringify(endA.result)}`);
  console.log(`B seat ${h1.seat}: status=${endB.status} result=${JSON.stringify(endB.result)}`);
  console.log(`agree: ${JSON.stringify(endA.result) === JSON.stringify(endB.result)}`);
  const wA = await call('GET', '/v1/seeds/wallet', undefined, a.token);
  const wB = await call('GET', '/v1/seeds/wallet', undefined, b.token);
  console.log(`wallet A ${JSON.stringify(wA.json)}`);
  console.log(`wallet B ${JSON.stringify(wB.json)}`);
  const listA = await call('GET', '/v1/players/me/matches', undefined, a.token);
  console.log(`list A: ${JSON.stringify(listA.json.matches?.map((m: any) => ({ id: m.matchId.slice(0, 8), status: m.status })))}`);
  console.log(`\nAPI calls this command: ${calls}`);
};

const cmdResign = async () => {
  const { a, h0, h1 } = await newDuel('res-A', 'res-B');
  const before = await call('GET', '/v1/seeds/wallet', undefined, a.token);
  const r = await call('POST', `/v1/matches/${h0.matchId}/resign`, {}, h0.token);
  console.log(`resign A: ${r.status} ${JSON.stringify(r.json?.player?.result)}`);
  const endA = await getView(h0);
  const endB = await getView(h1);
  console.log(`A: status=${endA.status} result=${JSON.stringify(endA.result)}`);
  console.log(`B: status=${endB.status} result=${JSON.stringify(endB.result)}`);
  const after = await call('GET', '/v1/seeds/wallet', undefined, a.token);
  console.log(`wallet A before ${JSON.stringify(before.json)} after ${JSON.stringify(after.json)}`);
  console.log(`API calls this command: ${calls}`);
};

const cmdWallet = async (token: string) => {
  console.log(JSON.stringify((await call('GET', '/v1/seeds/wallet', undefined, token)).json));
  console.log(`API calls: ${calls}`);
};

const cmdWorld = async () => {
  const r = await call('GET', '/v1/world');
  console.log(`world status ${r.status} ${r.ms}ms revision=${r.json.world?.revision} cells=${r.json.world?.cells?.length} claims=${r.json.world?.claims?.length} cost=${r.json.world?.cost}`);
  console.log(`API calls: ${calls}`);
};

const cmdClaim = async (token: string, cellId: string) => {
  const t0 = Date.now();
  const r = await call('POST', '/v1/world/claims', { cellId, requestId: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }, token);
  console.log(`claim ${cellId}: ${r.status} ${r.ms}ms ${JSON.stringify(r.json)}`);
  const again = await call('POST', '/v1/world/claims', { cellId: `99,99`, requestId: `x-${Date.now()}` }, token);
  console.log(`claim invalid cell: ${again.status} ${JSON.stringify(again.json)}`);
  console.log(`(wall ${Date.now() - t0}ms) API calls: ${calls}`);
};

/** Play a training game locally (GreedyBot as seat 0 vs the real bot), then submit the proof. */
const playTicket = async (token: string, botLevel: number) => {
  const t = await call('POST', '/v1/seeds/training/tickets', { botLevel }, token);
  if (t.status !== 201) { console.log(`  ticket: ${t.status} ${JSON.stringify(t.json)}`); return null; }
  const { id, seed } = t.json.ticket as { id: string; seed: number };
  const bot = botFor(CURRENT_BOT_VERSION)!;
  let state: State = (await import('../../src/engine/index.js')).newMatch(seed);
  const actions: Action[] = [];
  let guard = 0;
  while (state.phase !== 'GAME_OVER' && guard++ < 1600) {
    const action = state.actor === 1
      ? bot(viewFor(state, 1), botLevel as 1, botSeed(state.seed, botLevel as 1, state.turnNumber, state.history?.length ?? 0))
      : GreedyBot.chooseAction(viewFor(state, 0));
    actions.push(action);
    state = apply(state, action);
  }
  const r = await call('POST', '/v1/seeds/training', { ticketId: id, actions, botVersion: CURRENT_BOT_VERSION }, token);
  console.log(`  training L${botLevel}: local winner=${state.result?.winner} actions=${actions.length} -> submit ${r.status} ${JSON.stringify(r.json)}`);
  return state.result?.winner ?? null;
};

/** Campaign first-clears + five training wins: enough Seeds (200) for two map claims. */
const cmdSeedsRun = async (token: string) => {
  await cmdCampaign(token);
  for (let i = 0; i < 5; i++) await playTicket(token, 1);
  const w = await call('GET', '/v1/seeds/wallet', undefined, token);
  console.log(`wallet after seeds run: ${JSON.stringify(w.json)}`);
  console.log(`API calls this command: ${calls}`);
};

/** Account/upgrade checks that need no real Google token. */
const cmdAccount = async (token: string) => {
  const junk = await call('POST', '/v1/auth/google', { accessToken: 'x'.repeat(40) });
  console.log(`POST /v1/auth/google (junk access token): ${junk.status} ${JSON.stringify(junk.json)}`);
  const before = await call('GET', '/v1/players/me', undefined, token);
  const matchesBefore = await call('GET', '/v1/players/me/matches', undefined, token);
  const walletBefore = await call('GET', '/v1/seeds/wallet', undefined, token);
  const worldBefore = await call('GET', '/v1/world');
  const id = before.json.player.id as string;
  const tilesBefore = (worldBefore.json.world.claims as { ownerId: string }[]).filter((c) => c.ownerId === id).length;
  console.log(`before: id=${id.slice(0, 8)}… kind=${before.json.player.kind} name=${before.json.player.displayName} matches=${matchesBefore.json.matches.length} seeds=${walletBefore.json.wallet.balance} tiles=${tilesBefore}`);
  const up = await call('POST', '/v1/players/me/upgrade', { displayName: 'Playtest Person' }, token);
  console.log(`upgrade: ${up.status} ${JSON.stringify(up.json?.player)}`);
  const after = await call('GET', '/v1/players/me', undefined, token);
  const matchesAfter = await call('GET', '/v1/players/me/matches', undefined, token);
  const walletAfter = await call('GET', '/v1/seeds/wallet', undefined, token);
  const worldAfter = await call('GET', '/v1/world');
  const tilesAfter = (worldAfter.json.world.claims as { ownerId: string }[]).filter((c) => c.ownerId === id).length;
  console.log(`after:  id=${after.json.player.id.slice(0, 8)}… kind=${after.json.player.kind} name=${after.json.player.displayName} matches=${matchesAfter.json.matches.length} seeds=${walletAfter.json.wallet.balance} tiles=${tilesAfter}`);
  console.log(`id unchanged: ${after.json.player.id === id}; matches kept: ${matchesAfter.json.matches.length === matchesBefore.json.matches.length}; seeds kept: ${walletAfter.json.wallet.balance === walletBefore.json.wallet.balance}`);
  const re = await call('POST', '/v1/players/me/upgrade', { displayName: 'Playtest Person' }, token);
  console.log(`upgrade again (idempotence): ${re.status} ${JSON.stringify(re.json?.player)}`);
  console.log(`API calls this command: ${calls}`);
};

/** Reads the public world map's per-caller IP budget: a burst of world reads. */
const cmdWorldBurst = async (n: number) => {
  const t0 = Date.now();
  const rs = await Promise.all(Array.from({ length: n }, () => call('GET', '/v1/world')));
  const ok = rs.filter((r) => r.status === 200).length;
  const lat = rs.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`world x${n} parallel: ${ok}/${n} 200  wall ${Date.now() - t0}ms  median ${lat[Math.floor(lat.length / 2)]}ms max ${lat[lat.length - 1]}ms`);
  const codes = [...new Set(rs.map((r) => r.status))];
  console.log(`statuses: ${JSON.stringify(codes)}`);
  console.log(`API calls this command: ${calls}`);
};
const cmdClaimTest = async (token: string) => {
  const me = await call('GET', '/v1/players/me', undefined, token);
  const ownId = me.json.player.id as string;
  const rid = () => `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const world = async () =>
    (await call('GET', '/v1/world')).json.world as { revision: number; cells: { id: string }[]; claims: { cellId: string; ownerId: string }[] };
  const w0 = await world();
  const taken = new Set(w0.claims.map((c) => c.cellId));
  const free = w0.cells.map((c) => c.id).filter((c) => !taken.has(c));

  const first = free[0]!;
  const r1 = await call('POST', '/v1/world/claims', { cellId: first, requestId: rid() }, token);
  console.log(`claim #1 ${first} (first ever, anywhere): ${r1.status} ${JSON.stringify(r1.json)}`);

  const w1 = await world();
  const mine = w1.claims.filter((c) => c.ownerId === ownId).map((c) => c.cellId);
  const adjacency = worldNeighbours(first);
  const nonAdjacent = w1.cells.map((c) => c.id).find((c) => !w1.claims.some((x) => x.cellId === c) && !adjacency.includes(c));
  const adjacent = w1.cells.map((c) => c.id).find((c) => !w1.claims.some((x) => x.cellId === c) && adjacency.includes(c));
  console.log(`my cells after #1: ${JSON.stringify(mine)}  neighbours of ${first}: ${JSON.stringify(adjacency)}`);

  if (nonAdjacent) {
    const r2 = await call('POST', '/v1/world/claims', { cellId: nonAdjacent, requestId: rid() }, token);
    console.log(`claim #2 ${nonAdjacent} (NOT adjacent): ${r2.status} ${JSON.stringify(r2.json)}`);
  } else console.log('no non-adjacent free cell to try');
  if (adjacent) {
    const r3 = await call('POST', '/v1/world/claims', { cellId: adjacent, requestId: rid() }, token);
    console.log(`claim #3 ${adjacent} (adjacent): ${r3.status} ${JSON.stringify(r3.json)}`);
  } else console.log('no adjacent free cell to try');

  const replay = adjacent && await call('POST', '/v1/world/claims', { cellId: adjacent, requestId: 'replay-request-0001' }, token);
  if (replay) {
    const again = await call('POST', '/v1/world/claims', { cellId: adjacent, requestId: 'replay-request-0001' }, token);
    console.log(`replay same requestId: first=${replay.status} ${JSON.stringify(replay.json?.claim)} second=${again.status} ${JSON.stringify(again.json?.claim)}`);
  }
  const w2 = await world();
  console.log(`world after: revision=${w2.revision} claims=${w2.claims.length} mine=${w2.claims.filter((c) => c.ownerId === ownId).length}`);
  const wallet = await call('GET', '/v1/seeds/wallet', undefined, token);
  console.log(`wallet: ${JSON.stringify(wallet.json)}`);
  console.log(`API calls this command: ${calls}`);
};
const cmdCampaign = async (token: string) => {
  const ids = ['c1-01', 'c1-02', 'c1-03'];
  for (const id of ids) {
    const level = campaignLevelById(id);
    if (!level) { console.log(`${id}: unknown`); continue; }
    const bot = botFor(CURRENT_BOT_VERSION)!;
    let state: State = campaignOpening(level);
    const actions: Action[] = [];
    let guard = 0;
    while (state.phase !== 'GAME_OVER' && guard++ < 1600) {
      const action = state.actor === 1
        ? bot(viewFor(state, 1), level.botLevel, botSeed(state.seed, level.botLevel, state.turnNumber, state.history?.length ?? 0))
        : GreedyBot.chooseAction(viewFor(state, 0));
      actions.push(action);
      state = apply(state, action);
    }
    console.log(`${id}: local result winner=${state.result?.winner} reason=${state.result?.reason} actions=${actions.length} botLevel=${level.botLevel}`);
    const r = await call('POST', '/v1/seeds/campaign', { levelId: id, actions, botVersion: CURRENT_BOT_VERSION }, token);
    console.log(`  submit: ${r.status} ${JSON.stringify(r.json)}`);
  }
  console.log(`API calls this command: ${calls}`);
};

// ---------------------------------------------------------------- dispatch

// Every command here sends traffic to the deployed Edge API, so the `--live` flag is required
// (the real-project guard's explicit-command rule — see server/tests/quota-guard.test.ts).
const argv = process.argv.slice(2);
if (!argv.includes('--live')) {
  console.error(
    'SKIPPED verify-0.55-playtest: it sends traffic to the deployed FUTASAKU Edge API.\n' +
      'Run it on purpose with --live, e.g.  npx tsx server/scripts/verify-0.55-playtest.ts --live world',
  );
  process.exit(3);
}
const [cmd, ...rest] = argv.filter((a) => a !== '--live');
const main = async () => {
  switch (cmd) {
    case 'guests': await cmdGuests(Number(rest[0] ?? 10)); break;
    case 'burst': await cmdBurst(Number(rest[0] ?? 10)); break;
    case 'duels': await cmdDuels(Number(rest[0] ?? 10)); break;
    case 'full': await cmdFull(); break;
    case 'resign': await cmdResign(); break;
    case 'wallet': await cmdWallet(rest[0]!); break;
    case 'world': await cmdWorld(); break;
    case 'claim': await cmdClaim(rest[0]!, rest[1]!); break;
    case 'claimtest': await cmdClaimTest(rest[0]!); break;
    case 'account': await cmdAccount(rest[0]!); break;
    case 'worldburst': await cmdWorldBurst(Number(rest[0] ?? 10)); break;
    case 'seedsrun': await cmdSeedsRun(rest[0]!); break;
    case 'campaign': await cmdCampaign(rest[0]!); break;
    default: console.log('unknown command');
  }
};
await main();
