// The install invitation's counting rule. The rule is a pure function so it can be pinned here:
// 1st-game win, else 2nd game, then every 5; the tutorial never counts, installed never sees it,
// "Don't show again" is forever, and it never appears twice in one session.
import { describe, expect, it } from 'vitest';
import {
  EMPTY_INSTALL_PROMPT,
  InstallInvitation,
  countGame,
  installVariant,
  parseInstallPrompt,
  serializeInstallPrompt,
  shouldInvite,
} from '../src/logic/install-prompt.js';
import type { GameOutcome, InstallPromptMemory } from '../src/logic/install-prompt.js';

/** A fresh in-memory store shared by a controller and the test (the page's own storage). */
const store = (initial: string | null = null) => {
  let raw = initial;
  return {
    get: () => raw,
    set: (m: InstallPromptMemory) => {
      raw = serializeInstallPrompt(m);
    },
    raw: () => raw,
  };
};

const controller = (saved: string | null = null, installed = false) => {
  const box = store(saved);
  const invitation = new InstallInvitation(box.get(), { installed: () => installed, save: box.set });
  return { invitation, box };
};

const invite = (after: Partial<InstallPromptMemory>, outcome: GameOutcome, conditions = {}) =>
  shouldInvite(
    { ...EMPTY_INSTALL_PROMPT, ...after },
    outcome,
    { installed: false, shownThisSession: false, ...conditions },
  );

describe('install invitation: the counting rule', () => {
  it('offers after winning the very first game', () => {
    expect(invite({ games: 1 }, 'won')).toBe(true);
  });

  it('stays quiet when the first game is lost or drawn', () => {
    expect(invite({ games: 1 }, 'lost')).toBe(false);
    expect(invite({ games: 1 }, 'draw')).toBe(false);
  });

  it('offers after the second game whatever its outcome (first game not won)', () => {
    expect(invite({ games: 2 }, 'lost')).toBe(true);
    expect(invite({ games: 2 }, 'draw')).toBe(true);
    expect(invite({ games: 2 }, 'won')).toBe(true);
  });

  it('does not offer again at the second game when the first-win offer was already made', () => {
    expect(invite({ games: 2, shown: true }, 'won')).toBe(false);
  });

  it('then offers at 5, 10, 15 … games and nowhere else', () => {
    for (const n of [5, 10, 15, 20]) expect(invite({ games: n }, 'lost'), `game ${n}`).toBe(true);
    for (const n of [3, 4, 6, 7, 8, 9, 11]) expect(invite({ games: n }, 'lost'), `game ${n}`).toBe(false);
  });

  it('never offers when the app is already installed', () => {
    expect(invite({ games: 1 }, 'won', { installed: true })).toBe(false);
    expect(invite({ games: 5 }, 'won', { installed: true })).toBe(false);
  });

  it('never offers twice in one session', () => {
    expect(invite({ games: 5 }, 'lost', { shownThisSession: true })).toBe(false);
  });

  it('never offers after "Don\'t show again"', () => {
    expect(invite({ games: 1, never: true }, 'won')).toBe(false);
    expect(invite({ games: 5, never: true }, 'won')).toBe(false);
  });
});

describe('install invitation: memory', () => {
  it('counts one game per finish and never changes the memory it is given', () => {
    const before = { ...EMPTY_INSTALL_PROMPT };
    expect(countGame(before)).toEqual({ games: 1, shown: false, never: false });
    expect(before).toEqual(EMPTY_INSTALL_PROMPT);
  });

  it('repairs a broken or empty save', () => {
    expect(parseInstallPrompt(null)).toEqual(EMPTY_INSTALL_PROMPT);
    expect(parseInstallPrompt('{not json')).toEqual(EMPTY_INSTALL_PROMPT);
    expect(parseInstallPrompt(JSON.stringify({ games: -2, shown: 'yes', never: 1 }))).toEqual(EMPTY_INSTALL_PROMPT);
    expect(parseInstallPrompt(JSON.stringify({ games: 3.5 }))).toEqual(EMPTY_INSTALL_PROMPT);
    expect(parseInstallPrompt(JSON.stringify({ games: 4, shown: true, never: true }))).toEqual({ games: 4, shown: true, never: true });
  });

  it('survives a reload: the saved games are read back', () => {
    const { invitation, box } = controller();
    invitation.finished('lost');
    invitation.finished('lost');
    expect(invitation.games).toBe(2);
    expect(box.raw()).not.toBeNull();
    // A new page (same device) starts from the saved memory, not from zero.
    const reloaded = new InstallInvitation(box.raw(), { installed: () => false, save: () => undefined });
    expect(reloaded.games).toBe(2);
  });

  it('keeps "Don\'t show again" forever on the device', () => {
    const { invitation, box } = controller();
    invitation.neverAgain();
    expect(invitation.never).toBe(true);
    const reloaded = new InstallInvitation(box.raw(), { installed: () => false, save: () => undefined });
    // Even a win on game 1 cannot bring it back.
    expect(reloaded.finished('won')).toBe(false);
    expect(reloaded.never).toBe(true);
  });
});

describe('install invitation: the online gap', () => {
  it('an online win advances the trigger (online finishes use the same counter)', () => {
    // A player who only ever plays online: the very first ONLINE win must raise the invitation,
    // exactly as an offline win would. If online finishes were not counted this would be false.
    const onlyOnline = controller();
    expect(onlyOnline.invitation.games).toBe(0);
    expect(onlyOnline.invitation.finished('won')).toBe(true);
    expect(onlyOnline.invitation.games).toBe(1);
    // …and the next online game does not nag: one invitation per session.
    expect(onlyOnline.invitation.finished('lost')).toBe(false);
    expect(onlyOnline.invitation.games).toBe(2);
  });

  it('an online loss followed by an online win still lands on the second-game gate', () => {
    const { invitation } = controller();
    expect(invitation.finished('lost')).toBe(false); // first online game, lost: wait
    expect(invitation.finished('won')).toBe(true); // second online game: offer
  });
});

describe('install invitation: which face to show', () => {
  it('uses the browser dialog only when the native prompt was captured', () => {
    expect(installVariant({ ios: false, hasNativePrompt: true })).toBe('native');
    expect(installVariant({ ios: true, hasNativePrompt: false })).toBe('ios');
    expect(installVariant({ ios: false, hasNativePrompt: false })).toBe('manual');
  });
});
