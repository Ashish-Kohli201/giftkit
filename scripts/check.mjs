// Contract checker for elements, skins and products. Zero dependencies.
//   node scripts/check.mjs                   -> check every element, every skin (skins/skins.json) and every product (products/*)
//   node scripts/check.mjs skin nightsky     -> one skin   |   product envelope -> one product   |   element reveal -> one element
// Exit code 1 on any ERROR. Warnings (WARN) never fail the run.
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { registry } from '../elements/registry.js';
import { validate } from '../core/validate.js';
import { checkManifest, normalizeOptions, priceFor } from '../core/options.js';
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
  // an element may split its code into files next to index.js (e.g. variants/*.js): every one is held to the same rules
  let src = await readFile(srcPath, 'utf8');
  for (const sub of ['.', 'variants']) {
    const folder = join(dir, sub);
    if (!existsSync(folder)) continue;
    for (const f of await readdir(folder)) if (f.endsWith('.js') && !(sub === '.' && f === 'index.js')) src += `
${await readFile(join(folder, f), 'utf8')}`;
  }

  // every declared part must exist in style.css (structure or default paint) -> every element has a fallback look
  for (const p of el.parts || []) if (!css.includes(`data-part="${p}"`)) err(s, `style.css has no rule for part "${p}"`);
  if (!/\)\s*\{/.test(css) || !css.includes(':where(')) warn(s, 'style.css has no :where() default paint (skins get no fallback look)');

  // parts used in code must be declared, and declared parts should be used
  const used = new Set([...src.matchAll(/part\(\s*'[\w-]+'\s*,\s*'([\w-]+)'/g)].map((m) => m[1]));
  for (const u of used) if (!el.parts?.includes(u)) err(s, `code creates part "${u}" that is not listed in parts[]`);
  for (const p of el.parts || []) if (!used.has(p)) warn(s, `part "${p}" is declared but never created`);

  // hard rules
  const bans = [
    [/\.(innerHTML|outerHTML)\b|insertAdjacentHTML/, 'no innerHTML/outerHTML/insertAdjacentHTML (XSS) - use text nodes / part()'],
    [/(?<![.\w])(alert|confirm|prompt)\s*\(|window\.(alert|confirm|prompt)\b/, 'no alert/confirm/prompt'],
    [/\b(localStorage|sessionStorage|indexedDB)\b/, 'no direct browser storage - use ctx.store'],
    [/https?:\/\//, 'no hardcoded URLs - assets go through ctx.assets'],
    [/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/, 'no network calls from elements'],
    [/from\s+['"][^'"]*(skins|products)\//, 'elements must never import from skins/ or products/'],
    [/\bwindow\.open\b|document\.cookie/, 'no window.open / cookies'],
  ];
  for (const [re, msg] of bans) if (re.test(src)) err(s, msg);
  if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(css.replace(/:where\([^)]*\)\s*\{[^}]*\}/g, ''))) {
    warn(s, 'style.css has hardcoded colors outside :where() paint - use var(--gk-*) tokens');
  }
}

// ---------------------------------------------------------------- skins
const hex = (h) => { const n = parseInt(h.slice(1).replace(/^(.)(.)(.)$/, '$1$1$2$2$3$3'), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** Selector check for a skin's CSS: every selector begins with the skin scope (or :where(scope ...)). */
function checkCss(s, file, css, id) {
  const scope = `[data-skin="${id}"]`;
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
  for (const [, name] of css.matchAll(/@keyframes\s+([\w-]+)/g)) if (!name.startsWith(`${id}-`)) err(s, `${file}: @keyframes "${name}" must be prefixed "${id}-"`);
  if (/@import|url\(\s*['"]?https?:/.test(css)) err(s, `${file}: external @import/url() is forbidden - self-host everything`);
}

const readCss = async (dir, f) => stripComments(await readFile(join(dir, f), 'utf8').catch(() => ''));
const codeBans = (s, src, what) => {
  if (/(?<![.\w])(alert|confirm|prompt)\s*\(|window\.(alert|confirm|prompt)\b/.test(src)) err(s, `no alert/confirm/prompt in ${what} code`);
  if (/https?:\/\/(?!www\.w3\.org)/.test(src)) err(s, `no external URLs in ${what} code`);
  if (/\.(innerHTML|outerHTML)\b|insertAdjacentHTML/.test(src)) err(s, `no innerHTML in ${what} code`);
};

async function checkSkin(id) {
  const s = `skin:${id}`;
  console.log(`\n[${s}]`);
  const dir = join(ROOT, 'skins', id);
  const path = join(dir, 'skin.json');
  if (!existsSync(path)) { err(s, 'skin.json missing'); return; }
  const m = JSON.parse(await readFile(path, 'utf8'));

  if (m.id !== id) err(s, `skin.json id "${m.id}" must equal folder name "${id}"`);
  if (m.contractVersion !== CONTRACT_VERSION) err(s, `contractVersion must be ${CONTRACT_VERSION}`);
  for (const k of ['name', 'version', 'description', 'entry', 'styles', 'license']) if (!m[k]) err(s, `skin.json: "${k}" is required`);
  for (const f of [m.entry, ...(m.styles || []), m.preview].filter(Boolean)) if (!existsSync(join(dir, f))) err(s, `listed file missing: ${f}`);
  if (!m.preview) warn(s, 'no preview image (needed for the website picker)');

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
  for (const f of (m.styles || []).filter((x) => x.endsWith('.css'))) {
    const css = await readCss(dir, f);
    allCss += css;
    checkCss(s, f, css, id);
    if (/!important/.test(css) && !/animation: none !important/.test(css)) warn(s, `${f}: avoid !important (only allowed to disable animation in reduced-motion)`);
  }
  if (/animation|@keyframes/.test(allCss) && !allCss.includes('prefers-reduced-motion')) err(s, 'uses animation but has no prefers-reduced-motion block');

  // JS module contract
  let mod;
  try { mod = (await import(pathToFileURL(join(dir, m.entry)).href)).default; } catch (e) { err(s, `cannot import ${m.entry}: ${e.message}`); return; }
  if (mod.id !== id) err(s, `index.js id "${mod.id}" must equal "${id}"`);
  for (const ev of FX_EVENTS) if (!mod.fx || !(ev in mod.fx)) err(s, `fx.${ev} must be defined (use {} for silent)`);
  if (typeof mod.copy !== 'object') err(s, 'copy{} export is required (can be empty)');
  codeBans(s, await readFile(join(dir, m.entry), 'utf8'), 'skin');

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
}

// ---------------------------------------------------------------- products
const skinIds = JSON.parse(await readFile(join(ROOT, 'skins/skins.json'), 'utf8')).map((t) => t.id);

async function checkProduct(id) {
  const s = `product:${id}`;
  console.log(`\n[${s}]`);
  const dir = join(ROOT, 'products', id);
  const path = join(dir, 'product.json');
  if (!existsSync(path)) { err(s, 'product.json missing'); return; }
  const m = JSON.parse(await readFile(path, 'utf8'));

  if (m.id !== id) err(s, `product.json id "${m.id}" must equal folder name "${id}"`);
  if (m.contractVersion !== CONTRACT_VERSION) err(s, `contractVersion must be ${CONTRACT_VERSION}`);
  for (const p of checkManifest(m)) err(s, p);
  if (m.price?.base < 5000) warn(s, `price.base is ${m.price.base / 100} rupees: that is a TEST price, set the real one before launch`);
  for (const sk of m.skins ?? []) if (!skinIds.includes(sk)) err(s, `skins lists "${sk}", which is not in skins/skins.json`);
  const skinOption = m.options?.find((o) => o.key === 'skin');
  if (skinOption && !skinOption.choices?.every((c) => m.skins?.includes(c.value))) err(s, 'every choice of the "skin" option must be listed in skins');

  // the storefront builds its guided steps from the "shop" block: every option must be asked somewhere, and nothing unknown
  const shop = m.shop;
  if (!shop) err(s, '"shop" is required (colours, headline and the guided steps the storefront shows)');
  else {
    for (const k of ['accent', 'ink', 'headline', 'blurb']) if (!shop[k]) err(s, `shop.${k} is required`);
    for (const k of ['accent', 'ink']) if (shop[k] && !/^#[0-9a-f]{6}$/i.test(shop[k])) err(s, `shop.${k} must be a #rrggbb colour`);
    if (!shop.starters?.length) err(s, 'shop.starters needs a few lines of starter text for people who do not know what to write');
    const asked = new Set();
    for (const st of shop.steps ?? []) {
      for (const k of ['id', 'title', 'hint']) if (!st[k]) err(s, `shop step "${st.id ?? '?'}": ${k} is required`);
      for (const key of st.keys ?? []) {
        if (!m.options?.some((o) => o.key === key)) err(s, `shop step "${st.id}" asks for "${key}", which is not an option`);
        if (asked.has(key)) err(s, `option "${key}" is asked in more than one step`);
        asked.add(key);
      }
    }
    for (const o of m.options ?? []) if (!asked.has(o.key)) err(s, `option "${o.key}" is never asked: add it to a shop step`);
    // a required option on an optional step would let the customer skip past it
    for (const st of shop.steps ?? []) if (st.optional && st.keys?.some((k) => m.options?.find((o) => o.key === k)?.required)) err(s, `shop step "${st.id}" is optional but holds a required option`);
  }

  // a sample must exist and be a complete, valid order; its price must be a sensible whole number
  const samplePath = join(dir, 'sample.json');
  if (!existsSync(samplePath)) err(s, 'sample.json missing (the playground and tests use it)');
  else {
    const sample = JSON.parse(await readFile(samplePath, 'utf8'));
    const { options, errors: bad } = normalizeOptions(m, sample.options);
    for (const [k, v] of Object.entries(bad)) err(s, `sample.json: ${v} (${k})`);
    const price = priceFor(m, options);
    if (!Number.isInteger(price) || price < 100) err(s, `sample price ${price} is not a sensible whole number of paise`);
  }

  // code: the entry exists, mounts, and keeps to the same hard rules as elements (no network, storage or HTML strings)
  if (!existsSync(join(dir, 'index.js'))) { err(s, 'index.js missing'); return; }
  const mod = (await import(pathToFileURL(join(dir, 'index.js')).href)).default;
  if (typeof mod?.mount !== 'function') err(s, 'index.js must default-export { mount(root, ctx) }');
  let src = await readFile(join(dir, 'index.js'), 'utf8');
  if (id !== '_shared') for (const f of await readdir(join(ROOT, 'products/_shared'))) if (f.endsWith('.js')) src += `\n${await readFile(join(ROOT, 'products/_shared', f), 'utf8')}`;
  codeBans(s, src, 'product');
  if (/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/.test(src)) err(s, 'products must not make network calls (files arrive through ctx.media)');
  if (/\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/.test(src)) err(s, 'products must not touch browser storage (use ctx.store)');
}

// ---------------------------------------------------------------- run
const [kind, target] = process.argv.slice(2);
const skins = skinIds;
const products = (await readdir(join(ROOT, 'products'), { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name);
// products/index.json is the order the storefront shows them in; it must list exactly the product folders
const listed = JSON.parse(await readFile(join(ROOT, 'products/index.json'), 'utf8'));
if (!kind || kind === 'product') {
  console.log('\n[products/index.json]');
  for (const id of products) if (!listed.includes(id)) err('products/index.json', `"${id}" is a product folder but is not listed`);
  for (const id of listed) if (!products.includes(id)) err('products/index.json', `lists "${id}", which is not a product folder`);
}
if (!kind || kind === 'element') for (const [id, el] of Object.entries(registry)) if (!target || target === id) await checkElement(id, el);
if (!kind || kind === 'skin') for (const id of skins) if (!target || target === id) await checkSkin(id);
if (!kind || kind === 'product') for (const id of products) if (!target || target === id) await checkProduct(id);
console.log(`\n${errors ? 'FAILED' : 'OK'} - ${errors} error(s), ${warns} warning(s)`);
process.exit(errors ? 1 : 0);
