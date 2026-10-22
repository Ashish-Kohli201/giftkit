// Plain-language printing for the gift commands. No colors library: a few ANSI codes, switched off when output is not a terminal.
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (tty ? `\u001b[${code}m${text}\u001b[0m` : text);
export const red = paint('31');
export const yellow = paint('33');
export const green = paint('32');
export const dim = paint('2');
export const bold = paint('1');

export const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const typeName = { image: 'picture', video: 'video', audio: 'song' };

/** The media a gift has, as a short table. */
export function printMedia(slots) {
  const list = Object.values(slots);
  if (!list.length) return console.log(`  ${dim('no files yet: drop pictures, songs and videos into the media folder')}`);
  const counts = {};
  for (const s of list) counts[s.type] = (counts[s.type] ?? 0) + 1;
  console.log(`  ${list.length} file${list.length > 1 ? 's' : ''}: ${Object.entries(counts).map(([t, n]) => `${n} ${typeName[t]}${n > 1 ? 's' : ''}`).join(', ')}`);
  for (const s of list.slice(0, 40)) console.log(`    @${s.id.padEnd(28)} ${typeName[s.type].padEnd(8)} ${size(s.size).padStart(9)}`);
  if (list.length > 40) console.log(`    ... and ${list.length - 40} more`);
}

/** Errors, warnings and notes from a validation report. */
export function printReport(report) {
  if (report.errors.length) {
    console.log(`\n${red(bold(`Fix these ${report.errors.length} problem${report.errors.length > 1 ? 's' : ''}:`))}`);
    for (const e of report.errors) console.log(`  ${red('x')} ${e}`);
  }
  if (report.warnings.length) {
    console.log(`\n${yellow(bold(`Worth a look (${report.warnings.length}):`))}`);
    for (const w of report.warnings) console.log(`  ${yellow('!')} ${w}`);
  }
  if (report.notes.length) {
    console.log(`\n${dim('Notes:')}`);
    for (const n of report.notes) console.log(`  ${dim('-')} ${n}`);
  }
}
