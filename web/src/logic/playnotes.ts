// Step 10: local playtest notes (the hidden ?debug=1 page only). A short log of my own turns
// kept in this browser: average time per turn, Undo count, empty turns, and where I paused
// longest. Nothing is sent anywhere; "Export as JSON" saves it as a file.

export type NoteEvent =
  | { t: 'turnStart' | 'turnEnd' | 'undo' | 'empty'; at: number }
  | { t: 'input'; at: number; where: string };
export type Notes = { events: NoteEvent[] };

export const NOTES_KEY = 'severgrow.playnotes.v1';
const MAX = 500;

export const emptyNotes = (): Notes => ({ events: [] });
export const noteEvent = (n: Notes, e: NoteEvent): Notes => ({ events: [...n.events, e].slice(-MAX) });

export const notesSummary = (n: Notes) => {
  const turns: number[] = [];
  let start: number | null = null;
  let last: number | null = null;
  let undos = 0;
  let emptyTurns = 0;
  let longestPause: { ms: number; before: string } | null = null;
  for (const e of n.events) {
    if (e.t === 'turnStart') {
      start = e.at;
      last = e.at;
    } else if (e.t === 'turnEnd') {
      if (start !== null) turns.push(e.at - start);
      start = null;
      last = null;
    } else if (e.t === 'undo') undos++;
    else if (e.t === 'empty') emptyTurns++;
    else if (e.t === 'input') {
      if (last !== null && (!longestPause || e.at - last > longestPause.ms)) longestPause = { ms: e.at - last, before: e.where };
      last = e.at;
    }
  }
  return { turns: turns.length, avgTurnMs: turns.length ? turns.reduce((a, b) => a + b, 0) / turns.length : 0, undos, emptyTurns, longestPause };
};
