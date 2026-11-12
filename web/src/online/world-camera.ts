import type { KeyValue } from '../../../server/src/client.js';

export const CAMERA_KEY = 'futasaku.world.camera.v1';
type Camera = [number, number, number, number];
const valid = (box: unknown): box is Camera => Array.isArray(box) && box.length === 4 &&
  box.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1_000_000) &&
  box[2] > 0 && box[3] > 0;

/**
 * WHAT A REMEMBERED FRAME MEANS (owner, 2026-11-02: the anchor "works once and then stops").
 *
 * The stored frame used to have no provenance: every close wrote the box that happened to be on
 * screen, and every later open read it back as a camera the player had chosen. So an automatic or
 * anchored frame — one derived from the window it was shown in — was promoted to a deliberate
 * camera on the next visit, which is exactly why the first visit anchored (0px) and every visit
 * after it re-fitted. Only a frame the player actually panned/zoomed is remembered now, and the
 * `manual` flag is what carries that meaning across a reload. A record written by an older build
 * has no flag and is therefore AUTOMATIC: it may never outrank the menu's own frame.
 */
type CameraRecord = { box: Camera; manual: boolean };
const read = (kv: KeyValue | null, version: number): CameraRecord | null => {
  try {
    const raw = kv?.get(CAMERA_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    const box: unknown = saved?.box;
    return saved?.version === version && valid(box)
      ? { box: [box[0], box[1], box[2], box[3]], manual: saved?.manual === true }
      : null;
  } catch { return null; }
};

/** Only presentation is remembered. Live bounds still clamp the restored view. */
export const rememberCamera = (kv: KeyValue | null, version: number, box: unknown, manual = false): void => {
  if (!valid(box)) return;
  try { kv?.set(CAMERA_KEY, JSON.stringify({ version, box, manual: manual === true })); } catch { /* optional memory */ }
};
/** Anything remembered for this world version, deliberate or not. */
export const lastCamera = (kv: KeyValue | null, version: number): Camera | null => read(kv, version)?.box ?? null;
/**
 * ONLY a camera the PLAYER actually chose (pan, zoom, double-tap). `null` for an automatic frame
 * and for every record written before the `manual` flag existed — those must never stop the
 * menu/territory anchor from applying (see `WorldView.open`).
 */
export const lastChosenCamera = (kv: KeyValue | null, version: number): Camera | null => {
  const saved = read(kv, version);
  return saved?.manual ? saved.box : null;
};
