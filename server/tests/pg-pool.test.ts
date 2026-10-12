// The connection/TLS rules. Managed hosts (Supabase) require TLS, so this decides encrypt-or-not
// and never lets a password reach a log. Pure functions: no database needed.
import { describe, expect, it } from 'vitest';
import { databaseUrlFromEnv, redactUrl, sslForUrl } from '../src/storage/pg-pool.js';

const env = (values: Record<string, string>): NodeJS.ProcessEnv => values as NodeJS.ProcessEnv;

describe('sslForUrl', () => {
  it('encrypts for a remote host and not for localhost', () => {
    expect(sslForUrl('postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:5432/postgres')).toEqual({ rejectUnauthorized: false });
    expect(sslForUrl('postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres')).toEqual({ rejectUnauthorized: false });
    expect(sslForUrl('postgresql://u:p@localhost:5432/postgres')).toBe(false);
    expect(sslForUrl('postgresql://u:p@127.0.0.1:5432/postgres')).toBe(false);
  });

  it('honours sslmode in the URL', () => {
    expect(sslForUrl('postgresql://u:p@localhost:5432/postgres?sslmode=require')).toEqual({ rejectUnauthorized: false });
    expect(sslForUrl('postgresql://u:p@example.com:5432/postgres?sslmode=disable')).toBe(false);
    expect(sslForUrl('postgresql://u:p@example.com:5432/postgres?sslmode=verify-full')).toEqual({ rejectUnauthorized: true });
    expect(sslForUrl('postgresql://u:p@example.com:5432/postgres?sslmode=verify-ca')).toEqual({ rejectUnauthorized: true });
  });

  it('lets PGSSL override everything', () => {
    const check = env({ PGSSL: 'disable' });
    expect(sslForUrl('postgresql://u:p@example.com:5432/postgres', check)).toBe(false);
    const verify = env({ PGSSL: 'verify-full' });
    expect(sslForUrl('postgresql://u:p@localhost:5432/postgres', verify)).toEqual({ rejectUnauthorized: true });
    const makeItTls = env({ PGSSL: 'require' });
    expect(sslForUrl('postgresql://u:p@localhost:5432/postgres', makeItTls)).toEqual({ rejectUnauthorized: false });
    const off = env({ PGSSL: '0' });
    expect(sslForUrl('postgresql://u:p@somewhere.example:5432/postgres', off)).toBe(false);
  });

  it('never verifies the chain unless asked (managed-host default), and is safe on a bad URL', () => {
    const ssl = sslForUrl('postgresql://u:p@example.com:5432/postgres');
    expect(ssl).not.toBe(false);
    expect((ssl as { rejectUnauthorized: boolean }).rejectUnauthorized).toBe(false);
    expect(sslForUrl('this is not a url')).toEqual({ rejectUnauthorized: false });
  });
});

describe('databaseUrlFromEnv', () => {
  it('is null when unset, empty or whitespace, and trims otherwise', () => {
    expect(databaseUrlFromEnv(env({}))).toBeNull();
    expect(databaseUrlFromEnv(env({ DATABASE_URL: '' }))).toBeNull();
    expect(databaseUrlFromEnv(env({ DATABASE_URL: '   ' }))).toBeNull();
    expect(databaseUrlFromEnv(env({ DATABASE_URL: '  postgresql://x  ' }))).toBe('postgresql://x');
  });
});

describe('redactUrl', () => {
  it('never shows the password', () => {
    const redacted = redactUrl('postgresql://postgres.secretref:SuperSecret123@aws-0-eu-west-1.pooler.supabase.com:5432/postgres');
    expect(redacted).not.toContain('SuperSecret123');
    expect(redacted).toContain('***');
    expect(redacted).toContain('pooler.supabase.com');
  });

  it('does not throw on a value that is not a URL', () => {
    expect(redactUrl('not-a-url')).toBe('<unparseable connection string>');
  });
});
