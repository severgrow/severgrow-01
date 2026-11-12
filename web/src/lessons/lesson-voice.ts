// THE LESSON'S TWO VOICES — the display says what to do, the info box explains why.
//
// One surface per kind of content: the info box (#lesson-plate) never carries an action label, and
// its only button is START AGAIN while the lesson cannot finish (owner, 2026-10-22); and the display (the cockpit's LED) never carries a sentence. A beat has at most one of
// them, except a notification that needs its explanation (LAST TURN on the display, the scoring
// rule in the box) — never the same words twice. Pure: no DOM, no clock, every branch a function
// of its input.

export type LessonVoiceInput = {
  /** What the lesson says now (already faded by the mastery tier), or null when it is silent. */
  beat: { say?: string; line?: string } | null;
  /** A wrong tap's short answer; it owns the display for its moment — while it is still my turn. */
  answer: string | null;
  /**
   * Is the player acting now? An answer belongs to MY tap, so on the opponent's turn the live
   * status line (`LESSON.theirTurn`, "WAIT") owns the display instead. Defaults to true so every
   * existing caller keeps the answer exactly as before.
   */
  mine?: boolean;
  /** The lesson cannot finish any more: the box says so and offers START AGAIN. */
  stuck: boolean;
  /** The explanation for a lesson that cannot finish. */
  restartLine: string;
};

export type LessonVoice = {
  /** The info box: one explanation sentence, or null. */
  box: string | null;
  /** The display: the action (or a warning/answer), or null (the display keeps the score). */
  display: string | null;
  /** The box offers START AGAIN (restarts this level in place). Only while the lesson is stuck. */
  restart: boolean;
};

/** What the box and the display show right now. */
export const lessonVoiceFor = ({ beat, answer, mine = true, stuck, restartLine }: LessonVoiceInput): LessonVoice => {
  if (stuck) return { box: restartLine, display: null, restart: true };
  return {
    box: beat?.line ?? null,
    // Their turn has one steady cue: a wrong-tap answer from my last turn is stale and must never
    // hide the WAIT status line (the live cue is the thing the player is meant to read now).
    display: mine && answer ? answer.toUpperCase() : beat?.say ?? null,
    restart: false,
  };
};
