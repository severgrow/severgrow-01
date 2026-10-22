/**
 * A rematch from a finished **standard (async) online duel**.
 *
 * It does two things, in this order:
 *
 *   1. **Tear the finished duel's session down.** A finished session must never leak into the new
 *      match — the driver would otherwise keep polling a match that is already over.
 *   2. **Ask the server for the rematch** (`lobby-ui.ts` `rematch`). It is MUTUAL (owner,
 *      2026-10-22: "they both press rematch = they're straight in a new game"): the first press
 *      creates the new match and waits on the usual waiting screen, the second press by the other
 *      player takes the other seat, and both are in. The invite code stays on the waiting screen as
 *      a second way in. A server without the endpoint falls back to a fresh invite, as before.
 *
 * The LIVE end window's rematch goes through live's own challenge channel; the flow the player sees
 * is the same (tap Rematch → straight in, or wait for the other's tap).
 */
export type RematchDeps = {
  /** The ONE teardown of an online duel (`tearDownOnlineDuel` in `main.ts`). */
  tearDown: () => void;
  /** Create a fresh match and show the invite/share screen (the lobby's "Create a duel"). */
  createMatch: () => Promise<void> | void;
};

export const runRematch = async ({ tearDown, createMatch }: RematchDeps): Promise<void> => {
  tearDown();
  await createMatch();
};
