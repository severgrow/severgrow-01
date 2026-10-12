// Phase 0 SPIKE P-1 — MatchService CPU timing (MemoryStorage, no DB required).
//
//   PATH="$HOME/.local/node22/bin:$PATH" node --import tsx server/scripts/hosting-spike.ts
//
// Measures wall + process.cpuUsage for late-game apply / view / legalActions.
// Also prints a Deno Edge portability verdict for MatchService.
import { applyAs, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import type { MatchRecord, MoveRecord, Participant, PlayerRecord, TokenRecord } from '../src/storage/types.js';

const SAMPLES = 24;
const CPU_FLAG_MS = 300;
const EDGE_CPU_BUDGET_MS = 2000;

type MsStats = { p50: number; p95: number; max: number; over300: number; n: number };

const ms = (us: number): number => us / 1000;

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx]!;
};

const stats = (samples: number[]): MsStats => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
    over300: samples.filter((x) => x > CPU_FLAG_MS).length,
    n: samples.length,
  };
};

const fmt = (s: MsStats): string =>
  `p50=${s.p50.toFixed(2)}  p95=${s.p95.toFixed(2)}  max=${s.max.toFixed(2)}  n=${s.n}` +
  (s.over300 > 0 ? `  !! ${s.over300} sample(s) > ${CPU_FLAG_MS} ms` : '');

/** Runtime snapshot of MemoryStorage private maps (spike-only restore for repeated apply samples). */
type StoreSnap = {
  players: [string, PlayerRecord][];
  tokensByHash: [string, TokenRecord][];
  matches: [string, MatchRecord][];
  inviteIndex: [string, string][];
  participants: [string, Participant[]][];
  moves: [string, MoveRecord[]][];
};

type MemInternals = {
  players: Map<string, PlayerRecord>;
  tokensByHash: Map<string, TokenRecord>;
  matches: Map<string, MatchRecord>;
  inviteIndex: Map<string, string>;
  participants: Map<string, Participant[]>;
  moves: Map<string, MoveRecord[]>;
};

const internals = (storage: MemoryStorage): MemInternals => storage as unknown as MemInternals;

const takeSnap = (storage: MemoryStorage): StoreSnap => {
  const s = internals(storage);
  return {
    players: structuredClone([...s.players.entries()]),
    tokensByHash: structuredClone([...s.tokensByHash.entries()]),
    matches: structuredClone([...s.matches.entries()]),
    inviteIndex: structuredClone([...s.inviteIndex.entries()]),
    participants: structuredClone([...s.participants.entries()]),
    moves: structuredClone([...s.moves.entries()]),
  };
};

const restoreSnap = (storage: MemoryStorage, snap: StoreSnap): void => {
  const s = internals(storage);
  s.players.clear();
  for (const [k, v] of snap.players) s.players.set(k, structuredClone(v));
  s.tokensByHash.clear();
  for (const [k, v] of snap.tokensByHash) s.tokensByHash.set(k, structuredClone(v));
  s.matches.clear();
  for (const [k, v] of snap.matches) s.matches.set(k, structuredClone(v));
  s.inviteIndex.clear();
  for (const [k, v] of snap.inviteIndex) s.inviteIndex.set(k, v);
  s.participants.clear();
  for (const [k, v] of snap.participants) s.participants.set(k, structuredClone(v));
  s.moves.clear();
  for (const [k, v] of snap.moves) s.moves.set(k, structuredClone(v));
};

const actionCost = (a: Action): number => {
  switch (a.t) {
    case 'Bloom':
      return 1000 + a.cards.length * 10;
    case 'MegaBomb':
      return 900;
    case 'PlayFruit':
      return 800;
    case 'Sprout':
      return 500;
    case 'EndAct':
      return 50;
    default:
      return 10;
  }
};

const pickProgress = (legal: Action[]): Action => {
  // Prefer Grow/Bomb/Blast placements when exploring; otherwise first legal.
  const ranked = [...legal].sort((a, b) => actionCost(b) - actionCost(a));
  return ranked[0]!;
};

const pickWorst = (legal: Action[]): Action => pickProgress(legal);

type LatePos = {
  storage: MemoryStorage;
  service: MatchService;
  pa: PlayerRecord;
  pb: PlayerRecord;
  matchId: string;
  seat: 0 | 1;
  state: State;
  action: Action;
  revision: number;
  snap: StoreSnap;
  note: string;
};

const actorOf = async (
  service: MatchService,
  pa: PlayerRecord,
  pb: PlayerRecord,
  matchId: string,
): Promise<{ player: PlayerRecord; revision: number; legal: Action[]; seat: 0 | 1 } | null> => {
  const va = await service.viewPayload(pa, matchId);
  if (va.legalActions.length > 0) return { player: pa, revision: va.revision, legal: va.legalActions, seat: va.seat };
  const vb = await service.viewPayload(pb, matchId);
  if (vb.legalActions.length > 0) return { player: pb, revision: vb.revision, legal: vb.legalActions, seat: vb.seat };
  return null;
};

const reachLate = async (): Promise<LatePos> => {
  let best: LatePos | null = null;

  for (let attempt = 0; attempt < 40; attempt++) {
    const storage = new MemoryStorage();
    let now = 1_000_000;
    const service = new MatchService({ storage, config: DEFAULT_SERVER_CONFIG, now: () => (now += 1) });
    const a = await service.createGuest('SpikeA');
    const b = await service.createGuest('SpikeB');
    const pa = await service.authenticate(a.token);
    const pb = await service.authenticate(b.token);
    const created = await service.createMatch(pa);
    await service.joinMatch(pb, created.match.inviteCode);
    const matchId = created.match.matchId;

    let moves = 0;
    let foundBloomOrBlast = false;
    while (moves < 400) {
      const next = await actorOf(service, pa, pb, matchId);
      if (!next) break;
      const match = (await storage.matchById(matchId))!;
      const handLen = match.state.hands[next.seat].length;
      const deckLen = match.state.deck.length;
      const hasBloom = next.legal.some((x) => x.t === 'Bloom');
      const hasBlast = next.legal.some((x) => x.t === 'MegaBomb' || x.t === 'PlayFruit');
      const lateEnough = deckLen <= 20 || match.state.deckFinal != null || match.revision >= 40;

      if (lateEnough && handLen >= 5 && (hasBloom || hasBlast || next.legal.some((x) => x.t === 'Sprout'))) {
        const action = pickWorst(next.legal.filter((x) => x.t === 'Bloom' || x.t === 'MegaBomb' || x.t === 'PlayFruit' || x.t === 'Sprout' || x.t === 'EndAct'));
        const note = [
          `attempt=${attempt}`,
          `rev=${match.revision}`,
          `deck=${deckLen}`,
          `hand=${handLen}`,
          `phase=${match.state.phase}`,
          `legal=${next.legal.length}`,
          `bloom=${hasBloom}`,
          `blast=${hasBlast}`,
          `pick=${action.t}`,
        ].join(' ');
        const cand: LatePos = {
          storage,
          service,
          pa,
          pb,
          matchId,
          seat: next.seat,
          state: structuredClone(match.state),
          action,
          revision: next.revision,
          snap: takeSnap(storage),
          note,
        };
        if (hasBloom || hasBlast) {
          foundBloomOrBlast = true;
          return cand;
        }
        if (!best || match.revision > (await best.storage.matchById(best.matchId))!.revision) best = cand;
      }

      await service.submitAction(next.player, matchId, {
        expectedRevision: next.revision,
        requestId: `spike-${attempt}-${moves}`,
        action: pickProgress(next.legal),
      });
      moves++;
    }

    if (foundBloomOrBlast) break;
  }

  if (!best) throw new Error('Could not reach a measurable late-game position');
  return best;
};

const timeCpu = async (fn: () => void | Promise<void>, n: number): Promise<{ wall: number[]; cpu: number[] }> => {
  const wall: number[] = [];
  const cpu: number[] = [];
  // Warmup
  await fn();
  for (let i = 0; i < n; i++) {
    const c0 = process.cpuUsage();
    const w0 = performance.now();
    await fn();
    const w1 = performance.now();
    const c1 = process.cpuUsage(c0);
    wall.push(w1 - w0);
    cpu.push(ms(c1.user + c1.system));
  }
  return { wall, cpu };
};

const printEdgeVerdict = (): void => {
  console.log('\n## Edge vs Node (MatchService portability)\n');
  console.log('Node-only deps under server/src:');
  console.log('  - server/src/http.ts          → node:http (createServer)');
  console.log('  - server/src/ids.ts           → node:crypto (randomBytes, createHash, randomUUID)');
  console.log('  - server/src/index.ts         → node:url (pathToFileURL)');
  console.log('  - server/src/storage/pg-pool.ts → pg (Pool)');
  console.log('  - server/src/storage/postgres.ts → structural PgPool (ok on Deno if client swapped)');
  console.log('');
  console.log('MatchService itself: engine + MemoryStorage are portable (no Node builtins).');
  console.log('Blocking for Supabase Edge today: node:crypto in ids.ts, node:http wrapper, pg driver.');
  console.log('');
  console.log('Port checklist if choosing Edge (<1 day estimate for thin wrapper):');
  console.log('  1. ids.ts → Web Crypto (crypto.getRandomValues / SubtleCrypto digest) + crypto.randomUUID');
  console.log('  2. Deno.serve HTTP adapter (same routes as http.ts)');
  console.log('  3. Postgres: Deno client or supabase-js with prepare:false on transaction pooler :6543');
  console.log('  4. Keep MatchService + postgresStorage query surface; drop node pg Pool');
  console.log('');
  console.log('VERDICT: Edge is feasible with a <1 day port of ids + HTTP + DB client.');
  console.log('Prefer Edge for free-tier colocated Postgres IF CPU p95 stays << 2s (see table).');
  console.log('If Edge port slips: Node host options (no paid account created by this spike):');
  console.log('  - Render free web service: cold start often 30s+, no card historically for free tier');
  console.log('  - Fly.io free allowance: may ask for a card; cold starts shorter than Render');
  console.log('  - Railway trial: usually needs a card');
  console.log('  - Deno Deploy free: good if already on Deno.serve path');
  console.log('  - Supabase Edge free: ~2s CPU budget per isolate invocation; cold start typically low hundreds of ms');
};

const main = async (): Promise<void> => {
  console.log('SPIKE P-1 — MatchService CPU timing (MemoryStorage)\n');
  const late = await reachLate();
  console.log(`Late position: ${late.note}`);
  console.log(`Action under test: ${JSON.stringify(late.action).slice(0, 120)}…\n`);

  const actorPlayer = late.seat === 0 ? late.pa : late.pb;

  // --- legalActions alone ---
  const legalAlone = await timeCpu(() => {
    legalActions(viewFor(late.state, late.seat));
  }, SAMPLES);

  // --- view only (no legalActions) ---
  const viewOnly = await timeCpu(() => {
    viewFor(late.state, late.seat);
  }, SAMPLES);

  // --- viewFor + legalActions (service payload hot path) ---
  const viewPlusLegal = await timeCpu(() => {
    const v = viewFor(late.state, late.seat);
    legalActions(v);
  }, SAMPLES);

  // --- service viewPayload (includes storage lookups + legalActions) ---
  const serviceView = await timeCpu(async () => {
    await late.service.viewPayload(actorPlayer, late.matchId);
  }, SAMPLES);

  // --- applyAs alone (decide() core) ---
  const applyAlone = await timeCpu(() => {
    applyAs(late.state, late.seat, late.action);
  }, SAMPLES);

  // --- full commitMove through service (restore snap each sample) ---
  let req = 0;
  const commitSvc = await timeCpu(async () => {
    restoreSnap(late.storage, late.snap);
    await late.service.submitAction(actorPlayer, late.matchId, {
      expectedRevision: late.revision,
      requestId: `timing-${req++}`,
      action: late.action,
    });
  }, SAMPLES);

  console.log('## Measurements (ms)\n');
  console.log('| Path | Wall p50/p95/max | CPU p50/p95/max | >300ms CPU |');
  console.log('| --- | --- | --- | --- |');
  const row = (name: string, wall: number[], cpu: number[]) => {
    const w = stats(wall);
    const c = stats(cpu);
    console.log(
      `| ${name} | ${w.p50.toFixed(2)} / ${w.p95.toFixed(2)} / ${w.max.toFixed(2)} | ${c.p50.toFixed(2)} / ${c.p95.toFixed(2)} / ${c.max.toFixed(2)} | ${c.over300} |`,
    );
    return c;
  };

  const cLegal = row('legalActions alone', legalAlone.wall, legalAlone.cpu);
  const cView = row('viewFor only (no legal)', viewOnly.wall, viewOnly.cpu);
  const cBoth = row('viewFor + legalActions', viewPlusLegal.wall, viewPlusLegal.cpu);
  const cSvcView = row('service.viewPayload', serviceView.wall, serviceView.cpu);
  const cApply = row('applyAs (decide core)', applyAlone.wall, applyAlone.cpu);
  const cCommit = row('service.submitAction (commitMove)', commitSvc.wall, commitSvc.cpu);

  console.log('\nDetail:');
  console.log(`  legalActions alone:     wall ${fmt(stats(legalAlone.wall))} | cpu ${fmt(cLegal)}`);
  console.log(`  viewFor only:           wall ${fmt(stats(viewOnly.wall))} | cpu ${fmt(cView)}`);
  console.log(`  viewFor+legalActions:   wall ${fmt(stats(viewPlusLegal.wall))} | cpu ${fmt(cBoth)}`);
  console.log(`  service.viewPayload:    wall ${fmt(stats(serviceView.wall))} | cpu ${fmt(cSvcView)}`);
  console.log(`  applyAs:                wall ${fmt(stats(applyAlone.wall))} | cpu ${fmt(cApply)}`);
  console.log(`  service.submitAction:   wall ${fmt(stats(commitSvc.wall))} | cpu ${fmt(cCommit)}`);

  const worstCpu = Math.max(cLegal.max, cView.max, cBoth.max, cSvcView.max, cApply.max, cCommit.max);
  const comfortable = worstCpu < EDGE_CPU_BUDGET_MS * 0.25;
  console.log('\n## Edge 2s CPU budget\n');
  console.log(`Worst sample CPU among paths: ${worstCpu.toFixed(2)} ms`);
  console.log(
    comfortable
      ? `Comfortable: yes — worst sample is ${(100 * worstCpu) / EDGE_CPU_BUDGET_MS}% of ${EDGE_CPU_BUDGET_MS} ms budget.`
      : `Comfortable: marginal/no — worst sample ${worstCpu.toFixed(2)} ms vs ${EDGE_CPU_BUDGET_MS} ms budget.`,
  );

  printEdgeVerdict();
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
