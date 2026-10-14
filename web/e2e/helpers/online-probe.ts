// Resource probe for the FUTASAKU 0.5 online polish pass.
//
// TEST-ONLY instrumentation: it wraps the page's own globals (`setInterval`, `setTimeout`,
// `requestAnimationFrame`, `addEventListener`, `WebSocket`, `Worker`) BEFORE any app script runs, so
// a long session can be measured for per-match leaks without touching one line of product code.
//
// Why these counters:
//  - `intervals` / `timeouts` are LIVE timers. A poll chain re-arms one timer (a constant count); a
//    timer created per match and never cleared makes the count climb with the matches played.
//  - `rafs` is the number of OUTSTANDING animation-frame callbacks. A self-re-arming loop shows as
//    exactly 1; a loop left running per match shows as N.
//  - `socketsLive` is open WebSockets. The duel opens one Realtime socket per match and must close it.
//  - `listenersLive` counts listeners whose target is still alive AND (for DOM nodes) still connected.
//    This is the metric that separates a REAL leak from the harmless case of a listener left on an
//    element the app has already replaced: `setup()` on the board swaps every hex element, so a
//    naive add-minus-remove count climbs by ~185 per match while nothing is actually retained.
//    `listenersDetached` reports the harmless half, so the difference is visible, not guessed.
//  - listener keys are descriptive STRINGS (`g.hex-cell.normal@#board|pointerdown|0`), never target
//    objects, so the probe itself cannot retain the DOM.
//  - `nodes` is the DOM element count; `storage` is the raw localStorage/sessionStorage size.
import type { BrowserContext, CDPSession, Page } from 'playwright-core';

export type ResourceSnapshot = {
  intervals: number;
  timeouts: number;
  rafs: number;
  /** Listeners on targets still alive (`isConnected` for nodes). The real-leak signal. */
  listenersLive: number;
  /** Listeners left on targets that are gone (harmless; the target is garbage). */
  listenersDetached: number;
  listenerKeysLive: number;
  topLive: [string, number][];
  socketsCreated: number;
  socketsLive: number;
  socketUrls: Record<string, number>;
  workers: number;
  nodes: number;
  /** `performance.memory.usedJSHeapSize` when the browser exposes it (a coarse secondary signal). */
  heap: number;
  storage: StorageSnapshot;
};

export type StorageSnapshot = {
  localKeys: number;
  localBytes: number;
  localDraftKeys: number;
  localStarterKeys: number;
  sessionKeys: number;
  sessionBytes: number;
  sessionDraftKeys: number;
  sessionDraftSamples: string[];
};

/** The live listener counts by descriptive key (for diffing two snapshots). */
export type ListenerCounts = Record<string, number>;

/** The probe, as a plain string so the page evaluates it verbatim (no bundler helpers). */
export const PROBE_SCRIPT = `(() => {
  if (window.__probe) return;
  var real = {
    setInterval: window.setInterval,
    clearInterval: window.clearInterval,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    raf: window.requestAnimationFrame,
    caf: window.cancelAnimationFrame,
    WS: window.WebSocket,
    Worker: window.Worker
  };
  var live = { intervals: new Set(), timeouts: new Set(), rafs: new Set() };
  var entries = [];
  var sockets = { created: 0, live: 0, urls: {} };
  var workers = { created: 0, live: 0 };
  // The channel patches Storage.prototype, so capture the un-prefixed accessors now (the probe runs
  // before any app script) — otherwise reading a raw prefixed key would double-prefix it.
  var rawStorage = { get: Storage.prototype.getItem, set: Storage.prototype.setItem };
  var hasWeakRef = typeof WeakRef !== 'undefined';
  var ref = function (t) { return hasWeakRef ? new WeakRef(t) : { deref: function () { return t; } }; };

  window.setInterval = function (fn, ms) {
    var id = real.setInterval.apply(window, arguments);
    live.intervals.add(id);
    return id;
  };
  window.clearInterval = function (id) {
    live.intervals.delete(id);
    return real.clearInterval.apply(window, arguments);
  };
  window.setTimeout = function (fn, ms) {
    var id = real.setTimeout.call(window, function () {
      // A fired timeout is no longer live: remove it before the callback runs, or the count would
      // climb with every one-shot timer the app ever set.
      live.timeouts.delete(id);
      return typeof fn === 'function' ? fn.apply(this, arguments) : undefined;
    }, ms);
    live.timeouts.add(id);
    return id;
  };
  window.clearTimeout = function (id) {
    live.timeouts.delete(id);
    return real.clearTimeout.apply(window, arguments);
  };
  window.requestAnimationFrame = function (fn) {
    var id = real.raf.call(window, function (t) {
      live.rafs.delete(id);
      return fn(t);
    });
    live.rafs.add(id);
    return id;
  };
  window.cancelAnimationFrame = function (id) {
    live.rafs.delete(id);
    return real.caf.call(window, id);
  };

  function describe(t) {
    try {
      if (t === window) return 'window';
      if (t === document) return 'document';
      if (t && t.nodeType === 1) {
        var tag = t.tagName.toLowerCase();
        var id = t.getAttribute ? (t.getAttribute('id') || '') : '';
        var clsAttr = t.getAttribute ? (t.getAttribute('class') || '') : '';
        var cls = clsAttr.trim() ? '.' + clsAttr.trim().split(/\\s+/).slice(0, 2).join('.') : '';
        var own = tag + (id ? '#' + id : '') + cls;
        if (!id && t.parentElement && t.parentElement.getAttribute) {
          var pid = t.parentElement.getAttribute('id') || '';
          var pcls = (t.parentElement.getAttribute('class') || '').split(/\\s+/)[0];
          own += pid ? '@#' + pid : (pcls ? '@.' + pcls : '');
        }
        return own;
      }
      if (t && t.constructor && t.constructor.name) return t.constructor.name;
    } catch (e) {}
    return 'other';
  }
  function keyFor(t, type, opts) {
    var capture = opts === true || !!(opts && opts.capture);
    return describe(t) + '|' + String(type) + '|' + (capture ? 1 : 0);
  }
  var protoAdd = EventTarget.prototype.addEventListener;
  var protoRemove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    try { entries.push({ k: keyFor(this, type, opts), r: ref(this) }); } catch (e) {}
    return protoAdd.apply(this, arguments);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    try {
      var k = keyFor(this, type, opts);
      for (var i = entries.length - 1; i >= 0; i--) {
        var e = entries[i];
        if (e.k === k && e.r.deref() === this) { entries.splice(i, 1); break; }
      }
    } catch (e2) {}
    return protoRemove.apply(this, arguments);
  };

  if (real.WS) {
    function WrappedWS(url, protocols) {
      var ws = protocols === undefined ? new real.WS(url) : new real.WS(url, protocols);
      sockets.created++;
      sockets.live++;
      var short = String(url).slice(0, 48);
      sockets.urls[short] = (sockets.urls[short] || 0) + 1;
      try { ws.addEventListener('close', function () { sockets.live--; }); } catch (e) {}
      return ws;
    }
    WrappedWS.prototype = real.WS.prototype;
    WrappedWS.CONNECTING = 0; WrappedWS.OPEN = 1; WrappedWS.CLOSING = 2; WrappedWS.CLOSED = 3;
    window.WebSocket = WrappedWS;
  }
  if (real.Worker) {
    function WrappedWorker(url, opts) {
      var w = new real.Worker(url, opts);
      workers.created++;
      workers.live++;
      return w;
    }
    WrappedWorker.prototype = real.Worker.prototype;
    window.Worker = WrappedWorker;
  }

  function readListeners() {
    var liveCount = 0, detached = 0, byKey = new Map();
    for (var i = 0; i < entries.length; i++) {
      var t = entries[i].r.deref();
      if (t === undefined || t === null) { detached++; continue; }
      var nt = t.nodeType;
      if ((nt === 1 || nt === 9 || nt === 11) && t.isConnected === false) { detached++; continue; }
      liveCount++;
      byKey.set(entries[i].k, (byKey.get(entries[i].k) || 0) + 1);
    }
    return { live: liveCount, detached: detached, byKey: byKey };
  }

  window.__probe = {
    snap: function () {
      var l = readListeners();
      var top = [];
      l.byKey.forEach(function (n, k) { top.push([k, n]); });
      top.sort(function (a, b) { return b[1] - a[1]; });
      var mem = window.performance && window.performance.memory;
      var st = { localKeys: 0, localBytes: 0, localDraftKeys: 0, localStarterKeys: 0,
                 sessionKeys: 0, sessionBytes: 0, sessionDraftKeys: 0, sessionDraftSamples: [] };
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k === null) continue;
          st.localKeys++;
          st.localBytes += k.length;
          if (k.indexOf('duel.draft') >= 0) st.localDraftKeys++;
          if (k.indexOf('starterRevealed') >= 0) st.localStarterKeys++;
          var v = rawStorage.get.call(localStorage, k);
          if (typeof v === 'string') st.localBytes += v.length;
        }
      } catch (e) {}
      try {
        for (var j = 0; j < sessionStorage.length; j++) {
          var sk = sessionStorage.key(j);
          if (sk === null) continue;
          st.sessionKeys++;
          st.sessionBytes += sk.length;
          if (sk.indexOf('duel.draft') >= 0) {
            st.sessionDraftKeys++;
            if (st.sessionDraftSamples.length < 4) st.sessionDraftSamples.push(sk);
          }
          var sv = rawStorage.get.call(sessionStorage, sk);
          if (typeof sv === 'string') st.sessionBytes += sv.length;
        }
      } catch (e) {}
      return {
        intervals: live.intervals.size,
        timeouts: live.timeouts.size,
        rafs: live.rafs.size,
        listenersLive: l.live,
        listenersDetached: l.detached,
        listenerKeysLive: l.byKey.size,
        topLive: top.slice(0, 30),
        socketsCreated: sockets.created,
        socketsLive: sockets.live,
        socketUrls: sockets.urls,
        workers: workers.live,
        nodes: document.getElementsByTagName('*').length,
        heap: (mem && mem.usedJSHeapSize) || 0,
        storage: st
      };
    },
    listeners: function () {
      var l = readListeners();
      var out = {};
      l.byKey.forEach(function (n, k) { out[k] = n; });
      return out;
    }
  };
})()`;

/** Install the probe before any app script on every page in this context. */
export const installProbe = (context: BrowserContext): Promise<void> =>
  context.addInitScript({ content: PROBE_SCRIPT });

export const readResources = (page: Page): Promise<ResourceSnapshot> =>
  page.evaluate('window.__probe ? window.__probe.snap() : null') as Promise<ResourceSnapshot>;

export const readListeners = (page: Page): Promise<ListenerCounts> =>
  page.evaluate('window.__probe ? window.__probe.listeners() : {}') as Promise<ListenerCounts>;

/** Keys whose count changed from `before` to `after`, with the delta (worst first). */
export const listenerGrowth = (before: ListenerCounts, after: ListenerCounts): [string, number][] => {
  const out: [string, number][] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const delta = (after[key] ?? 0) - (before[key] ?? 0);
    if (delta !== 0) out.push([key, delta]);
  }
  return out.sort((a, b) => b[1] - a[1]);
};

/** A Chromium DevTools session, for forced GC and real heap numbers. */
export const openCdp = async (context: BrowserContext, page: Page): Promise<CDPSession> => {
  const session = await context.newCDPSession(page);
  await session.send('HeapProfiler.enable').catch(() => undefined);
  return session;
};

/**
 * Heap actually RETAINED: force a full GC, let it settle, then read `Runtime.getHeapUsage`.
 * The number after GC is what a per-match leak would make climb; raw heap is dominated by garbage.
 */
export const retainedHeap = async (session: CDPSession): Promise<number> => {
  await session.send('HeapProfiler.collectGarbage');
  await new Promise((r) => setTimeout(r, 250));
  await session.send('HeapProfiler.collectGarbage');
  await new Promise((r) => setTimeout(r, 150));
  const usage = (await session.send('Runtime.getHeapUsage')) as { usedSize: number };
  return usage.usedSize;
};
