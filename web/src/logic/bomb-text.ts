// Futa04 presentation wording. Internal card/action/save identifiers remain unchanged.
export const bombText = (text: string) => text
  .replace(/\bFruited\b/gi, 'Bomb used')
  .replace(/\bfruit\b/gi, word => word === 'FRUIT' ? 'BOMB' : word === 'fruit' ? 'bomb' : 'Bomb');
