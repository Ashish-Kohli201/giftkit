// The clock: runs every minute. First it looks for payments (so one that has just arrived is never revoked), then it moves orders
// along: remind at 5 minutes, revoke at 10, and free the amount of an order nobody paid for.

function runClock_() {
  const now = now_();
  const rules = rules_();
  const done = { reminded: 0, revoked: 0, expired: 0 };
  locked_(() => {
    for (const order of rows_('Orders')) {
      const action = nextAction(order, now, rules);
      if (action === 'expire') { patch_('Orders', order, { state: 'expired' }); log_(order.id, 'expired', ''); done.expired += 1; }
      if (action === 'remind') { patch_('Orders', order, { remindedAt: now }); mailReminder_(order); log_(order.id, 'reminded', ''); done.reminded += 1; }
      if (action === 'revoke') {
        const revoked = patch_('Orders', order, { state: 'revoked', revokedAt: now });
        mailRevoked_(revoked);
        emailOwner_(`Revoked: ${revoked.id} ${rupees_(revoked.amount)}`, `No payment found for ${revoked.email}. If they did pay, markPaid('${revoked.id}', 'UTR') switches it back on.`);
        log_(revoked.id, 'revoked', '');
        done.revoked += 1;
      }
    }
  });
  return done;
}

/** The time-driven trigger calls this every minute. */
function tick() {
  const cache = CacheService.getScriptCache();
  if (cache.get('tick-running')) return null; // a previous run is still going: skip this minute
  cache.put('tick-running', '1', 300);
  try {
    // Apps Script gives a free account about 90 minutes of trigger time a day, and this runs 1440 times: with nothing waiting, stop at once
    const waiting = rows_('Orders').some((o) => isOpen({ state: o.state, createdAt: o.createdAt }, now_()));
    if (!waiting) return { settled: 0, unmatched: 0, idle: true };
    let bank = null;
    try { bank = scanBank_(); } catch (e) { reportFailure_('scanning the bank emails', e); }
    try { runClock_(); } catch (e) { reportFailure_('running the order clock', e); }
    return bank;
  } finally {
    cache.remove('tick-running');
  }
}

/** Record a failure and tell Telegram (never email: the owner is emailed only for a revoke), at most once an hour per kind. */
function reportFailure_(what, error) {
  Logger.log(`${what} failed: ${error}`);
  log_('', 'error', `${what}: ${error}`);
  const key = `failed:${what}`;
  const cache = CacheService.getScriptCache();
  if (cache.get(key)) return;
  cache.put(key, '1', 60 * 60);
  notify_(`Problem ${what}`, `${error}\n\nPayments may not be found until this is fixed. Check the Events tab in the sheet and run selfTest() in the Apps Script editor.`);
}
