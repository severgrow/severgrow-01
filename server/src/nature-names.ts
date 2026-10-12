// Curated nature-themed guest names (adjective + noun). No free text → no moderation.
// Deterministic when given a seed string so tests can pin a name.

const ADJECTIVES = [
  'Maple', 'Mossy', 'Fern', 'Cedar', 'Pine', 'Willow', 'Oak', 'Ivy', 'Lunar', 'Sunny',
  'Misty', 'Coral', 'Amber', 'Jade', 'River', 'Storm', 'Bloom', 'Root', 'Leafy', 'Glade',
] as const;

const NOUNS = [
  'Fox', 'Owl', 'Bear', 'Hare', 'Wren', 'Deer', 'Otter', 'Lynx', 'Finch', 'Mole',
  'Toad', 'Crane', 'Badger', 'Heron', 'Moth', 'Aspen', 'Birch', 'Creek', 'Grove', 'Stone',
] as const;

const hash = (input: string): number => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Friendly guest display name like "MapleFox". */
export const natureName = (seed: string): string => {
  const h = hash(seed.length > 0 ? seed : 'futasaku');
  const adj = ADJECTIVES[h % ADJECTIVES.length]!;
  const noun = NOUNS[Math.floor(h / ADJECTIVES.length) % NOUNS.length]!;
  return `${adj}${noun}`;
};

export const NATURE_NAME_PATTERN = /^[A-Z][a-z]+[A-Z][a-z]+$/;
