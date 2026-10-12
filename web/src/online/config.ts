// Public online config (no secrets). API base comes from the web build Variable.

/** Deployed duel API base URL, or null when this build has no online endpoint. */
export const duelApiUrl = (): string | null => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const raw = env?.VITE_DUEL_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
};

export const onlineBuildEnabled = (): boolean => duelApiUrl() !== null;

/** Public site base used in invite links (Pages). */
export const publicAppOrigin = (): string => {
  if (typeof location !== 'undefined' && location.origin) return location.origin + (location.pathname.replace(/\/+$/, '') || '');
  return 'https://severgrow.github.io/futa0.5';
};
