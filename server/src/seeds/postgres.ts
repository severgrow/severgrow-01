import type { PgClient, PgPool } from '../storage/postgres.js';
import { newId } from '../ids.js';
import { parseWorldCell, seenCellIds, worldNeighbours } from '../world.js';
import {
  SEED_ECONOMY,
  WORLD_CHALLENGE_OPEN_LIMIT,
  WORLD_CHALLENGE_STALE_MS,
  WORLD_CHALLENGE_TTL_MS,
  utcDay,
} from './config.js';
import { planSeedReward } from './rewards.js';
import type {
  AdminCellResult,
  AdminSeedAdjustResult,
  ChallengeRespondResult,
  ChallengeSendResult,
  ChallengeSettleResult,
  ClaimResult,
  SellResult,
  RewardInput,
  RewardResult,
  SeedWallet,
  TrainingTicket,
  WorldChallenge,
  WorldChallengeStatus,
  WorldEconomyStore,
} from './types.js';
import { emptyWallet } from './types.js';

const number = (v: unknown): number => Number(v ?? 0);
const walletFromRow = (r: Record<string, unknown>): SeedWallet => ({
  balance: number(r.balance),
  lifetimeEarned: number(r.lifetime_earned),
  lifetimeSpent: number(r.lifetime_spent),
  worldInvitationSeen: r.world_invitation_seen === true || r.world_invitation_seen === 't',
});
const lockedWallet = async (client: PgClient, playerId: string): Promise<SeedWallet> => {
  await client.query('insert into seed_wallets(player_id) values ($1) on conflict do nothing', [playerId]);
  const { rows } = await client.query('select * from seed_wallets where player_id = $1 for update', [playerId]);
  return walletFromRow(rows[0]!);
};
const transaction = async <T>(pool: PgPool, work: (client: PgClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release?.();
  }
};

const challengeFromRow = (r: Record<string, unknown>): WorldChallenge => ({
  id: String(r.id),
  cellId: String(r.cell_id),
  challengerId: String(r.challenger_id),
  defenderId: String(r.defender_id),
  status: String(r.status) as WorldChallengeStatus,
  stake: number(r.stake),
  createdAt: number(r.created_at),
  expiresAt: number(r.expires_at),
  respondedAt: r.responded_at == null ? null : number(r.responded_at),
  matchId: r.match_id == null ? null : String(r.match_id),
  winnerId: r.winner_id == null ? null : String(r.winner_id),
  resolvedAt: r.resolved_at == null ? null : number(r.resolved_at),
});

/**
 * Credit a wallet and record the matching positive ledger row in the caller's transaction. The
 * wallet row is created lazily, so a defender who has never earned Seeds can still be paid a stake.
 * Lifetime counters are deliberately untouched: this is a transfer, not an earning.
 */
const creditWallet = async (
  client: PgClient,
  playerId: string,
  amount: number,
  sourceKey: string,
  now: number,
): Promise<void> => {
  await client.query('insert into seed_wallets(player_id) values ($1) on conflict do nothing', [playerId]);
  const changed = await client.query('update seed_wallets set balance=balance+$2 where player_id=$1 returning *', [playerId, amount]);
  const wallet = walletFromRow(changed.rows[0]!);
  await client.query(
    `insert into seed_ledger(id,player_id,delta,balance_after,category,source_key,economy_version,created_at)
     values($1,$2,$3,$4,'world_challenge',$5,$6,$7)`,
    [newId(), playerId, amount, wallet.balance, sourceKey, SEED_ECONOMY.version, now],
  );
};

/**
 * Re-own a held cell, but ONLY while the expected holder still holds it. Returns true when the
 * ownership actually moved; that is the single condition that also bumps the world revision.
 */
const takeCell = async (
  client: PgClient,
  cellId: string,
  expectedOwnerId: string,
  toPlayerId: string,
  now: number,
): Promise<boolean> => {
  const updated = await client.query(
    `update world_claims
        set owner_id=$3, claimed_at=$4, source='challenge', purchase_request_key=null
      where cell_id=$1 and owner_id=$2
      returning cell_id`,
    [cellId, expectedOwnerId, toPlayerId, now],
  );
  return updated.rows.length > 0;
};

/** All debits, credits, caps and claims are checked and written inside Postgres transactions. */
export const postgresWorldEconomyStore = (pool: PgPool): WorldEconomyStore => ({
  async wallet(playerId) {
    const { rows } = await pool.query('select * from seed_wallets where player_id = $1', [playerId]);
    return rows[0] ? walletFromRow(rows[0]) : emptyWallet();
  },
  /**
   * The account's place, from its OWN verified clears: the same expression the public map's lateral
   * uses, scoped to one id. `campaign:c<chapter>-<level>` is the only key shape that counts; a
   * `lesson:10` receipt (which pays as a campaign mode) has no ordinal and correctly contributes
   * nothing. Null rather than 1 for a player who never cleared a level.
   */
  async campaignHighestLevel(playerId) {
    const { rows } = await pool.query(
      `select max((substring(source_key from '^campaign:c[0-9]+-([0-9]+)$'))::int) as level
         from seed_reward_receipts
        where player_id = $1 and mode = 'campaign'`,
      [playerId],
    );
    const level = rows[0]?.level;
    return level == null ? null : number(level);
  },
  async world() {
    return transaction(pool, async (client) => {
      // A shared lock gives a revision and ownership list from the same committed claim state.
      // Claim writers take this row exclusively before inserting a claim.
      const meta = await client.query('select revision from world_meta where version = 1 for share');
      // ONE query, whatever the map's size: the owner's highest settled Campaign level comes from a
      // lateral subquery over their own receipts, so the world read stays a single round trip and no
      // per-claim query is issued. The level id is OPAQUE here (docs/ADMIN.md and the isolation
      // guard in tests/campaign/isolation.test.ts): the ordinal is parsed out of the recorded
      // `campaign:c<chapter>-<level>` key, never looked up in the campaign tables. A key that does
      // not match yields NULL → the claim carries no level, not a misleading 1. The lateral is
      // indexed by the receipts' (player_id, source_key) primary key, so it stays cheap on a map
      // every client polls.
      const claims = await client.query(`select c.cell_id, c.owner_id, c.claimed_at, p.display_name as owner_name, lvl.level as owner_level
                    from world_claims c
                    join players p on p.id = c.owner_id
                    left join lateral (
                      select max((substring(r.source_key from '^campaign:c[0-9]+-([0-9]+)$'))::int) as level
                      from seed_reward_receipts r
                      where r.player_id = c.owner_id and r.mode = 'campaign'
                    ) lvl on true
                    order by c.cell_id`);
      return {
        revision: number(meta.rows[0]?.revision),
        claims: claims.rows.map((r) => ({
          cellId: String(r.cell_id), ownerId: String(r.owner_id),
          ownerName: r.owner_name == null ? null : String(r.owner_name),
          ownerLevel: r.owner_level == null ? null : number(r.owner_level),
          claimedAt: number(r.claimed_at),
        })),
      };
    });
  },
  async claim(playerId, cellId, requestId, now): Promise<ClaimResult> {
    return transaction(pool, async (client) => {
      const wallet = await lockedWallet(client, playerId);
      const prior = await client.query('select cell_id from world_claims where owner_id=$1 and purchase_request_key=$2', [playerId, requestId]);
      if (prior.rows[0]) {
        const meta = await client.query('select revision from world_meta where version=1');
        return { ok: true, cellId: String(prior.rows[0].cell_id), revision: number(meta.rows[0]?.revision), wallet, replayed: true };
      }
      // Serialize all claims before checking availability/adjacency and incrementing revision.
      const meta = await client.query('select revision from world_meta where version=1 for update');
      const revision = number(meta.rows[0]?.revision);
      const fail = (code: 'NO_FUNDS' | 'OCCUPIED' | 'NOT_ADJACENT' | 'INVALID_CELL'): ClaimResult =>
        ({ ok: false, code, revision, wallet });
      // Anywhere on the SEEN map (owner, 2026-10-27: no longer next to your own tiles); land nobody
      // can see yet is not for sale. Read under the world lock above, so the seen map cannot move.
      if (!parseWorldCell(cellId)) return fail('INVALID_CELL');
      const all = await client.query('select cell_id from world_claims');
      if (!seenCellIds(all.rows.map((r) => String(r.cell_id))).has(cellId)) return fail('INVALID_CELL');
      if (all.rows.some((r) => String(r.cell_id) === cellId)) return fail('OCCUPIED');
      if (wallet.balance < SEED_ECONOMY.tileCost) return fail('NO_FUNDS');
      await client.query(
        `insert into world_claims(cell_id, owner_id, claimed_at, purchase_request_key, source)
         values($1,$2,$3,$4,'purchase')`, [cellId, playerId, now, requestId],
      );
      const updated = await client.query(
        `update seed_wallets set balance=balance-$2, lifetime_spent=lifetime_spent+$2
          where player_id=$1 and balance >= $2 returning *`, [playerId, SEED_ECONOMY.tileCost],
      );
      if (!updated.rows[0]) throw new Error('Wallet debit failed after locked balance check.');
      const next = walletFromRow(updated.rows[0]);
      await client.query(
        `insert into seed_ledger(id,player_id,delta,balance_after,category,source_key,economy_version,created_at)
         values($1,$2,$3,$4,'world_claim',$5,$6,$7)`,
        [newId(), playerId, -SEED_ECONOMY.tileCost, next.balance, `world:${requestId}`, SEED_ECONOMY.version, now],
      );
      await client.query('update world_meta set revision=revision+1 where version=1', []);
      return { ok: true, cellId, revision: revision + 1, wallet: next, replayed: false };
    });
  },
  async sell(playerId, cellId, requestId, now): Promise<SellResult> {
    return transaction(pool, async (client) => {
      const wallet = await lockedWallet(client, playerId);
      const sourceKey = `world-sale:${requestId}`;
      // Idempotent by request: the ledger row IS the receipt.
      const prior = await client.query('select 1 from seed_ledger where player_id=$1 and source_key=$2', [playerId, sourceKey]);
      if (prior.rows[0]) {
        const meta = await client.query('select revision from world_meta where version=1');
        return { ok: true, cellId, revision: number(meta.rows[0]?.revision), wallet, replayed: true };
      }
      // The same serialization point every claim takes.
      const meta = await client.query('select revision from world_meta where version=1 for update');
      const revision = number(meta.rows[0]?.revision);
      const fail = (code: 'NOT_OWNED' | 'CELL_BUSY' | 'INVALID_CELL'): SellResult => ({ ok: false, code, revision, wallet });
      if (!parseWorldCell(cellId)) return fail('INVALID_CELL');
      const held = await client.query('select owner_id from world_claims where cell_id=$1', [cellId]);
      if (String(held.rows[0]?.owner_id ?? '') !== playerId) return fail('NOT_OWNED');
      const busy = await client.query("select 1 from world_challenges where cell_id=$1 and status in ('pending','accepted')", [cellId]);
      if (busy.rows.length) return fail('CELL_BUSY');
      await client.query('delete from world_claims where cell_id=$1 and owner_id=$2', [cellId, playerId]);
      const updated = await client.query(
        'update seed_wallets set balance=balance+$2 where player_id=$1 returning *', [playerId, SEED_ECONOMY.tileSaleReturn],
      );
      if (!updated.rows[0]) throw new Error('Wallet credit failed for a tile sale.');
      const next = walletFromRow(updated.rows[0]);
      await client.query(
        `insert into seed_ledger(id,player_id,delta,balance_after,category,source_key,economy_version,created_at)
         values($1,$2,$3,$4,'world_sale',$5,$6,$7)`,
        [newId(), playerId, SEED_ECONOMY.tileSaleReturn, next.balance, sourceKey, SEED_ECONOMY.version, now],
      );
      await client.query('update world_meta set revision=revision+1 where version=1', []);
      return { ok: true, cellId, revision: revision + 1, wallet: next, replayed: false };
    });
  },
  async settle(input: RewardInput): Promise<RewardResult> {
    return transaction(pool, async (client) => {
      const wallet = await lockedWallet(client, input.playerId);
      const old = await client.query('select awarded,denial from seed_reward_receipts where player_id=$1 and source_key=$2', [input.playerId, input.sourceKey]);
      if (old.rows[0]) {
        return { awarded: number(old.rows[0].awarded), reason: old.rows[0].denial == null ? null : String(old.rows[0].denial), wallet, replayed: true };
      }
      if (input.mode === 'training') {
        const ticket = await client.query('select * from training_seed_tickets where id=$1 for update', [input.trainingTicketId ?? '']);
        const t = ticket.rows[0];
        if (!t || String(t.player_id) !== input.playerId || t.used_at != null || number(t.expires_at) < input.now) {
          throw new Error('Invalid or expired Training ticket.');
        }
        await client.query('update training_seed_tickets set used_at=$2 where id=$1', [input.trainingTicketId, input.now]);
      }
      const day = utcDay(input.now);
      const totals = await client.query(
        `select
           count(*) filter (where mode=$3 and awarded>0) as mode_paid,
           count(*) filter (where mode=$3 and opponent_id=$4 and awarded>0) as pair_paid,
           coalesce(sum(awarded) filter (where mode <> 'campaign'),0) as total_earned
         from seed_reward_receipts where player_id=$1 and utc_day=$2`,
        [input.playerId, day, input.mode, input.opponentId],
      );
      const data = totals.rows[0]!;
      const decision = planSeedReward(input, {
        modePaid: number(data.mode_paid), pairPaid: number(data.pair_paid), totalEarned: number(data.total_earned),
      });
      await client.query(
        `insert into seed_reward_receipts(player_id,source_key,mode,opponent_id,utc_day,awarded,denial,economy_version,created_at)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [input.playerId, input.sourceKey, input.mode, input.opponentId, day, decision.amount, decision.reason, SEED_ECONOMY.version, input.now],
      );
      let next = wallet;
      if (decision.amount) {
        const changed = await client.query(
          `update seed_wallets set balance=balance+$2, lifetime_earned=lifetime_earned+$2
            where player_id=$1 returning *`, [input.playerId, decision.amount],
        );
        next = walletFromRow(changed.rows[0]!);
        await client.query(
          `insert into seed_ledger(id,player_id,delta,balance_after,category,source_key,economy_version,created_at,metadata)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
          [newId(), input.playerId, decision.amount, next.balance, input.mode, input.sourceKey,
            SEED_ECONOMY.version, input.now, JSON.stringify({ outcome: input.outcome, campaignLevel: input.campaignLevel ?? null, lessonLevel: input.lessonLevel ?? null, dailyPuzzle: input.dailyPuzzle ?? null })],
        );
      }
      return { awarded: decision.amount, reason: decision.reason, wallet: next, replayed: false };
    });
  },
  async acknowledgeInvitation(playerId) {
    await pool.query(`insert into seed_wallets(player_id,world_invitation_seen) values($1,true)
      on conflict(player_id) do update set world_invitation_seen=true`, [playerId]);
  },
  async issueTrainingTicket(ticket: TrainingTicket) {
    await pool.query(
      `insert into training_seed_tickets(id,player_id,seed,bot_level,created_at,expires_at,used_at)
       values($1,$2,$3,$4,$5,$6,null)`,
      [ticket.id, ticket.playerId, ticket.seed, ticket.botLevel, ticket.createdAt, ticket.expiresAt],
    );
  },
  async trainingTicket(id) {
    const { rows } = await pool.query('select * from training_seed_tickets where id=$1', [id]);
    const r = rows[0];
    return r ? {
      id: String(r.id), playerId: String(r.player_id), seed: number(r.seed), botLevel: number(r.bot_level),
      createdAt: number(r.created_at), expiresAt: number(r.expires_at), usedAt: r.used_at == null ? null : number(r.used_at),
    } : null;
  },

  // ---- Territory challenges -------------------------------------------------
  //
  // The send path is the proven `claim()` shape: lock the wallet, then insert the escrow row, the
  // challenge row and the signed ledger entry in ONE transaction. Every settlement path locks the
  // challenge row first and moves the stake in that same transaction, so a retry can never pay
  // twice and the two players' balances always net to the value that existed before the challenge.

  async challenge(id) {
    const { rows } = await pool.query('select * from world_challenges where id=$1', [id]);
    return rows[0] ? challengeFromRow(rows[0]) : null;
  },

  async sendChallenge(input): Promise<ChallengeSendResult> {
    try {
      return await transaction(pool, async (client) => {
        const wallet = await lockedWallet(client, input.challengerId);
        const prior = await client.query('select * from world_challenges where challenger_id=$1 and request_key=$2', [input.challengerId, input.requestId]);
        if (prior.rows[0]) return { ok: true, challenge: challengeFromRow(prior.rows[0]), replayed: true };
        const fail = (code: Extract<ChallengeSendResult, { ok: false }>['code']): ChallengeSendResult => ({ ok: false, code });
        if (!parseWorldCell(input.cellId)) return fail('INVALID_CELL');
        const target = await client.query('select owner_id from world_claims where cell_id=$1', [input.cellId]);
        if (!target.rows[0]) return fail('NOT_OWNED');
        const defenderId = String(target.rows[0].owner_id);
        if (defenderId === input.challengerId) return fail('OWN_TILE');
        const own = await client.query('select cell_id from world_claims where owner_id=$1', [input.challengerId]);
        if (!worldNeighbours(input.cellId).some((id) => own.rows.some((r) => String(r.cell_id) === id))) return fail('NOT_ADJACENT');
        const busy = await client.query("select 1 from world_challenges where cell_id=$1 and status in ('pending','accepted')", [input.cellId]);
        if (busy.rows.length) return fail('CELL_BUSY');
        const outgoing = await client.query("select count(*)::int as n from world_challenges where challenger_id=$1 and status in ('pending','accepted')", [input.challengerId]);
        if (number(outgoing.rows[0]?.n) >= WORLD_CHALLENGE_OPEN_LIMIT) return fail('TOO_MANY_OPEN');
        const incoming = await client.query("select count(*)::int as n from world_challenges where defender_id=$1 and status in ('pending','accepted')", [defenderId]);
        if (number(incoming.rows[0]?.n) >= WORLD_CHALLENGE_OPEN_LIMIT) return fail('DEFENDER_TOO_MANY');
        if (wallet.balance < input.stake) return fail('NO_FUNDS');
        const id = newId();
        const inserted = await client.query(
          `insert into world_challenges(id,cell_id,challenger_id,defender_id,status,stake,request_key,created_at,expires_at)
           values($1,$2,$3,$4,'pending',$5,$6,$7,$8) returning *`,
          [id, input.cellId, input.challengerId, defenderId, input.stake, input.requestId, input.now, input.now + WORLD_CHALLENGE_TTL_MS],
        );
        const updated = await client.query(
          `update seed_wallets set balance=balance-$2, lifetime_spent=lifetime_spent+$2
            where player_id=$1 and balance >= $2 returning *`, [input.challengerId, input.stake],
        );
        if (!updated.rows[0]) throw new Error('Wallet debit failed after locked balance check.');
        const next = walletFromRow(updated.rows[0]);
        await client.query(
          `insert into seed_ledger(id,player_id,delta,balance_after,category,source_key,economy_version,created_at)
           values($1,$2,$3,$4,'world_challenge',$5,$6,$7)`,
          [newId(), input.challengerId, -input.stake, next.balance, `world-challenge:${id}:escrow`, SEED_ECONOMY.version, input.now],
        );
        return { ok: true, challenge: challengeFromRow(inserted.rows[0]!), replayed: false };
      });
    } catch (error) {
      // A genuine unique violation is one of the two database-enforced guarantees: the request key
      // (the send was already applied) or the one-open-per-cell index (somebody else got there
      // first). Both are normal outcomes, never a 500.
      const unique = typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
      if (!unique) throw error;
      const prior = await pool.query('select * from world_challenges where challenger_id=$1 and request_key=$2', [input.challengerId, input.requestId]);
      if (prior.rows[0]) return { ok: true, challenge: challengeFromRow(prior.rows[0]), replayed: true };
      return { ok: false, code: 'CELL_BUSY' };
    }
  },

  async respondChallenge(input): Promise<ChallengeRespondResult> {
    return transaction(pool, async (client) => {
      const locked = await client.query('select * from world_challenges where id=$1 for update', [input.id]);
      if (!locked.rows[0]) return { ok: false, code: 'CHALLENGE_NOT_FOUND' };
      const c = challengeFromRow(locked.rows[0]);
      if (c.defenderId !== input.defenderId) return { ok: false, code: 'CHALLENGE_NOT_FOUND' };
      if (c.status === 'accepted' && input.accept) return { ok: true, challenge: c, replayed: true };
      if (c.status === 'declined' && !input.accept) return { ok: true, challenge: c, replayed: true };
      if (c.status !== 'pending') return { ok: false, code: 'CHALLENGE_CLOSED' };
      if (input.accept && !input.matchId) return { ok: false, code: 'CHALLENGE_CLOSED' };
      if (input.accept) {
        const updated = await client.query(
          "update world_challenges set status='accepted', match_id=$2, responded_at=$3 where id=$1 returning *",
          [c.id, input.matchId, input.now],
        );
        return { ok: true, challenge: challengeFromRow(updated.rows[0]!), replayed: false };
      }
      const updated = await client.query(
        "update world_challenges set status='declined', responded_at=$2 where id=$1 returning *", [c.id, input.now],
      );
      await creditWallet(client, c.challengerId, c.stake, `world-challenge:${c.id}:refund`, input.now);
      return { ok: true, challenge: challengeFromRow(updated.rows[0]!), replayed: false };
    });
  },

  async settleChallenge(input): Promise<ChallengeSettleResult> {
    return transaction(pool, async (client) => {
      const locked = await client.query('select * from world_challenges where id=$1 for update', [input.id]);
      if (!locked.rows[0]) return { ok: false, code: 'CHALLENGE_NOT_FOUND' };
      const c = challengeFromRow(locked.rows[0]);
      if (c.challengerId !== input.playerId && c.defenderId !== input.playerId) {
        return { ok: false, code: 'NOT_PARTICIPANT' };
      }
      if (c.status === 'resolved') {
        return { ok: true, challenge: c, settled: false, winnerId: c.winnerId, cellId: c.cellId, replayed: true };
      }
      if (c.status !== 'accepted') return { ok: false, code: 'CHALLENGE_CLOSED' };
      // The first confirmation settles. The row lock makes a concurrent second confirmation wait,
      // then see `resolved` above and replay the stored result instead of transferring again.
      if (input.winnerId === c.challengerId &&
        await takeCell(client, c.cellId, c.defenderId, c.challengerId, input.now)) {
        await client.query('update world_meta set revision=revision+1 where version=1', []);
      }
      if (input.winnerId === c.defenderId) {
        await creditWallet(client, c.defenderId, c.stake, `world-challenge:${c.id}:payout`, input.now);
      } else {
        await creditWallet(client, c.challengerId, c.stake,
          `world-challenge:${c.id}:${input.winnerId === null ? 'refund' : 'payout'}`, input.now);
      }
      const updated = await client.query(
        "update world_challenges set status='resolved', winner_id=$2, resolved_at=$3 where id=$1 returning *",
        [c.id, input.winnerId, input.now],
      );
      const next = challengeFromRow(updated.rows[0]!);
      return { ok: true, challenge: next, settled: true, winnerId: next.winnerId, cellId: next.cellId, replayed: false };
    });
  },

  async challengesInvolving(playerId, since) {
    const { rows } = await pool.query(
      `select * from world_challenges
        where (challenger_id=$1 and created_at >= $2)
           or (defender_id=$1 and (status in ('pending','accepted') or created_at >= $2))
        order by created_at desc limit 50`,
      [playerId, since],
    );
    return rows.map(challengeFromRow);
  },

  async expireChallenges(now) {
    return transaction(pool, async (client) => {
      const due = await client.query(
        `select * from world_challenges
          where (status='pending' and expires_at <= $1)
             or (status='accepted' and responded_at is not null and responded_at + $2 <= $1)
          for update`,
        [now, WORLD_CHALLENGE_STALE_MS],
      );
      let changed = 0;
      for (const row of due.rows) {
        const c = challengeFromRow(row);
        if (c.status === 'pending') {
          // Unanswered for 24 h: the owner's decision is a forfeit. The tile moves to the
          // challenger and their own stake comes back; the defender loses the tile.
          if (await takeCell(client, c.cellId, c.defenderId, c.challengerId, now)) {
            await client.query('update world_meta set revision=revision+1 where version=1', []);
          }
          await creditWallet(client, c.challengerId, c.stake, `world-challenge:${c.id}:payout`, now);
          await client.query(
            "update world_challenges set status='expired', winner_id=$2, resolved_at=$3 where id=$1",
            [c.id, c.challengerId, now],
          );
        } else {
          // Accepted but unresolved for 7 days: close honestly and refund. Never transfers.
          await creditWallet(client, c.challengerId, c.stake, `world-challenge:${c.id}:refund`, now);
          await client.query("update world_challenges set status='stale', resolved_at=$2 where id=$1", [c.id, now]);
        }
        changed += 1;
      }
      return changed;
    });
  },

  // ---- Owner edits from the admin dashboard ---------------------------------

  async adminAdjustSeeds(input): Promise<AdminSeedAdjustResult> {
    return transaction(pool, async (client) => {
      const wallet = await lockedWallet(client, input.playerId);
      const sourceKey = `admin:${input.requestId}`;
      // unique(player_id, source_key) makes the request id the idempotency key, under the wallet lock.
      const prior = await client.query('select delta from seed_ledger where player_id=$1 and source_key=$2', [input.playerId, sourceKey]);
      if (prior.rows[0]) return { ok: true, wallet, delta: number(prior.rows[0].delta), replayed: true };
      if (wallet.balance + input.delta < 0) return { ok: false, code: 'BELOW_ZERO', wallet };
      // Lifetime counters are untouched: an owner's test grant is neither earned nor spent by play.
      const changed = await client.query('update seed_wallets set balance=balance+$2 where player_id=$1 returning *', [input.playerId, input.delta]);
      const next = walletFromRow(changed.rows[0]!);
      await client.query(
        `insert into seed_ledger(id,player_id,delta,balance_after,category,source_key,economy_version,created_at,metadata)
         values($1,$2,$3,$4,'admin_adjust',$5,$6,$7,$8)`,
        [newId(), input.playerId, input.delta, next.balance, sourceKey, SEED_ECONOMY.version, input.now,
          JSON.stringify({ actorId: input.actorId, reason: input.reason })],
      );
      return { ok: true, wallet: next, delta: input.delta, replayed: false };
    });
  },

  async adminSetCell(input): Promise<AdminCellResult> {
    if (!parseWorldCell(input.cellId)) return { ok: false, code: 'INVALID_CELL' };
    return transaction(pool, async (client) => {
      // The same serialization point every claim takes, so an edit never interleaves with a purchase.
      const meta = await client.query('select revision from world_meta where version=1 for update');
      const revision = number(meta.rows[0]?.revision);
      const held = await client.query('select owner_id from world_claims where cell_id=$1 for update', [input.cellId]);
      const previousOwnerId = held.rows[0] ? String(held.rows[0].owner_id) : null;
      if (previousOwnerId === input.ownerId) {
        return { ok: true, cellId: input.cellId, previousOwnerId, ownerId: input.ownerId, changed: false, revision, challengesClosed: 0 };
      }
      // An open challenge would otherwise settle against a tile that moved under it: close it as
      // stale and refund the escrow first, exactly as the 7-day close does.
      const open = await client.query(
        "select * from world_challenges where cell_id=$1 and status in ('pending','accepted') for update",
        [input.cellId],
      );
      for (const row of open.rows) {
        const c = challengeFromRow(row);
        await creditWallet(client, c.challengerId, c.stake, `world-challenge:${c.id}:refund`, input.now);
        await client.query("update world_challenges set status='stale', resolved_at=$2 where id=$1", [c.id, input.now]);
      }
      if (input.ownerId === null) {
        // Cascades to this cell's (now all closed) challenge rows; their Seeds are already settled
        // in seed_ledger, which is never touched.
        await client.query('delete from world_claims where cell_id=$1', [input.cellId]);
      } else {
        await client.query(
          `insert into world_claims(cell_id, owner_id, claimed_at, purchase_request_key, source)
           values($1,$2,$3,null,'admin')
           on conflict (cell_id) do update set owner_id=excluded.owner_id, claimed_at=excluded.claimed_at,
             purchase_request_key=null, source='admin'`,
          [input.cellId, input.ownerId, input.now],
        );
      }
      await client.query('update world_meta set revision=revision+1 where version=1', []);
      return { ok: true, cellId: input.cellId, previousOwnerId, ownerId: input.ownerId, changed: true, revision: revision + 1, challengesClosed: open.rows.length };
    });
  },
});
