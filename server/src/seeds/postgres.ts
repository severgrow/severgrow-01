import type { PgClient, PgPool } from '../storage/postgres.js';
import { newId } from '../ids.js';
import { WORLD_CELL_IDS, worldNeighbours } from '../world.js';
import { SEED_ECONOMY, utcDay } from './config.js';
import { planSeedReward } from './rewards.js';
import type { ClaimResult, RewardInput, RewardResult, SeedWallet, TrainingTicket, WorldEconomyStore } from './types.js';
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

/** All debits, credits, caps and claims are checked and written inside Postgres transactions. */
export const postgresWorldEconomyStore = (pool: PgPool): WorldEconomyStore => ({
  async wallet(playerId) {
    const { rows } = await pool.query('select * from seed_wallets where player_id = $1', [playerId]);
    return rows[0] ? walletFromRow(rows[0]) : emptyWallet();
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
      if (!WORLD_CELL_IDS.has(cellId)) return fail('INVALID_CELL');
      const occupied = await client.query('select owner_id from world_claims where cell_id=$1', [cellId]);
      if (occupied.rows.length) return fail('OCCUPIED');
      const own = await client.query('select cell_id from world_claims where owner_id=$1', [playerId]);
      if (own.rows.length && !worldNeighbours(cellId).some((id) => own.rows.some((r) => r.cell_id === id))) return fail('NOT_ADJACENT');
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
            SEED_ECONOMY.version, input.now, JSON.stringify({ outcome: input.outcome, campaignLevel: input.campaignLevel ?? null })],
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
});
