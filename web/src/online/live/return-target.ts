// Live duels — "Back to your game". Where the player was when they accepted a live challenge, kept
// on this device only. It NEVER writes a game save: the bot game keeps the existing Continue save
// (written after every move) and an async match keeps its unsent draft in its own session storage.
import type { KeyValue } from '../../../../server/src/client.js';

export type ReturnTarget = { kind: 'bot' } | { kind: 'match'; matchId: string } | { kind: 'menu' };

export const RETURN_KEY = 'futasaku.live.return.v1';

const valid = (v: unknown): v is ReturnTarget => {
  if (typeof v !== 'object' || v === null) return false;
  const k = (v as { kind?: unknown }).kind;
  if (k === 'bot' || k === 'menu') return true;
  return k === 'match' && typeof (v as { matchId?: unknown }).matchId === 'string';
};

export type ReturnStore = {
  get(): ReturnTarget | null;
  set(t: ReturnTarget): void;
  clear(): void;
};

export const createReturnStore = (kv: KeyValue | null): ReturnStore => {
  let memory: ReturnTarget | null = null;
  return {
    get() {
      if (!kv) return memory;
      try {
        const raw = kv.get(RETURN_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw) as unknown;
        return valid(v) ? v : null;
      } catch {
        return null;
      }
    },
    set(t) {
      memory = t;
      try {
        kv?.set(RETURN_KEY, JSON.stringify(t));
      } catch {
        /* storage full or blocked: memory copy still works this session */
      }
    },
    clear() {
      memory = null;
      try {
        kv?.remove(RETURN_KEY);
      } catch {
        /* ignore */
      }
    },
  };
};

export type ReturnHost = {
  continueBotGame(): void;
  openMatch(matchId: string): Promise<void> | void;
  showMenu(): void;
};

/** Go back. The live match itself is never a return target (the caller filters that out). */
export const restoreTarget = async (t: ReturnTarget | null, host: ReturnHost): Promise<void> => {
  if (!t || t.kind === 'menu') return host.showMenu();
  if (t.kind === 'bot') return host.continueBotGame();
  await host.openMatch(t.matchId);
};
