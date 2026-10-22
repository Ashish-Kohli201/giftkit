// A small static file server (zero dependencies) for previewing a built gift, on this computer and on a phone on the same Wi-Fi.
// It supports HTTP Range requests, which iPhones REQUIRE before they will play a video or a song, and an optional
// live-reload channel (/__reload) so the page refreshes itself when the gift's files change.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

/** This computer's address on the local network (what a phone on the same Wi-Fi should type), or null. */
export function lanAddress() {
  for (const list of Object.values(networkInterfaces())) for (const n of list ?? []) if (n.family === 'IPv4' && !n.internal) return n.address;
  return null;
}


/**
 * Send one file, honouring HTTP Range requests (iPhones will not play a video or a song without them).
 * @throws when the path is not a file (callers answer 404)
 */
export async function sendFile(req, res, file) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error('not a file');
  const headers = { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] === '' ? info.size - Number(range[2]) : Number(range[1]);
    let end = range[1] === '' || range[2] === '' ? info.size - 1 : Number(range[2]);
    end = Math.min(end, info.size - 1);
    if (!(start >= 0) || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return; }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return void res.end();
    streamTo(res, createReadStream(file, { start, end }));
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': info.size });
  if (req.method === 'HEAD') return void res.end();
  streamTo(res, createReadStream(file));
}

/** Pipe a file to the response; if the file vanishes mid-send (a preview being rebuilt), end the response instead of crashing. */
function streamTo(res, stream) {
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

/**
 * @param root  the folder to serve (a path, or a function returning one so it can change between rebuilds)
 * @param opts  { port, host }
 * @returns { server, port, reload() }  reload() makes every open page refresh itself
 */
export function serveFolder(root, { port = 5180, host = '0.0.0.0' } = {}) {
  const clients = new Set();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/__reload') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write('retry: 1000\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      const base = resolve(typeof root === 'function' ? root() : root);
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(base, path));
      if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end('Forbidden'); return; } // path traversal guard
      await sendFile(req, res, file);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  });
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolveListen({
      server, port: server.address().port,
      reload: () => { for (const c of clients) c.write('data: reload\n\n'); },
      close: () => new Promise((r) => { for (const c of clients) c.end(); server.close(r); }),
    }));
  });
}
