// THE STUDIO SERVER: a small local web app for making a gift on screen.   npm run gift -- studio
//
// It serves the studio's pages (engine/studio/ui/) and a JSON API over the same gift folders the command line uses
// (gifts/<name>/gift.json + media/), so you can switch between the screen and the files at any time.
//
//   GET  /api/catalog                      tiers, themes, skins, ending styles, roles
//   GET  /api/gifts                        every gift, with its status
//   POST /api/gifts                        start a gift {name, tier, theme, skin, recipient, sender, birthday}
//   GET  /api/gifts/:n                     the gift: raw gift.json, the checked config, media, the report
//   PUT  /api/gifts/:n/config              save gift.json (a snapshot of the old one is kept)
//   PUT  /api/gifts/:n/media/:file         upload one file (raw body); DELETE /api/gifts/:n/media/:slot removes it
//   POST /api/gifts/:n/build               make the finished gift + zip;  GET /download/:slug.zip
//   POST /api/gifts/:n/phone               start the Wi-Fi preview for a phone
//   GET  /api/gifts/:n/events              server-sent events: the preview is building / ready / failed
//   GET  /preview/:n/...                   the live preview (rebuilt on every change)
//   GET  /gift-media/:n/<file>             a gift's own media, for thumbnails and players
//   GET  /repo/<core|elements|skins|themes>/...   the runtime's files, so the studio can read element schemas
//
// The server only listens on this computer. Because any web page can send requests to localhost, every write needs a
// custom header and a local Origin, and the Host must be this computer.
import { createServer } from 'node:http';
import { createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGift, GiftError, loadCatalog, prepareGift, slugFor } from '../lib/build.js';
import { createGift } from '../lib/create.js';
import { LIMITS, kindOf, scanMedia } from '../lib/media.js';
import { planMediaFile } from '../lib/media-files.js';
import { DIST, GIFTS, PREVIEW, ROOT, giftNameOf } from '../lib/paths.js';
import { MIME, lanAddress, sendFile, serveFolder } from '../lib/server.js';
import { FINALE_VARIANTS, OPTIONAL_ROLES, PROGRESS_ORDER, REQUIRED_ROLES } from '../../core/roles.js';

const UI = fileURLToPath(new URL('./ui/', import.meta.url));
const REPO_DIRS = new Set(['core', 'elements', 'skins', 'themes']);
const HISTORY_KEEP = 30;

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

async function readJsonBody(req, limit = 4 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw new HttpError(413, 'That is too much data.'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new HttpError(400, 'The request was not valid JSON.'); }
}

export async function startStudio({ port = 5190, open = true } = {}) {
  await mkdir(GIFTS, { recursive: true });
  // leftovers of earlier studio runs (their numbered preview folders)
  for (const e of await readdir(PREVIEW).catch(() => [])) if (/~\d+$/.test(e)) await rm(join(PREVIEW, e), { recursive: true, force: true }).catch(() => {});
  const previews = new Map(); // gift name -> { building, queued, timer, uiClients, reloadClients, lan, last }
  const stateOf = (name) => { if (!previews.has(name)) previews.set(name, { building: false, queued: false, timer: null, uiClients: new Set(), reloadClients: new Set(), lan: null, last: null, dir: null, gen: 0 }); return previews.get(name); };

  const dirOf = (name) => {
    if (!/^[a-z0-9-]+$/.test(name ?? '')) throw new HttpError(400, 'That is not a gift name.');
    const dir = join(GIFTS, name);
    if (!existsSync(join(dir, 'gift.json'))) throw new HttpError(404, `There is no gift called "${name}".`);
    return dir;
  };

  // ---------------------------------------------------------------- preview: rebuilt after every change
  const tell = (st, event) => { for (const c of st.uiClients) c.write(`data: ${JSON.stringify(event)}\n\n`); };
  async function buildPreview(name) {
    const st = stateOf(name);
    if (st.building) { st.queued = true; return; }
    st.building = true;
    tell(st, { type: 'preview', status: 'building' });
    try {
      // every build goes into its own folder and the preview switches to it when it is complete, so a page that is loading
      // from the preview never finds files missing (the old folder is removed a little later)
      const out = join(PREVIEW, `${name}~${++st.gen}`);
      const r = await buildGift({ giftDir: dirOf(name), outDir: out, preview: true });
      const previous = st.dir;
      st.dir = out;
      if (previous) setTimeout(() => rm(previous, { recursive: true, force: true }).catch(() => {}), 15000).unref();
      st.last = { status: 'ready', at: Date.now(), warnings: r.report.warnings.length };
      for (const c of st.reloadClients) c.write('data: reload\n\n');
      st.lan?.reload();
    } catch (e) {
      st.last = { status: 'error', at: Date.now(), errors: e instanceof GiftError ? e.report.errors : [e.message] };
    } finally {
      st.building = false;
      tell(st, { type: 'preview', ...st.last });
      if (st.queued) { st.queued = false; buildPreview(name); }
    }
  }
  const schedulePreview = (name) => { const st = stateOf(name); clearTimeout(st.timer); st.timer = setTimeout(() => buildPreview(name), 350); };

  // ---------------------------------------------------------------- reading a gift
  async function summary(name) {
    const dir = join(GIFTS, name);
    const info = await stat(join(dir, 'gift.json'));
    try {
      const g = await prepareGift(dir);
      return { name, tier: g.config.meta.tier, theme: g.config.meta.theme, skin: g.config.meta.skin, recipient: g.config.people?.recipient ?? '', nights: g.config.days.length, media: Object.keys(g.slots).length, errors: g.report.errors.length, warnings: g.report.warnings.length, updatedAt: info.mtimeMs };
    } catch (e) {
      return { name, broken: true, errors: 1, message: e.report?.errors?.[0] ?? e.message, updatedAt: info.mtimeMs };
    }
  }

  const mediaList = (name, slots, usedIds) => Object.values(slots).map((s) => ({
    id: s.id, type: s.type, name: s.name, size: s.size,
    url: `/gift-media/${name}/${encodeURIComponent(s.name)}`,
    posterUrl: s.poster ? `/gift-media/${name}/${encodeURIComponent(basename(s.poster))}` : null,
    used: usedIds.has(s.id),
  }));
  const usedIdsOf = (config) => new Set([...JSON.stringify(config).matchAll(/"@([a-z0-9_]+)"/g)].map((m) => m[1]));

  async function giftState(name) {
    const dir = dirOf(name);
    let raw = null, rawError = null;
    const text = await readFile(join(dir, 'gift.json'), 'utf8');
    try { raw = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { rawError = e.message; }
    const scan = await scanMedia(join(dir, 'media'));
    let config = null, report = { errors: [], warnings: [], notes: [] };
    try { const g = await prepareGift(dir); config = g.config; report = g.report; } catch (e) { if (e instanceof GiftError) report = e.report; else throw e; }
    const st = stateOf(name);
    return {
      name, raw, rawError, rawText: rawError ? text : undefined, config, report,
      media: mediaList(name, scan.slots, usedIdsOf(config ?? raw ?? {})), mediaIssues: scan.issues,
      preview: st.last ?? { status: 'none' },
    };
  }

  // ---------------------------------------------------------------- saving
  async function saveConfig(name, config) {
    const dir = dirOf(name);
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new HttpError(400, 'A gift needs to be an object.');
    const file = join(dir, 'gift.json');
    // keep what was there, so nothing is ever lost by a click
    const hist = join(dir, '.history');
    await mkdir(hist, { recursive: true });
    await copyFile(file, join(hist, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)).catch(() => {});
    const old = (await readdir(hist)).sort();
    for (const f of old.slice(0, Math.max(0, old.length - HISTORY_KEEP))) await rm(join(hist, f), { force: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`);
    await rename(tmp, file);
    schedulePreview(name);
  }

  // ---------------------------------------------------------------- the routes
  const routes = [];
  const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:([a-z]+)/g, '(?<$1>[^/]+)')}$`), handler });

  route('GET', '/api/catalog', async () => {
    const catalog = await loadCatalog();
    const read = async (kind, id) => JSON.parse(await readFile(join(ROOT, kind, id, `${kind === 'skins' ? 'skin' : 'theme'}.json`), 'utf8'));
    return {
      tiers: [
        { id: 'spark', name: 'Spark', nights: 0 },
        { id: 'countdown', name: 'Countdown', nights: 5 },
        { id: 'signature', name: 'Signature', nights: 10 },
      ],
      themes: await Promise.all(catalog.themes.map(async (id) => { const m = await read('themes', id); return { id, name: m.name, description: m.description, mood: m.mood }; })),
      skins: await Promise.all(catalog.skins.filter((id) => !id.startsWith('_')).map(async (id) => { const m = await read('skins', id); return { id, name: m.name, description: m.description, mood: m.mood, preview: m.preview ? `/repo/skins/${id}/${m.preview}` : null, themes: catalog.skinWorlds[id] }; })),
      finaleVariants: FINALE_VARIANTS, optionalRoles: OPTIONAL_ROLES, progressOrder: PROGRESS_ORDER, requiredRoles: REQUIRED_ROLES,
      limits: Object.fromEntries(Object.entries(LIMITS).map(([k, v]) => [k, { warn: v.warn, error: v.error }])),
    };
  });

  route('GET', '/api/gifts', async () => {
    const names = (await readdir(GIFTS, { withFileTypes: true })).filter((e) => e.isDirectory() && existsSync(join(GIFTS, e.name, 'gift.json'))).map((e) => e.name);
    const list = await Promise.all(names.map(summary));
    return { gifts: list.sort((a, b) => b.updatedAt - a.updatedAt) };
  });
  route('POST', '/api/gifts', async (req) => {
    try { const made = await createGift(await readJsonBody(req)); schedulePreview(made.name); return { name: made.name }; } catch (e) { throw new HttpError(400, e.message); }
  });
  route('GET', '/api/gifts/:n', async (req, res, p) => {
    const s = await giftState(p.n);
    // rebuild the preview only when it is missing or older than gift.json: a rebuild swaps the folder, and a page that is loading from it at that moment would miss files
    const st = stateOf(p.n);
    if (!st.last || (await stat(join(dirOf(p.n), 'gift.json'))).mtimeMs > st.last.at) schedulePreview(p.n);
    return s;
  });
  route('PUT', '/api/gifts/:n/config', async (req, res, p) => {
    await saveConfig(p.n, await readJsonBody(req));
    const s = await giftState(p.n);
    return { config: s.config, report: s.report, media: s.media };
  });

  route('PUT', '/api/gifts/:n/media/:file', async (req, res, p) => {
    const dir = dirOf(p.n);
    const media = join(dir, 'media');
    await mkdir(media, { recursive: true });
    const plan = await planMediaFile(media, decodeURIComponent(p.file));
    if (!plan.ok) throw new HttpError(415, plan.message);
    const limit = LIMITS[plan.kind].error;
    if (Number(req.headers['content-length'] ?? 0) > limit) throw new HttpError(413, `That file is too large for a ${plan.kind} (the limit is ${limit / 1048576} MB). Compress or trim it.`);
    const tmp = `${plan.path}.part`;
    await new Promise((ok, fail) => {
      let size = 0;
      const out = createWriteStream(tmp);
      req.on('data', (c) => { size += c.length; if (size > limit) { out.destroy(); req.destroy(); fail(new HttpError(413, 'That file is too large.')); } });
      req.on('error', fail); out.on('error', fail); out.on('finish', ok);
      req.pipe(out);
    }).catch(async (e) => { await rm(tmp, { force: true }); throw e; });
    if ((await stat(tmp)).size === 0) { await rm(tmp, { force: true }); throw new HttpError(400, 'The file is empty.'); }
    await rename(tmp, plan.path);
    schedulePreview(p.n);
    const scan = await scanMedia(media);
    return { slot: plan.slot, kind: plan.kind, issues: scan.issues.filter((i) => i.file === plan.target || i.file.startsWith(plan.slot)) };
  });
  route('DELETE', '/api/gifts/:n/media/:slot', async (req, res, p) => {
    const dir = dirOf(p.n);
    const { slots } = await scanMedia(join(dir, 'media'));
    const slot = slots[p.slot];
    if (!slot) throw new HttpError(404, 'There is no such file in the gift.');
    await rm(slot.file, { force: true });
    if (slot.poster) await rm(slot.poster, { force: true });
    schedulePreview(p.n);
    return { removed: p.slot };
  });

  route('POST', '/api/gifts/:n/build', async (req, res, p) => {
    const dir = dirOf(p.n);
    const slug = await slugFor(dir);
    try {
      const r = await buildGift({ giftDir: dir, outDir: join(DIST, slug), zip: true });
      return { slug, folder: r.outDir, zip: r.zipPath, zipUrl: `/download/${slug}.zip`, files: r.files, bytes: r.bytes, report: r.report };
    } catch (e) { if (e instanceof GiftError) throw new HttpError(422, e.message, { report: e.report }); throw e; }
  });
  route('POST', '/api/gifts/:n/phone', async (req, res, p) => {
    dirOf(p.n);
    const st = stateOf(p.n);
    if (!st.lan) {
      await buildPreview(p.n);
      for (let tryPort = 5180; tryPort < 5200 && !st.lan; tryPort++) {
        try { st.lan = await serveFolder(() => st.dir, { port: tryPort }); st.lanPort = tryPort; } catch { /* port taken: try the next */ }
      }
    }
    if (!st.lan) throw new HttpError(500, 'Could not open a port for the phone preview.');
    const lan = lanAddress();
    return { url: lan ? `http://${lan}:${st.lanPort}/` : null, local: `http://localhost:${st.lanPort}/`, noWifi: !lan };
  });
  route('POST', '/api/open', async (req) => {
    const { path } = await readJsonBody(req);
    const target = resolve(String(path ?? ''));
    if (![DIST, GIFTS].some((base) => target === base || target.startsWith(base + sep))) throw new HttpError(403, 'That folder is not part of the studio.');
    openExternal(target);
    return { ok: true };
  });

  // ---------------------------------------------------------------- the server
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      guard(req, boundPort());
      // ---- live channels
      let m = /^\/api\/gifts\/([a-z0-9-]+)\/events$/.exec(url.pathname);
      if (m) {
        const st = stateOf(m[1]);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify({ type: 'preview', ...(st.last ?? { status: 'none' }) })}\n\n`);
        st.uiClients.add(res); req.on('close', () => st.uiClients.delete(res));
        return;
      }
      m = /^\/preview\/([a-z0-9-]+)\/__reload$/.exec(url.pathname);
      if (m) {
        const st = stateOf(m[1]);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write('retry: 1000\n\n');
        st.reloadClients.add(res); req.on('close', () => st.reloadClients.delete(res));
        return;
      }
      // ---- the API
      if (url.pathname.startsWith('/api/')) {
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const hit = r.re.exec(url.pathname);
          if (hit) return json(res, 200, await r.handler(req, res, hit.groups ?? {}, url));
        }
        throw new HttpError(404, 'Unknown request.');
      }
      // ---- files
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Not allowed.');
      if ((m = /^\/download\/([a-z0-9]+)\.zip$/.exec(url.pathname))) {
        const file = join(DIST, `${m[1]}.zip`);
        if (!existsSync(file)) throw new HttpError(404, 'Nothing built yet.');
        res.setHeader('Content-Disposition', `attachment; filename="gift-${m[1]}.zip"`);
        return await sendFile(req, res, file);
      }
      if ((m = /^\/gift-media\/([a-z0-9-]+)\/(.+)$/.exec(url.pathname))) return await sendFile(req, res, safeJoin(join(dirOf(m[1]), 'media'), decodeURIComponent(m[2])));
      if ((m = /^\/preview\/([a-z0-9-]+)(\/.*)?$/.exec(url.pathname))) {
        if (!m[2]) { res.writeHead(302, { Location: `/preview/${m[1]}/${url.search}` }).end(); return; }
        const st = stateOf(m[1]);
        if (!st.last) { clearTimeout(st.timer); await buildPreview(m[1]); }
        for (let i = 0; i < 100 && st.building && !st.dir; i++) await new Promise((r) => setTimeout(r, 100)); // a build is already running: wait for it
        if (!st.dir) {
          // the gift has problems the preview cannot get past yet: say so inside the frame instead of showing a broken page
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          return void res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;height:100vh;background:#111;color:#eee;font:16px system-ui;text-align:center;padding:24px">The preview cannot be shown until the problems in the gift are fixed.</body>');
        }
        return await sendFile(req, res, safeJoin(st.dir, decodeURIComponent(m[2] === '/' ? '/index.html' : m[2])));
      }
      if ((m = /^\/repo\/(.+)$/.exec(url.pathname))) {
        const rel = decodeURIComponent(m[1]);
        if (!REPO_DIRS.has(rel.split('/')[0])) throw new HttpError(403, 'Not available.');
        return await sendFile(req, res, safeJoin(ROOT, rel));
      }
      const asset = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/ui\//, '');
      return await sendFile(req, res, safeJoin(UI, decodeURIComponent(asset)));
    } catch (e) {
      if (e instanceof HttpError) return json(res, e.status, { error: e.message, ...e.extra });
      if (e.code === 'ENOENT' || /not a file/.test(e.message)) return json(res, 404, { error: 'Not found.' });
      console.error(e);
      return json(res, 500, { error: 'Something went wrong in the studio. Check the terminal for details.' });
    }
  });

  const bound = { port };
  const boundPort = () => bound.port;
  await new Promise((ok, fail) => {
    const tryListen = (n) => {
      server.once('error', (e) => (e.code === 'EADDRINUSE' && n < 10 ? tryListen(n + 1) : fail(e)));
      bound.port = port + n;
      server.listen(bound.port, '127.0.0.1', ok);
    };
    tryListen(0);
  });
  const address = `http://localhost:${bound.port}/`;
  console.log(`\nGift studio is open:  ${address}\n  Your gifts are in  ${GIFTS}\n  Press Ctrl+C to close it.\n`);
  if (open) openExternal(address);
  return { server, port: bound.port, url: address, close: () => new Promise((r) => { for (const st of previews.values()) { for (const c of [...st.uiClients, ...st.reloadClients]) c.end(); st.lan?.close(); } server.close(r); }) };
}

/** Only this computer may talk to the studio, and a write must come from the studio's own page (see the header at the top). */
function guard(req, port) {
  const host = (req.headers.host ?? '').toLowerCase();
  if (host !== `localhost:${port}` && host !== `127.0.0.1:${port}`) throw new HttpError(403, 'The studio only answers on this computer.');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.origin;
    if (req.headers['x-studio'] !== '1') throw new HttpError(403, 'That request did not come from the studio.');
    if (origin && origin !== `http://localhost:${port}` && origin !== `http://127.0.0.1:${port}`) throw new HttpError(403, 'That request came from another website.');
  }
}

function safeJoin(base, rel) {
  const root = resolve(base);
  const file = normalize(join(root, rel));
  if (file !== root && !file.startsWith(root + sep)) throw new HttpError(403, 'Forbidden');
  return file;
}

function openExternal(target) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', target]] : process.platform === 'darwin' ? ['open', [target]] : ['xdg-open', [target]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* the address is printed anyway */ }
}
