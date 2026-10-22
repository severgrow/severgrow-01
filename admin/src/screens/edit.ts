// The owner's two test edits on the Seeds and world screen (docs/ADMIN.md §3a): give or take Seeds
// for any account, and set or clear the owner of any map cell. Every change goes through the admin
// API, which checks the allow-list, writes a ledger row (Seeds) and an audit row (both).
import type { AdminPlayersRow } from '../../../server/src/admin/players.js';
import { formatNumber, shortId } from '../format.js';
import { button, card, el, type Ctx } from '../ui.js';

export type EditPlayer = Pick<AdminPlayersRow, 'id' | 'tag' | 'displayName' | 'seeds' | 'tiles'>;

/** Every player the server lists, or null when this server predates the players list. */
export const loadEditPlayers = async (ctx: Ctx): Promise<EditPlayer[] | null> => {
  const result = await ctx.api.get<{ ok: true; rows: AdminPlayersRow[] }>('/v1/admin/players');
  if (!result.ok) return null;
  return result.data.rows
    .map(({ id, tag, displayName, seeds, tiles }) => ({ id, tag, displayName, seeds, tiles }))
    .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
};

export const playerLabel = (p: EditPlayer): string => `${p.displayName ?? '(no name)'} #${p.tag} · ${shortId(p.id)}`;

const requestId = (): string => `admin-${crypto.randomUUID()}`;

/** A labelled control in the dashboard's own `.control` style. */
const field = (label: string, input: HTMLElement): HTMLElement => {
  const id = `edit-${Math.random().toString(36).slice(2, 9)}`;
  input.id = id;
  return el('label', { class: 'control', for: id }, el('span', { text: label }), input);
};

const playerSelect = (players: readonly EditPlayer[], opts: { unowned?: boolean; selected?: string | null } = {}): HTMLSelectElement =>
  el('select', {},
    ...(opts.unowned ? [el('option', { value: '', selected: opts.selected == null, text: 'Unowned (clear the tile)' })] : []),
    ...players.map((p) => el('option', { value: p.id, selected: p.id === opts.selected, text: `${playerLabel(p)} · ${formatNumber(p.seeds)} Seeds` })));

/** "Give or take Seeds": one account, a signed amount, an optional reason. */
export const seedsEditor = (ctx: Ctx, players: readonly EditPlayer[], onDone: () => void): HTMLElement => {
  const who = playerSelect(players);
  const amount = el('input', { type: 'number', step: 1, value: '500', inputmode: 'numeric' }) as HTMLInputElement;
  const reason = el('input', { type: 'text', maxlength: 200, placeholder: 'e.g. challenge test', autocomplete: 'off' }) as HTMLInputElement;
  const status = el('p', { class: 'notice', role: 'status', 'aria-live': 'polite' });

  const apply = async (sign: 1 | -1): Promise<void> => {
    const value = Math.trunc(Math.abs(Number(amount.value)));
    if (!who.value) { status.textContent = 'Choose a player first.'; return; }
    if (!Number.isFinite(value) || value <= 0) { status.textContent = 'Enter a whole number of Seeds above 0.'; return; }
    status.textContent = 'Saving…';
    const result = await ctx.api.post<{ ok: true; balance: number; delta: number }>('/v1/admin/seeds/adjust', {
      playerId: who.value, delta: sign * value, reason: reason.value, requestId: requestId(),
    });
    if (!result.ok) {
      if (result.status === 401 || result.status === 403) return ctx.denied();
      status.textContent = result.status === 404 && result.code === 'NOT_FOUND' && /Unknown endpoint|not available/.test(result.message)
        ? 'This needs the updated server (the duel Edge Function) deployed first.'
        : result.message;
      return;
    }
    const name = players.find((p) => p.id === who.value);
    const chosen = who.selectedOptions[0];
    if (name && chosen) chosen.textContent = `${playerLabel(name)} · ${formatNumber(result.data.balance)} Seeds`;
    status.textContent = `${result.data.delta > 0 ? 'Gave' : 'Took'} ${formatNumber(Math.abs(result.data.delta))} Seeds ${result.data.delta > 0 ? 'to' : 'from'} ${name?.displayName ?? 'the player'}. Balance now ${formatNumber(result.data.balance)}.`;
    onDone();
  };

  return card('Give or take Seeds', [
    el('p', { class: 'muted small', text: 'For testing. Each change is one ledger row in the "admin_adjust" category and one audit row. A balance can never go below zero.' }),
    players.length === 0
      ? el('p', { class: 'muted', text: 'No players yet.' })
      : el('div', { class: 'controls', role: 'group', 'aria-label': 'Give or take Seeds' },
          field('Player', who), field('Seeds', amount), field('Reason (optional)', reason),
          button('Give', () => void apply(1), { primary: true }),
          button('Take', () => void apply(-1)),
        ),
    status,
  ]);
};

/** The owner picker under the map, for the selected cell. */
export const cellEditor = (
  ctx: Ctx,
  players: readonly EditPlayer[],
  cellId: string,
  currentOwnerId: string | null,
  onDone: () => void,
): HTMLElement => {
  const owner = playerSelect(players, { unowned: true, selected: currentOwnerId });
  const status = el('p', { class: 'notice', role: 'status', 'aria-live': 'polite' });
  const apply = async (): Promise<void> => {
    status.textContent = 'Saving…';
    const result = await ctx.api.post<{ ok: true; changed: boolean; challengesClosed: number }>('/v1/admin/world/cell', {
      cellId, ownerId: owner.value || null,
    });
    if (!result.ok) {
      if (result.status === 401 || result.status === 403) return ctx.denied();
      status.textContent = result.status === 404 && /Unknown endpoint|not available/.test(result.message)
        ? 'This needs the updated server (the duel Edge Function) deployed first.'
        : result.message;
      return;
    }
    if (!result.data.changed) { status.textContent = 'Nothing to change — that is already the owner.'; return; }
    status.textContent = result.data.challengesClosed
      ? `Saved. ${result.data.challengesClosed} open challenge on this tile was closed and its stake refunded.`
      : 'Saved.';
    onDone();
  };
  return el('div', { class: 'cell-edit' },
    el('div', { class: 'controls', role: 'group', 'aria-label': `Owner of ${cellId}` },
      field(`Owner of ${cellId}`, owner),
      button('Set owner', () => void apply(), { primary: true }),
    ),
    el('p', { class: 'muted small', text: 'For testing: free, ignores the next-to-your-land rule, and is recorded in the audit log.' }),
    status,
  );
};
