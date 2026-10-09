import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayMachine, type DisplayFrame } from '../src/player/display-machine.js';
import { ledMessageWidth, ledStaticMessage } from '../src/player/led-cells.js';

describe('match display state', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window',globalThis); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('rests on the authoritative score and returns to the latest score after an event', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame=>frames.push(frame));
    sign.reset('GROW OR SKIP',27,12);
    expect(frames.at(-1)).toMatchObject({text:'27:12',mode:'score'});
    sign.event({message:'+3',mode:'green',priority:80,duration:950});
    sign.score(30,12);
    sign.phase('THROW');
    expect(frames.at(-1)).toMatchObject({text:'+3',mode:'green'});
    vi.advanceTimersByTime(950);
    expect(frames.at(-1)).toMatchObject({text:'30:12',mode:'score'});
    vi.advanceTimersByTime(6000);
    expect(frames.at(-1)).toMatchObject({text:'THROW',mode:'amber',pulse:true});
    vi.advanceTimersByTime(1050);
    expect(frames.at(-1)).toMatchObject({text:'30:12',mode:'score'});
  });

  it('interrupts weaker alerts, discards stale timers, and makes idle reminders sparse', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame=>frames.push(frame));
    sign.reset('DRAW',4,3);
    sign.event({message:'+2',priority:40,duration:1000});
    sign.event({message:'-7',priority:90,duration:1300,mode:'red'});
    sign.event({message:'COMBO READY',priority:10,duration:500});
    expect(frames.at(-1)?.text).toBe('-7');
    vi.advanceTimersByTime(1300);
    expect(frames.at(-1)).toMatchObject({text:'4:3',mode:'score'});
    vi.advanceTimersByTime(6000);
    expect(frames.at(-1)?.pulse).toBe(true);
    vi.advanceTimersByTime(1050);
    expect(frames.at(-1)?.text).toBe('4:3');
    vi.advanceTimersByTime(17999);
    expect(frames.at(-1)?.text).toBe('4:3');
    vi.advanceTimersByTime(1);
    expect(frames.at(-1)?.text).toBe('DRAW');
  });

  it('clears an old result and its timers when a new match begins', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame=>frames.push(frame));
    sign.reset('GROW OR SKIP',20,19);
    sign.event({message:'LOSS',priority:100,duration:1500});
    sign.reset('DRAW',0,0);
    vi.advanceTimersByTime(2500);
    expect(frames.at(-1)).toMatchObject({text:'0:0',mode:'score'});
  });

  it('ends an idle hint immediately when the player acts', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame=>frames.push(frame));
    sign.reset('THROW',5,7);
    vi.advanceTimersByTime(6000);
    expect(frames.at(-1)?.pulse).toBe(true);
    sign.interact();
    expect(frames.at(-1)).toMatchObject({text:'5:7',mode:'score'});
  });

  it('uses deterministic rare reactions and keeps the score as fallback', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame=>frames.push(frame));
    sign.reset('GROW',9,10);
    sign.event({message:'+6',priority:90,duration:900,mode:'green',key:'seed:turn:cut',
      personality:{chance:100,lines:['NICE.'],motif:'stars',tone:'green'}});
    expect(frames.at(-1)).toMatchObject({motif:'stars',mode:'green'});
    vi.advanceTimersByTime(440);
    expect(frames.at(-1)?.text).toBe('NICE.');
    vi.advanceTimersByTime(680);
    expect(frames.at(-1)?.text).toBe('+6');
    vi.advanceTimersByTime(900);
    expect(frames.at(-1)?.text).toBe('9:10');
  });

  it('keeps a quiet idle secret rare and cancels it on input', () => {
    vi.stubGlobal('document',{documentElement:{classList:{contains:()=>false}}});
    vi.stubGlobal('window',{...globalThis,matchMedia:()=>({matches:false}),setTimeout,clearTimeout});
    const frames: DisplayFrame[]=[];
    const sign=new DisplayMachine(frame=>frames.push(frame));
    sign.reset('DRAW',0,0);
    vi.advanceTimersByTime(6000+3*(1050+18000));
    expect(frames.at(-1)?.motif).toBe('eyes');
    sign.interact();
    expect(frames.at(-1)).toMatchObject({text:'0:0',mode:'score'});
  });
});

it('keeps compact readouts legible at full dot size', () => {
  for (const message of ['GROW OR SKIP','BLOOM READY','BLOOM +4','YOU 30 • 12 OPP','YOU 120 • 4 OPP','CUT -7','TURN +5','OPPONENT TURN','YOU WIN','OPP WINS']) {
    expect(ledMessageWidth(ledStaticMessage(message)),message).toBeLessThan(76);
  }
});
