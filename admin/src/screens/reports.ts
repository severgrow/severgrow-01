// Reports — the existing `feedback_reports`, newest first, with the one mutation v1 has.
//
// The list, the filters and the CSV export all go through the SAME authorized endpoint and the same
// field allowlist. The CSV is capped (`limits.csvMaxRows`, 5000) and says so on screen.
import type { AdminReportRow, AdminTriageStatus } from '../../../server/src/admin/types.js';
import type { Page } from '../api.js';
import { formatAgo, formatDateTime, formatNumber, shortId } from '../format.js';
import { button, card, controls, downloadCsv, el, emptyBox, errorBox, honesty, loading, pager, screenTitle, statusTag, table, type Ctx } from '../ui.js';

const TRIAGE: readonly AdminTriageStatus[] = ['new', 'reviewing', 'resolved'];

const contextLines = (context: Record<string, unknown>): string => {
  const entries = Object.entries(context).filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (entries.length === 0) return '—';
  return entries
    .slice(0, 12)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join('\n');
};

export const renderReports = async (host: HTMLElement, ctx: Ctx, params: URLSearchParams): Promise<void> => {
  const filters = {
    kind: params.get('kind') ?? '',
    status: params.get('status') ?? '',
    build: params.get('build') ?? '',
    since: params.get('since') ?? '',
    limit: params.get('limit') ?? '25',
  };
  const rows: AdminReportRow[] = [];
  let total = 0;
  let cursor: string | null = null;

  const apply = (name: string, value: string): void => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('cursor');
    ctx.navigate(`#/reports?${next.toString()}`);
  };

  const head = screenTitle('Reports', 'Player reports and silent crash reports, newest first. Triage is the only thing you can change.');
  const listHost = el('div', {});
  const bar = controls(
    [
      { kind: 'select', name: 'kind', label: 'Kind', value: filters.kind, options: [
        { value: '', label: 'Everything' },
        { value: 'report', label: 'Reports' },
        { value: 'crash', label: 'Crashes' },
      ] },
      { kind: 'select', name: 'status', label: 'Triage', value: filters.status, options: [
        { value: '', label: 'Any status' },
        ...TRIAGE.map((status) => ({ value: status, label: status })),
      ] },
      { kind: 'text', name: 'build', label: 'Build (asset · version)', value: filters.build, placeholder: 'index-ABC.js · 0.5.0' },
      { kind: 'date', name: 'since', label: 'From day', value: filters.since },
      { kind: 'number', name: 'limit', label: 'Per page', value: filters.limit, min: 1, max: ctx.session.limits.maxPage },
    ],
    apply,
    [
      button('Export CSV', () => {
        void (async () => {
          const result = await ctx.api.csv('/v1/admin/reports.csv', {
            kind: filters.kind,
            status: filters.status,
            build: filters.build,
            since: filters.since ? Date.parse(`${filters.since}T00:00:00.000Z`) : undefined,
          });
          if (!result.ok) {
            listHost.prepend(errorBox(`Export failed: ${result.message}`));
            return;
          }
          downloadCsv(`futasaku-reports-${new Date().toISOString().slice(0, 10)}.csv`, result.data);
        })();
      }, { small: true, title: `Download up to ${formatNumber(ctx.session.limits.csvMaxRows)} rows with the same filters and the same fields as this list` }),
    ],
  );
  const listCard = card(null, [bar, listHost]);
  host.replaceChildren(head, listCard);

  const fetchPage = async (nextCursor: string | null): Promise<void> => {
    if (nextCursor === null) listHost.replaceChildren(loading('reports'));
    const result = await ctx.api.get<Page<AdminReportRow> & { ok: true }>('/v1/admin/reports', {
      kind: filters.kind,
      status: filters.status,
      build: filters.build,
      since: filters.since ? Date.parse(`${filters.since}T00:00:00.000Z`) : undefined,
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
    listHost.replaceChildren(renderList());
  };

  const renderList = (): Node => {
    if (rows.length === 0) {
      return emptyBox(filters.kind || filters.status || filters.build || filters.since ? 'No reports match these filters.' : 'No reports yet. Nothing has been sent from the game.');
    }
    return el(
      'div',
      {},
      table<AdminReportRow>(
        [
          {
            label: 'When',
            title: 'Newest first',
            render: (row) => el('span', {}, el('span', { class: 'nowrap', text: formatDateTime(row.createdAt) }), el('br'), el('span', { class: 'muted small', text: formatAgo(row.createdAt, Date.now()) })),
          },
          { label: 'Kind', render: (row) => el('span', { class: `tag ${row.kind === 'crash' ? 'bad' : ''}`, text: row.kind }) },
          { label: 'Status', render: (row) => statusTag(row.status) },
          { label: 'Build', render: (row) => el('span', {}, el('code', { class: 'small', text: row.buildKey }), row.build && row.build !== row.buildKey ? el('br') : null, row.build && row.build !== row.buildKey ? el('span', { class: 'muted small', text: row.build }) : null) },
          { label: 'Message', render: (row) => el('span', { class: 'wrap' }, row.message.trim() || '(no message)') },
          {
            label: 'Player',
            render: (row) =>
              row.playerId === null
                ? el('span', { class: 'muted', text: 'anonymous' })
                : el('span', {}, el('span', { text: row.playerName ?? '(no name)' }), el('br'), el('span', { class: 'muted small', text: `#${row.playerTag ?? ''} · ${shortId(row.playerId)}` })),
          },
          { label: 'Open', render: () => el('span', { class: 'muted small', text: 'details' }) },
        ],
        rows,
        { onRowClick: (row) => openDetail(row) },
      ),
      pager({ total, shown: rows.length, hasMore: cursor !== null, onMore: () => void fetchPage(cursor), onReset: () => { rows.length = 0; void fetchPage(null); } }, 'reports'),
      honesty('About this list', [
        `Exact: rows in feedback_reports with their recorded context, device string and linked player. ${formatNumber(ctx.session.limits.csvMaxRows)} is the export cap.`,
        'No message is ever sent back to a player in v1: triage records your status and a private note only.',
      ]),
    );
  };

  const openDetail = (row: AdminReportRow): void => {
    // One detail panel at a time: opening a second report must not leave the first one stacked
    // below it (which also made "the last Save button" ambiguous).
    for (const existing of host.querySelectorAll('.report-detail')) existing.remove();
    const detail = el('section', { class: 'card report-detail' });
    const noteInput = el('textarea', { class: 'note', rows: 3, maxlength: 2000, 'aria-label': 'Private admin note' });
    noteInput.value = row.note;
    noteInput.style.width = '100%';
    noteInput.style.background = 'var(--c-bg)';
    noteInput.style.color = 'var(--c-text)';
    noteInput.style.border = '1px solid var(--c-line)';
    noteInput.style.borderRadius = 'var(--radius)';
    noteInput.style.padding = '8px';
    noteInput.style.font = 'inherit';

    const statusSelect = el('select', { 'aria-label': 'Triage status' }, ...TRIAGE.map((status) => el('option', { value: status, selected: status === row.status, text: status })));
    statusSelect.style.height = '36px';
    statusSelect.style.background = 'var(--c-bg)';
    statusSelect.style.color = 'var(--c-text)';
    statusSelect.style.border = '1px solid var(--c-line)';
    statusSelect.style.borderRadius = 'var(--radius)';

    const feedbackLine = el('p', { class: 'muted small triage-feedback', role: 'status', 'aria-live': 'polite' });
    const save = button('Save triage', () => {
      void (async () => {
        save.disabled = true;
        // The VALUE of the textarea, not the element: sending the element serialises to `{}` and the
        // note would silently save empty.
        const result = await ctx.api.post<{ ok: true; status: string; previous: string | null; changed: boolean }>(
          `/v1/admin/reports/${encodeURIComponent(row.id)}/triage`,
          { status: statusSelect.value, note: noteInput.value },
        );
        save.disabled = false;
        if (!result.ok) {
          feedbackLine.textContent = result.message;
          feedbackLine.className = 'bad small triage-feedback';
          return;
        }
        row.status = result.data.status as AdminTriageStatus;
        row.note = noteInput.value;
        feedbackLine.textContent = `Saved as ${result.data.status}. Recorded in the audit log.`;
        feedbackLine.className = 'muted small triage-feedback';
        listHost.replaceChildren(renderList());
      })();
    }, { primary: true, small: true });

    detail.append(
      el('div', { class: 'card-head' },
        el('h2', { class: 'card-title', text: `Report ${shortId(row.id)}` }),
        el('span', {}, button('Close', () => detail.remove(), { small: true, title: 'Close the detail panel' })),
      ),
      el('dl', { class: 'kv' },
        el('dt', { text: 'Received' }), el('dd', { text: formatDateTime(row.createdAt) }),
        el('dt', { text: 'Kind' }), el('dd', { text: row.kind }),
        el('dt', { text: 'Build' }), el('dd', {}, el('code', { text: row.build ?? '(none recorded)' })),
        el('dt', { text: 'Player' }), el('dd', { text: row.playerId === null ? 'not linked (anonymous report)' : `${row.playerName ?? '(no name)'} #${row.playerTag ?? ''} — ${row.playerId}` }),
        el('dt', { text: 'Device' }), el('dd', { text: row.userAgent ?? '(none recorded)' }),
      ),
      el('h3', { class: 'card-title', text: 'Message' }),
      el('p', { class: 'wrap', text: row.message.trim() || '(no message)' }),
      el('h3', { class: 'card-title', text: 'Context' }),
      el('pre', { class: 'wrap small', text: contextLines(row.context) }),
      el('h3', { class: 'card-title', text: 'Triage' }),
      el('div', { class: 'controls' }, el('label', { class: 'control' }, el('span', { text: 'Status' }), statusSelect), el('span', {}, save)),
      el('label', { class: 'field', for: 'triage-note' }, el('span', { text: 'Private note (never shown to the player)' }), noteInput),
      feedbackLine,
      el('p', { class: 'muted small', text: row.triagedAt ? `Last changed ${formatDateTime(row.triagedAt)}.` : 'Not triaged yet.' }),
    );
    listCard.after(detail);
    detail.scrollIntoView({ block: 'nearest' });
  };

  await fetchPage(null);
};
