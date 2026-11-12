// The cockpit's context key (owner, 2026-11-11): "?" lives there every turn, so when another move
// also wants the key (Skip, Whole map…), one tap opens the small menu and the move is picked inside.
// pressContext() does what a player does: a single tap when the move owns the key, else key + item.
import type { Page } from 'playwright-core';

export type ContextKind = 'skip' | 'guide' | 'whole' | 'back' | 'bloom' | 'confirm' | 'cancel' | string;

/** The moves the context key offers right now, by kind (its own move first). */
export const contextKinds = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const key = document.getElementById('smart-context') as HTMLButtonElement | null;
    if (!key || key.disabled) return [];
    const menu = [...document.querySelectorAll<HTMLElement>('#smart-selector button')].map((b) => (b.dataset.action ?? '').split(':')[0]!);
    return menu.length ? menu : [key.dataset.action ?? ''];
  });

/** Tap the context key for `kind`; if the key holds a menu, open it and pick that item. */
export const pressContext = async (page: Page, kind: ContextKind, timeout = 5000): Promise<void> => {
  await page.waitForFunction((k) => {
    const key = document.getElementById('smart-context') as HTMLButtonElement | null;
    if (!key || key.disabled) return false;
    if (key.dataset.action === k) return true;
    return [...document.querySelectorAll<HTMLElement>('#smart-selector button')].some((b) => (b.dataset.action ?? '').startsWith(`${k}:`));
  }, kind, { timeout });
  const key = page.locator('#smart-context');
  const many = (await key.getAttribute('aria-haspopup')) === 'menu';
  await key.click();
  if (!many) return;
  await page.waitForSelector('#smart-selector:not([hidden])', { timeout });
  await page.locator(`#smart-selector button[data-action^="${kind}:"]`).first().click();
};
