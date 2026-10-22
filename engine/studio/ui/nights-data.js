// What the Nights screen knows about the games: their friendly names, a clean starting point for a new night, a starting set
// of nights, and how to read the checker's messages for one night. No DOM here.
import { registry } from '/repo/elements/registry.js';

export const GAMES = {
  wordle: { title: 'Guess the word', line: 'A word with tiles, like the one everyone plays. Her name works too.', icon: 'letter' },
  memory: { title: 'Match the pairs', line: 'Flip cards to find the pairs. The cards can be your own pictures.', icon: 'image' },
  quiz: { title: 'Questions', line: 'A quiz, or "who is more likely to..." with no wrong answers.', icon: 'info' },
  timeline: { title: 'Put it in order', line: 'Your moments together, shuffled. They put them back in order.', icon: 'moon' },
  hunt: { title: 'Follow the clues', line: 'A trail of riddles. Each answer leads to the next clue.', icon: 'tent' },
  jigsaw: { title: 'Put the picture together', line: 'A photo cut into pieces to slide back into place.', icon: 'gift' },
};

/** Every game the engine has (so a game added later shows up here too), with a name even if we have not written one. */
export function gameList() {
  return Object.values(registry).filter((e) => e.kind === 'game').map((e) => ({ id: e.id, ...(GAMES[e.id] ?? { title: e.id, line: 'A game.', icon: 'sparkle' }) }));
}
export const gameTitle = (id) => GAMES[id]?.title ?? id;

/** Settings for a brand-new night: nothing that could be shipped by mistake; what has to be filled in starts empty. */
export function freshParams(type) {
  switch (type) {
    case 'wordle': return { maxGuesses: 6 };
    case 'memory': return { pairs: 6, faces: '@all' };
    case 'quiz': return { mode: 'quiz', passMark: 0.6, questions: [{ q: '', options: ['', ''], correct: 0 }] };
    case 'timeline': return { events: [{ label: '' }, { label: '' }, { label: '' }] };
    case 'hunt': return { hintAfter: 2, clues: [{ clue: '', answer: '' }] };
    case 'jigsaw': return { image: '@any', cols: 3, rows: 3 };
    default: return structuredClone(registry[type]?.placeholderParams ?? {});
  }
}
export const newNight = (type) => ({ day: 0, game: { type, params: freshParams(type) } });

/** A small, friendly set of nights to begin from (words are generic; the owner replaces them). */
export function starterNights() {
  return [
    { game: { type: 'wordle', params: { answer: 'LOVE', maxGuesses: 6, hint: 'What this is all about' } } },
    { game: { type: 'memory', params: { pairs: 6, faces: '@all' } } },
    { game: { type: 'quiz', params: { mode: 'whosaid', passMark: 0, questions: [
      { q: 'Who is more likely to fall asleep during a movie?', correct: null },
      { q: 'Who said "five more minutes" first today?', correct: null },
      { q: 'Who is more likely to cry at a happy ending?', correct: null }] } } },
    { game: { type: 'wordle', params: { answer: '{{recipient}}', maxGuesses: 6, hint: 'Someone you know well' } } },
    { game: { type: 'quiz', params: { mode: 'quiz', passMark: 0.5, questions: [
      { q: 'Which season do we both love most?', options: ['Spring', 'Summer', 'Monsoon', 'Winter'], correct: 2 },
      { q: 'What do we do when we are lost?', options: ['Argue', 'Laugh', 'Call someone'], correct: 1 }] } } },
  ].map((n, i) => ({ day: i + 1, ...n }));
}

/** Say a checker message in plain words ("does not match ^[A-Za-z]{3,8}$" means nothing to most people). */
export function plainMessage(text) {
  const t = String(text).trim();
  let m;
  if (/this is missing/.test(t)) return 'This is needed.';
  if (/\[A-Za-z\]\{3,8\}/.test(t)) return 'Use 3 to 8 letters, no spaces.';
  if ((m = /shorter than (\d+)/.exec(t))) return Number(m[1]) <= 1 ? 'This cannot be empty.' : `Write at least ${m[1]} characters.`;
  if ((m = /needs at least (\d+) items/.exec(t))) return `Add at least ${m[1]}.`;
  if ((m = /too many \(the most it can show is (\d+)\)/.exec(t))) return `Too many: the most is ${m[1]}.`;
  if ((m = /below minimum (\d+)/.exec(t))) return `Make it at least ${m[1]}.`;
  if ((m = /above maximum (\d+)/.exec(t))) return `Make it at most ${m[1]}.`;
  if (/this needs a picture/.test(t)) return 'This game needs a picture. Add one in Media.';
  return t[0].toUpperCase() + t.slice(1);
}

/**
 * The problems that belong to one night, from the check report.
 * Messages look like "night 2 (wordle) answer: this is missing" or "night 3 (quiz): night 3 has no story ...".
 * @returns [{ level: 'error' | 'warning', path, message }] where `path` is the setting ("answer", "questions[0].q") or ''.
 */
export function problemsForNight(report, day) {
  const out = [];
  for (const [level, list] of [['error', report?.errors ?? []], ['warning', report?.warnings ?? []]]) {
    for (const line of list) {
      const m = /^night (\d+)(?: \([^)]*\))?:? ?(.*)$/s.exec(line);
      if (!m || Number(m[1]) !== day) continue;
      const rest = m[2];
      const f = /^([A-Za-z][\w.[\]]*): (.*)$/s.exec(rest);
      out.push(f ? { level, path: f[1], message: plainMessage(f[2]) } : { level, path: '', message: plainMessage(rest.replace(/^night \d+ /, '')) });
    }
  }
  return out;
}
