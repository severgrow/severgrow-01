// Level 10, the final lesson, pays 100 Seeds once and its won card explains Seeds and Territory in
// two lines, with the way there (owner, 2026-10-24). The payment itself is the server's: the client
// only sends the replay (server/tests/lesson-seeds.test.ts proves the verifier).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SEEDS_INTRO } from '../src/online/seed-icon.js';
import { FINAL_LESSON } from '../src/lessons/final.js';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const main = read('../src/main.ts');
const html = read('../index.html');
const rewards = read('../src/online/seed-rewards.ts');

describe('the final lesson pays Seeds', () => {
  it('a level 10 win sends its replay as `lesson-10`; levels 1-9 send nothing', () => {
    expect(FINAL_LESSON.id).toBe('lesson-10');
    expect(main).toMatch(/const finalLessonWon = lessonNow\?\.level === FINAL_LESSON\.level && p\.after\.result\.winner === HUMAN;/);
    expect(main).toMatch(/levelId: FINAL_LESSON\.id, actions: \[\.\.\.session\.log\]/);
    expect(main).toMatch(/campaignLevel && !lessonNow && !tutorialReplay && p\.after\.result\.winner === HUMAN/);
    expect(main).toMatch(/if \(taught && taught\.level !== FINAL_LESSON\.level\) seedRewardMessage = '';/);
  });
  it('a proof sent before the server knows the lesson is kept, not thrown away', () => {
    // The rule, not the loop variable's name: the queue is drained one entry at a time, so this
    // reads `next` where it once read `proof`. What must hold is that a 400 for a `lesson-` proof
    // whose message says "not available" is KEPT (skipped) rather than deleted.
    expect(rewards).toMatch(/(?:proof|next)\.levelId\.startsWith\('lesson-'\) && \/not available\/i\.test\(error\.message\)/);
    expect(rewards).toMatch(/if \(unknownLesson\) continue;/);
  });
  it('a receipt paid before never shows a second +N', () => {
    expect(main).toMatch(/seedRewardMessage = verified\.replayed \? '' :/);
  });
});

describe('the won card explains Seeds and Territory', () => {
  it('in two lines, with an Open Territory key in place of the second key', () => {
    expect(SEEDS_INTRO.earned).toBe('Seeds are earned by winning.');
    expect(SEEDS_INTRO.spend).toBe('Spend 100 to claim a tile of Territory on the world map.');
    expect(SEEDS_INTRO.open).toBe('Open Territory');
    expect(html).toContain('<p id="go-territory" class="go-territory" hidden>');
    expect(html).toContain('<button id="go-territory-open" class="btn ghost" type="button" hidden>');
    expect(main).toMatch(/const territoryIntro = !!taught && taught\.level === FINAL_LESSON\.level && won/);
    expect(main).toMatch(/other\.hidden = lead === 'back-to-campaign' \|\| lead === 'back-to-tutorial' \|\| territoryIntro;/);
    expect(main).toMatch(/bind\('go-territory-open', \(\) => \{\n  hideGameOver\(\);\n  showScreen\('menu'\);\n  onlineLobbyCtl\?\.openWorld\('menu'\);/);
  });
});
