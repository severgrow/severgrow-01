// A throw lands on the pile, clicks to that pile's own size, then fades. The fade used to start
// while the card was still a hair small, so the landing never quite clicked and the card under it
// could flash. The .68 mark stays the moment the real pile top may change.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THROW_PILE, throwPileFrames } from '../src/ui/effects.js';

const effects = readFileSync(fileURLToPath(new URL('../src/ui/effects.ts', import.meta.url)), 'utf8');

describe('a throw settles onto the pile', () => {
  // OWNER CHANGED THE RULE (2026-11-10): the card covers the old one as it lands - no fade.
  it('is a hair small on approach, then the pile\'s own size, and stays fully visible', () => {
    const sc = 0.5;
    const frames = throwPileFrames(10, 20, sc);
    expect(frames[2]?.offset).toBe(THROW_PILE.landAt);
    expect(frames[2]?.opacity).toBe(1);
    expect(String(frames[2]?.transform)).toContain(`scale(${sc * THROW_PILE.approach})`);
    expect(frames[3]?.offset).toBe(THROW_PILE.clickAt);
    expect(String(frames[3]?.transform)).toContain(`scale(${sc * THROW_PILE.click})`);
    const seated = frames[4];
    expect(seated?.offset).toBe(THROW_PILE.seatedAt);
    expect(seated?.opacity).toBe(1);
    expect(String(seated?.transform)).toContain(`scale(${sc})`);
    expect(frames[5]?.opacity).toBe(1);
    expect(String(frames[5]?.transform)).toContain(`scale(${sc})`);
    expect(frames.every((k) => k.opacity === 1)).toBe(true);
  });

  it('keeps the pile change on the .68 mark and the flight on the shared out curve', () => {
    expect(THROW_PILE.landAt).toBe(0.68);
    expect(effects).toMatch(/setTimeout\(onLand, duration \* THROW_PILE\.landAt\)/);
    expect(effects).toMatch(/easing: IS_FUTA04 \? EASE\.out : 'ease-in-out'/);
    expect(effects).toMatch(/PINNED\.throwFlight/);
  });
});
