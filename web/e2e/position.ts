// Browser tests start games from set positions: the save holds the position as its `base` and
// no actions yet (the page's own autosave then adds the moves played).
import { CURRENT_RULES_VERSION } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';

export const positionSave = (o: { state: State | unknown; coach?: unknown; level?: number }): string =>
  JSON.stringify({ v: 7, rules: CURRENT_RULES_VERSION, seed: (o.state as State).seed, actions: [], base: o.state, coach: o.coach ?? null, level: o.level ?? 7 });
