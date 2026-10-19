import type { DisplayEvent } from './display-readout.js';
import { FlavourDeck } from './led-flavour.js';
import type { LedMotif, LedTone } from './led-cells.js';

export type DisplayFrame = {
  text: string;
  mode: LedTone;
  pulse?: boolean;
  /** Stronger alarm blink for idle re-prompts. */
  alarm?: boolean;
  compact?: boolean;
  motif?: LedMotif;
  flash?: 'cut' | 'bloom';
};

/** Hard floor: no LED message may be replaced sooner than this. */
export const DISPLAY_MIN_DWELL_MS = 1000;

const STEP_WORDS = new Set(['DRAW', 'DRAW!', 'GROW', 'GROW!', 'THROW', 'THROW!', 'BLOOM', 'BLOOM!', 'SKIP?']);

/** Step / skip cues that must never linger after the turn moves on (incl. hint "SKIP"). */
const STEP_CUE = /^(DRAW|GROW|THROW|BLOOM|SKIP)\??!?$/;

const normStep = (text: string) => text.replace(/[!?]+$/, '');

/** True when `shown` is an old step cue that `next` should replace. */
const isObsoleteStepCue = (shown: string, next: string) =>
  STEP_CUE.test(shown) && STEP_CUE.test(next) && normStep(shown) !== normStep(next);

/** Identity for dwell: same text/motif may keep blinking; a different key must wait. */
const messageKey = (frame: DisplayFrame) => (frame.motif ? `\0motif:${frame.motif}` : frame.text);

/** One match-scoped clock owns the sign. Its resting face is always the real score. */
export class DisplayMachine {
  private instruction = 'DRAW';
  private scoreText = '0:0';
  private active: DisplayEvent | null = null;
  private timer = 0;
  private idleTimer = 0;
  private idleReturn = 0;
  private blinkTimer = 0;
  private dwellTimer = 0;
  private epoch = 0;
  private eventCount = 0;
  private flavour = new FlavourDeck();
  private idleCycles = 0;
  /** Sticky idle re-prompt: step word keeps blinking until the player acts. */
  private urgency = false;
  /** A drag is holding a word on the sign; timers and idle reminders stay out of the way. */
  private held = false;
  /**
   * A lesson message is on screen (levels 1-10): the sign keeps the score and real play facts
   * (priority 30+: a result, a wrong-tap answer) and drops its own step words, hints and idle
   * prompts, so two displays never say different things at once.
   */
  private quiet = false;
  /** The score is held on the sign (a lesson is pointing at it): nothing replaces it. */
  private scoreHeld = false;
  /** Queued step announcement while a higher-priority event finishes. */
  private pendingStep: string | null = null;
  private frame: DisplayFrame = { text: '', mode: 'score' };
  /** When the current message identity first landed on the sign (0 = nothing real yet). */
  private shownAt = 0;
  /** Next distinct messages waiting for the 1s minimum dwell. */
  private queue: DisplayFrame[] = [];
  /**
   * Speed scale for step holds (1 = normal). Prefer `--anim` / game Speed.
   * Skip (0) is floored so the cue stays readable.
   */
  constructor(
    private readonly show: (frame: DisplayFrame) => void,
    private readonly holdScale: () => number = () => 1,
  ) {}

  private now() { return Date.now(); }

  private remainingDwell(): number {
    if (this.shownAt === 0) return 0;
    return Math.max(0, DISPLAY_MIN_DWELL_MS - (this.now() - this.shownAt));
  }

  /** Ms until a newly queued frame will land (0 if it can paint now). */
  private delayUntilPaint(): number {
    const rem = this.remainingDwell();
    if (rem <= 0 && this.queue.length === 0) return 0;
    return rem + this.queue.length * DISPLAY_MIN_DWELL_MS;
  }

  private clearDwellQueue() {
    this.queue.length = 0;
    window.clearTimeout(this.dwellTimer);
    this.dwellTimer = 0;
  }

  private displayNow(frame: DisplayFrame) {
    this.frame = frame;
    this.shownAt = this.now();
    this.show(frame);
  }

  private scheduleDwellFlush() {
    if (this.dwellTimer || this.queue.length === 0) return;
    const wait = this.remainingDwell();
    this.dwellTimer = window.setTimeout(() => {
      this.dwellTimer = 0;
      const next = this.queue.shift();
      if (!next) return;
      this.displayNow(next);
      if (this.queue.length) this.scheduleDwellFlush();
    }, wait);
  }

  /**
   * Paint a frame. Distinct messages wait out the 1s dwell (FIFO queue).
   * Same message may update pulse/alarm/mode immediately — idle blink stays live.
   * @returns ms until this frame is/was painted (0 if now or same-message tweak).
   */
  private emit(frame: DisplayFrame, opts?: { force?: boolean }): number {
    if (messageKey(this.frame) === messageKey(frame)) {
      if (this.frame.mode === frame.mode && this.frame.pulse === frame.pulse &&
        this.frame.alarm === frame.alarm && this.frame.flash === frame.flash &&
        this.frame.compact === frame.compact && this.frame.motif === frame.motif) return 0;
      // Presentation-only change on the same message: no dwell reset.
      this.frame = frame;
      this.show(frame);
      return 0;
    }
    if (opts?.force) {
      this.clearDwellQueue();
      this.displayNow(frame);
      return 0;
    }
    const delay = this.delayUntilPaint();
    if (delay <= 0) {
      this.displayNow(frame);
      return 0;
    }
    this.queue.push(frame);
    this.scheduleDwellFlush();
    return delay;
  }

  /** Resting score — never interrupts sticky idle urgency or a drag hold. */
  private rest() {
    if (this.urgency || this.held) return;
    this.emit({ text: this.scoreText, mode: 'score' });
  }
  /** Scale a hold by Speed; never stretch under reduce-motion (caller already shortened). */
  private scaled(ms: number): number {
    const raw = this.holdScale();
    const scale = !Number.isFinite(raw) || raw <= 0 ? 0.5 : Math.max(0.45, Math.min(2, raw));
    return Math.round(ms * scale);
  }
  score(you: number, opp: number) {
    const next = `${you}:${opp}`;
    if (next === this.scoreText) return;
    this.scoreText = next;
    if (this.scoreHeld) { this.emit({ text: next, mode: 'score' }, { force: true }); return; }
    if (!this.active && !this.urgency && !this.frame.pulse && !this.frame.alarm) this.rest();
  }
  setQuiet(on: boolean) {
    if (on === this.quiet) return;
    this.quiet = on;
    if (on) {
      this.urgency = false;
      this.clearUrgencyPaint();
      if (!this.active) { this.clearTimers(); this.clearDwellQueue(); this.rest(); }
    } else {
      this.interact();
    }
  }
  phase(text: string) {
    if (this.quiet) { this.instruction = text; return; }
    if (text === this.instruction && !isObsoleteStepCue(this.frame.text, text)
      && !(this.active && isObsoleteStepCue(this.active.message, text))) {
      return;
    }
    this.instruction = text;
    if (STEP_WORDS.has(text) && text !== 'WAIT') this.supersedeStep(text);
    else this.interact();
  }

  /**
   * Move to a new step word. Respect the 1s dwell on whatever is showing, but drop
   * obsolete SKIP/GROW/DRAW cues from the queue/active slot so THROW! (etc.) is next.
   */
  private supersedeStep(text: string) {
    if (this.held) return;
    this.queue = this.queue.filter((frame) => !isObsoleteStepCue(frame.text, text));
    this.pendingStep = null;
    this.urgency = false;
    this.clearUrgencyPaint();
    // Stale step/skip hint or announcement: cancel its hold timer and queue the new word.
    if (this.active && isObsoleteStepCue(this.active.message, text)) {
      this.clearTimers();
      this.active = null;
      this.announceStep(text);
      return;
    }
    if (this.active) {
      this.pendingStep = text;
      return;
    }
    // Idle urgency / leftover face still showing an old step word.
    if (isObsoleteStepCue(this.frame.text, text)) {
      this.announceStep(text);
      return;
    }
    this.announceStep(text);
  }
  private clearTimers() {
    window.clearTimeout(this.timer);
    window.clearTimeout(this.idleTimer);
    window.clearTimeout(this.idleReturn);
    window.clearTimeout(this.blinkTimer);
  }
  private reduced() {
    return typeof document !== 'undefined' &&
      (document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion:reduce)').matches);
  }
  /** ~1/8 soft variance: sometimes drop the bang or shorten the hold. */
  private stepPersonality(text: string): { shown: string; duration: number } {
    const seed = (this.scoreText.charCodeAt(0) || 0) + this.eventCount + text.length;
    const roll = seed % 8;
    if (roll === 0 && text.endsWith('!')) return { shown: text.slice(0, -1), duration: this.scaled(1600) };
    if (roll === 1) return { shown: text, duration: this.scaled(1700) };
    return { shown: text, duration: this.scaled(2000) };
  }
  /**
   * Show GROW!/THROW!/DRAW! (blink in the last stretch), then score.
   * Always finishes the previous message first (queues if needed).
   */
  private announceStep(text: string) {
    if (this.held) return;
    if (this.active) {
      this.pendingStep = text;
      return;
    }
    this.pendingStep = null;
    this.clearTimers();
    this.urgency = false;
    this.clearUrgencyPaint();
    const { shown, duration } = this.reduced()
      ? { shown: text, duration: this.scaled(1200) }
      : this.stepPersonality(text);
    // Logical hold never undercuts the visual 1s floor.
    const hold = Math.max(DISPLAY_MIN_DWELL_MS, duration);
    const id = ++this.epoch;
    // Below WAIT (20) and play moments so a turn cue can still interrupt; above idle hints.
    this.active = { message: shown, priority: 18, duration: hold, mode: 'amber' };
    this.eventCount++;
    const gate = this.emit({ text: shown, mode: 'amber', compact: true });
    const blinkAt = gate + Math.max(320, hold - Math.min(500, Math.round(hold * 0.28)));
    this.blinkTimer = window.setTimeout(() => {
      if (id !== this.epoch || this.held) return;
      this.emit({ text: shown, mode: 'amber', compact: true, pulse: true });
    }, blinkAt);
    this.timer = window.setTimeout(() => this.finish(id), gate + hold);
  }
  /** A flavour line for this moment, or null. Rare, and never twice in a row for one kind. */
  private pickReaction(event: DisplayEvent): string | null {
    if (!event.flavour) return null;
    return this.flavour.draw(event.flavour.kind, event.flavour.pool, event.key ?? `${event.message}:${this.eventCount}`);
  }
  /** Drop alarm/pulse on the current face without resetting its dwell clock. */
  private clearUrgencyPaint() {
    if (!this.frame.alarm && !this.frame.pulse) return;
    this.frame = { ...this.frame, alarm: false, pulse: false };
    this.show(this.frame);
  }
  event(event: DisplayEvent) {
    if (this.scoreHeld) return;
    if (this.quiet && event.priority < 30) return;
    if (this.active && this.active.priority > event.priority) return;
    this.held = false;
    this.urgency = false;
    this.clearTimers();
    this.clearDwellQueue();
    this.clearUrgencyPaint();
    this.active = event;
    this.eventCount++;
    const id = ++this.epoch;
    const reaction = this.reduced() ? null : this.pickReaction(event);
    const tone = event.flavour?.pool.tone ?? event.mode ?? 'amber';
    // Logical duration also respects the 1s visual floor so finish aligns with paint.
    const duration = Math.max(DISPLAY_MIN_DWELL_MS, event.duration);
    const gate = this.emit({
      text: event.message, mode: event.mode ?? 'amber', compact: event.message.length <= 12,
      ...(event.accent ? { flash: event.accent } : {}), ...(event.pulse ? { pulse: true } : {}),
    });
    // The fact lands first and holds for its full duration. A flavour line may only follow it.
    const motif = event.flavour?.pool.motif;
    const factHold = gate + duration;
    if (reaction && motif) {
      this.timer = window.setTimeout(() => {
        if (id !== this.epoch) return;
        // Prior fact has dwelled ≥1s; these paints are immediate and each hold ≥1s.
        this.emit({ text: '', mode: tone, motif });
        this.timer = window.setTimeout(() => {
          if (id !== this.epoch) return;
          this.emit({ text: reaction, mode: tone, compact: true });
          this.timer = window.setTimeout(() => this.finish(id), DISPLAY_MIN_DWELL_MS);
        }, DISPLAY_MIN_DWELL_MS);
      }, factHold);
    } else if (reaction) {
      this.timer = window.setTimeout(() => {
        if (id !== this.epoch) return;
        this.emit({ text: reaction, mode: tone, compact: true });
        this.timer = window.setTimeout(() => this.finish(id), DISPLAY_MIN_DWELL_MS);
      }, factHold);
    } else {
      this.timer = window.setTimeout(() => this.finish(id), factHold);
    }
  }
  hint(text: string) { if (this.quiet) return; this.event({ message: text, priority: 20, duration: 1050, mode: 'amber' }); }
  /** Hold a word on the sign for the length of a drag; `release` restores the resting face. */
  hold(text: string, mode: LedTone = 'amber') {
    this.held = true;
    this.urgency = false;
    this.clearTimers();
    this.clearDwellQueue();
    this.clearUrgencyPaint();
    this.active = null;
    this.emit({ text, mode, compact: text.length <= 12 });
  }
  /** Hold the score itself on the sign (the lesson that teaches the score); `release` ends it. */
  holdScore() {
    this.scoreHeld = true;
    this.held = true;
    this.urgency = false;
    this.clearTimers();
    this.clearDwellQueue();
    this.clearUrgencyPaint();
    this.active = null;
    this.emit({ text: this.scoreText, mode: 'score' }, { force: true });
  }
  release() {
    this.scoreHeld = false;
    if (!this.held) return;
    this.held = false;
    this.rest();
    this.scheduleIdle();
  }
  private finish(id: number) {
    if (id !== this.epoch) return;
    this.active = null;
    if (this.pendingStep) {
      const next = this.pendingStep;
      this.pendingStep = null;
      // Play-fact → step: brief score beat. Step/skip → step: queue the new cue directly.
      if (!STEP_CUE.test(this.frame.text)) this.rest();
      this.announceStep(next);
      return;
    }
    // Prefer the next step word soon; otherwise a short blank beat, then score.
    if (STEP_WORDS.has(this.instruction)) {
      this.rest();
      this.scheduleIdle(2200);
      return;
    }
    this.emit({ text: '', mode: 'score' });
    this.idleReturn = window.setTimeout(() => {
      if (this.active || this.held || this.urgency) return;
      this.rest();
      this.scheduleIdle(8000);
    }, 2000);
  }
  private scheduleIdle(delay = 2500) {
    window.clearTimeout(this.idleTimer);
    if (this.active || this.held || this.urgency || this.quiet) return;
    if (this.instruction === 'WAIT' || this.instruction === 'OPPONENT TURN' || this.instruction === 'FUTASAKU') return;
    this.idleTimer = window.setTimeout(() => {
      if (this.active || this.held || this.urgency) return;
      this.idleCycles++;
      // Re-prompt the step word only — no idle motif chatter.
      const word = this.instruction;
      if (!STEP_WORDS.has(word)) {
        // Blank beat — never touch sticky urgency (already guarded above).
        this.emit({ text: '', mode: 'score' });
        this.idleReturn = window.setTimeout(() => {
          if (this.active || this.held || this.urgency) return;
          this.rest();
          this.scheduleIdle(8000);
        }, 2000);
        return;
      }
      // Sticky urgency: keep blinking until the player starts the next move (tutorial spirit).
      const soft = (this.idleCycles + this.eventCount) % 8 === 0 && word.endsWith('!');
      this.urgency = true;
      this.clearDwellQueue();
      this.emit({ text: soft ? word.slice(0, -1) : word, mode: 'amber', pulse: true, alarm: true, compact: true });
    }, delay);
  }
  interact() {
    window.clearTimeout(this.idleTimer);
    window.clearTimeout(this.idleReturn);
    this.idleCycles = 0;
    if (this.held) return;
    // Sticky idle urgency holds until hold/event/phase/reset — a fidget tap must not dismiss it.
    if (this.urgency) return;
    if (!this.active) {
      this.rest();
      this.scheduleIdle();
    }
  }
  reset(text: string, you = 0, opp = 0) {
    ++this.epoch;
    this.clearTimers();
    this.clearDwellQueue();
    this.active = null;
    this.held = false;
    this.urgency = false;
    this.pendingStep = null;
    this.eventCount = 0;
    this.flavour.reset();
    this.idleCycles = 0;
    this.instruction = text;
    this.scoreText = `${you}:${opp}`;
    this.shownAt = 0;
    this.frame = { text: '', mode: 'score' };
    if (STEP_WORDS.has(text)) {
      // Opening face is the step word (same as before — no 1s score flash first).
      this.announceStep(text);
    } else {
      this.emit({ text: this.scoreText, mode: 'score' }, { force: true });
      this.scheduleIdle();
    }
  }
  repaint() { this.show(this.frame); }
}
