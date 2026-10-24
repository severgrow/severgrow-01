// LEVEL 10, THE FINAL LESSON — the one level of the tutorial that pays Seeds (owner, 2026-10-24:
// "Level 10 should give 100 seeds"). It is a real game against a real bot from an authored
// opening, so the server can replay it exactly as it replays a Campaign level: this module is the
// ONE copy of that opening, read by the lesson (lessons.ts) and by the server's verifier
// (server/src/seeds/verify.ts). It imports nothing but the authored-opening builder, so the Edge
// bundle never pulls the lesson scripts or their words.
import { authoredState } from './authored.js';
import type { PositionSpec } from './authored.js';

const YOU = 0 as const;
const THEM = 1 as const;

const POSITION: PositionSpec = {
  seed: 96010,
  gold: ['0,0'],
  rock: ['0,1'],
  // A normal opening: both sides have grown a little, and their home already has cover.
  tiles: [['-1,1', YOU, 4], ['1,-1', THEM, 4], ['1,-2', THEM, 6], ['2,-1', THEM, 7]],
  hand: [[0, 4], [0, 5], [1, 5], [2, 5], [3, 7], [null, 0], [1, 8]],
  opponent: [[1, 1], [2, 2], [3, 3], [0, 2], [3, 2], [2, 1], [3, 4]],
  deck: [[0, 6], [1, 4], [3, 5], [0, 3], [1, 6], [2, 4], [3, 6], [0, 8], [1, 7], [2, 7], [3, 8], [2, 8], [0, 7], [1, 3]],
  discard: [[3, 1]],
};

export const FINAL_LESSON = Object.freeze({
  /** The proof's level id on the wire (`POST /v1/seeds/campaign`), and its receipt key `lesson:10`. */
  id: 'lesson-10',
  level: 10,
  /** The bot it plays against (its own level, as for any bot game). */
  botLevel: 1 as const,
  position: POSITION,
});

/** The final lesson's opening, exactly as the player starts it. */
export const finalLessonOpening = () => authoredState(FINAL_LESSON.position);
