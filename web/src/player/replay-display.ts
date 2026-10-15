// The cockpit's read on a REPLAYED turn (the enemy's committed turn online — live, or a
// catch-up after being away). Two small, DOM-free pieces the page composes together:
//
//  * `replayedByOpponent` — is this replay someone ELSE'S move? The offline game knows because it
//    holds both ends of the action; an online replay may only have the events (a resume after
//    being away carries no "before" state), so the events themselves — which name their author —
//    are the honest source. The designer's ask ("dim the display so it's obvious it's not ours")
//    hangs off this flag.
//  * `createTheirsDim` — the lifecycle of that dim: on when the enemy's turn is on the glass, off
//    the moment it drains. Idempotent, so no drain path (pump, watchdog, teardown, finish) can
//    leave it stuck on; a stuck dim would be worse than none.
import type { Event, Player } from '../../../src/engine/index.js';

/**
 * True when the buffered events were authored by the opponent. Every replay event but `GameEnd`
 * carries its `player` in ENGINE coords, so `seat` must be the engine seat (not the display one).
 * The player's OWN aftermath (a sever their Throw caused) names the player, so it reads as ours.
 */
export const replayedByOpponent = (events: readonly Event[], seat: Player): boolean =>
  events.some((event) => 'player' in event && event.player !== seat);

/** Where the dim is applied — the cockpit's own `dim` sink. */
export type DimSink = (on: boolean) => void;

/**
 * Owns the cockpit display's "showing the opponent's move" dim. `begin()` is idempotent and
 * `clear()` always reaches the sink when (and only when) the dim is on, so calling clear at every
 * drain point cannot double-apply and a missed begin cannot leave a phantom dim.
 */
export const createTheirsDim = (apply: DimSink) => {
  let on = false;
  return {
    /** The enemy's turn started replaying: dim the glass once. */
    begin(): void {
      if (on) return;
      on = true;
      apply(true);
    },
    /** The replay drained, was skipped, or the duel ended: always lift the dim. */
    clear(): void {
      if (!on) return;
      on = false;
      apply(false);
    },
    /** True while the display is dimmed (for tests and the HUD's own honesty). */
    get active(): boolean {
      return on;
    },
  };
};
