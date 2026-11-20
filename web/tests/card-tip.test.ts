// THE CARD'S SUIT DETAIL (owner, 2026-11-20): the native browser tooltip ("Ash") is gone and the
// game's own quiet bubble carries the same word; the card button still names the full card, so
// keyboard and touch access is unchanged.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cardFace } from '../src/ui/effects.js';

const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

describe('the card face no longer uses a browser-native tooltip', () => {
  it('puts the suit name on data-card-detail, never on title', () => {
    const ash = cardFace({ id: 1, suit: 1, rank: 5 });
    expect(ash).toContain('data-card-detail="Ash"');
    expect(ash).not.toMatch(/\stitle=/);
    const moss = cardFace({ id: 2, suit: 0, rank: 9 });
    expect(moss).toContain('data-card-detail="Moss"');
    const bomb = cardFace({ id: 3, suit: null, rank: 0 });
    expect(bomb).toContain('data-card-detail="Bomb"');
    expect(bomb).not.toMatch(/\stitle=/);
  });
  it('the bubble is the existing FUTASAKU detail material, and it keeps mouse, touch and keyboard paths', () => {
    const source = read('ui/card-tip.ts');
    expect(source).toContain("className = 'ctool-tip'");
    expect(source).toContain('pointerover');
    expect(source).toContain('pointerdown');
    expect(source).toContain('focusin');
    expect(source).toContain('450');
  });
});
