import type { DisplayEvent } from './display-readout.js';

export type DisplayFrame = { text: string; mode: 'amber' | 'red'; pulse?: boolean; compact?: boolean };

/** One clock owns the sign. Newer, stronger events replace weaker ones; nothing stale queues up. */
export class DisplayMachine {
  private instruction = 'DRAW';
  private active: DisplayEvent | null = null;
  private timer = 0;
  private idleTimer = 0;
  private pulseTimer = 0;
  private pulsing = false;
  private epoch = 0;
  private frame: DisplayFrame = { text:'', mode:'amber' };
  constructor(private readonly show: (frame: DisplayFrame) => void) {}
  private emit(text: string, mode: 'amber'|'red', compact = false) {
    const next = { text, mode, compact };
    if (this.frame.text === text && this.frame.mode === mode && !!this.frame.compact === compact) return;
    this.frame = next; this.show(next);
  }
  phase(text: string) {
    if (text === this.instruction) return;
    this.instruction = text;
    if (!this.active) this.emit(text,'amber');
    this.interact();
  }
  event(event: DisplayEvent) {
    if (this.active && this.active.priority > event.priority) return;
    this.interact();
    this.active = event;
    const id = ++this.epoch;
    window.clearTimeout(this.timer);
    window.clearTimeout(this.idleTimer);
    this.emit(event.message,event.mode ?? 'red',true);
    this.timer = window.setTimeout(() => {
      if (id !== this.epoch) return;
      const showScore = () => {
        if (event.score && event.score !== event.message) {
          this.emit(event.score,'red',true);
          this.timer = window.setTimeout(() => this.finish(id),1550);
        } else this.finish(id);
      };
      if (event.followup) {
        this.emit(event.followup,event.mode ?? 'red',true);
        this.timer = window.setTimeout(showScore,1300);
      } else showScore();
    },event.duration);
  }
  hint(text: string) { this.event({message:text,priority:20,duration:1250,mode:'amber'}); }
  private finish(id: number) {
    if (id !== this.epoch) return;
    this.active = null;
    this.emit(this.instruction,'amber');
    this.interact();
  }
  interact() {
    window.clearTimeout(this.idleTimer);
    window.clearTimeout(this.pulseTimer);
    if (this.pulsing) { this.pulsing = false; this.show({...this.frame,pulse:false}); }
    if (this.active || this.instruction === 'OPPONENT TURN' || this.instruction === 'FUTASAKU') return;
    this.idleTimer = window.setTimeout(() => {
      if (this.active) return;
      this.pulsing = true;
      this.show({...this.frame,pulse:true});
      this.pulseTimer = window.setTimeout(() => { this.pulsing = false; this.show({...this.frame,pulse:false}); },480);
    },4000);
  }
  reset(text: string) {
    ++this.epoch; this.active = null;
    window.clearTimeout(this.timer); window.clearTimeout(this.idleTimer); window.clearTimeout(this.pulseTimer);
    this.pulsing = false;
    this.instruction = text; this.emit(text,'amber'); this.interact();
  }
  repaint() { this.show(this.frame); }
}
