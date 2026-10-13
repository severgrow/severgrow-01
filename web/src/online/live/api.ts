// Live duels — the tiny authenticated client for the live routes (server/src/live/router.ts).
// Same headers and region pin as DuelClient; fetch is injectable for tests.
import { DUEL_CLIENT_VERSION, DuelError } from '../../../../server/src/client.js';
import type { FetchLike } from '../../../../server/src/client.js';
import { CURRENT_RULES_VERSION } from '../../../../src/engine/index.js';
import type { ChallengeWire, LiveStatusWire, MyChallengesWire } from '../../../../server/src/live/service.js';
import type { PresenceStatus } from '../../../../server/src/live/types.js';

export type { ChallengeWire, LiveStatusWire, MyChallengesWire, PresenceStatus };

export type LiveApi = {
  presence(status: PresenceStatus, matchId: string | null): Promise<void>;
  status(matchId: string): Promise<LiveStatusWire>;
  challenge(matchId: string, kind?: 'live' | 'rematch'): Promise<{ challenge: ChallengeWire; liveMatchId: string | null }>;
  accept(id: string): Promise<{ challenge: ChallengeWire; liveMatchId: string }>;
  decline(id: string): Promise<{ challenge: ChallengeWire }>;
  cancel(id: string): Promise<{ challenge: ChallengeWire }>;
  inbox(): Promise<MyChallengesWire>;
  leave(matchId: string): Promise<LiveStatusWire>;
  setEnabled(enabled: boolean): Promise<void>;
};

export const createLiveApi = (options: { baseUrl: string; token: () => string | null; region?: string | null; fetch?: FetchLike }): LiveApi => {
  const base = options.baseUrl.replace(/\/+$/, '');
  const doFetch: FetchLike = options.fetch ?? ((url, init) => (globalThis as unknown as { fetch: FetchLike }).fetch(url, init));
  const url = (path: string) => (options.region ? `${base}${path}${path.includes('?') ? '&' : '?'}forceFunctionRegion=${encodeURIComponent(options.region)}` : `${base}${path}`);
  const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const token = options.token();
    if (!token) throw new DuelError('UNAUTHORIZED', 'No identity on this device.', 401);
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'x-futasaku-client-version': DUEL_CLIENT_VERSION,
      'x-futasaku-rules-version': CURRENT_RULES_VERSION,
    };
    const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await doFetch(url(path), init);
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    const d = data as { ok?: boolean; code?: string; message?: string } | null;
    if (!(res.ok ?? (res.status >= 200 && res.status < 300)) || d?.ok === false) {
      throw new DuelError(d?.code ?? 'HTTP_ERROR', d?.message ?? `Request failed (${res.status}).`, res.status);
    }
    return data as T;
  };
  const id = (s: string) => encodeURIComponent(s);
  return {
    presence: async (status, matchId) => {
      await send('POST', '/v1/players/me/presence', { status, ...(matchId ? { matchId } : {}) });
    },
    status: async (matchId) => (await send<{ live: LiveStatusWire }>('GET', `/v1/matches/${id(matchId)}/live`)).live,
    challenge: (matchId, kind = 'live') => send('POST', `/v1/matches/${id(matchId)}/live/challenge`, { kind }),
    accept: (cid) => send('POST', `/v1/challenges/${id(cid)}/accept`, {}),
    decline: (cid) => send('POST', `/v1/challenges/${id(cid)}/decline`, {}),
    cancel: (cid) => send('POST', `/v1/challenges/${id(cid)}/cancel`, {}),
    inbox: () => send('GET', '/v1/players/me/challenges'),
    leave: async (matchId) => (await send<{ live: LiveStatusWire }>('POST', `/v1/matches/${id(matchId)}/live/leave`, {})).live,
    setEnabled: async (enabled) => {
      await send('PATCH', '/v1/players/me', { liveChallengesEnabled: enabled });
    },
  };
};
