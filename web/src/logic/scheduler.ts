// Phase 0: ONE frame scheduler.
//
// The page has one RAF loop. Work subscribes to it (continuous visual jobs) or requests a
// coalesced one-off job. The loop exists only while there is work to do, and pauses when the tab
// is hidden, the game screen is hidden, or the board is off-screen. Nothing else starts its own
// requestAnimationFrame chain for a long-lived animation.
//
// The scheduler never reads layout: no getBoundingClientRect and no getComputedStyle per frame.
import { recordFrameGap } from './perf.js';

export type FrameInfo = {
  /** performance.now() for this frame. */
  now: number;
  /** Milliseconds since the previous frame that actually ran. */
  dt: number;
};

export type SubscriberOptions = {
  /** Urgent jobs run before the ordinary work in the same frame. */
  urgent?: boolean;
};

type Subscriber = { fn: (frame: FrameInfo) => void; urgent: boolean };
type Job = { fn: (frame: FrameInfo) => void; urgent: boolean };

export type FrameSchedulerOptions = {
  requestFrame?: (cb: (t: number) => void) => number;
  cancelFrame?: (id: number) => void;
  now?: () => number;
  /** A scheduler-level pause (the gates below also feed it). */
  isPaused?: () => boolean;
};

/**
 * A tiny scheduler that owns exactly one `requestAnimationFrame`. Everything is injectable so the
 * unit test can advance frames by hand and prove that no nested loops or duplicate frames exist.
 */
export class FrameScheduler {
  private readonly frames = new Map<number, Subscriber>();
  private readonly jobs = new Map<string, Job>();
  private readonly gates = new Set<() => boolean>();
  private nextId = 1;
  private raf = 0;
  private ticking = false;
  private last = 0;
  private readonly requestFrame: (cb: (t: number) => void) => number;
  private readonly cancelFrame: (id: number) => void;
  private readonly now: () => number;
  private readonly schedulerPaused: () => boolean;

  constructor(options: FrameSchedulerOptions = {}) {
    this.requestFrame = options.requestFrame ?? ((cb) => requestAnimationFrame(cb));
    this.cancelFrame = options.cancelFrame ?? ((id) => cancelAnimationFrame(id));
    this.now = options.now ?? (() => performance.now());
    this.schedulerPaused = options.isPaused ?? (() => false);
  }

  /** Add one continuous subscriber. Returns the unsubscribe function. */
  subscribe(fn: (frame: FrameInfo) => void, options: SubscriberOptions = {}): () => void {
    const id = this.nextId++;
    this.frames.set(id, { fn, urgent: !!options.urgent });
    this.wake();
    return () => {
      this.frames.delete(id);
      this.settleIfIdle();
    };
  }

  /**
   * Ask for one frame of work. A repeated request with the same key (a pointer moving several
   * times in one frame) replaces the earlier one, so non-urgent work is coalesced.
   */
  request(key: string, fn: (frame: FrameInfo) => void, options: SubscriberOptions = {}): void {
    this.jobs.set(key, { fn, urgent: !!options.urgent });
    this.wake();
  }

  /** Add a pause gate. Returns a function that removes it. */
  addGate(gate: () => boolean): () => void {
    this.gates.add(gate);
    this.wake();
    return () => {
      this.gates.delete(gate);
      this.wake();
    };
  }

  /** Number of continuous subscribers (the feel harness reports this). */
  subscriberCount(): number {
    return this.frames.size;
  }

  /** Number of coalesced one-off jobs waiting for the next frame. */
  pendingJobs(): number {
    return this.jobs.size;
  }

  paused(): boolean {
    if (this.schedulerPaused()) return true;
    for (const gate of this.gates) if (gate()) return true;
    return false;
  }

  /** Re-evaluate the gates; starts the loop again when work exists and nothing is paused. */
  wake(): void {
    if (this.ticking || this.raf || !this.hasWork()) return;
    if (this.paused()) return;
    this.last = 0;
    this.raf = this.requestFrame((t) => this.tick(t));
  }

  /** Stops the loop without dropping subscribers (paused, or the page is going away). */
  stop(): void {
    if (this.raf) this.cancelFrame(this.raf);
    this.raf = 0;
    this.last = 0;
  }

  /** Tests only: has a frame been requested right now? */
  running(): boolean {
    return this.raf !== 0;
  }

  private hasWork(): boolean {
    return this.frames.size > 0 || this.jobs.size > 0;
  }

  private settleIfIdle(): void {
    if (!this.hasWork()) this.stop();
  }

  private tick(t: number): void {
    this.raf = 0;
    if (!this.hasWork()) return;
    if (this.paused()) {
      this.last = 0;
      return;
    }
    const now = Number.isFinite(t) ? t : this.now();
    const dt = this.last ? now - this.last : 0;
    if (dt > 50) recordFrameGap(now - dt, dt, this.frames.size);
    this.last = now;
    const info: FrameInfo = { now, dt };

    this.ticking = true;
    const jobs = [...this.jobs.values()];
    this.jobs.clear();
    let failure: unknown;
    try {
      for (const job of jobs.filter((j) => j.urgent)) job.fn(info);
      for (const sub of [...this.frames.values()].filter((s) => s.urgent)) sub.fn(info);
      for (const job of jobs.filter((j) => !j.urgent)) job.fn(info);
      for (const sub of [...this.frames.values()].filter((s) => !s.urgent)) sub.fn(info);
    } catch (error) {
      failure = error;
    } finally {
      this.ticking = false;
    }

    // A broken subscriber must not take the one loop down with it.
    if (this.hasWork() && !this.paused()) this.raf = this.requestFrame((next) => this.tick(next));
    if (failure) queueMicrotask(() => { throw failure; });
  }
}

/** The browser's one scheduler. The page attaches its pause targets in boot. */
export const scheduler = new FrameScheduler();

let attached = false;

/**
 * Pause the one loop on: the document hidden, `#game` hidden, or `#board-wrap` off-screen. The
 * board test uses IntersectionObserver, so it never reads geometry per frame.
 */
export const attachSchedulerPause = (game: HTMLElement, board: HTMLElement): (() => void) => {
  if (attached) return () => undefined;
  attached = true;
  let boardOnScreen = true;
  const gate = () => document.hidden || !!game.hidden || !boardOnScreen;
  const removeGate = scheduler.addGate(gate);

  const onVisibility = () => scheduler.wake();
  document.addEventListener('visibilitychange', onVisibility, { passive: true });

  const onScreen = () => {
    boardOnScreen = true;
    scheduler.wake();
  };
  const offScreen = () => {
    boardOnScreen = false;
    scheduler.stop();
  };
  const observer = typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (entry.isIntersecting) onScreen();
      else offScreen();
    }, { threshold: 0.01 });
  observer?.observe(board);

  const screen = new MutationObserver(() => scheduler.wake());
  screen.observe(game, { attributes: true, attributeFilter: ['hidden'] });

  return () => {
    observer?.disconnect();
    screen.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    removeGate();
    attached = false;
  };
};
