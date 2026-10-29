// Match Intel: Now · Tips · Rules.
//
// The Rules tab is the ten lessons as cards in the lessons' own words. The Tips tab is the opposite
// of a rulebook: every tip is a claim about THIS match, derived from public information (the board,
// my own hand, the Throw pile, the counts), ranked by urgency, and labelled with a verdict
// (DANGER / OPPORTUNITY / TEMPO / ENDGAME) instead of a lesson number.
//
// These tests are the regression guard for the owner's 2026-10-29 brief: no tutorial phrasing in
// Tips, no hidden information, and no number the engine disagrees with.
import { describe, expect, it } from 'vitest';
import {
  allNeighbors, apply, bloomGroups, coordKey, homeCoord, legalActions, mulberry32, newGame, parseKey,
  planMegaBomb, viewFor,
} from '../../src/engine/index.js';
import type { Action, Card, Player, View } from '../../src/engine/index.js';
import { INTEL, LESSON } from '../../src/strings.js';
import {
  intelTips, matchAllTips, nearestRule, ruleCards,
} from '../src/logic/intel-guide.js';
import { LESSONS } from '../src/lessons/lessons.js';
import { homeSides } from '../src/logic/home.js';
import { matchObservation } from '../src/logic/match-intel.js';
import { opportunities, weakSpots } from '../src/logic/weakspots.js';

/** Views of player 0 along seeded random games, at every step. */
const views = (games: number, steps = 400): View[] => {
  const out: View[] = [];
  for (let seed = 1; seed <= games; seed++) {
    const rand = mulberry32(seed * 7919);
    let s = newGame(seed);
    for (let i = 0; i < steps && s.phase !== 'GAME_OVER'; i++) {
      out.push(viewFor(s, 0));
      const acts = legalActions(viewFor(s, s.actor));
      s = apply(s, acts[Math.floor(rand() * acts.length)]!);
    }
  }
  return out;
};

const other = (p: Player): Player => (p === 0 ? 1 : 0);
const acting = (v: View): boolean => v.turnPlayer === v.player && v.result === null && v.phase === 'ACT';
const my = (v: View): boolean => v.turnPlayer === v.player && v.result === null;
const leftOf = (v: View, owner: Player): number => {
  const h = homeSides(v, owner);
  return h.openSides - h.taken;
};
const grown = (v: View, legal: readonly Action[]): { key: string; rank: number }[] => {
  const rankOf = (id: number) => v.hand.find((c) => c.id === id)?.rank ?? 0;
  const out: { key: string; rank: number }[] = [];
  for (const a of legal) {
    if (a.t === 'Sprout') out.push({ key: coordKey(a.coord), rank: rankOf(a.card) });
    else if (a.t === 'Bloom') a.hexes.forEach((h, i) => out.push({ key: coordKey(h), rank: rankOf(a.cards[i] ?? a.cards[0]!) }));
  }
  return out;
};
const takeable = (v: View): number => {
  const keys = new Set<string>();
  for (const [key, tile] of Object.entries(v.board)) {
    if (!tile || tile.owner === v.player || tile.root || tile.strength >= v.config.maxRank) continue;
    if (allNeighbors(parseKey(key)).some((n) => v.board[coordKey(n)]?.owner === v.player)) keys.add(key);
  }
  return keys.size;
};

/** The condition behind each non-fallback tip, written from the engine rather than the guide. */
const CONDITION: Readonly<Record<string, (v: View, legal: readonly Action[]) => boolean>> = {
  home: (v) => v.result === null && homeSides(v, v.player).taken > 0 && leftOf(v, v.player) > 0 && leftOf(v, v.player) <= 2,
  surround: (v) => v.result === null && homeSides(v, other(v.player)).taken > 0
    && leftOf(v, other(v.player)) > 0 && leftOf(v, other(v.player)) <= 2,
  weak: (v) => v.result === null && weakSpots(v).length > 0,
  cut: (v, legal) => acting(v) && legal.some((a) => a.t === 'Sprout' && opportunities(v).some((s) => s.key === coordKey(a.coord))),
  deck: (v) => v.result === null && v.deckCount > 0 && v.deckCount <= 4,
  pile: (v, legal) => my(v) && v.phase === 'DRAW' && !!v.discard.at(-1)
    && legal.some((a) => a.t === 'Draw' && a.from === 'discard')
    && bloomGroups([...v.hand, v.discard.at(-1)!], v.config.expandedBloom !== false)
      .some((g) => g.cards.some((c) => c.id === v.discard.at(-1)!.id)),
  blast: (v, legal) => acting(v) && legal.some((a) => a.t === 'MegaBomb'),
  bloom: (v, legal) => acting(v) && legal.some((a) => a.t === 'Bloom'),
  bomb: (v, legal) => acting(v) && legal.some((a) => a.t === 'PlayFruit'),
  gold: (v, legal) => acting(v) && grown(v, legal).some((g) => v.terrain[g.key] === 'rich' && v.board[g.key]?.owner !== v.player),
  throw: (v) => my(v) && v.phase === 'DISCARD',
};

/** Narrow, hand-built positions for the rules random play rarely reaches. */
const crafted = (): View[] => {
  const out: View[] = [];
  for (let seed = 1; seed <= 8; seed++) {
    const base = viewFor(newGame(seed), 0);
    const mine = allNeighbors(homeCoord(0, base.config)).map(coordKey)
      .filter((k) => k in base.board && base.terrain[k] !== 'rock');
    const theirHome = allNeighbors(homeCoord(1, base.config)).map(coordKey)
      .filter((k) => k in base.board && base.terrain[k] !== 'rock');
    const board = { ...base.board };
    for (const k of mine.slice(0, Math.max(1, mine.length - 2))) board[k] = { owner: 1, strength: 5 };
    for (const k of theirHome.slice(0, Math.max(1, theirHome.length - 2))) board[k] = { owner: 0, strength: 4 };
    out.push({ ...base, board });
    out.push({ ...base, deckCount: 1 + (seed % 4) });
  }
  return out;
};

describe('the Rules tab: the ten lessons as cards', () => {
  it('one card per lesson, titled with the idea the lesson teaches, in sentence case', () => {
    const cards = ruleCards();
    expect(cards.map((c) => c.level)).toEqual(LESSONS.map((l) => l.level));
    expect(cards).toHaveLength(10);
    expect(cards[0]!.title).toBe('Draw, Grow, Throw');
    expect(cards[4]!.title).toBe('Bloom three at once');
    expect(cards[8]!.title).toBe('Bloom from the Throw pile');
    for (const c of cards) {
      expect(c.title, c.title).not.toBe(c.title.toUpperCase());
      expect(c.line.length, c.title).toBeGreaterThan(20);
      expect(c.icon).toBe(LESSONS.find((l) => l.level === c.level)!.finish.icon);
    }
  });

  it('in the lessons\' own words, never a paraphrase', () => {
    const cards = ruleCards();
    expect(cards[0]!.line).toBe(LESSON.tapDrawLine);
    expect(cards[2]!.line).toBe(LESSON.goldDoubleLine);
    expect(cards[5]!.line).toBe(LESSON.surroundLine);
    expect(cards[6]!.line).toBe(LESSON.bombLine);
  });

  it('a game without Bombs leaves out the two Bomb lessons', () => {
    const config = { ...newGame(1).config, fruitCardCount: 0 };
    expect(ruleCards(config).map((c) => c.level)).toEqual([1, 2, 3, 4, 5, 6, 9, 10]);
  });
});

describe('the Tips tab: strategic reads of THIS match', () => {
  // Enough seeded play to exercise every rule without making `npm run check` slow: the whole
  // suite must stay well inside the 60s per-test budget on a loaded machine.
  const all = views(6, 180);
  const fixtures = (): View[] => [...all, ...crafted()];

  it('every tip fires exactly when its own condition holds', () => {
    const seen = new Map<string, number>();
    for (const v of fixtures()) {
      const legal = legalActions(v);
      const ids = new Set(matchAllTips(v, legal).map((t) => t.id));
      for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
      for (const [id, condition] of Object.entries(CONDITION)) {
        expect(ids.has(id), `${id} fires only when its condition holds (turn ${v.turnNumber})`).toBe(condition(v, legal));
      }
      // Fallbacks: `land` only when nothing else fired; `stronger` only when it is allowed and real.
      const substantive = [...ids].filter((id) => id !== 'land' && id !== 'stronger');
      if (substantive.length === 0) expect(ids.has('land')).toBe(true);
      if (ids.has('land')) expect([...ids].filter((id) => id !== 'land' && id !== 'stronger')).toEqual([]);
      if (ids.has('stronger')) {
        expect(v.config.allowOvergrow !== false).toBe(true);
        expect(takeable(v)).toBeGreaterThan(0);
      }
      if (v.config.allowOvergrow === false || takeable(v) === 0) expect(ids.has('stronger')).toBe(false);
    }
    // The table is not vacuous: every rule below is exercised by real games.
    for (const id of Object.keys(CONDITION)) expect(seen.get(id) ?? 0, `${id} never fired in the fixtures`).toBeGreaterThan(0);
  });

  it('every tip\'s numbers are the numbers the engine reports', () => {
    for (const v of fixtures()) {
      const legal = legalActions(v);
      for (const tip of matchAllTips(v, legal)) {
        const check = (value: unknown, label: string) => expect(value, `${tip.id} ${label} (turn ${v.turnNumber})`).toBe(true);
        switch (tip.id) {
          case 'home': {
            const h = homeSides(v, v.player);
            const left = h.openSides - h.taken;
            check(tip.evidence[0]!.value === `${left}/${h.openSides}`, 'open sides');
            check(tip.evidence[1]!.value === String(h.taken), 'taken sides');
            check(left === 1 ? /one side/.test(tip.headline) : tip.headline.includes(String(left)), 'headline carries the count');
            break;
          }
          case 'surround': {
            const h = homeSides(v, other(v.player));
            const left = h.openSides - h.taken;
            check(tip.evidence[0]!.value === `${left}/${h.openSides}`, 'open sides');
            check(tip.evidence[1]!.value === String(h.taken), 'taken sides');
            check(left === 1 ? /one side/.test(tip.headline) : tip.headline.includes(String(left)), 'headline carries the count');
            break;
          }
          case 'weak': {
            const spot = weakSpots(v)[0]!;
            check(tip.evidence[0]!.value === String(spot.loss), 'loss');
            check(tip.evidence[1]!.value === String(v.board[spot.key]?.strength ?? 0), 'tile card');
            check(tip.headline.includes(String(spot.loss)), 'headline carries the loss');
            break;
          }
          case 'cut': {
            const best = opportunities(v).flatMap((spot) => legal
              .filter((a): a is Extract<Action, { t: 'Sprout' }> => a.t === 'Sprout' && coordKey(a.coord) === spot.key)
              .map((a) => ({ loss: spot.loss, rank: v.hand.find((c) => c.id === a.card)?.rank ?? 0 })))
              .sort((a, b) => b.loss - a.loss)[0]!;
            check(tip.evidence[0]!.value === String(best.loss), 'loss');
            check(tip.evidence[1]!.value === String(best.rank), 'card');
            check(tip.headline.includes(String(best.loss)), 'headline carries the loss');
            break;
          }
          case 'deck':
            check(tip.evidence[0]!.value === String(v.deckCount), 'deck count');
            check(tip.headline.includes(String(v.deckCount)) || (v.deckCount === 1 && /One card/.test(tip.headline)), 'headline carries the count');
            break;
          case 'pile':
            check(tip.evidence[0]!.value === String(v.discard.at(-1)!.rank), 'pile top');
            check(tip.evidence[1]!.value === String(v.hand.length), 'hand');
            break;
          case 'blast': {
            const best = legal.reduce((n, a) => (a.t === 'MegaBomb'
              ? Math.max(n, planMegaBomb(v, v.player, v.hand, a.cards, a.target).destroyed.length) : n), 0);
            check(tip.evidence[0]!.value === String(best), 'destroyed');
            check(tip.headline.includes(String(best)), 'headline carries the count');
            break;
          }
          case 'bloom': {
            const best = legal.reduce((n, a) => (a.t === 'Bloom' ? Math.max(n, a.hexes.length) : n), 0);
            check(tip.evidence[0]!.value === String(best), 'hexes');
            check(tip.headline.includes(String(best)), 'headline carries the count');
            break;
          }
          case 'bomb': {
            const bombs = v.hand.filter((c) => c.suit === null).length;
            check(tip.evidence[0]!.value === String(bombs), 'bombs in hand');
            const best = legal.reduce((n, a) => (a.t === 'PlayFruit' ? Math.max(n, v.board[coordKey(a.target)]?.strength ?? 0) : n), 0);
            check(tip.evidence[1]!.value === String(best), 'their best target');
            check(tip.detail.includes(String(best)), 'detail carries their best');
            break;
          }
          case 'gold':
            check(tip.evidence[0]!.value === '2', 'gold scores double');
            break;
          case 'throw':
            check(tip.evidence[0]!.value === String(v.hand.length), 'hand');
            check(tip.evidence[1]!.value === String(v.discard.length), 'pile');
            break;
          case 'land': {
            const mine = Object.values(v.board).filter((t) => t?.owner === v.player).length;
            const theirs = Object.values(v.board).filter((t) => t?.owner === other(v.player)).length;
            check(tip.evidence[0]!.value === `${mine}–${theirs}`, 'land');
            check(tip.evidence[1]!.value === String(v.deckCount), 'deck');
            break;
          }
          case 'stronger':
            check(tip.evidence[0]!.value === String(takeable(v)), 'takeable');
            check(tip.headline.includes(String(takeable(v))), 'headline carries the count');
            break;
          default:
            throw new Error(`unknown tip ${tip.id}`);
        }
      }
    }
  });

  it('says the same thing for a view and an identical-odds copy with different hidden cards', () => {
    // `View` never carries the opponent's hand or the deck order. Prove the Tips do not reconstruct
    // it: swapping those two private piles (same counts, same public facts) changes nothing.
    let checked = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const rand = mulberry32(seed * 3557);
      let s = newGame(seed);
      for (let i = 0; i < 40 && s.phase !== 'GAME_OVER'; i++) {
        const n = Math.min(s.hands[1].length, s.deck.length);
        const swapped = {
          ...s,
          hands: [s.hands[0], [...s.deck.slice(0, n), ...s.hands[1].slice(n)]] as [Card[], Card[]],
          deck: [...s.hands[1].slice(0, n), ...s.deck.slice(n)],
        };
        const original = viewFor(s, 0);
        const copy = viewFor(swapped, 0);
        const legal = legalActions(original);
        expect(matchAllTips(copy, legal)).toEqual(matchAllTips(original, legal));
        expect(intelTips(copy, legal)).toEqual(intelTips(original, legal));
        checked++;
        const acts = legalActions(viewFor(s, s.actor));
        s = apply(s, acts[Math.floor(rand() * acts.length)]!);
      }
    }
    expect(checked).toBeGreaterThan(120);
  });

  it('ranks by severity then priority, never repeats, and stays within three', () => {
    const rank = { critical: 0, high: 1, steady: 2 } as const;
    for (const v of all.slice(0, 700)) {
      const tips = intelTips(v);
      expect(tips.length).toBeGreaterThanOrEqual(1);
      expect(tips.length).toBeLessThanOrEqual(3);
      expect(new Set(tips.map((t) => t.id)).size).toBe(tips.length);
      for (let i = 1; i < tips.length; i++) {
        const a = tips[i - 1]!;
        const b = tips[i]!;
        expect(rank[a.severity] < rank[b.severity] || (rank[a.severity] === rank[b.severity] && a.priority <= b.priority),
          `${a.id} before ${b.id}`).toBe(true);
      }
      const expected = [...matchAllTips(v)].sort((a, b) => rank[a.severity] - rank[b.severity] || a.priority - b.priority).slice(0, 3);
      expect(tips.map((t) => t.id)).toEqual(expected.map((t) => t.id));
      expect(nearestRule(tips)).toBe(tips[0]!.rule);
    }
  });

  it('never reads as a lesson label or a bare rule name (the owner\'s complaint)', () => {
    const titles = LESSONS.map((l) => l.finish.learned.toUpperCase());
    const kinds = Object.values(INTEL.kind);
    for (const v of [...all.slice(0, 600), ...crafted()]) {
      for (const tip of matchAllTips(v)) {
        for (const field of [tip.headline, tip.detail]) {
          expect(field).not.toMatch(/^LESSON\s*\d+/i);
          expect(field).not.toMatch(/\blesson\b/i);
          expect(field, `${tip.id}: ${field}`).not.toBe(field.toUpperCase());
          for (const title of titles) expect(field.toUpperCase()).not.toContain(title);
        }
        expect(kinds).toContain(INTEL.kind[tip.kind]);
        expect(tip.severity).toMatch(/^(critical|high|steady)$/);
        expect(tip.priority).toBeGreaterThanOrEqual(0);
        expect(tip.evidence.length).toBeGreaterThanOrEqual(1);
        expect(tip.evidence.length).toBeLessThanOrEqual(2);
        for (const fact of tip.evidence) {
          expect(fact.value.length).toBeGreaterThan(0);
          expect(fact.label).toMatch(/^[A-Z ]+$/);
        }
      }
    }
    // The retired lesson label builder is gone, not merely unused.
    expect(INTEL).not.toHaveProperty('tipLabel');
  });

  it('is pure: the same view gives the same tips', () => {
    for (const v of all.slice(0, 300)) expect(intelTips(v)).toEqual(intelTips(structuredClone(v)));
  });
});

describe('the Now tab observation: one strategic read', () => {
  it('names the most important fact in one line', () => {
    const base = viewFor(newGame(3), 0);
    const mine = allNeighbors(homeCoord(0, base.config)).map(coordKey).filter((k) => k in base.board && base.terrain[k] !== 'rock');
    const board = { ...base.board };
    for (const k of mine.slice(0, mine.length - 2)) board[k] = { owner: 1, strength: 5 };
    const view = { ...base, board };
    const observation = matchObservation(view);
    expect(observation).toBe(INTEL.observation.home(2, mine.length - 2));
    expect(observation).not.toMatch(/LESSON|seed/i);
    expect(observation).not.toBe(observation.toUpperCase());
  });

  it('falls through home danger to the deck count, then to the land count', () => {
    const base = viewFor(newGame(5), 0);
    expect(matchObservation({ ...base, deckCount: 3 })).toBe(INTEL.observation.deck(3));
    const mine = Object.values(base.board).filter((t) => t?.owner === 0).length;
    expect(matchObservation(base)).toBe(INTEL.observation.level(mine));
  });

  it('reads the same with different hidden cards', () => {
    const s = newGame(9);
    const n = Math.min(s.hands[1].length, s.deck.length);
    const swapped = { ...s, hands: [s.hands[0], [...s.deck.slice(0, n), ...s.hands[1].slice(n)]] as [Card[], Card[]], deck: [...s.hands[1].slice(0, n), ...s.deck.slice(n)] };
    expect(matchObservation(viewFor(swapped, 0))).toBe(matchObservation(viewFor(s, 0)));
  });
});
