// Health and ops — the operational "what needs me" panel, plus the two series that catch a bad
// deploy: rules-version drift and the guest → account funnel.
//
// Every window shown is the window the SERVER actually enforces (read from its own config), not a
// guess typed into a label.
import type { AdminBuildRow, AdminFunnel, AdminStuck } from '../../../server/src/admin/types.js';
import type { OpsResponse } from '../types.js';
import { formatAgo, formatDateTime, formatDuration, formatNumber, formatShare, percentOf, seriesMax } from '../format.js';
import { bars, button, card, el, emptyBox, errorBox, honesty, loading, screenTitle, stat, table, type Ctx } from '../ui.js';

export const renderOps = async (host: HTMLElement, ctx: Ctx): Promise<void> => {
  host.replaceChildren(screenTitle('Health and ops', 'The states that need a person: expired matches, cleanup-eligible guests, stale clients, and the sign-in funnel.'), el('div', {}));
  const body = host.lastElementChild as HTMLElement;
  body.replaceChildren(loading('the operational view'));

  const result = await ctx.api.get<OpsResponse>('/v1/admin/ops');
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return ctx.denied();
    body.replaceChildren(errorBox(result.message, () => void renderOps(host, ctx)));
    return;
  }
  const data = result.data;
  body.replaceChildren(
    stuckPanel(data.stuck, ctx),
    driftPanel(data.rulesDrift, ctx),
    funnelPanel(data.funnel),
    buildPanel(data.builds),
    honesty('What this panel is', [
      'It reads the states the database holds right now. It is not a monitoring system and it cannot alert you: nothing here runs unless you open this page.',
      'Every window is the value the server enforces (`waitingExpireMs`, `turnTimeoutMs` and the sweeper\'s 30-day guest rule), read from its own config — so a label cannot drift from the rule.',
      'Guest → account is only measurable for accounts linked after migration 0010 added `player_identities`: earlier accounts have no `upgraded_at`, and the panel says when that is the case.',
    ]),
  );
};

const stuckPanel = (stuck: AdminStuck, ctx: Ctx): Node => {
  const now = Date.now();
  const due = (ms: number | null): string =>
    ms === null ? '—' : `${formatDateTime(ms)} · ${formatAgo(ms, now)}`;

  const rows = [...stuck.expiredActive.rows, ...stuck.expiredWaiting.rows];
  return card('What needs me', [
    el('div', { class: 'grid' },
      stat('Active, past deadline', formatNumber(stuck.expiredActive.count), 'The next sweep finishes these by timeout'),
      stat('Waiting, past expiry', formatNumber(stuck.expiredWaiting.count), 'Invite or parked search nobody joined'),
      stat('Guests eligible for cleanup', formatNumber(stuck.cleanupEligibleGuests.count), 'Guest, no match, no Seeds — the sweeper deletes these'),
      stat('Windows in force', `${formatDuration(stuck.windows.turnTimeoutMs)} / ${formatDuration(stuck.windows.waitingExpireMs)}`, `turn / waiting · guests cleaned after ${formatDuration(stuck.windows.guestMaxAgeMs)}`),
    ),
    rows.length === 0
      ? el('p', { class: 'muted', text: 'Nothing is stuck: no match is past its deadline, and no waiting match has expired.' })
      : el('div', { class: 'table-wrap' }, table<AdminStuck['expiredActive']['rows'][number]>(
          [
            { label: 'Match', render: (row) => el('code', { class: 'small', text: row.id.slice(0, 8) + '…' }) },
            { label: 'Status', render: (row) => row.status },
            { label: 'Mode', render: (row) => row.mode },
            { label: 'Was due', render: (row) => due(row.dueAt) },
            { label: 'Seats', align: 'right', render: (row) => formatNumber(row.seats) },
            { label: 'Open', render: (row) => el('span', {}, button('Timeline', () => ctx.navigate(`#/match/${row.id}`), { small: true })) },
          ],
          rows,
          { caption: 'The 20 most overdue. A healthy server sweeps these away; a growing list means the sweeper is not running.' },
        )),
    stuck.cleanupEligibleGuests.count > 0
      ? el('p', { class: 'muted small', text: `Oldest eligible guest: ${stuck.cleanupEligibleGuests.oldest === null ? '—' : formatDateTime(stuck.cleanupEligibleGuests.oldest)}. The sweeper skips any guest with a match, Seeds, a ticket or a tile — this is exactly that set.` })
      : null,
  ]);
};

const driftPanel = (drift: OpsResponse['rulesDrift'], ctx: Ctx): Node => {
  const stale = drift.versions.filter((row) => row.value !== drift.current);
  const total = drift.versions.reduce((sum, row) => sum + row.n, 0);
  return card('Rules-version drift', [
    el('div', { class: 'grid' },
      stat('Current rules', drift.current, 'What a new match is created under'),
      stat('Matches on another version', formatNumber(stale.reduce((sum, row) => sum + row.n, 0)), stale.length === 0 ? 'None — clean' : `${stale.length} other version(s)`),
      stat('Matches counted', formatNumber(total)),
    ),
    stale.length === 0
      ? el('p', { class: 'muted', text: 'Every recorded match was created under the current rules version.' })
      : el('div', { class: 'table-wrap' }, table<{ value: string; n: number }>(
          [
            { label: 'Rules version', render: (row) => el('code', { class: 'small', text: row.value }) },
            { label: 'Matches', align: 'right', render: (row) => formatNumber(row.n) },
            { label: 'Share', align: 'right', render: (row) => formatShare(row.n, total) ?? '—' },
          ],
          stale,
          { caption: 'Counts only, newest deploy first. A row here is a stale client or a deploy that did not ship the current rules.' },
        )),
    el('p', {}, button('Open the match explorer', () => ctx.navigate('#/matches'), { small: true })),
  ]);
};

const funnelPanel = (funnel: AdminFunnel): Node => {
  const days = funnel.playersCreatedByDay;
  const max = seriesMax(days.map((row) => row.guests + row.accounts));
  return card('Guest → account', [
    el('div', { class: 'grid' },
      stat('Players', formatNumber(funnel.totals.players)),
      stat('Guests', formatNumber(funnel.totals.guests), 'Never signed in'),
      stat('Accounts', formatNumber(funnel.totals.accounts), `${formatShare(funnel.totals.accounts, funnel.totals.players) ?? '—'} of players`),
      stat('Accounts with upgraded_at', formatNumber(funnel.totals.withUpgradedAt), `of ${formatNumber(funnel.totals.accounts)}`),
    ),
    el('h3', { class: 'card-title', text: 'Created per day (30 days)' }),
    el('div', { class: 'bars' }, ...days.map((row) =>
      el(
        'div',
        { class: 'bar-row' },
        el('span', { class: 'muted small', text: row.day.slice(5) }),
        el('span', { class: 'bar-track', role: 'img', 'aria-label': `${row.day}: ${row.guests} guests, ${row.accounts} accounts` }, el('span', { class: 'bar-fill', style: `width:${percentOf(row.guests + row.accounts, max)}%` })),
        el('span', { class: 'num small', text: `${formatNumber(row.guests)}g · ${formatNumber(row.accounts)}a` }),
      ),
    )),
    el('h3', { class: 'card-title', text: 'Google accounts linked per day (30 days)' }),
    bars(funnel.accountsLinkedByDay.map((row) => ({ label: row.day.slice(5), value: row.n }))),
    funnel.upgradedAtMayBeUnpopulated
      ? el('div', { class: 'banner' }, el('p', { class: 'banner-title', text: 'Honest caveat' }), el('p', { text: 'At least one account row predates `upgraded_at`, so that column cannot produce a per-day upgrade series. The linking series above comes from `player_identities.created_at`, which is recorded for every link.' }))
      : null,
  ]);
};

const buildPanel = (builds: readonly AdminBuildRow[]): Node =>
  card('Shipped builds', [
    builds.length === 0
      ? emptyBox('No reports or crashes in the last 7 days, so no build can be ranked.')
      : el('div', { class: 'table-wrap' }, table<AdminBuildRow>(
          [
            { label: 'Asset', render: (row) => el('code', { class: 'small', text: row.asset ?? '(no build)' }) },
            { label: 'Version', render: (row) => row.version ?? '—' },
            { label: 'Label', render: (row) => el('span', { class: 'muted small', text: row.label ?? '—' }) },
            { label: 'Crashes', align: 'right', render: (row) => formatNumber(row.crashes) },
            { label: 'Reports', align: 'right', render: (row) => formatNumber(row.reports) },
          ],
          builds,
          { caption: 'The worst shipped build first. Grouping splits the compound build string on its separators and keeps the leading asset plus the version — see the Overview note.' },
        )),
  ]);

