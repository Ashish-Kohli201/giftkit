// AssetResolver: the ONLY way elements get file URLs. Elements never build URLs themselves.
// An encrypted / signed-URL resolver can replace this later without touching any element.
//
// resolve("@photo_01") -> Promise<{ id, type, url, alt, poster? }>
// resolve("@track_01", { type: 'audio' }) -> same shape; in preview mode an audio request with no real file gets a
// generated, original placeholder tune instead of a picture.
import { seededRandom } from './util.js';

const isSafeRelative = (src) =>
  typeof src === 'string' && src.length > 0 && !src.includes('..') && !src.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(src);

export function createResolver({ assets = {}, base = typeof location !== 'undefined' ? location.href : 'http://localhost/', placeholders = false } = {}) {
  return {
    async resolve(ref, opts = {}) {
      const id = String(ref).replace(/^@/, '');
      const slot = assets[id];
      const wantsAudio = opts.type === 'audio' || slot?.type === 'audio';
      if (slot?.src && isSafeRelative(slot.src)) {
        return {
          id,
          type: slot.type || 'image',
          url: new URL(slot.src, base).href,
          alt: slot.alt || '',
          poster: slot.poster && isSafeRelative(slot.poster) ? new URL(slot.poster, base).href : undefined,
        };
      }
      if (placeholders) return wantsAudio ? placeholderAudio(id, slot) : placeholderAsset(id, slot);
      throw new Error(`Asset slot "${id}" is missing or has an unsafe path`);
    },
  };
}

// Generated gradient "photo" so previews never contain real customer content.
function placeholderAsset(id, slot) {
  const hue = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 380"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 60% 55%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 55% 28%)"/></linearGradient></defs><rect width="300" height="380" fill="url(#g)"/><circle cx="215" cy="95" r="34" fill="rgba(255,255,255,.35)"/><path d="M0 380V270l90-70 80 60 60-40 70 50v110z" fill="rgba(0,0,0,.28)"/></svg>`;
  return { id, type: 'image', url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, alt: slot?.alt || 'Placeholder photo' };
}

// ---------------------------------------------------------------------------------------------------------------------
// Placeholder audio: a soft, original pentatonic arpeggio, synthesized into a mono 16-bit WAV. Deterministic per slot id,
// so a preview always sounds the same. No third-party audio anywhere.
export const WAV_RATE = 11025;
export const WAV_SECONDS = 10;
const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];
const STEPS = [1, 2, -1, 3, -2]; // how far each note moves along the scale

/** Returns the bytes of a WAV file (44-byte header + samples). */
export function placeholderWav(id) {
  const rand = seededRandom(`wav:${id}`);
  const total = WAV_RATE * WAV_SECONDS;
  const noteLen = Math.floor(WAV_RATE * 0.5);
  const tail = noteLen * 2; // each note rings for two note lengths and overlaps the next
  const mix = new Float32Array(total);
  let degree = Math.floor(rand() * PENTATONIC.length);
  for (let start = 0; start < total; start += noteLen) {
    degree = (((degree + STEPS[Math.floor(rand() * STEPS.length)]) % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length;
    const f = PENTATONIC[degree];
    for (let i = 0; i < tail && start + i < total; i++) {
      const t = i / WAV_RATE;
      const envelope = Math.exp(-t * 4.5) * Math.min(1, i / (WAV_RATE * 0.01)); // quick soft attack, gentle decay
      mix[start + i] += (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * 2 * f * t)) * envelope * 0.3;
    }
  }
  const bytes = new Uint8Array(44 + total * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset, str) => [...str].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + total * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, WAV_RATE, true); view.setUint32(28, WAV_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, total * 2, true);
  const fadeFrom = total - Math.floor(WAV_RATE * 0.3);
  for (let i = 0; i < total; i++) {
    const fade = i > fadeFrom ? (total - i) / (total - fadeFrom) : 1;
    view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, mix[i] * fade)) * 32767), true);
  }
  return bytes;
}

function placeholderAudio(id, slot) {
  const bytes = placeholderWav(id);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { id, type: 'audio', url: `data:audio/wav;base64,${btoa(binary)}`, alt: slot?.alt || 'Placeholder track' };
}
