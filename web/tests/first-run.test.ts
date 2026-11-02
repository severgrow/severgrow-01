// THE FIRST-RUN NUDGE (owner brief, 2026-11-01): ten lamps on the PLAY key, one per lesson.
//
// "futasaku style indicator that levels 1-10 are suggested to complete before doing anything else ..
//  dissapers when level 10 cleared".
//
// These tests pin the whole feature without a browser:
//   1. ONE predicate, decided from `completed` alone — visible until the tenth lesson is cleared,
//      counting partial progress, and unmoved by a replay, a practice match or an online duel;
//   2. the paint is a `hidden` flag and one class per lamp — no storage key, no timer, no request,
//      driven from the menu's own layout pass;
//   3. the markup keeps it INSIDE the PLAY key and out of the tab order, and the CSS keeps it out of
//      the layout (absolute, pointer-events:none), so the pinned key spacing cannot move.
// The live geometry and the real taps are measured by web/e2e/first-run.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_CHAPTERS, recordCampaignResult } from '../../src/campaign/index.js';
import { CAMPAIGN, MENU } from '../../src/strings.js';
import {
  freshProgress,
  parseProgress,
  progressAfterMatch,
} from '../src/logic/campaign.js';
import { firstRun, installFirstRunLamps } from '../src/menu/first-run.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../index.html');
const mainSource = read('../src/main.ts');
const moduleSource = read('../src/menu/first-run.ts');
const styleCss = read('../src/style.css');
const menuSection = html.slice(html.indexOf('<section id="menu"'), html.indexOf('</section>', html.indexOf('<section id="menu"')));

const progress = (completed: string[]) => ({ ...freshProgress(), completed });
const C1 = ['c1-01', 'c1-02', 'c1-03', 'c1-04', 'c1-05', 'c1-06', 'c1-07', 'c1-08', 'c1-09', 'c1-10'];

describe('the ten lamps are the ten lessons of chapter 1', () => {
  it('is exactly the ten campaign levels of chapter one, ending at c1-10', () => {
    const chapter = CAMPAIGN_CHAPTERS.find((c) => c.number === 1)!;
    expect(chapter.levels.map((l) => l.id)).toEqual(C1);
    // The predicate agrees with the level data, so the strip can never claim a different count.
    expect(firstRun(progress([]))!.total).toBe(10);
    expect(firstRun(progress(C1.slice(0, 9)))!.total).toBe(10);
  });
});

describe('one gate: visible while the ten are unfinished, gone once they are', () => {
  it('shows a fresh player ten empty lamps', () => {
    expect(firstRun(freshProgress())).toEqual({ lit: 0, total: 10 });
  });

  it('counts the lessons actually cleared, not the furthest unlocked', () => {
    expect(firstRun(progress(['c1-01']))!.lit).toBe(1);
    expect(firstRun(progress(['c1-01', 'c1-02', 'c1-03']))!.lit).toBe(3);
    expect(firstRun(progress(C1.slice(0, 9)))!.lit).toBe(9);
    // A gap cannot inflate the count: only ids that are really in the record are lit.
    expect(firstRun(progress(['c1-01', 'c1-05']))!.lit).toBe(2);
  });

  it('is gone for good once c1-10 is in completed', () => {
    expect(firstRun(progress(C1))).toBeNull();
    // c1-10 is the marker on its own: levels unlock in order, so it means the ten are done.
    expect(firstRun(progress(['c1-10']))).toBeNull();
    // And a record that merely CLAIMS the progress (an unlocked counter) never outranks the list.
    const claimed = parseProgress(JSON.stringify({ version: 1, unlocked: 11, completed: [], best: {} }));
    expect(firstRun(claimed)).toEqual({ lit: 0, total: 10 });
  });
});

describe('nothing outside the campaign moves it', () => {
  it('a replay of a lesson already cleared leaves the strip exactly as it was', () => {
    const before = progress(['c1-01', 'c1-02']);
    const after = recordCampaignResult(before, { id: 'c1-02', number: 2 }, { won: true, score: 9, turns: 12 });
    expect(firstRun(after)).toEqual(firstRun(before));
  });

  it('replaying lesson 10 after it was cleared cannot bring the strip back', () => {
    const done = progress(C1);
    const replay = recordCampaignResult(done, { id: 'c1-10', number: 10 }, { won: true, score: 9, turns: 12 });
    expect(firstRun(replay)).toBeNull();
  });

  it('a tutorial (practice) replay writes no campaign record, so the count does not move', () => {
    const before = progress(['c1-01']);
    const after = progressAfterMatch(before, 'tutorial', { id: 'c1-04', number: 4 }, { won: true, score: 7, turns: 10 });
    expect(after).toBe(before);
    expect(firstRun(after)).toEqual(firstRun(before));
  });

  it('reads `completed` and nothing else, so an online duel has nothing to write', () => {
    // The predicate is typed on `completed` ALONE and the module never names the other fields; an
    // online duel updates the server row and the local win record, never campaign progress.
    expect(moduleSource).not.toMatch(/\.unlocked\b/);
    expect(moduleSource).not.toMatch(/\.best\b/);
    expect(moduleSource).not.toContain('online/');
  });
});

describe('the paint is one read and one apply — no storage key, no timer, no request', () => {
  it('starts no timer, starts no loop, and reads no network', () => {
    expect(moduleSource).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
    expect(moduleSource).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|\.then\(/);
  });

  it('adds no storage key: it writes none and reads none', () => {
    expect(moduleSource).not.toMatch(/localStorage|sessionStorage|browserStorage|IndexedDB|STORAGE/);
    // The only save the menu reads for it is the campaign progress main.ts already holds.
    expect(mainSource).toContain('firstRunLamps.paint(campaignProgress)');
  });

  it('is painted in the menu’s own layout pass, from the record that pass already reads', () => {
    const start = mainSource.indexOf('function layoutMenu(');
    const body = mainSource.slice(start, mainSource.indexOf('\nfunction showScreen(', start));
    expect(body).toContain('firstRunLamps.paint(campaignProgress)');
    // The menu pass must stay synchronous: no network, no await (menu-first-paint.test.ts).
    expect(body).not.toMatch(/\bawait\b|fetch\(/);
    // Built once at module scope, so a menu pass never rebuilds the DOM.
    expect(mainSource.match(/installFirstRunLamps\(\)/g)).toHaveLength(1);
  });

  it('paints the count into the lamp classes, and the PLAY key speaks it', () => {
    const { doc, key, strip } = fakeDoc();
    const ui = installFirstRunLamps(doc);
    ui.paint(freshProgress());
    expect(strip.hidden).toBe(false);
    expect(strip.children).toHaveLength(10);
    expect(litCount(strip)).toBe(0);
    expect(key.attributes['aria-label']).toBe(`${MENU.play}. ${CAMPAIGN.lessonsCompleted(0, 10)}`);
    ui.paint(progress(['c1-01', 'c1-02', 'c1-03']));
    expect(litCount(strip)).toBe(3);
    expect(key.attributes['aria-label']).toBe(`${MENU.play}. ${CAMPAIGN.lessonsCompleted(3, 10)}`);
    // Backwards can happen (an account raise, a cleared device): the lamps simply re-read.
    ui.paint(freshProgress());
    expect(litCount(strip)).toBe(0);
    // The tenth lesson: the strip leaves, and the key is just PLAY again.
    ui.paint(progress(C1));
    expect(strip.hidden).toBe(true);
    expect(key.attributes['aria-label']).toBe(MENU.play);
  });
});

describe('the markup and CSS keep it inside the key, out of the layout and out of the tab order', () => {
  it('is a child of the PLAY key, shipped hidden and silent', () => {
    const play = menuSection.slice(menuSection.indexOf('id="menu-play"'), menuSection.indexOf('id="menu-continue"'));
    expect(play).toContain('id="menu-play-lessons"');
    expect(play).toMatch(/id="menu-play-lessons"[^>]*hidden/);
    expect(play).toMatch(/id="menu-play-lessons"[^>]*aria-hidden="true"/);
    // Decoration, never a control: no tab stop, no role, no label of its own.
    expect(play).not.toMatch(/id="menu-play-lessons"[^>]*tabindex/);
    expect(play).not.toMatch(/id="menu-play-lessons"[^>]*role=/);
  });

  it('writes the key’s word into its own node, so a layout pass cannot wipe the lamps', () => {
    expect(mainSource).toContain("$('menu-play-label').textContent = MENU.play");
    expect(mainSource).not.toContain("$('menu-play').textContent = MENU.play");
  });

  it('takes no space: absolute on the key’s lower bezel, and it can never eat a tap', () => {
    const rule = /\.menu-play-lessons \{([^}]*)\}/.exec(styleCss)?.[1] ?? '';
    expect(rule).toMatch(/position: absolute/);
    expect(rule).toMatch(/pointer-events: none/);
    expect(rule).toMatch(/bottom: \d+px/);
    // It must carry no height of its own that could stretch the 50px key.
    expect(rule).not.toMatch(/(^|;)\s*(height|min-height)\s*:/);
    expect(styleCss).toMatch(/#menu #menu-play \{ position: relative; \}/);
    expect(styleCss).toMatch(/#menu \.menu-buttons \.btn,\s*#menu \.menu-footer \.btn,\s*#play-menu \.menu-buttons \.btn \{\s*min-height: var\(--menu-key-h\);\s*height: var\(--menu-key-h\);/);
  });

  it('draws the lamps in the key’s own ink: a ring when open, filled when cleared', () => {
    const lamp = /\.menu-play-lessons > i \{([^}]*)\}/.exec(styleCss)?.[1] ?? '';
    expect(lamp).toMatch(/border-radius: 50%/);
    expect(lamp).toMatch(/border: 1px solid/);
    const on = /\.menu-play-lessons > i\.on \{([^}]*)\}/.exec(styleCss)?.[1] ?? '';
    expect(on).toMatch(/background: var\(--fu-ink\)/);
    // No new colour language: no gold, no glow, no gradient on the strip.
    expect(styleCss).not.toMatch(/\.menu-play-lessons[^{]*\{[^}]*(gradient|box-shadow)/);
  });
});

type FakeEl = {
  classList: { toggle(name: string, on?: boolean): void; has(name: string): boolean };
  hidden: boolean;
  attributes: Record<string, string>;
  children: FakeEl[];
  readonly childElementCount: number;
  replaceChildren(...nodes: FakeEl[]): void;
  setAttribute(name: string, value: string): void;
};

/** The lit lamps, read from the fake strip exactly as the browser test reads the real one. */
const litCount = (strip: FakeEl) => strip.children.filter((lamp) => lamp.classList.has('on')).length;

/**
 * A DOM stub with just the four things the painter touches: two ids, child creation, class toggling
 * and attributes. Keeps this a node test while still exercising the real paint (not the source text).
 */
function fakeDoc() {
  const make = (): FakeEl => {
    const on = new Set<string>();
    const el: FakeEl = {
      classList: {
        toggle: (name, force) => { if (force) on.add(name); else on.delete(name); },
        has: (name) => on.has(name),
      },
      hidden: false,
      attributes: {},
      children: [],
      get childElementCount() { return el.children.length; },
      replaceChildren: (...nodes) => { el.children = nodes; },
      setAttribute: (name, value) => { el.attributes[name] = value; },
    };
    return el;
  };
  const key = make();
  const strip = make();
  const doc = {
    getElementById: (id: string) => (id === 'menu-play' ? key : id === 'menu-play-lessons' ? strip : null),
    createElement: () => make(),
  };
  return { doc: doc as unknown as Document, key, strip };
}
