// The built backend behind a small HTTP server that behaves like a deployed Apps Script web app, for browser tests:
//   GET/POST /exec     the web app: always HTTP 200 with JSON, permissive CORS on the answer, and NO answer to a CORS preflight
//                      (the real thing does not do preflights, so a storefront that sends a non-simple request fails here as it would there)
//   /ctl/...           test controls: a bank email arrives, time moves, the clock ticks, look at the state
import http from 'node:http';
import { createBackend, DEFAULT_SETTINGS } from './gas-mock.mjs';

// A page for trying the whole flow by hand: it plays the parts of the bank and of time.
const PANEL = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Backend emulator</title>
<style>body{font:15px system-ui;max-width:760px;margin:20px auto;padding:0 14px}button{font:inherit;padding:10px 14px;margin:4px 6px 4px 0}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left;font-size:13px}pre{background:#f4f4f4;padding:10px;white-space:pre-wrap}</style>
<h1>Backend emulator</h1>
<p>The real backend code, with a pretend Google. Buy a gift on the site, then play the bank and the clock here.</p>
<p><button onclick="go('/ctl/pay-latest')">The bank email arrives for the latest order</button>
<button onclick="go('/ctl/advance?ms=330000')">Time passes: 5.5 minutes</button>
<button onclick="go('/ctl/tick')">Run the one-minute clock</button></p>
<p id="msg"></p><h2>Orders</h2><div id="orders"></div><h2>Emails sent</h2><div id="mail"></div>
<script>
async function go(p){const r=await (await fetch(p,{method:p.includes('bank')?'POST':'GET'})).json();document.getElementById('msg').textContent=JSON.stringify(r);refresh();}
async function refresh(){const s=await (await fetch('/ctl/state')).json();
document.getElementById('orders').innerHTML='<table><tr><th>id</th><th>product</th><th>amount</th><th>state</th><th>email</th></tr>'+s.orders.map(o=>'<tr><td>'+o.id+'</td><td>'+o.productId+'</td><td>'+(o.amount/100).toFixed(2)+'</td><td><b>'+o.state+'</b></td><td>'+o.email+'</td></tr>').join('')+'</table>';
document.getElementById('mail').innerHTML=s.outbox.slice().reverse().map(m=>'<pre><b>To: '+m.to+'</b>\n'+m.subject+'\n\n'+m.body+'</pre>').join('')||'none yet';}
refresh();setInterval(refresh,2000);
</script>`;

export async function startEmulator({ port, siteUrl }) {
  const backend = await createBackend({ settings: { ...DEFAULT_SETTINGS, SITE_URL: siteUrl }, startTime: Date.now() });
  backend.sandbox.setup();
  backend.world.props.set('MIN_SECONDS', '2'); // browser tests should not wait 15 seconds for "I have paid"
  let offset = 0;
  const sync = () => { backend.world.clock.now = Date.now() + offset; };

  const body = (req) => new Promise((resolve) => { let t = ''; req.on('data', (c) => { t += c; }); req.on('end', () => resolve(t)); });
  const json = (res, code, obj, cors = false) => {
    res.writeHead(code, { 'Content-Type': 'application/json', ...(cors ? { 'Access-Control-Allow-Origin': '*' } : {}) });
    res.end(JSON.stringify(obj));
  };

  const server = http.createServer(async (req, res) => {
    sync();
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/exec') {
      if (req.method === 'OPTIONS') { res.writeHead(405); res.end(); return; } // no preflight support, like Apps Script
      const out = req.method === 'POST'
        ? backend.sandbox.doPost({ postData: { contents: await body(req) } })
        : backend.sandbox.doGet({ parameter: Object.fromEntries(url.searchParams) });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(out.text);
      return;
    }
    if (url.pathname === '/ctl/pay-latest') {
      const open = backend.sheet('Orders').filter((o) => ['awaiting_payment', 'provisional', 'revoked'].includes(o.state)).at(-1);
      if (!open) return json(res, 200, { ok: false, message: 'No order is waiting for payment.' });
      backend.bankEmail({ amountPaise: open.amount, utr: String(Math.floor(1e11 + Math.random() * 9e11)) });
      backend.tick();
      return json(res, 200, { ok: true, order: open.id });
    }
    if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PANEL); return; }
    if (url.pathname === '/ctl/bank-email') { backend.bankEmail(JSON.parse(await body(req))); return json(res, 200, { ok: true }); }
    if (url.pathname === '/ctl/advance') { offset += Number(url.searchParams.get('ms')); sync(); return json(res, 200, { ok: true }); }
    if (url.pathname === '/ctl/tick') { return json(res, 200, { ok: true, result: backend.tick() }); }
    if (url.pathname === '/ctl/state') {
      return json(res, 200, {
        orders: backend.sheet('Orders'), drafts: backend.sheet('Drafts'), media: backend.sheet('Media'), credits: backend.sheet('Credits'),
        outbox: backend.world.outbox, files: [...backend.world.files.values()].map((f) => ({ ...f, bytes: f.bytes.length })),
      });
    }
    json(res, 404, { ok: false });
  });
  await new Promise((resolve) => server.listen(port, resolve));
  return { backend, url: `http://localhost:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}
