// The web door and the owner's tools. Deployed as a web app ("Execute as: me", "Who has access: anyone"), the storefront calls it:
//   GET  <exec-url>?action=status&orderId=...        reads
//   POST <exec-url>   body: JSON text { action: 'createOrder', ... }   writes
// Apps Script cannot read request headers or send an HTTP error code, so every answer is HTTP 200 with JSON { ok: true, ... } or
// { ok: false, message }, and the storefront sends its POST as text/plain (a "simple" request, so the browser does not need a CORS preflight).

const ACTIONS = {
  createDraft: createDraft_,
  uploadStart: uploadStart_,
  uploadChunk: uploadChunk_,
  createOrder: createOrder_,
  claim: claim_,
  status: status_,
  gift: gift_,
};
const READ_ONLY = { status: true, gift: true };

function respond_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(action, payload, viaGet) {
  const run = ACTIONS[action];
  if (!run) return { ok: false, message: 'Unknown request.' };
  if (viaGet && !READ_ONLY[action]) return { ok: false, message: 'Unknown request.' };
  try {
    const result = run(payload);
    return result && result.ok === false ? result : { ok: true, ...result };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, message: e.message };
    log_('', 'error', `${action}: ${e && e.stack ? e.stack : e}`);
    return { ok: false, message: 'Something went wrong. Nothing was charged. Please try again.' };
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.action) return respond_({ ok: true, service: 'spark-backend', time: now_() });
  return respond_(handle_(p.action, p, true));
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return respond_({ ok: false, message: 'That request was not understood.' }); }
  return respond_(handle_(body.action, body, false));
}

// ---------------------------------------------------------------- owner tools: run these from the Apps Script editor

/** Run once, after filling in 00-settings: creates the sheet and the Drive folder, stores the settings, and starts the every-minute clock. */
function setup() {
  const s = settings_();
  const props = PropertiesService.getScriptProperties();
  for (const key of ['UPI_VPA', 'UPI_NAME', 'BANK_SENDER', 'SITE_URL']) if (!s[key] && !prop_(key, '')) throw new Error(`Fill in ${key} in 00-settings first.`);
  for (const [key, value] of Object.entries(s)) if (value) props.setProperty(key, value);
  if (!/^[a-z0-9._-]{2,}@[a-z][a-z0-9]+$/i.test(prop_('UPI_VPA', ''))) throw new Error('UPI_VPA does not look like a UPI ID (name@bank).');

  if (!prop_('SHEET_ID', '')) props.setProperty('SHEET_ID', SpreadsheetApp.create(`${BRAND_()} backend`).getId());
  if (!prop_('FOLDER_ID', '')) props.setProperty('FOLDER_ID', DriveApp.createFolder(`${BRAND_()} gift files`).getId());
  ensureTables_(spreadsheet_());

  for (const t of ScriptApp.getProjectTriggers()) if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t);
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(1).create();

  const summary = { sheet: spreadsheet_().getUrl(), ownerEmail: ownerEmail_(), bankSenders: bankSenders_(), site: SITE_(), clock: 'every minute' };
  Logger.log(`Setup done:\n${JSON.stringify(summary, null, 2)}\nNext: deploy as a web app and put its URL into site/config.js (api).`);
  return summary;
}

/**
 * Run after setup(): checks that every Google service the backend needs really works, using this account.
 * It writes a test row, uploads a tiny file to Drive the same way a customer's photo is, reads your Gmail, and emails you.
 */
function selfTest() {
  const report = [];
  // each step either returns normally (passed) or throws (failed, with the reason)
  const step = (name, fn) => {
    try { fn(); report.push(`OK    ${name}`); } catch (e) { report.push(`FAIL  ${name}: ${e}`); }
  };
  const need = (condition, message) => { if (!condition) throw new Error(message); };

  step('the settings are filled in', () => { for (const k of ['UPI_VPA', 'UPI_NAME', 'BANK_SENDER', 'SITE_URL', 'SHEET_ID', 'FOLDER_ID']) requireProp_(k); });
  step('the sheet opens and has its tabs', () => ensureTables_(spreadsheet_()));
  step('a row can be written and read back', () => {
    const written = add_('Events', { at: now_(), type: 'selftest', detail: 'hello' });
    need(rows_('Events').some((e) => e._row === written._row), 'the row did not come back');
  });
  step('the Drive folder takes an upload (the same resumable path as a photo)', () => {
    const draft = createDraft_({ productId: Object.keys(PRODUCTS)[0] });
    const png = Utilities.base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    const start = uploadStart_({ draftId: draft.id, token: draft.token, type: 'image', mime: 'image/png', bytes: png.length });
    const done = uploadChunk_({ uploadId: start.uploadId, token: draft.token, offset: 0, data: Utilities.base64Encode(png) });
    need(done.done, 'the upload did not finish');
  });
  step('Gmail can be searched for bank alerts', () => { GmailApp.search(`from:(${bankSenders_().join(' OR ')}) newer_than:30d`, 0, 1); });
  step('an email can be sent to you', () => MailApp.sendEmail({ to: ownerEmail_(), subject: `[${BRAND_()}] selfTest`, body: `If you can read this, sending mail works. Emails left today: ${MailApp.getRemainingDailyQuota()}.` }));
  step('there is room in the daily email quota (each order sends 2 to 4 emails)', () => need(MailApp.getRemainingDailyQuota() >= 20, `only ${MailApp.getRemainingDailyQuota()} emails left today`));
  step('the every-minute clock is installed', () => need(ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'tick'), 'no tick trigger: run setup()'));

  Logger.log(report.join('\n'));
  return report;
}
