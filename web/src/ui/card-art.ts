// THE ONE PLACE A CARD FACE'S ART IS NAMED.
//
// The hand's faces (`player/cards.ts`), the draw/throw piles and the strike that plays over a Blast
// (`ui/live-strike.ts`, and the replay's `replay/strike.ts`) all read the same face URLs from here,
// so they can never disagree about what the Bomb card looks like. This module holds the URLs only:
// no DOM, no side effects, no preloading — `player/cards.ts` owns the decode/preload step, which is
// why the table had to move out of it (the replay is loaded on channels that never mount the card
// UI, and importing `player/cards.ts` there would have started a card-art preload for them).
//
// There is no card-skin system yet (docs/CARD-SKIN-PERSPECTIVE.md: your hand reads your skin, the
// opponent's hands and the piles read theirs — future work). `cardArtUrl` is the single seam such a
// skin plugs into, and `setCardFaceArt` is how it would do that: today nothing calls it, so every
// URL below is the shipped asset and the behaviour is byte-identical.
import mossArt from '../assets/cards/moss.webp?url';
import ashArt from '../assets/cards/ash.webp?url';
import dewArt from '../assets/cards/dew.webp?url';
import emberArt from '../assets/cards/ember.webp?url';
import bombArt from '../assets/cards/bomb.webp?url';
import backArt from '../assets/cards/back.webp?url';

/** The five faces a card can show, plus the back. */
export const CARD_FACES = ['s0', 's1', 's2', 's3', 'fruit', 'back'] as const;
export type CardFace = (typeof CARD_FACES)[number];

/**
 * The face of the Bomb card — the one every card a Bomb throws shows, and the card a Blast's strike
 * lays on the board. Named once here so the hand, the piles, the strike and the replay cannot pick
 * different faces of the same card.
 */
export const BOMB_FACE: CardFace = 'fruit';

/** The shipped art per face. Order is the preload order in `player/cards.ts`; never reorder it. */
const SHIPPED_FACE_ART: Readonly<Record<CardFace, string>> = Object.freeze({
  s0: mossArt, s1: ashArt, s2: dewArt, s3: emberArt, fruit: bombArt, back: backArt,
});

let faceArt: Readonly<Record<CardFace, string>> = SHIPPED_FACE_ART;

/**
 * The URL of a face's art. The ONE accessor for card artwork: the hand, the piles, the strike over a
 * Blast and the replay all ask here, so a face is never drawn from a second, contradicting source.
 */
export const cardArtUrl = (face: CardFace): string => faceArt[face];

/** Every face URL, in preload order. A skin that replaces some faces changes only what this answers. */
export const cardArtUrls = (): string[] => CARD_FACES.map(cardArtUrl);

/**
 * The seam a future card skin plugs into (docs/CARD-SKIN-PERSPECTIVE.md). `null` restores the
 * shipped art. Not called anywhere yet — the perspective (your skin vs theirs vs the piles') has to
 * be decided per viewer first, so no caller exists until that lands.
 */
export const setCardFaceArt = (next: Partial<Record<CardFace, string>> | null): void => {
  faceArt = next ? Object.freeze({ ...SHIPPED_FACE_ART, ...next }) : SHIPPED_FACE_ART;
};
