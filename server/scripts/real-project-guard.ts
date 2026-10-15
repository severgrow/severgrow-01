// Scripts that send traffic to the REAL Supabase project spend its quota (every request is a paid
// Edge Function call; a long soak can use a day's free allowance). They only run when asked for on
// purpose:  FUTASAKU_REAL_PROJECT=1 npx tsx <script>
// Everything else (npm run check, npm run e2e, the local two-browser suites) never needs this.

export const REAL_PROJECT_ENV = 'FUTASAKU_REAL_PROJECT';

export const realProjectAllowed = (): boolean => process.env[REAL_PROJECT_ENV] === '1';

/** Stop (exit code 3, never a false PASS) unless the real project was explicitly opted into. */
export const requireRealProjectOptIn = (script: string): void => {
  if (realProjectAllowed()) return;
  console.error(
    `SKIPPED ${script}: it sends traffic to the real Supabase project and uses its quota.\n` +
      `Run it on purpose with ${REAL_PROJECT_ENV}=1 (see docs/BACKEND.md "Tests and the Supabase quota").`,
  );
  process.exit(3);
};
