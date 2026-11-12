// Tiny static server for the built web/dist, for the perf probe only (never shipped).
//
// IT COMPRESSES, because the product does. GitHub Pages serves brotli/gzip; a probe that serves raw
// bytes makes the CSS look 4.7x and the JS 2.9x heavier than they are, which flips every
// byte-on-the-critical-path conclusion (measured: docs/PERF-COLDSTART.md). Set PERF_NO_GZIP=1 to see
// the uncompressed case deliberately.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(process.argv[2] ?? 'web/dist');
const port = Number(process.argv[3] ?? 4310);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    let body;
    try { body = await readFile(file); }
    catch {
      // NO SPA FALLBACK. Every URL this build serves is a real file; falling back to index.html made
      // `/BUILD_SHA` return 94 kB of HTML twice, which the byte accounting then blamed on the app.
      // A directory path still gets its index.html.
      if (path.endsWith('/')) body = await readFile(join(root, 'index.html'));
      else { res.writeHead(404).end('not found'); return; }
    }
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    const compressible = /^(text\/|application\/(json|manifest\+json|javascript))|^image\/svg/.test(type);
    const accepts = /gzip/.test(String(req.headers['accept-encoding'] ?? ''));
    const headers = {
      'content-type': type,
      'cache-control': process.env.PERF_CACHE ?? 'no-store',
      'access-control-allow-origin': '*',
      'timing-allow-origin': '*',
      vary: 'accept-encoding',
    };
    let out = body;
    if (compressible && accepts && !process.env.PERF_NO_GZIP && body.length > 1024) {
      out = gzipSync(body, { level: 9 });
      headers['content-encoding'] = 'gzip';
    }
    headers['content-length'] = String(out.length);
    res.writeHead(200, headers);
    res.end(out);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
