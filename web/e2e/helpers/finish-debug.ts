// Instrumentation for the "loser never gets the end screen" hunt (test-side only).
//
// Applied to a page AFTER it has loaded, from the test runner: it patches `window.fetch` (the only
// way this app talks to the server), watches `#gameover`, and catches errors — so we can print the
// exact timeline of what a device received and what it did with it.

export type FinishLog = {
  t: number;
  what: string;
  detail?: Record<string, unknown>;
};

/** The script to evaluate in a page. Records into `window.__finishDebug`. */
export const FINISH_DEBUG_SCRIPT = `(() => {
  if (window.__finishDebugInstalled) return 'already';
  window.__finishDebugInstalled = true;
  const log = [];
  window.__finishDebug = log;
  const T0 = performance.now();
  const push = (what, detail) => log.push({ t: Math.round(performance.now() - T0), what, ...(detail ? { detail } : {}) });
  push('installed', { visibility: document.visibilityState });

  const original = window.fetch;
  window.fetch = async function (input, init) {
    let url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
    const isView = /\\/view(\\?|$)/.test(url);
    const since = (() => { try { return new URL(url, location.href).searchParams.get('since'); } catch (e) { return null; } })();
    const started = performance.now();
    if (isView) push('view:req', { since });
    try {
      const res = await original.call(this, input, init);
      if (isView) {
        const clone = res.clone();
        clone.json().then((body) => {
          const p = body && body.player;
          push('view:res', p ? {
            ms: Math.round(performance.now() - started),
            status: p.status,
            revision: p.revision,
            phase: p.view && p.view.phase,
            actor: p.view && p.view.actor,
            seat: p.seat,
            events: (p.events || []).length,
            eventKinds: (p.events || []).map(function (e) { return e.t; }),
            result: p.result ? p.result.reason + '/' + p.result.winner : null,
            turnDeadlineAt: p.turnDeadlineAt,
          } : { ms: Math.round(performance.now() - started), empty: true, status: res.status });
        }).catch((e) => push('view:res-parse-error', { message: String(e) }));
      }
      return res;
    } catch (error) {
      if (isView) push('view:req-threw', { message: String(error) });
      throw error;
    }
  };

  const watch = () => {
    const go = document.getElementById('gameover');
    if (!go) { setTimeout(watch, 50); return; }
    push('gameover:found', { hidden: go.hidden });
    new MutationObserver(() => push('gameover:hidden-changed', { hidden: go.hidden, cls: go.className })).observe(go, { attributes: true, attributeFilter: ['hidden', 'class'] });
  };
  watch();

  window.addEventListener('error', (e) => push('window:error', { message: String(e.message), stack: String(e.error && e.error.stack || '').slice(0, 300) }));
  window.addEventListener('unhandledrejection', (e) => push('window:unhandledrejection', { message: String(e.reason && e.reason.message || e.reason), stack: String(e.reason && e.reason.stack || '').slice(0, 400) }));
  return 'ok';
})()`;

/** A live read of the page's own idea of the duel (the same hooks the suites use). */
export const FINISH_STATE_SCRIPT = `(() => {
  const g = window.__severgrow;
  if (!g) return { noApp: true };
  const o = g.online ? g.online() : null;
  const st = g.state ? g.state() : null;
  const go = document.getElementById('gameover');
  const info = (() => { try { return g.online() && g.online().finished; } catch (e) { return null; } })();
  return {
    online: o,
    phase: st ? st.phase : null,
    busy: g.busy ? g.busy() : null,
    gameoverHidden: go ? go.hidden : null,
    goTitle: (document.getElementById('go-title') || {}).textContent || '',
    hudTurn: (document.querySelector('#duel-hud [data-duel-turn]') || {}).textContent || '',
    finishedFlag: info,
    visibility: document.visibilityState,
  };
})()`;
