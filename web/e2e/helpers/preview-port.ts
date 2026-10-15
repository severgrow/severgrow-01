// ONE place that decides which TCP port an e2e suite serves its page on.
//
// Why: every suite used to bind a HARDCODED port (4174, 4192, 4198…). Two suites never collided
// with each other because the numbers were unique — but the SAME suite run in two places at once
// (two git worktrees, which is how this project verifies in parallel) fought over its own number
// and one side died before a single assertion ran:
//
//   Error: Port 4198 is already in use
//     at async preview (…)
//     at async futa04-smart-cockpit.ts:14:48
//
// That is a false failure: the suite never gets to prove anything. So the port now comes from the
// OPERATING SYSTEM: `port: 0` means "whatever is free", and the suite reads the assigned number
// back off the server and builds its URL from it. Two concurrent runs (in two worktrees, or just
// two terminals) then cannot clash — there is nothing left to clash over.
//
// `E2E_PORT` (or `PORT`) still pins a specific number when someone needs a predictable one, e.g.
// to point a browser at it by hand. It is honoured with `strictPort`, so an explicit choice that
// is already taken fails loudly instead of silently serving on a surprise port.
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';
import { preview } from 'vite';
import type { PreviewServer } from 'vite';

/** A suite that needs a predictable port sets this (an explicit choice beats the OS's). */
export const PORT_ENV = 'E2E_PORT';

const requestedPort = (): number => {
  const raw = process.env[PORT_ENV] ?? process.env.PORT;
  if (raw === undefined || raw.trim() === '') return 0;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 65_535 ? value : 0;
};

/** The port a bound server actually got (the OS's pick when 0 was requested). */
const boundPort = (server: { address(): AddressInfo | string | null }): number => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('e2e preview: the server is not listening on a TCP port');
  return address.port;
};

export type ServedPreview = {
  /** The vite preview server — call `.close()` (directly or through `closePreview`). */
  server: PreviewServer;
  /** `http://127.0.0.1:<assigned port>` — no trailing slash. */
  origin: string;
  /** `http://127.0.0.1:<assigned port>/` — ready to concatenate a query or path. */
  url: string;
  port: number;
};

export type ServePreviewOptions = {
  /** The vite config the build/preview uses. Defaults to this repo's `web/vite.config.ts`. */
  configFile?: string;
  /** Passed straight through, e.g. `{ outDir: process.env.FUTA04_DIST ?? 'dist' }`. */
  build?: { outDir?: string };
  /** `error` is a good default for suites that assert nothing about build chatter. */
  logLevel?: 'silent' | 'error' | 'info' | 'warn';
  /** The interface to serve on. Defaults to `127.0.0.1` (no firewall prompt, no LAN exposure). */
  host?: string;
  /** A fixed port for this step (rare — usually the OS picks). `E2E_PORT` wins over it. */
  port?: number;
};

/**
 * Serve the pre-built page on a FREE port and return the URL to use.
 * `legacyPort` is the number the suite used to hardcode: it is only a comment for the reader (and
 * the value `E2E_PORT` can replace), never a reservation, so the collision cannot come back.
 */
export const servePreview = async (legacyPort: number, options: ServePreviewOptions = {}): Promise<ServedPreview> => {
  const explicit = requestedPort() || options.port || 0;
  const server = await preview({
    configFile: options.configFile ?? 'web/vite.config.ts',
    ...(options.build ? { build: options.build } : {}),
    preview: {
      host: options.host ?? '127.0.0.1',
      port: explicit,
      // An explicit number must be the number; the OS's pick can never be "in use".
      strictPort: explicit !== 0,
    },
    logLevel: options.logLevel ?? 'error',
  });
  const port = boundPort(server.httpServer);
  const origin = `http://${options.host ?? '127.0.0.1'}:${port}`;
  if (!explicit && port !== legacyPort) {
    // Visible only with E2E_DEBUG=1: it is expected, not a problem (that is the whole point).
    if (process.env.E2E_DEBUG === '1') console.log(`e2e preview: ${legacyPort} → ${port} (free port)`);
  }
  return { server, origin, url: `${origin}/`, port };
};

export type ServedStaticDist = {
  server: Server;
  origin: string;
  url: string;
  port: number;
};

/**
 * The same free-port rule for the suites that serve `web/dist` themselves with a tiny static
 * handler (they need it because they walk files the vite preview plugin would not).
 */
export const serveStaticDist = async (distDir: string): Promise<ServedStaticDist> => {
  const types: Record<string, string> = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json',
    '.json': 'application/json',
  };
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    let file = join(distDir, path === '/' ? 'index.html' : path);
    if (!existsSync(file)) file = join(distDir, 'index.html'); // SPA-ish fallback, as before
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  const explicit = requestedPort();
  await new Promise<void>((resolve) => server.listen(explicit, '127.0.0.1', resolve));
  const port = boundPort(server);
  const origin = `http://127.0.0.1:${port}`;
  return { server, origin, url: `${origin}/`, port };
};

/** Close a preview server and resolve either way (suites call this in `finally`). */
export const closePreview = async (server: PreviewServer | null): Promise<void> => {
  try {
    await server?.close();
  } catch {
    /* already gone */
  }
};
