// Tiny static server for the built web/dist, for the perf probe only (never shipped).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

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
      // SPA-style: unknown extensionless path -> index.html
      if (!extname(path)) body = await readFile(join(root, 'index.html'));
      else { res.writeHead(404).end('not found'); return; }
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': process.env.PERF_CACHE ?? 'no-store',
      'access-control-allow-origin': '*',
      'timing-allow-origin': '*',
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
