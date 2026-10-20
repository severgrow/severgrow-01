// Smoother mode (UI overhaul Part 4): watches the frame rate while things animate. Under 50
// frames a second for 3 seconds in a row, it says "drop to Low" once. Pure: the page feeds it
// frame times.
//
// Phase 0 adds the FEEL HARNESS. It is measurement only: no rule, no timing decision and no
// visual reads it. `__severgrow.feel()` is a test-only snapshot of what the player would feel:
// press latency, frame gaps, long tasks, live animations, how many jobs share the one RAF loop,
// and how much hidden/idle material is still in the page. Nothing here uses getComputedStyle or
// getBoundingClientRect, so calling it cannot itself move the layout.
export const PERF_RULES = Object.freeze({ minFps: 50, seconds: 3, ignoreFrameMs: 500 });

export type PerfState = { slowMs: number; done: boolean };
export const perfStart = (): PerfState => ({ slowMs: 0, done: false });

/** One frame: its length in ms. `drop` is true exactly once, when the slow time reaches the limit. */
export const perfStep = (s: PerfState, frameMs: number, r = PERF_RULES): { state: PerfState; drop: boolean } => {
  if (s.done || frameMs > r.ignoreFrameMs) return { state: s, drop: false };
  const slow = frameMs > 1000 / r.minFps;
  const slowMs = slow ? s.slowMs + frameMs : 0;
  if (slowMs >= r.seconds * 1000) return { state: { slowMs, done: true }, drop: true };
  return { state: { slowMs, done: false }, drop: false };
};

export type PressLatency = {
  count: number;
  last: number | null;
  median: number | null;
  max: number | null;
};

export type FrameGap = { at: number; ms: number; subscribers: number };
export type LongTask = { at: number; ms: number };

export type FeelSnapshot = {
  pressLatency: PressLatency;
  frameGaps: { count: number; last: number | null; median: number | null; max: number | null; recent: FrameGap[] };
  longTasks: { count: number; total: number; max: number; recent: LongTask[] };
  liveAnimations: number;
  rafSubscribers: number;
  hidden: { elements: number; animations: number };
  idle: { animations: number; elements: number };
  sampledAt: number;
};

const MAX_SAMPLES = 180;
const pressSamples: number[] = [];
const frameGapSamples: FrameGap[] = [];
const longTasks: LongTask[] = [];

const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};
const round = (n: number): number => Math.round(n * 10) / 10;

/** Called synchronously by the press primitive once it has painted the pressed state. */
export const recordPressLatency = (ms: number): void => {
  if (!Number.isFinite(ms)) return;
  pressSamples.push(Math.max(0, round(ms)));
  if (pressSamples.length > MAX_SAMPLES) pressSamples.splice(0, pressSamples.length - MAX_SAMPLES);
};

/** Called by the one RAF scheduler when a real frame gap is seen while subscribers exist. */
export const recordFrameGap = (at: number, ms: number, subscribers: number): void => {
  if (!Number.isFinite(ms) || ms <= 0) return;
  frameGapSamples.push({ at: Math.round(at), ms: round(ms), subscribers });
  if (frameGapSamples.length > MAX_SAMPLES) frameGapSamples.splice(0, frameGapSamples.length - MAX_SAMPLES);
};

/**
 * Long tasks are already reported by the browser; subscribing costs nothing while idle. Kept
 * separate from Smoother mode so the harness can answer "did the main thread block?" without
 * changing how or when effects are downgraded.
 */
export const observeLongTasks = (): void => {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.push({ at: Math.round(entry.startTime), ms: round(entry.duration) });
        if (longTasks.length > MAX_SAMPLES) longTasks.splice(0, longTasks.length - MAX_SAMPLES);
      }
    });
    observer.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
  } catch {
    // Not every browser exposes longtask; the rest of the harness still works.
  }
};

const LIVE_IDLE = /(idle|breath|ambient|glow|spore|pulse|marquee|led-scroll)/i;

/** A read-only FEEL snapshot. The page hands in the scheduler's subscriber count. */
export const feel = (rafSubscribers = 0): FeelSnapshot => {
  let liveAnimations = 0;
  let idleAnimations = 0;
  let hiddenAnimations = 0;
  let hiddenElements = 0;
  let idleElements = 0;
  if (typeof document !== 'undefined') {
    const animations = document.getAnimations();
    liveAnimations = animations.filter((a) => a.playState === 'running').length;
    const canInspect = typeof KeyframeEffect !== 'undefined' && typeof Element !== 'undefined';
    for (const animation of animations) {
      if (animation.playState !== 'running' || !canInspect) continue;
      const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
      if (!(target instanceof Element)) continue;
      const marker = `${target.id} ${target.getAttribute('class') ?? ''}`;
      if (target.closest('[hidden]')) hiddenAnimations++;
      else if (LIVE_IDLE.test(marker)) idleAnimations++;
    }
    hiddenElements = document.querySelectorAll('[hidden]').length;
    idleElements = document.querySelectorAll('.idle-hint, .ambient, .led-scroll, .marquee').length;
  }
  const gaps = frameGapSamples.map((g) => g.ms);
  return {
    pressLatency: {
      count: pressSamples.length,
      last: pressSamples.at(-1) ?? null,
      median: median(pressSamples),
      max: pressSamples.length ? Math.max(...pressSamples) : null,
    },
    frameGaps: {
      count: frameGapSamples.length,
      last: frameGapSamples.at(-1)?.ms ?? null,
      median: median(gaps),
      max: gaps.length ? Math.max(...gaps) : null,
      recent: frameGapSamples.slice(-12),
    },
    longTasks: {
      count: longTasks.length,
      total: round(longTasks.reduce((sum, t) => sum + t.ms, 0)),
      max: longTasks.length ? Math.max(...longTasks.map((t) => t.ms)) : 0,
      recent: longTasks.slice(-8),
    },
    liveAnimations,
    rafSubscribers,
    hidden: { elements: hiddenElements, animations: hiddenAnimations },
    idle: { animations: idleAnimations, elements: idleElements },
    sampledAt: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) * 10) / 10,
  };
};

/** Tests only: forget samples between scenarios. */
export const resetFeel = (): void => {
  pressSamples.length = 0;
  frameGapSamples.length = 0;
  longTasks.length = 0;
};
