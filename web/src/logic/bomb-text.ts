// Futa04 presentation wording. Internal card/action/save identifiers remain unchanged.
export const bombText = (text: string) => text
  .replace(/\bMega Bomb\b/gi, 'Blast')
  .replace(/\bFruited!\b/gi, 'Boom!')
  .replace(/\bFruited\b/gi, 'Boom')
  .replace(/\bSprout\b/g, 'Grow')
  .replace(/\bsprout\b/g, 'grow')
  .replace(/\bFruit cards\b/gi, 'Bombs')
  .replace(/\bFruit card\b/gi, 'Bomb')
  .replace(/\bFRUIT\b/g, 'BOMB')
  .replace(/\bFruit\b/g, 'Bomb')
  .replace(/\bfruit\b/g, 'bomb');
