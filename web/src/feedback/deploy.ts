// When the build a player is running went live (owner, 2026-10-22: the menu's beta line says
// "last deploy: <time>"). The time is stamped by the build itself (web/vite.config.ts), and the
// deploy workflow builds the site immediately before it publishes, so every push to the live
// branch carries its own time without anyone having to remember to update it.
declare const __DEPLOYED_AT__: string;

/** The stamped ISO time, or '' in a dev server or a test run. */
export const DEPLOYED_AT: string = typeof __DEPLOYED_AT__ === 'string' ? __DEPLOYED_AT__ : '';

/** "22 Oct, 12:12" in the reader's own time zone, or null when there is no usable stamp. */
export const deployLabel = (iso: string | null | undefined, timeZone?: string): string | null => {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')} ${part('month')}, ${part('hour')}:${part('minute')}`;
};
