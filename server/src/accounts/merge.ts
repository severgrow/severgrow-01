// GUEST → EXISTING ACCOUNT: KEEP THE BEST OF BOTH (owner decision 2026-11-18, accounts pass).
//
// Before this, a device whose guest signed into an account that already existed simply switched to
// the account: everything the guest had earned (Seeds, tiles, cleared levels, achievements, streaks)
// stayed behind on a guest nobody could reach again. Now the sign-in moves it across in ONE
// transaction, so either all of it moves or none of it does:
//
//   Seeds           the guest's balance is ADDED to the account (a ledger row on each side)
//   tiles           every tile the guest owns now belongs to the account
//   facts           receipts, campaign clears, matches, tickets, offline stats move to the account,
//                   so its achievements count both; a fact both already have stays the account's own
//                   (the better campaign clear is kept), so nothing is paid or counted twice
//   campaign        every level either cleared, the better result per level (merge-rules.ts)
//   guide           everything either has seen
//   settings        per setting the newer choice; lesson progress and tips only grow (account-prefs.ts)
//   streaks         the higher best per Practice key and the account's current streak; online Blitz best
//   colour / skin   the account's, or the guest's if the account never chose one
//
// The guest is then RETIRED: `player_merges` records it (its primary key makes a merge happen at most
// once, whichever device or retry asks) and its tokens are revoked. Only a guest is ever merged, and
// only into a different player. A server without migration 0029 merges nothing (today's behaviour).
import { newId } from '../ids.js';
import { SEED_ECONOMY } from '../seeds/config.js';
import type { PgClient, PgPool } from '../storage/postgres.js';
import type { AccountCampaignBest, AccountCampaignProgressWire } from '../account-campaign-progress.js';
import { mergeAccountGuide } from '../account-guide.js';
import { EMPTY_PREFS, mergePrefs, parsePrefs } from '../account-prefs.js';
import { mergeBlitzStreak, mergePracticeStreak, unionCampaignProgress } from './merge-rules.js';

/** What the player is told: what this device brought into the account. */
export type MergeSummary = { seeds: number; tiles: number; levels: number };

type Row = Record<string, unknown>;
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const missing = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === '42P01' || code === '42703'; // undefined table / column: the migration is not there yet
};

const asProgress = (row: Row | undefined): AccountCampaignProgressWire => ({
  completed: Array.isArray(row?.completed) ? (row!.completed as unknown[]).filter((x): x is string => typeof x === 'string') : [],
  best: row?.best && typeof row.best === 'object' ? (row.best as Record<string, AccountCampaignBest>) : {},
});

export const mergeGuestIntoAccount = async (
  pool: PgPool,
  input: { guestId: string; accountId: string; now: number },
): Promise<MergeSummary | null> => {
  const { guestId: g, accountId: a, now } = input;
  if (g === a) return null;
  const c: PgClient = await pool.connect();
  const q = (text: string, values: unknown[] = []) => c.query(text, values);
  try {
    await q('begin');
    // Both players locked, in a fixed order so two merges can never wait on each other.
    const players = (await q('select id, kind from players where id = any($1::uuid[]) order by id for update', [[g, a]])).rows;
    const guest = players.find((p) => p.id === g);
    if (!guest || guest.kind !== 'guest' || !players.some((p) => p.id === a)) {
      await q('rollback');
      return null;
    }
    // At most once: the second device, a retry or a race finds the row and merges nothing.
    const claimed = await q(
      `insert into player_merges (guest_id, account_id, merged_at) values ($1, $2, $3)
       on conflict (guest_id) do nothing returning guest_id`, [g, a, now]);
    if (claimed.rows.length === 0) {
      await q('rollback');
      return null;
    }

    // ---- Seeds: added, with a ledger row on each side ---------------------------------------------
    let seeds = 0;
    const gw = (await q('select balance from seed_wallets where player_id = $1 for update', [g])).rows[0];
    if (gw && num(gw.balance) > 0) {
      seeds = num(gw.balance);
      await q('insert into seed_wallets (player_id) values ($1) on conflict do nothing', [a]);
      await q('select balance from seed_wallets where player_id = $1 for update', [a]);
      await q('update seed_wallets set balance = 0, lifetime_spent = lifetime_spent + $2 where player_id = $1', [g, seeds]);
      const after = num((await q(
        'update seed_wallets set balance = balance + $2, lifetime_earned = lifetime_earned + $2 where player_id = $1 returning balance',
        [a, seeds])).rows[0]?.balance);
      const ledger = `insert into seed_ledger (id, player_id, delta, balance_after, category, source_key, economy_version, created_at, metadata)
                      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`;
      await q(ledger, [newId(), g, -seeds, 0, 'account_merge_out', `merge:into:${a}`, SEED_ECONOMY.version, now, JSON.stringify({ accountId: a })]);
      await q(ledger, [newId(), a, seeds, after, 'account_merge_in', `merge:from:${g}`, SEED_ECONOMY.version, now, JSON.stringify({ guestId: g })]);
    }

    // ---- Tiles: they belong to the account now --------------------------------------------------
    // A purchase key the account already used is renamed so the (owner, key) rule still holds.
    await q(`update world_claims set purchase_request_key = 'merged:' || $1 || ':' || purchase_request_key
             where owner_id = $1 and purchase_request_key in (select purchase_request_key from world_claims where owner_id = $2 and purchase_request_key is not null)`, [g, a]);
    const tiles = (await q('update world_claims set owner_id = $2 where owner_id = $1 returning cell_id', [g, a])).rows.length;
    // A challenge between the two of them is now a player against themself: it is closed, not moved.
    await q(`delete from world_challenges where (challenger_id = $1 and defender_id = $2) or (challenger_id = $2 and defender_id = $1)`, [g, a]);
    await q(`update world_challenges set challenger_id = $2 where challenger_id = $1
             and request_key not in (select request_key from world_challenges where challenger_id = $2)`, [g, a]);
    await q('update world_challenges set defender_id = $2 where defender_id = $1', [g, a]);
    await q('update world_challenges set winner_id = $2 where winner_id = $1', [g, a]);

    // ---- The facts achievements count: moved unless the account already has the same one --------
    await q(`update seed_reward_receipts set player_id = $2 where player_id = $1
             and source_key not in (select source_key from seed_reward_receipts where player_id = $2)`, [g, a]);
    // The better clear of a level both cleared: fewer turns.
    await q(`update campaign_clears ac set turns = gc.turns, throw_draws = gc.throw_draws, blooms = gc.blooms, grows = gc.grows, finished_at = gc.finished_at
             from campaign_clears gc where gc.player_id = $1 and ac.player_id = $2 and ac.level_key = gc.level_key and gc.turns < ac.turns`, [g, a]);
    await q(`update campaign_clears set player_id = $2 where player_id = $1
             and level_key not in (select level_key from campaign_clears where player_id = $2)`, [g, a]);
    await q('delete from campaign_clears where player_id = $1', [g]);
    // Matches the guest played (never one it played against the account: that would seat one player twice).
    const movable = `select match_id from match_participants where player_id = $1
                     and match_id not in (select match_id from match_participants where player_id = $2)`;
    await q(`update match_moves set player_id = $2 where player_id = $1 and match_id in (${movable})`, [g, a]);
    await q(`update match_participants set player_id = $2 where player_id = $1 and match_id in (${movable})`, [g, a]);
    await q('update training_seed_tickets set player_id = $2 where player_id = $1', [g, a]);
    await q(`insert into offline_stats (player_id, device_id, played, wins, losses, draws, best_streak, updated_at)
             select $2, device_id, played, wins, losses, draws, best_streak, updated_at from offline_stats where player_id = $1
             on conflict (player_id, device_id) do update set played = offline_stats.played + excluded.played,
               wins = offline_stats.wins + excluded.wins, losses = offline_stats.losses + excluded.losses,
               draws = offline_stats.draws + excluded.draws, best_streak = greatest(offline_stats.best_streak, excluded.best_streak),
               updated_at = greatest(offline_stats.updated_at, excluded.updated_at)`, [g, a]);
    await q('delete from offline_stats where player_id = $1', [g]);

    // ---- Campaign progress and the guide: the union ---------------------------------------------
    const pr = (await q('select player_id, completed, best from account_campaign_progress where player_id = any($1::uuid[]) for update', [[g, a]])).rows;
    const before = asProgress(pr.find((r) => r.player_id === a));
    const merged = unionCampaignProgress(before, asProgress(pr.find((r) => r.player_id === g)));
    const levels = merged.completed.length - before.completed.length;
    if (pr.length) {
      await q(`insert into account_campaign_progress (player_id, completed, best, updated_at) values ($1, $2::jsonb, $3::jsonb, $4)
               on conflict (player_id) do update set completed = excluded.completed, best = excluded.best, updated_at = excluded.updated_at`,
        [a, JSON.stringify(merged.completed), JSON.stringify(merged.best), now]);
    }
    const gd = (await q('select player_id, seen, games from account_guide where player_id = any($1::uuid[]) for update', [[g, a]])).rows;
    const gg = gd.find((r) => r.player_id === g);
    if (gg) {
      const ag = gd.find((r) => r.player_id === a);
      const guide = mergeAccountGuide(
        { seen: (ag?.seen as string[] | undefined) ?? [], games: num(ag?.games) },
        { seen: (gg.seen as string[]) ?? [], games: num(gg.games) },
      );
      await q(`insert into account_guide (player_id, seen, games, updated_at) values ($1, $2::jsonb, $3, $4)
               on conflict (player_id) do update set seen = excluded.seen, games = excluded.games, updated_at = excluded.updated_at`,
        [a, JSON.stringify(guide.seen), guide.games, now]);
    }

    // ---- Settings, lesson progress and tips (migration 0030; skipped where that table is not there yet,
    // checked first so a missing table can never abort the rest of the merge).
    if ((await q(`select to_regclass('public.account_prefs') as t`)).rows[0]?.t) {
      const docs = (await q('select player_id, doc from account_prefs where player_id = any($1::uuid[]) for update', [[g, a]])).rows;
      const gp = docs.find((r) => r.player_id === g);
      if (gp) {
        const ap = docs.find((r) => r.player_id === a);
        const read = (r: Row | undefined) => (r?.doc && typeof r.doc === 'object' ? parsePrefs(r.doc as Record<string, unknown>) : EMPTY_PREFS);
        const prefs = mergePrefs(read(ap), read(gp), now);
        await q(`insert into account_prefs (player_id, doc, updated_at) values ($1, $2::jsonb, $3)
                 on conflict (player_id) do update set doc = excluded.doc, updated_at = excluded.updated_at`, [a, JSON.stringify(prefs), now]);
      }
    }

    // ---- Streaks ---------------------------------------------------------------------------------
    const ps = (await q('select player_id, tier, current_streak, best_streak from practice_streaks where player_id = any($1::uuid[]) for update', [[g, a]])).rows;
    for (const gs of ps.filter((r) => r.player_id === g)) {
      const as = ps.find((r) => r.player_id === a && r.tier === gs.tier);
      const m = mergePracticeStreak(as ? { current: num(as.current_streak), best: num(as.best_streak) } : null,
        { current: num(gs.current_streak), best: num(gs.best_streak) });
      await q(`insert into practice_streaks (player_id, tier, current_streak, best_streak, updated_at) values ($1, $2, $3, $4, $5)
               on conflict (player_id, tier) do update set current_streak = excluded.current_streak, best_streak = excluded.best_streak, updated_at = excluded.updated_at`,
        [a, gs.tier, m.current, m.best, now]);
    }
    await q(`insert into practice_streak_games (player_id, game_id, tier, result, recorded_at)
             select $2, game_id, tier, result, recorded_at from practice_streak_games where player_id = $1 on conflict do nothing`, [g, a]);
    const bs = (await q('select player_id, current_streak, best_streak from online_blitz_streaks where player_id = any($1::uuid[]) for update', [[g, a]])).rows;
    const gb = bs.find((r) => r.player_id === g);
    if (gb) {
      const ab = bs.find((r) => r.player_id === a);
      const m = mergeBlitzStreak(ab ? { current: num(ab.current_streak), best: num(ab.best_streak) } : null,
        { current: num(gb.current_streak), best: num(gb.best_streak) });
      await q(`insert into online_blitz_streaks (player_id, current_streak, best_streak, updated_at) values ($1, $2, $3, $4)
               on conflict (player_id) do update set best_streak = excluded.best_streak, updated_at = excluded.updated_at`,
        [a, m.current, m.best, now]);
    }

    // ---- Colour and skin: the account's, or the guest's if the account never chose -------------
    await q(`update player_tile_colours set player_id = $2 where player_id = $1
             and not exists (select 1 from player_tile_colours where player_id = $2)`, [g, a]);
    await q(`update player_tile_skins set player_id = $2 where player_id = $1
             and not exists (select 1 from player_tile_skins where player_id = $2)`, [g, a]);

    // ---- The guest is retired --------------------------------------------------------------------
    await q('update player_tokens set revoked_at = $2 where player_id = $1 and revoked_at is null', [g, now]);
    const summary: MergeSummary = { seeds, tiles, levels };
    await q('update player_merges set summary = $2::jsonb where guest_id = $1', [g, JSON.stringify(summary)]);
    await q('commit');
    return summary;
  } catch (error) {
    await q('rollback').catch(() => undefined);
    if (missing(error)) return null; // migration 0029 not applied yet: sign in exactly as before
    throw error;
  } finally {
    c.release?.();
  }
};
