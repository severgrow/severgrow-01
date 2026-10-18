// A LEVEL'S LESSON NOTES — kept beside the level's own save, so a refresh neither repeats an
// explanation nor resumes a game under a lesson that has since changed (its version moved on).
import type { Lesson } from './lessons.js';

export const LESSON_META_KEY = 'severgrow.lesson.meta.v1';

export type LessonMeta = { level: number; version: number; seen: string[] };

export const encodeLessonMeta = (m: LessonMeta): string => JSON.stringify(m);

export const decodeLessonMeta = (raw: string | null): LessonMeta | null => {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as Partial<LessonMeta> | null;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    if (typeof m.level !== 'number' || typeof m.version !== 'number' || !Array.isArray(m.seen)) return null;
    if (!m.seen.every((x) => typeof x === 'string')) return null;
    return { level: m.level, version: m.version, seen: [...m.seen] };
  } catch {
    return null;
  }
};

/** A saved game of this level may go on only under the very lesson it was started with. */
export const lessonResumable = (m: LessonMeta | null, lesson: Lesson): boolean =>
  !!m && m.level === lesson.level && m.version === lesson.version;
