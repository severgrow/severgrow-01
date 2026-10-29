// HALF-WIDTH ROWS (owner, 2026-10-29: "in 'paused' menu or any similar there should be no orphaned
// single button that's half the width of regular button").
//
// The defect is one CSS shape: a row with a FIXED column count (`1fr 1fr`, `repeat(2, …)`) whose
// children can be `[hidden]`. The hidden child is not painted but its TRACK stays, so the one
// visible key is laid out at half the row — the orphan. It bit the pause plate's pair (measured:
// Main menu 163px in a 334px row in a duel, where Restart is hidden) and the finish card's review
// keys (Back 161px in 330px when "Show me" has nothing to show).
//
// The robust shape is the project's own (`.gm-leads` and `.gm-tools` already used it): derive the
// columns from the row's items with `grid-auto-flow: column` + `grid-auto-columns: 1fr`. Because
// `[hidden]` is `display: none !important`, a hidden child is not an item at all — one visible key
// fills the row, two split it, three split it in three — and no selector has to know the count.
//
// This file guards the SHAPE in the source, so a later "tidy" back to `1fr 1fr` fails `npm run
// check` instead of the next visual pass. `web/e2e/territory-prep.ts` measures the built rows at
// 320x568, 390x844 and 1280x800 in every state the app can actually put them in.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const styleCss = read('../src/style.css');

/** Every flat rule of a stylesheet, preludes tidied (comments removed, whitespace collapsed). */
const rules = (css: string): { prelude: string; body: string }[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({
      prelude: (m[1] ?? '').slice((m[1] ?? '').lastIndexOf('*/') + 2).replace(/\s+/g, ' ').trim(),
      body: m[2] ?? '',
    }))
    .filter((r) => !r.prelude.startsWith('@') && r.prelude !== '');
const selectorsOf = (prelude: string): string[] => prelude.split(',').map((s) => s.replace(/\s+/g, ' ').trim());
/** Every rule whose selector list contains EXACTLY `selector`, joined (a row may be declared twice). */
const rulesFor = (selector: string): string[] =>
  rules(styleCss).filter((r) => selectorsOf(r.prelude).includes(selector)).map((r) => r.body);
const bodyFor = (selector: string): string => rulesFor(selector).join(';');

/** The premise of the whole fix: a hidden child is not painted, and not a grid item either. */
describe('the hidden attribute', () => {
  it('is display:none !important, so a [hidden] child cannot hold a track', () => {
    expect(bodyFor('[hidden]')).toMatch(/display:\s*none\s*!important/);
  });
});

/** Rows whose remaining visible control must never be a fraction of the row. */
const ROWS = [
  '#sheet-menu .gm-pair',
  '#sheet-menu .gm-acts',
  '#sheet-menu .gm-leads',
  '#sheet-menu .gm-tools',
  '.go-review-keys',
];

describe('rows that can lose a child to [hidden]', () => {
  for (const row of ROWS) {
    it(`${row} derives its columns from what is visible`, () => {
      const body = bodyFor(row);
      expect(body, `${row} must exist`).not.toBe('');
      // Either the grid pattern, or a flex row whose children carry their own width (never a fixed
      // column count). Every row above is the grid pattern today; this asserts the intent.
      const autoColumns = /grid-auto-flow:\s*column/.test(body) && /grid-auto-columns:\s*1fr/.test(body);
      const flexible = /display:\s*flex/.test(body);
      expect(autoColumns || flexible, `${row} must not reserve a fixed set of columns`).toBe(true);
      expect(body, `${row} must not declare a fixed column count`).not.toMatch(/grid-template-columns:\s*(1fr 1fr|repeat\()/);
    });
  }

  it('the pause plate needs no :has() guard to size a lone key', () => {
    // The old guards (`:only-of-type`, `:not(:has(… ~ …))`) only ever covered `.gm-acts`, and
    // `:only-of-type` counted HIDDEN buttons too. Widths now come from the items themselves.
    expect(styleCss).not.toMatch(/#sheet-menu \.gm-acts > \.gm-act:not\(\[hidden\]\):only-of-type/);
    expect(styleCss).not.toMatch(/#sheet-menu \.gm-acts[^{]*\{[^}]*grid-column/);
    // An empty row still collapses: the pair and the duel row are both empty in a live duel.
    expect(styleCss).toMatch(/#sheet-menu \.gm-pair:not\(:has\(> \.gm-act:not\(\[hidden\]\)\)\),\s*#sheet-menu \.gm-acts:not\(:has\(> \.gm-act:not\(\[hidden\]\)\)\) \{\s*display: none;/);
  });

  it('the finish card keeps its explicit spans for the full-width keys', () => {
    // `.go-buttons` is a deliberate two-column row whose non-link keys span BOTH columns; only its
    // links pair up. That is a designed layout, not an orphan, and it is measured by the e2e.
    expect(bodyFor('#gameover .go-buttons > .btn:not(.link)')).toContain('grid-column: 1 / -1');
  });
});
