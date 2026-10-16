// The dashboard's DOM helpers. Small on purpose: no framework, no build-time magic, everything
// real DOM so keyboard navigation, focus and screen readers behave.
import type { AdminApi } from './api.js';
import { formatNumber, percentOf, seriesMax } from './format.js';

type Child = Node | string | null | undefined | false;

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, unknown>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value as Record<string, string>);
    // An event handler must be BOUND, never written as an attribute: `setAttribute('onclick', …)`
    // stores the function's source text in the HTML, which the browser cannot compile — so every
    // button built this way was silently dead until the browser suite caught it. `onclick`,
    // `oninput`, `onchange` and friends all route through here.
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value as EventListener);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
};

/** A text cell/paragraph. */
export const text = (value: string | number, className = ''): HTMLSpanElement => el('span', { class: className, text: String(value) });

export const card = (title: string | null, children: Child[], opts: { sub?: string; aside?: Node } = {}): HTMLElement => {
  const head = el('div', { class: 'card-head' });
  if (title !== null) head.append(el('h2', { class: 'card-title', text: title }));
  if (opts.sub !== undefined) head.append(el('p', { class: 'muted small', text: opts.sub }));
  if (opts.aside) head.append(opts.aside);
  return el('section', { class: 'card' }, head, ...children);
};

export const screenTitle = (title: string, sub?: string): HTMLElement => {
  const node = el('header', {}, el('h2', { class: 'screen-title', text: title }));
  if (sub) node.append(el('p', { class: 'muted screen-sub', text: sub }));
  return node;
};

export const stat = (label: string, value: string, note?: string): HTMLElement =>
  el(
    'div',
    { class: 'stat' },
    el('span', { class: 'stat-label', text: label }),
    el('span', { class: 'stat-value num', text: value }),
    note ? el('span', { class: 'stat-note', text: note }) : null,
  );

export const loading = (what: string): HTMLElement => el('div', { class: 'state' }, el('span', { class: 'spinner' }), ' ', `Loading ${what}…`);

export const errorBox = (message: string, retry?: () => void): HTMLElement =>
  el(
    'div',
    { class: 'state error', role: 'alert' },
    el('p', { text: message }),
    retry ? el('button', { class: 'btn small ghost', type: 'button', onclick: retry, text: 'Try again' }) : null,
  );

export const emptyBox = (message: string): HTMLElement => el('div', { class: 'state', text: message });

/**
 * A "not switched on yet" state. Deliberately neither an error box nor an empty list: when a screen's
 * query cannot run (e.g. the admin tables of migration 0012 are missing), saying so plainly is the
 * only honest answer — an empty table would read as "there is nothing here", which is a different,
 * false claim.
 */
export const noticeBox = (title: string, message: string): HTMLElement =>
  el(
    'div',
    { class: 'state setup', role: 'status' },
    el('p', {}, el('strong', { text: title })),
    el('p', { class: 'muted small', text: message }),
  );

/** An honest note about what the data cannot tell us. Never a chart, never a guess. */
export const honesty = (title: string, lines: readonly string[]): HTMLElement =>
  el(
    'div',
    { class: 'banner' },
    el('p', { class: 'banner-title', text: title }),
    el('ul', {}, ...lines.map((line) => el('li', { text: line }))),
  );

export type Column<T> = {
  label: string;
  /** A cell renderer. Keep it to text; a table cell is not a place for a nested layout. */
  render: (row: T) => Child;
  align?: 'right';
  /** A sort hint for the header (the API order is the only order the dashboard uses). */
  title?: string;
};

export const table = <T>(
  columns: readonly Column<T>[],
  rows: readonly T[],
  opts: { caption?: string; onRowClick?: (row: T, index: number) => void } = {},
): HTMLElement => {
  const head = el('tr', {}, ...columns.map((column) => el('th', { scope: 'col', class: column.align === 'right' ? 'right' : '', title: column.title ?? column.label, text: column.label })));
  const body = el(
    'tbody',
    {},
    ...rows.map((row, index) => {
      const tr = el('tr', { class: opts.onRowClick ? 'can-open' : '' }, ...columns.map((column) => el('td', { class: column.align === 'right' ? 'right' : '' }, column.render(row))));
      if (opts.onRowClick) {
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.addEventListener('click', () => opts.onRowClick!(row, index));
        tr.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            opts.onRowClick!(row, index);
          }
        });
      }
      return tr;
    }),
  );
  const tableEl = el('table', {}, el('thead', {}, head), body);
  return el('div', { class: 'table-wrap' }, tableEl, opts.caption ? el('caption', { text: opts.caption }) : null);
};

export type Control =
  | { kind: 'select'; name: string; label: string; value: string; options: { value: string; label: string }[] }
  | { kind: 'text'; name: string; label: string; value: string; placeholder?: string; wide?: boolean }
  | { kind: 'date'; name: string; label: string; value: string }
  | { kind: 'number'; name: string; label: string; value: string; min?: number; max?: number };

/**
 * The filter bar. Every control is a real labelled form control, so it is keyboard reachable and
 * reported properly — and each one applies through `onChange`, which rewrites the hash (so a view is
 * linkable and the back button works).
 */
export const controls = (defs: readonly Control[], onChange: (name: string, value: string) => void, extra: Node[] = []): HTMLElement => {
  const bar = el('div', { class: 'controls', role: 'group', 'aria-label': 'Filters' });
  for (const def of defs) {
    const id = `ctl-${def.name}`;
    const input =
      def.kind === 'select'
        ? el('select', { id, name: def.name }, ...def.options.map((option) => el('option', { value: option.value, selected: option.value === def.value, text: option.label })))
        : el('input', {
            id,
            name: def.name,
            type: def.kind === 'text' ? 'search' : def.kind === 'date' ? 'date' : 'number',
            value: def.value,
            placeholder: def.kind === 'text' ? (def.placeholder ?? '') : null,
            min: def.kind === 'number' ? (def.min ?? null) : null,
            max: def.kind === 'number' ? (def.max ?? null) : null,
            autocomplete: 'off',
            spellcheck: 'false',
          });
    input.addEventListener('change', () => onChange(def.name, (input as HTMLInputElement | HTMLSelectElement).value));
    const wide = def.kind === 'text' && def.wide === true;
    bar.append(el('label', { class: `control${wide ? ' wide' : ''}`, for: id }, el('span', { text: def.label }), input));
  }
  bar.append(...extra.filter(Boolean));
  return bar;
};

export const button = (label: string, onClick: () => void, opts: { primary?: boolean; small?: boolean; title?: string } = {}): HTMLButtonElement =>
  el('button', {
    class: `btn${opts.primary ? ' primary' : ''}${opts.small ? ' small' : ''}`,
    type: 'button',
    onclick: onClick,
    title: opts.title ?? label,
    text: label,
  });

/** A cursor pager. The API paginates by cursor, so there is no page number to invent. */
export const pager = (info: { total: number; shown: number; hasMore: boolean; onMore: () => void; onReset: () => void }, label: string): HTMLElement =>
  el(
    'div',
    { class: 'pager' },
    el('span', { class: 'muted small', text: `${formatNumber(info.shown)} of ${formatNumber(info.total)} ${label}` }),
    info.hasMore ? button('Load more', info.onMore, { small: true }) : null,
    info.shown > 0 && info.shown < info.total ? button('Back to the top', info.onReset, { small: true, title: 'Show the newest rows again' }) : null,
  );

/** A compact horizontal bar series with the maximum labelled (never a decorative chart). */
export const bars = (rows: readonly { label: string; value: number; hint?: string; tone?: 'spent' }[], unit = ''): HTMLElement => {
  const max = seriesMax(rows.map((row) => row.value));
  return el(
    'div',
    { class: 'bars' },
    ...rows.map((row) =>
      el(
        'div',
        { class: 'bar-row' },
        el('span', { class: 'muted small', text: row.label }),
        el('span', { class: 'bar-track', role: 'img', 'aria-label': `${row.label}: ${formatNumber(row.value)}${unit}` }, el('span', { class: `bar-fill${row.tone === 'spent' ? ' spent' : ''}`, style: `width:${percentOf(row.value, max)}%` })),
        el('span', { class: 'num small', text: `${formatNumber(row.value)}${unit}${row.hint ? ` · ${row.hint}` : ''}` }),
      ),
    ),
  );
};

/** A definition list: the honest way to show a handful of precise facts. */
export const kv = (pairs: readonly (readonly [string, Child])[]): HTMLElement =>
  el('dl', { class: 'kv' }, ...pairs.flatMap(([key, value]) => [el('dt', { text: key }), el('dd', {}, value)]));

/** A tag chip for a triage status. */
export const statusTag = (status: string): HTMLElement => el('span', { class: `tag ${status}`, text: status });

/** A screen-level fetcher: renders loading, then the result, and handles a refusal plainly. */
export const load = async <T>(
  host: HTMLElement,
  what: string,
  fetchIt: () => Promise<{ ok: true; data: T } | { ok: false; status: number; code: string; message: string }>,
  render: (data: T) => void,
  onDenied: () => void,
): Promise<void> => {
  host.replaceChildren(loading(what));
  const result = await fetchIt();
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      onDenied();
      return;
    }
    host.replaceChildren(errorBox(result.message));
    return;
  }
  host.replaceChildren();
  render(result.data);
};

export type Ctx = {
  api: AdminApi;
  session: { admin: { id: string; displayName: string | null; tag: string }; rulesVersion: string; limits: { maxPage: number; csvMaxRows: number; tagScanLimit: number } };
  navigate: (hash: string) => void;
  denied: () => void;
};

/**
 * A download for the CSV export. The blob is built in the browser from a `text/csv` response that
 * came through the SAME authorized endpoint as the JSON view, so the file is exactly the rows the
 * screen was showing.
 */
export const downloadCsv = (filename: string, csv: string): void => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = el('a', { href: url, download: filename });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
