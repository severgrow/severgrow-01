// HOW LONG THE GOOGLE HAND-OVER IS GIVEN (owner, 2026-11-20, on /test/: he signed out, then signed
// in with Google and got the "Google sign-in did not finish" sheet).
//
// The game API hand-over had a 3 s deadline and ONE retry. `web/e2e/accounts-google.ts` now stages
// what that costs, and it reproduced the owner's sheet exactly: a hand-over that answers in 3.5 s,
// and two 503s in a row, both ended with the vague message for a server that was merely busy. The
// server itself is measured to leave database-backed requests silent for 30 s and more
// (docs/PERFORMANCE-RELIABILITY-2026-11.md, 2026-11-18), so 3 s was spending the player's sign-in on
// a guess.
//
// Sign-in is not a hot path: a player waits several seconds happily, and nothing runs behind this
// (docs/ACCOUNTS.md: the sign-in gate holds the online start-up until the result is known). So the
// numbers come from the SERVER's own behaviour, not from a latency target:
//
//  * The FIRST attempt gets 12 s, just past the server's database stall guard — `EDGE_QUERY_STALL_MS`,
//    10 s by default (docs/DEPLOY-ONLINE.md, server/src/storage/stall-guard.ts). A stuck pooled
//    connection then gets to answer a real 503 and the isolate opens fresh ones, instead of the page
//    hanging up a moment before the server can say what went wrong and then retrying onto the same
//    stuck isolate. This is the relationship `web/tests/sign-in-handover.test.ts` pins.
//  * Each RETRY gets 4 s: a warm isolate answers the hand-over in 0.13-0.34 s (measured on the live
//    server on 2026-11-20) and a cold one costs a one-off ~0.45 s (docs/ONLINE-SMOOTHNESS.md: "a
//    cold isolate in the newly-pinned region costs one-off ~450 ms"), so 4 s is over ten times the
//    measured cost while keeping the whole sign-in short.
//  * TWO retries after the first attempt, with a short backoff (400 ms, then 900 ms) so a burst of
//    503s and a cold start are both covered without the UI feeling stuck — the menu already reads
//    "Signing in…" and stays interactive.
//
// The worst case is 12 + 0.4 + 4 + 0.9 + 4 = 21.3 s and it ENDS with a message, so a sign-in can
// never hang for ever. The hand-over is safe to repeat (the server treats a repeat of the same
// verified session as the same sign-in), and a transient failure keeps the verified session on the
// device (`mount.ts`, commit 29aa3cdd), so no retry can sign a player out.

/** The patient first attempt: just past the server's database stall guard. */
export const GOOGLE_HANDOVER_MS = 12_000;
/** A retry: over ten times the measured cold-start cost of one request. */
export const GOOGLE_HANDOVER_RETRY_MS = 4_000;
/** Short, quiet waits BETWEEN attempts: two retries, so a burst of 503s is covered too. */
export const GOOGLE_HANDOVER_BACKOFF_MS = [400, 900] as const;

/**
 * Should this hand-over answer be presented again? Only when there was no answer at all — status 0,
 * which is an abort at the deadline, a silent network or a failed CORS check — or when the server
 * itself failed (5xx). A 4xx is the server's answer ABOUT this sign-in (401 session expired, 403 the
 * provider refused, 429 too many attempts) and repeating it would only waste the player's time.
 */
export const transientHandOver = (status: number): boolean => status === 0 || status >= 500;

/** The whole sign-in's bounded worst case, in ms: every attempt's deadline plus every backoff. */
export const googleHandOverBudgetMs = (): number =>
  GOOGLE_HANDOVER_MS + GOOGLE_HANDOVER_BACKOFF_MS.reduce((total, wait) => total + wait + GOOGLE_HANDOVER_RETRY_MS, 0);
