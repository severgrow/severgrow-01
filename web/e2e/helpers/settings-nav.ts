// The ONE doorway into a folded Settings group (owner restructure, 2026-10-16).
//
// The Settings sheet (`web/index.html`, `#sheet-settings`) folds its niche controls into collapsed
// `<details>` groups — `#settings-look`, `#settings-sound`, `#settings-motion`, `#settings-help`
// and the Lab, `#settings-lab`. None of them carries `open`, so every group starts CLOSED. A
// control inside a closed `<details>` has no layout box at all: it is in the DOM and a Playwright
// locator RESOLVES, but a bare `page.click('#speed-seg .seg-btn')` waits for visibility forever and
// dies with `element is not visible` after 30s. That is exactly how the `browser (smoke)` job went
// red on 9af8581 (ANIMATION SPEED moved behind "More motion options") and stayed red — the failure
// looked like a flake only because the locator resolved.
//
// A control behind a disclosure is not unreachable — the test just has to open it first, the way a
// player does: click the group's `<summary>`, which toggles the `<details>`. That dance lives here
// once (modeled on helpers/menu-nav.ts, the same job for the PLAY submenu) so the next regrouping is
// a one-line fix instead of one per suite, and so a suite has to name the GROUP a control lives in
// rather than clicking blindly.
import type { Page } from 'playwright-core';

export type SettingsGroupOptions = { timeout?: number };

const isOpen = (page: Page, id: string): Promise<boolean> =>
  page
    .evaluate((groupId) => (document.getElementById(groupId) as HTMLDetailsElement | null)?.open === true, id)
    .catch(() => false);

/**
 * Open the collapsed Settings group `id` (e.g. `'settings-motion'`) the way a player does, and
 * return once its `<details>` reports `open`. Idempotent: an already-open group is left alone.
 *
 * The group must exist and be on show when the sheet is up — a future regrouping that removes or
 * renames it fails here, loudly, instead of silently making its controls unreachable to a click.
 */
export const openSettingsGroup = async (page: Page, id: string, options: SettingsGroupOptions = {}): Promise<void> => {
  const timeout = options.timeout ?? 30_000;
  const details = page.locator(`#sheet-settings details#${id}`);
  await details.waitFor({ state: 'visible', timeout });
  if (!(await isOpen(page, id))) {
    // The `<summary>` is the disclosure header: it stays visible while the group is collapsed, and
    // clicking it flips `<details>.open` — the same single tap a player uses.
    await details.locator('summary').click({ timeout });
  }
  await page.waitForFunction(
    (groupId) => (document.getElementById(groupId) as HTMLDetailsElement | null)?.open === true,
    id,
    { timeout },
  );
};

/**
 * True when `selector` resolves to an element INSIDE the Settings group `id`. The strict check a
 * suite uses in place of the old "the control is visible at the top level": the control still has
 * to be reachable, and here it has to be reachable from the group that names it.
 */
export const settingsControlIsInGroup = (page: Page, id: string, selector: string): Promise<boolean> =>
  page
    .evaluate(
      (arg: { groupId: string; selector: string }) => {
        const group = document.getElementById(arg.groupId);
        return !!group && !!group.querySelector(arg.selector);
      },
      { groupId: id, selector },
    )
    .catch(() => false);
