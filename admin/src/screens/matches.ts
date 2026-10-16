// Match explorer — recent matches with filters, and one match's textual timeline.
//
// The timeline is a clean text list on purpose: the game's own replay presentation is not reused
// here, and the raw event payloads are never fetched (they are the unfiltered server-side record,
// which can contain the opponent's hidden draw). What the API reports per move is the ACTION name,
// the seat, the time, and how many events the move produced.
import type { AdminMatchDetail, AdminMatchRow } from '../../../server/src/admin/types.js';
import type { Page } from '../api.js';
import { formatAgo, formatDateTime, formatNumber, modeLabel, shortId } from '../format.js';
import { button, card, controls, el, emptyBox, errorBox, honesty, loading, pager, screenTitle, table, type Ctx } from '../ui.js';

const ACTIONS: Record<number, string> = { 0: 'seat 0', 1: 'seat 1' };

export const renderMatches = async (host: HTMLElement, ctx: Ctx, params: URLSearchParams): Promise<void> => {
  const filters = {
    mode: params.get('mode') ?? '',
    status: params.get('status') ?? '',
    playerId: params.get('playerId') ?? '',
    limit: params.get('limit') ?? '25',
  };
  const rows: AdminMatchRow[] = [];
  let total = 0;
  let cursor: string | null = null;

  const apply = (name: string, value: string): void => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('cursor');
    ctx.navigate(`#/matches?${next.toString()}`);
  };

  const listHost = el('div', {});
  const bar = controls(
    [
      { kind: 'select', name: 'mode', label: 'Mode', value: filters.mode, options: [
        { value: '', label: 'Every mode' },
        { value: 'queue', label: 'Find opponent' },
        { value: 'friend', label: 'Invite a friend' },
        { value: 'live', label: 'Live duel' },
      ] },
      { kind: 'select', name: 'status', label: 'Status', value: filters.status, options: [
        { value: '', label: 'Any status' },
        { value: 'waiting', label: 'waiting' },
        { value: 'active', label: 'active' },
        { value: 'finished', label: 'finished' },
      ] },
      { kind: 'text', name: 'playerId', label: 'Player id', value: filters.playerId, placeholder: 'a player id', wide: false },
      { kind: 'number', name: 'limit', label: 'Per page', value: filters.limit, min: 1, max: ctx.session.limits.maxPage },
    ],
    apply,
  );

  host.replaceChildren(
    screenTitle('Matches', 'Duel matches, newest first. Campaign and Training appear on the Campaign screen — they never create a match row.'),
    card(null, [bar, listHost]),
  );

  const render = (): Node => {
    if (rows.length === 0) return emptyBox('No matches match these filters.');
    return el(
      'div',
      {},
      table<AdminMatchRow>(
        [
          { label: 'Created', render: (row) => el('span', {}, el('span', { text: formatDateTime(row.createdAt) }), el('br'), el('span', { class: 'muted small', text: formatAgo(row.createdAt, Date.now()) })) },
          { label: 'Mode', render: (row) => modeLabel(row.mode) },
          { label: 'Status', render: (row) => row.status },
          {
            label: 'Players',
            render: (row) =>
              row.players.length === 0
                ? el('span', { class: 'muted', text: 'none seated' })
                : el(
                    'span',
                    {},
                    ...row.players.flatMap((seat) => [
                      el('span', { class: 'nowrap', text: `${seat.name ?? '(no name)'} · ${ACTIONS[seat.seat] ?? `seat ${seat.seat}`}` }),
                      el('br'),
                    ]),
                  ),
          },
          { label: 'Moves', align: 'right', render: (row) => formatNumber(row.moveCount) },
          { label: 'Ended', render: (row) => (row.finishedAt === null ? '—' : `${row.finishReason ?? 'finished'}${row.winnerSeat === null ? '' : ` · seat ${row.winnerSeat}`}`) },
          { label: 'Open', render: () => el('span', { class: 'muted small', text: 'timeline' }) },
        ],
        rows,
        { onRowClick: (row) => ctx.navigate(`#/match/${row.id}`) },
      ),
      pager({ total, shown: rows.length, hasMore: cursor !== null, onMore: () => void fetchPage(cursor), onReset: () => { rows.length = 0; void fetchPage(null); } }, 'matches'),
      honesty('About match counts', [
        'Exact: rows in `matches`. Mode is derived from what the row records: a live-duel match carries live columns, a parked or Find-opponent match set open_queue, everything else came from an invite code.',
        'A Campaign or Training game is not here: it never creates a match row. Its verified result is on the Campaign screen.',
        'Hidden state (hands, deck order, the seed) is never returned by this endpoint.',
      ]),
    );
  };

  const fetchPage = async (nextCursor: string | null): Promise<void> => {
    if (nextCursor === null) listHost.replaceChildren(loading('matches'));
    const result = await ctx.api.get<Page<AdminMatchRow> & { ok: true }>('/v1/admin/matches', {
      mode: filters.mode,
      status: filters.status,
      playerId: filters.playerId,
      limit: filters.limit,
      cursor: nextCursor ?? undefined,
    });
    if (!result.ok) {
      if (result.status === 401 || result.status === 403) return ctx.denied();
      listHost.replaceChildren(errorBox(result.message, () => void fetchPage(null)));
      return;
    }
    total = result.data.total;
    cursor = result.data.nextCursor;
    rows.push(...result.data.rows);
    listHost.replaceChildren(render());
  };

  await fetchPage(null);
};

export const renderMatchDetail = async (host: HTMLElement, ctx: Ctx, matchId: string): Promise<void> => {
  host.replaceChildren(
    screenTitle(`Match ${shortId(matchId)}`, 'Result, participants, timestamps and the recorded move timeline.'),
    el('p', {}, button('Back to matches', () => ctx.navigate('#/matches'), { small: true })),
  );
  const body = el('div', {});
  host.append(body);
  body.replaceChildren(loading('the match'));

  const result = await ctx.api.get<AdminMatchDetail & { ok: true }>(`/v1/admin/matches/${encodeURIComponent(matchId)}`);
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return ctx.denied();
    body.replaceChildren(errorBox(result.message, () => void renderMatchDetail(host, ctx, matchId)));
    return;
  }
  const detail = result.data;
  const match = detail.match;

  body.replaceChildren(
    card('Result', [
      el('div', { class: 'grid' },
        el('div', { class: 'stat' }, el('span', { class: 'stat-label', text: 'Outcome' }), el('span', { class: 'stat-value', text: match.finishReason ?? match.status })),
        el('div', { class: 'stat' }, el('span', { class: 'stat-label', text: 'Winner' }), el('span', { class: 'stat-value', text: match.winnerSeat === null ? '—' : `seat ${match.winnerSeat}` })),
        el('div', { class: 'stat' }, el('span', { class: 'stat-label', text: 'Revision' }), el('span', { class: 'stat-value num', text: formatNumber(match.revision) })),
        el('div', { class: 'stat' }, el('span', { class: 'stat-label', text: 'Moves' }), el('span', { class: 'stat-value num', text: formatNumber(match.moveCount) })),
      ),
      el('dl', { class: 'kv' },
        el('dt', { text: 'Mode' }), el('dd', { text: modeLabel(match.mode) }),
        el('dt', { text: 'Rules version' }), el('dd', {}, el('code', { text: match.rulesVersion })),
        el('dt', { text: 'Created' }), el('dd', { text: formatDateTime(match.createdAt) }),
        el('dt', { text: 'Updated' }), el('dd', { text: formatDateTime(match.updatedAt) }),
        el('dt', { text: 'Finished' }), el('dd', { text: match.finishedAt === null ? 'not finished' : formatDateTime(match.finishedAt) }),
        el('dt', { text: 'Turn deadline' }), el('dd', { text: match.turnDeadlineAt === null ? '—' : formatDateTime(match.turnDeadlineAt) }),
        el('dt', { text: 'Match id' }), el('dd', { text: match.id }),
        el('dt', { text: 'Participants' }), el('dd', { text: match.players.map((seat) => `${ACTIONS[seat.seat] ?? `seat ${seat.seat}`}: ${seat.name ?? '(no name)'} — ${seat.playerId}`).join('\n') || 'none seated' }),
      ),
    ]),

    card('Timeline', [
      detail.moves.length === 0
        ? emptyBox('No moves were committed in this match.')
        : el('ol', { class: 'timeline' }, ...detail.moves.map((move) => el('li', {}, el('span', { class: 'num', text: `#${move.revision}` }), el('span', { class: 'muted', text: ACTIONS[move.seat] ?? `seat ${move.seat}` }), el('span', { text: move.action }), el('span', { class: 'muted small', text: `${formatDateTime(move.createdAt)} · ${move.events} event${move.events === 1 ? '' : 's'}` })))),
      detail.truncated ? el('p', { class: 'muted small', text: 'This timeline is the first 200 moves; the match has more recorded.' }) : null,
      el('p', { class: 'muted small', text: 'A move records WHAT was played and when. The raw event payload is never returned here — it is the unfiltered server-side record and can contain the opponent\'s hidden draw.' }),
    ]),
  );
};
