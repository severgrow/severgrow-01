import type { DisplayEvent } from './display-readout.js';
import type { LedMotif, LedTone } from './led-cells.js';

export type DisplayFrame = { text: string; mode: LedTone; pulse?: boolean; compact?: boolean; motif?: LedMotif };

/** One match-scoped clock owns the sign. Its resting face is always the real score. */
export class DisplayMachine {
  private instruction = 'DRAW';
  private scoreText = '0:0';
  private active: DisplayEvent | null = null;
  private timer = 0;
  private idleTimer = 0;
  private idleReturn = 0;
  private epoch = 0;
  private eventCount = 0;
  private lastReactionAt = -10;
  private recentReactions: string[] = [];
  private idleCycles = 0;
  private idleSecretShown = false;
  private frame: DisplayFrame = { text:'', mode:'score' };
  constructor(private readonly show: (frame: DisplayFrame) => void) {}

  private emit(frame: DisplayFrame) {
    if (this.frame.text === frame.text && this.frame.mode === frame.mode &&
      this.frame.pulse === frame.pulse && this.frame.motif === frame.motif) return;
    this.frame = frame;
    this.show(frame);
  }
  private rest() { this.emit({text:this.scoreText,mode:'score'}); }
  score(you: number, opp: number) {
    const next = `${you}:${opp}`;
    if (next === this.scoreText) return;
    this.scoreText = next;
    if (!this.active && !this.frame.pulse) this.rest();
  }
  phase(text: string) {
    if (text === this.instruction) return;
    this.instruction = text;
    this.interact();
  }
  private clearTimers() {
    window.clearTimeout(this.timer);
    window.clearTimeout(this.idleTimer);
    window.clearTimeout(this.idleReturn);
  }
  private pickReaction(event: DisplayEvent): string | null {
    this.eventCount++;
    const personality = event.personality;
    if (!personality || (event.priority < 95 && this.eventCount - this.lastReactionAt < 3)) return null;
    // Cosmetic choice is reproducible and never consumes the engine's random stream.
    let hash = 2166136261;
    for (const char of event.key ?? `${event.message}:${this.eventCount}`)
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    if ((hash >>> 0) % 100 >= personality.chance) return null;
    const choices = personality.lines.filter(line => !this.recentReactions.includes(line));
    const pool = choices.length ? choices : personality.lines;
    const chosen = pool[((hash >>> 8) % pool.length)] ?? null;
    if (chosen) {
      this.lastReactionAt = this.eventCount;
      this.recentReactions.push(chosen);
      this.recentReactions = this.recentReactions.slice(-2);
    }
    return chosen;
  }
  event(event: DisplayEvent) {
    if (this.active && this.active.priority > event.priority) return;
    this.clearTimers();
    this.active = event;
    const id = ++this.epoch;
    const reaction = this.pickReaction(event);
    const reduced = typeof document !== 'undefined' && (document.documentElement.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion:reduce)').matches);
    const message = () => {
      if (id !== this.epoch) return;
      this.emit({text:event.message,mode:event.mode ?? 'amber',compact:event.message.length <= 12});
      this.timer = window.setTimeout(() => this.finish(id),event.duration);
    };
    if (reaction && !reduced && event.personality?.motif) {
      this.emit({text:'',mode:event.personality.tone ?? event.mode ?? 'amber',motif:event.personality.motif});
      this.timer = window.setTimeout(() => {
        if (id !== this.epoch) return;
        this.emit({text:reaction,mode:event.personality?.tone ?? event.mode ?? 'amber',compact:true});
        this.timer = window.setTimeout(message,680);
      },440);
    } else if (reaction && !reduced) {
      this.emit({text:reaction,mode:event.personality?.tone ?? event.mode ?? 'amber',compact:true});
      this.timer = window.setTimeout(message,680);
    } else message();
  }
  hint(text: string) { this.event({message:text,priority:20,duration:1050,mode:'amber'}); }
  private finish(id: number) {
    if (id !== this.epoch) return;
    this.active = null;
    this.rest();
    this.scheduleIdle();
  }
  private scheduleIdle(delay = 6000) {
    window.clearTimeout(this.idleTimer);
    if (this.active || this.instruction === 'WAIT' || this.instruction === 'OPPONENT TURN' || this.instruction === 'FUTASAKU') return;
    this.idleTimer = window.setTimeout(() => {
      if (this.active) return;
      this.idleCycles++;
      const secret = !this.idleSecretShown && this.idleCycles >= 4 && typeof document !== 'undefined' &&
        !document.documentElement.classList.contains('reduce-motion') &&
        !window.matchMedia('(prefers-reduced-motion:reduce)').matches &&
        (this.scoreText.charCodeAt(0) + this.eventCount) % 4 === 0;
      if (secret) this.idleSecretShown = true;
      this.emit(secret ? {text:'',mode:'cyan',motif:'eyes'} : {text:this.instruction,mode:'amber',pulse:true,compact:true});
      this.idleReturn = window.setTimeout(() => {
        if (this.active) return;
        this.rest();
        this.scheduleIdle(18000);
      },1050);
    },delay);
  }
  interact() {
    window.clearTimeout(this.idleTimer);
    window.clearTimeout(this.idleReturn);
    this.idleCycles = 0;
    if (!this.active) {
      this.rest();
      this.scheduleIdle();
    }
  }
  reset(text: string, you = 0, opp = 0) {
    ++this.epoch;
    this.clearTimers();
    this.active = null;
    this.eventCount = 0;
    this.lastReactionAt = -10;
    this.recentReactions = [];
    this.idleCycles = 0;
    this.idleSecretShown = false;
    this.instruction = text;
    this.scoreText = `${you}:${opp}`;
    this.rest();
    this.scheduleIdle();
  }
  repaint() { this.show(this.frame); }
}
