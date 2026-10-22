// Music - a small player for the customer's own tracks (audio slots, never third-party files).
// Playback starts only when the recipient taps play (browsers block autoplay). Tracks advance automatically;
// after the last one it stops. A track that cannot play shows a readable message and can be skipped.
import { part } from '../../../core/util.js';

/** 83.4 -> "1:23" */
const clock = (s) => (Number.isFinite(s) && s >= 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

export default {
  id: 'music',
  kind: 'app',
  version: 1,
  layout: new URL('./style.css', import.meta.url).href,
  parts: ['player', 'cover', 'now-title', 'now-artist', 'controls', 'prev', 'play', 'next', 'seek', 'elapsed', 'duration', 'message', 'track-list', 'track'],
  layoutParts: ['player', 'controls', 'track-list'],
  copy: {
    play: 'Play',
    pause: 'Pause',
    prev: 'Previous song',
    next: 'Next song',
    seek: 'Position in the song',
    tracks: 'Playlist',
    loading: 'Loading the song...',
    error: '"{{title}}" would not play. You can skip to the next one.',
    pickOne: 'Pick a song and press play.',
  },
  paramsSchema: {
    type: 'object',
    required: ['tracks'],
    properties: {
      tracks: {
        type: 'array', minItems: 1, maxItems: 12,
        items: {
          type: 'object', required: ['title', 'src'],
          properties: {
            title: { type: 'string', minLength: 1 },
            artist: { type: 'string' },
            src: { type: 'string', pattern: '^@[A-Za-z0-9_-]+$' }, // an audio slot, e.g. "@track_01"
          },
        },
      },
    },
  },
  placeholderParams: {
    tracks: [
      { title: 'Slow Orbit', artist: 'Placeholder Band', src: '@track_01' },
      { title: 'Porch Light', artist: 'Placeholder Band', src: '@track_02' },
      { title: 'Small Hours', artist: 'Placeholder Band', src: '@track_03' },
    ],
  },

  mount(container, ctx) {
    const tracks = ctx.params.tracks;
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    let index = Math.min(Math.max(Number(ctx.store.get('track', 0)) || 0, 0), tracks.length - 1);
    let loadToken = 0; // ignores a slow asset lookup when the listener already moved on
    let ready = false;

    const cover = part('div', 'cover', { 'aria-hidden': 'true' });
    const nowTitle = part('h3', 'now-title');
    const nowArtist = part('p', 'now-artist');
    const prev = part('button', 'prev', { type: 'button', 'aria-label': ctx.t('prev') }, '⏮');
    const play = part('button', 'play', { type: 'button', 'data-variant': 'primary', 'data-state': 'paused', 'aria-label': ctx.t('play') }, '▶');
    const next = part('button', 'next', { type: 'button', 'aria-label': ctx.t('next') }, '⏭');
    const seek = part('input', 'seek', { type: 'range', min: '0', max: '1000', value: '0', step: '1', 'aria-label': ctx.t('seek'), disabled: true });
    const elapsed = part('span', 'elapsed', { 'aria-hidden': 'true' }, clock(0));
    const duration = part('span', 'duration', { 'aria-hidden': 'true' }, clock(0));
    const message = part('p', 'message', { role: 'status', 'aria-live': 'polite' }, ctx.t('pickOne'));
    const rows = tracks.map((t, i) => {
      const row = part('button', 'track', { type: 'button', 'data-state': 'idle', 'aria-label': t.artist ? `${t.title}, ${t.artist}` : t.title }, `${i + 1}. ${t.title}`);
      row.addEventListener('click', () => load(i, true));
      return row;
    });
    const trackList = part('div', 'track-list', { role: 'group', 'aria-label': ctx.t('tracks') }, rows);
    const player = part('div', 'player', { 'data-state': 'idle' }, cover, nowTitle, nowArtist,
      part('div', 'controls', {}, prev, play, next),
      part('div', 'controls', {}, elapsed, seek, duration),
      message);
    container.append(player, trackList);

    const playing = () => !audio.paused && !audio.ended;

    /** One place that paints everything that depends on "which track" and "playing or not". */
    function render() {
      const t = tracks[index];
      nowTitle.textContent = t.title;
      nowArtist.textContent = t.artist ?? '';
      play.dataset.state = playing() ? 'playing' : 'paused';
      play.setAttribute('aria-label', playing() ? ctx.t('pause') : ctx.t('play'));
      play.textContent = playing() ? '⏸' : '▶';
      if (player.dataset.state !== 'error') player.dataset.state = playing() ? 'playing' : 'idle';
      rows.forEach((row, i) => { row.dataset.state = i !== index ? 'idle' : playing() ? 'playing' : 'current'; row.setAttribute('aria-current', i === index ? 'true' : 'false'); });
    }

    async function load(i, autoplay) {
      const token = ++loadToken;
      index = i;
      ctx.store.set('track', i);
      ready = false;
      audio.pause();
      seek.disabled = true;
      seek.value = '0';
      elapsed.textContent = clock(0);
      duration.textContent = clock(0);
      player.dataset.state = 'idle';
      message.textContent = ctx.t('loading');
      render();
      try {
        const asset = await ctx.assets.resolve(tracks[i].src, { type: 'audio' });
        if (token !== loadToken) return;
        audio.src = asset.url;
        audio.load();
        message.textContent = '';
        if (autoplay) await audio.play();
      } catch {
        if (token !== loadToken) return;
        fail();
      }
    }

    function fail() {
      player.dataset.state = 'error';
      message.textContent = ctx.t('error', { title: tracks[index].title });
      ctx.onFail({ reason: 'track_unplayable', track: index });
      render();
    }

    play.addEventListener('click', async () => {
      if (playing()) { audio.pause(); return; }
      if (!audio.src) { await load(index, true); return; }
      try { await audio.play(); } catch { fail(); }
    });
    prev.addEventListener('click', () => load((index - 1 + tracks.length) % tracks.length, playing() || player.dataset.state === 'error'));
    next.addEventListener('click', () => load((index + 1) % tracks.length, playing() || player.dataset.state === 'error'));
    seek.addEventListener('input', () => { if (ready) audio.currentTime = (Number(seek.value) / 1000) * audio.duration; });

    audio.addEventListener('loadedmetadata', () => { ready = true; seek.disabled = false; duration.textContent = clock(audio.duration); });
    audio.addEventListener('timeupdate', () => {
      elapsed.textContent = clock(audio.currentTime);
      if (ready && audio.duration) {
        seek.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
        seek.setAttribute('aria-valuetext', `${clock(audio.currentTime)} / ${clock(audio.duration)}`);
      }
    });
    audio.addEventListener('play', render);
    audio.addEventListener('pause', render);
    audio.addEventListener('error', () => { if (audio.src) fail(); });
    audio.addEventListener('ended', () => {
      if (index < tracks.length - 1) { load(index + 1, true); return; }
      audio.currentTime = 0; // last song: stop and rewind
      render();
    });

    const onKey = (e) => {
      if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('button, input, textarea, select')) return;
      e.preventDefault();
      play.click();
    };
    document.addEventListener('keydown', onKey);

    render();
    return {
      destroy() {
        loadToken++;
        document.removeEventListener('keydown', onKey);
        audio.pause();
        audio.removeAttribute('src');
        audio.load(); // releases the media resource
      },
    };
  },
};
