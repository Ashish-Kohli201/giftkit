// Scaffold a new THEME (a world's setup) from the desk theme.   npm run new-theme -- <id> "Display Name"
// Copies themes/desk -> themes/<id>, rewrites ids and scopes, and registers it in themes/themes.json.
// A theme is geometry only (layout.css) on top of the shared world engine (core/world.js + core/world.css).
import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [id, ...nameParts] = process.argv.slice(2);
if (!id || !/^[a-z][a-z0-9-]{1,30}$/.test(id) || id === 'desk') {
  console.error('Usage: npm run new-theme -- <id> "Display Name"\n  id: lowercase letters/digits/hyphens, e.g. concert');
  process.exit(1);
}
const name = nameParts.join(' ') || id;
const root = fileURLToPath(new URL('..', import.meta.url));
const from = join(root, 'themes/desk');
const to = join(root, 'themes', id);
if (existsSync(to)) { console.error(`themes/${id} already exists`); process.exit(1); }

await cp(from, to, { recursive: true });
for (const f of await readdir(to)) {
  if (!/\.(css|js|json)$/.test(f)) continue;
  const p = join(to, f);
  let text = await readFile(p, 'utf8');
  text = text.replaceAll('"desk"', `"${id}"`).replaceAll("'desk'", `'${id}'`).replace('"name": "Desk"', `"name": "${name}"`).replaceAll('Desk world', `${name} world`);
  await writeFile(p, text);
}
const listPath = join(root, 'themes/themes.json');
const list = JSON.parse(await readFile(listPath, 'utf8'));
list.push({ id, name });
await writeFile(listPath, `${JSON.stringify(list, null, 2)}\n`);

console.log(`Created themes/${id}. Next:
  1. edit themes/${id}/layout.css  (move every role: --<role>-x / -y / -w / -ar, portrait and landscape)
  2. edit themes/${id}/theme.json and index.js (description, metaphor, default role names)
  3. npm run check -- theme ${id}   then open /playground/gift.html?theme=${id}&skin=_neutral&tier=signature to see the boxes
  4. paint it per skin: skins/<skin>/paint-${id}.css + decorate-${id}.js (see docs/WORLD_CONTRACT.md)`);
