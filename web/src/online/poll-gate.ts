// ONE predicate for the lobby's 2 s polls (2026-10-30).
//
// The invite/waiting screen and the parked "find opponent" search used to fire a GET every two
// seconds with no regard for what the tab or the network was doing. Two costs followed:
//
//   • a phone in a pocket kept waking the radio and the CPU (the waiting screen and the search
//     both survive leaving the lobby on purpose — the search is *meant* to run while the player
//     plays the computer), and
//   • on a bad connection a 2 s interval is not a 2 s cadence: a request that took 8 s had three
//     more stacked behind it, so a stalled network turned one slow poll into four in-flight ones.
//
// The poll is a *poll*: skipping a tick loses nothing, because the next tick asks again and the
// screen is refreshed the moment the tab comes back. So the rule is deliberately one line, and it
// is a pure function here (not an `if` buried in each interval) so the decision itself is tested.
export type PollContext = {
  /** `document.hidden` — nobody is looking, so no request and no repaint. */
  hidden: boolean;
  /** A request from the previous tick is still out. Asking again would only stack. */
  inFlight: boolean;
};

/** True when this tick should actually ask the server. */
export const pollDue = (context: PollContext): boolean => !context.hidden && !context.inFlight;
