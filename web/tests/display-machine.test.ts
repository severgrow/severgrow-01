import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISPLAY_MIN_DWELL_MS, LESSON_MIN_DWELL_MS, DisplayMachine, type DisplayFrame } from '../src/player/display-machine.js';
import { ledMessageWidth, ledStaticMessage } from '../src/player/led-cells.js';
import { FLAVOUR_POOLS, FlavourDeck, flavourGate } from '../src/player/led-flavour.js';

/** A key the reproducible gate lets through, so flavour tests are not flaky. */
const firingKey = (seed: string) => {
  for (let i = 0; i < 500; i++) { const key = `${seed}:${i}`; if (flavourGate(key)) return key; }
  throw new Error('no flavour-firing key found');
};

const isStep = (text: string | undefined) =>
  text === 'THROW!' || text === 'THROW' || text === 'DRAW!' || text === 'DRAW' ||
  text === 'GROW!' || text === 'GROW';

describe('match display state', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('rests on the authoritative score and finishes a play event before the next step word', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('GROW OR SKIP', 27, 12);
    expect(frames.at(-1)).toMatchObject({ text: '27:12', mode: 'score' });
    // Let the opening score complete its 1s dwell before the play flash.
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    sign.event({ message: '+3', mode: 'green', priority: 80, duration: 950 });
    sign.score(30, 12);
    sign.phase('THROW!');
    expect(frames.at(-1)).toMatchObject({ text: '+3', mode: 'green' });
    // Event duration floors to 1s; pending step waits for that dwell.
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS - 1);
    expect(frames.at(-1)).toMatchObject({ text: '+3', mode: 'green' });
    vi.advanceTimersByTime(1);
    // Score beat may land first, then the queued step word (personality may drop !).
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    expect(isStep(frames.at(-1)?.text)).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(frames.at(-1)).toMatchObject({ text: '30:12', mode: 'score' });
    vi.advanceTimersByTime(2200);
    expect(frames.at(-1)?.pulse || frames.at(-1)?.alarm).toBe(true);
    // Sticky: keeps the step word until the player starts the next move.
    vi.advanceTimersByTime(5000);
    expect(frames.at(-1)?.alarm).toBe(true);
    expect(isStep(frames.at(-1)?.text)).toBe(true);
  });

  it('announces DRAW on reset, then returns to score and idles with the step word', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('DRAW!', 4, 3);
    expect(frames.at(-1)?.text === 'DRAW!' || frames.at(-1)?.text === 'DRAW').toBe(true);
    vi.advanceTimersByTime(2000);
    expect(frames.at(-1)).toMatchObject({ text: '4:3', mode: 'score' });
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    sign.event({ message: '+2', priority: 40, duration: 1000 });
    expect(frames.at(-1)?.text).toBe('+2');
    sign.event({ message: '-7', priority: 90, duration: 1300, mode: 'red' });
    // '-7' waits out +2's dwell.
    expect(frames.at(-1)?.text).toBe('+2');
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    expect(frames.at(-1)?.text).toBe('-7');
    sign.event({ message: 'COMBO READY', priority: 10, duration: 500 });
    expect(frames.at(-1)?.text).toBe('-7'); // lower priority ignored
    // A play fact holds for its own duration, floored by the display dwell (1 s in normal play;
    // a LESSON message gets the longer 2 s floor).
    vi.advanceTimersByTime(1300);
    expect(frames.at(-1)).toMatchObject({ text: '4:3', mode: 'score' });
    vi.advanceTimersByTime(2200);
    expect(frames.at(-1)?.pulse || frames.at(-1)?.alarm).toBe(true);
    vi.advanceTimersByTime(4000);
    expect(frames.at(-1)?.alarm).toBe(true);
    expect(frames.at(-1)?.text === 'DRAW!' || frames.at(-1)?.text === 'DRAW').toBe(true);
  });

  it('clears an old result and its timers when a new match begins', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('GROW OR SKIP', 20, 19);
    sign.event({ message: 'LOSS', priority: 100, duration: 1500 });
    sign.reset('DRAW!', 0, 0);
    vi.advanceTimersByTime(2500);
    expect(frames.at(-1)).toMatchObject({ text: '0:0', mode: 'score' });
  });

  it('keeps idle urgency through fidget taps; a drag hold clears it', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('THROW!', 5, 7);
    vi.advanceTimersByTime(2000); // finish step announcement
    vi.advanceTimersByTime(2200);
    expect(frames.at(-1)?.alarm).toBe(true);
    sign.interact(); // pointer fidget must not dismiss sticky urgency
    expect(frames.at(-1)?.alarm).toBe(true);
    sign.hold('THROW', 'red');
    // Real move start drops the alarm immediately; hold word respects 1s dwell.
    expect(frames.at(-1)?.alarm).toBeFalsy();
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    expect(frames.at(-1)).toMatchObject({ text: 'THROW', mode: 'red' });
  });

  it('paints an immediate hold on the same frame, without waiting out the dwell', () => {
    // The in-game replay's REPLAY sign (owner, 2026-10-25): the board starts moving on the click
    // frame, so the sign must be on the glass then — not 852 ms later behind a step cue's dwell.
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('GROW OR SKIP', 27, 12);
    expect(frames.at(-1)).toMatchObject({ text: '27:12', mode: 'score' });
    // No time advanced: the score still owns ~1 s of dwell.
    sign.hold('REPLAY', 'amber', { immediate: true });
    expect(frames.at(-1)).toMatchObject({ text: 'REPLAY', mode: 'amber' });
    // A later frame for the same action still keeps its own dwell (the hold is not sticky).
    sign.release();
    expect(frames.at(-1)).toMatchObject({ text: 'REPLAY', mode: 'amber' });
  });

  it('keeps idle urgency sticky like tutorial — not cleared by blank beats or the dwell queue', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('GROW!', 2, 2);
    vi.advanceTimersByTime(2000);
    vi.advanceTimersByTime(2200);
    expect(frames.at(-1)?.alarm).toBe(true);
    const urgent = frames.at(-1)?.text;
    // Fidget + score chatter must not replace the blinking move cue.
    sign.interact();
    sign.score(3, 2);
    sign.interact();
    expect(frames.at(-1)?.alarm).toBe(true);
    expect(frames.at(-1)?.text).toBe(urgent);
    vi.advanceTimersByTime(5000);
    expect(frames.at(-1)?.alarm).toBe(true);
    expect(frames.at(-1)?.text).toBe(urgent);
  });

  it('holds every distinct message at least 1s in normal play; the next message queues', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('GROW OR SKIP', 0, 0);
    expect(frames.at(-1)?.text).toBe('0:0');
    sign.event({ message: 'A', priority: 50, duration: 1000 });
    // Opening score still owns the dwell — A is queued.
    expect(frames.at(-1)?.text).toBe('0:0');
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    expect(frames.at(-1)?.text).toBe('A');
    // Higher priority replace is requested immediately, but paint waits out the dwell.
    sign.event({ message: 'B', priority: 90, duration: 1000 });
    expect(frames.at(-1)?.text).toBe('A');
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS - 1);
    expect(frames.at(-1)?.text).toBe('A');
    vi.advanceTimersByTime(1);
    expect(frames.at(-1)?.text).toBe('B');
  });

  it('lets the same message keep blinking without waiting on the dwell queue', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('DRAW!', 1, 0);
    const shown = frames.at(-1)?.text;
    expect(shown === 'DRAW!' || shown === 'DRAW').toBe(true);
    vi.advanceTimersByTime(400);
    // End-of-hold pulse is a same-message presentation change — applies immediately.
    vi.advanceTimersByTime(1600);
    const pulsed = frames.find(f => f.text === shown && f.pulse);
    expect(pulsed).toBeTruthy();
  });

  it('lands the informative token first and lets flavour only follow it', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('GROW!', 9, 10);
    vi.advanceTimersByTime(2000);
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS); // score dwell before the cut flash
    sign.event({
      message: 'CUT+4', priority: 90, duration: 900, mode: 'green', key: firingKey('reaction'),
      flavour: { kind: 'test', pool: { lines: ['NICE'], tone: 'green', motif: 'stars' } }, accent: 'cut',
    });
    expect(frames.at(-1)).toMatchObject({ text: 'CUT+4', mode: 'green', flash: 'cut' });
    // Fact floors to 1s, then motif and reaction each dwell 1s.
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    expect(frames.at(-1)).toMatchObject({ motif: 'stars' });
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    expect(frames.at(-1)?.text).toBe('NICE');
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    expect(frames.at(-1)).toMatchObject({ text: '9:10', mode: 'score' });
  });

  it('passes a waiting pulse through to the frame', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('GROW OR SKIP', 1, 2);
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    sign.event({ message: 'WAIT', priority: 20, duration: 1050, mode: 'red', pulse: true });
    expect(frames.at(-1)).toMatchObject({ text: 'WAIT', pulse: true });
  });

  it('shows a blank beat when there is no useful step word', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('GROW OR SKIP', 0, 0);
    vi.advanceTimersByTime(2500);
    expect(frames.at(-1)).toMatchObject({ text: '', mode: 'score' });
    vi.advanceTimersByTime(2000);
    expect(frames.at(-1)).toMatchObject({ text: '0:0', mode: 'score' });
    sign.interact();
    expect(frames.at(-1)).toMatchObject({ text: '0:0', mode: 'score' });
  });

  it('blinks the step word in the last stretch of its hold', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('GROW!', 1, 1);
    const shown = frames.at(-1)?.text;
    expect(shown === 'GROW!' || shown === 'GROW').toBe(true);
    vi.advanceTimersByTime(1500);
    expect(frames.at(-1)?.pulse).toBe(true);
    vi.advanceTimersByTime(500);
    expect(frames.at(-1)).toMatchObject({ text: '1:1', mode: 'score' });
  });

  it('scales step holds with the Speed factor but never under the 1s dwell', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame), () => 0.5);
    sign.reset('DRAW!', 1, 0);
    // Fast scale would be ~800–1000ms; visual + logical floor keeps amber through 999ms.
    vi.advanceTimersByTime(999);
    expect(frames.at(-1)?.mode).toBe('amber');
    vi.advanceTimersByTime(1100);
    expect(frames.at(-1)).toMatchObject({ text: '1:0', mode: 'score' });
  });

  it('replaces a SKIP hint with THROW! after the dwell — never leaves SKIP on throw', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('GROW!', 3, 1);
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    // Cockpit used to flash SKIP when the skip control appeared after a grow.
    sign.hint('SKIP');
    expect(frames.at(-1)?.text).toBe('SKIP');
    // EndAct → throw while SKIP is still holding.
    sign.phase('THROW!');
    expect(frames.at(-1)?.text).toBe('SKIP'); // dwell respected
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    expect(frames.at(-1)?.text === 'THROW!' || frames.at(-1)?.text === 'THROW').toBe(true);
    // Must not return to SKIP after THROW has landed.
    const afterThrow = frames.findIndex(f => f.text === 'THROW!' || f.text === 'THROW');
    expect(afterThrow).toBeGreaterThanOrEqual(0);
    vi.advanceTimersByTime(5000);
    expect(frames.slice(afterThrow).every(f => f.text !== 'SKIP' && f.text !== 'SKIP?')).toBe(true);
  });
});

it('keeps compact readouts legible at full dot size', () => {
  for (const message of ['GROW OR SKIP', 'GROW!', 'THROW!', 'DRAW!', 'SKIP?', 'BLOOM READY', 'BLOOM +4', 'YOU 30 • 12 OPP', 'YOU 120 • 4 OPP', 'CUT -7', 'TURN +5', 'OPPONENT TURN', 'YOU WIN', 'OPP WINS']) {
    expect(ledMessageWidth(ledStaticMessage(message)), message).toBeLessThan(76);
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

describe('quiet sign (a lesson message is on screen)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('keeps the score and real play facts, drops its own step words and hints, but still wakes on idle', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('DRAW!', 1, 0);
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    sign.setQuiet(true);
    // The word already on the sign finishes its dwell, then the score takes over.
    vi.advanceTimersByTime(LESSON_MIN_DWELL_MS);
    expect(frames.at(-1)).toMatchObject({ text: '1:0', mode: 'score' });
    const before = frames.length;
    sign.phase('GROW!');
    sign.hint('CANCEL');
    sign.event({ message: 'WAIT', mode: 'red', priority: 20, duration: 1050 });
    // Quiet drops its own step words and hints...
    expect(frames.slice(before).every((f) => f.mode !== 'red' || f.text !== 'WAIT')).toBe(true);
    // ...but an idle player must bring the sign back to life (owner, 2026-10-21: a sign that stayed
    // dark for a whole level read as broken). It blinks the step word, in amber.
    vi.advanceTimersByTime(20000);
    const sleepy = frames.slice(before);
    expect(sleepy.some((f) => f.alarm === true), 'the idle alarm comes back in a lesson').toBe(true);
    // The word it blinks is the CURRENT phase (the test moved it to GROW before going idle).
    expect(sleepy.some((f) => f.text === 'GROW' || f.text === 'GROW!'), 'it blinks the step word').toBe(true);
    // A real result still shows (a play fact, a wrong-tap answer).
    sign.event({ message: '+3', mode: 'green', priority: 40, duration: 950 });
    expect(frames.at(-1)).toMatchObject({ text: '+3' });
    vi.advanceTimersByTime(3000);
    expect(frames.at(-1)).toMatchObject({ mode: 'score' });
    // Back to normal: the step word shows again.
    sign.setQuiet(false);
    sign.phase('THROW!');
    vi.advanceTimersByTime(3000);
    expect(frames.some((f, i) => i >= before && isStep(f.text))).toBe(true);
  });

  it('drops an idle step word the moment the step moves on, as normal play does', () => {
    // The 3 s reading floor makes the idle wake near-certain before a lesson player acts: DRAW!
    // starts blinking while they read, they draw, and the sign must not keep saying DRAW!.
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('DRAW!', 1, 0);
    sign.setQuiet(true);
    vi.advanceTimersByTime(20000);
    expect(frames.at(-1)).toMatchObject({ alarm: true });
    expect(frames.at(-1)?.text.replace(/!$/, '')).toBe('DRAW');
    sign.phase('GROW!');
    expect(frames.at(-1)?.text.replace(/!$/, ''), 'the stale DRAW is gone at once').not.toBe('DRAW');
    expect(frames.at(-1)?.alarm, 'and it no longer blinks').toBeFalsy();
    // Idle again, and the sign wakes on the CURRENT step.
    vi.advanceTimersByTime(20000);
    const woke = frames.filter((f) => f.alarm).at(-1);
    expect(woke?.text.replace(/!$/, '')).toBe('GROW');
  });
});

describe('the sign can hold the score (the lesson that teaches it)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('shows the score at once, over a word still playing, until released', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('GROW!', 1, 0);
    vi.advanceTimersByTime(3 * DISPLAY_MIN_DWELL_MS);
    sign.event({ message: 'LEAD', mode: 'green', priority: 75, duration: 1500 });
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    expect(frames.at(-1)).toMatchObject({ text: 'LEAD' });
    sign.holdScore();
    expect(frames.at(-1)).toMatchObject({ text: '1:0', mode: 'score' });
    // A score update during the hold shows at once.
    sign.score(2, 0);
    expect(frames.at(-1)).toMatchObject({ text: '2:0', mode: 'score' });
    sign.score(1, 0);
    // A result arriving during the hold (it lands just after the move) does not replace it.
    sign.event({ message: 'LEAD', mode: 'green', priority: 75, duration: 1500 });
    vi.advanceTimersByTime(20000);
    expect(frames.at(-1)).toMatchObject({ text: '1:0', mode: 'score' });
    sign.release();
    sign.phase('THROW!');
    vi.advanceTimersByTime(3000);
    expect(frames.some((f) => f.text?.startsWith('THROW'))).toBe(true);
  });
});

describe('the lesson action line owns the sign (levels 1-10)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  // Owner, 2026-10-20: "in lessons 1-10 the display must ALWAYS prioritise the ACTION". The score
  // is only what is left when there is nothing to do, so an action line never queues behind it.
  it('paints the action line at once, even when the score has just landed', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('DRAW!', 2, 1);
    sign.setQuiet(true);
    vi.advanceTimersByTime(LESSON_MIN_DWELL_MS); // the step word ends and the score lands now
    expect(frames.at(-1)).toMatchObject({ mode: 'score' });
    sign.hold('TAP DRAW PILE');
    expect(frames.at(-1)).toMatchObject({ text: 'TAP DRAW PILE' });
  });

  it('a lesson message holds 2 s, while normal play keeps 1 s', () => {
    // Owner (2026-10-20): a teaching line must never change faster than 2 s. Normal play keeps the
    // 1 s floor, because there the sign is a live scoreboard and a longer floor feels sluggish.
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('DRAW!', 1, 0);
    sign.setQuiet(true);
    // 1 s in: the step word is still up, because a lesson waits 2 s.
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    expect(frames.at(-1)?.text).toBe('DRAW!');
    // 2 s in: it has handed over to the score.
    vi.advanceTimersByTime(LESSON_MIN_DWELL_MS - DISPLAY_MIN_DWELL_MS);
    expect(frames.at(-1)).toMatchObject({ mode: 'score' });
  });

  it('outside a lesson a drag word still waits out the dwell — today’s behaviour is untouched', () => {
    const frames: DisplayFrame[] = [];
    const sign = new DisplayMachine(frame => frames.push(frame));
    sign.reset('GROW OR SKIP', 2, 1);
    expect(frames.at(-1)?.text).toBe('2:1');
    sign.hold('DRAW');
    expect(frames.at(-1)?.text).toBe('2:1'); // queued behind the score's dwell
    vi.advanceTimersByTime(DISPLAY_MIN_DWELL_MS);
    expect(frames.at(-1)?.text).toBe('DRAW');
  });
});
