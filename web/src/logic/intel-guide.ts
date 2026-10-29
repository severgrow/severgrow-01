// Match Intel's Tips and Rules tabs.
//
// Rules: the ten lessons, one card each, in the lessons' own words (LESSON in src/strings.ts) —
// reference material, where a rule sentence is honest.
//
// Tips: up to three STRATEGIC reads of THIS match, most urgent first. A tip is a claim about the
// current position (owner, 2026-10-29: "tips should be more strategic tips, not the basic info of
// rules"), so every tip carries:
//   kind     — DANGER / OPPORTUNITY / TEMPO / ENDGAME (what kind of decision this is)
//   severity — critical / high / steady (how loud the panel should say it)
//   priority — the tie-break inside a severity, so the list is deterministic
//   headline — the read, in one line
//   detail   — what it means for the decision in front of the player
//   evidence — 1-2 short facts drawn from the same numbers the headline cites
//   rule     — the Rules-tab lesson the tip is grounded in (never shown as a label)
//
// Pure: it reads the player's View (public information and their own hand) and nothing else.
// It never reads the opponent's hand or the order of the deck; `View` does not carry either.
import {
  allNeighbors, bloomGroups, coordKey, homeCoord, legalActions, parseKey, planMegaBomb,
} from '../../../src/engine/index.js';
import type { Action, Coord, RulesConfig, View } from '../../../src/engine/index.js';
import { INTEL, LESSON as W } from '../../../src/strings.js';
import { LESSONS } from '../lessons/lessons.js';
import { homeSides } from './home.js';
import { opportunities, weakSpots } from './weakspots.js';

export type RuleCard = { level: number; icon: string; title: string; line: string };

/** What kind of decision a tip is about. Never a lesson name. */
export type TipKind = 'danger' | 'opportunity' | 'tempo' | 'endgame';
/** How loud the panel should say it (also the first sort key). */
export type TipSeverity = 'critical' | 'high' | 'steady';
/** One supporting fact. `value` is what the player scans, `label` names it in one word. */
export type TipEvidence = { value: string; label: string };
export type IntelTip = {
  id: string;
  kind: TipKind;
  severity: TipSeverity;
  /** Lower ranks first within a severity. Deterministic, never a clock or a random draw. */
  priority: number;
  headline: string;
  detail: string;
  evidence: readonly TipEvidence[];
  /** The Rules-tab lesson this tip is grounded in; only used by "open the rule". */
  rule: number;
};

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

const SEVERITY_RANK: Readonly<Record<TipSeverity, number>> = Object.freeze({ critical: 0, high: 1, steady: 2 });

/** Every legal growth's landing hex and the rank of the card it spends. */
const growths = (v: View, legal: readonly Action[]): { key: string; rank: number }[] => {
  const rankOf = (id: number) => v.hand.find((card) => card.id === id)?.rank ?? 0;
  const out: { key: string; rank: number }[] = [];
  for (const a of legal) {
    if (a.t === 'Sprout') out.push({ key: coordKey(a.coord), rank: rankOf(a.card) });
    else if (a.t === 'Bloom') a.hexes.forEach((h, i) => out.push({ key: coordKey(h), rank: rankOf(a.cards[i] ?? a.cards[0]!) }));
  }
  return out;
};

/** Their home's sides that are still empty (the ones a Grow can take). */
const theirOpenSides = (v: View): string[] => {
  const their = v.player === 0 ? 1 : 0;
  return allNeighbors(homeCoord(their, v.config))
    .map(coordKey)
    .filter((key) => key in v.board && v.terrain[key] !== 'rock' && !v.board[key]);
};

/** Enemy non-home tiles this network could overgrow on a later turn (a stronger card exists). */
const takeable = (v: View): number => {
  const me = v.player;
  const keys = new Set<string>();
  for (const [key, tile] of Object.entries(v.board)) {
    if (!tile || tile.owner === me || tile.root || tile.strength >= v.config.maxRank) continue;
    const coord = parseKey(key);
    if (allNeighbors(coord).some((n) => v.board[coordKey(n)]?.owner === me)) keys.add(key);
  }
  return keys.size;
};

const maxStrength = (v: View, coords: readonly Coord[]): number =>
  coords.reduce((best, c) => Math.max(best, v.board[coordKey(c)]?.strength ?? 0), 0);

/**
 * EVERY tip that is true right now, unordered. Exported for the "only when its condition holds"
 * tests; `intelTips` ranks and bounds it for the panel.
 */
export const matchAllTips = (v: View, legal: readonly Action[] = legalActions(v)): IntelTip[] => {
  const out: IntelTip[] = [];
  const add = (tip: IntelTip) => { if (!out.some((t) => t.id === tip.id)) out.push(tip); };
  const me = v.player;
  const their = me === 0 ? 1 : 0;
  const mine = v.turnPlayer === me && v.result === null;
  const acting = mine && v.phase === 'ACT';

  // --- The two homes. A surrounded home ends the match, so these outrank everything else. ---
  const mineHome = homeSides(v, me);
  const theirHome = homeSides(v, their);
  const myLeft = mineHome.openSides - mineHome.taken;
  const theirLeft = theirHome.openSides - theirHome.taken;
  if (v.result === null && mineHome.taken > 0 && myLeft > 0 && myLeft <= 2) {
    const text = INTEL.tips.home(myLeft, mineHome.taken);
    add({
      id: 'home', kind: 'danger', severity: 'critical', priority: 0,
      ...text,
      evidence: [
        { value: `${myLeft}/${mineHome.openSides}`, label: 'OPEN' },
        { value: String(mineHome.taken), label: 'THEIRS' },
      ],
      rule: 6,
    });
  }
  if (v.result === null && theirHome.taken > 0 && theirLeft > 0 && theirLeft <= 2) {
    const open = new Set(theirOpenSides(v));
    const growKeys = growths(v, legal).map((g) => g.key);
    const winNow = acting && growKeys.some((key) => open.has(key));
    const text = INTEL.tips.surround(theirLeft, theirHome.taken, winNow);
    add({
      id: 'surround', kind: 'opportunity', severity: 'critical', priority: 1,
      ...text,
      evidence: [
        { value: `${theirLeft}/${theirHome.openSides}`, label: 'OPEN' },
        { value: String(theirHome.taken), label: 'YOURS' },
      ],
      rule: 6,
    });
  }

  // --- What I could lose next. Reach is the engine's own threat metric (cutLoss). ---
  const weak = weakSpots(v)[0];
  if (weak && v.result === null) {
    const text = INTEL.tips.weak(weak.loss);
    add({
      id: 'weak', kind: 'danger', severity: 'high', priority: 2,
      ...text,
      evidence: [
        { value: String(weak.loss), label: 'AT RISK' },
        { value: String(v.board[weak.key]?.strength ?? 0), label: 'ITS CARD' },
      ],
      rule: 4,
    });
  }

  // --- What I can take now, in the order the turn spends its resources. ---
  if (acting) {
    const cut = opportunities(v)
      .map((spot) => {
        const grow = legal.find((a): a is Extract<Action, { t: 'Sprout' }> => a.t === 'Sprout' && coordKey(a.coord) === spot.key);
        const rank = grow ? v.hand.find((card) => card.id === grow.card)?.rank ?? 0 : 0;
        return { spot, rank };
      })
      .filter((entry) => entry.rank > 0)
      .sort((a, b) => b.spot.loss - a.spot.loss)[0];
    if (cut) {
      const text = INTEL.tips.cut(cut.spot.loss, cut.rank);
      add({
        id: 'cut', kind: 'opportunity', severity: 'high', priority: 3,
        ...text,
        evidence: [
          { value: String(cut.spot.loss), label: 'SEVERED' },
          { value: String(cut.rank), label: 'CARD' },
        ],
        rule: 4,
      });
    }

    const blasts = legal.filter((a): a is Extract<Action, { t: 'MegaBomb' }> => a.t === 'MegaBomb');
    const bestBlast = blasts.reduce((best, a) => Math.max(best, planMegaBomb(v, me, v.hand, a.cards, a.target).destroyed.length), 0);
    if (blasts.length) {
      const text = INTEL.tips.blast(bestBlast);
      add({
        id: 'blast', kind: 'opportunity', severity: 'steady', priority: 6,
        ...text,
        evidence: [{ value: String(bestBlast), label: 'TILES' }, { value: '2', label: 'BOMBS' }],
        rule: 8,
      });
    }

    const bloomTiles = legal.reduce((best, a) => (a.t === 'Bloom' ? Math.max(best, a.hexes.length) : best), 0);
    if (bloomTiles > 0) {
      const text = INTEL.tips.bloom(bloomTiles);
      add({
        id: 'bloom', kind: 'opportunity', severity: 'steady', priority: 7,
        ...text,
        evidence: [{ value: String(bloomTiles), label: 'TILES' }, { value: String(v.hand.length), label: 'IN HAND' }],
        rule: 5,
      });
    }

    const bombs = legal.filter((a): a is Extract<Action, { t: 'PlayFruit' }> => a.t === 'PlayFruit');
    if (bombs.length) {
      const bombsInHand = v.hand.filter((card) => card.suit === null).length;
      const theirBest = maxStrength(v, bombs.map((a) => a.target));
      const text = INTEL.tips.bomb(theirBest);
      add({
        id: 'bomb', kind: 'opportunity', severity: 'steady', priority: 8,
        ...text,
        evidence: [{ value: String(bombsInHand), label: 'BOMBS' }, { value: String(theirBest), label: 'THEIR BEST' }],
        rule: 7,
      });
    }

    const gold = growths(v, legal).some((g) => v.terrain[g.key] === 'rich' && v.board[g.key]?.owner !== me);
    if (gold) {
      const text = INTEL.tips.gold();
      add({
        id: 'gold', kind: 'opportunity', severity: 'steady', priority: 9,
        ...text,
        evidence: [{ value: '2', label: 'AT SCORE' }],
        rule: 3,
      });
    }
  }

  // --- The Throw pile: the one card every player sees before they choose. ---
  if (mine && v.phase === 'DRAW') {
    const top = v.discard.at(-1);
    if (top && legal.some((a) => a.t === 'Draw' && a.from === 'discard')
      && bloomGroups([...v.hand, top], v.config.expandedBloom !== false).some((g) => g.cards.some((c) => c.id === top.id))) {
      const text = INTEL.tips.pile(top.rank);
      add({
        id: 'pile', kind: 'tempo', severity: 'high', priority: 5,
        ...text,
        evidence: [{ value: String(top.rank), label: 'PILE TOP' }, { value: String(v.hand.length), label: 'IN HAND' }],
        rule: 9,
      });
    }
  }

  // --- The clock. ---
  if (v.result === null && v.deckCount > 0 && v.deckCount <= 4) {
    const text = INTEL.tips.deck(v.deckCount);
    add({
      id: 'deck', kind: 'endgame', severity: v.deckCount === 1 ? 'critical' : 'high', priority: 4,
      ...text,
      evidence: [{ value: String(v.deckCount), label: 'DECK' }],
      rule: 10,
    });
  }

  // --- The Throw step itself: what the player gives away. ---
  if (mine && v.phase === 'DISCARD') {
    const text = INTEL.tips.throw();
    add({
      id: 'throw', kind: 'tempo', severity: 'steady', priority: 10,
      ...text,
      evidence: [{ value: String(v.hand.length), label: 'IN HAND' }, { value: String(v.discard.length), label: 'PILE' }],
      rule: 1,
    });
  }

  // --- Never an empty tab: a read of the whole position, still from this match's numbers. ---
  if (out.length < 1) {
    const mineTiles = Object.values(v.board).filter((t) => t?.owner === me).length;
    const theirTiles = Object.values(v.board).filter((t) => t?.owner === their).length;
    const text = INTEL.tips.land(mineTiles, theirTiles, v.deckCount);
    add({
      id: 'land', kind: 'tempo', severity: 'steady', priority: 11,
      ...text,
      evidence: [{ value: `${mineTiles}–${theirTiles}`, label: 'LAND' }, { value: String(v.deckCount), label: 'DECK' }],
      rule: 4,
    });
  }
  if (out.length < 2 && v.config.allowOvergrow !== false) {
    const n = takeable(v);
    if (n > 0) {
      const text = INTEL.tips.stronger(n);
      add({
        id: 'stronger', kind: 'opportunity', severity: 'steady', priority: 12,
        ...text,
        evidence: [{ value: String(n), label: 'TAKEABLE' }],
        rule: 2,
      });
    }
  }
  return out;
};

const urgency = (a: IntelTip, b: IntelTip): number =>
  SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.priority - b.priority;

/** The ranked, bounded Tips list for the panel: the most urgent read first, at most three. */
export const intelTips = (v: View, legal: readonly Action[] = legalActions(v)): IntelTip[] =>
  [...matchAllTips(v, legal)].sort(urgency).slice(0, 3);

/** The lesson the Rules tab opens at: the one behind the most urgent tip. */
export const nearestRule = (tips: readonly IntelTip[]): number => tips[0]?.rule ?? 1;
