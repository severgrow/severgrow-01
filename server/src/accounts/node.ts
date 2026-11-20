// Accounts — wiring for the Node entry (kept apart so the Edge bundle never pulls in `pg`).
// Google sign-in is on only when SUPABASE_URL + SUPABASE_ANON_KEY are set (SUPABASE_SERVICE_ROLE_KEY
// lets "Delete my account" also delete the email from Supabase Auth). Never commit those values.
import type { MatchService } from '../service.js';
import type { Storage } from '../storage/types.js';
import { MemoryIdentityLinkStore, createAccountsRouter, postgresIdentityLinkStore, supabaseAuthProvider } from './accounts.js';
import type { AccountsRouter, IdentityLinkStore } from './accounts.js';
import type { CountryStore } from './country.js';

export const accountsRouterNode = async (storage: Storage, service: MatchService, databaseUrl: string | null, env: NodeJS.ProcessEnv = process.env, injectedLinks?: IdentityLinkStore | null, injectedCountry?: CountryStore | null): Promise<AccountsRouter> => {
  const { MemoryStorage } = await import('../storage/memory.js');
  let links: IdentityLinkStore;
  let merge: ((guestId: string, accountId: string) => Promise<{ seeds: number; tiles: number; levels: number } | null>) | undefined;
  if (injectedLinks) links = injectedLinks;
  else if (storage instanceof MemoryStorage || !databaseUrl) {
    links = new MemoryIdentityLinkStore(storage instanceof MemoryStorage ? (p, k, n) => storage.revokeTokensOfPlayer(p, k, n) : undefined);
  } else {
    const { poolFromUrl } = await import('../storage/pg-pool.js');
    const { mergeGuestIntoAccount } = await import('./merge.js');
    const pool = poolFromUrl(databaseUrl);
    links = postgresIdentityLinkStore(pool);
    merge = (guestId, accountId) => mergeGuestIntoAccount(pool, { guestId, accountId, now: service.serverNow() });
  }
  // THE STORED COUNTRY (migration 0031): the dev server keeps it in memory, a real database in the
  // new table. Either way a sign-in records the edge's answer once; a missing table is a no-op.
  const { memoryCountryStore, postgresCountryStore } = await import('./country.js');
  const country = injectedCountry ?? (storage instanceof MemoryStorage || !databaseUrl
    ? memoryCountryStore()
    : postgresCountryStore((await import('../storage/pg-pool.js')).poolFromUrl(databaseUrl)));
  const url = env.SUPABASE_URL?.trim();
  const anonKey = (env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY)?.trim();
  const auth = url && anonKey ? supabaseAuthProvider({ url, anonKey, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? null }) : null;
  return createAccountsRouter({ links, storage, auth, country, emailEnabled: env.EMAIL_ACCOUNTS_ENABLED === 'true', authenticate: (t) => service.authenticate(t), now: () => service.serverNow(), ...(merge ? { merge } : {}) });
};
