// v0.6 Fruit cards simulation (Step 6 of the Fruit cards task). Level-7 vs level-7 games with
// swapped starts on matched seeds, split over processes; one JSON of per-game records per part;
// `--table` prints the metrics per setting.
//   npx tsx src/sim/fruitcards.ts --name=count4 --config='{"fruitCardCount":4}' --games=500 --part=0 --parts=4 --dir=sim-fruit
//   npx tsx src/sim/fruitcards.ts --table --dir=sim-fruit
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { apply, isFruitCard, legalActions, newGame, score, viewFor } from '../engine/index.js';
import type { Player, RulesConfig, State } from '../engine/index.js';
import { botSeed, decideLevelAction } from '../bots/levels.js';
import type { Level } from '../bots/levels.js';

/** A player's own turn number (1, 2, ...) from the engine's turnNumber (both players' turns). */
const ownTurn = (turnNumber: number) => Math.ceil(turnNumber / 2);
const bucketOf = (t: number) => (t <= 3 ? '1-3' : t <= 6 ? '4-6' : t <= 12 ? '7-12' : '13+');
const BUCKETS = ['1-3', '4-6', '7-12', '13+'] as const;

export type FruitPlay = { seat: Player; turn: number; on: 'top-rank tile' | 'chain cut' | 'opened a Strangle' | 'other'; removed: number; second: boolean };
export type FruitRecord = {
  seed: number;
  winner: Player | null;
  reason: string;
  scores: [number, number];
  turns: number;
  plays: FruitPlay[];
  /** turns where a side played two (or more) Fruit cards; did that side win, and its score lead after the turn */
  doubles: { seat: Player; won: boolean; leadAfter: number }[];
  thrown: number;
  thrownThenTaken: number;
  stuckAtEnd: number;
  topShareEnd: [number, number];
  behindAtMid: [boolean, boolean];
  /** Grow steps (my turn's first ACT) by own-turn bucket: total, no combo (Sprout only), nothing at all */
  grow: Record<string, { steps: number; noCombo: number; nothing: number }>;
};

const other = (p: Player): Player => (p === 0 ? 1 : 0);

export const playFruitGame = (seed: number, aFirst: boolean, config: Partial<RulesConfig>, levels: [Level, Level] = [7, 7]): FruitRecord => {
  const seats: [Level, Level] = aFirst ? levels : [levels[1], levels[0]];
  let s: State = newGame(seed, config);
  const max = s.config.maxRank;
  const rec: FruitRecord = {
    seed,
    winner: null,
    reason: '',
    scores: [0, 0],
    turns: 0,
    plays: [],
    doubles: [],
    thrown: 0,
    thrownThenTaken: 0,
    stuckAtEnd: 0,
    topShareEnd: [0, 0],
    behindAtMid: [false, false],
    grow: Object.fromEntries(BUCKETS.map((b) => [b, { steps: 0, noCombo: 0, nothing: 0 }])),
  };
  const diffByTurn: number[] = [];
  const thrownIds = new Set<number>();
  const fruitThisTurn = new Map<number, number>();
  let lastGrowTurn = -1;
  for (let i = 0; s.phase !== 'GAME_OVER'; i++) {
    if (i > 20_000) throw new Error(`fruit sim: game ${seed} did not finish`);
    const p = s.actor;
    const v = viewFor(s, p);
    if (s.phase === 'ACT' && s.turnNumber !== lastGrowTurn) {
      lastGrowTurn = s.turnNumber;
      const legal = legalActions(v);
      const g = rec.grow[bucketOf(ownTurn(s.turnNumber))]!;
      g.steps++;
      if (!legal.some((a) => a.t === 'Bloom')) g.noCombo++;
      if (legal.every((a) => a.t === 'EndAct')) g.nothing++;
    }
    if (s.phase === 'DRAW') diffByTurn[s.turnNumber] = score(s, 0) - score(s, 1);
    const lv = seats[p];
    const d = decideLevelAction(v, lv, botSeed(s.seed, lv, s.turnNumber, s.history!.length));
    const before = s;
    s = apply(s, d.action);
    const events = s.history!.slice(before.history!.length);
    for (const e of events) {
      if (e.t === 'FruitCard') {
        const removed = 1 + events.filter((x) => x.t === 'Sever' && x.player !== e.player).reduce((n, x) => n + (x as { coords: unknown[] }).coords.length, 0);
        const on: FruitPlay['on'] =
          e.strength >= max ? 'top-rank tile' : removed >= 3 ? 'chain cut' : d.reason?.includes('Strangle') ? 'opened a Strangle' : 'other';
        const n = (fruitThisTurn.get(before.turnNumber) ?? 0) + 1;
        fruitThisTurn.set(before.turnNumber, n);
        rec.plays.push({ seat: e.player, turn: ownTurn(before.turnNumber), on: d.reason?.includes('Strangle') ? 'opened a Strangle' : on, removed, second: n >= 2 });
        if (n === 2) rec.doubles.push({ seat: e.player, won: false, leadAfter: 0 });
      }
      if (e.t === 'Discard' && isFruitCard(before.hands[e.player].find((c) => c.id === e.card)!)) {
        rec.thrown++;
        thrownIds.add(e.card);
      }
      if (e.t === 'Draw' && e.from === 'discard' && e.card !== undefined && thrownIds.has(e.card)) rec.thrownThenTaken++;
    }
    // the score lead after a double turn (when that turn ends)
    if (before.turnPlayer !== s.turnPlayer || s.phase === 'GAME_OVER') {
      const dbl = rec.doubles.at(-1);
      if (dbl && fruitThisTurn.get(before.turnNumber) === 2 && dbl.leadAfter === 0) dbl.leadAfter = score(s, dbl.seat) - score(s, other(dbl.seat)) || 0.0001;
    }
  }
  const r = s.result!;
  rec.winner = r.winner;
  rec.reason = r.reason;
  rec.scores = r.scores;
  rec.turns = s.turnNumber;
  rec.stuckAtEnd = [...s.hands[0], ...s.hands[1]].filter(isFruitCard).length;
  for (const d of rec.doubles) d.won = r.winner === d.seat;
  for (const p of [0, 1] as const) {
    const mine = Object.values(s.board).filter((t) => t && t.owner === p && !t.root);
    rec.topShareEnd[p] = mine.length ? mine.filter((t) => t!.strength >= max).length / mine.length : 0;
  }
  const mid = Math.max(1, Math.floor(s.turnNumber / 2));
  const dmid = diffByTurn[mid] ?? 0;
  rec.behindAtMid = [dmid < 0, dmid > 0];
  return rec;
};

// ---------- metrics ----------

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const summarize = (rs: FruitRecord[]) => {
  const n = rs.length;
  const plays = rs.flatMap((r) => r.plays.map((p) => ({ ...p, r })));
  const on: Record<string, number> = {};
  for (const p of plays) on[p.on] = (on[p.on] ?? 0) + 1;
  const sides = rs.flatMap((r) => ([0, 1] as const).map((p) => ({ r, p, k: r.plays.filter((x) => x.seat === p).length })));
  const unequal = rs.filter((r) => r.plays.filter((x) => x.seat === 0).length !== r.plays.filter((x) => x.seat === 1).length && r.winner !== null);
  const moreWins = unequal.filter((r) => {
    const a = r.plays.filter((x) => x.seat === 0).length;
    const b = r.plays.filter((x) => x.seat === 1).length;
    return r.winner === (a > b ? 0 : 1);
  });
  const doubles = rs.flatMap((r) => r.doubles);
  const behindMid = rs.flatMap((r) => ([0, 1] as const).filter((p) => r.behindAtMid[p]).map((p) => ({ r, p })));
  const comebacks = behindMid.filter((x) => x.r.winner === x.p);
  const thrown = rs.reduce((a, r) => a + r.thrown, 0);
  const taken = rs.reduce((a, r) => a + r.thrownThenTaken, 0);
  const totalFruit = plays.length + thrown + rs.reduce((a, r) => a + r.stuckAtEnd, 0);
  const grow = Object.fromEntries(
    BUCKETS.map((b) => {
      const g = rs.reduce((a, r) => ({ steps: a.steps + r.grow[b]!.steps, noCombo: a.noCombo + r.grow[b]!.noCombo, nothing: a.nothing + r.grow[b]!.nothing }), { steps: 0, noCombo: 0, nothing: 0 });
      return [b, { noCombo: g.steps ? g.noCombo / g.steps : 0, nothing: g.steps ? g.nothing / g.steps : 0, steps: g.steps }];
    }),
  ) as Record<string, { noCombo: number; nothing: number; steps: number }>;
  const after3 = BUCKETS.slice(1).reduce((a, b) => ({ s: a.s + rs.reduce((x, r) => x + r.grow[b]!.steps, 0), z: a.z + rs.reduce((x, r) => x + r.grow[b]!.nothing, 0) }), { s: 0, z: 0 });
  const ends: Record<string, number> = {};
  for (const r of rs) ends[r.reason] = (ends[r.reason] ?? 0) + 1;
  return {
    games: n,
    fruitGameRate: rs.filter((r) => r.plays.length > 0).length / n,
    fruitPerGame: plays.length / n,
    fruitPerSide: mean(sides.map((x) => x.k)),
    fruitMeanTurn: mean(plays.map((p) => p.turn)),
    fruitOn: on,
    moreFruitWins: unequal.length ? moreWins.length / unequal.length : 0,
    doublesPerGame: doubles.length / n,
    doubleWins: doubles.length ? doubles.filter((d) => d.won).length / doubles.length : 0,
    doubleLeadAfter: mean(doubles.map((d) => d.leadAfter)),
    thrownShare: totalFruit ? thrown / totalFruit : 0,
    thrownTakenShare: totalFruit ? taken / totalFruit : 0,
    stuckPerGame: rs.reduce((a, r) => a + r.stuckAtEnd, 0) / n,
    topShareOver30: rs.filter((r) => r.topShareEnd[0] > 0.3 || r.topShareEnd[1] > 0.3).length / n,
    comebackRate: behindMid.length ? comebacks.length / behindMid.length : 0,
    leaderWinRate: behindMid.length ? 1 - comebacks.length / behindMid.length : 0,
    firstPlayerWinRate: rs.filter((r) => r.winner === 0).length / n,
    strangleRate: rs.filter((r) => r.reason === 'strangle' || r.reason === 'double_strangle').length / n,
    turnsPerPlayer: mean(rs.map((r) => r.turns / 2)),
    ends,
    grow,
    nothingAfterTurn3: after3.s ? after3.z / after3.s : 0,
  };
};

export const HEADER =
  '| Setting | Games | Fruit games | Fruit/game | Fruit/side | Mean turn | More-Fruit side wins | Two in a turn/game | Thrown, then taken | Stuck at end/game | >30% top-rank | Comeback | Leader wins | P1 wins | Strangle | Turns/player | Ends: deck · turn limit · Strangle |\n|' +
  ' --- |'.repeat(17);
export const formatRow = (name: string, m: ReturnType<typeof summarize>) =>
  `| ${name} | ${m.games} | ${pct(m.fruitGameRate)} | ${m.fruitPerGame.toFixed(2)} | ${m.fruitPerSide.toFixed(2)} | ${m.fruitMeanTurn.toFixed(1)} | ${pct(m.moreFruitWins)} | ${m.doublesPerGame.toFixed(2)} (wins ${pct(m.doubleWins)}) | ${pct(m.thrownTakenShare)} | ${m.stuckPerGame.toFixed(2)} | ${pct(m.topShareOver30)} | ${pct(m.comebackRate)} | ${pct(m.leaderWinRate)} | ${pct(m.firstPlayerWinRate)} | ${pct(m.strangleRate)} | ${m.turnsPerPlayer.toFixed(2)} | ${pct((m.ends.deck_exhaustion ?? 0) / m.games)} · ${pct((m.ends.turn_limit ?? 0) / m.games)} · ${pct(((m.ends.strangle ?? 0) + (m.ends.double_strangle ?? 0)) / m.games)} |`;
export const formatGrow = (name: string, m: ReturnType<typeof summarize>) =>
  `| ${name} | ${BUCKETS.map((b) => `${pct(m.grow[b]!.noCombo)} / ${pct(m.grow[b]!.nothing)}`).join(' | ')} | ${pct(m.nothingAfterTurn3)} |`;
export const formatOn = (name: string, m: ReturnType<typeof summarize>) => {
  const total = Object.values(m.fruitOn).reduce((a, b) => a + b, 0) || 1;
  return `| ${name} | ${['top-rank tile', 'chain cut', 'opened a Strangle', 'other'].map((k) => pct((m.fruitOn[k] ?? 0) / total)).join(' | ')} | ${pct(m.thrownShare)} | ${m.doubleLeadAfter.toFixed(1)} |`;
};

// ---------- CLI ----------

const opt = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = opt('dir') ?? 'sim-fruit';

if (process.argv.includes('--table')) {
  const byName = new Map<string, FruitRecord[]>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as { name: string; records: FruitRecord[] };
    byName.set(data.name, [...(byName.get(data.name) ?? []), ...data.records]);
  }
  const rows = [...byName].sort(([a], [b]) => a.localeCompare(b)).map(([name, rs]) => [name, summarize(rs)] as const);
  console.log(HEADER);
  for (const [name, m] of rows) console.log(formatRow(name, m));
  console.log('\n| Setting | No combo / nothing to play: turns 1-3 | 4-6 | 7-12 | 13+ | Nothing to play after turn 3 |\n|' + ' --- |'.repeat(6));
  for (const [name, m] of rows) console.log(formatGrow(name, m));
  console.log('\n| Setting | On a top-rank tile | On a chain cut (3+ removed) | Opened a Strangle | Other | Fruit cards thrown | Lead after a two-Fruit turn |\n|' + ' --- |'.repeat(7));
  for (const [name, m] of rows) console.log(formatOn(name, m));
} else if (opt('name')) {
  const name = opt('name')!;
  const config = JSON.parse(opt('config') ?? '{}') as Partial<RulesConfig>;
  const games = Number(opt('games') ?? 500);
  const part = Number(opt('part') ?? 0);
  const parts = Number(opt('parts') ?? 1);
  const first = Number(opt('first') ?? 30_000);
  mkdirSync(dir, { recursive: true });
  const records: FruitRecord[] = [];
  for (let i = part; i < games / 2; i += parts) for (const aFirst of [true, false]) records.push(playFruitGame(first + i, aFirst, config));
  writeFileSync(`${dir}/${name}-p${part}.json`, JSON.stringify({ name, config, records }));
  console.log(`${name} part ${part}: ${records.length} games`);
}
