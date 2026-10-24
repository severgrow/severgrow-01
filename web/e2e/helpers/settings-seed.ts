// ONE place that seeds the game's settings before the app boots, for every suite that must run with
// a KNOWN comfort setting (Reduce motion on or off).
//
// WHY THIS EXISTS (measured, 2026-10-22). A suite that seeds `main2:severgrow.settings.v1` only
// works against a `CHANNEL=futa04` build: the storage prefix is baked in AT BUILD TIME
// (`web/src/channel.ts`), so a `futa05` build installs `futa05:`, a `futa-test` build installs
// `futa-test:`, a `/futa0.4/` preview path installs `futa04:`, and the live channel installs none.
// A fixture written for one prefix silently does nothing on another build — the app then starts on
// its DEFAULTS, motion is ON, and an assertion about a still surface reads as a product bug. That is
// exactly how `finish-fit`'s "seeds static" case came to report "+0" with 3 animations: the seeded
// Reduce motion never loaded, so the count-up ran in the case that asserts it cannot.
//
// The honest fix is not "always use main2:": it is to write the SAME settings under every prefix a
// product build can install, before the first frame. The running app then finds its own key on
// whatever channel it was built for, and the suite asserts the behaviour (motion / no motion)
// instead of a build detail. `assertDistChannel` is still the right tool where a suite genuinely
// depends on ONE channel; this helper is for the suites that only need their settings to take.
import type { Page } from 'playwright-core';

/**
 * Every settings key prefix a build can install, plus the unprefixed one (the live channel).
 * `main2:` is the futa04 product build; `futa04:` is a futa04 build served under `/futa0.4/`;
 * `futa05:` / `futa05-3:` are the online preview (and its `/3/` path); `test:` / `futa-test:` are
 * the experiment channels. Adding a channel means adding its prefix HERE, once.
 */
export const SETTINGS_PREFIXES = [
  'main2:',
  'futa04:',
  'futa05:',
  'futa05-3:',
  'test:',
  'futa-test:',
  '',
] as const;

/** The settings key itself (`SETTINGS_KEY` in `web/src/logic/settings.ts`), without a prefix. */
export const SETTINGS_KEY = 'severgrow.settings.v1';

/**
 * Seed settings for every channel prefix. Call it before `page.goto` (it installs an init script),
 * so the very first read of the settings — which decides motion, palette and speed — sees them.
 * `once` guards against a second seeding inside one context when the suite re-navigates; pass
 * `false` when the suite wants each navigation to re-apply the same values.
 */
export const seedSettings = async (page: Page, settings: Record<string, unknown>, options: { once?: boolean } = {}): Promise<void> => {
  await page.addInitScript(
    ({ json, prefixes, key, once }) => {
      if (once && sessionStorage.getItem('e2e-settings-seeded')) return;
      if (once) sessionStorage.setItem('e2e-settings-seeded', '1');
      for (const prefix of prefixes) {
        try {
          localStorage.setItem(`${prefix}${key}`, json);
        } catch {
          /* a prefix the app never reads is still written; a quota error must not hide the others */
        }
      }
    },
    { json: JSON.stringify(settings), prefixes: [...SETTINGS_PREFIXES], key: SETTINGS_KEY, once: options.once ?? true },
  );
};

/** The same, for suites that also need the "seen" flags (onboarding, tips) out of the way. */
export const seedSeen = async (page: Page, value = '1'): Promise<void> => {
  await page.addInitScript(({ prefixes, val }) => {
    for (const prefix of prefixes) {
      try {
        localStorage.setItem(`${prefix}severgrow.seen`, val);
      } catch {
        /* see seedSettings */
      }
    }
  }, { prefixes: [...SETTINGS_PREFIXES], val: value });
};
