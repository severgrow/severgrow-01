// Runs the bot off the main thread, so the page never freezes while it thinks.
import type { Action, View } from '../../src/engine/index.js';
import { chooseAction } from './bot.js';

self.onmessage = (e: MessageEvent<{ id: number; view: View }>) => {
  const action: Action = chooseAction(e.data.view);
  (self as unknown as Worker).postMessage({ id: e.data.id, action });
};
