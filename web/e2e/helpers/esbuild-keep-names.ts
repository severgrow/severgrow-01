// esbuild's `keepNames` (which tsx turns on) wraps functions in `__name(fn, "...")`. `page.evaluate`
// serialises the function's SOURCE into the page, where that helper does not exist, so any evaluated
// callback that esbuild decorated throws `ReferenceError: __name is not defined` before it runs.
// Install this shim on a page (before its first navigation) to make the class of bug impossible:
//
//   const page = await browser.newPage({ viewport });
//   await installEsbuildShim(page);   // before page.goto()
//
// Prefer that over rewriting every evaluate as a string. (A string body never gets decorated either,
// so the two fixes compose; see web/e2e/art-lab.ts for both.)
export const ESBUILD_SHIM = 'globalThis.__name = globalThis.__name || ((fn) => fn)';

export const installEsbuildShim = async (page: { addInitScript: (s: string) => Promise<unknown> }) => {
  await page.addInitScript(ESBUILD_SHIM);
};
