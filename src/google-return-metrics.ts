const stages = ['callback', 'missing-pending', 'token-exchange', 'handover', 'storage', 'success'] as const;
export type GoogleReturnStage = (typeof stages)[number];

/** Keep only fixed stage names and bounded, rounded timing values for operational logs. */
export const googleReturnMetric = (wire: unknown) => {
  if (!wire || typeof wire !== 'object' || Array.isArray(wire)) return null;
  const row = wire as Record<string, unknown>;
  const stage = stages.find(value => value === row.stage);
  if (!stage) return null;
  const ms = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 60_000 ? value : null;
  const startedMs = ms(row.startedMs);
  const totalMs = ms(row.totalMs);
  if (startedMs === null || totalMs === null || startedMs > totalMs) return null;
  return { stage, startedMs, totalMs, tokenMs: ms(row.tokenMs), handoverMs: ms(row.handoverMs) };
};
