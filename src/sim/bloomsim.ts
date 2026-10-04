// v0.7 Bloom simulation (Step 8 of the Bloom task). Level-7 vs level-7 games, one per seed
// (with the same level on both sides, swapping the seats would replay the same game), split
// over processes; one JSON of per-game records per part; `--table` prints the metrics.
//   npx tsx src/sim/bloomsim.ts --games=500 --part=0 --parts=4 --dir=sim-bloom
//   npx tsx src/sim/bloomsim.ts --table --dir=sim-bloom
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { allNeighbors, apply, bloomGroups, coordKey, isFruitCard, legalActions, newGame, rootCoord, score, viewFor } from '../engine/index.js';
import type { Action, Card, Player, State } from '../engine/index.js';
import { botSeed, decideLevelAction } from '../bots/levels.js';

const ownTurn = (turnNumber: number) => Math.ceil(turnNumber / 2);
const BUCKETS = ['1-3', '4-6', '7-12', '13+'] as const;
const bucketOf = (t: number) => (t <= 3 ? '1-3' : t <= 6 ? '4-6' : t <= 12 ? '7-12' : '13+');

type Grow = { steps: number; holds: number; playable: number; nothing: number; held: number; possible: number };
export type BloomPlay = { size: number; kind: 'set' | 'run'; fromLonger: boolean; top?: { choke: boolean; enemy: boolean; network: boolean } };
export type BloomRecord = {
  seed: number;
  winner: Player | null;
  reason: string;
  turns: number;
  blooms: BloomPlay[];
  fruit: number;
  /** tiles placed (Sprout and Bloom, not Strengthen) in each side's own turns 1-5 */
  early: number[];
  behindAtMid: [boolean, boolean];
  grow: Record<string, Grow>;
};

const other = (p: Player): Player => (p === 0 ? 1 : 0);

/** Can a 4th card in hand extend this 3-card group (same kind)? */
const extendable = (hand: readonly Card[], cards: readonly Card[]): boolean => {
  const set = cards.every((c) => c.rank === cards[0]!.rank);
  const used = new Set(cards.map((c) => c.id));
  const suits = new Set(cards.map((c) => c.suit));
  const lo = Math.min(...cards.map((c) => c.rank));
  const hi = Math.max(...cards.map((c) => c.rank));
  return hand.some((c) => !used.has(c.id) && c.suit !== null && (set ? c.rank === cards[0]!.rank && !suits.has(c.suit) : c.suit === cards[0]!.suit && (c.rank === lo - 1 || c.rank === hi + 1)));
};

/** Is `key` a chokepoint of p's network on this board (removing it cuts tiles off from the home)? */
const choke = (s: State, p: Player, key: string): boolean => {
  const root = coordKey(rootCoord(p, s.config.rootStyle, s.config.boardRadius));
  const mine = new Set(Object.keys(s.board).filter((k) => s.board[k]?.owner === p));
  const seen = new Set([root]);
  const todo = [root];
  while (todo.length) {
    const k = todo.pop()!;
    const [q, r] = k.split(',').map(Number) as [number, number];
    for (const n of allNeighbors({ q, r }).map(coordKey)) if (n !== key && mine.has(n) && !seen.has(n)) (seen.add(n), todo.push(n));
  }
  return seen.size < mine.size - 1;
};

export const playBloomGame = (seed: number): BloomRecord => {
  let s: State = newGame(seed);
  const rec: BloomRecord = { seed, winner: null, reason: '', turns: 0, blooms: [], fruit: 0, early: [], behindAtMid: [false, false], grow: Object.fromEntries(BUCKETS.map((b) => [b, { steps: 0, holds: 0, playable: 0, nothing: 0, held: 0, possible: 0 }])) };
  const diffByTurn: number[] = [];
  let turn = { n: -1, bloomLegal: false, bloomed: false, tiles: 0, acted: false };
  const closeTurn = () => {
    if (turn.n < 0) return;
    const g = rec.grow[bucketOf(ownTurn(turn.n))]!;
    if (turn.bloomLegal) g.possible++;
    if (turn.bloomLegal && !turn.bloomed) g.held++;
    if (ownTurn(turn.n) <= 5) rec.early.push(turn.tiles);
  };
  for (let i = 0; s.phase !== 'GAME_OVER'; i++) {
    if (i > 20_000) throw new Error(`bloom sim: game ${seed} did not finish`);
    const p = s.actor;
    const v = viewFor(s, p);
    if (s.turnNumber !== turn.n) {
      closeTurn();
      turn = { n: s.turnNumber, bloomLegal: false, bloomed: false, tiles: 0, acted: false };
      rec.grow[bucketOf(ownTurn(s.turnNumber))]!.steps++;
    }
    let legal: Action[] = [];
    if (s.phase === 'ACT') {
      legal = legalActions(v);
      // nothing legal to play at all: the turn's first Grow step offers only "Throw a card"
      if (!turn.acted && legal.every((x) => x.t === 'EndAct')) rec.grow[bucketOf(ownTurn(s.turnNumber))]!.nothing++;
      // the hand after the draw holds a qualifying group (whether or not the board allows it)
      if (!turn.acted && bloomGroups(v.hand.filter((c) => !isFruitCard(c))).length > 0) rec.grow[bucketOf(ownTurn(s.turnNumber))]!.holds++;
      turn.acted = true;
      if (legal.some((a) => a.t === 'Bloom')) {
        if (!turn.bloomLegal) rec.grow[bucketOf(ownTurn(s.turnNumber))]!.playable++;
        turn.bloomLegal = true;
      }
    }
    if (s.phase === 'DRAW') diffByTurn[s.turnNumber] = score(s, 0) - score(s, 1);
    const d = decideLevelAction(v, 7, botSeed(s.seed, 7, s.turnNumber, s.history!.length));
    const a = d.action;
    const before = s;
    s = apply(s, a);
    if (a.t === 'Bloom') {
      turn.bloomed = true;
      turn.tiles += a.cards.length;
      const hand = before.hands[p];
      const cards = a.cards.map((id) => hand.find((c) => c.id === id)!);
      const kind = cards.every((c) => c.rank === cards[0]!.rank) ? 'set' : 'run';
      const play: BloomPlay = { size: cards.length, kind, fromLonger: cards.length === 3 && extendable(hand, cards) };
      if (kind === 'run') {
        const hi = cards.reduce((m, c, i) => (c.rank > cards[m]!.rank ? i : m), 0);
        const key = coordKey(a.hexes[hi]!);
        const [q, r] = key.split(',').map(Number) as [number, number];
        const near = allNeighbors({ q, r }).map(coordKey);
        const placedNow = new Set(a.hexes.map(coordKey));
        play.top = {
          choke: choke(s, p, key),
          enemy: before.board[key]?.owner === other(p) || near.some((n) => s.board[n]?.owner === other(p)),
          network: near.some((n) => before.board[n]?.owner === p && !placedNow.has(n)),
        };
      }
      rec.blooms.push(play);
    }
    if (a.t === 'Sprout' && before.board[coordKey(a.coord)]?.owner !== p) turn.tiles++;
    if (a.t === 'PlayFruit') rec.fruit++;
  }
  closeTurn();
  const r = s.result!;
  rec.winner = r.winner;
  rec.reason = r.reason;
  rec.turns = s.turnNumber;
  const mid = Math.max(1, Math.floor(s.turnNumber / 2));
  const dmid = diffByTurn[mid] ?? 0;
  rec.behindAtMid = [dmid < 0, dmid > 0];
  return rec;
};

// ---------- metrics ----------

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const summarize = (rs: BloomRecord[]) => {
  const blooms = rs.flatMap((r) => r.blooms);
  const runs = blooms.filter((b) => b.kind === 'run');
  const three = blooms.filter((b) => b.size === 3);
  const grow = Object.fromEntries(BUCKETS.map((k) => [k, rs.reduce<Grow>((g, r) => ({ steps: g.steps + r.grow[k]!.steps, holds: g.holds + r.grow[k]!.holds, playable: g.playable + r.grow[k]!.playable, nothing: g.nothing + r.grow[k]!.nothing, held: g.held + r.grow[k]!.held, possible: g.possible + r.grow[k]!.possible }), { steps: 0, holds: 0, playable: 0, nothing: 0, held: 0, possible: 0 })]));
  const after3 = BUCKETS.filter((k) => k !== '1-3').reduce((n, k) => ({ steps: n.steps + grow[k]!.steps, nothing: n.nothing + grow[k]!.nothing }), { steps: 0, nothing: 0 });
  const behind = rs.flatMap((r) => ([0, 1] as const).filter((p) => r.behindAtMid[p]).map((p) => ({ r, p })));
  const ends: Record<string, number> = {};
  for (const r of rs) ends[r.reason] = (ends[r.reason] ?? 0) + 1;
  return {
    games: rs.length,
    grow,
    nothingAfter3: after3.steps ? after3.nothing / after3.steps : 0,
    bloomsPerGame: blooms.length / rs.length,
    avgSize: mean(blooms.map((b) => b.size)),
    runShare: blooms.length ? runs.length / blooms.length : 0,
    fromLonger: three.length ? three.filter((b) => b.fromLonger).length / three.length : 0,
    runTop: {
      choke: runs.length ? runs.filter((b) => b.top!.choke).length / runs.length : 0,
      enemy: runs.length ? runs.filter((b) => b.top!.enemy).length / runs.length : 0,
      network: runs.length ? runs.filter((b) => b.top!.network).length / runs.length : 0,
    },
    earlyTiles: mean(rs.flatMap((r) => r.early)),
    turnsPerPlayer: mean(rs.map((r) => r.turns / 2)),
    ends,
    fruitPerGame: mean(rs.map((r) => r.fruit)),
    firstPlayerWinRate: rs.filter((r) => r.winner === 0).length / rs.length,
    strangleRate: ((ends.strangle ?? 0) + (ends.double_strangle ?? 0)) / rs.length,
    comebackRate: behind.length ? behind.filter((x) => x.r.winner === x.p).length / behind.length : 0,
  };
};

export const formatSummary = (m: ReturnType<typeof summarize>) => {
  const lines = [
    `Games: ${m.games} (level 7 vs level 7, one game per seed)`,
    '',
    '| own turn | Grow steps | holds a Bloom group | a Bloom playable | Bloom possible but held | nothing to play |',
    '| --- | --- | --- | --- | --- | --- |',
    ...BUCKETS.map((k) => {
      const g = m.grow[k]!;
      if (!g.steps) return `| ${k} | 0 | - | - | - | - |`;
      return `| ${k} | ${g.steps} | ${pct(g.holds / g.steps)} | ${pct(g.playable / g.steps)} | ${pct(g.possible ? g.held / g.possible : 0)} | ${pct(g.nothing / g.steps)} |`;
    }),
    '',
    `Nothing to play after turn 3: ${pct(m.nothingAfter3)}`,
    `Blooms per game: ${m.bloomsPerGame.toFixed(2)}; average size ${m.avgSize.toFixed(2)}; from runs ${pct(m.runShare)}, from sets ${pct(1 - m.runShare)}`,
    `3-card Blooms played from a longer group: ${pct(m.fromLonger)}`,
    `Run Blooms, the highest number: on a chokepoint ${pct(m.runTop.choke)}, against an opponent tile ${pct(m.runTop.enemy)}, next to the network ${pct(m.runTop.network)}`,
    `Tiles placed per turn, turns 1-5: ${m.earlyTiles.toFixed(2)}`,
    `Game length: ${m.turnsPerPlayer.toFixed(2)} turns per player; ends: ${Object.entries(m.ends).map(([k, n]) => `${k} ${pct(n / m.games)}`).join(', ')}`,
    `Fruit cards played per game: ${m.fruitPerGame.toFixed(2)}`,
    `First player wins: ${pct(m.firstPlayerWinRate)}; Strangle: ${pct(m.strangleRate)}; comeback (behind at half time, still won): ${pct(m.comebackRate)}`,
  ];
  return lines.join('\n');
};

// ---------- CLI ----------

const opt = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
if (process.argv[1]?.endsWith('bloomsim.ts')) {
  const dir = opt('dir') ?? 'sim-bloom';
  if (process.argv.includes('--table')) {
    const rs = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as BloomRecord[]);
    console.log(formatSummary(summarize(rs)));
  } else {
    const games = Number(opt('games') ?? 500);
    const part = Number(opt('part') ?? 0);
    const parts = Number(opt('parts') ?? 1);
    mkdirSync(dir, { recursive: true });
    const out: BloomRecord[] = [];
    for (let g = part; g < games; g += parts) out.push(playBloomGame(1000 + g));
    writeFileSync(`${dir}/part-${part}.json`, JSON.stringify(out));
    console.log(`part ${part}: ${out.length} games`);
  }
}
