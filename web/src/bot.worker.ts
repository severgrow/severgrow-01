// Runs the bot off the main thread, so the page never freezes while it thinks. The finished
// game's review (src/bots/review.ts) runs here too: it replays the whole game, so it is too long
// for the main thread.
import type { Action, Player, State, View } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';
import type { Level } from '../../src/bots/levels.js';
import { findTurningPoint } from '../../src/bots/review.js';

type Ask = { id: number; view: View; level: Level; seed: number };
type Review = { id: number; review: { start: State; log: Action[]; me: Player; end: State } };

self.onmessage = (e: MessageEvent<Ask | Review>) => {
  const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);
  if ('review' in e.data) {
    const { start, log, me, end } = e.data.review;
    post({ id: e.data.id, point: findTurningPoint(start, log, me, { end }) });
    return;
  }
  const action: Action = chooseLevelAction(e.data.view, e.data.level, e.data.seed);
  post({ id: e.data.id, action });
};
