// Runs every studio test file (tests/studio-*.mjs) one after another and reports which ones failed.
// Run: npm run test:studio
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const files = (await readdir(dir)).filter((f) => /^studio-.*\.mjs$/.test(f)).sort();
const failed = [];
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [`tests/${f}`], { stdio: 'inherit', cwd: new URL('..', import.meta.url) });
  if (r.status !== 0) failed.push(f);
}
console.log(failed.length ? `\nstudio tests FAILED: ${failed.join(', ')}` : `\nall ${files.length} studio test files passed`);
process.exit(failed.length ? 1 : 0);
