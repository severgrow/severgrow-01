// SIGN-IN FIRST (owner, 2026-11-18: "Login through Google still takes about 5 or 6 seconds and then
// page refreshes ... before it was actually instant").
//
// Back from Google the page used to start every online read AS THE OLD GUEST (presence, matches,
// wallet, challenges, chat, achievements, tickets, the queued Seeds — about a dozen requests) beside
// the sign-in hand-over. The hand-over then queued behind them on a server isolate with two database
// connections, and every one of those reads was thrown away by the reload that follows a sign-in.
// On a Google return (including a resumed callback), start online reads after the result is known.
// Any other visit starts exactly as before. A safety limit releases the start-up regardless, so a
// sign-in that never reports back can never leave the game offline.
import { readCallback } from './core.js';

export const SIGN_IN_GATE_MAX_MS = 15_000;

export type SignInGate = {
  holding: boolean;
  settled: Promise<void>;
  /** The callback is over: start online work using the stored identity. */
  settle: () => void;
};

export const createSignInGate = (where: {
  search: string; hash: string; resumePending: boolean;
  setTimer?: (fire: () => void, ms: number) => void;
}): SignInGate => {
  let release!: () => void;
  const settled = new Promise<void>((resolve) => { release = resolve; });
  const holding = where.resumePending || readCallback(where.search, where.hash) !== null;
  if (!holding) release();
  else (where.setTimer ?? ((f, ms) => { setTimeout(f, ms); }))(() => release(), SIGN_IN_GATE_MAX_MS);
  return { holding, settled, settle: release };
};

/** The resume key of a sign-in interrupted by a reload (accounts/mount.ts). Per tab. */
export const SIGN_IN_RESUME_KEY = 'futasaku.auth.resume.v1';

const resumePending = (): boolean => {
  try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SIGN_IN_RESUME_KEY) !== null; } catch { return false; }
};

/** The page's one gate, decided from the address the page was opened with. */
export const signInGate: SignInGate = typeof location === 'undefined'
  ? createSignInGate({ search: '', hash: '', resumePending: false })
  : createSignInGate({ search: location.search, hash: location.hash, resumePending: resumePending() });
