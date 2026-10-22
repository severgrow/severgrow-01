// Futasaku localisation core — pure, deterministic, no DOM and no I/O.
//
// English is the canonical source language. Every other locale is a flat dictionary keyed by a
// semantic path (`online.playOnline`, `tutorial.showMe`). The English VALUE lives in the object it
// always lived in (`src/strings.ts`) so the English game is byte-for-byte unchanged; `localized()`
// only looks up a non-English override and falls back to that English value. A missing translation
// is therefore never a blank screen.
//
// Keep this module pure: no Math.random, no clocks, no storage, no fetch. The web layer owns
// persistence and the browser's language preference.

export type Locale = 'en' | 'pl' | 'es' | 'ja';

/** Locales with a complete, reviewed dictionary. This is the ONLY list the picker shows. */
export const READY_LOCALES = ['en', 'pl', 'es', 'ja'] as const satisfies readonly Locale[];

/**
 * Locales the architecture reserves but that are NOT complete. They are deliberately absent from
 * READY_LOCALES, so they can never appear in the picker. Adding one is: create `ptBR.ts`, add its
 * code here and to LOCALE_META, then add the code to READY_LOCALES once coverage is complete.
 */
export const RESERVED_LOCALES = ['pt-BR', 'fr', 'de'] as const;

export type ReservedLocale = (typeof RESERVED_LOCALES)[number];

export type LocaleMeta = {
  /** The language's own name, exactly as the picker shows it. */
  nativeName: string;
  /** BCP-47 tag for <html lang> and Intl. */
  htmlLang: string;
  /** Script family, used for typography decisions in CSS. */
  script: 'latin' | 'japanese';
};

export const LOCALE_META: Readonly<Record<Locale, LocaleMeta>> = Object.freeze({
  en: { nativeName: 'English', htmlLang: 'en', script: 'latin' },
  pl: { nativeName: 'Polski', htmlLang: 'pl', script: 'latin' },
  es: { nativeName: 'Español', htmlLang: 'es', script: 'latin' },
  ja: { nativeName: '日本語', htmlLang: 'ja', script: 'japanese' },
});

export type MessageValue = string | ((...args: never[]) => string);

/**
 * One translated entry. A string may interpolate named parameters as `{name}`. A plural entry
 * chooses a form with Intl.PluralRules; `other` is mandatory. Functions receive the SAME arguments
 * as the English function they replace, so grammar stays in the target language rather than being
 * assembled from English fragments.
 */
export type Message =
  | string
  | ((...args: never[]) => string)
  | { one?: string; few?: string; many?: string; other: string };

export type Dictionary = Readonly<Record<string, Message>>;

type Catalog = Partial<Record<Locale, Dictionary>>;

const catalogs: Catalog = {};
let currentLocale: Locale = 'en';
const missing = new Set<string>();
const listeners = new Set<(locale: Locale) => void>();

/** Register a locale dictionary. Called once by `src/i18n/index.ts`. */
export const registerLocale = (locale: Locale, dictionary: Dictionary): void => {
  catalogs[locale] = dictionary;
};

export const getLocale = (): Locale => currentLocale;

/**
 * The browser's preference list, narrowed to a complete locale. The first supported language wins;
 * anything unsupported falls back to English (never to a half-finished dictionary).
 */
export const detectLocale = (languages: readonly string[]): Locale => {
  for (const tag of languages) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (base === 'pl' || base === 'es' || base === 'ja' || base === 'en') return base;
  }
  return 'en';
};

/** Whether a locale is complete enough to expose. */
export const isReadyLocale = (value: string): value is Locale =>
  (READY_LOCALES as readonly string[]).includes(value);

/**
 * Change the active locale. Pure state change; the web layer decides when to persist and re-render.
 * Returns the previous locale.
 */
export const setLocale = (locale: Locale): Locale => {
  if (!isReadyLocale(locale) || locale === currentLocale) return currentLocale;
  const previous = currentLocale;
  currentLocale = locale;
  for (const listener of listeners) listener(locale);
  return previous;
};

/** Subscribe to locale changes. Returns an unsubscribe function. */
export const onLocaleChange = (listener: (locale: Locale) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Every key that fell back to English in the current locale (diagnostics and tests). */
export const missingKeys = (): readonly string[] => [...missing].sort();

export const clearMissingKeys = (): void => missing.clear();

const interpolate = (message: string, named?: Record<string, string | number>): string => {
  if (!named) return message;
  return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(named, name) ? String(named[name]) : whole);
};

type PluralForm = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

const pluralForm = (locale: Locale, count: number): PluralForm => {
  try {
    return new Intl.PluralRules(LOCALE_META[locale].htmlLang).select(count) as PluralForm;
  } catch {
    return count === 1 ? 'one' : 'other';
  }
};

const fromMessage = (
  message: Message,
  locale: Locale,
  args: readonly unknown[],
): string => {
  if (typeof message === 'function') return (message as (...a: unknown[]) => string)(...args);
  if (typeof message === 'object') {
    const named = args[0] as { count?: number; n?: number } | undefined;
    const count = Number(named?.count ?? named?.n ?? 0);
    const forms = message as Record<string, string | undefined>;
    const chosen = forms[pluralForm(locale, count)] ?? forms.other ?? '';
    return interpolate(chosen, named as Record<string, string | number> | undefined);
  }
  return message;
};

/**
 * Translate a semantic key. `english` is the canonical source value to fall back to.
 * `args` are passed to function messages, and `args[0]` may carry named `{placeholders}`.
 */
export const translate = (
  path: string,
  english: Message,
  args: readonly unknown[] = [],
): string => {
  const named = args[0];
  const interpolateResult = (text: string): string =>
    interpolate(text, typeof named === 'object' && named !== null
      ? (named as Record<string, string | number>) : undefined);
  if (currentLocale === 'en') {
    const message = english;
    const result = fromMessage(message, 'en', args);
    return typeof message === 'string' ? interpolateResult(result) : result;
  }
  const dictionary = catalogs[currentLocale];
  const message = dictionary?.[path];
  if (message === undefined) {
    missing.add(path);
    const result = fromMessage(english, 'en', args);
    return typeof english === 'string' ? interpolateResult(result) : result;
  }
  const result = fromMessage(message, currentLocale, args);
  if (!result) {
    missing.add(path);
    return fromMessage(english, 'en', args);
  }
  return typeof message === 'string' ? interpolateResult(result) : result;
};

/** Plain lookup with a required English fallback; for hand-written UI copy. */
export const t = (path: string, english: string, named?: Record<string, string | number>): string =>
  translate(path, english, named ? [named] : []);

/**
 * Plural-aware copy. The English forms are the fallback; a locale dictionary supplies its own
 * `one` / `few` / `many` / `other` forms, chosen with Intl.PluralRules. Keep `{n}` in every form.
 */
export const tPlural = (
  path: string,
  english: { one?: string; few?: string; many?: string; other: string },
  count: number,
  named?: Record<string, string | number>,
): string => translate(path, english as Message, [{ count, n: count, ...named }]);

/** A number in the active locale. A small cache avoids repeated Intl construction in render loops. */
const numberFormats = new Map<string, Intl.NumberFormat>();
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string => {
  const key = `${currentLocale}:${JSON.stringify(options ?? {})}`;
  let format = numberFormats.get(key);
  if (!format) {
    try {
      format = new Intl.NumberFormat(LOCALE_META[currentLocale].htmlLang, options);
    } catch {
      format = new Intl.NumberFormat('en', options);
    }
    numberFormats.set(key, format);
  }
  return format.format(value);
};

/** The active locale's BCP-47 tag, for `document.documentElement.lang`. */
export const htmlLang = (): string => LOCALE_META[currentLocale].htmlLang;

/**
 * Wrap an English object tree so every value is translated by its semantic path.
 *
 * The returned object has the same shape as the source, but ES module exports and `Object.freeze`
 * make a Proxy illegal (a read-only, non-configurable property must return its exact value). We
 * therefore build a small shadow tree once, with getters for leaf copy, so reads stay dynamic and
 * cheap. The English source object is never mutated.
 */
export const localized = <T>(group: string, english: T): T => {
  const build = (value: unknown, path: string): unknown => {
    if (Array.isArray(value)) {
      const shadow: unknown[] = new Array(value.length);
      value.forEach((child, index) => {
        Object.defineProperty(shadow, index, {
          get: leafOrChild(child, `${path}.${index}`),
          enumerable: true,
        });
      });
      return shadow;
    }
    if (value !== null && typeof value === 'object') {
      const shadow: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        Object.defineProperty(shadow, key, {
          get: leafOrChild((value as Record<string, unknown>)[key], `${path}.${key}`),
          enumerable: true,
        });
      }
      return shadow;
    }
    return value;
  };

  const leafOrChild = (value: unknown, path: string): (() => unknown) => {
    if (typeof value === 'string') {
      const source = value;
      return () => translate(path, source);
    }
    if (typeof value === 'function') {
      const source = value as (...args: unknown[]) => string;
      let wrapper: ((...args: unknown[]) => string) | null = null;
      return () => {
        wrapper ??= (...args: unknown[]) => translate(path, source as Message, args);
        return wrapper;
      };
    }
    if (value !== null && typeof value === 'object') {
      let child: unknown;
      let built = false;
      return () => {
        if (!built) { child = build(value, path); built = true; }
        return child;
      };
    }
    return () => value;
  };

  return build(english, group) as T;
};

/** Test seam: expose the current locale's dictionary without importing every dictionary. */
export const dictionaryFor = (locale: Locale): Dictionary | undefined => catalogs[locale];
