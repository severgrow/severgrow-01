import { describe, expect, it } from 'vitest';
import { entryOf, onMenu, reloadIfDeployedBuildDiffers, runningEntry } from '../src/logic/fresh-shell.js';
import { STALE_RELOAD_KEY, STALE_RELOAD_WINDOW_MS } from '../src/logic/stale-build.js';

// A LAUNCH THAT IS ONE DEPLOY BEHIND (owner, 2026-11-15). The offline worker answers a navigation
// from the saved page and refreshes that copy for the NEXT launch, so a launch never shows the build
// that is already deployed — and a resumed home-screen app never navigates at all. These tests pin
// the fingerprint, the "menu only" rule and the loop guards.

const page = (entry: string) => `<!doctype html><html><head>
<link rel="modulepreload" href="./assets/${entry}">
<script type="module" crossorigin src="./assets/${entry}"></script>
</head><body></body></html>`;

const fakeDoc = (opts: { running?: string; menuHidden?: boolean; gameVisible?: boolean; sheetVisible?: boolean }) => {
  const script = opts.running
    ? ({ src: `https://futasaku.com/test/assets/${opts.running}` } as HTMLScriptElement)
    : null;
  const box = (visible: boolean) => ({ hidden: !visible, getClientRects: () => (visible ? [{}] : []) });
  return {
    querySelector: (sel: string) => (sel.includes('module') ? script : null),
    querySelectorAll: () => (opts.sheetVisible ? [box(true)] : [box(false)]),
    getElementById: (id: string) =>
      id === 'menu' ? box(!(opts.menuHidden ?? false)) : id === 'game' ? box(opts.gameVisible ?? false) : null,
  } as unknown as Document;
};

const fakeWin = (href = 'https://futasaku.com/test/') => {
  const store = new Map<string, string>();
  let replaced: string | null = null;
  const win = {
    location: { href, replace: (to: string) => { replaced = to; } },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    },
    setTimeout: (cb: () => void) => { void cb; return 0; },
  };
  return { win: win as unknown as Window, replaced: () => replaced };
};

describe('fresh shell: is this page running an older build than the one deployed?', () => {
  it('reads the entry code file out of a page', () => {
    expect(entryOf(page('index-BoVygnnJ.js'))).toBe('assets/index-BoVygnnJ.js');
    expect(entryOf('<html>no build here</html>')).toBeNull();
  });

  it('reads the entry this page is running', () => {
    expect(runningEntry(fakeDoc({ running: 'index-g3wD3rUS.js' }))).toBe('assets/index-g3wD3rUS.js');
    expect(runningEntry(fakeDoc({}))).toBeNull();
  });

  it('only heals on the menu, never over a game or a sheet', () => {
    expect(onMenu(fakeDoc({}))).toBe(true);
    expect(onMenu(fakeDoc({ menuHidden: true }))).toBe(false);
    expect(onMenu(fakeDoc({ gameVisible: true }))).toBe(false);
    expect(onMenu(fakeDoc({ sheetVisible: true }))).toBe(false);
  });

  it('reloads through ?_fresh= when the deployed entry differs', async () => {
    const { win, replaced } = fakeWin();
    const href = await reloadIfDeployedBuildDiffers({
      doc: fakeDoc({ running: 'index-OLD.js' }),
      win,
      fetchText: async () => page('index-NEW.js'),
      now: () => 1000,
    });
    expect(href).toBeTruthy();
    expect(href).toContain('_fresh=');
    expect(replaced()).toBe(href);
  });

  it('leaves the page alone when it is already current', async () => {
    const { win, replaced } = fakeWin();
    const href = await reloadIfDeployedBuildDiffers({
      doc: fakeDoc({ running: 'index-SAME.js' }),
      win,
      fetchText: async () => page('index-SAME.js'),
      now: () => 1000,
    });
    expect(href).toBeNull();
    expect(replaced()).toBeNull();
  });

  it('never interrupts a game, and never reloads twice inside the window', async () => {
    const busy = fakeWin();
    expect(await reloadIfDeployedBuildDiffers({
      doc: fakeDoc({ running: 'index-OLD.js', gameVisible: true }),
      win: busy.win,
      fetchText: async () => page('index-NEW.js'),
      now: () => 1000,
    })).toBeNull();

    const { win, replaced } = fakeWin();
    const deps = { doc: fakeDoc({ running: 'index-OLD.js' }), win, fetchText: async () => page('index-NEW.js') };
    expect(await reloadIfDeployedBuildDiffers({ ...deps, now: () => 5000 })).toBeTruthy();
    // A second pass a moment later (a deploy disagreeing again) must not spin.
    expect(await reloadIfDeployedBuildDiffers({ ...deps, now: () => 5000 + STALE_RELOAD_WINDOW_MS - 1 })).toBeNull();
    // After the window it may try again on a fresh launch.
    expect(await reloadIfDeployedBuildDiffers({ ...deps, now: () => 5000 + STALE_RELOAD_WINDOW_MS + 1 })).toBeTruthy();
    expect(replaced()).toContain('_fresh=');
  });

  it('stays put when the network is unavailable', async () => {
    const { win, replaced } = fakeWin();
    expect(await reloadIfDeployedBuildDiffers({
      doc: fakeDoc({ running: 'index-OLD.js' }),
      win,
      fetchText: async () => null,
      now: () => 1000,
    })).toBeNull();
    expect(replaced()).toBeNull();
  });

  it('records the attempt under the stale-build key', async () => {
    const { win } = fakeWin();
    await reloadIfDeployedBuildDiffers({
      doc: fakeDoc({ running: 'index-OLD.js' }),
      win,
      fetchText: async () => page('index-NEW.js'),
      now: () => 7777,
    });
    expect(win.sessionStorage.getItem(STALE_RELOAD_KEY)).toBe('7777');
  });
});
