// WARM START FOR GLOBAL CHAT (cold start on the real server, 2026-11-18: the chat page sometimes takes
// seconds, or never answers; a returning player saw "Connecting…" over an empty panel). The last page
// an account read is kept on this device and shown at once on its next visit while the fresh read is
// on its way. ONE slot, keyed by a digest of that account's credentials (never the credential itself),
// so another account on the device never sees it, and dropped after CHAT_MEMORY_MAX_AGE_MS.
import type { KeyValue } from '../../../server/src/client.js';

/** `severgrow.*` (the channel prefixes it). Versioned: a shape change gets a new key. */
export const CHAT_MEMORY_KEY = 'severgrow.territory.chat.v1';
/** Older than this, the page is not shown: a stale conversation is worse than "Connecting…". */
export const CHAT_MEMORY_MAX_AGE_MS = 24 * 3_600_000;

/** FNV-1a, 32-bit: a scope label, not a secret. */
const digest = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
};

export const chatMemory = <T>(store: KeyValue | null, now: () => number = Date.now) => ({
  load(scope: string): readonly T[] | null {
    try {
      const raw = JSON.parse(store?.get(CHAT_MEMORY_KEY) ?? 'null') as { scope?: unknown; at?: unknown; messages?: unknown } | null;
      if (!raw || raw.scope !== digest(scope) || typeof raw.at !== 'number' || !Array.isArray(raw.messages)) return null;
      if (now() - raw.at > CHAT_MEMORY_MAX_AGE_MS) return null;
      return raw.messages as T[];
    } catch { return null; }
  },
  save(scope: string, messages: readonly T[]): void {
    try { store?.set(CHAT_MEMORY_KEY, JSON.stringify({ scope: digest(scope), at: now(), messages })); } catch { /* private mode: no memory */ }
  },
});
