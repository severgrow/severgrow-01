// CAMPAIGN DIFFICULTY PROBE — is Chapter II (11-20) *visibly* harder than Chapter I (1-10)?
//
// A fixed "player proxy" (bot level PLAYER_PROXY, the top of the EASY training tier) plays each
// level: once as seat 0 and once as seat 1, against that level's own AI on that level's own board
// and seed. The proxy's win rate per chapter is the evidence. Bot-vs-bot is EVIDENCE, not proof of
// human difficulty — a bot plays a different game from a person — and it is reported as such.
//
// Also printed per level: the terrain facts a human reads off the board (open hexes, rocks, gold).
//
//   npx tsx scripts/campaign-difficulty-probe.ts            # levels 1-30
//   npx tsx scripts/campaign-difficulty-probe.ts 11 20      # a slice
import { CAMPAIGN_LEVELS, campaignChecks } from '../src/campaign/index.js';
import { playLevelGame } from '../src/sim/level-game.js';
import type { Level } from '../src/bots/levels.js';

const PROXY: Level = 4;
const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 30);
/** The proxy plays each level twice (seat 0, then seat 1) on the level's PUBLISHED seed. */
const CONFIG = (n: number) => CAMPAIGN_LEVELS.find((l) => l.number === n)!;

type Row = { n: number; name: string; ai: number; proxyWins: number; games: number; turns: number; stats: string };

const rows: Row[] = [];
for (let n = from; n <= to; n++) {
  const level = CONFIG(n);
  const checks = campaignChecks([level]).get(level.id)!;
  let proxyWins = 0;
  let games = 0;
  let turns = 0;
  for (const order of [[PROXY, level.botLevel], [level.botLevel, PROXY]] as [Level, Level][]) {
    const g = playLevelGame(level.seed, order, level.config);
    games++;
    turns += g.turns;
    if (g.winner === order.indexOf(PROXY)) proxyWins++;
  }
  rows.push({
    n,
    name: level.name,
    ai: level.botLevel,
    proxyWins,
    games,
    turns: turns / games,
    stats: `${checks.openCells} open / ${checks.rock} rock / ${checks.gold} gold`,
  });
  const r = rows[rows.length - 1]!;
  console.log(
    `L${String(n).padStart(2)} ${r.name.padEnd(16)} AI${r.ai}  proxy(L${PROXY}) won ${r.proxyWins}/${r.games}  avg ${r.turns.toFixed(0)} turns  (${r.stats})`,
  );
}

const chapter = (lo: number, hi: number) => {
  const c = rows.filter((r) => r.n >= lo && r.n <= hi);
  const wins = c.reduce((a, r) => a + r.proxyWins, 0);
  const total = c.reduce((a, r) => a + r.games, 0);
  return total ? `${wins}/${total} = ${Math.round((wins / total) * 100)}%` : 'not in this slice';
};
console.log('');
console.log(`player proxy (bot level ${PROXY}) win rate vs the level's own AI + board:`);
console.log(`  Chapter I   (1-10) : ${chapter(1, 10)}`);
console.log(`  Chapter II  (11-20): ${chapter(11, 20)}`);
console.log(`  Chapter III (21-30): ${chapter(21, 30)}`);
