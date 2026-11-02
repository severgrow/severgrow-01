/**
 * THE ONE WIRE between Territory and the profile sheet (owner, 2026-11-01: "allow to look up other
 * peoples profile on territory").
 *
 * Territory (web/src/online/) and the accounts panel (web/src/accounts/mount.ts) are mounted
 * separately, and neither should import the other's machinery. This zero-dependency module carries
 * the ONE request across: a tile key says which player, and the accounts module — which owns the
 * identity, the API headers and `installProfileUI` — does the read and opens the SAME sheet in its
 * visitor mode.
 *
 * `trigger` is the element that was pressed, so closing the sheet returns focus to it (the sheet's
 * existing contract). No state is kept here; the panel owns everything else.
 */
export const PLAYER_PROFILE_EVENT = 'futasaku:player-profile';

export type PlayerProfileRequest = Readonly<{ playerId: string; trigger: HTMLElement | null }>;

/** Ask for another player's profile. A no-op outside a browser (unit tests, non-DOM builds). */
export const requestPlayerProfile = (playerId: string, trigger: HTMLElement | null = null): void => {
  if (typeof window === 'undefined' || typeof playerId !== 'string' || playerId === '') return;
  window.dispatchEvent(
    new CustomEvent<PlayerProfileRequest>(PLAYER_PROFILE_EVENT, { detail: { playerId, trigger } }),
  );
};
