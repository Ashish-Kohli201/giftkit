// Contract checker for elements, skins and themes (worlds). Zero dependencies.
//   node scripts/check.mjs                 -> check every element, every skin (skins/skins.json) and every theme (themes/themes.json)
//   node scripts/check.mjs skin nightsky   -> one skin   |   theme desk -> one theme   |   element wordle -> one element
// Exit code 1 on any ERROR. Warnings (WARN) never fail the run.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { registry } from '../elements/registry.js';
import { validate } from '../core/validate.js';
import { CONTRACT_VERSION, ELEMENT_KINDS, FX_EVENTS, REQUIRED_TOKENS } from '../core/contract.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let errors = 0, warns = 0;
const err = (scope, msg) => { errors++; console.log(`  ERROR ${scope}: ${msg}`); };
const warn = (scope, msg) => { warns++; console.log(`  WARN  ${scope}: ${msg}`); };
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// ---------------------------------------------------------------- elements
async function checkElement(id, el) {
  const s = `element:${id}`;
  console.log(`\n[${s}]`);
  if (el.id !== id) err(s, `registry key "${id}" does not match element.id "${el.id}"`);
  if (!ELEMENT_KINDS.includes(el.kind)) err(s, `kind must be one of ${ELEMENT_KINDS.join(', ')}`);
  if (!Number.isInteger(el.version)) err(s, 'version must be an integer');
  if (typeof el.mount !== 'function') err(s, 'mount(container, ctx) is missing');
  if (!el.paramsSchema || el.paramsSchema.type !== 'object') err(s, 'paramsSchema must be an object schema');
  if (!Array.isArray(el.parts) || !el.parts.length) err(s, 'parts[] is required (the public styling API)');
  if (!Array.isArray(el.layoutParts) || el.layoutParts.some((p) => !el.parts?.includes(p))) err(s, 'layoutParts[] is required and must be a subset of parts[]');
  if (!el.copy || typeof el.copy !== 'object') err(s, 'copy{} defaults are required (all text must be overridable)');
  else for (const [k, v] of Object.entries(el.copy)) if (typeof v !== 'string') err(s, `copy.${k} must be a string`);
  if (el.placeholderParams === undefined) err(s, 'placeholderParams is required (previews + tests)');
  else {
    const issues = validate(el.paramsSchema, el.placeholderParams, 'placeholderParams');
    issues.forEach((i) => err(s, `placeholderParams invalid: ${i}`));
  }

  const dir = new URL('.', pathToFileURL(fileURLToPath(el.layout))).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const cssPath = fileURLToPath(el.layout);
  const srcPath = join(dir, 'index.js');
  if (!existsSync(cssPath)) { err(s, 'style.css missing'); return; }
  const css = stripComments(await readFile(cssPath, 'utf8'));
  const src = await readFile(srcPath, 'utf8');

  // every declared part must exist in style.css (structure or default paint) -> every element has a fallback look
  for (const p of el.parts || []) if (!css.includes(`data-part="${p}"`)) err(s, `style.css has no rule for part "${p}"`);
  if (!/\)\s*\{/.test(css) || !css.includes(':where(')) warn(s, 'style.css has no :where() default paint (themes get no fallback look)');

  // parts used in code must be declared, and declared parts should be used
  const used = new Set([...src.matchAll(/part\(\s*'[\w-]+'\s*,\s*'([\w-]+)'/g)].map((m) => m[1]));
  for (const u of used) if (!el.parts?.includes(u)) err(s, `code creates part "${u}" that is not listed in parts[]`);
  for (const p of el.parts || []) if (!used.has(p)) warn(s, `part "${p}" is declared but never created`);

  // hard rules
  const bans = [
    [/\.(innerHTML|outerHTML)\b|insertAdjacentHTML/, 'no innerHTML/outerHTML/insertAdjacentHTML (XSS) - use text nodes / part()'],
    [/(?<![.\w])(alert|confirm|prompt)\s*\(|window\.(alert|confirm|prompt)\b/, 'no alert/confirm/prompt - use ctx.dialogs'],
    [/\b(localStorage|sessionStorage|indexedDB)\b/, 'no direct browser storage - use ctx.store'],
    [/https?:\/\//, 'no hardcoded URLs - assets go through ctx.assets'],
    [/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/, 'no network calls from elements'],
    [/from\s+['"][^'"]*themes\//, 'elements must never import from themes/'],
    [/\bwindow\.open\b|document\.cookie/, 'no window.open / cookies'],
  ];
  for (const [re, msg] of bans) if (re.test(src)) err(s, msg);
  if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(css.replace(/:where\([^)]*\)\s*\{[^}]*\}/g, ''))) {
    warn(s, 'style.css has hardcoded colors outside :where() paint - use var(--gk-*) tokens');
  }
}

// ---------------------------------------------------------------- skins and themes
const hex = (h) => { const n = parseInt(h.slice(1).replace(/^(.)(.)(.)$/, '$1$1$2$2$3$3'), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// The roles every theme positions and every skin may paint. See docs/WORLD_CONTRACT.md.
const ROLES = ['hero', 'scenic', 'board', 'tally', 'vault', 'hub', 'jar', 'light', 'app-notes', 'app-music', 'app-gallery', 'toy', 'pet', 'ambient-a', 'ambient-b'];

/** Selector check shared by skin and theme CSS: every selector begins with the scope (or :where(scope ...)). */
function checkCss(s, file, css, scopeAttr, id, prefix) {
  const scope = `[${scopeAttr}="${id}"]`;
  for (const [, prelude] of css.matchAll(/([^{}]+)\{/g)) {
    const p = prelude.trim();
    if (!p || p.startsWith('@')) continue;
    if (/^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/.test(p)) continue; // keyframe steps
    // split on commas that are not inside parentheses (so :where(a, b) stays one selector)
    const parts = []; let depth = 0, cur = '';
    for (const ch of p) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
    parts.push(cur);
    for (const sel of parts.map((x) => x.trim())) {
      if (!(sel.startsWith(scope) || sel.startsWith(`:where(${scope}`))) err(s, `${file}: selector not scoped to ${scope}: "${sel.slice(0, 60)}"`);
    }
  }
  for (const [, name] of css.matchAll(/@keyframes\s+([\w-]+)/g)) if (!name.startsWith(`${prefix}-`)) err(s, `${file}: @keyframes "${name}" must be prefixed "${prefix}-"`);
  if (/@import|url\(\s*['"]?https?:/.test(css)) err(s, `${file}: external @import/url() is forbidden - self-host everything`);
}

async function readManifest(kind, id) {
  const dir = join(ROOT, kind === 'skin' ? 'skins' : 'themes', id);
  const path = join(dir, `${kind}.json`);
  if (!existsSync(path)) return { dir, manifest: null };
  return { dir, manifest: JSON.parse(await readFile(path, 'utf8')) };
}

const readCss = async (dir, f) => stripComments(await readFile(join(dir, f), 'utf8').catch(() => ''));
const codeBans = (s, src, what) => {
  if (/(?<![.\w])(alert|confirm|prompt)\s*\(|window\.(alert|confirm|prompt)\b/.test(src)) err(s, `no alert/confirm/prompt in ${what} code`);
  if (/https?:\/\/(?!www\.w3\.org)/.test(src)) err(s, `no external URLs in ${what} code`);
  if (/\.(innerHTML|outerHTML)\b/.test(src)) err(s, `no innerHTML in ${what} code`);
};

/**
 * A skin's world paint styles roles and its own decorations by part name. Some of those names are also part names of
 * elements (`board` is a wordle and jigsaw part), so a world rule that mentions one must live inside the room stage,
 * or it would restyle the element. Rules that target an element (`data-element=`) are the skin's business and are skipped.
 */
function checkWorldPartNames(s, file, css) {
  const elementParts = new Set(Object.values(registry).flatMap((el) => el.parts));
  for (const [, prelude] of css.matchAll(/([^{}]+)\{/g)) {
    const p = prelude.trim();
    if (!p || p.startsWith('@')) continue;
    for (const sel of p.split(',').map((x) => x.trim())) {
      if (sel.includes('data-element=') || sel.includes('data-part="room-stage"') || sel.includes('data-part="room"')) continue;
      for (const [, name] of sel.matchAll(/data-part="([\w-]+)"/g)) {
        if (elementParts.has(name)) err(s, `${file}: "${name}" is also an element part; scope this rule under [data-part="room-stage"]: "${sel.slice(0, 70)}"`);
      }
    }
  }
}

async function checkSkin(id) {
  const s = `skin:${id}`;
  console.log(`\n[${s}]`);
  const { dir, manifest: m } = await readManifest('skin', id);
  if (!m) { err(s, 'skin.json missing'); return; }

  if (m.id !== id) err(s, `skin.json id "${m.id}" must equal folder name "${id}"`);
  if (m.contractVersion !== CONTRACT_VERSION) err(s, `contractVersion must be ${CONTRACT_VERSION}`);
  for (const k of ['name', 'version', 'description', 'entry', 'styles', 'license']) if (!m[k]) err(s, `skin.json: "${k}" is required`);
  const worldFiles = Object.values(m.worlds || {}).flatMap((w) => [...(w.styles || []), w.module].filter(Boolean));
  for (const f of [m.entry, ...(m.styles || []), ...worldFiles, m.preview].filter(Boolean)) if (!existsSync(join(dir, f))) err(s, `listed file missing: ${f}`);
  if (!m.preview) warn(s, 'no preview image (needed for the configurator picker)');

  // tokens
  const tokensCss = await readCss(dir, 'tokens.css');
  const tokens = Object.fromEntries([...tokensCss.matchAll(/(--gk-[\w-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
  for (const t of REQUIRED_TOKENS) if (!(t in tokens)) err(s, `tokens.css missing ${t}`);
  if (parseInt(tokens['--gk-tap']) < 44) err(s, '--gk-tap must be >= 44px (touch targets)');
  for (const [fg, bg, min] of [['--gk-text', '--gk-bg', 4.5], ['--gk-text', '--gk-surface', 4.5], ['--gk-text-muted', '--gk-bg', 4.5], ['--gk-accent-text', '--gk-accent', 4.5], ['--gk-text', '--gk-bg-2', 4.5]]) {
    if (/^#[0-9a-f]{3,6}$/i.test(tokens[fg] || '') && /^#[0-9a-f]{3,6}$/i.test(tokens[bg] || '')) {
      const c = contrast(tokens[fg], tokens[bg]);
      if (c < min) err(s, `contrast ${fg} on ${bg} is ${c.toFixed(2)} (needs >= ${min})`);
    } else warn(s, `${fg}/${bg} are not plain hex - contrast not verified`);
  }

  // css hygiene: scoping, keyframe names, motion, external urls
  let allCss = '';
  for (const f of [...(m.styles || []), ...worldFiles].filter((x) => x.endsWith('.css'))) {
    const css = await readCss(dir, f);
    allCss += css;
    checkCss(s, f, css, 'data-skin', id, id);
    if (worldFiles.includes(f)) checkWorldPartNames(s, f, css);
    if (/!important/.test(css) && !/animation: none !important/.test(css)) warn(s, `${f}: avoid !important (only allowed to disable animation in reduced-motion)`);
  }
  if (/animation|@keyframes/.test(allCss) && !allCss.includes('prefers-reduced-motion')) err(s, 'uses animation but has no prefers-reduced-motion block');

  // JS module contract (the skin entry plus any per-theme decorate modules)
  let mod;
  try { mod = (await import(pathToFileURL(join(dir, m.entry)).href)).default; } catch (e) { err(s, `cannot import ${m.entry}: ${e.message}`); return; }
  if (mod.id !== id) err(s, `index.js id "${mod.id}" must equal "${id}"`);
  for (const ev of FX_EVENTS) if (!mod.fx || !(ev in mod.fx)) err(s, `fx.${ev} must be defined (use {} for silent)`);
  if (typeof mod.copy !== 'object') err(s, 'copy{} export is required (can be empty)');
  if (mod.shell) err(s, 'a skin must not define a shell: the world (theme) owns the layout and behavior');
  const js = [m.entry, ...worldFiles.filter((f) => f.endsWith('.js'))];
  for (const f of js) codeBans(s, await readFile(join(dir, f), 'utf8'), 'skin');
  for (const f of worldFiles.filter((x) => x.endsWith('.js'))) {
    try { const dm = (await import(pathToFileURL(join(dir, f)).href)).default; if (typeof dm !== 'function') err(s, `${f} must default-export decorateWorld(api)`); }
    catch (e) { err(s, `cannot import ${f}: ${e.message}`); }
  }

  // part coverage report (informational: uncovered parts fall back to core defaults)
  let total = 0, hit = 0; const missing = [];
  const partsCss = await readCss(dir, 'parts.css');
  for (const [eid, el] of Object.entries(registry)) for (const p of el.parts.filter((x) => !el.layoutParts.includes(x))) {
    total++;
    const re = new RegExp(`data-element="${eid}"\\][^{}]*data-part="${p}"`);
    if (re.test(partsCss)) hit++; else missing.push(`${eid}.${p}`);
  }
  console.log(`  coverage: ${hit}/${total} element parts themed (${Math.round((hit / total) * 100)}%) - the rest use core defaults`);
  if (missing.length && process.env.VERBOSE) console.log(`  unthemed: ${missing.join(', ')}`);

  // which worlds this skin paints (informational: the rest use each world's default paint)
  const themeIds = JSON.parse(await readFile(join(ROOT, 'themes/themes.json'), 'utf8')).map((t) => t.id);
  const painted = themeIds.filter((t) => m.worlds?.[t]);
  console.log(`  worlds painted: ${painted.join(', ') || 'none'} (of ${themeIds.join(', ')})`);
  for (const t of Object.keys(m.worlds || {})) if (!themeIds.includes(t)) err(s, `skin.json paints unknown world "${t}"`);
}

async function checkTheme(id) {
  const s = `theme:${id}`;
  console.log(`\n[${s}]`);
  const { dir, manifest: m } = await readManifest('theme', id);
  if (!m) { err(s, 'theme.json missing'); return; }
  if (m.id !== id) err(s, `theme.json id "${m.id}" must equal folder name "${id}"`);
  if (m.contractVersion !== CONTRACT_VERSION) err(s, `contractVersion must be ${CONTRACT_VERSION}`);
  for (const k of ['name', 'version', 'description', 'metaphor', 'entry', 'styles', 'license']) if (!m[k]) err(s, `theme.json: "${k}" is required`);
  for (const f of [m.entry, ...(m.styles || [])].filter(Boolean)) if (!existsSync(join(dir, f))) err(s, `listed file missing: ${f}`);

  let allCss = '';
  for (const f of (m.styles || []).filter((x) => x.endsWith('.css'))) {
    const css = await readCss(dir, f);
    allCss += css;
    checkCss(s, f, css, 'data-theme', id, id);
    if (/!important/.test(css) && !/animation: none !important/.test(css)) warn(s, `${f}: avoid !important`);
  }
  if (/animation|@keyframes/.test(allCss) && !allCss.includes('prefers-reduced-motion')) err(s, 'uses animation but has no prefers-reduced-motion block');
  if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(allCss.replace(/var\([^)]*\)/g, ''))) warn(s, 'layout.css hard-codes a color: themes use tokens only, skins own colors');

  // every role needs its box (x, y, w, ar) in both compositions; core/world.css turns the variables into positions
  for (const r of ROLES) {
    for (const v of ['x', 'y', 'w', 'ar']) if ((allCss.match(new RegExp(`--${r}-${v}:`, 'g')) || []).length < 2) err(s, `layout.css must set --${r}-${v} for portrait and landscape`);
  }
  for (const orient of ['landscape']) if (!allCss.includes(`orientation: ${orient}`)) err(s, `layout.css has no ${orient} composition`);

  let mod;
  try { mod = (await import(pathToFileURL(join(dir, m.entry)).href)).default; } catch (e) { err(s, `cannot import ${m.entry}: ${e.message}`); return; }
  if (mod.id !== id) err(s, `index.js id "${mod.id}" must equal "${id}"`);
  if (typeof mod.mount !== 'function') err(s, 'mount(root, opts) is required (usually mountWorld from core/world.js)');
  codeBans(s, await readFile(join(dir, m.entry), 'utf8'), 'theme');
}

// ---------------------------------------------------------------- run
//   node scripts/check.mjs                  -> every element, skin and theme
//   node scripts/check.mjs skin nightsky    -> one skin   |   theme desk -> one theme   |   element wordle -> one element
const [kind, target] = process.argv.slice(2);
const skins = JSON.parse(await readFile(join(ROOT, 'skins/skins.json'), 'utf8')).map((t) => t.id);
const themes = JSON.parse(await readFile(join(ROOT, 'themes/themes.json'), 'utf8')).map((t) => t.id);
if (!kind || kind === 'element') for (const [id, el] of Object.entries(registry)) if (!target || target === id) await checkElement(id, el);
if (!kind || kind === 'skin') for (const id of skins) if (!target || target === id) await checkSkin(id);
if (!kind || kind === 'theme') for (const id of themes) if (!target || target === id) await checkTheme(id);
console.log(`\n${errors ? 'FAILED' : 'OK'} - ${errors} error(s), ${warns} warning(s)`);
process.exit(errors ? 1 : 0);
