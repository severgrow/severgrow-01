// Player lookup — by nickname, unique tag, or player id.
//
// What stays OUT is as deliberate as what is shown: the Google subject, any email and every
// credential are never requested or displayed. `providers` is the provider NAME only ("google"),
// which is what "account type" means on screen.
import type { AdminPlayerResult } from '../../../server/src/admin/types.js';
import { formatAgo, formatDateTime, formatDelta, formatNumber, modeLabel } from '../format.js';
import { campaignKeysOnDevice, clearCampaignOnDevice, devicePlayer } from '../game-campaign.js';
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

    addSeedsCard(ctx, player.id, nameOf(player), query),

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

    campaignResetCard(player),

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

/** The game's own storage on this origin, or null when the browser blocks it. */
const gameStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * CAMPAIGN RESET (owner, 2026-10-17: "in the admin dashboard — but reset ONLY my own account").
 *
 * Campaign progress is the one player record the server does not hold: the game keeps it in the
 * browser (see admin/src/game-campaign.ts). So this action clears the CAMPAIGN RECORD OF THE BROWSER
 * THE DASHBOARD IS OPEN IN, and it is offered only when that browser is signed in as the player
 * being looked at — an admin typing somebody else's name cannot clear that person's campaign.
 */
const campaignResetCard = (player: AdminPlayerResult['player']): HTMLElement => {
  const store = gameStorage();
  const title = 'Campaign progress (this browser)';
  if (!store) {
    return card(title, [emptyBox('This browser blocks storage, so the game keeps no campaign record here to reset.')]);
  }
  const device = devicePlayer(store);
  if (!device) {
    return card(title, [
      emptyBox('This browser has no FUTASAKU player saved. The campaign is stored per browser, not on the account, so it can only be reset on a device where the game has been played.'),
    ]);
  }
  if (device.playerId !== player.id) {
    return card(title, [
      emptyBox(`This browser is signed in as ${device.displayName ?? 'a different player'}. The campaign reset clears only the browser you are playing in, so it is not offered for another player.`),
      el('p', { class: 'muted small', text: 'Open the game in the browser you play on, then use this screen there.' }),
    ]);
  }

  const body = el('div', {});
  const paint = (): void => {
    const present = campaignKeysOnDevice(store);
    const what = el('p', {
      class: 'muted small',
      text: present.length === 0
        ? 'No campaign record is stored in this browser: it is already at the start.'
        : `This browser holds ${formatNumber(present.length)} campaign record(s). Resetting clears them, so the campaign starts again at level 1.`,
    });
    const action = button('Reset campaign progress', () => {
      if (!window.confirm('Start the campaign again on this device?\n\nThis clears the unlocked levels, the best attempt per level and any unfinished campaign match. Seeds already earned stay in your wallet. It cannot be undone.')) return;
      const { removed } = clearCampaignOnDevice(store);
      body.replaceChildren(
        el('p', { class: 'good', text: removed.length === 0 ? 'Nothing to clear — the campaign was already at the start.' : `Cleared ${formatNumber(removed.length)} campaign record(s). Reload futasaku.com to start from level 1.` }),
        el('p', { class: 'muted small', text: 'Seeds already paid for first clears are untouched, and so is this dashboard.' }),
        button('Check again', paint, { small: true }),
      );
    }, { small: true, title: 'Clears the campaign progress stored in this browser' });
    body.replaceChildren(what, ...(present.length === 0 ? [] : [el('div', { class: 'controls' }, action)]));
  };
  paint();
  return card(title, [body]);
};

/**
 * ADD SEEDS (owner, 2026-10-24: "on mobile admin dashboard I can't find a button to add seeds to
 * someone's account"). The dashboard's one Seeds write: a whole number from 1 to 1000 and a short
 * reason, confirmed once. The server records it in the ledger as `admin_grant` (with the reason and
 * your id) and in the audit log; one request id per press, so a double tap never pays twice.
 */
const addSeedsCard = (ctx: Ctx, playerId: string, name: string, query: string): HTMLElement => {
  const amount = el('input', { id: 'grant-amount', type: 'number', inputmode: 'numeric', min: '1', max: '1000', step: '1', value: '100' });
  const reason = el('input', { id: 'grant-reason', type: 'text', maxlength: '200', placeholder: 'Why (it goes in the ledger)', autocomplete: 'off' });
  const feedback = el('p', { class: 'muted small grant-feedback', role: 'status', 'aria-live': 'polite' });
  let requestId = newRequestId();
  let busy = false;
  const submit = button('Add Seeds', () => {
    if (busy) return;
    const value = Number(amount.value);
    const why = reason.value.trim();
    if (!Number.isInteger(value) || value < 1 || value > 1000) { feedback.textContent = 'Seeds must be a whole number from 1 to 1000.'; return; }
    if (why.length < 3) { feedback.textContent = 'Write a short reason first.'; reason.focus(); return; }
    if (!window.confirm(`Add ${value} Seeds to ${name}?\n\nReason: ${why}`)) return;
    busy = true;
    submit.disabled = true;
    feedback.textContent = 'Adding…';
    void ctx.api.post<{ ok: true; amount: number; balance: number; replayed: boolean }>(
      `/v1/admin/players/${encodeURIComponent(playerId)}/seeds`, { amount: value, reason: why, requestId },
    ).then((result) => {
      busy = false;
      submit.disabled = false;
      if (!result.ok) {
        if (result.status === 401 || result.status === 403) { ctx.denied(); return; }
        feedback.textContent = result.message;
        return;
      }
      requestId = newRequestId();
      feedback.textContent = result.data.replayed
        ? `Already added. Balance ${formatNumber(result.data.balance)}.`
        : `Added ${formatNumber(result.data.amount)} Seeds. Balance ${formatNumber(result.data.balance)}.`;
      // Show the new balance and the ledger row the server just wrote.
      window.setTimeout(() => ctx.navigate(`#/player?q=${encodeURIComponent(query)}&t=${Date.now()}`), 900);
    });
  }, { primary: true, title: 'Add Seeds to this player' });
  return card('Add Seeds', [
    el('div', { class: 'controls grant-controls' },
      el('label', { class: 'control', for: 'grant-amount' }, el('span', { text: 'Seeds (1–1000)' }), amount),
      el('label', { class: 'control wide', for: 'grant-reason' }, el('span', { text: 'Reason' }), reason),
      submit,
    ),
    feedback,
  ], { sub: 'Recorded in the Seeds ledger as admin_grant, with your reason.' });
};

const newRequestId = (): string => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `grant-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
};
