// ONE WAY OUT OF THE LOBBY FOR A MATCH (owner report, 2026-10-28).
//
// Owner, verbatim: "BIG BUG - accepting challenge in territory opens the duel screen under it - see
// screenshot, everything on top of eachother - can never happen."
//
// Cause: `showScreen()` in `web/src/main.ts` hid the HUB, WAITING and JOIN screens but not the
// Territory map (`#online-world-screen`), and `openDuel` never asked the lobby to hide its screens.
// The map kept painting over `#game`, which had already been switched on underneath.
//
// The fix is structural: one list of lobby screens, one helper that hides them all, and the screen
// change itself calls it — so an entry point that forgets the transition still cannot stack screens.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LOBBY_SCREEN_IDS,
  hideLobbySurfaces,
  leaveLobbyForMatch,
  lobbyScreensToHide,
} from '../src/online/lobby-exit.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

type FakeScreen = { hidden: boolean; dataset: { ixState?: string } };

/** The smallest stand-in for a Document: the four lobby ids and nothing else. */
const fakeDoc = (state: Partial<Record<(typeof LOBBY_SCREEN_IDS)[number], 'visible' | 'hidden' | 'closing'>> = {}) => {
  const screens = new Map<string, FakeScreen>();
  for (const id of LOBBY_SCREEN_IDS) {
    const mode = state[id] ?? 'hidden';
    screens.set(id, { hidden: mode === 'hidden', dataset: mode === 'closing' ? { ixState: 'closing' } : {} });
  }
  return {
    screens,
    getElementById: (id: string) => screens.get(id) ?? null,
  };
};

describe('every lobby screen is known by one list', () => {
  it('the list is the four full-screen lobby views in index.html', () => {
    // A NEW online screen is a `<section id="online-…" class="screen …">`. If one is added and this
    // list is not, the screen can never be hidden by a screen change — the exact bug being fixed.
    const html = read('../index.html');
    const declared = [...html.matchAll(/<section id="(online-[^"]+)" class="screen\b/g)].map((m) => m[1]);
    expect(declared.sort()).toEqual([...LOBBY_SCREEN_IDS].sort());
  });

  it('the screen change hides them all — no partial literal list can come back', () => {
    const main = read('../src/main.ts');
    // The old list: online-hub, online-waiting, online-join. The map was missing from it.
    expect(main).not.toMatch(/for \(const id of \['online-hub', 'online-waiting', 'online-join'\]\)/);
    expect(main).toMatch(/hideLobbySurfaces\(\);/);
  });
});

describe('hideLobbySurfaces', () => {
  it('hides every visible lobby screen, whichever one it is', () => {
    // Table-driven over the screen that happens to be open: no screen is a special case.
    for (const open of LOBBY_SCREEN_IDS) {
      const doc = fakeDoc({ [open]: 'visible' });
      expect(lobbyScreensToHide(doc)).toEqual([open]);
      hideLobbySurfaces(doc);
      for (const id of LOBBY_SCREEN_IDS) expect(doc.screens.get(id)!.hidden, `${open} → ${id}`).toBe(true);
    }
  });

  it('leaves a screen that is already leaving to finish its own exit', () => {
    const doc = fakeDoc({ 'online-world-screen': 'closing' });
    expect(lobbyScreensToHide(doc)).toEqual([]);
    hideLobbySurfaces(doc);
    expect(doc.screens.get('online-world-screen')!.hidden).toBe(false);
  });

  it('is a no-op when the lobby is not on screen', () => {
    expect(lobbyScreensToHide(fakeDoc())).toEqual([]);
  });
});

describe('leaveLobbyForMatch', () => {
  it('tears the view down and leaves no lobby screen visible, from every screen', () => {
    for (const open of LOBBY_SCREEN_IDS) {
      const doc = fakeDoc({ [open]: 'visible' });
      let tornDown = 0;
      const leaving = leaveLobbyForMatch({ doc, teardown: () => { tornDown += 1; } });
      expect(leaving, open).toEqual([open]);
      expect(tornDown, open).toBe(1);
      for (const id of LOBBY_SCREEN_IDS) expect(doc.screens.get(id)!.hidden, `${open} → ${id}`).toBe(true);
    }
  });

  it('reports the screen it is leaving, so the caller can hand it one exit beat', () => {
    const doc = fakeDoc({ 'online-hub': 'visible', 'online-world-screen': 'hidden' });
    expect(leaveLobbyForMatch({ doc })).toEqual(['online-hub']);
  });
});
