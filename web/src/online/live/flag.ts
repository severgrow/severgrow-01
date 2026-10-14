// Live duels are a TEST-channel feature: on in `CHANNEL=futa-test` builds, or any build made with
// VITE_LIVE_DUELS=1 (the browser tests). The product build (futa04) never mounts them.
declare const __CHANNEL__: string;

export const liveDuelsEnabled = (): boolean => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  if (env?.VITE_LIVE_DUELS?.trim() === '1') return true;
  const channel = typeof __CHANNEL__ !== 'undefined' ? __CHANNEL__ : '';
  return channel === 'futa-test';
};
