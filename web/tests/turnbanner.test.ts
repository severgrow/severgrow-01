// Material pass 2, Part 7: the "Your turn" / "Bot's turn" pill. A pure state machine driven
// by the page's clock (milliseconds passed in), so it is tested without timers.
import { describe, expect, it } from 'vitest';
import { BANNER_MS, bannerView, botMoved, showTurn, tick, HIDDEN } from '../src/logic/turnbanner.js';
import type { BannerOpts } from '../src/logic/turnbanner.js';
import { bannerOpts, turnTone } from '../src/logic/turnbanner.js';
import { DEFAULT_SETTINGS } from '../src/logic/settings.js';

const normal: BannerOpts = { speed: 1, reduceMotion: false, skip: false, effects: 'normal' };
const run = (s: ReturnType<typeof showTurn>, ms: number, step = 16) => {
  for (let t = 0; t < ms; t += step) s = tick(s, step);
  return s;
};

describe('the turn banner', () => {
  it('my turn: fades and slides in (~250ms), a sweep, holds (~700ms), fades out; then hidden', () => {
    expect(BANNER_MS).toEqual({ in: 250, hold: 700, out: 250 });
    let s = showTurn(HIDDEN, 0, normal);
    expect(bannerView(s)).toMatchObject({ visible: true, label: 'Your turn', marker: 'circle', phase: 'in', thinking: false });
    s = run(s, 260);
    expect(bannerView(s).phase).toBe('hold');
    expect(bannerView(s).sweep).toBe(true);
    s = run(s, 720);
    expect(bannerView(s).phase).toBe('out');
    s = run(s, 270);
    expect(bannerView(s).visible).toBe(false);
  });

  it("the bot's turn: a diamond, and quiet thinking dots until its first move appears (never faked)", () => {
    let s = showTurn(HIDDEN, 1, normal);
    expect(bannerView(s)).toMatchObject({ label: "Bot's turn", marker: 'diamond', thinking: true });
    s = run(s, 5000);
    // the pill has gone, but the dots stay (beside where it was) while the bot is still thinking
    expect(bannerView(s)).toMatchObject({ visible: false, thinking: true });
    s = botMoved(s);
    expect(bannerView(s).thinking).toBe(false);
  });

  it('animation speed scales the timings; Reduce motion is a plain quick fade with no slide or sweep', () => {
    const slow = run(showTurn(HIDDEN, 0, { ...normal, speed: 1.6 }), 300);
    expect(bannerView(slow).phase).toBe('in');
    const rm = showTurn(HIDDEN, 0, { ...normal, reduceMotion: true });
    expect(bannerView(rm)).toMatchObject({ slide: 0, fadeOnly: true });
    expect(bannerView(run(rm, 200)).sweep).toBe(false);
  });

  it('ADVERSARIAL 7: skipped mid-way, Reduce motion, and two turns of events in a row', () => {
    // skip: the banner appears and disappears instantly; the state is correct after
    const skip = showTurn(HIDDEN, 0, { ...normal, skip: true });
    expect(bannerView(skip).visible).toBe(false);
    // skipping mid-way through a normal banner: it ends at once
    let s = run(showTurn(HIDDEN, 1, normal), 300);
    s = showTurn(s, 1, { ...normal, skip: true });
    expect(bannerView(s).visible).toBe(false);
    // two turns' worth of events back to back: the latest turn wins, nothing stacks
    s = showTurn(HIDDEN, 1, normal);
    s = run(s, 100);
    s = botMoved(s);
    s = showTurn(s, 1, normal); // the bot again (e.g. replay or a second turn)
    expect(bannerView(s)).toMatchObject({ label: "Bot's turn", phase: 'in', thinking: true });
    s = showTurn(s, 0, normal);
    expect(bannerView(s)).toMatchObject({ label: 'Your turn', thinking: false });
    // interrupted at any point, the view is always a valid state
    for (let ms = 0; ms < 2000; ms += 37) {
      const v = bannerView(run(showTurn(HIDDEN, ms % 2 ? 1 : 0, normal), ms));
      expect(['in', 'hold', 'out', 'hidden']).toContain(v.phase);
      expect(v.opacity).toBeGreaterThanOrEqual(0);
      expect(v.opacity).toBeLessThanOrEqual(1);
    }
  });

  it('no urgency: no countdown or flashing, ever', () => {
    const v = bannerView(run(showTurn(HIDDEN, 0, normal), 400));
    expect(Object.keys(v)).not.toContain('countdown');
    expect(v.flash).toBe(false);
  });

  it('a faint edge wash on the side whose turn it is; Low effects: a plain pill (no sweep, no wash)', () => {
    const held = run(showTurn(HIDDEN, 1, normal), 400);
    expect(bannerView(held).wash).toBe('bot');
    expect(bannerView(run(showTurn(HIDDEN, 0, normal), 400)).wash).toBe('you');
    const low = run(showTurn(HIDDEN, 0, { ...normal, effects: 'low' }), 400);
    expect(bannerView(low)).toMatchObject({ visible: true, sweep: false, wash: null });
    expect(bannerView(run(showTurn(HIDDEN, 0, { ...normal, reduceMotion: true }), 200)).wash).toBe(null);
    expect(bannerView(HIDDEN).wash).toBe(null);
  });

  it('the settings map onto the banner: speed, Skip, Reduce motion, effects', () => {
    expect(bannerOpts(DEFAULT_SETTINGS)).toEqual({ speed: 1, reduceMotion: false, skip: false, effects: 'normal' });
    expect(bannerOpts({ ...DEFAULT_SETTINGS, speed: 'slow' }).speed).toBe(1.6);
    expect(bannerOpts({ ...DEFAULT_SETTINGS, speed: 'skip' }).skip).toBe(true);
    expect(bannerOpts({ ...DEFAULT_SETTINGS, reduceMotion: true }).reduceMotion).toBe(true);
    expect(bannerOpts({ ...DEFAULT_SETTINGS, effects: 'low' }).effects).toBe('low');
  });

  it('two soft tones: a gentle rise for my turn, a lower settle for the bot; quiet, short, none when skipped', () => {
    const me = turnTone(0, normal)!;
    const bot = turnTone(1, normal)!;
    expect(me.notes[1]!).toBeGreaterThan(me.notes[0]!);
    expect(bot.notes[1]!).toBeLessThan(bot.notes[0]!);
    expect(Math.max(...bot.notes)).toBeLessThan(Math.max(...me.notes));
    for (const t of [me, bot]) {
      expect(t.gain).toBeLessThanOrEqual(0.06);
      expect(t.ms).toBeLessThanOrEqual(400);
    }
    expect(turnTone(0, { ...normal, skip: true })).toBe(null);
  });
});
