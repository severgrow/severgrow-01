// The country flag on the profile (owner, 2026-11-01: "add a flag of the country they're at").
//
// There is no geo lookup in this game and there will not be one, so the flag is derived locally from
// the time zone, falling back to the language's region. These tests pin the two rules that make that
// safe: a country we cannot place is NO flag (never a guess), and an unknown code never renders a
// placeholder glyph.
import { describe, expect, it } from 'vitest';
import { browserCountry, countryName, countryOf, flagOf, regionOfLanguage } from '../src/logic/country.js';

describe('placing the player', () => {
  it('follows the time zone first, because a zone follows where the device IS', () => {
    expect(countryOf({ timeZone: 'Europe/Warsaw' })).toBe('PL');
    expect(countryOf({ timeZone: 'Asia/Tokyo' })).toBe('JP');
    expect(countryOf({ timeZone: 'America/New_York' })).toBe('US');
    expect(countryOf({ timeZone: 'Africa/Nairobi' })).toBe('KE');
    expect(countryOf({ timeZone: 'Pacific/Auckland' })).toBe('NZ');
  });

  it('falls back to the language region when the zone is not one we know', () => {
    expect(countryOf({ timeZone: 'Not/AZone', language: 'pl-PL' })).toBe('PL');
    expect(countryOf({ timeZone: null, language: 'en-GB' })).toBe('GB');
    // A zone we know beats a language that disagrees with it.
    expect(countryOf({ timeZone: 'Europe/Lisbon', language: 'en-US' })).toBe('PT');
  });

  it('says nothing rather than guessing', () => {
    expect(countryOf({})).toBeNull();
    expect(countryOf({ timeZone: '', language: '' })).toBeNull();
    expect(countryOf({ timeZone: 'Not/AZone', language: 'en' })).toBeNull();
    expect(countryOf({ language: 'x-private' })).toBeNull();
  });

  it('reads the region out of a language tag, including a multi-subtag one', () => {
    expect(regionOfLanguage('pl-PL')).toBe('PL');
    expect(regionOfLanguage('pl')).toBeNull();
    expect(regionOfLanguage('zh-Hant-TW')).toBe('TW');
    expect(regionOfLanguage(null)).toBeNull();
    expect(regionOfLanguage(undefined)).toBeNull();
  });

  it('never throws when the browser cannot answer', () => {
    expect(() => browserCountry()).not.toThrow();
    expect(browserCountry() === null || /^[A-Z]{2}$/.test(browserCountry()!)).toBe(true);
  });
});

describe('drawing it', () => {
  it('renders a country code as its two regional-indicator letters', () => {
    expect(flagOf('PL')).toBe('\u{1F1F5}\u{1F1F1}');
    expect(flagOf('GB')).toBe('\u{1F1EC}\u{1F1E7}');
  });

  it('renders NOTHING for an unknown code, so no placeholder box appears', () => {
    expect(flagOf(null)).toBe('');
    expect(flagOf('')).toBe('');
    expect(flagOf('POL')).toBe('');
    expect(flagOf('p')).toBe('');
    expect(flagOf('1A')).toBe('');
  });

  it('names the country for the flag’s accessible label', () => {
    expect(countryName('PL', 'en')).toBe('Poland');
    expect(countryName(null)).toBe('');
    // Whatever the platform calls a code it does not know, it must answer rather than throw.
    expect(countryName('ZZ').length).toBeGreaterThan(0);
  });
});
