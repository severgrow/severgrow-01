// Accounts — wiring for the Node entry (kept apart so the Edge bundle never pulls in `pg`).
// Google sign-in is on only when SUPABASE_URL + SUPABASE_ANON_KEY are set (SUPABASE_SERVICE_ROLE_KEY
// lets "Delete my account" also delete the email from Supabase Auth). Never commit those values.
import type { MatchService } from '../service.js';
import type { Storage } from '../storage/types.js';
import { MemoryIdentityLinkStore, createAccountsRouter, postgresIdentityLinkStore, supabaseAuthProvider } from './accounts.js';
import type { AccountsRouter, IdentityLinkStore } from './accounts.js';

export const accountsRouterNode = async (storage: Storage, service: MatchService, databaseUrl: string | null, env: NodeJS.ProcessEnv = process.env): Promise<AccountsRouter> => {
  const { MemoryStorage } = await import('../storage/memory.js');
  let links: IdentityLinkStore;
  if (storage instanceof MemoryStorage || !databaseUrl) {
    links = new MemoryIdentityLinkStore(storage instanceof MemoryStorage ? (p, k, n) => storage.revokeTokensOfPlayer(p, k, n) : undefined);
  } else {
    const { poolFromUrl } = await import('../storage/pg-pool.js');
    links = postgresIdentityLinkStore(poolFromUrl(databaseUrl));
  }
  const url = env.SUPABASE_URL?.trim();
  const anonKey = (env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY)?.trim();
  const auth = url && anonKey ? supabaseAuthProvider({ url, anonKey, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? null }) : null;
  return createAccountsRouter({ links, storage, auth, authenticate: (t) => service.authenticate(t), now: () => service.serverNow() });
};
