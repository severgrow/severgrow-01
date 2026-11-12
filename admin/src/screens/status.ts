// LIVE STATUS (launch readiness, 2026-11-12): the owner's monitoring, in the dashboard. One line per
// check, green / amber / red / grey, with the reason in words. The judgement is the server's
// (`server/src/admin/status.ts`); this screen only shows it, and asks again every minute while open.
import type { StatusCheck, StatusLevel } from '../../../server/src/admin/status.js';
import { formatDateTime } from '../format.js';
import { button, card, el, errorBox, honesty, loading, screenTitle, type Ctx } from '../ui.js';

type StatusResponse = { ok: true; checks: StatusCheck[]; server: { botVersion: string; rulesVersion: string }; serverNow: number };

const REFRESH_MS = 60_000;
const COLOUR: Record<StatusLevel, string> = { ok: 'var(--c-you)', warn: 'var(--c-gold)', bad: 'var(--c-danger)', unknown: 'var(--c-muted)' };
const WORD: Record<StatusLevel, string> = { ok: 'OK', warn: 'Check', bad: 'Problem', unknown: 'Unknown' };

let timer: number | null = null;

export const renderStatus = async (host: HTMLElement, ctx: Ctx): Promise<void> => {
  if (timer !== null) window.clearTimeout(timer);
  const body = el('div', {});
  host.replaceChildren(screenTitle('Status', 'Is the game healthy right now? Server, database, scheduled jobs, crashes, and what needs you.'), body);
  body.replaceChildren(loading('the live status'));

  const paint = async (): Promise<void> => {
    if (!host.isConnected || !body.isConnected) return;
    const started = performance.now();
    const result = await ctx.api.get<StatusResponse>('/v1/admin/status');
    if (!body.isConnected) return;
    if (!result.ok) {
      if (result.status === 401 || result.status === 403) return ctx.denied();
      // The API itself did not answer: that IS the status.
      body.replaceChildren(
        card('Status', [el('p', { style: `color:${COLOUR.bad}`, text: `The server did not answer: ${result.message}` })]),
        errorBox(result.message, () => void paint()),
      );
    } else {
      const data = result.data;
      const worst: StatusLevel = data.checks.some((c) => c.level === 'bad') ? 'bad'
        : data.checks.some((c) => c.level === 'warn') ? 'warn'
        : data.checks.some((c) => c.level === 'unknown') ? 'unknown' : 'ok';
      const headline = worst === 'ok' ? 'All good.' : worst === 'warn' ? 'Something needs a look.' : worst === 'bad' ? 'Something is wrong.' : 'Mostly fine; some checks could not be read.';
      body.replaceChildren(
        card(headline, [
          el('p', { class: 'muted small', text: `Checked ${formatDateTime(data.serverNow)} · the dashboard answered in ${Math.round(performance.now() - started)} ms · bots ${data.server.botVersion} · rules ${data.server.rulesVersion}. Refreshes every minute while this page is open.` }),
          el('div', { class: 'table-wrap' }, el('table', {},
            el('tbody', {}, ...data.checks.map((check) => el('tr', {},
              el('td', {}, el('span', { style: `color:${COLOUR[check.level]};font-weight:700`, text: `● ${WORD[check.level]}` })),
              el('td', {}, el('strong', { text: check.label })),
              el('td', { class: 'num', text: check.value }),
              el('td', { class: 'muted small', text: check.note }),
            ))),
          )),
          el('p', {}, button('Check now', () => void paint(), { small: true }), ' ', button('Open reports', () => ctx.navigate('#/reports'), { small: true })),
        ]),
        honesty('What this panel is', [
          'Every line is read from the live server when the page asks: the database round trip, its connections and size, the last run of each scheduled job (pg_cron), and the crash and report counts.',
          'It cannot alert you while the page is closed. A line that cannot be read says Unknown, never OK.',
          'The keep-alive job is also the sweeper: it finishes expired matches, settles Territory challenges and keeps the project awake. Red on it means those stopped.',
        ]),
      );
    }
    timer = window.setTimeout(() => { if (body.isConnected) void paint(); }, REFRESH_MS);
  };
  await paint();
};
