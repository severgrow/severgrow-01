// Which channels carry live duels, or any build made with VITE_LIVE_DUELS=1 (the browser tests).
//
// `futa05` (the `/futa0.5/` online preview) was added on the owner's instruction "so 0.5 is the
// main one with everything": the preview now ships the live-duel feature as well as online duels.
// The other session had deliberately kept it TEST-only (`futa-test`). This is reversible: remove
// `'futa05'` from this set to restore the test-only gate. The product build (futa04) never mounts it.
declare const __CHANNEL__: string;

const CHANNELS_WITH_LIVE_DUELS = new Set(['futa-test', 'futa05']);

type BuildEnv = Record<string, string | undefined>;

/**
 * True when this build carries live duels. `env` is only there so a unit test can pin both the
 * channel gate and the explicit `VITE_LIVE_DUELS=1` override; real callers pass nothing.
 */
export const liveDuelsEnabled = (env?: BuildEnv): boolean => {
  const buildEnv = env ?? (import.meta as { env?: BuildEnv }).env;
  if (buildEnv?.VITE_LIVE_DUELS?.trim() === '1') return true;
  const channel = typeof __CHANNEL__ !== 'undefined' ? __CHANNEL__ : '';
  return CHANNELS_WITH_LIVE_DUELS.has(channel);
};
