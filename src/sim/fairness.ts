// FAIRNESS — `npx tsx src/sim/fairness.ts -- --from=71 --to=100 --games=60 [--bot=9]`
//
// Layout fairness per level: the same bot in both seats on the level's own board, the deal varied
// (seed + 7919·i). Seat 1 is always the bot's seat in the campaign, so `botSeat` is the share of
// decided games the bot's side wins. An even board reads near 50%; an `uneven: 'bot'` board must read
// 55-70% (up to 80% when `harsh`), an `uneven: 'player'` board 30-45% (docs/CAMPAIGN-71-100.md).
// One JSON line per level.
import { CAMPAIGN_LEVELS } from '../campaign/index.js';
import type { BotLevel } from '../bots/levels.js';
import { playLevelGame } from './level-game.js';

const arg = (name: string, fallback: number): number => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.slice(name.length + 3)) : fallback;
};

/** The bound a level's seat split must sit in, from its flags. */
export const fairnessBand = (l: { uneven?: 'bot' | 'player'; harsh?: boolean }): [number, number] =>
  l.uneven === 'bot' ? [0.55, l.harsh ? 0.8 : 0.7] : l.uneven === 'player' ? [0.3, 0.45] : [0.4, 0.6];

if (process.argv[1]?.endsWith('fairness.ts')) {
  const from = arg('from', 71);
  const to = arg('to', 100);
  const games = arg('games', 60);
  const bot = arg('bot', 9) as BotLevel;
  for (const l of CAMPAIGN_LEVELS.filter((x) => x.number >= from && x.number <= to)) {
    let seat1 = 0;
    let decided = 0;
    let strangles = 0;
    let turns = 0;
    for (let i = 0; i < games; i++) {
      const g = playLevelGame(l.seed + 7919 * (i + 1), [bot, bot], l.config);
      turns += g.turns;
      if (g.state.result?.reason === 'strangle') strangles++;
      if (g.winner === null) continue;
      decided++;
      if (g.winner === 1) seat1++;
    }
    const botSeat = decided ? seat1 / decided : 0;
    const [lo, hi] = fairnessBand(l);
    console.log(JSON.stringify({ n: l.number, uneven: l.uneven ?? null, harsh: !!l.harsh, botSeat: +botSeat.toFixed(3), band: [lo, hi], ok: botSeat >= lo && botSeat <= hi, decided, strangles, avgTurns: +(turns / games).toFixed(1) }));
  }
}
