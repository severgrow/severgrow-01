// Centred menus (owner, 2026-10-24: "everything should be centered here and in any similar menus").
// The finish card, the pause panel's turn line and every sheet title sit on the centre line; the
// last word in the stylesheet says so, after every older left-aligned rule.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../src/style.css', import.meta.url)), 'utf8');
const tail = css.slice(css.indexOf('/* CENTRED MENUS'));

describe('centred menus', () => {
  it('the finish card centres its words, its score and every key', () => {
    expect(tail).toMatch(/#gameover :is\(\.go-context, \.go-title, \.go-sub, \.go-learned, \.go-reason, \.go-review-face\) \{\n  text-align: center;/);
    expect(tail).toMatch(/#gameover \.go-score \{ justify-content: center; \}/);
    expect(tail).toMatch(/#gameover \.go-buttons \.btn \{ justify-content: center; text-align: center; \}/);
    expect(tail).toMatch(/#gameover\.won \.go-title::after \{ margin-inline: auto; \}/);
  });
  it('the pause turn line and every sheet title centre; the close key stays at the edge', () => {
    expect(tail).toMatch(/#sheet-menu \.gm-turn \{[^}]*align-items: center;[^}]*text-align: center;/);
    expect(tail).toMatch(/\.sheet \.sheet-head > h2 \{[^}]*text-align: center;/);
    expect(tail).toMatch(/\.sheet \.sheet-head > \.icon-only:last-child \{ position: absolute; right: 0;/);
  });
  it('nothing after it puts them back on the left', () => {
    expect(tail).not.toMatch(/text-align: left|justify-content: flex-start/);
  });
});
