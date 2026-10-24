// The database: one Google Sheet, one tab per table. Everything is stored as text (the sheet is set to plain text, so a phone number
// like +919876543210 or a UTR is never turned into a number or a formula) and converted back by the column's type.
//
//   const orders = rows_('Orders');            // [{ id, state, amount, ... }, ...] each with a hidden _row
//   add_('Orders', { id: 'o_1', ... });
//   patch_('Orders', order, { state: 'paid' });

// column name -> type: 's' text, 'n' number, 'j' JSON
const TABLES = {
  Orders: { id: 's', productId: 's', options: 'j', baseAmount: 'n', amount: 'n', state: 's', createdAt: 'n', claimedAt: 'n', remindedAt: 'n', paidAt: 'n', revokedAt: 'n', slug: 's', phone: 's', email: 's', utr: 's', draftId: 's', contactKey: 's' },
  Drafts: { id: 's', token: 's', productId: 's', createdAt: 'n' },
  Media: { id: 's', draftId: 's', type: 's', driveId: 's', bytes: 'n', mime: 's', createdAt: 'n' },
  Credits: { messageId: 's', receivedAt: 'n', amount: 'n', utr: 's', orderId: 's', decision: 's' },
  Events: { at: 'n', orderId: 's', type: 's', detail: 's' },
};

function spreadsheet_() {
  return SpreadsheetApp.openById(requireProp_('SHEET_ID'));
}

/** Make sure every tab exists with its header row and plain-text cells. Safe to run again. */
function ensureTables_(ss) {
  for (const [name, columns] of Object.entries(TABLES)) {
    const names = Object.keys(columns);
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    sheet.getRange(1, 1, sheet.getMaxRows(), names.length).setNumberFormat('@');
    sheet.getRange(1, 1, 1, names.length).setValues([names]);
  }
}

function parse_(type, raw) {
  if (type === 'n') return raw === '' || raw === null || raw === undefined ? 0 : Number(raw);
  if (type === 'j') return raw === '' || raw === null || raw === undefined ? null : JSON.parse(raw);
  return raw === null || raw === undefined ? '' : String(raw);
}

const serialise_ = (type, value) => (value === undefined || value === null ? '' : type === 'j' ? JSON.stringify(value) : String(value));

function rows_(name) {
  const columns = TABLES[name];
  const names = Object.keys(columns);
  const sheet = spreadsheet_().getSheetByName(name);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, names.length).getValues().map((row, i) => {
    const out = { _row: i + 2 };
    names.forEach((col, c) => { out[col] = parse_(columns[col], row[c]); });
    return out;
  });
}

function add_(name, record) {
  const columns = TABLES[name];
  const names = Object.keys(columns);
  const sheet = spreadsheet_().getSheetByName(name);
  const row = names.map((col) => serialise_(columns[col], record[col]));
  const at = sheet.getLastRow() + 1;
  sheet.getRange(at, 1, 1, names.length).setValues([row]);
  return { ...record, _row: at };
}

/** Change some fields of an existing row (the row you got from rows_). Returns the updated record. */
function patch_(name, record, changes) {
  const columns = TABLES[name];
  const names = Object.keys(columns);
  const next = { ...record, ...changes };
  const sheet = spreadsheet_().getSheetByName(name);
  sheet.getRange(record._row, 1, 1, names.length).setValues([names.map((col) => serialise_(columns[col], next[col]))]);
  return next;
}

/** An append-only log: what happened to which order. Makes every problem traceable. */
function log_(orderId, type, detail) {
  try { add_('Events', { at: now_(), orderId: orderId || '', type, detail: String(detail ?? '').slice(0, 500) }); } catch (e) { Logger.log(`log failed: ${e}`); }
}

const find_ = (name, field, value) => rows_(name).find((r) => r[field] === value) || null;

/** Run `fn` with the script-wide lock, so two requests never hand out the same unique amount or settle the same payment twice. */
function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}
