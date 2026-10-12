// Phase 7 — Find Opponent stays off unless the preview flag/channel is set.
import { describe, expect, it } from 'vitest';
import { findOpponentEnabled } from '../src/online/config.js';

describe('findOpponentEnabled', () => {
  it('is off in the default product build (no VITE_FIND_OPPONENT)', () => {
    // __CHANNEL__ is futa04 in unit tests via vite define default path when unset —
    // config reads import.meta.env which vitest leaves empty, so flag stays false.
    expect(findOpponentEnabled()).toBe(false);
  });
});
