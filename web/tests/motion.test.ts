// Step 7: the motion tokens are one list, the same in the code and in the style sheet.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EASE, MOTION } from '../src/logic/motion.js';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const token = (name: string) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();

describe('motion tokens', () => {
  it('the CSS durations equal the code ones', () => {
    for (const [k, ms] of Object.entries(MOTION)) expect(token(`dur-${k}`), k).toBe(`${ms}ms`);
  });
  it('the CSS easings equal the code ones', () => {
    for (const [k, e] of Object.entries(EASE)) expect(token(`ease-${k}`), k).toBe(e);
  });
  it('four durations, from a tap to an earned moment, each clearly longer than the last', () => {
    const v = Object.values(MOTION);
    for (let i = 1; i < v.length; i++) expect(v[i]!).toBeGreaterThanOrEqual(v[i - 1]! * 1.5);
    expect(MOTION.tap).toBeLessThanOrEqual(100);
  });
});
