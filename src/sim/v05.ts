// v0.5 simulation (Fruit, Strengthen, fairness). Bot-vs-bot games with swapped starts,
// split across processes, one JSON of raw per-game records per part; `--table` prints the
// metrics per setting.
//   npx tsx src/sim/v05.ts --name=A-f1 --config='{"fruitPerPlayer":1}' --levels=7,7 --games=2000 --part=0 --parts=4 --dir=sim-v05
//   npx tsx src/sim/v05.ts --table --dir=sim-v05
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { allNeighbors, apply, coordKey, legalActions, newGame, parseKey, score, viewFor } from '../engine/index.js';
import type { Player, RulesConfig, State } from '../engine/index.js';
import { botSeed, decideLevelAction } from '../bots/levels.js';
import type { Level } from '../bots/levels.js';
import { cutLoss } from '../bots/evaluate.js';

export type FruitUse = { seat: Player; turn: number; purposes: string[]; net: number; ownCut: number };
export type StrengthenUse = { seat: Player; turn: number; kind: 'chokepoint' | 'thin link' | 'gold' | 'other'; from: number; to: number };

export type V05Record = {
  seed: number;
  /** seat of the first-named level */
  aSeat: Player;
  winner: Player | null;
  reason: string;
  scores: [number, number];
  turns: number;
  fruits: FruitUse[];
  strengthens: StrengthenUse[];
  /** had a legal Fruit at some Grow step */
  fruitAvailable: [boolean, boolean];
  overgrows: number;
  cuts: number;
  /** player-turns 9+ with no Overgrow, Sever or Fruit at all, counted from the end */
  quietTail: number;
  topShareEnd: [number, number];
  openingTop: [number, number];
  avgTopInHand: [number, number];
  /** turns 1-5 (per player) with no legal combo or Sprout and no tile placed */
  stuckEarly: number;
  earlyTurns: number;
  /** behind at the midpoint (by 1+) */
  behindAtMid: [boolean, boolean];
  /** a top-rank tile touched an enemy tile (blocking); and one such tile was later removed */
  blockerSeen: boolean;
  blockerRemoved: boolean;
};

const other = (p: Player): Player => (p === 0 ? 1 : 0);
const topOf = (s: State, p: Player) => s.hands[p].filter((c) => c.rank === s.config.maxRank).length;

export const playV05 = (seed: number, levels: [Level, Level], aFirst: boolean, config: Partial<RulesConfig>): V05Record => {
  const seats: [Level, Level] = aFirst ? levels : [levels[1], levels[0]];
  let s = newGame(seed, config);
  const max = s.config.maxRank;
  const rec: V05Record = {
    seed,
    aSeat: aFirst ? 0 : 1,
    winner: null,
    reason: '',
    scores: [0, 0],
    turns: 0,
    fruits: [],
    strengthens: [],
    fruitAvailable: [false, false],
    overgrows: 0,
    cuts: 0,
    quietTail: 0,
    topShareEnd: [0, 0],
    openingTop: [topOf(s, 0), topOf(s, 1)],
    avgTopInHand: [0, 0],
    stuckEarly: 0,
    earlyTurns: 0,
    behindAtMid: [false, false],
    blockerSeen: false,
    blockerRemoved: false,
  };
  const topSamples: [number[], number[]] = [[], []];
  const activeTurns = new Set<number>(); // turns with an Overgrow, Sever or Fruit
  const diffByTurn: number[] = [];
  const blockers = new Set<string>();
  const turnPlaced = new Map<number, number>();
  const turnCouldGrow = new Map<number, boolean>();
  for (let i = 0; s.phase !== 'GAME_OVER'; i++) {
    if (i > 20_000) throw new Error(`v05 sim: game ${seed} did not finish`);
    const p = s.actor;
    const v = viewFor(s, p);
    if (s.phase === 'ACT') {
      const legal = legalActions(v);
      if (legal.some((a) => a.t === 'Fruit')) rec.fruitAvailable[p] = true;
      if (!turnCouldGrow.has(s.turnNumber)) turnCouldGrow.set(s.turnNumber, legal.some((a) => a.t === 'MeldRun' || a.t === 'MeldSet' || a.t === 'Sprout'));
    }
    if (s.phase === 'DRAW') {
      topSamples[p].push(topOf(s, p));
      diffByTurn[s.turnNumber] = score(s, 0) - score(s, 1);
    }
    const lv = seats[p];
    const d = decideLevelAction(v, lv, botSeed(s.seed, lv, s.turnNumber, s.history!.length));
    const before = s;
    s = apply(s, d.action);
    const events = s.history!.slice(before.history!.length);
    const turn = before.turnNumber;
    for (const e of events) {
      if (e.t === 'Overgrow') {
        rec.overgrows++;
        activeTurns.add(turn);
      }
      if (e.t === 'Sever') {
        rec.cuts++;
        activeTurns.add(turn);
        for (const c of e.coords) if (blockers.has(coordKey(c))) rec.blockerRemoved = true;
      }
      if (e.t === 'MeldRun' || e.t === 'MeldSet') turnPlaced.set(turn, (turnPlaced.get(turn) ?? 0) + e.hexes.length);
      if (e.t === 'Sprout') turnPlaced.set(turn, (turnPlaced.get(turn) ?? 0) + 1);
      if (e.t === 'Strengthen') {
        const key = coordKey(e.coord);
        const loss = cutLoss(before, key).length;
        const kind = loss >= 3 ? 'chokepoint' : loss === 2 ? 'thin link' : before.terrain[key] === 'rich' ? 'gold' : 'other';
        rec.strengthens.push({ seat: e.player, turn, kind, from: e.oldStrength, to: e.newStrength });
      }
      if (e.t === 'Fruit') {
        activeTurns.add(turn);
        const tgt = before.board[coordKey(e.target)]!;
        if (blockers.has(coordKey(e.target))) rec.blockerRemoved = true;
        const purposes: string[] = [];
        if (tgt.strength >= max) purposes.push('top-rank tile');
        const enemyCut = events.filter((x) => x.t === 'Sever' && x.player !== e.player).reduce((n, x) => n + (x as { coords: unknown[] }).coords.length, 0);
        const ownCut = events.filter((x) => x.t === 'Sever' && x.player === e.player).reduce((n, x) => n + (x as { coords: unknown[] }).coords.length, 0);
        if (enemyCut >= 3) purposes.push('big cut');
        if (s.result?.reason === 'strangle') purposes.push('strangle');
        if (score(before, e.player) < score(before, other(e.player))) purposes.push('behind');
        if (purposes.length === 0) purposes.push('other');
        const net = score(before, other(e.player)) - score(s, other(e.player)) - (score(before, e.player) - score(s, e.player));
        rec.fruits.push({ seat: e.player, turn, purposes, net, ownCut });
      }
    }
    // top-rank tiles touching an enemy tile are blockers
    for (const [k, t] of Object.entries(s.board)) {
      if (!t || t.root || t.strength < max) continue;
      if (allNeighbors(parseKey(k)).some((n) => {
        const o = s.board[coordKey(n)];
        return !!o && o.owner !== t.owner;
      })) {
        blockers.add(k);
        rec.blockerSeen = true;
      }
    }
  }
  const r = s.result!;
  rec.winner = r.winner;
  rec.reason = r.reason;
  rec.scores = r.scores;
  rec.turns = s.turnNumber;
  for (const p of [0, 1] as const) {
    const mine = Object.values(s.board).filter((t) => t && t.owner === p && !t.root);
    rec.topShareEnd[p] = mine.length ? mine.filter((t) => t!.strength >= max).length / mine.length : 0;
    rec.avgTopInHand[p] = topSamples[p].length ? topSamples[p].reduce((a, b) => a + b, 0) / topSamples[p].length : 0;
  }
  // quiet tail: the last 8 player-turns of a game that went past turn 8
  let quiet = 0;
  for (let t = s.turnNumber; t > Math.max(8, s.turnNumber - 8); t--) {
    if (activeTurns.has(t)) break;
    quiet++;
  }
  rec.quietTail = s.turnNumber > 8 ? quiet : 0;
  for (let t = 1; t <= Math.min(10, s.turnNumber); t++) {
    rec.earlyTurns++;
    if (!turnCouldGrow.get(t) && !turnPlaced.get(t)) rec.stuckEarly++;
  }
  const mid = Math.max(1, Math.floor(s.turnNumber / 2));
  const d = diffByTurn[mid] ?? 0;
  rec.behindAtMid = [d < 0, d > 0];
  return rec;
};

// ---------- metrics ----------

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const summarize = (rs: V05Record[]) => {
  const n = rs.length;
  const fruitGames = rs.filter((r) => r.fruits.length > 0);
  const fruitUses = rs.flatMap((r) => r.fruits.map((f) => ({ ...f, r })));
  const userWins = fruitUses.filter((f) => f.r.winner === f.seat).length;
  const purposes: Record<string, number> = {};
  for (const f of fruitUses) for (const p of f.purposes) purposes[p] = (purposes[p] ?? 0) + 1;
  const turnBucket = (t: number) => (t <= 6 ? '1-6' : t <= 12 ? '7-12' : t <= 18 ? '13-18' : '19+');
  const buckets: Record<string, number> = {};
  for (const f of fruitUses) buckets[turnBucket(f.turn)] = (buckets[turnBucket(f.turn)] ?? 0) + 1;
  const behindMid = rs.flatMap((r) => ([0, 1] as const).filter((p) => r.behindAtMid[p]).map((p) => ({ r, p })));
  const comebacks = behindMid.filter((x) => x.r.winner === x.p);
  const comebackWithFruit = behindMid.filter((x) => x.r.fruits.some((f) => f.seat === x.p));
  const decided = rs.filter((r) => {
    if (r.winner === null) return false;
    const w = r.winner;
    if (r.reason === 'strangle' && r.fruits.some((f) => f.seat === w && f.purposes.includes('strangle'))) return true;
    const margin = r.scores[w] - r.scores[other(w)];
    return r.fruits.some((f) => f.seat === w && f.net >= margin);
  });
  const strengthens = rs.flatMap((r) => r.strengthens);
  const kinds: Record<string, number> = {};
  for (const st of strengthens) kinds[st.kind] = (kinds[st.kind] ?? 0) + 1;
  const moreStrength = rs.filter((r) => {
    const a = r.strengthens.filter((x) => x.seat === 0).length;
    const b = r.strengthens.filter((x) => x.seat === 1).length;
    return a !== b;
  });
  const moreWins = moreStrength.filter((r) => {
    const a = r.strengthens.filter((x) => x.seat === 0).length;
    const b = r.strengthens.filter((x) => x.seat === 1).length;
    return r.winner === (a > b ? 0 : 1);
  });
  const seatsWithFruit = rs.flatMap((r) => ([0, 1] as const).filter((p) => r.fruitAvailable[p]).map((p) => ({ r, p })));
  const reflexive = seatsWithFruit.filter((x) => x.r.fruits.some((f) => f.seat === x.p && f.turn <= 6));
  const forgotten = seatsWithFruit.filter((x) => !x.r.fruits.some((f) => f.seat === x.p));
  const opening = rs.flatMap((r) => ([0, 1] as const).map((p) => ({ r, p, top: r.openingTop[p] })));
  const rich = opening.filter((o) => o.top >= 3);
  return {
    games: n,
    fruitGameRate: fruitGames.length / n,
    fruitPerGame: fruitUses.length / n,
    fruitPerSide: fruitUses.length / (2 * n),
    fruitMeanTurn: mean(fruitUses.map((f) => f.turn)),
    fruitBuckets: buckets,
    fruitPurposes: purposes,
    fruitUserWinRate: fruitUses.length ? userWins / fruitUses.length : 0,
    comebackRate: behindMid.length ? comebacks.length / behindMid.length : 0,
    comebackRateWithFruit: comebackWithFruit.length ? comebackWithFruit.filter((x) => x.r.winner === x.p).length / comebackWithFruit.length : 0,
    leaderWinRate: behindMid.length ? 1 - comebacks.length / behindMid.length : 0,
    decidedByFruit: decided.length / n,
    strengthenGameRate: rs.filter((r) => r.strengthens.length > 0).length / n,
    strengthenPerGame: strengthens.length / n,
    strengthenPerSide: strengthens.length / (2 * n),
    strengthenKinds: kinds,
    moreStrengthWins: moreStrength.length ? moreWins.length / moreStrength.length : 0,
    topShareOver30: rs.filter((r) => r.topShareEnd[0] > 0.3 || r.topShareEnd[1] > 0.3).length / n,
    overgrowCutPerGame: mean(rs.map((r) => r.overgrows + r.cuts)),
    quietTail8: rs.filter((r) => r.quietTail >= 8).length / n,
    openingTop3Rate: rich.length / opening.length,
    openingTop3WinRate: rich.length ? rich.filter((o) => o.r.winner === o.p).length / rich.length : 0,
    openingTopMean: mean(opening.map((o) => o.top)),
    topInHandOverTime: mean(rs.flatMap((r) => r.avgTopInHand)),
    stuckEarlyRate: rs.reduce((a, r) => a + r.stuckEarly, 0) / Math.max(1, rs.reduce((a, r) => a + r.earlyTurns, 0)),
    turnsPerPlayer: mean(rs.map((r) => r.turns / 2)),
    firstPlayerWinRate: rs.filter((r) => r.winner === 0).length / n,
    strangleRate: rs.filter((r) => r.reason === 'strangle').length / n,
    blockerRemovedRate: rs.filter((r) => r.blockerSeen).length ? rs.filter((r) => r.blockerSeen && r.blockerRemoved).length / rs.filter((r) => r.blockerSeen).length : 0,
    reflexive: seatsWithFruit.length ? reflexive.length / seatsWithFruit.length : 0,
    forgotten: seatsWithFruit.length ? forgotten.length / seatsWithFruit.length : 0,
    aWinRate: rs.filter((r) => r.winner === r.aSeat).length / n,
  };
};

export const formatRow = (name: string, m: ReturnType<typeof summarize>) =>
  `| ${name} | ${m.games} | ${pct(m.fruitGameRate)} | ${m.fruitMeanTurn.toFixed(1)} | ${pct(m.fruitUserWinRate)} | ${pct(m.comebackRate)} | ${pct(m.leaderWinRate)} | ${pct(m.decidedByFruit)} | ${pct(m.strengthenGameRate)} | ${m.strengthenPerGame.toFixed(2)} | ${pct(m.moreStrengthWins)} | ${m.overgrowCutPerGame.toFixed(1)} | ${pct(m.quietTail8)} | ${pct(m.topShareOver30)} | ${pct(m.blockerRemovedRate)} | ${pct(m.stuckEarlyRate)} | ${m.turnsPerPlayer.toFixed(2)} | ${pct(m.firstPlayerWinRate)} | ${pct(m.strangleRate)} | ${pct(m.reflexive)} | ${pct(m.forgotten)} |`;

export const HEADER =
  '| Setting | Games | Fruit games | Fruit mean turn | Fruit user wins | Comeback | Leader wins | Decided by Fruit | Strengthen games | Strengthen/game | More-strengthen side wins | Overgrow+cut/game | Quiet last 8 | >30% top-rank | Blocker removed | Stuck early | Turns/player | P1 wins | Strangle | Reflexive Fruit | Forgotten Fruit |\n|' +
  ' --- |'.repeat(21);

// ---------- CLI ----------

const opt = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = opt('dir') ?? 'sim-v05';

if (process.argv.includes('--table')) {
  const byName = new Map<string, V05Record[]>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as { name: string; records: V05Record[] };
    byName.set(data.name, [...(byName.get(data.name) ?? []), ...data.records]);
  }
  console.log(HEADER);
  for (const [name, rs] of [...byName].sort(([a], [b]) => a.localeCompare(b))) console.log(formatRow(name, summarize(rs)));
  if (process.argv.includes('--details')) for (const [name, rs] of byName) console.log(name, JSON.stringify(summarize(rs)));
} else if (opt('name')) {
  const name = opt('name')!;
  const config = JSON.parse(opt('config') ?? '{}') as Partial<RulesConfig>;
  const levels = (opt('levels') ?? '7,7').split(',').map(Number) as [Level, Level];
  const games = Number(opt('games') ?? 2000);
  const part = Number(opt('part') ?? 0);
  const parts = Number(opt('parts') ?? 1);
  const first = Number(opt('first') ?? 20_000);
  mkdirSync(dir, { recursive: true });
  const records: V05Record[] = [];
  for (let i = part; i < games / 2; i += parts) for (const aFirst of [true, false]) records.push(playV05(first + i, levels, aFirst, config));
  writeFileSync(`${dir}/${name}-p${part}.json`, JSON.stringify({ name, config, levels, records }));
  console.log(`${name} part ${part}: ${records.length} games`);
}
