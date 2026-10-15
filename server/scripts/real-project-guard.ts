// Scripts that send traffic to the REAL Supabase project spend its quota (every request is a paid
// Edge Function call; a long soak can use a day's free allowance). They only run when asked for on
// purpose:  FUTASAKU_REAL_PROJECT=1 npx tsx <script>
// Everything else (npm run check, npm run e2e, the local two-browser suites) never needs this.

export const REAL_PROJECT_ENV = 'FUTASAKU_REAL_PROJECT';

export const realProjectAllowed = (): boolean => process.env[REAL_PROJECT_ENV] === '1';

/** True when a URL points at this machine, so hitting it cannot spend the real project's quota. */
export const isLocalTarget = (url: string): boolean =>
  /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/i.test(url.trim());

/** Stop (exit code 3, never a false PASS) unless the real project was explicitly opted into. */
export const requireRealProjectOptIn = (script: string): void => {
  if (realProjectAllowed()) return;
  console.error(
    `SKIPPED ${script}: it sends traffic to the real Supabase project and uses its quota.\n` +
      `Run it on purpose with ${REAL_PROJECT_ENV}=1 (see docs/BACKEND.md "Tests and the Supabase quota").`,
  );
  process.exit(3);
};

/**
 * For a suite whose target comes from an env var or a default: a loopback target is free, anything
 * else (the deployed site, the real Edge API, a real database) needs the explicit opt-in. Reuses
 * {@link requireRealProjectOptIn} so there is exactly one opt-in mechanism.
 */
export const requireLocalOrRealProjectOptIn = (script: string, target: string): void => {
  if (isLocalTarget(target)) return;
  requireRealProjectOptIn(script);
};
