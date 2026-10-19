// THE LESSON'S TWO VOICES — the display says what to do, the info box explains why.
//
// One surface per kind of content: the info box (#lesson-plate) never carries an action label or a
// button, and the display (the cockpit's LED) never carries a sentence. A beat has at most one of
// them, except a notification that needs its explanation (LAST TURN on the display, the scoring
// rule in the box) — never the same words twice. Pure: no DOM, no clock, every branch a function
// of its input.

export type LessonVoiceInput = {
  /** What the lesson says now (already faded by the mastery tier), or null when it is silent. */
  beat: { say?: string; line?: string } | null;
  /** A wrong tap's short answer; it owns the display for its moment. */
  answer: string | null;
  /** The lesson cannot finish any more: the box explains the way out, with no button. */
  stuck: boolean;
  /** The explanation for a lesson that cannot finish. */
  restartLine: string;
};

export type LessonVoice = {
  /** The info box: one explanation sentence, or null. */
  box: string | null;
  /** The display: the action (or a warning/answer), or null (the display keeps the score). */
  display: string | null;
};

/** What the box and the display show right now. */
export const lessonVoiceFor = ({ beat, answer, stuck, restartLine }: LessonVoiceInput): LessonVoice => {
  if (stuck) return { box: restartLine, display: null };
  return {
    box: beat?.line ?? null,
    display: answer ? answer.toUpperCase() : beat?.say ?? null,
  };
};
