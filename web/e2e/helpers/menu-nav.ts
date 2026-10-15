// The ONE doorway through the product main menu (owner restructure, 2026-10-15).
//
// On the product channels (`futa04` / `futa05`) main.ts MOVES Play online, LEVEL <n> and Training
// OUT of the flat menu and INTO the PLAY submenu (`#play-menu` → `#play-actions`). They are real
// children of that section, so while the menu is on show they sit inside a `hidden` subtree and a
// bare `page.click('#menu-online')` can never see them: Playwright waits forever for an element the
// player can only reach after tapping PLAY. Every affected suite must therefore reach those entries
// the way a player does — open the doorway, then click the entry.
//
// That whole dance lives here, once, so the NEXT menu change is a one-line fix instead of 25.
//
// Legacy channels (`test` / `futa-test` / the `live` build served as `/test2/`) keep the flat menu:
// PLAY is hidden and the entries live on the menu itself. The helper detects which shape the running
// build has and clicks the entry directly there, so the SAME call is correct on both — a suite does
// not need to know which channel it is pointed at.
import type { Page } from 'playwright-core';

/** The entries main.ts moves into the PLAY submenu on product channels (PLAY_MENU_ENTRIES). */
export const PLAY_MENU_IDS = ['menu-online', 'menu-campaign', 'menu-new'] as const;

/** True when the entry element currently lives inside the PLAY submenu in this build. */
export const entryIsInPlayMenu = (page: Page, id: string): Promise<boolean> =>
  page
    .evaluate((entryId) => {
      const el = document.getElementById(entryId);
      const play = document.getElementById('play-menu');
      return !!el && !!play && play.contains(el);
    }, id)
    .catch(() => false);

export type MenuEntryOptions = { timeout?: number };

/**
 * Wait until the app has booted the menu into its final shape: either the entry has already been
 * moved behind the PLAY doorway, or the flat menu is the screen on show. Without this, a helper
 * called a beat too early could read the pre-boot DOM and pick the wrong route.
 */
const waitMenuShape = (page: Page, id: string, timeout: number): Promise<void> =>
  page
    .waitForFunction(
      (entryId) => {
        const el = document.getElementById(entryId);
        if (!el) return false;
        const play = document.getElementById('play-menu');
        if (play && play.contains(el)) return true;
        const menu = document.getElementById('menu');
        return !!menu && !menu.hidden;
      },
      id,
      { timeout },
    )
    .then(() => undefined);

/**
 * Open a main-menu entry the way a player does, whether it sits on the menu itself or behind the
 * PLAY doorway. Waits for the entry to be visible and clicks it; the click's own navigation is the
 * caller's to wait for (exactly as a bare `page.click('#menu-online')` used to be).
 */
export const openMenuEntry = async (page: Page, id: string, options: MenuEntryOptions = {}): Promise<void> => {
  const timeout = options.timeout ?? 40_000;
  await waitMenuShape(page, id, timeout);
  if (await entryIsInPlayMenu(page, id)) {
    if (!(await page.locator('#play-menu').isVisible().catch(() => false))) {
      await page.waitForSelector('#menu-play:not([hidden])', { timeout });
      await page.click('#menu-play');
    }
    await page.waitForSelector('#play-menu:not([hidden])', { timeout });
  }
  await page.waitForSelector(`#${id}:not([hidden])`, { timeout });
  await page.click(`#${id}`);
};

/** Play online: the PLAY doorway then the Play online entry, and wait for the duel lobby. */
export const openOnlineHub = async (page: Page, options: MenuEntryOptions = {}): Promise<void> => {
  const timeout = options.timeout ?? 40_000;
  await openMenuEntry(page, 'menu-online', { timeout });
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: Math.min(timeout, 30_000) });
};
