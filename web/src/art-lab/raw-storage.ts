// Imported FIRST by the lab (before anything that loads channel.ts, which prefixes every storage key
// for the game): the lab writes the phone frame's settings under the frame's own prefix, raw.
const proto = typeof Storage !== 'undefined' ? Storage.prototype : null;
const set = proto?.setItem;
/** Sets a key exactly as named (no channel prefix). */
export const rawSet = (k: string, v: string) => { try { set?.call(localStorage, k, v); } catch { /* storage blocked */ } };
