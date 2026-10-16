// Campaign — verified first clears, read from what the SERVER RECORDED.
//
// It deliberately does NOT read the campaign authoring table (admin/src/screens is not allowed to,
// and neither is the server's admin module — see the guard in tests/campaign/isolation.test.ts). So:
//   * a level is an OPAQUE id (`c1-01`) as recorded in `seed_reward_receipts.source_key`;
//   * the level NUMBER beside it is the one the award path recorded in the ledger when it paid;
//   * a level nobody has ever reached leaves no row at all, and the screen says so instead of
//     implying a complete list.
import type { AdminCampaign } from '../../../server/src/admin/types.js';
import { completionShare, formatDay, formatNumber, percentOf } from '../format.js';
import { bars, card, el, emptyBox, errorBox, honesty, loading, screenTitle, stat, table, type Ctx } from '../ui.js';

export const renderCampaign = async (host: HTMLElement, ctx: Ctx): Promise<void> => {
  host.replaceChildren(screenTitle('Campaign', 'Verified first clears, from the settlement rows the server wrote.'), el('div', { class: 'host' }));
  const body = host.querySelector('.host') as HTMLElement;
  body.replaceChildren(loading('campaign clears'));

  const result = await ctx.api.get<{ ok: true; campaign: AdminCampaign }>('/v1/admin/campaign');
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return ctx.denied();
    body.replaceChildren(errorBox(result.message, () => void renderCampaign(host, ctx)));
    return;
  }
  const campaign = result.data.campaign;
  const best = campaign.byLevel.reduce((max, row) => Math.max(max, row.firstClears), 0);
  const reached = campaign.byLevel.filter((row) => row.attempts > 0);
  const cleared = campaign.byLevel.filter((row) => row.firstClears > 0);
  const neverCleared = campaign.byLevel.filter((row) => row.attempts > 0 && row.firstClears === 0);

  // Where completion falls off: the first level either never reached or never cleared.
  const firstGap = campaign.byLevel.find((row) => row.firstClears === 0) ?? null;

  const falloff = el(
    'div',
    { class: 'bars' },
    ...cleared.map((row) =>
      el(
        'div',
        { class: 'bar-row' },
        el('span', { class: 'muted small', text: `L${row.level ?? '?'} (${row.levelId})` }),
        el('span', { class: 'bar-track', role: 'img', 'aria-label': `Level ${row.level ?? row.levelId}: ${row.firstClears} first clears` }, el('span', { class: 'bar-fill', style: `width:${percentOf(row.firstClears, best)}%` })),
        el('span', { class: 'num small', text: `${formatNumber(row.firstClears)} · ${completionShare(row.firstClears, best) === null ? '' : `${Math.round(completionShare(row.firstClears, best)!)}% of best`}` }),
      ),
    ),
  );

  body.replaceChildren(
    card('Verified clears', [
      el('div', { class: 'grid' },
        stat('First clears', formatNumber(campaign.firstClears), 'A receipt that actually awarded Seeds'),
        stat('Attempts recorded', formatNumber(campaign.attempts), 'Includes a repeat clear, which is denied'),
        stat('Seeds paid', formatNumber(campaign.awarded), 'First-clear and chapter bonuses as recorded'),
        stat('Denied', formatNumber(campaign.denials.count), campaign.denials.byReason.map((row) => `${row.value} ×${formatNumber(row.n)}`).join(' · ') || '—'),
      ),
      el('p', { class: 'muted small', text: `Levels with recorded activity: ${formatNumber(reached.length)}. Levels cleared at least once: ${formatNumber(cleared.length)}.` }),
    ]),

    card('Where completion falls off', [
      cleared.length === 0
        ? emptyBox('No campaign level has been cleared yet.')
        : falloff,
      el('div', { class: 'grid' },
        firstGap
          ? stat('First level with no clear', firstGap.level === null ? firstGap.levelId : `Level ${firstGap.level} (${firstGap.levelId})`, firstGap.attempts > 0 ? 'It was reached but never cleared' : 'No recorded attempt')
          : stat('First level with no clear', 'none', 'Every level with recorded activity has been cleared at least once'),
        stat('Chapter boundaries', campaign.chapterBoundaries.map((level) => `L${level}`).join(', '), 'The levels the Seed economy pays a chapter bonus at'),
      ),
      neverCleared.length === 0
        ? null
        : el('div', { class: 'table-wrap' }, table<AdminCampaign['byLevel'][number]>(
            [
              { label: 'Level', render: (row) => (row.level === null ? el('code', { class: 'small', text: row.levelId }) : `${row.level} (${row.levelId})`) },
              { label: 'Attempts', align: 'right', render: (row) => formatNumber(row.attempts) },
              { label: 'Denials', align: 'right', render: (row) => formatNumber(row.denials) },
            ],
            neverCleared,
            { caption: 'Levels players reached and did not clear: the clearest signal of where the campaign gets hard.' },
          )),
    ]),

    card('Per chapter', [
      campaign.byChapter.length === 0
        ? emptyBox('No chapter can be placed yet: chapters are derived from the level number the award path recorded, and nothing has been paid.')
        : el('div', { class: 'table-wrap' }, table<AdminCampaign['byChapter'][number]>(
            [
              { label: 'Chapter', render: (row) => `Chapter ${row.chapter}` },
              { label: 'First clears', align: 'right', render: (row) => formatNumber(row.firstClears) },
              { label: 'Seeds', align: 'right', render: (row) => formatNumber(row.awarded) },
            ],
            campaign.byChapter,
            { caption: `Exact for what was paid. A chapter boundary comes from the economy's own chapter bonuses (${campaign.chapterBoundaries.map((level) => `L${level}`).join(', ')}).` },
          )),
    ]),

    card('Per level (opaque id)', [
      campaign.byLevel.length === 0
        ? emptyBox('No campaign settlement has been recorded.')
        : el('div', { class: 'table-wrap' }, table<AdminCampaign['byLevel'][number]>(
            [
              { label: 'Level id', render: (row) => el('code', { class: 'small', text: row.levelId }) },
              { label: 'Recorded number', render: (row) => (row.level === null ? el('span', { class: 'muted', text: 'not recorded' }) : String(row.level)) },
              { label: 'First clears', align: 'right', render: (row) => formatNumber(row.firstClears) },
              { label: 'Attempts', align: 'right', render: (row) => formatNumber(row.attempts) },
              { label: 'Seeds', align: 'right', render: (row) => formatNumber(row.awarded) },
            ],
            campaign.byLevel,
            { caption: 'The level id is the value the game recorded — this dashboard never interprets it against the authored level list.' },
          )),
    ]),

    card('Clears per recorded day', [
      campaign.sessions.length === 0
        ? emptyBox('Nothing recorded yet.')
        : bars(campaign.sessions.map((row) => ({ label: formatDay(row.day), value: row.clears }))),
    ]),

    honesty('What this screen can and cannot say', [
      'Exact: every verified campaign result the server recorded, whether Seeds were paid, and the denial reason for a repeat clear.',
      'A level nobody has ever played leaves NO row here. The dashboard cannot distinguish "not yet cleared" from "not yet reached", so the list above shows recorded activity, never a complete level list.',
      'Local-only progress is not global data: a player who clears a level offline without a verified submission never appears in these counts, by design.',
      'Chapter totals are placed only for levels whose number the award path recorded; an unattributable clear is counted in the totals above and in the per-level table, never guessed into a chapter.',
    ]),
  );
};
