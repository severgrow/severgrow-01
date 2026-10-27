// WHO SEES THE DAILY PUZZLE (owner, 2026-10-27: "for now, for testing hide the DAILY puzzles for
// everyone but my account RYK — also allow me to check next 10 on my account, rest of players not
// see it at all").
//
// The gate is the account's PLAYER ID (a nickname can be chosen by anyone). It is read from this
// device's stored online identity, the same record the accounts module writes after sign-in. To open
// the Daily to everyone, set DAILY_OPEN_TO_ALL to true.
export const DAILY_OPEN_TO_ALL = false;

/** The owner's account, RYK (the founding admin id in server/src/config.ts, pinned by a test). */
const OWNER = '37e3d4d0-a34c-45b3-bc61-992fcf392912';
/** Extra testers for a local build only (`VITE_DAILY_TESTERS`, comma-separated ids); empty live. */
const extra = String((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_DAILY_TESTERS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
export const DAILY_TESTER_IDS: readonly string[] = Object.freeze([OWNER, ...extra]);

/** How many puzzles past today a tester may open. */
export const PREVIEW_AHEAD = 10;

/** Whether a stored identity record belongs to a Daily tester. */
export const dailyTesterIn = (raw: string | null | undefined): boolean => {
  if (!raw) return false;
  try {
    const id = JSON.parse(raw) as { playerId?: unknown };
    return typeof id.playerId === 'string' && DAILY_TESTER_IDS.includes(id.playerId.toLowerCase());
  } catch {
    return false;
  }
};

/** The puzzle numbers a tester may open: every one up to today, and the next ten. */
export const previewRange = (today: number | null, count: number): { first: number; last: number } => ({
  first: 1,
  last: Math.min(count, (today ?? 0) + PREVIEW_AHEAD + (today === null ? 1 : 0)),
});
