/**
 * The owner's rule (2026-10-16): the grain is an analogue photo overlay, and it goes on top of
 * EVERYTHING, always - "even when we add new things".
 *
 * A comment cannot enforce that, so this guard does. It fails if a new layer is added above the
 * film, if the film loses `pointer-events: none` (which would swallow every tap in the app), or if
 * the grain creeps back onto the background layer where the interface would cut it out again.
 *
 * WHY THIS IS NOT PARANOIA: there is exactly ONE grain, on one element (`#futa04-film-grain`,
 * created in web/src/player/atmosphere.ts). It was previously painted twice - a copy on the
 * background (`#texture::before`) that the owner could SEE, and a copy on this film that used
 * `mix-blend-mode: soft-light`, which over these near-black surfaces is invisible. So the grain
 * appeared to sit behind the buttons. That is the bug this pins shut.
 *
 * The film also re-pins itself as the last body child on every DOM change (`pinGrain`), because
 * equal z-indexes are broken by DOM order - that is the part that makes it survive new UI, and the
 * last assertion here keeps that mechanism alive.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const WEB_SRC = join(ROOT, 'web/src');
/** The element's id, and the CSS selector for it - they are not the same string. */
const FILM_ID = 'futa04-film-grain';
const FILM = `#${FILM_ID}`;

/** Every .css and .ts file under web/src - z-index values are declared in both, not only in CSS. */
const sources = (): { file: string; text: string }[] =>
  readdirSync(WEB_SRC, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.css') || f.endsWith('.ts'))
    .map((f) => ({ file: f, text: readFileSync(join(WEB_SRC, f), 'utf8') }));

/** Every `z-index: <number>` in the app, with the file it came from. */
const zIndexes = (): { file: string; value: number }[] =>
  sources().flatMap(({ file, text }) =>
    [...text.matchAll(/z-index:\s*(\d+)/g)].map((m) => ({ file, value: Number(m[1]) })),
  );

const filmCss = (): string => {
  const found = sources().filter(({ text }) => text.includes(`${FILM} {`));
  expect(found.map((f) => f.file), 'exactly one file should define the film').toEqual([
    'player/atmosphere.ts',
  ]);
  return found[0].text;
};

/** The film's own rule block (the first `#futa04-film-grain { ... }`). */
const filmRule = (): string => {
  const match = filmCss().match(new RegExp(`${FILM}\\s*\\{[^}]*\\}`));
  expect(match, `no ${FILM} rule found`).toBeTruthy();
  return match![0];
};

describe('the film grain stays on top of everything', () => {
  it('is actually created and put in the document', () => {
    const css = filmCss();
    expect(css, 'the film must be given its id').toContain(`grain.id = '${FILM_ID}'`);
    expect(css, 'the film must be appended to the body').toMatch(/document\.body\.append\(grain\)/);
  });

  it('can never swallow a tap', () => {
    // Without this a full-screen fixed layer eats every click and the app is unusable.
    expect(filmRule(), 'the film must not take pointer events').toMatch(/pointer-events:\s*none/);
  });

  it('is layered above every other z-index in the app', () => {
    const z = filmRule().match(/z-index:\s*(\d+)/);
    expect(z, 'the film needs an explicit z-index').toBeTruthy();
    const filmZ = Number(z![1]);
    // Anything declared at or above the film, outside the file that owns the film.
    const competing = zIndexes().filter((entry) => entry.value >= filmZ && entry.file !== 'player/atmosphere.ts');
    expect(
      competing,
      'a new layer is at or above the film - raise the film, or lower that layer',
    ).toEqual([]);
    // And the film must be the only thing up there in its own file.
    const itsOwn = zIndexes().filter((entry) => entry.file === 'player/atmosphere.ts' && entry.value >= filmZ);
    expect(itsOwn, 'only the film should be this high in atmosphere.ts').toHaveLength(1);
    expect(filmZ, 'the film should be near the top of the z-index range').toBeGreaterThan(2147483000);
  });

  it('keeps the grain ON the film, with normal blending so it is visible', () => {
    const rule = filmRule();
    expect(rule, 'the grain image must live on the film').toMatch(/background-image:\s*url\(.data:image\/svg/);
    expect(rule, 'soft-light is invisible on our near-black surfaces').not.toMatch(/mix-blend-mode:\s*soft-light/);
    expect(rule, 'the grain must actually be painted').not.toMatch(/opacity:\s*0(;|\s*})/);
  });

  it('does not also paint the grain on the opaque background layer', () => {
    // #texture sets a z-index, so it is a stacking context: grain inside it can never rise above the
    // app, only above the background. If it comes back here, the grain is hidden behind the UI again.
    const style = readFileSync(join(WEB_SRC, 'style.css'), 'utf8');
    expect(style, '#texture::before must not carry the grain').not.toMatch(/#texture::before/);
    // The background layer must still exist and still be opaque, or there would be no page colour.
    expect(style).toMatch(/#texture\s*\{[^}]*background:\s*var\(--c-bg\)/);
  });

  it('re-pins itself as the last body child, so later UI cannot get above it', () => {
    // Equal z-indexes are broken by DOM order, so being the last child is what makes the rule hold
    // when someone appends new fixed chrome.
    const css = filmCss();
    expect(css, 'the film must re-pin itself last').toMatch(/document\.body\.lastElementChild === grain/);
    expect(css, 'the re-pin must be observed').toMatch(/new MutationObserver/);
  });
});
