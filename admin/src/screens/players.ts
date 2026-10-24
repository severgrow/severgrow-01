// Players — every account and guest the server knows: who they are, how far they got, and the last
// thing the server recorded about them ("where they left").
//
// Only recorded rows are used (server/src/admin/players.ts). What happens offline — lessons 1-10,
// campaign levels that pay no Seeds, single-player games — never reaches the server, so it is not
// here; the honesty panel at the bottom says so.
import type { AdminPlayers, AdminPlayersRow } from '../../../server/src/admin/players.js';
import { formatAgo, formatDateTime, formatNumber, formatShare, queryString } from '../format.js';
import { filterPlayers, playersCounts, readPlayersFilter, type PlayersFilter } from '../players-view.js';
import { bars, card, controls, el, emptyBox, errorBox, honesty, loading, noticeBox, screenTitle, stat, table, type Ctx } from '../ui.js';

type PlayersResponse = AdminPlayers & { ok: true; serverNow: number };

const SHOWN = 200;

export const renderPlayers = async (host: HTMLElement, ctx: Ctx, params: URLSearchParams): Promise<void> => {
  host.replaceChildren(
    screenTitle('Players', 'Every account and guest the server knows — how far they got, and the last thing recorded about them.'),
    loading('the players'),
  );
  const result = await ctx.api.get<PlayersResponse>('/v1/admin/players');
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return ctx.denied();
    host.lastElementChild?.remove();
    if (result.status === 404) {
      host.append(
        noticeBox(
          'This screen needs the newer server',
          'The duel API at this address has no players list yet. It appears once the updated server (the `duel` Edge Function) is deployed — nothing else changes.',
        ),
      );
      return;
    }
    host.append(errorBox(result.message, () => void renderPlayers(host, ctx, params)));
    return;
  }
  const data = result.data;
  const filter = readPlayersFilter(params);
  host.lastElementChild?.remove();
  host.append(...summary(data), list(data, filter, ctx));
  host.append(
    honesty('What this page cannot see', [
      'Anything a player does offline: lessons 1-10, campaign levels that pay no Seeds, and practice games never reach the server. A player who never opened online play is not listed at all.',
      '"Last seen" is the newest recorded row of any kind (an online match, a verified campaign clear, a world tile, a report, a live presence ping) — not a visit log.',
      'The highest level is the highest campaign level the server verified a win on (level 11 and up).',
      'Automated test accounts are hidden from this list by default. They are not the game\'s campaign bots (those never create a player row); they are accounts a test harness created. The Bots tab lists them with the reason each was classified, and "Everyone" shows both sides.',
    ]),
  );
};

const summary = (data: PlayersResponse): HTMLElement[] => {
  const s = data.summary;
  const now = data.serverNow;
  const share = (n: number) => formatShare(n, s.players) ?? '—';
  return [
    el(
      'section',
      { class: 'grid stats-row' },
      // "Players" is real people. The bots are the separate number beside it, so the total is never
      // a silent mix of the two.
      stat('Players', formatNumber(s.players), `${formatNumber(s.accounts)} accounts · ${formatNumber(s.guests)} guests`),
      stat('Test accounts', formatNumber(s.bots), s.bots === 0 ? 'none marked' : `hidden from this list · ${formatNumber(s.botsActive24h)} active in 24 h`),
      stat('Signed in with Google', formatNumber(s.google), share(s.google)),
      stat('Seen in 24 h', formatNumber(s.seen24h), `${formatNumber(s.seen7d)} in 7 days · ${formatNumber(s.seen30d)} in 30`),
      stat('Joined in 7 days', formatNumber(s.joined7d), `as of ${formatDateTime(now)}`),
    ),
    el(
      'div',
      { class: 'split' },
      card('The journey', [
        bars(s.funnel.map((step) => ({ label: step.label, value: step.n, hint: share(step.n) }))),
        el('p', { class: 'muted small', text: 'Each line counts players with at least one recorded row of that kind.' }),
      ]),
      card('Where they left off', [
        s.leftAt.length === 0
          ? emptyBox('No players yet.')
          : bars(s.leftAt.map((row) => ({ label: row.label, value: row.n, hint: share(row.n) }))),
        el('p', { class: 'muted small', text: 'Each player counted once, by the newest thing the server recorded about them.' }),
      ]),
    ),
    card('Highest campaign level reached', [
      s.highestLevel.length === 0
        ? emptyBox('No verified campaign clears yet (levels 1-10 are not recorded by the server).')
        : bars(s.highestLevel.map((row) => ({ label: `Level ${row.level}`, value: row.n }))),
    ]),
  ];
};

const list = (data: PlayersResponse, filter: PlayersFilter, ctx: Ctx): HTMLElement => {
  const now = data.serverNow;
  const rows = filterPlayers(data.rows, filter, now);
  const counts = playersCounts(data.rows, filter, now);
  const apply = (name: string, value: string) => ctx.navigate(`#/players${queryString({ ...filter, [name]: value })}`);
  const bar = controls(
    [
      { kind: 'text', name: 'q', label: 'Find', value: filter.q, placeholder: 'name, #TAG or id', wide: true },
      {
        kind: 'select',
        name: 'traffic',
        label: 'Traffic',
        value: filter.traffic,
        options: [
          { value: 'humans', label: 'Real players (bots hidden)' },
          { value: 'all', label: 'Everyone' },
          { value: 'bots', label: 'Automated only' },
        ],
      },
      {
        kind: 'select',
        name: 'kind',
        label: 'Who',
        value: filter.kind,
        options: [
          { value: 'all', label: 'Everyone' },
          { value: 'account', label: 'Accounts' },
          { value: 'google', label: 'Google sign-in' },
          { value: 'guest', label: 'Guests' },
        ],
      },
      {
        kind: 'select',
        name: 'quiet',
        label: 'Gone quiet',
        value: filter.quiet,
        options: [
          { value: 'all', label: 'Any' },
          { value: '7', label: '7+ days' },
          { value: '30', label: '30+ days' },
        ],
      },
      {
        kind: 'select',
        name: 'sort',
        label: 'Sort by',
        value: filter.sort,
        options: [
          { value: 'seen', label: 'Last seen' },
          { value: 'joined', label: 'Newest' },
          { value: 'level', label: 'Highest level' },
          { value: 'matches', label: 'Most matches' },
        ],
      },
    ],
    apply,
  );
  const shown = rows.slice(0, SHOWN);
  const capped = data.total > data.rows.length ? ` The server sent the ${formatNumber(data.rows.length)} most recently active of ${formatNumber(data.total)} recorded accounts.` : '';
  // The arithmetic, stated in full: the human number, plus what was hidden and why, so nobody has to
  // wonder whether a total quietly changed. It adds up even when the search excludes the bots.
  const hidden =
    counts.hiddenBots > 0
      ? el(
          'p',
          { class: 'muted small' },
          `${formatNumber(counts.humans)} real ${counts.humans === 1 ? 'player' : 'players'} · ${formatNumber(counts.hiddenBots)} ${counts.hiddenBots === 1 ? 'bot' : 'bots'} hidden. `,
          el('a', { href: '#/bots', text: 'See the Bots tab' }),
          ' to check the classification or bring one back.',
        )
      : filter.traffic === 'humans'
        ? el('p', { class: 'muted small', text: `${formatNumber(counts.humans)} real ${counts.humans === 1 ? 'player' : 'players'} · no test accounts marked.` })
        : null;
  return card(
    filter.traffic === 'bots' ? 'Automated test accounts' : 'All players',
    [
      bar,
      hidden,
      shown.length === 0
        ? emptyBox('No player matches these filters.')
        : table<AdminPlayersRow>(
            [
              {
                label: 'Player',
                render: (row) =>
                  el(
                    'span',
                    { class: 'who-cell' },
                    el('strong', { text: row.displayName ?? '(no name)' }),
                    el('span', { class: 'muted small', text: ` #${row.tag}` }),
                    el('br'),
                    el('span', { class: `tag${row.kind === 'account' ? ' resolved' : ''}`, text: row.google ? 'Google' : row.kind }),
                    // Only shown when the split is visible ("Everyone"/"Automated only"), never on
                    // the default human list where every row is a real player.
                    filter.traffic !== 'humans' && row.classification === 'bot'
                      ? el('span', { class: 'tag', text: ' test account' })
                      : null,
                  ),
              },
              { label: 'Joined', render: (row) => el('span', { class: 'small nowrap', title: formatDateTime(row.createdAt), text: formatAgo(row.createdAt, now) }) },
              { label: 'Last seen', render: (row) => el('span', { class: 'small nowrap', title: formatDateTime(row.lastSeenAt), text: formatAgo(row.lastSeenAt, now) }) },
              { label: 'Where they left', render: (row) => el('span', { class: 'small', text: row.lastActivityText }) },
              { label: 'Level', align: 'right', title: 'Highest verified campaign level', render: (row) => (row.campaignHighest === null ? el('span', { class: 'muted', text: '—' }) : formatNumber(row.campaignHighest)) },
              { label: 'Online', align: 'right', title: 'Online matches played · won', render: (row) => `${formatNumber(row.matches.played)} · ${formatNumber(row.matches.wins)}` },
              { label: 'Seeds', align: 'right', render: (row) => formatNumber(row.seeds) },
            ],
            shown,
            {
              caption: `${formatNumber(shown.length)} shown of ${formatNumber(counts.shown)} matching this view${rows.length > SHOWN ? ` (first ${SHOWN}; narrow the filters to see the rest)` : ''}.${capped} Open a row for the full record.`,
              onRowClick: (row) => ctx.navigate(`#/player?q=${encodeURIComponent(row.id)}`),
            },
          ),
    ],
    { sub: 'Sorted and filtered here, in this page; nothing is sent anywhere but the admin API.' },
  );
};
