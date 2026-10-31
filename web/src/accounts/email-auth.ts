/** Supabase manages code expiry, attempts, confirmation and email delivery. No passwords or SDK. */
export const emailAddress = (value: string): string | null => {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};
export const emailCode = (value: string): string | null => /^\d{6,10}$/.test(value.trim()) ? value.trim() : null;

/** Bound the whole response body, not just receipt of its headers. */
type AuthFetch = (url:string,init?:RequestInit)=>Promise<Response>;
export const authJson = async (url: string, init: RequestInit = {}, fetcher:AuthFetch = fetch): Promise<{ok: boolean; status: number; json: Record<string, unknown>}> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetcher(url, {...init, signal:controller.signal});
    let json: Record<string, unknown> = {};
    const raw: unknown = await res.json().catch((error:unknown) => { if (res.ok) throw error; return null; });
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) json = raw as Record<string, unknown>;
    return {ok:res.ok,status:res.status,json};
  } finally { clearTimeout(timer); }
};

export const createEmailAuth = (opts: {url: string; key: string; fetch?: (url:string,init?:RequestInit)=>Promise<Response>}) => {
  const request = async (path:string, body:unknown) => {
    const url = `${opts.url.replace(/\/+$/,'')}/auth/v1/${path}`;
    const init = {method:'POST',headers:{apikey:opts.key,'content-type':'application/json'},body:JSON.stringify(body)};
    const result = await authJson(url,init,opts.fetch);
    if (!result.ok) throw new Error(result.status === 429 ? 'rate-limited' : 'invalid-code');
    return result.json;
  };
  return {
    send: async (email:string): Promise<void> => { await request('otp',{email,create_user:true}); },
    verify: async (email:string,token:string): Promise<string> => {
      const json = await request('verify',{email,token,type:'email'});
      if (typeof json.access_token !== 'string' || !json.access_token) throw new Error('invalid-code');
      return json.access_token;
    },
  };
};
