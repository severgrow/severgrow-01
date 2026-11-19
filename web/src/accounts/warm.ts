// INSTANT SIGN-IN (owner, 2026-11-18, accounts pass: "warm the server when the sign-in sheet opens").
// Opening the email sheet or tapping Google sends one cheap request, so the hand-over that follows
// (seconds later, after Google or after typing the code) meets a warm server. At most once a minute.

/** A throttled, fire-and-forget wake-up. `ping` should be one small request; failures are ignored. */
export const signInWarmer = (ping: () => Promise<unknown>, now: () => number = Date.now): (() => void) => {
  let last = -Infinity;
  return () => {
    const t = now();
    if (t - last < 60_000) return;
    last = t;
    try { void ping().catch(() => undefined); } catch { /* never in the way of signing in */ }
  };
};
