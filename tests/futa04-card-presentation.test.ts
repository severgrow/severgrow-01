import { describe, expect, it } from 'vitest';
import { bombText } from '../web/src/logic/bomb-text.js';

describe('Futa04 Bomb terminology is presentation only', () => {
  it('renames the card, hints and payoff while preserving grammar', () => {
    expect(bombText('Fruit cards: Use Fruit card. Fruited!')).toBe('Bombs: Use Bomb. Boom!');
    expect(bombText('FRUIT / fruit / Fruit')).toBe('BOMB / bomb / Bomb');
    expect(bombText('Mega Bomb cleared 5 tiles')).toBe('Blast cleared 5 tiles');
    expect(bombText('Skip sprout')).toBe('Skip grow');
  });
  it('does not rewrite internal action or save identifiers', () => {
    expect(bombText('PlayFruit fruitUsesSprout fruitAny')).toBe('PlayFruit fruitUsesSprout fruitAny');
    expect(bombText('Draw, Grow, Throw; Moss 4')).toBe('Draw, Grow, Throw; Moss 4');
  });
});
