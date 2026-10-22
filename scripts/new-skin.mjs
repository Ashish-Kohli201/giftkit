// Scaffold a new SKIN (a look) from the neutral starter.   npm run new-skin -- <id> "Display Name"
// Copies skins/_neutral -> skins/<id>, rewrites ids and scopes, and registers it in skins/skins.json.
// A skin with only tokens already works in every theme (each world paints itself from tokens).
import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [id, ...nameParts] = process.argv.slice(2);
if (!id || !/^[a-z][a-z0-9-]{1,30}$/.test(id)) {
  console.error('Usage: npm run new-skin -- <id> "Display Name"\n  id: lowercase letters/digits/hyphens, e.g. forest');
  process.exit(1);
}
const name = nameParts.join(' ') || id;
const root = fileURLToPath(new URL('..', import.meta.url));
const from = join(root, 'skins/_neutral');
const to = join(root, 'skins', id);
if (existsSync(to)) { console.error(`skins/${id} already exists`); process.exit(1); }

await cp(from, to, { recursive: true });
for (const f of await readdir(to)) {
  if (!/\.(css|js|json)$/.test(f)) continue;
  const p = join(to, f);
  let text = await readFile(p, 'utf8');
  text = text.replaceAll('_neutral', id).replace('Neutral Starter', name);
  await writeFile(p, text);
}
const listPath = join(root, 'skins/skins.json');
const list = JSON.parse(await readFile(listPath, 'utf8'));
list.push({ id, name });
await writeFile(listPath, `${JSON.stringify(list, null, 2)}\n`);

console.log(`Created skins/${id}. Next:
  1. edit skins/${id}/tokens.css  (palette, type, shape, motion) - every theme already renders with it
  2. edit skins/${id}/skin.json   (description, mood, preview)
  3. npm run dev -> http://localhost:5173/playground/?skin=${id}
  4. npm run check -- skin ${id}
  5. paint a theme: add paint-<theme>.css + decorate-<theme>.js and list them under "worlds" in skin.json
Full walkthrough: docs/SKIN_GUIDE.md and docs/WORLD_CONTRACT.md`);
