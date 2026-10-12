// Presence is display-only: "Online" / "Away". Nothing gameplay depends on it (P-11).

import type { PresenceStatus } from './types.js';

export const presenceLabel = (status: PresenceStatus): string => {
  switch (status) {
    case 'online':
      return 'Online';
    case 'away':
      return 'Away';
    default:
      return 'Away';
  }
};

/** Map a Realtime presence count (other members) to Online / Away. */
export const presenceFromPeers = (peerCount: number): PresenceStatus => (peerCount > 0 ? 'online' : 'away');
