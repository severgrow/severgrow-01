// The one entry point every consumer uses. Locale dictionaries are loaded ON DEMAND: an English
// player downloads no translation bundle, and a Polish player downloads Polish only. Switching
// language loads the chosen dictionary before the locale changes, so a screen never renders a
// half-registered language.
import { registerLocale } from './core.js';
import type { Dictionary, Locale } from './core.js';

const loaders: Record<Exclude<Locale, 'en'>, () => Promise<Dictionary>> = {
  pl: () => import('./pl.js').then((module) => module.PL),
  es: () => import('./es.js').then((module) => module.ES),
  ja: () => import('./ja.js').then((module) => module.JA),
};

const loaded = new Set<Locale>(['en']);

/** Load a locale's dictionary once. English is built in and resolves immediately. */
export const loadLocale = async (locale: Locale): Promise<void> => {
  if (loaded.has(locale)) return;
  const dictionary = await loaders[locale as Exclude<Locale, 'en'>]();
  registerLocale(locale, dictionary);
  loaded.add(locale);
};

export * from './core.js';
