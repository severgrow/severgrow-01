// The hidden ?debug=1 page: the one place the game's random number (the seed of the deal)
// shows. The normal page never says "seed" (web/tests/seed-words.test.ts).

/** Where the word scans allow "seed": only here. */
export const DEBUG_ALLOWLIST: readonly string[] = Object.freeze(['?debug=1 page']);

/** True only for an explicit ?debug=1 in the address. */
export const isDebug = (search: string): boolean => new URLSearchParams(search).get('debug') === '1';

/** The lines shown in the debug corner. */
export const debugLines = (g: { seed: number; turnNumber: number; level: number }): string[] => [
  `seed ${g.seed}`,
  `turn ${g.turnNumber} · level ${g.level}`,
  `replay: ?seed=${g.seed}`,
];
