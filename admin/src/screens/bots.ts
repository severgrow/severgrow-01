// Bots — the automated TEST ACCOUNTS, kept apart from real people.
//
// The owner (2026-10-24): "i mainly care about not confusing bots with real players who are testing the
// game". So this page is deliberately NOT "suspicious players". Every row here was called automated by
// one of exactly two pieces of evidence, and the reason is printed beside it:
//   * an explicit marker written when a test harness created the account (`x-futasaku-traffic: test`);
//   * the conservative backfill: a CI-sized creation burst with NO recorded activity of any kind.
// A human tester is never here for having a generated-looking name — every guest name is generated.
// Anything the owner disagrees with is one button away from the human list, and the correction sticks.
//
// The game's campaign/training bots are NOT here and never were players: they live in `src/bots/` and
// leave no `players` row. The page says so, so "bots" cannot be read as "opponents".
import type { AdminPlayers, AdminPlayersRow } from '../../../server/src/admin/players.js';
import { formatAgo, formatDateTime, formatNumber } from '../format.js';
import { button, card, el, emptyBox, errorBox, honesty, loading, screenTitle, stat, table, type Ctx } from '../ui.js';

type PlayersResponse = AdminPlayers & { ok: true; serverNow: number };

export const renderBots = async (host: HTMLElement, ctx: Ctx, params: URLSearchParams): Promise<void> => {
  void params;
  host.replaceChildren(
    screenTitle(
      'Bots (test accounts)',
      'Accounts an automated harness created — not the game\'s campaign bots, and not people testing the game.',
    ),
    loading('the test accounts'),
  );
  const result = await ctx.api.get<PlayersResponse>('/v1/admin/players');
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return ctx.denied();
    host.lastElementChild?.remove();
    if (result.status === 404) {
      host.append(errorBox('This screen needs the newer server (the `duel` Edge Function) deployed.'));
      return;
    }
    host.append(errorBox(result.message, () => void renderBots(host, ctx, params)));
    return;
  }

  const data = result.data;
  const now = data.serverNow;
  const bots = data.rows.filter((row) => row.classification === 'bot').sort((a, b) => b.createdAt - a.createdAt);
  const keptHumans = data.rows.filter((row) => row.classification === 'human' && row.testOverridden);
  const ownerMarkedBots = bots.filter((row) => row.testOverridden);
  const withPlay = bots.filter((row) => row.matches.played > 0 || row.seeds > 0 || row.tiles > 0 || row.reports > 0);

  host.lastElementChild?.remove();
  host.append(
    el(
      'section',
      { class: 'grid stats-row' },
      stat('Test accounts', formatNumber(bots.length), 'hidden from every human-facing view'),
      stat('Active in 24 h', formatNumber(data.summary.botsActive24h), `${formatNumber(data.summary.botsCreated24h)} created in 24 h`),
      stat('With recorded play', formatNumber(withPlay.length), 'a match, Seeds, a tile or a report'),
      stat('Your corrections', formatNumber(keptHumans.length + ownerMarkedBots.length), `${formatNumber(keptHumans.length)} kept as real people`),
    ),
    botsCard(bots, now, host, ctx, params),
    keptCard(keptHumans, now, host, ctx, params),
    honesty('What this page is, exactly', [
      'These are automated test accounts: an e2e suite, a soak or simulation script, or CI created them. Nothing human ever looks at them. They are not the game\'s campaign bots — those run inside a match and never create a player row, so they cannot appear here.',
      'A real person testing the game stays on All players. Their name is generated from their id like every guest name, so "the name looks random" is never a reason to call anyone a bot here.',
      'Two kinds of evidence are used: a marker written at creation by a harness, and a backfill that requires a CI-sized creation burst AND no recorded activity of any kind ever. Anything ambiguous was left as a human on purpose.',
      '"Active in 24 h" is the newest recorded event of any kind (usually the creation itself, because a silent test account does nothing). It is the "is a test running right now" signal, not a visit log.',
    ]),
  );
};

const didCell = (row: AdminPlayersRow): HTMLElement =>
  el(
    'span',
    { class: 'small' },
    `${formatNumber(row.matches.played)} matches · ${formatNumber(row.seeds)} Seeds · ${formatNumber(row.tiles)} tiles`,
    row.reports > 0 ? ` · ${formatNumber(row.reports)} reports` : null,
  );

/** The one-click correction. The server stores it on the row, so it survives a reload. */
const overrideButton = (
  row: AdminPlayersRow,
  override: 'human' | 'auto',
  label: string,
  title: string,
  host: HTMLElement,
  ctx: Ctx,
  params: URLSearchParams,
): HTMLElement => {
  const status = el('span', { class: 'muted small' });
  const buttonNode = button(label, () => {
    buttonNode.disabled = true;
    void ctx.api
      .post<{ ok: true }>(`/v1/admin/players/${encodeURIComponent(row.id)}/visibility`, { override })
      .then((response) => {
        if (response.ok) return renderBots(host, ctx, params);
        buttonNode.disabled = false;
        status.textContent = response.message;
      });
  }, { small: true, title });
  return el('span', { class: 'nowrap' }, buttonNode, status);
};

const botsCard = (bots: readonly AdminPlayersRow[], now: number, host: HTMLElement, ctx: Ctx, params: URLSearchParams): HTMLElement =>
  card(
    'Automated test accounts',
    [
      bots.length === 0
        ? emptyBox('No account is marked as automated right now. New test runs tag themselves at creation, so this list fills only when one runs.')
        : table<AdminPlayersRow>(
            [
              {
                label: 'Account',
                render: (row) =>
                  el(
                    'span',
                    { class: 'who-cell' },
                    el('strong', { text: row.displayName ?? '(no name)' }),
                    el('span', { class: 'muted small', text: ` #${row.tag}` }),
                    el('br'),
                    el('span', { class: 'tag', text: row.kind }),
                  ),
              },
              { label: 'Created', render: (row) => el('span', { class: 'small nowrap', title: formatDateTime(row.createdAt), text: formatAgo(row.createdAt, now) }) },
              { label: 'Last seen', render: (row) => el('span', { class: 'small nowrap', title: formatDateTime(row.lastSeenAt), text: formatAgo(row.lastSeenAt, now) }) },
              { label: 'What it did', render: didCell },
              {
                label: 'Why it is here',
                render: (row) =>
                  el(
                    'span',
                    { class: 'small' },
                    row.classificationReason,
                    row.testOverridden ? el('span', { class: 'tag', text: ' your call' }) : null,
                  ),
              },
              {
                label: 'Correct it',
                render: (row) =>
                  row.testOverridden
                    ? overrideButton(row, 'auto', 'Follow the marker again', 'Remove your override and let the stored test marker decide', host, ctx, params)
                    : overrideButton(row, 'human', 'This is a real person', 'Always show this account on All players (saved on the account)', host, ctx, params),
              },
            ],
            bots,
            {
              caption: `${formatNumber(bots.length)} automated ${bots.length === 1 ? 'account' : 'accounts'}. If one of these is really a person testing the game, press "This is a real person": it moves to All players immediately and stays there.`,
            },
          ),
    ],
    { sub: 'Newest first. The reason is the evidence, so you can agree or disagree with each one.' },
  );

const keptCard = (kept: readonly AdminPlayersRow[], now: number, host: HTMLElement, ctx: Ctx, params: URLSearchParams): HTMLElement =>
  card(
    'Kept as real people by you',
    [
      kept.length === 0
        ? emptyBox('You have not brought an automated account back to the human list.')
        : table<AdminPlayersRow>(
            [
              {
                label: 'Account',
                render: (row) => el('span', { class: 'who-cell' }, el('strong', { text: row.displayName ?? '(no name)' }), el('span', { class: 'muted small', text: ` #${row.tag}` })),
              },
              { label: 'Created', render: (row) => el('span', { class: 'small nowrap', title: formatDateTime(row.createdAt), text: formatAgo(row.createdAt, now) }) },
              { label: 'Last seen', render: (row) => el('span', { class: 'small nowrap', title: formatDateTime(row.lastSeenAt), text: formatAgo(row.lastSeenAt, now) }) },
              {
                label: 'Why it was marked',
                render: (row) =>
                  el('span', { class: 'small', text: row.testReason ?? 'Marked as test data (no reason recorded).' }),
              },
              {
                label: 'Undo',
                render: (row) => overrideButton(row, 'auto', 'Undo', 'Hand this account back to its stored test marker', host, ctx, params),
              },
            ],
            kept,
            { caption: `${formatNumber(kept.length)} ${kept.length === 1 ? 'account' : 'accounts'} you moved back to All players. The stored test marker is untouched, so "Undo" restores it.` },
          ),
    ],
    { sub: 'Your corrections, so a false positive is always one click from fixed.' },
  );
