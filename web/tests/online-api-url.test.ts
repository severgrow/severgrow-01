import { describe, expect, it } from 'vitest';
import { duelApiUrlFrom } from '../src/online/config.js';

/**
 * The online build talks to EXACTLY the base the build was given. A wrong value here is not a local
 * bug: every player is affected at once (the client would POST a verifiable proof to a host that
 * cannot answer for this game). Owner reproduction, 2026-10-25: a local page pointed at the deployed
 * Server did not match the origin the API allows, so no proof was ever sent.
 *
 * The deployed production bundle was also read directly (`assets/config-*.js` carries the Edge URL),
 * and the browser suite asserts the built chunk carries the configured base — see
 * `web/e2e/seeds-campaign-33.ts`.
 */
const LIVE = 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel';

describe('the online API base comes from the build, not a guess', () => {
  it('resolves the configured Edge URL (trailing slashes trimmed)', () => {
    expect(duelApiUrlFrom({ VITE_DUEL_API_URL: `${LIVE}/` })).toBe(LIVE);
    expect(duelApiUrlFrom({ VITE_DUEL_API_URL: ` ${LIVE}// ` })).toBe(LIVE);
  });

  it('a build with no base is offline, never a silent localhost fallback', () => {
    expect(duelApiUrlFrom({})).toBeNull();
    expect(duelApiUrlFrom({ VITE_DUEL_API_URL: '   ' })).toBeNull();
    expect(duelApiUrlFrom(undefined)).toBeNull();
  });
});
