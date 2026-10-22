// THE STUDIO STATE: the gift being edited, saving, undo / redo, the live preview's status, and a tiny event bus.
//
// Screens do not re-render on every keystroke (that would steal focus). They build themselves once and listen for the
// events they care about:
//   'open'     a gift was loaded, or replaced by undo / redo: rebuild the screen
//   'edit'     something was changed (the top bar shows "Saving...")
//   'saved'    the change reached the file
//   'report'   the check report changed (problems / warnings / notes)
//   'media'    the media list changed
//   'preview'  the preview is building / ready / failed
//   'upload'   upload progress { name, loaded, total }, or null when done
import { api } from './api.js';
import { clone, debounce } from './ui-kit.js';

const listeners = {};
const UNDO_LIMIT = 100;
const COALESCE_MS = 1500;

export const store = {
  catalog: null,
  gifts: [],
  current: null, // { name, raw, rawError, rawText, config, report, media, mediaIssues, preview }
  saving: 'idle', // idle | saving | saved | error
  saveError: '',
  undoStack: [],
  redoStack: [],
  // on narrow windows the preview floats over the page, so it starts closed there
  ui: { night: 0, unlock: false, finale: '', frame: 'phone', previewOpen: typeof matchMedia === 'function' ? matchMedia('(min-width: 1181px)').matches : true },

  on(event, fn) { (listeners[event] ??= new Set()).add(fn); return () => listeners[event].delete(fn); },
  emit(event, data) { for (const fn of [...(listeners[event] ?? [])]) fn(data); },

  async init() {
    this.catalog = await api.get('/api/catalog');
    await this.loadGifts();
  },
  async loadGifts() { this.gifts = (await api.get('/api/gifts')).gifts; this.emit('gifts'); return this.gifts; },

  async openGift(name) {
    if (this.current?.name === name) return this.current;
    await this.flush();
    this.closeEvents();
    this.current = await api.get(`/api/gifts/${name}`);
    this.undoStack = []; this.redoStack = []; this.saving = 'idle';
    this.ui = { ...this.ui, night: 0, unlock: false, finale: '' };
    this.listenToPreview(name);
    this.emit('open', this.current);
    return this.current;
  },
  closeGift() { this.flush(); this.closeEvents(); this.current = null; },

  listenToPreview(name) {
    if (typeof EventSource !== 'function') return;
    this.events = new EventSource(`/api/gifts/${name}/events`);
    this.events.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (this.current?.name === name && d.type === 'preview') { this.current.preview = d; this.emit('preview', d); }
    };
  },
  closeEvents() { this.events?.close(); this.events = null; },

  // ---------------------------------------------------------------- editing
  /**
   * Change the gift. `fn` receives a copy of gift.json (the file as written, shorthands and all) and mutates it.
   * Rapid edits with the same `coalesce` key become one undo step (typing in a box is one step, not forty).
   */
  edit(fn, { coalesce } = {}) {
    const cur = this.current;
    if (!cur?.raw) return;
    const draft = clone(cur.raw);
    fn(draft);
    if (JSON.stringify(draft) === JSON.stringify(cur.raw)) return;
    const now = Date.now();
    const last = this.undoStack.at(-1);
    if (!(coalesce && last && last.key === coalesce && now - last.at < COALESCE_MS)) {
      this.undoStack.push({ raw: cur.raw, key: coalesce, at: now });
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    } else last.at = now;
    this.redoStack = [];
    cur.raw = draft;
    this.saving = 'saving';
    this.emit('edit');
    this.autosave();
  },
  undo() { const s = this.undoStack.pop(); if (!s || !this.current) return; this.redoStack.push({ raw: this.current.raw }); this.replaceRaw(s.raw); },
  redo() { const s = this.redoStack.pop(); if (!s || !this.current) return; this.undoStack.push({ raw: this.current.raw }); this.replaceRaw(s.raw); },
  replaceRaw(raw) { this.current.raw = raw; this.saving = 'saving'; this.emit('open', this.current); this.autosave(); },
  get canUndo() { return this.undoStack.length > 0; },
  get canRedo() { return this.redoStack.length > 0; },

  autosave: debounce(() => store.saveNow(), 700),
  async flush() { if (this.saving === 'saving' && this.current?.raw) { this.autosave.cancel(); await this.saveNow(); } },

  async saveNow() {
    const cur = this.current;
    if (!cur?.raw) return;
    this.saving = 'saving'; this.emit('edit');
    try {
      const r = await api.put(`/api/gifts/${cur.name}/config`, cur.raw);
      if (this.current !== cur) return;
      cur.config = r.config; cur.report = r.report; cur.media = r.media;
      this.saving = 'saved'; this.saveError = '';
      this.emit('saved'); this.emit('report'); this.emit('media');
    } catch (e) {
      this.saving = 'error'; this.saveError = e.message; this.emit('saved');
    }
  },

  /** Re-read the checked config, report and media (after an upload, say) without touching what the person is editing. */
  async refreshDerived() {
    const cur = this.current;
    if (!cur) return;
    const fresh = await api.get(`/api/gifts/${cur.name}`);
    if (this.current !== cur) return;
    Object.assign(cur, { config: fresh.config, report: fresh.report, media: fresh.media, mediaIssues: fresh.mediaIssues });
    this.emit('report'); this.emit('media');
  },

  // ---------------------------------------------------------------- media
  /** Upload files one after another. Resolves with [{ file, ok, error? }]. */
  async uploadMedia(files) {
    const results = [];
    for (const file of files) {
      try { await api.upload(this.current.name, file, (loaded, total) => this.emit('upload', { name: file.name, loaded, total })); results.push({ file, ok: true }); }
      catch (e) { results.push({ file, ok: false, error: e.message }); }
    }
    this.emit('upload', null);
    await this.refreshDerived();
    return results;
  },
  async removeMedia(slot) { await api.del(`/api/gifts/${this.current.name}/media/${slot}`); await this.refreshDerived(); },

  // ---------------------------------------------------------------- helpers for the screens
  get config() { return this.current?.config; },
  get problems() { return this.current?.report?.errors ?? []; },
  /** Media of one kind (image | audio | video), for pickers. */
  mediaOf(type) { return (this.current?.media ?? []).filter((m) => m.type === type); },
  /** Nights as they are in gift.json (the file as written), never the checked copy. */
  get nights() { return this.current?.raw?.days ?? []; },
};
