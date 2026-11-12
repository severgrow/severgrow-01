// UNDO IS ONE PRESS (owner, 2026-10-25): "undo shouldnt need 2 taps to confirm - undo button undoes
// the latest move straight away".
//
// The button used to ask `session.pending || session.presetMove` first, and spend the press on
// clearing the pick. But `pending` is DERIVED from the pick (it is the move the picked hex would
// play), so merely having a hex picked made the first press a cancel and only the second one an
// undo. The decision is now one pure function, and these are its every branch — including the
// question it must ask of the RIGHT session (online the stack lives on the OnlineSession).
import { describe, expect, it } from 'vitest';
import { undoIntent } from '../src/logic/undo.js';
import type { UndoAsks } from '../src/logic/undo.js';

const asks = (over: Partial<UndoAsks> = {}): UndoAsks => ({
  canUndo: false,
  hasStagedPreview: false,
  hasSelection: false,
  online: false,
  ...over,
});

describe('undo takes back the last move', () => {
  it('a move that was played wins every time: ONE press, whatever is picked or waiting', () => {
    for (const hasSelection of [false, true]) {
      for (const hasStagedPreview of [false, true]) {
        for (const online of [false, true]) {
          expect(undoIntent(asks({ canUndo: true, hasSelection, hasStagedPreview, online }))).toBe('undo');
        }
      }
    }
  });

  it('a merely picked hex no longer swallows the press (the owner’s two taps)', () => {
    // The exact state the old first branch tested: a pick, so `session.pending` was truthy — and a
    // Grow already played, so there is something to take back. It must undo, not cancel.
    expect(undoIntent(asks({ canUndo: true, hasSelection: true }))).toBe('undo');
  });

  it('a drawn placement waiting for Confirm does not stand in for the move either', () => {
    expect(undoIntent(asks({ canUndo: true, hasStagedPreview: true }))).toBe('undo');
    expect(undoIntent(asks({ canUndo: true, hasStagedPreview: true, hasSelection: true }))).toBe('undo');
  });

  it('with nothing to take back, a staged preview is cancelled (never a wasted press)', () => {
    expect(undoIntent(asks({ hasStagedPreview: true }))).toBe('cancel');
    expect(undoIntent(asks({ hasStagedPreview: true, hasSelection: true }))).toBe('cancel');
  });

  it('with nothing to take back, a pick is cleared — it never falls through to the Replay slot', () => {
    expect(undoIntent(asks({ hasSelection: true }))).toBe('cancel');
  });

  it('nothing to undo, nothing waiting: the button is inert (already disabled, or its Replay mode)', () => {
    expect(undoIntent(asks())).toBe('none');
  });
});

describe('the online duel keeps its own answer', () => {
  it('the slot’s one job is the draft: online it never invents a cancel', () => {
    // Online there is no Replay mode for the same button, and the offline mirror the page rebuilds
    // after every move has an empty stack — so a local pick is not a reason to spend the press.
    expect(undoIntent(asks({ online: true, hasSelection: true }))).toBe('none');
    expect(undoIntent(asks({ online: true, hasStagedPreview: true }))).toBe('none');
    expect(undoIntent(asks({ online: true, hasStagedPreview: true, hasSelection: true }))).toBe('none');
    expect(undoIntent(asks({ online: true }))).toBe('none');
  });

  it('a draft that can be taken back still undoes, in one press, online too', () => {
    expect(undoIntent(asks({ online: true, canUndo: true }))).toBe('undo');
    expect(undoIntent(asks({ online: true, canUndo: true, hasSelection: true, hasStagedPreview: true }))).toBe('undo');
  });
});
