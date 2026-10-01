// Runs the bot off the main thread, so the page never freezes while it thinks.
import type { Action, View } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';
import type { Level } from '../../src/bots/levels.js';

self.onmessage = (e: MessageEvent<{ id: number; view: View; level: Level; seed: number }>) => {
  const action: Action = chooseLevelAction(e.data.view, e.data.level, e.data.seed);
  (self as unknown as Worker).postMessage({ id: e.data.id, action });
};
