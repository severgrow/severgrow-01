// The dashboard's view of the API's response shapes.
//
// These are the SERVER's types, re-exported — not a hand-written mirror. A field added or renamed on
// the server breaks this build's typecheck immediately, which is the point: the dashboard cannot
// drift from the API it reads. Everything here is `import type`, so no server code is bundled.
export type {
  AdminBuildRow,
  AdminCampaign,
  AdminDayCount,
  AdminEconomy,
  AdminFunnel,
  AdminLedgerRow,
  AdminMatchDetail,
  AdminMatchRow,
  AdminOverview,
  AdminPage,
  AdminPlayerMatch,
  AdminPlayerResult,
  AdminPlayerRow,
  AdminReportRow,
  AdminStuck,
  AdminStuckMatch,
  AdminTriageStatus,
  AdminValueCount,
  AdminWorld,
} from '../../server/src/admin/types.js';

export type { AdminSession } from './api.js';

import type {
  AdminCampaign,
  AdminEconomy,
  AdminFunnel,
  AdminLedgerRow,
  AdminOverview,
  AdminStuck,
  AdminWorld,
} from '../../server/src/admin/types.js';

export type WhatsNew = {
  seenAt: number | null;
  counters: { reports: number; crashes: number; claims: number; matches: number };
  serverNow: number;
};

export type OverviewResponse = AdminOverview & { ok: true; rulesVersion: string };

export type OpsResponse = {
  ok: true;
  stuck: AdminStuck;
  rulesDrift: { current: string; versions: { value: string; n: number }[] };
  builds: AdminOverview['reports']['byBuild'];
  funnel: AdminFunnel;
  serverNow: number;
};

export type LedgerResponse = { ok: true; rows: AdminLedgerRow[]; total: number; nextCursor: string | null; serverNow: number };

export type EconomyResponse = { ok: true; economy: AdminEconomy; serverNow: number };
export type WorldResponse = { ok: true; world: AdminWorld; serverNow: number };
export type CampaignResponse = { ok: true; campaign: AdminCampaign; serverNow: number };
