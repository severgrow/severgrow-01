// The Blitz clock's one public signal: sent on `window` whenever the clock turns on or off or changes
// side. Listeners (the quiet achievement line) hear it instead of watching the page for changes.
export const BLITZ_CLOCK_EVENT = 'futasaku:blitz-clock';

export type BlitzClockSignal = { on: boolean; side: 'mine' | 'theirs' | null };

/** True while it is the player's own Blitz decision: their clock is running on their turn. */
export const blitzDecisionOf = (s: BlitzClockSignal): boolean => s.on && s.side === 'mine';
