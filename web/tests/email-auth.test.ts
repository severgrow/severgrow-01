import { describe, expect, it, vi } from 'vitest';
import { emailAddress, emailCode, createEmailAuth, authJson } from '../src/accounts/email-auth.js';
describe('email code sign-in', () => {
  it('validates addresses and accepts configured 6–10 digit Supabase codes', () => {
    expect(emailAddress(' person@example.com ')).toBe('person@example.com');
    for (const v of ['', 'a@', 'a\nb@example.com', 'a b@example.com']) expect(emailAddress(v)).toBeNull();
    expect(emailCode('12345678')).toBe('12345678');
    expect(emailCode(' 123456 ')).toBe('123456');
    expect(emailCode('abc123')).toBeNull();
    expect(emailCode('１２３４ ５６７８')).toBe('12345678');
    expect(emailCode('1234-5678')).toBe('12345678');
    expect(emailCode('12345-67890')).toBe('1234567890');
    expect(emailCode('code: 123456')).toBeNull();
  });
  it('requests a code and verifies without a redirect, password, or user-controlled identity', async () => {
    const calls: {url:string; body:unknown}[] = [];
    const auth = createEmailAuth({url:'https://project.supabase.co',key:'public',fetch:async (url,init) => {
      calls.push({url,body:JSON.parse(String(init?.body))});
      return new Response(JSON.stringify(url.endsWith('/verify') ? {access_token:'verified-token'} : {}),{status:200});
    }});
    await auth.send('a@example.com');
    expect(await auth.verify('a@example.com','123456')).toBe('verified-token');
    expect(calls).toEqual([
      {url:'https://project.supabase.co/auth/v1/otp',body:{email:'a@example.com',create_user:true}},
      {url:'https://project.supabase.co/auth/v1/verify',body:{email:'a@example.com',token:'123456',type:'email'}},
    ]);
  });
  it('does not expose server text or treat a malformed verify response as signed in', async () => {
    const auth = createEmailAuth({url:'https://x',key:'public',fetch:async () => new Response('{}')});
    await expect(auth.verify('a@example.com','123456')).rejects.toThrow('invalid-code');
    const limited = createEmailAuth({url:'https://x',key:'public',fetch:async () => new Response('private details',{status:429})});
    await expect(limited.send('a@example.com')).rejects.toThrow('rate-limited');
  });
});

it('bounds a stalled response body, not just the network handshake', async () => {
  vi.useFakeTimers();
  let signal:AbortSignal|undefined;
  vi.stubGlobal('fetch',async (_url:unknown,init:RequestInit)=>{
    signal=init.signal as AbortSignal;
    return {ok:true,status:200,json:()=>new Promise((_resolve,reject)=>signal!.addEventListener('abort',()=>reject(new Error('aborted'))))};
  });
  try {
    const pending=authJson('https://auth.example/settings');
    const rejected=expect(pending).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(signal?.aborted).toBe(true);
  } finally {vi.unstubAllGlobals();vi.useRealTimers();}
});
