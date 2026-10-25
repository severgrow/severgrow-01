// Share the existing live-button heartbeat result. No second poll, socket or presence writes.
import type { LiveStatusWire } from './api.js';
type Status = 'online' | 'away' | 'unknown';
const listeners = new Map<string, Set<(status: Status) => void>>();
let current: { matchId: string; status: Status } | null = null;
export const publishOpponentStatus = (
  matchId: string | null,
  wire: LiveStatusWire | null,
) => {
  const previous = current;
  const status: Status = !wire || wire.matchId !== matchId
    ? 'unknown'
    : wire.opponent.presence === 'offline' ? 'away' : 'online';
  current = matchId ? { matchId, status } : null;
  for (const id of new Set([previous?.matchId, current?.matchId])) {
    if (!id) continue;
    const value = current?.matchId === id ? current.status : 'unknown';
    for (const listener of listeners.get(id) ?? []) listener(value);
  }
};
export const subscribeOpponentStatus = (
  matchId: string,
  listener: (status: Status) => void,
) => {
  let set = listeners.get(matchId);
  if (!set) listeners.set(matchId, set = new Set());
  set.add(listener);
  listener(current?.matchId === matchId ? current.status : 'unknown');
  return () => {
    set!.delete(listener);
    if (!set!.size) listeners.delete(matchId);
  };
};
