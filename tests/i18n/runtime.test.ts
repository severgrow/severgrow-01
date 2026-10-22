// Runtime behaviour: detection, switching, fallback, interpolation and plural forms.
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearMissingKeys, detectLocale, getLocale, isReadyLocale, missingKeys, onLocaleChange,
  registerLocale, setLocale, t, tPlural, translate,
} from '../../src/i18n/core.js';
import { PL } from '../../src/i18n/pl.js';
import { ES } from '../../src/i18n/es.js';
import { JA } from '../../src/i18n/ja.js';

registerLocale('pl', PL);
registerLocale('es', ES);
registerLocale('ja', JA);

const reset = () => { setLocale('en'); clearMissingKeys(); };
afterEach(reset);

describe('language detection', () => {
  it('maps each supported browser language and ignores the region', () => {
    expect(detectLocale(['pl-PL'])).toBe('pl');
    expect(detectLocale(['es-MX'])).toBe('es');
    expect(detectLocale(['es-ES'])).toBe('es');
    expect(detectLocale(['ja-JP'])).toBe('ja');
    expect(detectLocale(['en-GB'])).toBe('en');
  });

  it('chooses the first supported preference and otherwise falls back to English', () => {
    expect(detectLocale(['fr-FR', 'de-DE', 'ja-JP'])).toBe('ja');
    expect(detectLocale(['pt-BR', 'fr', 'de'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('never accepts an incomplete locale', () => {
    expect(isReadyLocale('en')).toBe(true);
    expect(isReadyLocale('pl')).toBe(true);
    expect(isReadyLocale('pt-BR')).toBe(false);
    expect(isReadyLocale('fr')).toBe(false);
    expect(isReadyLocale('de')).toBe(false);
  });
});

describe('the active locale', () => {
  it('changes immediately and notifies once', () => {
    let calls = 0;
    const off = onLocaleChange(() => calls++);
    setLocale('ja');
    expect(getLocale()).toBe('ja');
    expect(calls).toBe(1);
    setLocale('ja');
    expect(calls).toBe(1);
    off();
    setLocale('es');
    expect(calls).toBe(1);
  });

  it('does not accept a reserved, unfinished locale', () => {
    setLocale('pl');
    // @ts-expect-error a reserved locale is intentionally not a Locale
    setLocale('fr');
    expect(getLocale()).toBe('pl');
  });
});

describe('messages', () => {
  it('interpolates named values and leaves unknown placeholders alone', () => {
    expect(t('ui.test.hello', 'Hello {name}', { name: 'Ana' })).toBe('Hello Ana');
    expect(t('ui.test.hello2', 'Hello {name}')).toBe('Hello {name}');
    expect(translate('ui.test.hello3', 'Hello {name}', [{ name: 'Ana' }])).toBe('Hello Ana');
  });

  it('uses the locale plural rule, not English one/other', () => {
    expect(tPlural('ui.count.tiles', { one: '{n} tile', other: '{n} tiles' }, 1)).toBe('1 tile');
    setLocale('pl');
    expect(tPlural('ui.count.tiles', { one: '{n} tile', other: '{n} tiles' }, 2)).toBe('2 kafle');
    expect(tPlural('ui.count.tiles', { one: '{n} tile', other: '{n} tiles' }, 5)).toBe('5 kafli');
  });

  it('falls back to the English value rather than showing a key or a blank', () => {
    setLocale('es');
    expect(t('ui.test.missing', 'English copy')).toBe('English copy');
    expect(missingKeys()).toContain('ui.test.missing');
  });
});
