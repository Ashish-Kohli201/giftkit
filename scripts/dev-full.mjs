// The whole thing on this computer: the REAL backend code (pretending to be Google) and the site wired to it.
//   npm run dev:full
//   site:           http://localhost:5173/site/
//   control panel:  http://localhost:5195/      (play the bank email and the passing of time)
// Orders, emails and files live in memory and vanish when you stop it.
import { spawn } from 'node:child_process';
import { startEmulator } from '../tests/lib/gas-server.mjs';

const SITE_PORT = Number(process.env.PORT) || 5173;
const API_PORT = 5195;
const emulator = await startEmulator({ port: API_PORT, siteUrl: `http://localhost:${SITE_PORT}` });
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(SITE_PORT), SPARK_API: `${emulator.url}/exec` }, stdio: 'inherit' });

console.log(`\nSite:           http://localhost:${SITE_PORT}/site/`);
console.log(`Control panel:  ${emulator.url}/   (the bank email arrives, time passes)\n`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.kill(); emulator.close().then(() => process.exit(0)); });
