// The gift engine's command line.   npm run gift -- <command> ...
//
//   new <name>        start a gift folder (gift.json + an empty media folder)
//   add <name> <files or folders...>   put pictures, songs and videos into a gift's media folder
//   check <name>      look the gift over and say what is wrong, in plain words
//   studio            open the gift studio: edit everything on screen, drag in media, preview, build
//   preview <name>    open the gift on this computer AND on a phone on the same Wi-Fi; refreshes itself when you save
//   build <name>      make the finished gift: one folder (and a .zip) that works on any web host
//   list              the gifts in the gifts/ folder
//
// A gift is a folder:   gifts/<name>/gift.json   the words, the games, the choices
//                       gifts/<name>/media/      drop pictures, songs and videos here; use them by file name (@us_at_goa)
// See docs/ENGINE.md.
import { copyFile, cp, mkdir, readdir, readFile, rm, stat, watch, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { buildGift, GiftError, prepareGift, slugFor } from './lib/build.js';
import { DIST, GIFTS, PREVIEW, ROOT } from './lib/paths.js';
import { createGift } from './lib/create.js';
import { planMediaFile } from './lib/media-files.js';
import { scanMedia } from './lib/media.js';
import { serveFolder, lanAddress } from './lib/server.js';
import { bold, dim, green, printMedia, printReport, red, size, yellow } from './lib/report.js';


/** "--tier signature" style options and the plain words around them. */
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; }
    } else args._.push(argv[i]);
  }
  return args;
}

/** A gift is a folder name under gifts/, or any folder path that contains a gift.json. */
function giftDirOf(name) {
  if (!name) fail('Which gift? For example:  npm run gift -- check aria-birthday');
  const dir = /[\\/]/.test(name) || isAbsolute(name) ? resolve(name) : join(GIFTS, name);
  if (!existsSync(dir)) fail(`There is no gift called "${name}". Start one with:  npm run gift -- new ${name}\nOr see what exists with:  npm run gift -- list`);
  return dir;
}

function fail(message) { console.error(red(message)); process.exit(1); }
const rel = (p) => p.replace(ROOT, '.').replace(/\\/g, '/');

// ------------------------------------------------------------------ new
async function cmdNew(args) {
  if (!args._[0]) fail('Give the gift a short name, for example:  npm run gift -- new aria-birthday');
  let made;
  try {
    made = await createGift({
      name: args._[0], tier: args.tier ?? 'signature', theme: args.theme, skin: args.skin,
      recipient: typeof args.for === 'string' ? args.for : undefined, sender: typeof args.from === 'string' ? args.from : undefined,
      birthday: typeof args.birthday === 'string' ? args.birthday : undefined,
    });
  } catch (e) { fail(e.message); }
  const { name, dir, config } = made;
  console.log(`${green(bold(`Started ${name}`))}  (${config.meta.tier}, ${config.meta.theme} x ${config.meta.skin})\n`);
  console.log(`  1. Put your pictures, songs and videos in  ${rel(join(dir, 'media'))}`);
  console.log(`     (or:  npm run gift -- add ${name} "C:\\path\\to\\your\\files")`);
  console.log(`  2. Replace the sample words in  ${rel(join(dir, 'gift.json'))}`);
  console.log(`     (or edit everything on screen:  npm run gift -- studio)`);
  console.log(`  3. See it on your phone:        npm run gift -- preview ${name}`);
  console.log(`  4. When it is right:            npm run gift -- build ${name}\n`);
}

// ------------------------------------------------------------------ add
async function cmdAdd(args) {
  const dir = giftDirOf(args._[0]);
  const sources = args._.slice(1);
  if (!sources.length) fail('Which files? For example:  npm run gift -- add aria-birthday "C:\\Users\\me\\Pictures\\goa"');
  const media = join(dir, 'media');
  await mkdir(media, { recursive: true });
  let added = 0;
  const copyOne = async (file) => {
    const plan = await planMediaFile(media, file);
    if (!plan.ok) { if (/^(\.|thumbs|desktop)/i.test(basename(file))) return; console.log(`  ${yellow('skipped')} ${basename(file)}: ${plan.message}`); return; }
    await copyFile(file, plan.path);
    added++;
    console.log(`  ${green('added')}   ${basename(file)}  ->  @${plan.slot}`);
  };
  const visit = async (path) => {
    const info = await stat(path).catch(() => null);
    if (!info) return console.log(`  ${yellow('skipped')} ${path}: not found`);
    if (info.isDirectory()) for (const e of (await readdir(path)).sort()) await visit(join(path, e));
    else await copyOne(path);
  };
  for (const s of sources) await visit(resolve(s));
  console.log(`\n${added} file${added === 1 ? '' : 's'} added to ${rel(media)}.`);
  const { slots, issues } = await scanMedia(media);
  for (const i of issues.filter((x) => x.level !== 'note')) console.log(`  ${i.level === 'error' ? red('x') : yellow('!')} ${i.file}: ${i.message}`);
  console.log(`Run  npm run gift -- check ${basename(dir)}  to see how the gift looks with them.`);
  return slots;
}

// ------------------------------------------------------------------ check
async function cmdCheck(args) {
  const dir = giftDirOf(args._[0]);
  let gift;
  try { gift = await prepareGift(dir); } catch (e) { if (e instanceof GiftError) { printReport(e.report); fail(`\n${e.message}`); } throw e; }
  const { config, slots, report } = gift;
  console.log(`${bold(`Checking ${gift.name}`)}  (${config.meta.tier}, ${config.meta.theme} x ${config.meta.skin}, ${config.days.length} night${config.days.length === 1 ? '' : 's'})`);
  console.log('\nMedia');
  printMedia(slots);
  printReport(report);
  if (report.errors.length) { console.log(`\n${red(bold('Not ready:'))} fix the problems above, then check again.`); process.exitCode = 1; return; }
  console.log(`\n${green(bold('Ready.'))}${report.warnings.length ? ' (There are a few things worth a look, above.)' : ''}`);
  console.log(`  See it:  npm run gift -- preview ${gift.name}\n  Finish:  npm run gift -- build ${gift.name}`);
}

// ------------------------------------------------------------------ preview
async function cmdPreview(args) {
  const dir = giftDirOf(args._[0]);
  const name = basename(dir);
  const out = join(PREVIEW, name);
  const port = Number(args.port ?? process.env.PORT ?? 5180);
  const rebuild = async () => {
    try {
      const r = await buildGift({ giftDir: dir, outDir: out, preview: true });
      const issues = r.report.warnings.length;
      console.log(`${green('built')} ${new Date().toLocaleTimeString()}  ${r.files} files, ${size(r.bytes)}${issues ? `  ${yellow(`${issues} warning${issues > 1 ? 's' : ''}`)} (run check to read them)` : ''}`);
      return true;
    } catch (e) {
      if (!(e instanceof GiftError)) throw e;
      printReport(e.report);
      console.log(red(`\n${e.message} The preview keeps showing the last good version. Fix it and save again.`));
      return false;
    }
  };
  if (!(await rebuild()) && !existsSync(join(out, 'index.html'))) process.exit(1);
  const { reload } = await serveFolder(out, { port });
  const lan = lanAddress();
  console.log(`\n${bold(`Previewing ${name}`)}`);
  console.log(`  On this computer:  http://localhost:${port}/`);
  console.log(lan ? `  On your phone:     http://${lan}:${port}/   ${dim('(same Wi-Fi; allow Node.js through the firewall if asked)')}` : `  ${yellow('No Wi-Fi address found, so a phone cannot reach this.')}`);
  console.log(`  ${dim('Add to the address:  ?unlock=1 (see everything)   ?night=4 (pretend 4 nights are done)   ?finale=envelope|slideshow|cake')}`);
  console.log(`  ${dim('Save gift.json or drop in a file and the page refreshes by itself. Press Ctrl+C to stop.')}\n`);

  // rebuild when the gift's files change (debounced: one save can fire several events)
  let timer = null;
  const changed = () => { clearTimeout(timer); timer = setTimeout(async () => { if (await rebuild()) reload(); }, 500); };
  try { for await (const ev of watch(dir, { recursive: true })) if (!/\.slug$/.test(ev.filename ?? '')) changed(); }
  catch { console.log(yellow('Could not watch the folder; rerun preview after changes.')); await new Promise(() => {}); }
}

// ------------------------------------------------------------------ build
async function cmdBuild(args) {
  const dir = giftDirOf(args._[0]);
  const name = basename(dir);
  const slug = await slugFor(dir, typeof args.slug === 'string' ? args.slug : undefined);
  const out = join(DIST, slug);
  let r;
  try { r = await buildGift({ giftDir: dir, outDir: out, zip: !args['no-zip'] }); } catch (e) { if (e instanceof GiftError) { printReport(e.report); fail(`\n${e.message} Nothing was built.`); } throw e; }
  if (args.strict && r.report.warnings.length) { printReport({ errors: [], warnings: r.report.warnings, notes: [] }); fail('\nBuilt with warnings, and --strict is on. Fix the warnings above.'); }
  console.log(`${green(bold(`Built ${name}`))}  (${r.config.meta.tier}, ${r.config.meta.theme} x ${r.config.meta.skin})`);
  printReport({ errors: [], warnings: r.report.warnings, notes: r.report.notes });
  console.log(`\n  folder   ${rel(r.outDir)}   (${r.files} files, ${size(r.bytes)})`);
  if (r.zipPath) console.log(`  zip      ${rel(r.zipPath)}   ${dim('<- drag this onto Netlify Drop, Cloudflare Pages, or any static host')}`);
  console.log(`  private  /${slug}/   ${dim('(the link is secret: anyone with it can open the gift, nobody else can find it)')}`);
  console.log(`\n  Try it first:  npm run gift -- preview ${name}`);
  console.log(`  Real link:     https://<your-site>/${slug}/   ${dim('(upload the folder so its files end up under that path)')}\n`);
}

// ------------------------------------------------------------------ list
async function cmdList() {
  if (!existsSync(GIFTS)) return console.log(`No gifts yet. Start one with:  npm run gift -- new aria-birthday`);
  const names = (await readdir(GIFTS, { withFileTypes: true })).filter((e) => e.isDirectory() && existsSync(join(GIFTS, e.name, 'gift.json'))).map((e) => e.name);
  if (!names.length) return console.log('No gifts yet. Start one with:  npm run gift -- new aria-birthday');
  for (const n of names) {
    try {
      const g = await prepareGift(join(GIFTS, n));
      const status = g.ok ? green('ready') : red(`${g.report.errors.length} to fix`);
      console.log(`  ${n.padEnd(28)} ${g.config.meta.tier.padEnd(10)} ${`${g.config.meta.theme} x ${g.config.meta.skin}`.padEnd(20)} ${String(Object.keys(g.slots).length).padStart(3)} files  ${status}`);
    } catch (e) { console.log(`  ${n.padEnd(28)} ${red(e.message)}`); }
  }
}

// ------------------------------------------------------------------ studio
async function cmdStudio(args) {
  const { startStudio } = await import('./studio/server.js');
  await startStudio({ port: Number(args.port ?? process.env.PORT ?? 5190), open: !args['no-open'] });
  await new Promise(() => {}); // runs until Ctrl+C
}

// ------------------------------------------------------------------ help
function help() {
  console.log(`${bold('Gift engine')}   npm run gift -- <command>

  new <name> [--tier spark|countdown|signature] [--theme desk|outdoors] [--skin nightsky|arcade]
             [--for "Her name"] [--from "Your name"] [--birthday 2026-12-20]
                          start a gift folder (default: a ten-night Signature gift)
  add <name> <files or folders...>
                          copy pictures, songs and videos into the gift's media folder (names are tidied for you)
  check <name>            say what is wrong, in plain words
  studio [--port 5190] [--no-open]
                          open the studio in your browser: edit the gift on screen, drag in media, preview, build
  preview <name> [--port 5180]
                          open it on this computer and on a phone on the same Wi-Fi; refreshes when you save
  build <name> [--strict] [--no-zip] [--slug my-private-link]
                          make the finished gift (folder + zip) in dist-gifts/
  list                    the gifts in gifts/

Your pictures, songs and videos need no setup: drop them in the gift's media folder and use them by file name.`);
}

// ------------------------------------------------------------------ main
const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const commands = { new: cmdNew, add: cmdAdd, check: cmdCheck, preview: cmdPreview, build: cmdBuild, list: cmdList, studio: cmdStudio };
try {
  if (!command || command === 'help' || command === '--help') help();
  else if (commands[command]) await commands[command](args);
  else fail(`"${command}" is not a command. Run:  npm run gift -- help`);
} catch (e) {
  console.error(red(`\nSomething unexpected went wrong: ${e.message}`));
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
}
