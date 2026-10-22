// Browser localisation wiring: detection, persistence, <html lang>, static DOM copy, and the
// understated language control in the corner of the main menu.
//
// `src/i18n` stays pure. This module is the only place that touches localStorage and the DOM.
import {
  LOCALE_META, READY_LOCALES, detectLocale, getLocale, isReadyLocale, loadLocale, onLocaleChange, setLocale, t,
} from '../../../src/i18n/index.js';
import type { Locale } from '../../../src/i18n/index.js';
import './locale.css';

/** Historical save namespace, so language survives alongside the rest of the player's data. */
export const LOCALE_KEY = 'severgrow.locale';

const readStored = (): Locale | null => {
  try {
    const value = localStorage.getItem(LOCALE_KEY);
    return value && isReadyLocale(value) ? value : null;
  } catch {
    return null;
  }
};

const store = (locale: Locale): void => {
  try { localStorage.setItem(LOCALE_KEY, locale); } catch { /* storage blocked: session only */ }
};

const browserLanguages = (): readonly string[] => {
  const nav = navigator as Navigator & { languages?: readonly string[] };
  return nav.languages?.length ? nav.languages : [nav.language || 'en'];
};

/** Apply the locale's document attributes. CSS keys typography off `data-script` and `lang`. */
export const applyDocumentLocale = (locale: Locale): void => {
  const html = document.documentElement;
  html.lang = LOCALE_META[locale].htmlLang;
  html.dataset.locale = locale;
  html.dataset.script = LOCALE_META[locale].script;
};

type Bindings = {
  text: Map<HTMLElement, { key: string; english: string }>;
  html: Map<HTMLElement, { key: string; english: string }>;
  aria: Map<HTMLElement, { key: string; english: string }>;
  title: Map<HTMLElement, { key: string; english: string }>;
  placeholder: Map<HTMLElement, { key: string; english: string }>;
};

const bindings: Bindings = {
  text: new Map(), html: new Map(), aria: new Map(), title: new Map(), placeholder: new Map(),
};

/**
 * Capture each element's English copy ONCE, while English is showing, then render the active
 * locale. The captured English is the fallback, so switching pl → es → en never compounds.
 */
const capture = (root: ParentNode): void => {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n!;
    if (!bindings.text.has(el)) bindings.text.set(el, { key, english: el.textContent?.trim() ?? '' });
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-html]')) {
    const key = el.dataset.i18nHtml!;
    if (!bindings.html.has(el)) bindings.html.set(el, { key, english: el.innerHTML.trim() });
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    const key = el.dataset.i18nAria!;
    if (!bindings.aria.has(el)) bindings.aria.set(el, { key, english: el.getAttribute('aria-label') ?? '' });
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const key = el.dataset.i18nTitle!;
    if (!bindings.title.has(el)) bindings.title.set(el, { key, english: el.getAttribute('title') ?? '' });
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]')) {
    const key = el.dataset.i18nPlaceholder!;
    if (!bindings.placeholder.has(el)) bindings.placeholder.set(el, { key, english: el.getAttribute('placeholder') ?? '' });
  }
};

const renderBindings = (): void => {
  for (const [el, { key, english }] of bindings.text) if (el.isConnected) el.textContent = t(key, english);
  for (const [el, { key, english }] of bindings.html) if (el.isConnected) el.innerHTML = t(key, english);
  for (const [el, { key, english }] of bindings.aria) if (el.isConnected) el.setAttribute('aria-label', t(key, english));
  for (const [el, { key, english }] of bindings.title) if (el.isConnected) el.setAttribute('title', t(key, english));
  for (const [el, { key, english }] of bindings.placeholder) if (el.isConnected) el.setAttribute('placeholder', t(key, english));
};

/** Translate any new static markup (safe to call repeatedly; English is captured only once). */
export const applyStaticCopy = (root: ParentNode = document): void => {
  capture(root);
  renderBindings();
};

/** Register an element that JS creates, with its English copy and semantic key. */
export const bindCopy = (
  el: HTMLElement, key: string, english: string,
  part: 'text' | 'aria' | 'title' | 'placeholder' = 'text',
): void => {
  bindings[part].set(el, { key, english });
  if (part === 'text') el.textContent = t(key, english);
  else el.setAttribute(part === 'placeholder' ? 'placeholder' : part === 'aria' ? 'aria-label' : 'title', t(key, english));
};

const closePicker = (): void => {
  const menu = document.getElementById('lang-menu');
  const button = document.getElementById('lang-button');
  if (!menu || !button) return;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
};

const renderPicker = (): void => {
  const button = document.getElementById('lang-button');
  const menu = document.getElementById('lang-menu');
  if (!button || !menu) return;
  button.textContent = LOCALE_META[getLocale()].nativeName;
  button.setAttribute('aria-label', t('ui.language.label', 'Language'));
  button.title = t('ui.language.label', 'Language');
  for (const option of menu.querySelectorAll<HTMLButtonElement>('[data-locale]')) {
    const code = option.dataset.locale as Locale;
    const selected = code === getLocale();
    option.setAttribute('aria-selected', String(selected));
    option.classList.toggle('is-on', selected);
    option.textContent = LOCALE_META[code].nativeName;
    option.lang = LOCALE_META[code].htmlLang;
  }
};

const mountLanguagePicker = (): void => {
  const host = document.querySelector('#menu .menu-inner');
  if (!host || document.getElementById('lang-picker')) return;

  const corner = document.createElement('div');
  corner.id = 'lang-picker';
  corner.className = 'lang-corner';

  const button = document.createElement('button');
  button.id = 'lang-button';
  button.className = 'lang-corner-btn';
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'lang-menu');

  const menu = document.createElement('div');
  menu.id = 'lang-menu';
  menu.className = 'lang-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');

  for (const code of READY_LOCALES) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'lang-option';
    option.dataset.locale = code;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void chooseLocale(code);
      closePicker();
      button.focus();
    });
    menu.append(option);
  }

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector<HTMLButtonElement>('.is-on')?.focus();
  });

  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closePicker(); button.focus(); }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const options = [...menu.querySelectorAll<HTMLButtonElement>('[data-locale]')];
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    options[(index + step + options.length) % options.length]?.focus();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!corner.contains(event.target as Node)) closePicker();
  }, { capture: true });

  corner.append(button, menu);
  host.append(corner);
  renderPicker();
};

/**
 * Choose a locale: persist the manual override, switch immediately, re-render static copy and
 * announce the change so screens can redraw their dynamic copy without a reload.
 */
export const chooseLocale = async (locale: Locale): Promise<void> => {
  if (!isReadyLocale(locale)) return;
  try { await loadLocale(locale); } catch { return; }
  store(locale);
  setLocale(locale);
  applyDocumentLocale(locale);
  applyStaticCopy();
  renderPicker();
  window.dispatchEvent(new CustomEvent<Locale>('futasaku:locale', { detail: locale }));
};

/** Boot: stored override first, then the browser's preference. English is the default. */
export const initI18n = async (): Promise<Locale> => {
  let initial = readStored() ?? detectLocale(browserLanguages());
  try { await loadLocale(initial); } catch { initial = 'en'; }
  setLocale(initial);
  applyDocumentLocale(initial);
  mountLanguagePicker();
  applyStaticCopy();
  onLocaleChange((locale) => {
    applyDocumentLocale(locale);
    renderPicker();
  });
  return initial;
};
