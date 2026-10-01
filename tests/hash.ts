// Canonical JSON (sorted keys) and its sha256, for golden fixtures.
import { createHash } from 'node:crypto';

export const canonical = (x: unknown): string =>
  JSON.stringify(x, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
export const stateHash = (x: unknown): string => createHash('sha256').update(canonical(x)).digest('hex');
