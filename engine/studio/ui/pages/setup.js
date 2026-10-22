// SETUP: who the gift is for, when it opens, how big it is, and how it looks.
// Every control edits gift.json straight away (the live preview beside it follows), and every choice can be changed later.
import { MODE_INFO, TIER_INFO, TIMEZONES, addDays, longDate } from '../catalog.js';
import { badge, confirmBox, field, h, icon, input, plural, select } from '../ui-kit.js';

export default {
  id: 'setup', title: 'Setup', hint: 'Who, when and the look',
  render(root, { store, goStep }) {
    const raw = () => store.current.raw;
    const { themes, skins } = store.catalog;
    const nights = () => (raw().days ?? []).length;

    // ---------------------------------------------------------------- who
    const recipient = input({ value: raw().people?.recipient ?? '', placeholder: 'Her name', autocomplete: 'off', oninput: (e) => store.edit((d) => { (d.people ??= {}).recipient = e.target.value; }, { coalesce: 'recipient' }) });
    const sender = input({ value: raw().people?.sender ?? '', placeholder: 'Your name', autocomplete: 'off', oninput: (e) => store.edit((d) => { (d.people ??= {}).sender = e.target.value; }, { coalesce: 'sender' }) });
    const who = h('section.section', {},
      h('header', {}, h('h2', {}, 'Who is it for?'), h('p', {}, 'These names appear all through the gift, wherever you write {{recipient}} and {{sender}}.')),
      h('div.grid-2', {}, field('Her name', recipient), field('Your name', sender)));

    // ---------------------------------------------------------------- when
    const schedule = () => raw().schedule ?? { mode: 'sequential' };
    const setSchedule = (fn, key) => store.edit((d) => { d.schedule = { mode: 'sequential', ...d.schedule }; fn(d.schedule); }, { coalesce: key });
    const summary = h('div.callout');
    const dateFields = h('div.grid-2');
    const modeCards = h('div.choices');
    const paintWhen = () => {
      const s = schedule();
      modeCards.replaceChildren(...Object.entries(MODE_INFO).map(([id, m]) => h('button.choice', {
        type: 'button', 'aria-pressed': String(s.mode === id),
        onclick: () => { setSchedule((x) => { x.mode = id; if (id === 'date' && !x.finaleDate) { /* dates are filled in below */ } }); paintWhen(); },
      }, h('strong', {}, m.title), h('span.muted', {}, m.text))));
      dateFields.replaceChildren();
      summary.replaceChildren();
      summary.hidden = s.mode !== 'date';
      if (s.mode !== 'date') return;
      const n = Math.max(nights(), 1);
      const birthday = input({ type: 'date', value: s.finaleDate ?? '', oninput: (e) => { if (!e.target.value) return; setSchedule((x) => { x.finaleDate = e.target.value; x.startDate = addDays(e.target.value, -n); }, 'birthday'); paintSummary(); startInput.value = addDays(e.target.value, -n); } });
      const startInput = input({ type: 'date', value: s.startDate ?? '', oninput: (e) => { if (e.target.value) { setSchedule((x) => { x.startDate = e.target.value; }, 'start'); paintSummary(); } } });
      const zone = select(TIMEZONES.includes(raw().meta?.timezone) ? TIMEZONES : [raw().meta?.timezone ?? 'UTC', ...TIMEZONES], { value: raw().meta?.timezone ?? 'Asia/Kolkata', onchange: (e) => store.edit((d) => { d.meta.timezone = e.target.value; }) });
      dateFields.append(field('The birthday (the surprise opens)', birthday, { hint: 'The last page of the gift opens on this day.' }),
        field('First night opens', startInput, { hint: `Set for you: ${plural(n, 'night')} before the birthday.` }),
        field('Their time zone', zone, { hint: 'A night opens at midnight in this time zone.' }));
      paintSummary();
    };
    const paintSummary = () => {
      const s = schedule();
      const n = nights();
      summary.className = 'callout';
      summary.replaceChildren(icon('info'));
      if (!s.startDate || !s.finaleDate) { summary.append(h('div', {}, 'Pick the birthday and the nights count back from it.')); return; }
      const lastNight = n ? addDays(s.startDate, n - 1) : s.startDate;
      const clash = n && lastNight >= s.finaleDate;
      if (clash) summary.classList.add('callout-warn');
      summary.append(h('div', {}, n ? `Night 1 opens ${longDate(s.startDate)}, night ${n} on ${longDate(lastNight)}, and the surprise on ${longDate(s.finaleDate)}.` : `The surprise opens on ${longDate(s.finaleDate)}.`,
        clash ? h('p', {}, `That is too tight: the last night would not be over before the surprise. Move the first night earlier.`) : null));
    };
    const when = h('section.section', {},
      h('header', {}, h('h2', {}, 'When does it open?'), h('p', {}, 'Choose how the nights are given out.')),
      modeCards, dateFields, summary);
    paintWhen();

    // ---------------------------------------------------------------- how big
    const tierCards = h('div.choices.choices-3');
    const paintTier = () => {
      const cur = raw().meta?.tier;
      tierCards.replaceChildren(...Object.entries(TIER_INFO).map(([id, t]) => h('button.choice.choice-big', {
        type: 'button', 'aria-pressed': String(cur === id),
        onclick: async () => {
          if (cur === id) return;
          if (id === 'spark' && nights() > 0 && !(await confirmBox({ title: 'Switch to Spark?', message: `Spark has no nights, so your ${plural(nights(), 'night')} will be set aside (they are kept in the file, and come back if you switch back).`, confirm: 'Switch to Spark' }))) return;
          store.edit((d) => { d.meta.tier = id; d.finale ??= {}; if (id === 'spark') d.finale.type = 'reveal'; else if (d.finale.type === 'reveal') d.finale.type = 'vault'; });
          paintTier(); paintWhen(); paintHint();
        },
      }, icon(t.icon, 24), h('strong', {}, t.title), h('span.choice-line', {}, t.line), h('p.muted', {}, t.text), h('ul.choice-points', {}, t.bullets.map((b) => h('li', {}, b))))));
    };
    const tierHint = h('div.callout.callout-warn', { hidden: true });
    const paintHint = () => {
      const tier = raw().meta?.tier;
      const n = nights();
      tierHint.hidden = !(tier !== 'spark' && n === 0);
      tierHint.replaceChildren(icon('alert'), h('div', {}, h('strong', {}, 'This size needs nights. '), 'Add them in the ', h('button.linklike', { type: 'button', onclick: () => goStep('nights') }, 'Nights step'), '.'));
    };
    const size = h('section.section', {}, h('header', {}, h('h2', {}, 'How big is the gift?'), h('p', {}, 'Bigger gifts have more to discover. The same story can be made at any size.')), tierCards, tierHint);
    paintTier(); paintHint();

    // ---------------------------------------------------------------- look
    const worldCards = h('div.choices');
    const skinCards = h('div.choices');
    const lookNote = h('div.callout.callout-warn', { hidden: true });
    const paintLook = () => {
      const { theme, skin } = raw().meta ?? {};
      worldCards.replaceChildren(...themes.map((t) => h('button.choice', { type: 'button', 'aria-pressed': String(theme === t.id), onclick: () => { store.edit((d) => { d.meta.theme = t.id; }); paintLook(); } },
        h('strong', {}, t.name), h('span.muted', {}, t.description.split('. ')[0] + '.'), h('span.choice-moods', {}, (t.mood ?? []).map((m) => h('span.chip', {}, m))))));
      skinCards.replaceChildren(...skins.map((s) => h('button.choice', { type: 'button', 'aria-pressed': String(skin === s.id), onclick: () => { store.edit((d) => { d.meta.skin = s.id; }); paintLook(); } },
        s.preview ? h('img', { src: s.preview, alt: '', width: 180, height: 112 }) : null, h('strong', {}, s.name), h('span.muted', {}, s.description.split('. ')[0] + '.'),
        h('span.choice-moods', {}, (s.mood ?? []).map((m) => h('span.chip', {}, m))))));
      const chosen = skins.find((s) => s.id === skin);
      const plain = chosen && theme && !(chosen.themes ?? []).includes(theme);
      lookNote.hidden = !plain;
      lookNote.replaceChildren(icon('alert'), h('div', {}, `${chosen?.name} has no artwork for the ${themes.find((t) => t.id === theme)?.name} world yet, so it will look plain there. Pick another look or world.`));
    };
    const look = h('section.section', {}, h('header', {}, h('h2', {}, 'How does it look?'), h('p', {}, 'The world is where it takes place; the look is its colours, sounds and feel. Any look works in any world. Watch the preview change.')),
      h('div.field', {}, h('label', {}, 'The world'), worldCards), h('div.field', {}, h('label', {}, 'The look'), skinCards), lookNote);
    paintLook();

    root.append(h('div.page-head', {}, h('h1', {}, 'Set up the gift'), h('p', {}, 'Start here. None of this is final: change anything at any time and the preview follows.')), who, size, when, look);
    return () => {};
  },
};
