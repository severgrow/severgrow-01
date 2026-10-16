// Seeds and world — the read-only economy, the shared map, and the world-growth replay.
//
// The map is this dashboard's OWN lightweight drawing (the game's world-map view is not reused or
// restyled — another worker owns that file). It draws the frozen v1 landmass from the cell ids the
// API returns, and colours each owner with the game's OWN `territoryColour`, so an owner is the same
// colour here as on the player-facing map. Replaying by day shows claims cumulatively, because a
// claimed tile is never released: a later day can never show fewer tiles.
import type { AdminEconomy, AdminLedgerRow, AdminWorld } from '../../../server/src/admin/types.js';
import { territoryColour } from '../../../server/src/world.js';
import type { Page } from '../api.js';
import { claimsUpToDay, formatAgo, formatDateTime, formatDay, formatDelta, formatNumber, formatRatio, shortId } from '../format.js';
import { bars, button, card, controls, el, emptyBox, errorBox, honesty, kv, loading, pager, screenTitle, stat, table, type Ctx } from '../ui.js';

const HEX_SIZE = 14;

/** Axial hex → pixel (pointy-top). Presentation only; it describes no rule of the game. */
const hexPoint = (id: string): { x: number; y: number } | null => {
  const [qText, rText] = id.split(',');
  const q = Number(qText);
  const r = Number(rText);
  if (!Number.isFinite(q) || !Number.isFinite(r)) return null;
  return { x: HEX_SIZE * Math.sqrt(3) * (q + r / 2), y: HEX_SIZE * 1.5 * r };
};

const hexPath = (cx: number, cy: number): string =>
  Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 30);
    return `${(cx + HEX_SIZE * Math.cos(angle)).toFixed(2)},${(cy + HEX_SIZE * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');

export const renderSeeds = async (host: HTMLElement, ctx: Ctx, params: URLSearchParams): Promise<void> => {
  host.replaceChildren(screenTitle('Seeds and world', 'The ledger, the economy as a whole, the shared map, and the world at any recorded day.'));

  const economyHost = el('div', {});
  const worldHost = el('div', {});
  const ledgerHost = el('div', {});
  host.append(economyHost, worldHost, ledgerHost);

  void renderEconomy(economyHost, ctx);
  void renderWorld(worldHost, ctx, params);
  void renderLedger(ledgerHost, ctx, params);
};

const renderEconomy = async (host: HTMLElement, ctx: Ctx): Promise<void> => {
  host.replaceChildren(loading('the economy'));
  const result = await ctx.api.get<{ ok: true; economy: AdminEconomy }>('/v1/admin/economy');
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return ctx.denied();
    host.replaceChildren(errorBox(result.message, () => void renderEconomy(host, ctx)));
    return;
  }
  const economy = result.data.economy;
  host.replaceChildren(
    card('Economy', [
      el('div', { class: 'grid' },
        stat('Minted (lifetime)', formatNumber(economy.totals.lifetimeEarned), 'sum of lifetime_earned'),
        stat('Spent (lifetime)', formatNumber(economy.totals.lifetimeSpent), 'world tiles, at ' + formatNumber(economy.caps.tileCost) + ' Seeds each'),
        stat('In the wallets now', formatNumber(economy.totals.balance), `${formatNumber(economy.totals.wallets)} wallets`),
        stat('Minted per Seed spent', formatRatio(economy.inflationRatio), economy.inflationRatio === null ? 'nothing spent yet — a ratio needs a denominator' : economy.inflationRatio > 1 ? 'above 1: the currency is inflating' : 'at or below 1: hoarding is not the pattern'),
      ),
      el('h3', { class: 'card-title', text: 'By ledger category' }),
      economy.byCategory.length === 0
        ? emptyBox('No ledger entries yet.')
        : el('div', { class: 'table-wrap' }, table<AdminEconomy['byCategory'][number]>(
            [
              { label: 'Category', render: (row) => el('code', { class: 'small', text: row.category }) },
              { label: 'Entries', align: 'right', render: (row) => formatNumber(row.entries) },
              { label: 'Minted', align: 'right', render: (row) => formatNumber(row.minted) },
              { label: 'Spent', align: 'right', render: (row) => formatNumber(row.spent) },
              { label: 'Net', align: 'right', render: (row) => el('span', { class: row.net < 0 ? 'bad' : 'good', text: formatDelta(row.net) }) },
            ],
            economy.byCategory,
            { caption: 'Exact: seed_ledger summed by its recorded category.' },
          )),
      el('h3', { class: 'card-title', text: 'Reward receipts' }),
      el('div', { class: 'grid' },
        stat('Paid', formatNumber(economy.receipts.awarded)),
        stat('Denied', formatNumber(economy.receipts.denied), 'A zero-award receipt still records why'),
      ),
      el('div', { class: 'grid' },
        el('div', {}, el('h4', { class: 'card-title', text: 'By reason' }), bars(economy.receipts.byDenial.map((row) => ({ label: row.value, value: row.n })))),
        el('div', {}, el('h4', { class: 'card-title', text: 'By mode' }), bars(economy.receipts.byMode.map((row) => ({ label: row.value, value: row.n })))),
      ),
      el('h3', { class: 'card-title', text: 'Caps in force' }),
      kv([
        ['Tile cost', formatNumber(economy.caps.tileCost)],
        ['Repeatable daily cap', formatNumber(economy.caps.utcDailyRepeatableCap)],
        ...economy.caps.economies.map((line): readonly [string, string] => ['Mode', line]),
      ]),
      honesty('Reconciling the numbers', [
        'The two lifetime totals come from `seed_wallets`, the authoritative per-player wallet, and the ledger totals come from `seed_ledger`. Both are recorded by the award path in one transaction, so a difference points at a settlement that never committed — not at a rounding error.',
        'The category names are the economy\'s own; nothing here is inferred from a rule.',
      ]),
    ]),
  );
};

const renderWorld = async (host: HTMLElement, ctx: Ctx, params: URLSearchParams): Promise<void> => {
  host.replaceChildren(loading('the world'));
  const result = await ctx.api.get<{ ok: true; world: AdminWorld }>('/v1/admin/world');
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) return ctx.denied();
    host.replaceChildren(errorBox(result.message, () => void renderWorld(host, ctx, params)));
    return;
  }
  const world = result.data.world;
  const allClaims = world.claimsByDayIndex.flatMap((day) => day.claims);
  const latestDay = world.replayDays[world.replayDays.length - 1] ?? null;
  const requested = params.get('day');
  let dayIndex = requested ? world.replayDays.indexOf(requested) : world.replayDays.length - 1;
  if (dayIndex < 0) dayIndex = world.replayDays.length - 1;

  const mapHost = el('div', {});
  const replayHost = el('div', {});
  const inspection = el('p', { class: 'muted small', role: 'status', 'aria-live': 'polite', text: 'Select a tile to see who owns it.' });

  const draw = (): void => {
    const replaying = world.replayDays.length > 0 && dayIndex < world.replayDays.length - 1;
    const day = world.replayDays[dayIndex] ?? null;
    const claims = replaying && day ? claimsUpToDay(allClaims, day) : allClaims;
    const byCell = new Map(claims.map((claim) => [claim.cellId, claim]));
    const points = world.cellIds.map((id) => ({ id, point: hexPoint(id) })).filter((entry): entry is { id: string; point: { x: number; y: number } } => entry.point !== null);
    const xs = points.map((entry) => entry.point.x);
    const ys = points.map((entry) => entry.point.y);
    const minX = Math.min(...xs) - HEX_SIZE * 2;
    const maxX = Math.max(...xs) + HEX_SIZE * 2;
    const minY = Math.min(...ys) - HEX_SIZE * 2;
    const maxY = Math.max(...ys) + HEX_SIZE * 2;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'world-grid');
    svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', `World map, ${formatNumber(claims.length)} of ${formatNumber(world.cellsTotal)} tiles claimed`);
    for (const { id, point } of points) {
      const claim = byCell.get(id);
      const ownerName = claim ? (world.recentClaims.find((row) => row.cellId === id)?.ownerName ?? null) : null;
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', hexPath(point.x, point.y));
      polygon.setAttribute('class', `world-hex world-cell-btn${claim ? ' claimed' : ''}`);
      polygon.setAttribute('fill', claim ? territoryColour(claim.ownerId) : 'var(--c-surface)');
      polygon.setAttribute('tabindex', '0');
      polygon.setAttribute('role', 'button');
      polygon.setAttribute('aria-label', claim ? `${id}, owned, claimed ${formatDateTime(claim.claimedAt)}` : `${id}, unclaimed`);
      const describe = (): void => {
        inspection.textContent = claim
          ? `${id} — ${ownerName ?? 'owner ' + shortId(claim.ownerId)} (${claim.ownerId}) · claimed ${formatDateTime(claim.claimedAt)} · ${formatAgo(claim.claimedAt, Date.now())}`
          : `${id} — unclaimed`;
      };
      polygon.addEventListener('click', describe);
      polygon.addEventListener('focus', describe);
      polygon.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          describe();
        }
      });
      svg.append(polygon);
    }
    mapHost.replaceChildren(el('div', { class: 'world' }, svg), inspection);
    const slider = el('input', {
      type: 'range',
      min: 0,
      max: Math.max(0, world.replayDays.length - 1),
      step: 1,
      value: String(Math.max(0, dayIndex)),
      'aria-label': 'Replay day',
    });
    slider.addEventListener('input', () => {
      dayIndex = Number((slider as HTMLInputElement).value);
      draw();
    });
    replayHost.replaceChildren(
      el('div', { class: 'replay' },
        el('span', { class: 'muted small', text: day ? formatDay(day) : '—' }),
        slider,
        button('Latest', () => { dayIndex = world.replayDays.length - 1; draw(); }, { small: true }),
      ),
      el('p', { class: 'muted small', text: replaying ? `Replaying the end of ${formatDay(day ?? '')}: tiles claimed on or before that day.` : 'Showing every claim ever recorded.' }),
    );
  };

  host.replaceChildren(
    card('The world', [
      el('div', { class: 'grid' },
        stat('Claims', formatNumber(world.totalClaims), `of ${formatNumber(world.cellsTotal)} tiles`),
        stat('Owners', formatNumber(world.owners)),
        stat('World revision', formatNumber(world.revision)),
        stat('Replay days', formatNumber(world.replayDays.length), world.replayDays.length ? `${formatDay(world.replayDays[0]!)} → ${formatDay(latestDay!)}` : 'no claims yet'),
      ),
      mapHost,
      replayHost,
      el('h3', { class: 'card-title', text: 'Claims per day (30 days)' }),
      bars(world.claimsByDay.map((row) => ({ label: formatDay(row.day), value: row.n }))),
      el('h3', { class: 'card-title', text: 'Newest claims' }),
      world.recentClaims.length === 0
        ? emptyBox('No tiles have been claimed.')
        : el('div', { class: 'table-wrap' }, table<AdminWorld['recentClaims'][number]>(
            [
              { label: 'Cell', render: (row) => el('code', { class: 'small', text: row.cellId }) },
              { label: 'Owner', render: (row) => row.ownerName ?? shortId(row.ownerId) },
              { label: 'Source', render: (row) => row.source },
              { label: 'Claimed', render: (row) => formatDateTime(row.claimedAt) },
            ],
            world.recentClaims,
            { caption: 'Newest 20 claims. "legacy" is a tile carried over from the earlier map during the migration.' },
          )),
      honesty('Reading the map', [
        `Exact: ${formatNumber(world.totalClaims)} claims out of ${formatNumber(world.cellsTotal)} tiles, from world_claims. The replay is those claims ordered by their recorded claimed_at — a tile is never released, so the total only grows.`,
        replayHost.textContent === '' ? 'No claim has ever been recorded, so there is nothing to replay.' : 'A claim date comes from the server clock at the moment the purchase committed.',
      ]),
    ]),
  );
  draw();
};

const renderLedger = async (host: HTMLElement, ctx: Ctx, params: URLSearchParams): Promise<void> => {
  const filters = {
    category: params.get('category') ?? '',
    playerId: params.get('playerId') ?? '',
    limit: params.get('limit') ?? '50',
  };
  let rows: AdminLedgerRow[] = [];
  let total = 0;
  let cursor: string | null = null;

  const apply = (name: string, value: string): void => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('cursor');
    ctx.navigate(`#/seeds?${next.toString()}`);
  };

  const listHost = el('div', {});
  const render = (): Node => {
    if (rows.length === 0) return emptyBox('No ledger entries match these filters.');
    return el(
      'div',
      {},
      table<AdminLedgerRow>(
        [
          { label: 'When', render: (row) => formatDateTime(row.createdAt) },
          { label: 'Player', render: (row) => el('span', {}, el('span', { text: row.playerName ?? '(no name)' }), el('br'), el('span', { class: 'muted small', text: shortId(row.playerId) })) },
          { label: 'Category', render: (row) => el('code', { class: 'small', text: row.category }) },
          { label: 'Source', render: (row) => el('span', { class: 'muted small wrap', text: row.sourceKey }) },
          { label: 'Delta', align: 'right', render: (row) => el('span', { class: row.delta < 0 ? 'bad' : 'good', text: formatDelta(row.delta) }) },
          { label: 'Balance after', align: 'right', render: (row) => formatNumber(row.balanceAfter) },
        ],
        rows,
        { caption: 'Exact: seed_ledger, newest first. A denial has no ledger row — it is a receipt on the player screen and in the economy panel.' },
      ),
      pager({ total, shown: rows.length, hasMore: cursor !== null, onMore: () => void fetchPage(cursor), onReset: () => { rows = []; void fetchPage(null); } }, 'entries'),
    );
  };

  const fetchPage = async (nextCursor: string | null): Promise<void> => {
    if (nextCursor === null) listHost.replaceChildren(loading('the ledger'));
    const result = await ctx.api.get<Page<AdminLedgerRow> & { ok: true }>('/v1/admin/ledger', {
      category: filters.category,
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
    rows = nextCursor === null ? result.data.rows : [...rows, ...result.data.rows];
    listHost.replaceChildren(render());
  };

  host.replaceChildren(
    card('Seeds ledger', [
      controls(
        [
          { kind: 'text', name: 'category', label: 'Category', value: filters.category, placeholder: 'queue, friend, training, campaign, world_claim' },
          { kind: 'text', name: 'playerId', label: 'Player id', value: filters.playerId, placeholder: 'a player id' },
          { kind: 'number', name: 'limit', label: 'Per page', value: filters.limit, min: 1, max: ctx.session.limits.maxPage },
        ],
        apply,
      ),
      listHost,
    ]),
  );
  await fetchPage(null);
};

