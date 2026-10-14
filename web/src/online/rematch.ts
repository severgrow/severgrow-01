/**
 * A rematch from a finished **standard (async) online duel**.
 *
 * The plan is one sentence: *"Rematch = create a fresh invite to the same friend and show it."*
 * So this does exactly two things, in this order:
 *
 *   1. **Tear the finished duel's session down.** A finished session must never leak into the new
 *      match — the driver would otherwise keep polling a match that is already over.
 *   2. **Create a brand-new match and surface the existing invite/share screen** — the same
 *      "create a duel" path (the 4-character code, tap-to-copy and `Share invite`), so no new
 *      share UI is invented.
 *
 * The opponent is deliberately **not pinged**: async duels have no presence/challenge plumbing
 * (that is wired only for live duels, on purpose). The opponent joins the new duel by the shared
 * code/link, exactly as they joined the first one. The LIVE end window's rematch *does* ping the
 * opponent, because live has a challenge channel; the flow the player sees is the same otherwise
 * (tap Rematch → a waiting surface for the same opponent).
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
