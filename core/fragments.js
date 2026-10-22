// Key fragments: one character per day. Unique, unambiguous (no I/O/0/1), code derived in day order.
import { shuffle } from './util.js';

export const FRAGMENT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Returns one fragment per day. Honors explicit `fragment` values, auto-assigns the rest. Throws on duplicates / invalid chars. */
export function assignFragments(days, rand = Math.random) {
  const explicit = days.map((d) => d.fragment?.toUpperCase()).filter(Boolean);
  const bad = explicit.find((c) => c.length !== 1 || !FRAGMENT_ALPHABET.includes(c));
  if (bad) throw new Error(`Invalid fragment "${bad}". Use one of: ${FRAGMENT_ALPHABET}`);
  if (new Set(explicit).size !== explicit.length) throw new Error('Duplicate fragments in config');
  const pool = shuffle([...FRAGMENT_ALPHABET].filter((c) => !explicit.includes(c)), rand);
  if (pool.length < days.length - explicit.length) throw new Error('Too many days for the fragment alphabet');
  return days.map((d) => d.fragment?.toUpperCase() ?? pool.pop());
}

/** The vault code is never hardcoded - always derived from fragments in day order. */
export const deriveCode = (fragments) => fragments.join('');
