// Player lookup — by nickname, unique tag, or player id.
//
// What stays OUT is as deliberate as what is shown: the Google subject, any email and every
// credential are never requested or displayed. `providers` is the provider NAME only ("google"),
// which is what "account type" means on screen.
import type { AdminPlayerResult } from '../../../server/src/admin/types.js';
import { formatAgo, formatDateTime, formatDelta, formatNumber, modeLabel } from '../format.js';
import { button, card, el, emptyBox, errorBox, honesty, loading, screenTitle, stat, table, type Ctx } from '../ui.js';

const nameOf = (player: { displayName: string | null; tag: string }): string => `${player.displayName ?? '(no name)'} #${player.tag}`;

export const renderPlayer = async (host: HTMLElement, ctx: Ctx, params: URLSearchParams): Promise<void> => {
  const query = params.get('q') ?? '';
  const input = el('input', { id: 'player-q', type: 'search', value: query, placeholder: 'MapleFox, #7QK2, or a player id', autocomplete: 'off', spellcheck: 'false' });
  input.style.minWidth = '280px';
  const form = el(
    'div',
    { class: 'controls' },
    el('label', { class: 'control wide', for: 'player-q' }, el('span', { text: 'Look up a player' }), input),
    button('Search', () => ctx.navigate(`#/player?q=${encodeURIComponent(input.value.trim())}`), { primary: true }),
  );
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') ctx.navigate(`#/player?q=${encodeURIComponent(input.value.trim())}`);
  });

  const resultHost = el('div', {});
  host.replaceChildren(screenTitle('Player lookup', 'Public identity, matches, the authoritative Seeds balance and what the world shows.'), card(null, [form, resultHost]));
  input.focus();

  if (!query) {
    resultHost.replaceChildren(emptyBox('Enter a nickname, a tag like #7QK2, or a full player id. A four-character name is read as a tag.'));
    return;
  }

  resultHost.replaceChildren(loading('the player'));
  const result = await ctx.api.get<AdminPlayerResult & { ok: true; player: AdminPlayerResult['player'] | null }>('/v1/admin/player', { q: query });
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return ctx.denied();
    resultHost.replaceChildren(errorBox(result.message, () => ctx.navigate(`#/player?q=${encodeURIComponent(query)}`)));
    return;
  }
  const found = result.data;
  if (found.player === null) {
    resultHost.replaceChildren(emptyBox(`No player matched “${query}”.`));
    return;
  }
  const player = found.player;

  resultHost.replaceChildren(
    card(
      nameOf(player),
      [
        el('div', { class: 'grid' },
          stat('Matches recorded', formatNumber(found.matches.total), `${formatNumber(found.matches.finished)} finished`),
          stat('Record', `${formatNumber(found.matches.wins)}W · ${formatNumber(found.matches.losses)}L · ${formatNumber(found.matches.draws)}D`, 'From the recorded result of each finished duel'),
          stat('Seeds balance', formatNumber(found.wallet.balance), 'Authoritative wallet'),
          stat('Tiles owned', formatNumber(found.tiles.total), 'World claims'),
        ),
        el('dl', { class: 'kv' },
          el('dt', { text: 'Player id' }), el('dd', { text: player.id }),
          el('dt', { text: 'Account type' }), el('dd', { text: player.kind === 'account' ? `account${player.providers.length ? ` · linked ${player.providers.join(', ')}` : ''}` : 'guest (not signed in)' }),
          el('dt', { text: 'Created' }), el('dd', { text: `${formatDateTime(player.createdAt)} (${formatAgo(player.createdAt, Date.now())})` }),
          el('dt', { text: 'Upgraded' }), el('dd', { text: player.upgradedAt === null ? 'not recorded' : formatDateTime(player.upgradedAt) }),
          el('dt', { text: 'Matched by' }), el('dd', { text: found.matchedBy === 'id' ? 'player id' : found.matchedBy === 'tag' ? 'unique tag' : 'nickname' }),
        ),
        found.tagScanLimit === null
          ? null
          : el('p', { class: 'muted small', text: `A tag is a hash of the player id, so a tag search scans the ${formatNumber(found.tagScanLimit)} most recently created players. A very old player may need the id.` }),
      ],
    ),

    card('Seeds ledger (newest 20)', [
      found.ledger.length === 0
        ? emptyBox('No Seeds have moved for this player.')
        : table<AdminPlayerResult['ledger'][number]>(
            [
              { label: 'When', render: (row) => formatDateTime(row.createdAt) },
              { label: 'Category', render: (row) => el('code', { class: 'small', text: row.category }) },
              { label: 'Source', render: (row) => el('span', { class: 'muted small wrap', text: row.sourceKey }) },
              { label: 'Delta', align: 'right', render: (row) => el('span', { class: row.delta < 0 ? 'bad' : 'good', text: formatDelta(row.delta) }) },
              { label: 'Balance after', align: 'right', render: (row) => formatNumber(row.balanceAfter) },
            ],
            found.ledger,
            { caption: 'Exact: seed_ledger rows. Balance after is the wallet value the server wrote with that entry.' },
          ),
    ]),

    card('Reward history', [
      el('div', { class: 'grid' },
        stat('Receipts paid', formatNumber(found.rewards.awarded)),
        stat('Receipts denied', formatNumber(found.rewards.denied), 'Recorded with a reason'),
      ),
      found.rewards.deniedByReason.length === 0
        ? null
        : el('div', { class: 'table-wrap' }, table<AdminValueCountRow>(
            [
              { label: 'Reason', render: (row) => el('code', { class: 'small', text: row.value }) },
              { label: 'Times', align: 'right', render: (row) => formatNumber(row.n) },
            ],
            found.rewards.deniedByReason,
            { caption: 'Exact: every receipt is recorded, including a zero-award one, with the reason the economy decided.' },
          )),
    ]),

    card('Recent matches', [
      found.matches.recent.length === 0
        ? emptyBox('No matches recorded for this player.')
        : table<AdminPlayerResult['matches']['recent'][number]>(
            [
              { label: 'When', render: (row) => formatDateTime(row.createdAt) },
              { label: 'Mode', render: (row) => modeLabel(row.mode) },
              { label: 'Status', render: (row) => row.status },
              { label: 'Result', render: (row) => row.outcome ?? '—' },
              { label: 'Opponent', render: (row) => row.opponentName ?? '—' },
              { label: 'Open', render: (row) => el('span', {}, button('Timeline', () => ctx.navigate(`#/match/${row.id}`), { small: true })) },
            ],
            found.matches.recent,
            { caption: 'Newest 10 of this player\'s matches.' },
          ),
    ]),

    card('World tiles', [
      found.tiles.recent.length === 0
        ? emptyBox('No tiles owned.')
        : table<AdminPlayerResult['tiles']['recent'][number]>(
            [
              { label: 'Cell', render: (row) => el('code', { class: 'small', text: row.cellId }) },
              { label: 'Claimed', render: (row) => formatDateTime(row.claimedAt) },
            ],
            found.tiles.recent,
            { caption: `Newest 10 of ${formatNumber(found.tiles.total)} tiles.` },
          ),
    ]),

    honesty('Kept out of this screen on purpose', [
      'The Google subject and any email address: the dashboard shows the provider name only.',
      'Tokens and recovery secrets: they are never selected, and the dashboard has no field for them.',
      'Hidden game state: the authoritative match state (hands, deck order, seed) is never returned by any admin endpoint.',
      `Window: the account is created, the reward reason and the tile ownership above are all stored facts. "Active users" is not measurable from this data and is not shown.`,
    ]),
  );
};

type AdminValueCountRow = { value: string; n: number };
