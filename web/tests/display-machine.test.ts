import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayMachine, type DisplayFrame } from '../src/player/display-machine.js';
import { ledMessageWidth, ledStaticMessage } from '../src/player/led-cells.js';

describe('match display state', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window',globalThis); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('shows event, score, then the latest phase without blocking a phase change', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame=>frames.push(frame));
    sign.reset('GROW OR SKIP');
    sign.event({message:'BLOOM +3',score:'YOU 30 • 12 OPP',priority:80,duration:1200});
    sign.phase('THROW');
    expect(frames.at(-1)).toMatchObject({text:'BLOOM +3',mode:'red'});
    vi.advanceTimersByTime(1200);
    expect(frames.at(-1)).toMatchObject({text:'YOU 30 • 12 OPP',mode:'red'});
    vi.advanceTimersByTime(1000);
    expect(frames.at(-1)).toMatchObject({text:'THROW',mode:'amber'});
  });

  it('interrupts weaker alerts, discards stale timers, and gives one idle nudge', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame=>frames.push(frame));
    sign.reset('DRAW');
    sign.event({message:'TURN +2',priority:40,duration:1000});
    sign.event({message:'CUT -7',priority:90,duration:1300});
    sign.event({message:'COMBO READY',priority:10,duration:500});
    vi.advanceTimersByTime(1300);
    expect(frames.at(-1)).toMatchObject({text:'DRAW',mode:'amber'});
    vi.advanceTimersByTime(4000);
    expect(frames.at(-1)?.pulse).toBe(true);
    vi.advanceTimersByTime(480);
    expect(frames.at(-1)?.pulse).toBe(false);
    const count=frames.length;
    vi.advanceTimersByTime(20000);
    expect(frames).toHaveLength(count);
  });

  it('clears an old result when a new match begins', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame=>frames.push(frame));
    sign.reset('GROW OR SKIP');
    sign.event({message:'CUT -9',priority:90,duration:1500,score:'YOU 1 • 20 OPP'});
    sign.reset('DRAW');
    vi.advanceTimersByTime(2500);
    expect(frames.at(-1)).toMatchObject({text:'DRAW',mode:'amber'});
  });

  it('ends an idle brightness nudge as soon as the player acts', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame=>frames.push(frame));
    sign.reset('THROW');
    vi.advanceTimersByTime(4000);
    expect(frames.at(-1)?.pulse).toBe(true);
    sign.interact();
    expect(frames.at(-1)?.pulse).toBe(false);
  });
});

it('keeps reduced-motion readouts legible at full dot size', () => {
  for (const message of ['GROW OR SKIP','BLOOM READY','BLOOM +4','YOU 30 • 12 OPP','YOU 120 • 4 OPP','CUT -7','TURN +5','OPPONENT TURN']) {
    expect(ledMessageWidth(ledStaticMessage(message)),message).toBeLessThan(76);
  }
});
