// THE LESSON'S WORDS — what the caption says and whether its ONE action shows.
//
// A lesson used to spend the game's top row on its title and NEXT, and before that a whole row of
// the glass window. The header is now the menu and the logo only; the words live in the cockpit
// plate under the map, and a one-word step with nothing else to say stays on the cockpit sign.
// This module is the pure state behind both: no DOM, no clock, every branch a function of its input.

export type LessonBarLabels = { next: string; showMe: string; restart: string };

export type LessonBarInput = {
  /** The level's name while the short stage intro runs; null after it. */
  stageName: string | null;
  /** The lesson cannot finish any more: the plate offers RESTART LEVEL instead of a title. */
  stuck: boolean;
  /** What the lesson says now (already faded by the mastery tier), or null when it is silent. */
  beat: { title: string; explain?: boolean } | null;
  /** A wrong tap's one-word answer; it owns the display for its moment. */
  answer: string | null;
  /** The safety net has passed 6 s: the player may ask to be shown. */
  showMe: boolean;
  labels: LessonBarLabels;
};

export type LessonBarState = {
  /** The title, or null when there is no title to show. */
  title: string | null;
  next: { show: boolean; label: string; blink: boolean };
};

/** What the plate (or the sign) shows right now. */
export const lessonBarFor = (input: LessonBarInput): LessonBarState => {
  const { stageName, stuck, beat, answer, showMe, labels } = input;
  const hidden = { show: false, label: '', blink: false };
  if (stageName) return { title: stageName.toUpperCase(), next: hidden };
  if (stuck) return { title: null, next: { show: true, label: labels.restart, blink: false } };
  const title = answer ? answer.toUpperCase() : beat?.title ?? null;
  const next = beat?.explain
    ? { show: true, label: labels.next, blink: true }
    : showMe && beat
      ? { show: true, label: labels.showMe, blink: false }
      : hidden;
  return { title, next };
};
