/**
 * THE OPPONENT SKIN SEAM (campaign chapters).
 *
 * A campaign chapter may one day wear its own opponent art. Today none does: every chapter answers
 * the CURRENT skin, which is the art the live board already paints, so resolving it changes
 * nothing on screen.
 *
 * Read the reality before wiring this further: the live board does not draw the skin system yet
 * (docs/ART-LAB.md). Today's board is `DefaultArtBoardView` (painted sprites); `SkinBoardView` is
 * the Art Lab's. So this module deliberately names a skin and nothing renders from it yet — it is
 * the one place the campaign's opponent look is decided, so the measured step that moves the board
 * onto skins (or gives the opponent its own painted set) asks HERE and adds ids below.
 *
 * Pure and deterministic: no DOM, no storage, no clock. Every chapter number is answerable, in
 * particular 8-10, whose campaign levels do not exist yet.
 */

/** The opponent looks a chapter can name. One today: the game's own painted board art. */
export const OPPONENT_SKIN_IDS = ['default'] as const;

/** The opponent look a campaign chapter wears. An id, not a renderer. */
export type OpponentSkin = (typeof OPPONENT_SKIN_IDS)[number];

/** Today's opponent look: the art `DefaultArtBoardView` already paints (never a second board). */
export const CURRENT_OPPONENT_SKIN: OpponentSkin = 'default';

/** The chapters the campaign can ask about (1-based). 8-10 have no levels yet but must still answer. */
export const LAST_SKIN_CHAPTER = 10;

/**
 * The opponent's skin for a campaign chapter. Every chapter — including one with no levels yet, or
 * an absent/out-of-range number — answers today's skin rather than throwing, so a caller can ask
 * before the campaign data exists. A chapter's own look becomes one branch here; no caller moves.
 */
export const opponentSkinForChapter = (_chapter: number): OpponentSkin => CURRENT_OPPONENT_SKIN;
