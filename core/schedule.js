// Unlock logic. Pure functions - easy to test with a mocked `now`.

/** Today's date (YYYY-MM-DD) in a given IANA timezone. */
export function todayIn(tz, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso, locale = 'en') {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

/**
 * Status of item `index`.
 * mode: 'all' (everything open) | 'sequential' (needs previous done) | 'date' (startDate + index, in tz)
 * flags: boolean[] of completed items.
 * Returns { status: 'locked'|'open'|'done', unlocksOn?: ISO date, waitingForPrevious?: true }
 */
export function itemStatus({ mode, startDate, tz = 'UTC', now = new Date(), index, flags }) {
  if (flags[index]) return { status: 'done' };
  if (mode === 'all') return { status: 'open' };
  if (mode === 'sequential') {
    return index === 0 || flags[index - 1] ? { status: 'open' } : { status: 'locked', waitingForPrevious: true };
  }
  const unlocksOn = addDays(startDate, index);
  return todayIn(tz, now) >= unlocksOn ? { status: 'open' } : { status: 'locked', unlocksOn };
}
