import type { Page } from 'playwright-core';

/**
 * Owner, 2026-10-25: "Your matches" is now a collapsed disclosure in the online hub. Every suite
 * that reaches a match through the lobby must open it exactly as a player does; calling this twice
 * is a no-op. A hub with no match rows still expands (it shows the empty line).
 */
export const expandYourMatches = async (page: Page): Promise<void> => {
  const toggle = page.locator('#online-matches-toggle');
  if ((await toggle.count()) === 0) return;
  if ((await toggle.getAttribute('aria-expanded')) === 'true') return;
  await toggle.click();
  await page
    .locator('#online-matches-panel:not([hidden])')
    .waitFor({ state: 'visible', timeout: 10_000 });
};
