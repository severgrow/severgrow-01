import { describe, expect, it } from 'vitest';
import { COLOR_TOKENS, STYLE_TOKENS, THEMES, THEME_IDS, contrast, resolveColors } from '../src/logic/themes.js';

const HEX = /^#[0-9a-f]{6}$/i;

describe('themes (design tokens)', () => {
  it('there are exactly three themes: ink, nature, tabletop', () => {
    expect(THEME_IDS).toEqual(['ink', 'nature', 'tabletop']);
    for (const id of THEME_IDS) expect(THEMES[id].id).toBe(id);
  });

  it('every theme defines every token (colours and style)', () => {
    for (const id of THEME_IDS) {
      const t = THEMES[id];
      for (const k of COLOR_TOKENS) expect(t.colors[k], `${id}.${k}`).toBeDefined();
      for (const k of STYLE_TOKENS) expect(t.style[k], `${id}.${k}`).toBeDefined();
      expect(Object.keys(t.colors).sort()).toEqual([...COLOR_TOKENS].sort());
      expect(Object.keys(t.style).sort()).toEqual([...STYLE_TOKENS].sort());
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(10);
    }
  });

  it('each theme uses at most 5 palette colours and one typeface; every colour comes from the palette', () => {
    for (const id of THEME_IDS) {
      const t = THEMES[id];
      expect(t.palette.length).toBeLessThanOrEqual(5);
      for (const p of t.palette) expect(p).toMatch(HEX);
      expect(typeof t.style.font).toBe('string');
      for (const ref of Object.values(t.colors)) {
        const idx = typeof ref === 'number' ? [ref] : [ref.mix[0], ref.mix[1]];
        for (const i of idx) expect(t.palette[i], `${id} palette index ${i}`).toBeDefined();
      }
      for (const v of Object.values(resolveColors(t))) expect(v).toMatch(HEX);
    }
  });

  it('text is readable (WCAG contrast) in every theme', () => {
    for (const id of THEME_IDS) {
      const c = resolveColors(THEMES[id]);
      const at = (a: string, b: string, min: number) => expect(contrast(c[a]!, c[b]!), `${id}: ${a} on ${b}`).toBeGreaterThanOrEqual(min);
      at('text', 'bg', 7);
      at('text', 'surface', 4.5);
      at('muted', 'bg', 4.5);
      at('muted', 'surface', 4.5);
      at('youInk', 'you', 4.5);
      at('botInk', 'bot', 4.5);
      at('accentInk', 'accent', 4.5);
      // Board shapes stand out from empty hexes (non-text contrast).
      at('you', 'hexFill', 3);
      at('bot', 'hexFill', 3);
      at('gold', 'hexFill', 3);
      at('danger', 'bg', 3);
    }
  });

  it('the two players differ by shape or pattern, not only colour', () => {
    for (const id of THEME_IDS) {
      const s = THEMES[id].style;
      expect(s.youMark).not.toBe(s.botMark);
      expect(s.youFill).not.toBe(s.botFill);
    }
  });

  it('contrast() follows the WCAG formula', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});
