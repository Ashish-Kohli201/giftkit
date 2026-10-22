// REVIEW: "Check and send". What is still wrong, a look at the whole gift, a short checklist, then build and deliver it.
// Problems come from the server's check (store.current.report); every one has a button that jumps to the screen that fixes it.
import { api } from '../api.js';
import { MODE_INFO, TIER_INFO, addDays, longDate } from '../catalog.js';
import { btn, clear, copyText, h, icon, modal, plural, toast, formatBytes, humanize } from '../ui-kit.js';

const AREAS = {
  setup: { label: 'Setup', step: 'setup' },
  media: { label: 'Media', step: 'media' },
  nights: { label: 'Nights', step: 'nights' },
  room: { label: 'The room', step: 'room' },
  ending: { label: 'The ending', step: 'ending' },
};

/** Which screen fixes a message? The message starts with where in the gift it is ("night 3 (quiz) ...", "apps.music ...", "media/x.jpg: ..."). */
export function areaOf(message) {
  const m = String(message);
  if (/no file with that name|media folder|media\/|is not a picture|is not a song|is not a video|needs a picture/i.test(m)) return 'media';
  if (/^night \d+|^days|^text:|^story/i.test(m)) return 'nights';
  if (/^(meta|people|schedule)/i.test(m)) return 'setup';
  if (/^(apps|scene|roles)/i.test(m)) return 'room';
  if (/^finale/i.test(m)) return 'ending';
  return 'setup';
}

/** The warnings a careful person must not miss (sample names, text that still says "Write your ..."). */
const important = (m) => /sample names|still look like instructions/i.test(m);

const CHECKLIST = [
  ['nights', 'I played through every night'],
  ['phone', 'I opened it on a real phone'],
  ['words', 'I read every message out loud'],
  ['ending', 'The ending made me smile'],
];

/** Last build per gift, kept while the studio page stays open, so leaving and coming back still shows it. */
const builds = new Map();

export default {
  id: 'review', title: 'Review', hint: 'Check and send',
  render(root, { store, goStep }) {
    const name = store.current.name;
    const report = () => store.current.report ?? { errors: [], warnings: [], notes: [] };
    const rawNow = () => JSON.stringify(store.current.raw ?? {});
    let building = false;
    let buildProblems = null;

    // ---------------------------------------------------------------- status header
    const status = h('section.rv-status');
    const paintStatus = () => {
      const r = report();
      const bad = r.errors.length, warn = r.warnings.length;
      const kind = bad ? 'bad' : warn ? 'warn' : 'good';
      status.className = `rv-status rv-status-${kind}`;
      status.replaceChildren(
        h('span.rv-status-icon', {}, icon(bad ? 'alert' : 'check', 30)),
        h('div', {},
          h('h1', {}, bad ? `${plural(bad, 'thing')} to fix first` : warn ? 'Ready, with a few things worth a look' : 'Ready to send'),
          h('p', {}, bad ? 'The gift cannot be built until these are fixed. Each one has a button that takes you to the right place.'
            : warn ? 'You can build it now. The notes below are things a careful person would still want to read.'
              : 'Everything checks out. Look through the list below, then build it.')));
    };

    // ---------------------------------------------------------------- problems
    const problems = h('div.rv-problems');
    const group = (list) => {
      const out = new Map();
      for (const msg of list) { const a = areaOf(msg); out.set(a, [...(out.get(a) ?? []), msg]); }
      return out;
    };
    const item = (msg, kind) => {
      const area = AREAS[areaOf(msg)];
      return h(`li.rv-item.rv-item-${kind}`, {},
        h('span.rv-item-icon', {}, icon(kind === 'bad' ? 'alert' : 'info', 18)),
        h('span.rv-item-text', {}, msg),
        btn(`Go to ${area.label}`, { small: true, icon: 'arrowRight', onClick: () => goStep(area.step) }));
    };
    const section = (title, list, kind, { open = true, lead } = {}) => {
      if (!list.length) return null;
      const body = [];
      if (lead) body.push(h('p.muted.rv-lead', {}, lead));
      for (const [area, msgs] of group(list)) {
        body.push(h('div.rv-group', {}, h('h4', {}, `${AREAS[area].label} `, h('span.badge.badge-neutral', {}, String(msgs.length))), h('ul.rv-list', {}, msgs.map((m) => item(m, kind)))));
      }
      return h('details.rv-section', { open }, h('summary', {}, h('h2', {}, title), h(`span.badge.badge-${kind === 'bad' ? 'bad' : kind === 'warn' ? 'warn' : 'neutral'}`, {}, String(list.length))), body);
    };
    const paintProblems = () => {
      const r = report();
      const warnings = [...r.warnings.filter(important), ...r.warnings.filter((w) => !important(w))];
      clear(problems).append(...[
        section('Fix these', r.errors, 'bad'),
        section('Worth a look', warnings, 'warn', { lead: important(warnings[0] ?? '') ? 'The first ones are easy to forget and would be embarrassing to send.' : undefined }),
        section('What the studio did for you', r.notes.map((n) => n), 'note', { open: false }),
      ].filter(Boolean));
      if (!r.errors.length && !r.warnings.length && !r.notes.length) problems.append(h('p.muted', {}, 'Nothing to report.'));
    };

    // ---------------------------------------------------------------- a look at the gift
    const summary = h('section.card.rv-summary');
    const paintSummary = () => {
      const cur = store.current;
      const c = cur.config ?? cur.raw ?? {};
      const { themes, skins } = store.catalog;
      const meta = c.meta ?? {};
      const nights = (c.days ?? []);
      const counts = { image: 0, audio: 0, video: 0 };
      for (const m of cur.media ?? []) counts[m.type] = (counts[m.type] ?? 0) + 1;
      const files = [counts.image && plural(counts.image, 'picture'), counts.audio && plural(counts.audio, 'song'), counts.video && plural(counts.video, 'video')].filter(Boolean).join(', ') || 'none yet';
      const sch = c.schedule ?? {};
      let when = MODE_INFO[sch.mode]?.text ?? '';
      if (sch.mode === 'date' && sch.startDate && sch.finaleDate) when = `${nights.length ? `Night 1 opens ${longDate(sch.startDate)}, night ${nights.length} on ${longDate(addDays(sch.startDate, nights.length - 1))}, and ` : ''}the surprise opens ${longDate(sch.finaleDate)}.`;
      const variant = c.finale?.variant ?? 'scroll';
      const row = (k, v) => h('div.rv-row', {}, h('dt', {}, k), h('dd', {}, v));
      clear(summary).append(h('h2', {}, 'A look at the gift'), h('dl.rv-dl', {},
        row('For', `${c.people?.recipient || '(no name yet)'}, from ${c.people?.sender || '(no name yet)'}`),
        row('Size', `${TIER_INFO[meta.tier]?.title ?? meta.tier} - ${TIER_INFO[meta.tier]?.line ?? ''}`),
        row('World and look', `${themes.find((t) => t.id === meta.theme)?.name ?? meta.theme} in ${skins.find((s) => s.id === meta.skin)?.name ?? meta.skin}`),
        row('Nights', nights.length ? `${plural(nights.length, 'night')}: ${nights.map((d) => humanize(d.game?.type ?? '?')).join(', ')}` : 'none'),
        row('Files', files),
        row('The ending', `${humanize(variant)} style, ${c.finale?.type === 'reveal' ? 'opens straight away' : 'opens with a vault code'}`),
        row('Opens', when || 'as the recipient goes')));
    };

    // ---------------------------------------------------------------- checklist
    const key = `studio-review-${name}`;
    const loadChecks = () => { try { return JSON.parse(localStorage.getItem(key) ?? '{}'); } catch { return {}; } };
    const saveChecks = (v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: the list just will not be remembered */ } };
    const checks = loadChecks();
    async function showPhone() {
      try {
        const r = await api.post(`/api/gifts/${name}/phone`);
        const body = h('div', { style: { display: 'grid', gap: '12px' } },
          r.url ? [h('p', {}, 'On your phone, connected to the same Wi-Fi as this computer, open this address:'),
            h('div.rv-phone-url', {}, r.url),
            h('p.muted', {}, 'It updates by itself as you make changes. If it does not open, allow Node.js through the Windows firewall for private networks, and check the phone is not on mobile data or a guest network.')]
            : h('p', {}, 'This computer does not seem to be on a Wi-Fi network, so a phone cannot reach it. Connect to Wi-Fi and try again.'));
        const m = modal({ title: 'See it on your phone', body, actions: [r.url ? btn('Copy address', { icon: 'copy', onClick: () => copyText(r.url) }) : null, btn('Done', { variant: 'primary', onClick: () => m.close() })].filter(Boolean) });
      } catch (e) { toast(e.message, 'error'); }
    }
    const checklist = h('section.card.rv-checklist', {}, h('h2', {}, 'Before you send'), h('p.muted', {}, 'Just a reminder for you. Nothing here stops you.'),
      h('ul.rv-checks', {}, CHECKLIST.map(([id, label]) => h('li', {},
        h('label.rv-check', {}, h('input', { type: 'checkbox', checked: !!checks[id], onchange: (e) => { checks[id] = e.target.checked; saveChecks(checks); } }), h('span', {}, label)),
        id === 'phone' ? btn('Show me the address', { small: true, icon: 'phone', onClick: showPhone }) : null))));

    // ---------------------------------------------------------------- build
    const buildBox = h('section.card.rv-build');
    const resultBox = h('div.rv-result-host');
    async function build() {
      building = true; buildProblems = null; paintBuild();
      try {
        await store.flush();
        const r = await api.post(`/api/gifts/${name}/build`);
        builds.set(name, { ...r, snapshot: rawNow(), at: Date.now() });
      } catch (e) {
        buildProblems = e.report ?? { errors: [e.message], warnings: [], notes: [] };
        toast(e.report ? 'The gift cannot be built yet.' : e.message, 'error');
      } finally { building = false; paintBuild(); }
    }
    async function openFolder(path) { try { await api.post('/api/open', { path }); } catch (e) { toast(e.message, 'error'); } }

    const steps = (slug) => h('ol.rv-steps', {},
      h('li', {}, h('strong', {}, 'Easiest: Netlify Drop. '), 'Go to ', h('b', {}, 'app.netlify.com/drop'), ' and drag the zip onto the page. It gives you a link. Send that link.'),
      h('li', {}, h('strong', {}, 'Cloudflare Pages. '), 'Create a project with "Upload assets" and upload the zip (or the folder). Send the link it gives you.'),
      h('li', {}, h('strong', {}, 'Any web host. '), `Upload the folder so its files end up under /${slug}/ on your site. The link is then https://your-site/${slug}/`),
      h('li', {}, h('strong', {}, 'Then play it once. '), 'Open the link on a phone, turned sideways, and play it from the start before you send it.'));

    const paintBuild = () => {
      const r = report();
      const last = builds.get(name);
      const blocked = r.errors.length > 0;
      clear(buildBox);
      buildBox.append(h('h2', {}, 'Build the gift'),
        h('p.muted', {}, 'This makes the finished gift: one folder (and a zip) that opens on any phone and works on any web host.'),
        h('div.rv-build-row', {},
          btn(building ? 'Building...' : last ? 'Build again' : 'Build the gift', { variant: 'primary', icon: building ? null : 'gift', disabled: blocked || building, onClick: build }),
          building ? h('span.rv-spinner', { role: 'status', 'aria-label': 'Building' }) : null));
      if (blocked) buildBox.append(h('p.rv-reason', {}, `Fix the ${plural(r.errors.length, 'problem')} above first.`));
      if (buildProblems) {
        buildBox.append(h('div.callout.callout-bad', {}, icon('alert'), h('div', {}, h('strong', {}, 'The gift could not be built. '), h('ul.rv-list', {}, (buildProblems.errors ?? []).map((m) => item(m, 'bad'))))));
      }
      if (last) {
        const stale = last.snapshot !== rawNow();
        const url = `/${last.slug}/`;
        buildBox.append(h('div.rv-result', {},
          h('div.rv-result-head', {}, h('span.rv-result-icon', {}, icon('check', 22)), h('div', {}, h('h3', {}, 'Your gift is ready'), h('p.muted', {}, `${plural(last.files, 'file')}, ${formatBytes(last.bytes)}`)),
            stale ? badge('Older than your latest changes') : null),
          h('dl.rv-dl', {},
            h('div.rv-row', {}, h('dt', {}, 'Its private link'), h('dd', {}, h('code', {}, url), btn('', { variant: 'ghost', small: true, icon: 'copy', title: 'Copy the link path', onClick: () => copyText(url) }),
              h('p.muted.rv-small', {}, 'Anyone who has this link can open the gift, and nobody else can find it: the name is random and search engines are told to ignore it.'))),
            h('div.rv-row', {}, h('dt', {}, 'The zip'), h('dd', {}, h('code', {}, last.zip), btn('', { variant: 'ghost', small: true, icon: 'copy', title: 'Copy the zip path', onClick: () => copyText(last.zip) })))),
          h('div.rv-actions', {}, h('a.btn.btn-primary', { href: last.zipUrl, download: `gift-${last.slug}.zip` }, icon('download', 18), h('span', {}, 'Download the zip')),
            btn('Show me the folder', { icon: 'folder', onClick: () => openFolder(last.folder) })),
          h('h3.rv-h3', {}, 'How to put it online'), steps(last.slug)));
      }
    };
    function badge(text) { return h('span.badge.badge-warn.rv-stale', {}, text); }

    // ---------------------------------------------------------------- put it together
    const paintAll = () => { paintStatus(); paintProblems(); paintSummary(); paintBuild(); };
    root.append(
      h('div.page-head', {}, h('h2.rv-kicker', {}, 'Review'), h('p', {}, 'Check the gift, then build it and send the link.')),
      status, problems, summary, checklist, buildBox, resultBox);
    paintAll();
    store.refreshDerived().catch(() => {});
    const stops = [store.on('report', paintAll), store.on('edit', paintBuild), store.on('media', paintSummary)];
    return () => stops.forEach((s) => s());
  },
};
