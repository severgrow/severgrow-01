// Level 10, the final lesson, pays 100 Seeds once and its won card explains Seeds and Territory in
// two lines, with the way there (owner, 2026-10-24). The payment itself is the server's: the client
// only sends the replay (server/tests/lesson-seeds.test.ts proves the verifier).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SEEDS_INTRO } from '../src/online/seed-icon.js';
import { FINAL_LESSON } from '../src/lessons/final.js';
import { settledSeedsMessage } from '../src/ui/seed-reveal.js';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const main = read('../src/main.ts');
const html = read('../index.html');
const rewards = read('../src/online/seed-rewards.ts');
const settle = read('../src/online/seed-settle.ts');

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
    expect(settledSeedsMessage({ awarded: 100, reason: null, replayed: true })).toBe('');
    expect(settledSeedsMessage({ awarded: 100, reason: null, replayed: false })).toBe('+100 Seeds');
    expect(main).toMatch(/seedRewardMessage = settledSeedsMessage\(report\.reward\);/);
  });
});

describe('the card never rests on "Seeds pending verification" (owner report, 2026-10-25)', () => {
  it('the string is gone from the product, and a queued proof paints nothing until it is answered', () => {
    // The lie was the resting state: a claim on screen while no receipt existed. Nothing may write it.
    expect(main).not.toContain('Seeds pending verification');
    expect(reveals()).not.toContain('Seeds pending verification');
    // A win queues its proof, clears the line, and only then asks the server.
    const queued = main.slice(main.indexOf('if (proof) {'), main.indexOf('if (proof) {') + 900);
    expect(queued).toContain('queueSeedProof(store, proof);');
    expect(queued).toMatch(/seedRewardMessage = '';/);
    expect(queued).toContain('settleSeedsForCard(key);');
  });

  it('the settle does not depend on the online lobby having mounted', () => {
    // The old call was `onlineLobbyCtl?.syncSeedRewards()`. Optional chaining on a module that had
    // not loaded silently did NOTHING, and the card stayed on "pending" for the session.
    expect(main).not.toMatch(/onlineLobbyCtl\?\.syncSeedRewards/);
    // The settle owns its own client + identity, so it runs from the finish of a game regardless.
    expect(settle).toMatch(/export const settleSeedProof/);
    expect(settle).toMatch(/flushSeedProofs\(seeds\.storage, seeds\.client, status\.identity\.token/);
  });

  it('a bounded deadline and retry exist, so a hung request is a retry, not a wedge', () => {
    expect(rewards).toMatch(/export const SEED_SETTLE_TIMEOUT_MS = 5_000;/);
    expect(rewards).toMatch(/Promise\.race/);
    expect(rewards).toMatch(/controller\?\.abort\(\)/);
    expect(settle).toMatch(/SEED_RETRY_DELAYS_MS/);
    expect(settle).toMatch(/kind: 'deferred' \}/);
    expect(settle).toMatch(/kind: 'unverified'/);
  });
});

/** The reveal module's own source, so "the string is gone" covers the paint path too. */
function reveals(): string {
  return read('../src/ui/seed-reveal.ts');
}

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
