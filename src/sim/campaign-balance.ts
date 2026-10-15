// CAMPAIGN BALANCE — `npm run campaign:balance` (optionally `-- --games=40 --json=/tmp/x.json`).
//
// Plays every campaign level as bot-vs-bot and reports, per level:
//   * the PUBLISHED level: its own fixed seed, one game. This is the only run that speaks about the
//     level as shipped, and the only run whose result could be quoted as "the shipped position".
//   * an ALTERNATE-SEED SWEEP: the same board and the same bot, the deal varied (seed step).
//     This is evidence about the LAYOUT — is one seat favoured? — and it is explicitly NOT a change
//     to the published level: a sweep never touches a level's seed.
//   * the level's bot against a reference bot (level 7), SEATS SWAPPED, so the difficulty
//     progression can be read off.
//
// A note on "seats swapped": when both seats run the same AI, swapping the seats changes nothing —
// the game is identical. So for the layout question the meaningful measurement is the seat split
// across many DEALS (and how often the starting seat wins), which this report gives. The
// versus-reference run does swap seats properly, because the two seats run different bots.
//
// This is EVIDENCE, not proof of human difficulty: a bot plays a different game from a person. The
// flags below mark measurable problems (skew, one-sidedness, duration), never taste.
import { writeFileSync } from 'node:fs';
import { CAMPAIGN_LEVELS, campaignOpening, validateLevel } from '../campaign/index.js';
import type { Level } from '../bots/levels.js';
import { playLevelGame, tally } from './level-game.js';
import type { LevelGameResult } from './level-game.js';

const arg = (name: string, fallback: number): number => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.slice(name.length + 3)) : fallback;
};
const GAMES = Math.max(2, arg('games', 30));
const SEED_STEP = Math.max(1, arg('seed-step', 1013));
/** The versus-reference run costs the most (level 7 evaluates every bloom), so it is capped. */
const REF_GAMES = Math.max(1, arg('ref-games', Math.min(GAMES, 10)));
/** The classic-board baseline is one sweep per bot level the campaign uses. */
const BASELINE_GAMES = Math.max(2, arg('baseline-games', Math.min(GAMES, 16)));
const JSON_OUT = process.argv.find((a) => a.startsWith('--json='))?.slice(7) ?? '';
/** Below this many decided games a seat split is reported as a small-sample note, not a defect. */
const BIAS_MIN_DECIDED = 60;
const REFERENCE: Level = 7;

/** The seat holding this level's bot (used to read the versus-reference games). */
const levelSeat = (g: LevelGameResult, level: Level): 0 | 1 | null =>
  g.levels[0] === level && g.levels[1] !== level ? 0 : g.levels[1] === level && g.levels[0] !== level ? 1 : null;

export type LevelReport = {
  id: string;
  number: number;
  name: string;
  botLevel: Level;
  rocks: number;
  gold: number;
  intent: string;
  /** The shipped level: its fixed seed, one game. */
  published: LevelGameResult;
  /** Alternate-seed sweep, same bot both seats: is the layout even? */
  sweep: ReturnType<typeof tally> & {
    /** Games the starting seat won (an unbiased layout should be near half). */
    startWins: number;
  };
  /** The level's bot against the reference bot, seats swapped. */
  vsReference: { games: number; levelWins: number; refWins: number; draws: number };
  flags: string[];
};

const report = (o: { games: number; refGames: number; seedStep: number; onRow?: (r: LevelReport) => void }): LevelReport[] => {
  const out: LevelReport[] = [];
  for (const level of CAMPAIGN_LEVELS) {
    const checks = validateLevel(level);
    const flags: string[] = [];
    const bot = level.botLevel;

    const published = playLevelGame(level.seed, [bot, bot], level.config);

    // Reproducibility, checked on the tool side too: the opening is identical every time.
    const a = campaignOpening(level);
    const b = campaignOpening(level);
    if (JSON.stringify(a.hands) !== JSON.stringify(b.hands) || JSON.stringify(a.terrain) !== JSON.stringify(b.terrain)) {
      flags.push('NOT REPRODUCIBLE');
    }

    // Alternate-seed sweep: same board, same AI, the deal varied.
    const sweepGames: LevelGameResult[] = [];
    for (let i = 0; i < o.games; i++) {
      sweepGames.push(playLevelGame(level.seed + i * o.seedStep, [bot, bot], level.config));
    }
    const base = tally(sweepGames);
    const sweep = { ...base, startWins: sweepGames.filter((g) => g.winner === g.startingPlayer).length };
    const decided = sweep.firstWins + sweep.secondWins;
    const imbalance = decided ? Math.abs(sweep.firstWins - sweep.secondWins) / decided : 0;
    // A skew is only worth calling out over enough games to mean something. Below that the numbers
    // are still printed (and compared with the classic-board baseline), just not labelled a defect.
    if (decided >= BIAS_MIN_DECIDED && imbalance > 0.2) {
      flags.push(`LAYOUT BIAS: seat 0 won ${sweep.firstWins}, seat 1 won ${sweep.secondWins} (${Math.round(imbalance * 100)}% skew)`);
    }
    if (decided >= BIAS_MIN_DECIDED && Math.max(sweep.firstWins, sweep.secondWins) / decided >= 0.8) {
      flags.push('ONE-SIDED: the same AI wins 80%+ from one seat');
    }
    if (decided < BIAS_MIN_DECIDED && imbalance > 0.35) {
      flags.push(`SEAT SKEW (small sample, ${decided} decided): seat 0 ${sweep.firstWins} / seat 1 ${sweep.secondWins} — see the classic-board baseline`);
    }
    if (sweep.avgTurns < 10) flags.push(`SHORT: games average ${sweep.avgTurns.toFixed(1)} turns`);
    if (sweep.avgTurns > 55) flags.push(`LONG: games average ${sweep.avgTurns.toFixed(1)} turns`);

    // Versus the reference bot, seats swapped; counted from this level's bot's perspective.
    let levelWins = 0;
    let refWins = 0;
    let draws = 0;
    let games = 0;
    for (let i = 0; i < o.refGames; i++) {
      const seed = level.seed + i * o.seedStep;
      for (const order of [[bot, REFERENCE], [REFERENCE, bot]] as [Level, Level][]) {
        const g = playLevelGame(seed, order, level.config);
        games++;
        if (g.winner === null) draws++;
        else if (g.winner === levelSeat(g, bot)) levelWins++;
        else refWins++;
      }
    }

    const row: LevelReport = {
      id: level.id,
      number: level.number,
      name: level.name,
      botLevel: bot,
      rocks: checks.rock,
      gold: checks.gold,
      intent: level.intent,
      published,
      sweep,
      vsReference: { games, levelWins, refWins, draws },
      flags,
    };
    out.push(row);
    o.onRow?.(row);
  }
  return out;
};

export type BaselineRow = {
  botLevel: Level;
  games: number;
  firstWins: number;
  secondWins: number;
  draws: number;
  startWins: number;
  avgTurns: number;
};

/**
 * The SAME same-AI sweep on the CLASSIC generated board (default terrain), for each bot level the
 * campaign uses. This is the game's own seat skew — the spec deals player 0 first and does not
 * balance hands — so a campaign level's seat split can be read against it instead of in isolation.
 */
const baseline = (o: { games: number; seedStep: number }): BaselineRow[] => {
  const bots = [...new Set(CAMPAIGN_LEVELS.map((l) => l.botLevel))].sort((a, b) => a - b);
  const firstSeed = CAMPAIGN_LEVELS[0]!.seed;
  return bots.map((botLevel) => {
    const games: LevelGameResult[] = [];
    for (let i = 0; i < o.games; i++) {
      games.push(playLevelGame(firstSeed + i * o.seedStep, [botLevel, botLevel], {}));
    }
    const t = tally(games);
    return { botLevel, ...t, startWins: games.filter((g) => g.winner === g.startingPlayer).length };
  });
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');
const seatWord = (g: LevelGameResult) => (g.winner === null ? 'draw' : `seat ${g.winner}`);

const markdown = (
  rows: LevelReport[],
  games: number,
  seedStep: number,
  baselineRows: readonly BaselineRow[],
): string => {
  const lines: string[] = [];
  lines.push(`## Campaign balance — Chapter I (${games} alternate seeds per level, seed step ${seedStep})`);
  lines.push('');
  lines.push('Bot-vs-bot evidence, not proof of human difficulty. The sweep uses the SAME AI on both');
  lines.push('seats, so its seat split reflects the LAYOUT, the spec\'s unbalanced deal and player 0 moving');
  lines.push('first — read it against the classic-board baseline below, never on its own. "vs L7" is the');
  lines.push('level bot against the reference bot (level 7) with the seats swapped.');
  lines.push('');
  lines.push('| Lv | Name | AI | Rocks | Gold | Published seed | Sweep seat0 / seat1 / draw | Sweep start-seat wins | Sweep avg turns (min–max) | vs L7 | Flags |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const sw = `${r.sweep.firstWins} / ${r.sweep.secondWins} / ${r.sweep.draws}`;
    const startWins = `${r.sweep.startWins} / ${r.sweep.games} (${pct(r.sweep.startWins, r.sweep.games)})`;
    const dur = `${r.sweep.avgTurns.toFixed(1)} (${r.sweep.minTurns}–${r.sweep.maxTurns})`;
    const ref = r.vsReference.games
      ? `${r.vsReference.levelWins}-${r.vsReference.refWins}${r.vsReference.draws ? `-${r.vsReference.draws}` : ''} (${pct(r.vsReference.levelWins, r.vsReference.games)} wins vs L${REFERENCE})`
      : '–';
    lines.push(
      `| ${r.number} | ${r.name} | ${r.botLevel} | ${r.rocks} | ${r.gold} | ${seatWord(r.published)} in ${r.published.turns} turns (${r.published.scores[0]}–${r.published.scores[1]}) | ${sw} | ${startWins} | ${dur} | ${ref} | ${r.flags.length ? r.flags.join('; ') : '—'} |`,
    );
  }
  lines.push('');
  lines.push('### Classic-board baseline (same AI both seats, default generated board)');
  lines.push('');
  lines.push('| Bot level | Games | Seat 0 / seat 1 / draw | Start-seat wins | Avg turns |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const b of baselineRows) {
    lines.push(
      `| ${b.botLevel} | ${b.games} | ${b.firstWins} / ${b.secondWins} / ${b.draws} | ${b.startWins} (${pct(b.startWins, b.games)}) | ${b.avgTurns.toFixed(1)} |`,
    );
  }
  lines.push('');
  const flagged = rows.filter((r) => r.flags.length);
  lines.push(flagged.length ? `**Flagged:** ${flagged.map((r) => `L${r.number} (${r.flags.join('; ')})`).join(', ')}` : '**No level flagged.**');
  return lines.join('\n');
};

// Stream one line per level as it finishes, so a long run is never a black box.
const rows = report({
  games: GAMES,
  refGames: REF_GAMES,
  seedStep: SEED_STEP,
  onRow: (r) =>
    console.log(
      `… L${String(r.number).padStart(2)} ${r.name.padEnd(18)} sweep seat0/seat1/draw ${r.sweep.firstWins}/${r.sweep.secondWins}/${r.sweep.draws}  avg ${r.sweep.avgTurns.toFixed(1)} turns  vs L${REFERENCE} ${r.vsReference.levelWins}-${r.vsReference.refWins}${r.flags.length ? `  [${r.flags.join('; ')}]` : ''}`,
    ),
});
// The classic-board baseline: the game's own seat skew, for comparison with each level.
console.log('');
console.log(`… classic-board baseline (${BASELINE_GAMES} seeds per bot level)…`);
const baselineRows = baseline({ games: BASELINE_GAMES, seedStep: SEED_STEP });
for (const b of baselineRows) {
  console.log(
    `   bot L${b.botLevel}: seat0/seat1/draw ${b.firstWins}/${b.secondWins}/${b.draws}  start-seat wins ${b.startWins}  avg ${b.avgTurns.toFixed(1)} turns`,
  );
}
console.log('');
console.log(markdown(rows, GAMES, SEED_STEP, baselineRows));
if (JSON_OUT) {
  writeFileSync(
    JSON_OUT,
    JSON.stringify({ games: GAMES, baselineGames: BASELINE_GAMES, seedStep: SEED_STEP, reference: REFERENCE, rows, baseline: baselineRows }, null, 2),
  );
  console.log(`\nwrote ${JSON_OUT}`);
}
