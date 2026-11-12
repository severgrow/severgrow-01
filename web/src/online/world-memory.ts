// The last good Territory map, kept on the device so the screen draws it the moment it opens
// (owner, 2026-10-22: everything visible instantly). The server's answer always replaces it; this
// is only what the player sees during the round trip, instead of an empty panel.
import type { KeyValue } from '../../../server/src/client.js';
import type { WorldMapPayload } from '../../../server/src/protocol.js';

type World = WorldMapPayload['world'];
export const WORLD_MEMORY_KEY = 'futasaku.world.last.v1';

const isWorld = (v: unknown): v is World => {
  const w = v as Partial<World> | null;
  return !!w && typeof w.version === 'number' && typeof w.revision === 'number' && typeof w.cost === 'number' &&
    Array.isArray(w.cells) && w.cells.length > 0 &&
    w.cells.every((c) => typeof c?.id === 'string' && typeof c.q === 'number' && typeof c.r === 'number') &&
    Array.isArray(w.claims) &&
    w.claims.every((c) => typeof c?.cellId === 'string' && typeof c.ownerId === 'string' && typeof c.colour === 'string');
};

export const rememberWorld = (kv: KeyValue | null, world: World): void => {
  try {
    kv?.set(WORLD_MEMORY_KEY, JSON.stringify(world));
  } catch {
    /* storage full or blocked: the next visit just waits for the network, as before */
  }
};

export const lastWorld = (kv: KeyValue | null): World | null => {
  try {
    const raw = kv?.get(WORLD_MEMORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isWorld(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
