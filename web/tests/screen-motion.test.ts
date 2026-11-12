// WHICH WAY A SCREEN ARRIVES — the one new decision of 2026-11-02's motion pass.
//
// `interface-motion.test.ts` pins the vocabulary. This test pins the CARTOGRAPHY: depth is the only
// thing that decides a direction, the game never travels, and Reduce motion (or a boot with nothing
// behind it) is not an animation at all. It is pure — no DOM is created here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INTERFACE_MOTION } from '../src/ui/interface-motion.js';
import { SCREEN_RANK, screenArrival } from '../src/ui/screen-motion.js';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const main = read('../src/main.ts');

describe('a screen change has a direction', () => {
  it('a forward move rises from below, the way back drops from above', () => {
    const forward = screenArrival('menu', 'play');
    const back = screenArrival('play', 'menu');
    expect(forward.direction).toBe('forward');
    expect(back.direction).toBe('back');
    expect(forward.travel).toBe(INTERFACE_MOTION.screen);
    expect(back.travel).toBe(-INTERFACE_MOTION.screen);
    // the head lands one short beat later, travelling the small distance
    expect(forward.stagger).toBe(INTERFACE_MOTION.stagger);
    expect(forward.head).toBe(INTERFACE_MOTION.travel);
    expect(back.head).toBe(-INTERFACE_MOTION.travel);
    expect(forward.duration).toBe(INTERFACE_MOTION.open);
    expect(back.duration).toBe(INTERFACE_MOTION.open);
  });

  it('depth alone decides it: menu -> PLAY -> level picker -> chapter list is forward, all the way back', () => {
    expect(SCREEN_RANK.menu).toBeLessThan(SCREEN_RANK.play);
    expect(SCREEN_RANK.play).toBeLessThan(SCREEN_RANK.levels);
    expect(SCREEN_RANK.levels).toBeLessThan(SCREEN_RANK.campaign);
    expect(screenArrival('play', 'levels').direction).toBe('forward');
    expect(screenArrival('levels', 'campaign').direction).toBe('forward');
    expect(screenArrival('campaign', 'levels').direction).toBe('back');
    expect(screenArrival('levels', 'menu').direction).toBe('back');
    expect(screenArrival('menu', 'campaign').direction).toBe('forward');
  });

  it('a sideways move never fakes a forward beat', () => {
    for (const [from, to] of [['campaign', 'campaign'], ['menu', 'menu']] as const) {
      const arrival = screenArrival(from, to);
      expect(arrival.direction).toBe('same');
      expect(arrival.travel).toBe(0);
      expect(arrival.duration).toBe(0);
    }
  });

  it('the board itself never travels, and neither does a boot screen', () => {
    for (const from of ['menu', 'levels', 'campaign', 'play'] as const) {
      expect(screenArrival(from, 'game')).toEqual({ direction: 'same', travel: 0, head: 0, stagger: 0, duration: 0 });
    }
    expect(screenArrival(null, 'menu').duration).toBe(0);
    expect(screenArrival(null, 'menu').travel).toBe(0);
  });

  it('Reduce motion removes the whole arrival, not just the distance', () => {
    expect(screenArrival('menu', 'play', true)).toEqual({ direction: 'same', travel: 0, head: 0, stagger: 0, duration: 0 });
    expect(screenArrival('play', 'menu', true).duration).toBe(0);
  });

  it('is wired in one place: showScreen asks for a direction and hands it to the primitives', () => {
    expect(main).toMatch(/import \{ screenArrival \} from '\.\/ui\/screen-motion\.js'/);
    expect(main).toMatch(/function arriveScreen\(/);
    expect(main).toMatch(/screenArrival\(from, to, !interfaceMotionAllowed\(\)\)/);
    // One head per screen, and it is the row the player reads first.
    expect(main).toMatch(/menu: '\.menu-stack'/);
    expect(main).toMatch(/levels: '\.levels-head'/);
    // No second animation library, no timers driving motion.
    expect(main).not.toMatch(/from ['"]gsap|from ['"]framer|from ['"]motion['"]/);
  });
});
