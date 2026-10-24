import { describe, expect, it } from 'vitest';
import { postgresAdminStore } from '../src/admin/postgres.js';
import type { PgPool, PgRow } from '../src/storage/postgres.js';

const grant = { playerId: '5d1f6a0e-1c2b-4d3e-9f40-0a1b2c3d4e5f', amount: 100,
  reason: 'Playtest thank-you', actorId: '37e3d4d0-a34c-45b3-bc61-992fcf392912', requestId: 'test-atomic-0001', now: 1000 };

// A fault-injectable transaction boundary. A failing audit must roll back BOTH ledger and wallet.
const database = (failAudit = false) => {
  let balance = 0, ledger = 0, audits = 0, saved = [0, 0, 0];
  const statements: string[] = [];
  const query = async (text: string): Promise<{ rows: PgRow[] }> => {
    const sql = text.trim().toLowerCase(); statements.push(sql);
    if (sql === 'begin') saved = [balance, ledger, audits];
    if (sql === 'rollback') [balance, ledger, audits] = saved as [number, number, number];
    if (sql.startsWith('select 1 from players')) return { rows: [{ exists: 1 }] };
    if (sql.startsWith('select balance')) return { rows: [{ balance }] };
    if (sql.startsWith('select 1 from seed_ledger')) return { rows: ledger ? [{ exists: 1 }] : [] };
    if (sql.startsWith('update seed_wallets')) { balance += 100; return { rows: [{ balance }] }; }
    if (sql.startsWith('insert into seed_ledger')) ledger++;
    if (sql.startsWith('insert into admin_audit')) { if (failAudit) throw new Error('audit unavailable'); audits++; }
    return { rows: [] };
  };
  const pool: PgPool = { query: async () => { throw new Error('Grant must use its transaction client'); }, connect: async () => ({ query }) };
  return { store: postgresAdminStore(pool), state: () => ({ balance, ledger, audits }), statements };
};

describe('admin Seeds grant transaction', () => {
  it('commits the wallet, ledger and audit together', async () => {
    const db = database();
    await expect(db.store.grantSeeds(grant)).resolves.toEqual({ balance: 100, replayed: false });
    expect(db.state()).toEqual({ balance: 100, ledger: 1, audits: 1 });
    expect(db.statements.at(-1)).toBe('commit');
  });
  it('does not pay or leave a ledger row when the audit write fails', async () => {
    const db = database(true);
    await expect(db.store.grantSeeds(grant)).rejects.toThrow('audit unavailable');
    expect(db.state()).toEqual({ balance: 0, ledger: 0, audits: 0 });
    expect(db.statements.at(-1)).toBe('rollback');
  });
  it('replaying a successful grant changes neither the wallet nor the audit', async () => {
    const db = database(); await db.store.grantSeeds(grant);
    await expect(db.store.grantSeeds(grant)).resolves.toEqual({ balance: 100, replayed: true });
    expect(db.state()).toEqual({ balance: 100, ledger: 1, audits: 1 });
  });
});
