// CAMPAIGN RESET — the one piece of player state the server never holds.
//
// Which campaign levels are unlocked is NOT a database row: the game keeps it in the player's own
// browser (`severgrow.campaign.progress.v1`, plus the unfinished match and a "last mode" note; see
// src/campaign/progress.ts). The server only ever records the Seeds a first clear paid. So "reset
// the campaign" from the dashboard can only mean the browser the owner is sitting in front of —
// this module does exactly that, and nothing else.
//
// Why not a server endpoint instead: there is no progress row to update. A server flag could only
// ASK some browser to clear itself on a later visit, and would still clear whichever device opened
// the game — which is strictly worse than acting on the device whose storage is actually in front
// of us.
//
// The dashboard is served from the same origin as the game (futasaku.com and futasaku.com/admin/),
// so the game's own storage is readable here. Reading and removing is all this module does: it
// never writes a campaign key, so a mistake can only ever remove progress, never invent it.
//
// The guard is the DEVICE's identity, not the looked-up player: the reset is offered only when this
// browser is signed in as the very player being looked at, so an admin on one machine cannot clear
// somebody else's campaign by typing a name.

/** The game's campaign record, the unfinished campaign match, and which mode Continue resumes. */
export const CAMPAIGN_SUFFIXES = [
  'severgrow.campaign.progress.v1',
  'severgrow.campaign.save.v1',
  'severgrow.lastmode.v1',
] as const;

/** The game's online identity (the only record that names the player this browser belongs to). */
export const IDENTITY_SUFFIX = 'severgrow.duel.identity.v1';

/**
 * Every storage prefix the game has ever used, most likely first. `futa05:` is the published
 * channel (the site root); `main2:` is the 0.4 product build on an ordinary host.
 */
export const CHANNEL_PREFIXES = ['futa05:', 'futa04:', 'futa-test:', 'test:', 'main2:', ''] as const;

/** The slice of Storage this module needs — so it can be tested without a DOM. */
export type Store = {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  removeItem(key: string): void;
};

export type DevicePlayer = {
  /** The player this browser is signed in as. */
  readonly playerId: string;
  readonly displayName: string | null;
  /** The exact storage key the identity was read from. */
  readonly key: string;
  /** Its channel prefix (`'futa05:'`, or `''` on an older channel). */
  readonly prefix: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Which player this browser belongs to, or `null` when it has no readable identity. A malformed or
 * partially written record is treated as absent — never as a match, because a match is what enables
 * the destructive button.
 */
export const devicePlayer = (store: Pick<Store, 'getItem'>): DevicePlayer | null => {
  for (const prefix of CHANNEL_PREFIXES) {
    const key = prefix + IDENTITY_SUFFIX;
    let raw: string | null = null;
    try {
      raw = store.getItem(key);
    } catch {
      continue; // storage blocked for this key: try the next channel rather than fail the screen
    }
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) continue;
      const playerId = parsed.playerId;
      const displayName = parsed.displayName;
      if (typeof playerId !== 'string' || playerId.length === 0) continue;
      return {
        playerId,
        displayName: typeof displayName === 'string' && displayName.length > 0 ? displayName : null,
        key,
        prefix,
      };
    } catch {
      continue;
    }
  }
  return null;
};

/** Every campaign key actually present in this store, whatever channel wrote it. */
export const campaignKeysOnDevice = (store: Store): string[] => {
  const found: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key) continue;
    if (CAMPAIGN_SUFFIXES.some((suffix) => key === suffix || key.endsWith(`:${suffix}`))) found.push(key);
  }
  return found.sort();
};

/**
 * Remove the campaign record from this browser. Returns exactly what was removed, so the dashboard
 * can say what happened instead of claiming success blindly. Reads nothing else and writes nothing.
 */
export const clearCampaignOnDevice = (store: Store): { removed: string[] } => {
  const removed: string[] = [];
  for (const key of campaignKeysOnDevice(store)) {
    try {
      store.removeItem(key);
      removed.push(key);
    } catch {
      /* a key that cannot be removed stays listed as present on the next look-up */
    }
  }
  return { removed };
};
