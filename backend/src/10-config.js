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

/** Random lowercase letters and digits, from two UUIDs so it cannot be guessed. */
function token_(length) {
  const pool = (Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  return pool.slice(0, length);
}

const SITE_ = () => requireProp_('SITE_URL').replace(/\/$/, '');
const BRAND_ = () => prop_('BRAND', 'Spark');
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
