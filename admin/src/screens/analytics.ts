// Players & retention — first-party figures from rows the server already stores.
//
// DAU/WAU here mean "distinct players with proven server activity", not browser sessions. Incomplete
// D1/D7 windows show as unavailable (—), never as a partial rate that would look like retention.
import type { AdminAnalytics } from '../types.js';
import { formatDay, formatNumber, formatShare } from '../format.js';
import { bars, card, el, errorBox, honesty, loading, noticeBox, screenTitle, stat, table, type Ctx } from '../ui.js';

type AnalyticsResponse = AdminAnalytics & { ok: true; unavailable?: string };

const pct = (rate: number | null | undefined): string =>
  rate === null || rate === undefined || !Number.isFinite(rate) ? '—' : `${Math.round(rate * 100)}%`;

export const renderAnalytics = async (host: HTMLElement, ctx: Ctx): Promise<void> => {
  host.replaceChildren(
    screenTitle('Players and retention', 'Who came back — from finished duels, territory claims and account creates. Test accounts are excluded.'),
    el('div', {}),
  );
  const body = host.lastElementChild as HTMLElement;
  body.replaceChildren(loading('players and retention'));

  const result = await ctx.api.get<AnalyticsResponse>('/v1/admin/analytics');
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return ctx.denied();
    if (result.status === 404) {
      body.replaceChildren(
        noticeBox(
          'This screen needs the newer server',
          'The duel API at this address has no analytics endpoint yet. Deploy the updated `duel` Edge Function, then open this page again.',
        ),
      );
      return;
    }
    body.replaceChildren(errorBox(result.message, () => void renderAnalytics(host, ctx)));
    return;
  }

  const data = result.data;
  if (typeof data.unavailable === 'string' && data.unavailable.length > 0) {
    body.replaceChildren(
      noticeBox('Analytics unavailable', data.unavailable),
      honesty('What this page measures', [
        data.activityDefinition,
        'When the query cannot answer, this screen says so rather than showing quiet zeroes that would look like nobody played.',
      ]),
    );
    return;
  }

  body.replaceChildren(...panels(data), honesty('What this page measures', [
    data.activityDefinition,
    'D1 and D7 only appear once the observation window is complete. A cohort younger than seven days never shows a D7.',
    'Campaign and Training games that never create a server row are invisible here. Tap-level events, emails, precise location and message contents are never collected.',
  ]));
};

const panels = (data: AdminAnalytics): Node[] => {
  const funnel = data.funnel;
  return [
    card('Active and new', [
      el('div', { class: 'grid' },
        stat('DAU', formatNumber(data.dau), 'Active today (UTC)'),
        stat('WAU', formatNumber(data.wau), 'Active in the last 7 UTC days'),
        stat('New today', formatNumber(data.newPlayersToday)),
        stat('New 7d', formatNumber(data.newPlayers7d)),
      ),
      el('h3', { class: 'card-title', text: 'Active players by day' }),
      bars(data.activeByDay.map((row) => ({ label: formatDay(row.day), value: row.n }))),
      el('h3', { class: 'card-title', text: 'New players by day' }),
      bars(data.newByDay.map((row) => ({ label: formatDay(row.day), value: row.n }))),
    ]),

    card('Retention (complete windows only)', [
      el('p', {
        class: 'muted small',
        text: 'Each row is a create-day cohort. D1 / D7 is the share with proven activity on day +1 / +7. Incomplete windows show —.',
      }),
      el('div', { class: 'table-wrap' }, table(
        [
          { label: 'Cohort day', render: (row: AdminAnalytics['retention'][number]) => formatDay(row.day) },
          { label: 'Size', align: 'right' as const, render: (row: AdminAnalytics['retention'][number]) => formatNumber(row.cohortSize) },
          { label: 'D1', align: 'right' as const, render: (row: AdminAnalytics['retention'][number]) => pct(row.d1) },
          { label: 'D7', align: 'right' as const, render: (row: AdminAnalytics['retention'][number]) => pct(row.d7) },
        ],
        data.retention,
        { caption: 'Newest cohorts are at the bottom. A blank D7 means the cohort is not yet seven days old.' },
      )),
    ]),

    card(`New-player funnel (last ${funnel.lookbackDays} days)`, [
      el('div', { class: 'grid' },
        stat('New players', formatNumber(funnel.newPlayers)),
        stat('First finished match', formatNumber(funnel.firstMatchCompleted), pct(funnel.firstMatchRate)),
        stat('First claim', formatNumber(funnel.firstClaim), pct(funnel.firstClaimRate)),
        stat('Invite sent', formatNumber(funnel.inviteSent)),
        stat('Invite joined', formatNumber(funnel.inviteJoined), pct(funnel.inviteToPlayRate) === '—' ? 'of invites sent' : `${pct(funnel.inviteToPlayRate)} of invites sent`),
        stat('Repeat matches', formatNumber(funnel.repeatMatches), pct(funnel.repeatMatchRate)),
        stat('Rematch played', formatNumber(funnel.rematchPlayed)),
      ),
      el('p', {
        class: 'muted small',
        text: [
          formatShare(funnel.firstMatchCompleted, funnel.newPlayers) ? `${formatShare(funnel.firstMatchCompleted, funnel.newPlayers)} finished a first match.` : 'No new players in this window yet.',
          formatShare(funnel.inviteJoined, funnel.inviteSent) ? ` ${formatShare(funnel.inviteJoined, funnel.inviteSent)} of invites brought a second player.` : '',
        ].join(''),
      }),
    ]),
  ];
};
