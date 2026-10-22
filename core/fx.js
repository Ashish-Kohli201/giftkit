// Declarative effects. A theme supplies a spec; core plays it (synth sound + particles + haptics).
// spec[event] = { sound?: number[] (Hz), wave?, gain?, step?, particles?: { glyphs[], colors[], count }, haptic?: number|number[] }
// Sounds are synthesized with WebAudio - no audio files, nothing copyrighted, nothing to download.
import { el, reducedMotion } from './util.js';

export function createFx(spec = {}, root = document.body, store) {
  let audio;

  function tone(notes = [], { wave = 'sine', gain = 0.06, step = 0.09 } = {}) {
    if (!notes.length || store?.get('muted', false)) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime;
      notes.forEach((freq, i) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        const at = t0 + i * step;
        o.type = wave;
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(gain, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + step * 2.2);
        o.connect(g).connect(audio.destination);
        o.start(at);
        o.stop(at + step * 2.4);
      });
    } catch { /* audio blocked - fine */ }
  }

  function burst(p, origin) {
    if (!p || reducedMotion()) return;
    const layer = el('div', { 'data-part': 'fx-layer', 'aria-hidden': 'true' });
    const r = origin?.getBoundingClientRect?.();
    const cx = r ? r.left + r.width / 2 : innerWidth / 2;
    const cy = r ? r.top + r.height / 2 : innerHeight / 2;
    const { glyphs = ['*'], colors = ['#fff'], count = 12 } = p;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const d = 60 + Math.random() * 110;
      const s = el('span', { 'data-part': 'particle' }, glyphs[i % glyphs.length]);
      s.style.cssText = `--x:${cx}px;--y:${cy}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--rot:${Math.round(Math.random() * 240 - 120)}deg;--c:${colors[i % colors.length]};--s:${12 + Math.round(Math.random() * 14)}px`;
      layer.append(s);
    }
    root.append(layer);
    setTimeout(() => layer.remove(), 1400);
  }

  const run = (name) => (origin) => {
    const s = spec[name];
    if (!s) return;
    tone(s.sound, s);
    burst(s.particles, origin);
    if (s.haptic) { try { navigator.vibrate?.(s.haptic); } catch { /* unsupported */ } }
  };

  return {
    success: run('success'), fail: run('fail'), unlock: run('unlock'), tap: run('tap'), reveal: run('reveal'),
    setMuted: (v) => store?.set('muted', !!v),
  };
}
