// Unit tests for deriving a trustworthy client IP behind a proxy. These guard the fix for the
// rate-limit bucketing bug: a shared/undefined derivation made unrelated players share one bucket.
import { describe, expect, it } from 'vitest';
import { isPublicIp, normalizeIp, parseForwardedFor, pickClientIp } from '../src/client-ip.js';

const headers = (values: Record<string, string>): Headers => new Headers(values);

describe('normalizeIp', () => {
  it('accepts plain IPv4 and IPv6 and lowercases them', () => {
    expect(normalizeIp('90.244.119.212')).toBe('90.244.119.212');
    expect(normalizeIp('2001:DB8::1')).toBe('2001:db8::1');
    expect(normalizeIp(' 1.2.3.4 ')).toBe('1.2.3.4');
  });

  it('strips a port or surrounding brackets', () => {
    expect(normalizeIp('1.2.3.4:443')).toBe('1.2.3.4');
    expect(normalizeIp('[2001:db8::1]:443')).toBe('2001:db8::1');
    expect(normalizeIp('[::1]')).toBe('::1');
  });

  it('rejects malformed, empty and non-IP values', () => {
    for (const bad of ['', '   ', 'not-an-ip', '1.2.3', '999.1.1.1', '1.2.3.4.5', ':::', 'unknown', null, undefined]) {
      expect(normalizeIp(bad), String(bad)).toBeNull();
    }
  });
});

describe('isPublicIp', () => {
  it('treats ordinary routable addresses as public', () => {
    expect(isPublicIp('90.244.119.212')).toBe(true);
    expect(isPublicIp('8.8.8.8')).toBe(true);
    expect(isPublicIp('2001:4860:4860::8888')).toBe(true);
  });

  it('rejects private, loopback, benchmark and reserved ranges', () => {
    for (const ip of [
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '127.0.0.1',
      '::1',
      '169.254.1.1',
      '100.64.0.1',
      '198.19.9.121', // the internal proxy hop observed in production
      '198.18.0.1',
      '203.0.113.7',
      '::ffff:10.0.0.1',
      'fd00::1',
      'fe80::1',
      '2001:db8::1',
      '224.0.0.1',
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
});

describe('parseForwardedFor', () => {
  it('splits a chain left-to-right and drops junk entries', () => {
    expect(parseForwardedFor('1.2.3.4, 5.6.7.8')).toEqual(['1.2.3.4', '5.6.7.8']);
    expect(parseForwardedFor('1.2.3.4, not-an-ip, 5.6.7.8')).toEqual(['1.2.3.4', '5.6.7.8']);
    expect(parseForwardedFor(null)).toEqual([]);
    expect(parseForwardedFor('')).toEqual([]);
  });
});

describe('pickClientIp', () => {
  it('prefers cf-connecting-ip, which Cloudflare protects from forgery', () => {
    const picked = pickClientIp(headers({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }));
    expect(picked).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip, then x-forwarded-for', () => {
    expect(pickClientIp(headers({ 'x-real-ip': '5.6.7.8', 'x-forwarded-for': '9.9.9.9' }))).toBe('5.6.7.8');
    expect(pickClientIp(headers({ 'x-forwarded-for': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('skips a private proxy hop and uses the public address next in the chain', () => {
    expect(pickClientIp(headers({ 'x-forwarded-for': '198.19.9.121, 90.244.119.212' }))).toBe('90.244.119.212');
  });

  it('still isolates a pure internal chain instead of collapsing everyone into one bucket', () => {
    expect(pickClientIp(headers({ 'x-forwarded-for': '10.0.0.1, 10.0.0.2' }))).toBe('10.0.0.1');
  });

  it('returns null when nothing valid is present', () => {
    expect(pickClientIp(headers({ 'x-forwarded-for': 'unknown' }))).toBeNull();
    expect(pickClientIp(headers({}))).toBeNull();
  });
});
