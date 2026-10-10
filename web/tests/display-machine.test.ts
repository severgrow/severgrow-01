import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayMachine, type DisplayFrame } from '../src/player/display-machine.js';
import { ledMessageWidth, ledStaticMessage } from '../src/player/led-cells.js';
import { FLAVOUR_POOLS, FlavourDeck, flavourGate } from '../src/player/led-flavour.js';

/** A key the reproducible gate lets through, so flavour tests are not flaky. */
const firingKey = (seed: string) => {
  for (let i = 0; i < 500; i++) { const key = `${seed}:${i}`; if (flavourGate(key)) return key; }
  throw new Error('no flavour-firing key found');
};

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

  it('lands the informative token first and lets flavour only follow it', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame=>frames.push(frame));
    sign.reset('GROW',9,10);
    sign.event({message:'CUT+4',priority:90,duration:900,mode:'green',key:firingKey('reaction'),
      flavour:{kind:'test',pool:{lines:['NICE'],tone:'green',motif:'stars'}},accent:'cut'});
    expect(frames.at(-1)).toMatchObject({text:'CUT+4',mode:'green',flash:'cut'});
    vi.advanceTimersByTime(900);
    expect(frames.at(-1)).toMatchObject({motif:'stars'});
    vi.advanceTimersByTime(440);
    expect(frames.at(-1)?.text).toBe('NICE');
    vi.advanceTimersByTime(620);
    expect(frames.at(-1)).toMatchObject({text:'9:10',mode:'score'});
  });

  it('passes a waiting pulse through to the frame', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame=>frames.push(frame));
    sign.reset('DRAW',1,2);
    sign.event({message:'WAIT',priority:20,duration:1050,mode:'red',pulse:true});
    expect(frames.at(-1)).toMatchObject({text:'WAIT',pulse:true});
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

describe('cockpit flavour stays sparse and never repeats', () => {
  it('fires on roughly one eligible moment in seven, reproducibly', () => {
    let fired = 0;
    for (let i = 0; i < 4000; i++) if (flavourGate(`seed:${i}`)) fired++;
    expect(fired / 4000).toBeGreaterThan(0.10);
    expect(fired / 4000).toBeLessThan(0.20);
    expect(flavourGate('same:key')).toBe(flavourGate('same:key'));
  });

  it('never speaks twice in a row for the same kind, but another kind may follow', () => {
    const deck = new FlavourDeck();
    const pool = FLAVOUR_POOLS['bloom'];
    const key = firingKey('repeat');
    expect(deck.draw('bloom', pool, key)).not.toBeNull();
    expect(deck.draw('bloom', pool, key)).toBeNull();
    expect(deck.draw('cut-theirs', pool, key)).not.toBeNull();
  });

  it('shows every line before any line returns, and dodges the last line on refill', () => {
    const deck = new FlavourDeck();
    const pool = FLAVOUR_POOLS['bloom'];
    const first = pool.lines.map(() => deck.pick('bloom', pool));
    expect(first.every(Boolean)).toBe(true);
    expect(new Set(first).size).toBe(pool.lines.length);
    expect(deck.pick('bloom', pool)).not.toBe(first.at(-1));
  });

  it('starts fresh on a new match', () => {
    const deck = new FlavourDeck();
    const pool = FLAVOUR_POOLS['bloom'];
    expect(deck.draw('bloom', pool, firingKey('a'))).not.toBeNull();
    deck.reset();
    expect(deck.draw('bloom', pool, firingKey('a'))).not.toBeNull();
  });
});
