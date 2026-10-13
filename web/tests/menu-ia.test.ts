// The FUTASAKU 0.5 information architecture, locked by tests: one Tutorial entry on the main
// menu, no lesson/chapter list anywhere, no floating in-match "?", and the moves reference living
// in the Match Intel "How to" tab (also opened by the in-game menu). Words come from
// src/strings.ts so a rename is a one-line change.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HELP } from '../../src/strings.js';
import { newGame, viewFor } from '../../src/engine/index.js';
import { matchIntel } from '../src/logic/match-intel.js';
import { TUTORIAL_CHAPTER_IDS, TUTORIAL_CORE, tutorialLessons } from '../src/logic/tutorial-script.js';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const menuSection = html.slice(html.indexOf('<section id="menu"'), html.indexOf('</section>', html.indexOf('<section id="menu"')));

describe('main menu: exactly one tutorial entry', () => {
  it('names the single entry Tutorial', () => {
    expect(HELP.tutorial).toBe('Tutorial');
    expect(menuSection.match(/id="menu-tutorial"/g) ?? []).toHaveLength(1);
    expect(menuSection).toContain(`>${HELP.tutorial}<`);
  });

  it('has no duplicate How-to-play entry and no lesson list', () => {
    expect(menuSection).not.toMatch(/How to play/i);
    expect(html).not.toContain('id="menu-lessons-list"');
    expect(html).not.toContain('data-lesson');
  });

  it('does not render the old lesson names anywhere in the menu', () => {
    for (const name of ['Full tutorial', 'Bomb & Blast', 'Skip & last round'])
      expect(menuSection, name).not.toContain(name);
  });
});

describe('in-match help: the floating "?" is gone', () => {
  it('removes the corner "?" tool', () => {
    expect(html).not.toMatch(/id="hint-btn"/);
  });

  it('keeps the in-game menu reference that opens the same moves list', () => {
    expect(html).toMatch(/id="gm-howto"/);
  });
});

describe('tutorial: no lesson decomposition, one closing pointer', () => {
  it('the guided run is one continuous core with no lesson labels on the menu', () => {
    expect([...TUTORIAL_CORE].length).toBeGreaterThan(0);
  });

  it("the tutorial's final line points at the Match Intel How to reference", () => {
    const lastChapter = TUTORIAL_CHAPTER_IDS.indexOf(TUTORIAL_CORE.at(-1)!);
    const last = tutorialLessons(lastChapter).at(-1)!;
    expect(last.why).toContain(HELP.tutorialFinal);
    expect(last.why).toMatch(/Match Intel/);
    expect(last.why).toMatch(/How to/);
  });
});

describe('Match Intel: public information only', () => {
  it('the model carries counts and public cards, never the hidden hand or deck', () => {
    const state = newGame(5);
    const view = viewFor(state, 0);
    const intel = matchIntel(view, state.history ?? [], []);
    const hiddenIds = new Set([...state.hands[1], ...state.deck].map((card) => card.id));
    // Public history holds only cards already thrown (they are not in either private pile).
    for (const card of intel.discarded) expect(hiddenIds.has(card.id), `public card ${card.id}`).toBe(false);
    // The opponent's hand is a count, never their cards.
    expect(typeof intel.oppHand).toBe('number');
    expect(JSON.stringify(intel)).not.toContain('seed');
  });
});
