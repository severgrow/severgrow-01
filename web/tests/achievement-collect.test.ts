// THE SHELF: the newly achieved reward, at the top of a full-size achievements sheet, with its seed
// payout and one COLLECT key wearing the game's grow-glow (owner, 2026-11-20).
//
// The owner's words: "find a smart way for extra window or space - maybe replacing the planet view
// and showing there the achievements window same size as planet - with the newly acheived achievement
// showed there ... just make it be dragged onto the section where this achievmeent is with button
// 'COLLECT' by the seed payout with our classic glow".
//
// The decisions pinned here:
//   * a waiting reward is drawn ONCE — on the shelf, never also as a row in its section — so the
//     scroll can not hide the thing you were just told you earned;
//   * the count on each section heading still counts the whole group, shelf rows included;
//   * COLLECT is ONE native <button>: it is reachable by Tab, and Enter/Space work because the
//     browser already does that for a button (there is no drag-only path to the reward);
//   * the glow is drawn once on a still node and only its OPACITY animates (compositor-only), and
//     under reduced motion it is still THERE, simply resting lit;
//   * the payout is the server's: the client posts the claim, never invents a balance.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AchievementView } from '../../server/src/seeds/achievements.js';
import { collectableAchievements, filedAchievements, filedScrollBehavior } from '../src/online/achievement-collect.js';
import { ACHIEVEMENTS_UI } from '../src/online/achievement-copy.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const onlineCss = read('../src/online/online-css.ts');
const worldView = read('../src/online/world-view.ts');
const page = read('../index.html');

/** Every flat rule of a stylesheet, preludes tidied (comments removed, whitespace collapsed). */
const rules = (css: string): { prelude: string; body: string }[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({
      prelude: (m[1] ?? '').slice((m[1] ?? '').lastIndexOf('*/') + 2).replace(/\s+/g, ' ').trim(),
      body: m[2] ?? '',
    }))
    .filter((r) => !r.prelude.startsWith('@') && r.prelude !== '');

const selectorsOf = (prelude: string): string[] => prelude.split(',').map((s) => s.replace(/\s+/g, ' ').trim());
const bodiesOf = (css: string, selector: string): string[] =>
  rules(css).filter((r) => selectorsOf(r.prelude).includes(selector)).map((r) => r.body);
const bodyOf = (css: string, selector: string): string | null => bodiesOf(css, selector)[0] ?? null;
const decl = (body: string, name: string): string => {
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const part of clean.split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0 && part.slice(0, colon).trim() === name) return part.slice(colon + 1).replace(/\s+/g, ' ').trim();
  }
  return '';
};

const view = (over: Partial<AchievementView> = {}): AchievementView => ({
  id: 'roots',
  group: 'territory',
  seeds: 100,
  goal: 1,
  progress: 1,
  done: true,
  claimed: false,
  ...over,
});

const list = (): AchievementView[] => [
  view(),
  view({ id: 'neighbours', goal: 3, progress: 2, done: false }),
  view({ id: 'first-crossing', group: 'duels', done: true, claimed: true }),
  view({ id: 'three-crossings', group: 'duels', seeds: 150 }),
];

describe('the shelf takes the rewards that are waiting, in the server order', () => {
  it('picks done-and-unclaimed only, and never reorders them', () => {
    expect(collectableAchievements(list()).map((v) => v.id)).toEqual(['roots', 'three-crossings']);
    expect(collectableAchievements([])).toEqual([]);
    expect(collectableAchievements([view({ done: false })]), 'not earned yet is not waiting').toEqual([]);
    expect(collectableAchievements([view({ claimed: true })]), 'already paid is not waiting').toEqual([]);
  });

  it('takes exactly those rows out of their sections, and leaves every other row alone', () => {
    const views = list();
    const shelved = collectableAchievements(views);
    const filed = filedAchievements(views, shelved);
    expect(filed.map((v) => v.id)).toEqual(['neighbours', 'first-crossing']);
    // No row is lost and no row is drawn twice.
    expect([...shelved, ...filed].map((v) => v.id).sort()).toEqual(views.map((v) => v.id).sort());
    expect(filedAchievements(views, []), 'without a shelf every row keeps its place').toEqual(views);
  });

  it('sends the collected row back with the class the section already understands', () => {
    // The row is re-rendered from the same list, so "filed back" is the ordinary claimed row; the
    // only thing that changes is that the shelf no longer holds it.
    expect(filedAchievements([view({ claimed: true })], []).map((v) => v.id)).toEqual(['roots']);
  });

  it('brings the filed row into view instantly under reduce motion, smoothly otherwise', () => {
    expect(filedScrollBehavior(true)).toBe('auto');
    expect(filedScrollBehavior(false)).toBe('smooth');
  });
});

describe('the sheet is the Planet-sized surface, not a second screen', () => {
  const sheet = bodyOf(onlineCss, ".world-panel[data-pane='achievements']");

  it('gives the achievements page the whole stage, on the same dialog every key uses', () => {
    expect(sheet, "the achievements sheet rule must exist").not.toBeNull();
    expect(decl(sheet!, 'left')).toBe('10px');
    expect(decl(sheet!, 'right')).toBe('10px');
    expect(decl(sheet!, 'top'), 'it starts under the key row, so MENU and close stay reachable').toBe('62px');
    expect(decl(sheet!, 'bottom')).toBe('10px');
    expect(decl(sheet!, 'width'), 'left+right own the width').toBe('auto');
    expect(decl(sheet!, 'max-height')).toBe('none');
    // The empty drawer keeps its own width: the other pages are untouched.
    const drawer = bodyOf(onlineCss, '.world-panel');
    expect(decl(drawer!, 'width')).toContain('420px');
  });

  it('keeps a reading measure inside it, and lays the shelf out across the space', () => {
    expect(onlineCss).toMatch(/max-width: 760px/);
    const shelf = bodyOf(onlineCss, '.world-achievements-shelf-list');
    expect(shelf, 'the shelf list must exist').not.toBeNull();
    expect(decl(shelf!, 'grid-template-columns')).toContain('auto-fit');
  });

  it('the page markup carries the shelf, above the list, with a live-free heading', () => {
    const shelfAt = page.indexOf('id="world-achievements-shelf"');
    const listAt = page.indexOf('id="online-world-achievements"');
    expect(shelfAt).toBeGreaterThan(-1);
    expect(listAt).toBeGreaterThan(shelfAt);
    expect(page).toContain('id="world-shelf-title"');
    expect(page).toContain('id="online-world-achievements-shelf"');
  });

  it('the view draws a waiting reward on the shelf and files it back afterwards', () => {
    expect(worldView).toContain('collectableAchievements(');
    expect(worldView).toContain('filedAchievements(');
    expect(worldView).toContain('private achievementCard(');
    expect(worldView, 'the count is over the whole group, not the visible rows').toContain('${earned}/${inGroup.length}');
    expect(worldView, 'the collected card is filed into its section').toContain('private revealFiled(');
    expect(worldView).toContain('revealFiled(id)');
  });
});

describe('COLLECT is one honest press', () => {
  it('the owner’s word is the key', () => {
    expect(ACHIEVEMENTS_UI.claim).toBe('COLLECT');
    expect(ACHIEVEMENTS_UI.collectLabel('Put down roots', 100)).toBe('Put down roots: COLLECT 100 Seeds');
    expect(ACHIEVEMENTS_UI.ready(1)).toBe('Ready to collect');
    expect(ACHIEVEMENTS_UI.ready(3)).toBe('3 ready to collect');
  });

  it('the key is a native button, so Tab + Enter/Space reach it without any drag', () => {
    const key = /private collectKey\([\s\S]*?\n  \}/.exec(worldView)?.[0] ?? '';
    expect(key, 'collectKey must exist').not.toBe('');
    expect(key).toContain("document.createElement('button')");
    expect(key).toContain("key.type = 'button'");
    expect(key).toContain('addEventListener(\'click\'');
    // A drag-only reward would be a keyboard dead end; nothing here listens for a gesture.
    expect(key).not.toMatch(/draggable|dragstart|pointerdown|touchstart/);
    expect(worldView).not.toMatch(/dataset\.draggable|setAttribute\('draggable'/);
  });

  it('collects through the server’s own claim, and reports the wallet it answered', () => {
    const collect = /private async collectAchievement\([\s\S]*?\n  \}/.exec(worldView)?.[0] ?? '';
    expect(collect, 'collectAchievement must exist').not.toBe('');
    expect(collect).toContain('this.client.claimAchievement(identity.token, id)');
    expect(collect, 'the balance is the server answer, never a local addition').toContain('this.wallet = claim.wallet');
    expect(collect).not.toMatch(/this\.wallet\.balance\s*\+=/);
    expect(collect, 'the existing polite status line carries the payment').toContain('this.notice(ACHIEVEMENTS_UI.paid(claim.awarded))');
  });
});

describe('the grow-glow on COLLECT', () => {
  const glow = bodyOf(onlineCss, '.world-collect-glow');

  it('is a still halo whose OPACITY alone animates (no shadow or filter animation)', () => {
    expect(glow, '.world-collect-glow must exist').not.toBeNull();
    expect(decl(glow!, 'box-shadow'), 'the halo is drawn once').toMatch(/0 0 18px/);
    expect(decl(glow!, 'animation')).toContain('world-collect-glow');
    const frames = /@keyframes world-collect-glow \{([^}]*\}[^}]*)\}/.exec(onlineCss)?.[1] ?? '';
    expect(frames, 'the keyframes must exist').not.toBe('');
    // Only opacity moves: a filter/box-shadow keyframe would repaint every frame over the map.
    expect(frames).not.toMatch(/filter|box-shadow|blur/);
    expect(frames).toMatch(/opacity/);
    expect(glow!, 'no filter on the glowing node').not.toMatch(/\bfilter\s*:/);
  });

  it('is still THERE under reduced motion — resting lit, not removed', () => {
    const media = /@media \(prefers-reduced-motion: reduce\) \{\s*\.world-collect-glow \{([^}]*)\}/.exec(onlineCss)?.[1] ?? '';
    const app = /html\.reduce-motion \.world-collect-glow \{([^}]*)\}/.exec(onlineCss)?.[1] ?? '';
    expect(media, 'the OS rule must reach the glow').not.toBe('');
    expect(app, 'the in-game Reduce motion rule must reach the glow').not.toBe('');
    for (const body of [media, app]) {
      expect(body).toMatch(/animation:\s*none/);
      expect(body, 'the halo keeps its light').toMatch(/opacity:\s*\.85/);
    }
    // And it is not hidden by the world's blanket reduce-motion rules.
    expect(onlineCss).not.toMatch(/html\.reduce-motion[^{]*\.world-collect-glow[^{]*\{[^}]*display:\s*none/);
  });

  it('sits on a real, focusable key with a visible ring', () => {
    const key = bodyOf(onlineCss, '.world-collect');
    expect(key, '.world-collect must exist').not.toBeNull();
    expect(decl(key!, 'min-height'), 'the 44px touch floor').toBe('44px');
    expect(decl(key!, 'position')).toBe('relative');
    expect(bodyOf(onlineCss, '.world-collect:focus-visible'), 'a keyboard ring').not.toBeNull();
  });
});
