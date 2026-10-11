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

const STEP_WORDS = new Set(['DRAW', 'DRAW!', 'GROW', 'GROW!', 'THROW', 'THROW!', 'BLOOM', 'BLOOM!', 'SKIP?']);

/** One match-scoped clock owns the sign. Its resting face is always the real score. */
export class DisplayMachine {
  private instruction = 'DRAW';
  private scoreText = '0:0';
  private active: DisplayEvent | null = null;
  private timer = 0;
  private idleTimer = 0;
  private idleReturn = 0;
  private blinkTimer = 0;
  private epoch = 0;
  private eventCount = 0;
  private flavour = new FlavourDeck();
  private idleCycles = 0;
  private idleSecretShown = false;
  /** A drag is holding a word on the sign; timers and idle reminders stay out of the way. */
  private held = false;
  /** Queued step announcement while a higher-priority event finishes. */
  private pendingStep: string | null = null;
  private frame: DisplayFrame = { text: '', mode: 'score' };
  constructor(private readonly show: (frame: DisplayFrame) => void) {}

  private emit(frame: DisplayFrame) {
    if (this.frame.text === frame.text && this.frame.mode === frame.mode &&
      this.frame.pulse === frame.pulse && this.frame.alarm === frame.alarm &&
      this.frame.motif === frame.motif && this.frame.flash === frame.flash) return;
    this.frame = frame;
    this.show(frame);
  }
  private rest() { this.emit({ text: this.scoreText, mode: 'score' }); }
  score(you: number, opp: number) {
    const next = `${you}:${opp}`;
    if (next === this.scoreText) return;
    this.scoreText = next;
    if (!this.active && !this.frame.pulse && !this.frame.alarm) this.rest();
  }
  phase(text: string) {
    if (text === this.instruction) return;
    this.instruction = text;
    if (STEP_WORDS.has(text) && text !== 'WAIT') this.announceStep(text);
    else this.interact();
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
    if (roll === 0 && text.endsWith('!')) return { shown: text.slice(0, -1), duration: 1600 };
    if (roll === 1) return { shown: text, duration: 1700 };
    return { shown: text, duration: 2000 };
  }
  /**
   * Show GROW!/THROW!/DRAW! for ~2s (blink in the last 0.5s), then score.
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
    const { shown, duration } = this.reduced() ? { shown: text, duration: 1200 } : this.stepPersonality(text);
    const id = ++this.epoch;
    // Below WAIT (20) and play moments so a turn cue can still interrupt; above idle hints.
    this.active = { message: shown, priority: 18, duration, mode: 'amber' };
    this.eventCount++;
    this.emit({ text: shown, mode: 'amber', compact: true });
    const blinkAt = Math.max(400, duration - 500);
    this.blinkTimer = window.setTimeout(() => {
      if (id !== this.epoch || this.held) return;
      this.emit({ text: shown, mode: 'amber', compact: true, pulse: true });
    }, blinkAt);
    this.timer = window.setTimeout(() => this.finish(id), duration);
  }
  /** A flavour line for this moment, or null. Rare, and never twice in a row for one kind. */
  private pickReaction(event: DisplayEvent): string | null {
    if (!event.flavour) return null;
    return this.flavour.draw(event.flavour.kind, event.flavour.pool, event.key ?? `${event.message}:${this.eventCount}`);
  }
  event(event: DisplayEvent) {
    if (this.active && this.active.priority > event.priority) return;
    this.held = false;
    this.clearTimers();
    this.active = event;
    this.eventCount++;
    const id = ++this.epoch;
    const reaction = this.reduced() ? null : this.pickReaction(event);
    const tone = event.flavour?.pool.tone ?? event.mode ?? 'amber';
    this.emit({
      text: event.message, mode: event.mode ?? 'amber', compact: event.message.length <= 12,
      ...(event.accent ? { flash: event.accent } : {}), ...(event.pulse ? { pulse: true } : {}),
    });
    // The fact lands first and holds for its full duration. A flavour line may only follow it.
    const motif = event.flavour?.pool.motif;
    if (reaction && motif) {
      this.timer = window.setTimeout(() => {
        if (id !== this.epoch) return;
        this.emit({ text: '', mode: tone, motif });
        this.timer = window.setTimeout(() => {
          if (id !== this.epoch) return;
          this.emit({ text: reaction, mode: tone, compact: true });
          this.timer = window.setTimeout(() => this.finish(id), 620);
        }, 440);
      }, event.duration);
    } else if (reaction) {
      this.timer = window.setTimeout(() => {
        if (id !== this.epoch) return;
        this.emit({ text: reaction, mode: tone, compact: true });
        this.timer = window.setTimeout(() => this.finish(id), 620);
      }, event.duration);
    } else {
      this.timer = window.setTimeout(() => this.finish(id), event.duration);
    }
  }
  hint(text: string) { this.event({ message: text, priority: 20, duration: 1050, mode: 'amber' }); }
  /** Hold a word on the sign for the length of a drag; `release` restores the resting face. */
  hold(text: string, mode: LedTone = 'amber') {
    this.held = true;
    this.clearTimers();
    this.active = null;
    this.emit({ text, mode, compact: text.length <= 12 });
  }
  release() {
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
      this.rest();
      this.announceStep(next);
      return;
    }
    this.rest();
    this.scheduleIdle();
  }
  private scheduleIdle(delay = 4000) {
    window.clearTimeout(this.idleTimer);
    if (this.active || this.held) return;
    if (this.instruction === 'WAIT' || this.instruction === 'OPPONENT TURN' || this.instruction === 'FUTASAKU') return;
    this.idleTimer = window.setTimeout(() => {
      if (this.active || this.held) return;
      this.idleCycles++;
      const secret = !this.idleSecretShown && this.idleCycles >= 4 && typeof document !== 'undefined' &&
        !document.documentElement.classList.contains('reduce-motion') &&
        !window.matchMedia('(prefers-reduced-motion:reduce)').matches &&
        (this.scoreText.charCodeAt(0) + this.idleCycles) % 4 === 0;
      if (secret) this.idleSecretShown = true;
      // Stronger alarm blink on the re-prompt (~1/8 soft skip of the bang).
      const word = this.instruction;
      const soft = !secret && (this.idleCycles + this.eventCount) % 8 === 0 && word.endsWith('!');
      this.emit(secret
        ? { text: '', mode: 'cyan', motif: 'eyes' }
        : { text: soft ? word.slice(0, -1) : word, mode: 'amber', pulse: true, alarm: true, compact: true });
      this.idleReturn = window.setTimeout(() => {
        if (this.active) return;
        this.rest();
        this.scheduleIdle(12000);
      }, 1200);
    }, delay);
  }
  interact() {
    window.clearTimeout(this.idleTimer);
    window.clearTimeout(this.idleReturn);
    this.idleCycles = 0;
    if (this.held) return;
    if (!this.active) {
      this.rest();
      this.scheduleIdle();
    }
  }
  reset(text: string, you = 0, opp = 0) {
    ++this.epoch;
    this.clearTimers();
    this.active = null;
    this.held = false;
    this.pendingStep = null;
    this.eventCount = 0;
    this.flavour.reset();
    this.idleCycles = 0;
    this.idleSecretShown = false;
    this.instruction = text;
    this.scoreText = `${you}:${opp}`;
    this.rest();
    if (STEP_WORDS.has(text)) this.announceStep(text);
    else this.scheduleIdle();
  }
  repaint() { this.show(this.frame); }
}
