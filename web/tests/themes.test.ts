import { describe, expect, it } from 'vitest';
import { COLOR_TOKENS, STYLE_TOKENS, THEMES, THEME_IDS, DEFAULT_THEME, contrast, resolveColors } from '../src/logic/themes.js';
import type { ColorToken } from '../src/logic/themes.js';
import { CVD_KINDS, deltaE, distinguishReport, simulate } from '../src/logic/colorcheck.js';

const HEX = /^#[0-9a-f]{6}$/i;

describe('palettes (design tokens)', () => {
  it('three palettes on the same screen: Soil, Moss night and Ink', () => {
    expect(THEME_IDS).toEqual(['soil', 'moss', 'ink']);
    expect(THEMES.soil.name).toBe('Soil');
    expect(THEMES.moss.name).toBe('Moss night');
    expect(THEMES.ink.name).toBe('Ink');
    expect(THEME_IDS).toContain(DEFAULT_THEME);
    for (const id of THEME_IDS) expect(THEMES[id].id).toBe(id);
    // Same shapes everywhere: only colours and background treatment change.
    for (const id of THEME_IDS) expect(THEMES[id].style.tileShape).toBe('organic');
  });

  it('every palette defines every token (colours and style)', () => {
    for (const id of THEME_IDS) {
      const t = THEMES[id];
      expect(Object.keys(t.colors).sort()).toEqual([...COLOR_TOKENS].sort());
      expect(Object.keys(t.style).sort()).toEqual([...STYLE_TOKENS].sort());
      for (const v of Object.values(resolveColors(t))) expect(v).toMatch(HEX);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(10);
    }
  });

  it('Soil has texture and spores, Moss night a glow under the board, Ink is flat', () => {
    expect(THEMES.soil.style).toMatchObject({ texture: 'soil', spores: true });
    expect(THEMES.moss.style.boardGlow).toBeGreaterThan(0);
    expect(THEMES.ink.style).toMatchObject({ texture: 'none', spores: false, boardGlow: 0 });
  });

  it('colour roles: mint is you, coral is the bot, the same in all three; buttons are neutral cream; amber only for gold', () => {
    const c = THEME_IDS.map((id) => resolveColors(THEMES[id]));
    for (const x of c) {
      expect(x.you).toBe(c[0]!.you);
      expect(x.bot).toBe(c[0]!.bot);
      // The main button must not use either player's colour or gold.
      for (const k of ['you', 'bot', 'gold'] as const) expect(deltaE(x.accent, x[k]), `accent vs ${k}`).toBeGreaterThan(25);
      // Nothing else may borrow the player or gold colours.
      for (const k of COLOR_TOKENS) {
        if (k === 'you' || k === 'bot' || k === 'gold') continue;
        for (const role of ['you', 'bot', 'gold'] as const) expect(deltaE(x[k], x[role]), `${k} too close to ${role}`).toBeGreaterThan(10);
      }
      // Rock is a cool stone, clearly different from an empty hex.
      expect(deltaE(x.rock, x.hexFill)).toBeGreaterThan(12);
    }
  });

  it('text contrast meets WCAG AA in every palette', () => {
    for (const id of THEME_IDS) {
      const c = resolveColors(THEMES[id]);
      const at = (a: ColorToken, b: ColorToken, min: number) => expect(contrast(c[a], c[b]), `${id}: ${a} on ${b}`).toBeGreaterThanOrEqual(min);
      at('text', 'bg', 7);
      at('text', 'surface', 4.5);
      at('muted', 'bg', 4.5);
      at('muted', 'surface', 4.5);
      at('youInk', 'you', 4.5);
      at('botInk', 'bot', 4.5);
      at('goldInk', 'gold', 4.5);
      at('accentInk', 'accent', 4.5);
      for (const s of ['dew', 'ash', 'moss', 'ember'] as const) at(s, 'card', 4.5); // suit numbers on cards
      // Board shapes stand out (non-text contrast, 3:1).
      at('you', 'hexFill', 3);
      at('bot', 'hexFill', 3);
      at('gold', 'hexFill', 3);
      at('danger', 'bg', 3);
    }
  });

  it('the four suits and the two players stay apart under colour-blind simulation', () => {
    for (const id of THEME_IDS) {
      const r = distinguishReport(resolveColors(THEMES[id]));
      for (const k of ['normal', ...CVD_KINDS] as const) expect(r[k].min, `${id} ${k}: ${r[k].pair}`).toBeGreaterThanOrEqual(12);
    }
  });

  it('the two players also differ by shape and pattern, not only colour', () => {
    for (const id of THEME_IDS) {
      const s = THEMES[id].style;
      expect(s.youMark).not.toBe(s.botMark);
      expect(s.youFill).not.toBe(s.botFill);
    }
  });

  it('helpers: WCAG contrast and colour-blind simulation behave', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(deltaE('#336699', '#336699')).toBe(0);
    // Pure red and green collapse for red-green colour blindness, not for blue-yellow.
    expect(deltaE(simulate('#d03030', 'deuteranopia'), simulate('#30a030', 'deuteranopia'))).toBeLessThan(deltaE('#d03030', '#30a030') / 2);
    expect(simulate('#808080', 'tritanopia')).toMatch(HEX);
  });
});
