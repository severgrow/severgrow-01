// The designer's work stays on their device (owner): one IndexedDB record, saved after every change
// and read back on reload. "Clear all" deletes it. No server, no account, no upload.
import type { LabState } from './pack.js';

const DB = 'futasaku-art-lab', STORE = 'packs', KEY = 'current';

const open = () => new Promise<IDBDatabase>((ok, fail) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => ok(r.result);
  r.onerror = () => fail(r.error ?? new Error('Storage is blocked in this browser.'));
});

const tx = async <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  try {
    return await new Promise<T>((ok, fail) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => fail(req.error ?? new Error('Storage failed.'));
    });
  } finally { db.close(); }
};

export const loadState = async (): Promise<LabState | null> => {
  try { return ((await tx('readonly', (s) => s.get(KEY))) as LabState | undefined) ?? null; } catch { return null; }
};
/** Saves the whole pack; false when the browser refused (private mode, storage full). */
export const saveState = async (state: LabState): Promise<boolean> => {
  try { await tx('readwrite', (s) => s.put(state, KEY)); return true; } catch { return false; }
};
export const clearState = async () => { try { await tx('readwrite', (s) => s.delete(KEY)); } catch { /* nothing stored */ } };
