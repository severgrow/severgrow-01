// THE CAMPAIGN'S SUGGESTION (owner, 2026-11-02): a slight cream halo on PLAY and LEVEL <n>.
//
// Owner's words: "make slight glow cream around the play and level 1 so its suggestive". It replaces
// the ten first-run lamps (same day: "nah remove that"), so these tests pin the replacement:
//
//   1. ONE predicate: on while the ten lessons are unfinished, off for ever once c1-10 is cleared on
//      the device OR the account — and untouched by replays, practice and online duels;
//   2. the paint is one class on two keys inside the menu's own pass — no lamp strip, no count, no
//      storage key, no timer, no request, and the PLAY key's spoken line is just "Play";
//   3. the halo is a STATIC `box-shadow` on a `::after`, never a `filter` on the key, with no
//      keyframe and no transition, so Reduce motion has no movement to remove;
//   4. the menu keys wear the dark glass the owner pointed at, in the shorthand form that wins.
// The computed material and the live halo are measured in web/e2e/menu-suggestion.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_CHAPTERS } from '../../src/campaign/index.js';
import { MENU } from '../../src/strings.js';
import { freshProgress } from '../src/logic/campaign.js';
import { campaignSuggested, installMenuSuggestion } from '../src/menu/suggestion.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../index.html');
const mainSource = read('../src/main.ts');
const moduleSource = read('../src/menu/suggestion.ts');
const styleCss = read('../src/style.css');

const progress = (completed: string[]) => ({ ...freshProgress(), completed });
const C1 = ['c1-01', 'c1-02', 'c1-03', 'c1-04', 'c1-05', 'c1-06', 'c1-07', 'c1-08', 'c1-09', 'c1-10'];

/** Just enough DOM for the installer: two ids, one class each. */
const fakeDoc = () => {
  const key = () => {
    const classes = new Set<string>();
    return {
      classes,
      classList: {
        toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
      },
    };
  };
  const play = key();
  const level = key();
  const doc = { getElementById: (id: string) => (id === 'menu-play' ? play : id === 'menu-campaign' ? level : null) };
  return { doc: doc as unknown as Document, play, level };
};

describe('the ten lessons are chapter one, and the halo lives until the tenth is cleared', () => {
  it('covers campaign levels 1-10, ending at c1-10', () => {
    const chapter = CAMPAIGN_CHAPTERS.find((c) => c.number === 1)!;
    expect(chapter.levels.map((l) => l.id)).toEqual(C1);
  });

  it('is on for a fresh player and stays on through the first nine', () => {
    expect(campaignSuggested(freshProgress())).toBe(true);
    expect(campaignSuggested(progress(['c1-01']))).toBe(true);
    expect(campaignSuggested(progress(C1.slice(0, 9)))).toBe(true);
    // A gap in the record cannot convince it the campaign is under way.
    expect(campaignSuggested(progress(['c1-02', 'c1-05']))).toBe(true);
  });

  it('goes once c1-10 is cleared, and cannot come back from another mode', () => {
    expect(campaignSuggested(progress(C1))).toBe(false);
    expect(campaignSuggested(progress(['c1-10']))).toBe(false);
    // Reading only `completed` is what keeps a replay/practice/online result from reviving it.
    expect(moduleSource).not.toMatch(/\.unlocked\b/);
    expect(moduleSource).not.toMatch(/\.best\b/);
    expect(moduleSource).not.toContain('online/');
  });

  it('unions the signed-in account: a new phone does not suggest what it has done', () => {
    expect(campaignSuggested(freshProgress(), null)).toBe(true);
    expect(campaignSuggested(freshProgress(), [])).toBe(true);
    expect(campaignSuggested(freshProgress(), [1, 2, 3])).toBe(true);
    expect(campaignSuggested(freshProgress(), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(false);
    expect(campaignSuggested(freshProgress(), [10])).toBe(false);
    expect(campaignSuggested(progress(C1.slice(0, 5)), [6, 7, 8, 9, 10])).toBe(false);
    // Device clears count just the same when the account has not answered.
    expect(campaignSuggested(progress(C1), undefined)).toBe(false);
  });
});

describe('the paint is one class on the two keys, in the menu’s own pass', () => {
  it('puts `suggest` on PLAY and on the LEVEL key, and takes it off again', () => {
    const { doc, play, level } = fakeDoc();
    const ui = installMenuSuggestion(doc);
    ui.paint(freshProgress());
    expect([...play.classes]).toEqual(['suggest']);
    expect([...level.classes]).toEqual(['suggest']);
    ui.paint(progress(C1));
    expect([...play.classes]).toEqual([]);
    expect([...level.classes]).toEqual([]);
  });

  it('a failed or not-yet-answered account read leaves the device rule exactly as it is', () => {
    const { doc, play, level } = fakeDoc();
    const ui = installMenuSuggestion(doc);
    ui.paint(progress(['c1-01', 'c1-04']));
    for (const account of [null, undefined, [] as number[]]) {
      ui.paint(progress(['c1-01', 'c1-04']), account);
      expect([...play.classes]).toEqual(['suggest']);
      expect([...level.classes]).toEqual(['suggest']);
    }
  });

  it('starts no timer, starts no loop, reads no network and writes no storage', () => {
    expect(moduleSource).not.toMatch(/setInterval|setTimeout|requestAnimationFrame|\.animate\(/);
    expect(moduleSource).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|\.then\(/);
    expect(moduleSource).not.toMatch(/localStorage|sessionStorage|browserStorage|IndexedDB/);
  });

  it('is painted in the menu pass, built once, and the pass stays synchronous', () => {
    const start = mainSource.indexOf('function layoutMenu(');
    const body = mainSource.slice(start, mainSource.indexOf('\nfunction showScreen(', start));
    expect(body).toContain('menuSuggestion.paint(campaignProgress, accountClears)');
    expect(body).not.toMatch(/\bawait\b|fetch\(/);
    expect(mainSource.match(/installMenuSuggestion\(\)/g)).toHaveLength(1);
  });

  it('the PLAY key speaks just its word — the lesson count is gone', () => {
    const start = mainSource.indexOf("$('menu-play').hidden");
    const play = mainSource.slice(start, mainSource.indexOf("$('play-title')", start));
    expect(play).toContain("$('menu-play').setAttribute('aria-label', MENU.play)");
    expect(play).not.toContain('lessonsCompleted');
    // The key's markup ships the plain label too, with no lamp strip to describe.
    const markup = html.slice(html.indexOf('id="menu-play"'), html.indexOf('id="menu-continue"'));
    expect(markup).toContain('aria-label="Play"');
    expect(markup).not.toContain('menu-play-lessons');
    expect(html).not.toContain('menu-play-lessons');
  });

  it('the removed feature left no trace in the source tree', () => {
    expect(mainSource).not.toContain('firstRunLamps');
    expect(mainSource).not.toContain('installFirstRunLamps');
    expect(styleCss).not.toContain('menu-play-lessons');
  });
});

describe('the halo is a static box-shadow, never a filter and never a loop', () => {
  /** The declarations of the rule that starts at `anchor` (the suggestion blocks are named exactly). */
  const ruleAt = (anchor: string): string => {
    const open = styleCss.indexOf('{', styleCss.indexOf(anchor));
    return open < 0 ? '' : styleCss.slice(open + 1, styleCss.indexOf('}', open));
  };
  const keyBlock = ruleAt('#menu .menu-buttons > .btn.suggest,\n#play-menu .menu-buttons > .btn.suggest {');
  const glowBlock = ruleAt('#menu .menu-buttons > .btn.suggest::after,');

  it('is the key’s own cream, on a ::after halo that cannot eat a tap', () => {
    expect(keyBlock).not.toBe('');
    expect(glowBlock).not.toBe('');
    expect(glowBlock).toContain('box-shadow');
    expect(glowBlock).toContain('var(--fu-cream)');
    expect(glowBlock).toContain('pointer-events: none');
    // Wide and faint: the owner's "slight", not a ring and not a neon edge.
    expect(glowBlock).toMatch(/0 0 16px 3px/);
    expect(glowBlock).not.toMatch(/filter:/);
    expect(glowBlock).toMatch(/animation:\s*none/);
    expect(glowBlock).not.toMatch(/animation-name:|transition:|@keyframes/);
  });

  it('adds no movement at all, so Reduce motion has nothing to remove', () => {
    expect(keyBlock).toMatch(/animation:\s*none/);
    expect(keyBlock).toMatch(/transition:\s*none/);
    // No keyframe is declared for the suggestion anywhere in the sheet.
    expect(styleCss).not.toMatch(/@keyframes\s+[\w-]*suggest/);
  });

  it('covers PLAY on the menu and the LEVEL key in the PLAY submenu', () => {
    expect(styleCss).toContain('#menu .menu-buttons > .btn.suggest');
    expect(styleCss).toContain('#play-menu .menu-buttons > .btn.suggest');
  });
});

describe('the menu keys wear the PLAY submenu’s dark glass', () => {
  const glass = /#menu \.menu-buttons > \.btn:not\(\.primary\)[^{]*\{([^}]*)\}/.exec(styleCss)?.[1] ?? '';

  it('sets the shared dark-glass pair on both menus, in the shorthand that wins', () => {
    expect(glass).toContain('background: var(--dark-glass)');
    expect(glass).toContain('backdrop-filter: var(--dark-glass-blur)');
    const submenu = /#play-menu \.menu-buttons > \.btn:not\(\.primary\)[^{]*\{([^}]*)\}/.exec(styleCss)?.[1] ?? '';
    expect(submenu).toContain('background: var(--dark-glass)');
    expect(submenu).toContain('backdrop-filter: var(--dark-glass-blur)');
  });

  it('replaces 65f4257f’s opaque fill instead of layering over it', () => {
    expect(styleCss).not.toContain('background: var(--c-bg) !important');
    expect(styleCss).not.toMatch(/#menu\[data-living-world\][^{]*\.btn[^{]*\{[^}]*background/);
  });

  it('keeps PLAY cream (the one distinct key)', () => {
    expect(styleCss).toMatch(/\.menu-buttons \.btn\.primary,[\s\S]{0,120}background: var\(--fu-cream\)/);
  });

  it('places the glass rule after `.btn.ghost`, so the shorthand is not reset', () => {
    const ghostAt = styleCss.indexOf('.btn.ghost {\n  background: color-mix');
    const glassAt = styleCss.indexOf('#menu .menu-buttons > .btn:not(.primary)');
    expect(ghostAt).toBeGreaterThan(0);
    expect(glassAt).toBeGreaterThan(ghostAt);
  });
});

describe('the suggestion did not disturb the menu’s spoken words', () => {
  it('MENU.play is still the plain word', () => {
    expect(MENU.play).toBe('Play');
  });
});
