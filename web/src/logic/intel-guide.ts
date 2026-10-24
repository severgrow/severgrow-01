// Match Intel's Tips and Rules tabs (owner, 2026-10-24: "can use info from the levels 1-10 and add
// additional tips but make it easy to go through and read and understand").
// Rules: the ten lessons as one card each, in the lessons' own words (LESSON in src/strings.ts).
// Tips: up to three for THIS moment, most urgent first, each pointing at the lesson it comes from.
// Pure: it reads the player's View (public information and their own hand) and nothing else.
import { bloomGroups, coordKey, legalActions } from '../../../src/engine/index.js';
import type { Action, RulesConfig, View } from '../../../src/engine/index.js';
import { INTEL, LESSON as W } from '../../../src/strings.js';
import { LESSONS } from '../lessons/lessons.js';
import { homeSides } from './home.js';
import { opportunities, weakSpots } from './weakspots.js';

export type RuleCard = { level: number; icon: string; title: string; line: string };
export type IntelTip = { id: string; level: number; text: string };

/** The lesson's one idea ("BLOOM THREE AT ONCE") as a sentence-case title ("Bloom three at once").
 *  The game's own move names keep their capital (owner's word list: Draw, Grow, Throw…). */
const sentence = (caps: string): string => {
  const lower = caps.toLowerCase().replace(/\b(draw|grow|throw|bloom|bomb|blast)\b/g, (m) => m.charAt(0).toUpperCase() + m.slice(1));
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

/** Each lesson's rule, from the lines the lesson itself shows. */
const LINES: Readonly<Record<number, string>> = Object.freeze({
  1: W.tapDrawLine,
  2: `${W.takeTileLine} ${W.biggerWinsLine}`,
  3: W.goldDoubleLine,
  4: `${W.cutLinkLine} ${W.witheredLine}`,
  5: `${W.cardsThatBloomLine.replace('BLOOM:', 'Bloom:')} ${W.bloomedLine.replace('NOT', 'not')}`,
  6: W.surroundLine,
  7: W.bombLine,
  8: `${W.blastLine} ${W.freeGrowLine.replace('NOT', 'not')}`,
  9: W.pileGoldLine,
  10: W.theirHomeLine.replace('TO WIN:', 'To win:'),
});

const BOMB_LEVELS = new Set([7, 8]);

/** The ten lesson cards. A game without Bombs leaves out the two Bomb lessons. */
export const ruleCards = (config?: RulesConfig): RuleCard[] =>
  LESSONS
    .filter((l) => (config?.fruitCardCount ?? 4) > 0 || !BOMB_LEVELS.has(l.level))
    .map((l) => ({ level: l.level, icon: l.finish.icon, title: sentence(l.finish.learned), line: LINES[l.level] ?? '' }));

const nameOf = (level: number): string => sentence(LESSONS.find((l) => l.level === level)?.finish.learned ?? '');

/** Up to three tips for this moment, most urgent first. Never a guess at hidden cards. */
export const intelTips = (v: View, legal: readonly Action[] = legalActions(v)): IntelTip[] => {
  const out: IntelTip[] = [];
  const add = (id: string, level: number, text: string) => { if (!out.some((t) => t.id === id)) out.push({ id, level, text }); };
  const me = v.player;
  const mine = v.turnPlayer === me && v.result === null;
  const acting = mine && v.phase === 'ACT';
  const mineHome = homeSides(v, me);
  const theirHome = homeSides(v, me === 0 ? 1 : 0);
  const myLeft = mineHome.openSides - mineHome.taken;
  const theirLeft = theirHome.openSides - theirHome.taken;
  if (v.result === null && mineHome.taken > 0 && myLeft > 0 && myLeft <= 2) add('home', 6, INTEL.tips.homeDanger(myLeft));
  if (v.result === null && theirHome.taken > 0 && theirLeft > 0 && theirLeft <= 2) add('surround', 6, INTEL.tips.surround(theirLeft));
  if (acting) {
    const grows = legal.filter((a): a is Extract<Action, { t: 'Sprout' }> => a.t === 'Sprout');
    const growKeys = new Set(grows.map((a) => coordKey(a.coord)));
    const cut = opportunities(v).find((s) => growKeys.has(s.key));
    if (cut) add('cut', 4, INTEL.tips.cut(cut.loss));
    if (legal.some((a) => a.t === 'MegaBomb')) add('blast', 8, INTEL.tips.blast);
    if (legal.some((a) => a.t === 'Bloom')) add('bloom', 5, INTEL.tips.bloom);
    if (legal.some((a) => a.t === 'PlayFruit')) add('bomb', 7, INTEL.tips.bomb);
    const gold = legal.some((a) => (a.t === 'Sprout' ? [a.coord] : a.t === 'Bloom' ? a.hexes : [])
      .some((c) => v.terrain[coordKey(c)] === 'rich' && v.board[coordKey(c)]?.owner !== me));
    if (gold) add('gold', 3, INTEL.tips.gold);
  }
  if (mine && v.phase === 'DRAW') {
    const top = v.discard.at(-1);
    if (top && legal.some((a) => a.t === 'Draw' && a.from === 'discard')
      && bloomGroups([...v.hand, top], v.config.expandedBloom !== false).some((g) => g.cards.some((c) => c.id === top.id))) {
      add('pile', 9, INTEL.tips.pileBloom);
    }
  }
  const weak = weakSpots(v)[0];
  if (weak && v.result === null) add('weak', 2, INTEL.tips.weak(weak.loss));
  if (v.result === null && v.deckCount > 0 && v.deckCount <= 4) add('deck', 10, INTEL.tips.deckLow(v.deckCount));
  if (mine && v.phase === 'DISCARD') add('throw', 1, INTEL.tips.throwIt);
  // Never an empty tab: the two ideas every turn leans on. Taking their tile is one of them only
  // where the rule is on: level 1 withholds Overgrow, so its Tips tab must not invite it.
  if (out.length < 1) add('joined', 4, INTEL.tips.keepJoined);
  if (out.length < 2 && v.config.allowOvergrow !== false) add('stronger', 2, INTEL.tips.stronger);
  return out.slice(0, 3);
};

/** The lesson the Rules tab opens at: the one behind the most urgent tip. */
export const nearestRule = (tips: readonly IntelTip[]): number => tips[0]?.level ?? 1;

/** "LESSON 5 · BLOOM THREE AT ONCE" — the small label above a tip. */
export const tipLabel = (tip: IntelTip): string => INTEL.tipLabel(tip.level, nameOf(tip.level));
