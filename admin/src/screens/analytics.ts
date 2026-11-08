// Analytics — owner-facing numbers from rows the server already records.
//
// No new endpoints: `/v1/admin/players` (humans, funnel, seen windows) and `/v1/admin/campaign`
// (verified clears). Test accounts are excluded because the server summary already counts humans only.
import type { AdminCampaign } from '../../../server/src/admin/types.js';
import type { AdminPlayers } from '../../../server/src/admin/players.js';
import {
  cohortRetention,
  funnelConversions,
  joinsByUtcDay,
  repeatOnlinePlayers,
} from '../analytics-metrics.js';
import { formatDay, formatNumber, formatShare, percentOf, seriesMax } from '../format.js';
import { bars, button, card, el, emptyBox, errorBox, honesty, loading, noticeBox, screenTitle, stat, table, type Ctx } from '../ui.js';

type PlayersResponse = AdminPlayers & { ok: true; serverNow: number };
type CampaignResponse = { ok: true; campaign: AdminCampaign; serverNow: number };

export const renderAnalytics = async (host: HTMLElement, ctx: Ctx): Promise<void> => {
  host.replaceChildren(screenTitle('Analytics', 'How real players are finding the game — from recorded rows only, test accounts excluded.'), el('div', {}));
  const body = host.lastElementChild as HTMLElement;
  body.replaceChildren(loading('player analytics'));

  const players = await ctx.api.get<PlayersResponse>('/v1/admin/players');
  if (!players.ok) {
    if (players.status === 401 || players.status === 403) return ctx.denied();
    if (players.status === 404) {
      body.replaceChildren(
        noticeBox(
          'This screen needs the newer server',
          'The duel API at this address has no players list yet. Deploy the updated `duel` Edge Function, then open this page again.',
        ),
      );
      return;
    }
    body.replaceChildren(errorBox(players.message, () => void renderAnalytics(host, ctx)));
    return;
  }

  const campaign = await ctx.api.get<CampaignResponse>('/v1/admin/campaign');
  if (!campaign.ok) {
    if (campaign.status === 401 || campaign.status === 403) return ctx.denied();
    body.replaceChildren(errorBox(campaign.message, () => void renderAnalytics(host, ctx)));
    return;
  }

  const data = players.data;
  const humans = data.rows.filter((row) => row.classification === 'human');
  const summary = data.summary;
  const now = data.serverNow;
  const retention = cohortRetention(humans, now);
  const joins = joinsByUtcDay(humans, now, 14);
  const joinMax = seriesMax(joins.map((row) => row.n));
  const funnel = funnelConversions(summary.funnel);
  const repeat = repeatOnlinePlayers(humans);
  const finishedOnline = summary.funnel.find((row) => row.label === 'Finished an online match')?.n ?? 0;
  const playedOnline = summary.funnel.find((row) => row.label === 'Played an online match')?.n ?? 0;
  const withTiles = summary.funnel.find((row) => row.label === 'Claimed a world tile')?.n ?? 0;

  body.replaceChildren(
    card('Active players', [
      el('div', { class: 'grid' },
        stat('Seen in 24 h', formatNumber(summary.seen24h), 'A recorded row newer than 24 h — not a visit log'),
        stat('Seen in 7 days', formatNumber(summary.seen7d)),
        stat('Seen in 30 days', formatNumber(summary.seen30d)),
        stat('New in 7 days', formatNumber(summary.joined7d), `As of ${formatDay(utcDay(now))}`),
      ),
      el('p', { class: 'muted small', text: `${formatNumber(summary.players)} real players in total · ${formatNumber(summary.bots)} test accounts counted separately on the Bots tab.` }),
      el('p', {}, button('Open the player list', () => ctx.navigate('#/players'), { small: true })),
    ]),

    card('New players per day (14 days, UTC)', [
      joins.every((row) => row.n === 0)
        ? emptyBox('Nobody new in this window.')
        : el('div', { class: 'bars' }, ...joins.map((row) =>
            el(
              'div',
              { class: 'bar-row' },
              el('span', { class: 'muted small', text: formatDay(row.day) }),
              el('span', { class: 'bar-track', role: 'img', 'aria-label': `${row.day}: ${row.n} joins` }, el('span', { class: 'bar-fill', style: `width:${percentOf(row.n, joinMax)}%` })),
              el('span', { class: 'num small', text: formatNumber(row.n) }),
            ),
          )),
    ]),

    card('Return after joining', [
      el('div', { class: 'grid' },
        ...retention.map((row) =>
          stat(
            row.label,
            row.rate === null ? '—' : `${formatNumber(row.returned)} of ${formatNumber(row.eligible)} (${row.rate}%)`,
            row.note,
          ),
        ),
      ),
      el('p', { class: 'muted small', text: 'Each player has one "last seen" timestamp (the newest match, clear, tile, report or presence ping). These rates are not classic DAU/D1 dashboards; they say whether anyone came back far enough after joining for the server to record it.' }),
    ]),

    card('Player journey', [
      el('div', { class: 'table-wrap' }, table<FunnelStep>(
        [
          { label: 'Step', render: (row) => row.label },
          { label: 'Players', align: 'right', render: (row) => formatNumber(row.n) },
          { label: 'Of previous', align: 'right', render: (row) => row.fromPrevious ?? '—' },
          { label: 'Of all', align: 'right', render: (row) => formatShare(row.n, summary.players) ?? '—' },
        ],
        funnel,
        { caption: 'Humans only. Each step is a subset of the one above only where the data makes that true.' },
      )),
      el('p', {}, button('See where they left off', () => ctx.navigate('#/players'), { small: true })),
    ]),

    card('Online play and the world', [
      el('div', { class: 'grid' },
        stat('Finished a match', formatNumber(finishedOnline), playedOnline > 0 ? `${formatShare(finishedOnline, playedOnline) ?? '—'} of those who started one` : 'Nobody has started a match yet'),
        stat('Repeat finishers', formatNumber(repeat), finishedOnline > 0 ? `${formatShare(repeat, finishedOnline) ?? '—'} of finishers played again` : '—'),
        stat('Claimed a tile', formatNumber(withTiles), formatShare(withTiles, summary.players) ?? '—'),
        stat('Campaign clears (server)', formatNumber(campaign.data.campaign.firstClears), 'Levels 11+ with a paid first clear'),
      ),
      el('p', {}, button('Open online matches', () => ctx.navigate('#/matches'), { small: true }), ' · ', button('Open campaign clears', () => ctx.navigate('#/campaign'), { small: true })),
    ]),

    card('Where players were last seen', [
      summary.leftAt.length === 0
        ? emptyBox('No players yet.')
        : bars(
            summary.leftAt.map((row) => {
              const hint = formatShare(row.n, summary.players);
              return hint === null ? { label: row.label, value: row.n } : { label: row.label, value: row.n, hint };
            }),
          ),
      el('p', { class: 'muted small', text: 'Each player counted once, by the kind of their newest recorded row.' }),
    ]),

    honesty('What this page cannot measure', [
      'Daily active users from a visit log: the database keeps no per-day history, only the newest recorded activity per player.',
      'Classic D1/D7 cohort retention by calendar day: the figures above use last-seen minus joined, with honest windows.',
      'Campaign levels 1–10, offline practice, or tutorial progress: they often never create a server row.',
      'Invite-to-play or rematch conversion: those flows are not aggregated in the players summary yet — use the match explorer for individual rows.',
      'Anything a marked test account did: every human-facing count on this page excludes them.',
    ]),
  );
};

type FunnelStep = { label: string; n: number; fromPrevious: string | null };

const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
