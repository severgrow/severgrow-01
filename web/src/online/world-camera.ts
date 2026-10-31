import type { KeyValue } from '../../../server/src/client.js';

export const CAMERA_KEY = 'futasaku.world.camera.v1';
type Camera = [number, number, number, number];
const valid = (box: unknown): box is Camera => Array.isArray(box) && box.length === 4 &&
  box.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1_000_000) &&
  box[2] > 0 && box[3] > 0;

/** Only presentation is remembered. Live bounds still clamp the restored view. */
export const rememberCamera = (kv: KeyValue | null, version: number, box: unknown): void => {
  if (!valid(box)) return;
  try { kv?.set(CAMERA_KEY, JSON.stringify({ version, box })); } catch { /* optional memory */ }
};
export const lastCamera = (kv: KeyValue | null, version: number): Camera | null => {
  try {
    const raw = kv?.get(CAMERA_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    const box: unknown = saved?.box;
    return saved?.version === version && valid(box) ? [box[0],box[1],box[2],box[3]] : null;
  } catch { return null; }
};
