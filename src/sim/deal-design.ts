// DEAL DESIGN — `npx tsx src/sim/deal-design.ts -- --from=11 --to=70 [--tries=40]`
//
// A campaign level's seed fixes the shipped deal (both hands, the draw order and who starts), and the
// deal decides a lot: measured 2026-11-12, some shipped deals were 9-11-turn wipe-outs while the
// hardest board by its sweep shipped an easy deal (docs/CAMPAIGN-71-100.md, A2). This tool picks a
// seed whose shipped game FITS the level's role, using a stand-in player (bot 7) in the player's seat
// against the level's own bot on the level's own board. It never changes a board or a bot.
//
// The bands (stand-in score minus bot score, and the length of the game):
//   early      bot 7 or weaker (levels 11-20): winnable, no wipe-out: margin >= -2, turns >= 16
//   breather   the stand-in wins:              margin  >= +3, turns >= 16
//   level      close, the bot slightly ahead:  margin in [-6, +2], turns >= 16, no strangle of the stand-in
//   finale     close, the bot ahead:           margin in [-8, -1], turns >= 16, no strangle of the stand-in
// Bot 7 is not a human: the bands are about the SHAPE of the shipped game (no wipe-outs, breathers
// that breathe), not about a human win rate. Candidates are `seed + k * 1009`, k = 0..tries-1; the
// first one in band wins, so the current seed is kept whenever it already fits.
import { CAMPAIGN_LEVELS } from '../campaign/index.js';
import type { CampaignLevel } from '../campaign/index.js';
import { playLevelGame } from './level-game.js';

export type Role = 'early' | 'breather' | 'level' | 'finale';
export const roleOf = (l: CampaignLevel): Role =>
  l.botLevel <= 7 ? 'early' : l.breather ? 'breather' : l.number % 10 === 0 ? 'finale' : 'level';

export const inBand = (role: Role, margin: number, turns: number, strangledStandIn: boolean): boolean => {
  if (turns < 16) return false;
  if (role === 'breather') return margin >= 3;
  if (role === 'early') return margin >= -2 && !strangledStandIn;
  if (strangledStandIn) return false;
  return role === 'finale' ? margin >= -8 && margin <= -1 : margin >= -6 && margin <= 2;
};

export type Pick = { number: number; role: Role; seed: number; k: number; margin: number; turns: number; kept: boolean } | { number: number; role: Role; seed: null; k: -1 };

export const pickSeed = (l: CampaignLevel, tries: number): Pick => {
  const role = roleOf(l);
  for (let k = 0; k < tries; k++) {
    const seed = l.seed + k * 1009;
    const g = playLevelGame(seed, [7, l.botLevel as never], l.config);
    const margin = g.scores[0] - g.scores[1];
    const strangled = g.state.result?.reason === 'strangle' && g.winner === 1;
    if (inBand(role, margin, g.turns, strangled)) return { number: l.number, role, seed, k, margin, turns: g.turns, kept: k === 0 };
  }
  return { number: l.number, role, seed: null, k: -1 };
};

const arg = (name: string, fallback: number): number => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.slice(name.length + 3)) : fallback;
};

if (process.argv[1]?.endsWith('deal-design.ts')) {
  const from = arg('from', 11);
  const to = arg('to', 70);
  const tries = arg('tries', 40);
  for (const l of CAMPAIGN_LEVELS.filter((x) => x.number >= from && x.number <= to)) console.log(JSON.stringify(pickSeed(l, tries)));
}
