// Match Intel: Now · Tips · Rules (owner, 2026-10-24). The Rules tab is the ten lessons as cards in
// the lessons' own words; the Tips tab gives up to three tips for this moment, most urgent first,
// each pointing at the lesson it comes from; the Now tab says each move as a sentence.
import { describe, expect, it } from 'vitest';
import { allNeighbors, apply, coordKey, homeCoord, legalActions, mulberry32, newGame, viewFor } from '../../src/engine/index.js';
import type { View } from '../../src/engine/index.js';
import { INTEL, LESSON } from '../../src/strings.js';
import { intelTips, nearestRule, ruleCards, tipLabel } from '../src/logic/intel-guide.js';
import { LESSONS } from '../src/lessons/lessons.js';

const ORDER = ['home', 'surround', 'cut', 'blast', 'bloom', 'bomb', 'gold', 'pile', 'weak', 'deck', 'throw', 'joined', 'stronger'];

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

describe('the Tips tab: up to three tips for this moment', () => {
  const all = views(12);

  it('never empty, never more than three, never twice the same, always in urgency order', () => {
    for (const v of all) {
      const tips = intelTips(v);
      expect(tips.length).toBeGreaterThanOrEqual(1);
      expect(tips.length).toBeLessThanOrEqual(3);
      const idx = tips.map((t) => ORDER.indexOf(t.id));
      expect(idx.every((i) => i >= 0)).toBe(true);
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
      for (const t of tips) {
        expect(t.level).toBeGreaterThanOrEqual(1);
        expect(t.level).toBeLessThanOrEqual(10);
        expect(tipLabel(t)).toMatch(/^LESSON \d+ · [A-Z ,]+$/);
      }
      expect(nearestRule(tips)).toBe(tips[0]!.level);
    }
  });

  it('names a move the moment it can be played', () => {
    let bloom = 0, discard = 0;
    for (const v of all) {
      if (v.turnPlayer !== 0) continue;
      const legal = legalActions(v);
      const ids = intelTips(v, legal).map((t) => t.id);
      if (v.phase === 'ACT' && legal.some((a) => a.t === 'Bloom') && ids.length < 3) {
        expect(ids).toContain('bloom'); bloom++;
      }
      if (v.phase === 'DISCARD' && ids.length < 3) { expect(ids).toContain('throw'); discard++; }
      if (v.phase !== 'ACT') expect(ids.some((id) => ['cut', 'blast', 'bloom', 'bomb', 'gold'].includes(id))).toBe(false);
    }
    expect(bloom).toBeGreaterThan(0);
    expect(discard).toBeGreaterThan(0);
  });

  it('is pure: the same view gives the same tips', () => {
    for (const v of all.slice(0, 200)) expect(intelTips(v)).toEqual(intelTips(structuredClone(v)));
  });

  it('warns when my home is nearly surrounded', () => {
    const s = newGame(3);
    const v = viewFor(s, 0);
    // A fresh board: no home is in danger.
    expect(intelTips(v).map((t) => t.id)).not.toContain('home');
    // Their tiles on every open side of my home but one: the first tip says so.
    const open = allNeighbors(homeCoord(0, v.config)).map(coordKey).filter((k) => k in v.board && v.terrain[k] !== 'rock');
    const board = { ...v.board };
    for (const k of open.slice(1)) board[k] = { owner: 1, strength: 5 };
    const tips = intelTips({ ...v, board });
    expect(tips[0]).toMatchObject({ id: 'home', level: 6, text: INTEL.tips.homeDanger(1) });
    expect(INTEL.tips.homeDanger(1)).toMatch(/one open side/);
  });
});

describe('the Now tab: each move as a sentence', () => {
  it('reads as plain sentences for both players', () => {
    expect(INTEL.move(false, 'THREW', '6')).toBe('They threw a 6.');
    expect(INTEL.move(true, 'TOOK', '4')).toBe('You took a 4 from the Throw pile.');
    expect(INTEL.move(false, 'DREW', null)).toBe('They drew a card from the Draw pile.');
    expect(INTEL.move(true, 'BLOOM', '3')).toBe('You bloomed 3 tiles at once.');
    expect(INTEL.move(false, 'BOMB', 'BOMB')).toBe('They played a Bomb.');
    expect(INTEL.move(true, 'UP', '2→5')).toBe('You strengthened a tile 2→5.');
    expect(INTEL.move(false, 'CUT', '4')).toBe('They cut off 4 tiles.');
    expect(INTEL.lead(3)).toBe('You lead by 3');
    expect(INTEL.behind(2)).toBe('They lead by 2');
  });
});
