import { describe, expect, it } from 'vitest';
import { decodeLessonMeta, encodeLessonMeta, lessonResumable } from '../src/lessons/lesson-save.js';
import { lessonFor } from '../src/lessons/lessons.js';

describe('a level’s lesson notes survive a refresh, and only for the same lesson', () => {
  const l3 = lessonFor(3)!;
  it('round-trips the seen explanations with the level and its version', () => {
    const raw = encodeLessonMeta({ level: 3, version: l3.version, seen: ['3:intro:rock'] });
    expect(decodeLessonMeta(raw)).toEqual({ level: 3, version: l3.version, seen: ['3:intro:rock'] });
  });
  it('a broken or foreign value reads as nothing', () => {
    for (const raw of [null, '', '{', '[]', '{"level":"3"}', '{"level":3,"version":1,"seen":[1]}']) expect(decodeLessonMeta(raw)).toBeNull();
  });
  it('resumes only the same level at the same lesson version', () => {
    expect(lessonResumable({ level: 3, version: l3.version, seen: [] }, l3)).toBe(true);
    expect(lessonResumable({ level: 3, version: l3.version + 1, seen: [] }, l3)).toBe(false);
    expect(lessonResumable({ level: 2, version: l3.version, seen: [] }, l3)).toBe(false);
    expect(lessonResumable(null, l3)).toBe(false);
  });
});
