// Asks the bot for a move in a Web Worker, so the page stays responsive while it
// thinks. Falls back to the main thread if workers are not available or fail.
import type { Action, Player, State, View } from '../../../src/engine/index.js';
import { chooseLevelAction } from '../../../src/bots/levels.js';
import type { Level } from '../../../src/bots/levels.js';
import type { TurningPoint } from '../../../src/bots/review.js';

type Job = { view: View; level: Level; seed: number; resolve: (a: Action) => void };
let worker: Worker | null = null;
let failed = false;
let nextId = 1;
const jobs = new Map<number, Job>();
/** Game reviews waiting on the worker. A review is a nicety: without a worker there is none. */
const reviews = new Map<number, (p: TurningPoint | null) => void>();

const fallBack = () => {
  failed = true;
  worker?.terminate();
  worker = null;
  for (const [id, job] of jobs) {
    jobs.delete(id);
    setTimeout(() => job.resolve(chooseLevelAction(job.view, job.level, job.seed)), 0);
  }
  for (const [id, resolve] of reviews) {
    reviews.delete(id);
    resolve(null);
  }
};

const getWorker = (): Worker | null => {
  if (failed) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../bot.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; action: Action } | { id: number; point: TurningPoint | null }>) => {
      if ('point' in e.data) {
        reviews.get(e.data.id)?.(e.data.point);
        reviews.delete(e.data.id);
        return;
      }
      jobs.get(e.data.id)?.resolve(e.data.action);
      jobs.delete(e.data.id);
    };
    worker.onerror = fallBack;
    return worker;
  } catch {
    failed = true;
    return null;
  }
};

/** The bot's move at `level`, with the game's seeded randomness (see botSeed). */
export const askBot = (view: View, level: Level, seed: number): Promise<Action> =>
  new Promise((resolve) => {
    const w = getWorker();
    if (!w) {
      setTimeout(() => resolve(chooseLevelAction(view, level, seed)), 0);
      return;
    }
    const id = nextId++;
    jobs.set(id, { view, level, seed, resolve });
    w.postMessage({ id, view, level, seed });
  });

/** The finished game's turning point for `me` (see src/bots/review.ts), worked out off the main thread. */
export const askReview = (start: State, log: readonly Action[], me: Player, end: State): Promise<TurningPoint | null> =>
  new Promise((resolve) => {
    const w = getWorker();
    if (!w) return resolve(null);
    const id = nextId++;
    reviews.set(id, resolve);
    w.postMessage({ id, review: { start, log: [...log], me, end } });
  });
