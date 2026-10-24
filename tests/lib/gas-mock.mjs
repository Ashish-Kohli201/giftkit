// A stand-in for Google Apps Script's services, so the REAL built backend (backend/dist/Code.gs) can run in Node and be tested:
// Sheets, Gmail, Drive (with resumable uploads), MailApp, UrlFetchApp (Drive uploads and Telegram), properties, cache, locks, triggers.
//
// It proves our code's logic against how these services are documented to behave. It is NOT Google: a real deployment still has to be
// checked with selfTest() (see backend/README.md).
//
//   const backend = await createBackend({ settings: { UPI_VPA: ..., ... } });
//   backend.call('createDraft', { productId: 'cake' })      // POST, parsed
//   backend.get('status', { orderId })                      // GET, parsed
//   backend.bankEmail({ amountPaise: 14937, utr: '...' })   // a credit alert lands in the inbox
//   backend.tick(); backend.advance(6 * 60 * 1000);
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { buildBackend } from '../../scripts/build-backend.mjs';

const CHUNK = 6 * 256 * 1024;

export async function createBackend({ settings = {}, startTime = Date.UTC(2026, 9, 24, 10, 0, 0) } = {}) {
  const world = {
    clock: { now: startTime },
    outbox: [], inbox: [], telegram: [], logs: [], triggers: [],
    props: new Map(), cache: new Map(),
    spreadsheets: new Map(), folders: new Map(), files: new Map(), sessions: new Map(),
    failMail: false, failDrive: false,
  };

  // ---------------------------------------------------------------- time
  class MockDate extends Date {
    constructor(...args) { if (args.length === 0) super(world.clock.now); else super(...args); }
    static now() { return world.clock.now; }
  }

  // ---------------------------------------------------------------- Sheets
  class Sheet {
    constructor(name) { this.name = name; this.rows = []; }
    getMaxRows() { return 1000; }
    getLastRow() { let n = this.rows.length; while (n > 0 && (this.rows[n - 1] || []).every((v) => v === '' || v === undefined)) n -= 1; return n; }
    getRange(r, c, nr = 1, nc = 1) {
      const sheet = this;
      return {
        setNumberFormat() { return this; },
        setValues(values) { values.forEach((row, i) => { sheet.rows[r - 1 + i] ||= []; row.forEach((v, j) => { sheet.rows[r - 1 + i][c - 1 + j] = v; }); }); return this; },
        getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (sheet.rows[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })); },
      };
    }
  }
  class Spreadsheet {
    constructor(name) { this.name = name; this.id = `sheet_${randomUUID().slice(0, 8)}`; this.sheets = new Map(); }
    getId() { return this.id; }
    getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}`; }
    getSheetByName(n) { return this.sheets.get(n) || null; }
    insertSheet(n) { const s = new Sheet(n); this.sheets.set(n, s); return s; }
  }

  // ---------------------------------------------------------------- Gmail
  const message = (m) => ({
    getId: () => m.id, getFrom: () => m.from, getSubject: () => m.subject, getPlainBody: () => m.body, getDate: () => new Date(m.date),
  });
  const GmailApp = {
    search(query, start = 0, max = 50) {
      const from = /from:\(([^)]*)\)/.exec(query)?.[1].split(/\s+OR\s+/).map((s) => s.trim().toLowerCase()) ?? [];
      const days = Number(/newer_than:(\d+)d/.exec(query)?.[1] ?? 36500);
      return world.inbox
        .filter((m) => (!from.length || from.some((f) => m.from.toLowerCase().includes(f))) && world.clock.now - m.date <= days * 86400000)
        .slice(start, start + max)
        .map((m) => ({ getMessages: () => [message(m)] }));
    },
  };

  // ---------------------------------------------------------------- Drive and UrlFetchApp (resumable uploads, Telegram)
  const response = (code, body = '', headers = {}) => ({ getResponseCode: () => code, getContentText: () => body, getHeaders: () => headers });
  const UrlFetchApp = {
    fetch(url, opts = {}) {
      if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable')) {
        if (world.failDrive) return response(500, 'drive down');
        const meta = JSON.parse(opts.payload);
        const session = `https://upload.example/session/${world.sessions.size + 1}`;
        world.sessions.set(session, { name: meta.name, parents: meta.parents, mime: opts.headers['X-Upload-Content-Type'], total: Number(opts.headers['X-Upload-Content-Length']), received: 0, chunks: [] });
        return response(200, '', { Location: session });
      }
      if (url.startsWith('https://upload.example/session/')) {
        const s = world.sessions.get(url);
        if (!s) return response(404, 'no such session');
        const [, a, b, total] = /bytes (\d+)-(\d+)\/(\d+)/.exec(opts.headers['Content-Range']);
        const bytes = opts.payload;
        if (Number(a) !== s.received || Number(b) - Number(a) + 1 !== bytes.length || Number(total) !== s.total) return response(400, 'bad range');
        s.received += bytes.length;
        s.chunks.push(bytes);
        if (s.received < s.total) return response(308, '', { Range: `bytes=0-${s.received - 1}` });
        const id = `file_${world.files.size + 1}`;
        world.files.set(id, { id, name: s.name, mime: s.mime, bytes: [].concat(...s.chunks), shared: false, folder: s.parents[0] });
        return response(200, JSON.stringify({ id }));
      }
      if (url.startsWith('https://api.telegram.org/')) { world.telegram.push(JSON.parse(opts.payload)); return response(200, '{"ok":true}'); }
      throw new Error(`unexpected fetch ${url}`);
    },
  };
  const DriveApp = {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
    createFolder(name) { const id = `folder_${world.folders.size + 1}`; world.folders.set(id, name); return { getId: () => id }; },
    getFileById(id) { const f = world.files.get(id); if (!f) throw new Error('no such file'); return { setSharing(access, perm) { f.shared = access === 'ANYONE_WITH_LINK' && perm === 'VIEW'; } }; },
  };

  // ---------------------------------------------------------------- the rest
  const properties = {
    getProperty: (k) => (world.props.has(k) ? world.props.get(k) : null),
    setProperty(k, v) { world.props.set(k, String(v)); },
  };
  const sandbox = {
    console, Date: MockDate, JSON, Math, Object, Array, Number, String, Set, Map, Error, RegExp, Promise, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    Logger: { log: (m) => world.logs.push(String(m)) },
    PropertiesService: { getScriptProperties: () => properties },
    CacheService: {
      getScriptCache: () => ({
        get(k) { const e = world.cache.get(k); return e && e.until > world.clock.now ? e.value : null; },
        put(k, v, seconds = 600) { world.cache.set(k, { value: String(v), until: world.clock.now + seconds * 1000 }); },
        remove(k) { world.cache.delete(k); },
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    Utilities: {
      getUuid: () => randomUUID(),
      base64Decode: (s) => [...Buffer.from(String(s), 'base64')].map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (b) => Buffer.from(typeof b === 'string' ? b : b.map((x) => (x < 0 ? x + 256 : x))).toString('base64'),
    },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (text) => ({ text, setMimeType(m) { this.mime = m; return this; } }) },
    MailApp: { sendEmail(o) { if (world.failMail) throw new Error('mail quota'); world.outbox.push(o); }, getRemainingDailyQuota: () => world.mailQuota ?? 100 },
    GmailApp, UrlFetchApp, DriveApp,
    SpreadsheetApp: {
      create(name) { const s = new Spreadsheet(name); world.spreadsheets.set(s.id, s); return s; },
      openById(id) { const s = world.spreadsheets.get(id); if (!s) throw new Error('no such spreadsheet'); return s; },
    },
    ScriptApp: {
      getOAuthToken: () => 'token',
      getProjectTriggers: () => world.triggers.map((t) => ({ getHandlerFunction: () => t.fn, id: t })),
      deleteTrigger(t) { world.triggers = world.triggers.filter((x) => x !== t.id); },
      newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (n) => ({ create() { world.triggers.push({ fn, every: n }); } }) }) }),
    },
  };
  vm.createContext(sandbox);
  const { code } = await buildBackend();
  vm.runInContext(code, sandbox, { filename: 'Code.gs' });
  // the editor's settings_() is the one thing a person edits; a test edits it the same way
  vm.runInContext(`settings_ = function () { return ${JSON.stringify(settings)}; };`, sandbox);

  const parse = (out) => JSON.parse(out.text);
  const backend = {
    world, sandbox,
    call: (action, payload = {}) => parse(sandbox.doPost({ postData: { contents: JSON.stringify({ action, ...payload }) } })),
    callRaw: (text) => parse(sandbox.doPost({ postData: { contents: text } })),
    get: (action, params = {}) => parse(sandbox.doGet({ parameter: { action, ...params } })),
    tick: () => { const r = sandbox.tick(); return r === null || r === undefined ? r : JSON.parse(JSON.stringify(r)); },
    advance(ms) { world.clock.now += ms; },
    /** A bank credit alert arrives in the inbox (worded like a typical UPI credit email). */
    bankEmail({ amountPaise, utr, from = 'alerts@hdfcbank.net', body, subject = 'You have received a UPI credit', ageMs = 0 }) {
      const text = body ?? `Dear Customer, Rs. ${(amountPaise / 100).toFixed(2)} has been credited to your account XX1234 on 24-10-26 via UPI. UPI Ref No ${utr}. Thank you for banking with us.`;
      world.inbox.push({ id: `msg_${world.inbox.length + 1}`, from, subject, body: text, date: world.clock.now - ageMs });
    },
    /** Upload a file the way the storefront does: start, then chunks of CHUNK bytes. Returns the media id. */
    upload(draft, { type = 'image', mime = 'image/png', bytes }) {
      const start = backend.call('uploadStart', { draftId: draft.id, token: draft.token, type, mime, bytes: bytes.length });
      if (!start.ok) return start;
      let offset = 0;
      let last;
      while (offset < bytes.length) {
        const slice = bytes.subarray(offset, offset + start.chunkBytes);
        last = backend.call('uploadChunk', { uploadId: start.uploadId, token: draft.token, offset, data: Buffer.from(slice).toString('base64') });
        if (!last.ok) return last;
        offset += slice.length;
      }
      return last;
    },
    // values made inside the sandbox have the sandbox's own Array and Object, which deepEqual refuses: copy them into plain ones
    sheet(name) { return JSON.parse(JSON.stringify(sandbox.rows_(name))); },
    plain: (value) => JSON.parse(JSON.stringify(value)),
    CHUNK,
  };
  return backend;
}

export const DEFAULT_SETTINGS = {
  UPI_VPA: 'shop@okhdfcbank', UPI_NAME: 'Spark Gifts', OWNER_EMAIL: 'owner@example.com', BANK_SENDER: 'alerts@hdfcbank.net',
  SITE_URL: 'https://shop.example/giftkit', BRAND: 'Spark', SUPPORT_NOTE: 'reply to this email',
};
