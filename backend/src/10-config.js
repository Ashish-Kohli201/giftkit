// Configuration and small helpers shared by every other file. Everything is read from Script Properties (set by setup()).

/** A message safe to show a customer. Anything else that goes wrong is logged and the customer sees a generic line. */
class UserError extends Error {}

function prop_(name, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(name);
  return v === null || v === undefined || v === '' ? fallback : v;
}

function requireProp_(name) {
  const v = prop_(name, '');
  if (!v) throw new Error(`Setting ${name} is empty. Fill it in (00-settings) and run setup() again.`);
  return v;
}

const now_ = () => new Date().getTime();

/**
 * The clock's timings. Defaults are 5 minutes to the reminder and 10 to the revoke; REMIND_AFTER_MINUTES and REVOKE_AFTER_MINUTES in the
 * settings change them (2 and 3 are good while testing: the clock runs once a minute, so give it at least two looks before revoking).
 */
function rules_() {
  const minutes = (name, fallback) => { const n = Number(prop_(name, '')); return n > 0 ? n : fallback; };
  return {
    ...RULES,
    remindAfterMs: minutes('REMIND_AFTER_MINUTES', RULES.remindAfterMs / 60000) * 60000,
    revokeAfterMs: minutes('REVOKE_AFTER_MINUTES', RULES.revokeAfterMs / 60000) * 60000,
  };
}
const minutesText_ = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return `${m} minute${m === 1 ? '' : 's'}`; };

/** Random lowercase letters and digits, from two UUIDs so it cannot be guessed. */
function token_(length) {
  const pool = (Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  return pool.slice(0, length);
}

const SITE_ = () => requireProp_('SITE_URL').replace(/\/$/, '');
const BRAND_ = () => prop_('BRAND', 'Fondly');
const ownerEmail_ = () => prop_('OWNER_EMAIL', '') || Session.getEffectiveUser().getEmail();

/** The private address of a gift. The storefront's host page reads ?s=<slug> and asks this backend for the gift. */
const giftLink_ = (slug) => `${SITE_()}/host/index.html?s=${slug}`;

// ---------------------------------------------------------------- limits for uploads (by kind)
const UPLOAD_LIMITS = {
  image: { maxBytes: 8 * 1024 * 1024, mime: /^image\/(jpeg|png|webp|gif|avif)$/ },
  video: { maxBytes: 30 * 1024 * 1024, mime: /^video\/(mp4|webm|quicktime)$/ },
  audio: { maxBytes: 15 * 1024 * 1024, mime: /^audio\// },
};
const MAX_FILES_PER_DRAFT = 20;
// Drive's resumable upload wants every chunk but the last to be a multiple of 256 KB
const CHUNK_BYTES = 6 * 256 * 1024;

// ---------------------------------------------------------------- abuse limits
const MAX_CLAIMS_PER_CONTACT_PER_DAY = 3;
const MAX_REPLIES_PER_GIFT = 3;
const MAX_REPLY_CHARS = 600;
const MAX_OPEN_NOTICES = 2;
const GIFT_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000; // a gift link works for a year after the payment is confirmed
const IP_ADDRESS = /^[0-9a-fA-F:.]{3,45}$/;
