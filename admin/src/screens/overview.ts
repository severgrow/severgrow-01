// Overview — the honest front page.
//
// Everything here is a count the database can actually produce. There is deliberately NO "active
// users", retention or engagement figure: `players` has no last-seen column a dashboard may trust
// (presence is live-duel state, not history), so the panel says so instead of inventing a number.
import type { AdminOverview } from '../../../server/src/admin/types.js';
import type { OverviewResponse, WhatsNew } from '../types.js';
import { formatAgo, formatDateTime, formatDay, formatNumber } from '../format.js';
import { bars, button, card, errorBox, honesty, kv, loading, screenTitle, stat, table, el, type Ctx } from '../ui.js';

const modeRow = (row: { queue: number; friend: number; live: number }): string =>
  `Find opponent ${formatNumber(row.queue)} · Invite ${formatNumber(row.friend)} · Live ${formatNumber(row.live)}`;

export const renderOverview = async (host: HTMLElement, ctx: Ctx): Promise<void> => {
  host.replaceChildren(screenTitle('Overview', 'Completed matches, reports, Seeds and the world — labelled exact, or unavailable.'));

  // "Since you last looked": server-side, so it is the same from any machine.
  const news = el('section', { class: 'card' });
  host.append(news);
  void renderWhatsNew(news, ctx);

  const panes = el('div', {});
  host.append(panes);
  panes.replaceChildren(loading('the overview'));

  const result = await ctx.api.get<OverviewResponse>('/v1/admin/overview');
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return ctx.denied();
    panes.replaceChildren(errorBox(result.message, () => void renderOverview(host, ctx)));
    return;
  }
  const data = result.data;
  panes.replaceChildren(...panels(data, ctx));

  panes.append(
    honesty('What this page cannot measure', [
      'Active users, retention and engagement: the database keeps no trustworthy per-player last-seen history, so no such figure is shown.',
      'Campaign and Training matches: they never create a row in `matches`, so they are absent from the match counts above and appear on the Campaign screen instead.',
      'A level nobody has ever played leaves no row at all — clearance is counted from what the server recorded, never from the authored level list.',
    ]),
  );
};

const renderWhatsNew = async (host: HTMLElement, ctx: Ctx): Promise<void> => {
  host.replaceChildren(loading('what is new'));
  const result = await ctx.api.get<WhatsNew & { ok: true }>('/v1/admin/whats-new');
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return ctx.denied();
    host.replaceChildren(errorBox(result.message));
    return;
  }
  const data = result.data;
  const items = [
    ['New reports', data.counters.reports],
    ['New crashes', data.counters.crashes],
    ['New claims', data.counters.claims],
    ['New matches', data.counters.matches],
  ] as const;
  const seenLabel = data.seenAt === null ? 'you have not marked a visit yet' : `since ${formatDateTime(data.seenAt)} (${formatAgo(data.seenAt, data.serverNow)})`;

  const markSeen = button('Mark as seen', () => {
    void (async () => {
      const written = await ctx.api.post<{ ok: true; seenAt: number }>('/v1/admin/seen', { at: data.serverNow });
      if (!written.ok) {
        host.append(errorBox(written.message));
        return;
      }
      void renderWhatsNew(host, ctx);
    })();
  }, { small: true, title: 'Record that you have seen everything up to now' });

  host.replaceChildren(
    el(
      'div',
      { class: 'card-head' },
      el('h2', { class: 'card-title', text: 'Since you last looked' }),
      el('p', { class: 'muted small', text: seenLabel }),
      markSeen,
    ),
    el('div', { class: 'grid' }, ...items.map(([label, value]) => stat(label, formatNumber(value)))),
    el('p', {
      class: 'muted small',
      text: 'Counted server-side from a stored cursor, so this is the same on every machine you open the dashboard from.',
    }),
  );
};

const panels = (data: AdminOverview, ctx: Ctx): Node[] => {
  const today = data.matches.finishedToday;
  const week = data.matches.finished7d;
  const dayRows = data.matches.finishedByDay;
  const buildRows = data.reports.byBuild.slice(0, 8);

  return [
    card('Completed matches', [
      el('div', { class: 'grid' }, 
        stat('Today', formatNumber(today.total), modeRow(today.byMode)),
        stat('Last 7 days', formatNumber(week.total), modeRow(week.byMode)),
        stat('Waiting now', formatNumber(data.matches.byStatus.waiting), 'Open invite or parked search'),
        stat('Active now', formatNumber(data.matches.byStatus.active), 'A turn is with a player'),
      ),
      el('h3', { class: 'card-title', text: 'By day (7 days)' }),
      el('div', { class: 'table-wrap' }, table(
        [
          { label: 'Day', render: (row: { day: string }) => formatDay(row.day) },
          { label: 'Find opponent', align: 'right', render: (row: { queue: number }) => formatNumber(row.queue) },
          { label: 'Invite', align: 'right', render: (row: { friend: number }) => formatNumber(row.friend) },
          { label: 'Live', align: 'right', render: (row: { live: number }) => formatNumber(row.live) },
          { label: 'Total', align: 'right', render: (row: { queue: number; friend: number; live: number }) => formatNumber(row.queue + row.friend + row.live) },
        ],
        dayRows,
        { caption: 'Exact: matches with status "finished" and a recorded finished_at. Duel modes only.' },
      )),
    ]),

    card('Reports and crashes', [
      el('div', { class: 'grid' },
        stat('Reports today', formatNumber(data.reports.today)),
        stat('Reports 7d', formatNumber(data.reports.reports7d)),
        stat('Crashes 7d', formatNumber(data.reports.crashes7d)),
      ),
      el('h3', { class: 'card-title', text: 'Worst builds (7 days)' }),
      el('p', { class: 'muted small', text: 'Grouped on the emitted asset plus the client version — the leading js hash and the version — so one deploy is one row rather than one row per hash. The rules label is shown beside it.' }),
      buildRows.length === 0
        ? el('p', { class: 'muted', text: 'No reports or crashes in the last 7 days.' })
        : el('div', { class: 'table-wrap' }, table<AdminOverview['reports']['byBuild'][number]>(
            [
              { label: 'Build', render: (row) => el('span', {}, el('code', { text: row.asset ?? '(no build)' }), el('br'), el('span', { class: 'muted small', text: row.version ?? 'version unknown' })) },
              { label: 'Rules label', render: (row) => el('span', { class: 'muted small', text: row.label ?? '—' }) },
              { label: 'Crashes', align: 'right', render: (row) => formatNumber(row.crashes) },
              { label: 'Reports', align: 'right', render: (row) => formatNumber(row.reports) },
              { label: 'Total', align: 'right', render: (row) => formatNumber(row.total) },
            ],
            buildRows,
            { caption: `Exact: feedback_reports grouped by the normalised build, newest 7 days. ${data.reports.byBuild.length > buildRows.length ? `Showing the 8 worst of ${data.reports.byBuild.length} builds.` : ''}` },
          )),
      el('p', {}, button('Open the report list', () => ctx.navigate('#/reports'), { small: true })),
    ]),

    card('Seeds awarded and spent', [
      el('div', { class: 'grid' },
        stat('Awarded 7d', formatNumber(data.seeds.earned7d), 'Ledger deltas > 0'),
        stat('Spent 7d', formatNumber(data.seeds.spent7d), 'Ledger deltas < 0 (world tiles)'),
      ),
      bars(
        data.seeds.byDay.flatMap((row) => [
          { label: `${formatDay(row.day)} +`, value: row.earned },
          { label: `${formatDay(row.day)} −`, value: row.spent, tone: 'spent' as const },
        ]),
      ),
      el('p', {}, button('Open the ledger and the world', () => ctx.navigate('#/seeds'), { small: true })),
    ]),

    card('The world', [
      el('div', { class: 'grid' },
        stat('Claims', formatNumber(data.world.totalClaims), `of ${formatNumber(data.world.cellsTotal)} tiles`),
        stat('Claims 7d', formatNumber(data.world.claims7d)),
        stat('Owners', formatNumber(data.world.owners)),
      ),
      el('p', {}, button('Open the world map and replay', () => ctx.navigate('#/seeds?view=world'), { small: true })),
    ]),

    card('Health', [
      kv([
        ['Database', data.health.dbOk ? el('span', { class: 'good', text: 'reachable' }) : el('span', { class: 'bad', text: 'unreachable' })],
        ['Round trip', data.health.dbMs === null ? 'not measured on this data source' : `${formatNumber(data.health.dbMs)} ms`],
        ['Rules version', data.rulesVersion],
        ['Server time', formatDateTime(data.serverNow)],
      ]),
      el('p', { class: 'muted small', text: 'Health is read where it already exists: the same storage ping the game\'s own /v1/health?db=1 uses. It is not a monitoring system.' }),
    ]),
  ];
};

