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
 * `seed` is what the map ALREADY KNOWS about the tile's owner — the public name, level and colour it
 * paints on the Planet. The sheet can paint those on the first frame, before any request answers,
 * which is what makes a visitor profile feel instant (owner, 2026-11-20). It is PUBLIC-ONLY by type:
 * there is deliberately no Seeds, email, offline record or other private field on it.
 *
 * `trigger` is the element that was pressed, so closing the sheet returns focus to it (the sheet's
 * existing contract). No state is kept here; the panel owns everything else.
 */
export const PLAYER_PROFILE_EVENT = 'futasaku:player-profile';

/** Public facts the map already has for a tile's owner. Never private data. */
export type PlayerProfileSeed = Readonly<{
  name?: string | null;
  level?: number | null;
  /** The tile colour exactly as the map paints it (`hsl(...)`), not a second palette. */
  colourCss?: string | null;
}>;

export type PlayerProfileRequest = Readonly<{
  playerId: string;
  trigger: HTMLElement | null;
  seed?: PlayerProfileSeed | null;
}>;

/** Ask for another player's profile. A no-op outside a browser (unit tests, non-DOM builds). */
export const requestPlayerProfile = (
  playerId: string,
  trigger: HTMLElement | null = null,
  seed: PlayerProfileSeed | null = null,
): void => {
  if (typeof window === 'undefined' || typeof playerId !== 'string' || playerId === '') return;
  window.dispatchEvent(
    new CustomEvent<PlayerProfileRequest>(PLAYER_PROFILE_EVENT, {
      detail: { playerId, trigger, ...(seed ? { seed } : {}) },
    }),
  );
};
