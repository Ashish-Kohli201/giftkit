// Responsive check (Playwright). Two sections:
//
// 1. WORLD: for every THEME x SKIN x TIER (the matrix) and a spread of device sizes, load the full-screen gift page and verify
//    - the page never scrolls sideways
//    - every role is fully on screen and at least 44px (curtains-like edge strips are exempt from the sideways rule)
//    - no two roles overlap each other (scenic, ambient-a, ambient-b are backdrop-ish and may overlap)
//    - the Spark hero opens the finale, which fits the viewport; the hub opens a sheet that fits the viewport
//    Roles are the stable contract between worlds and skins (docs/WORLD_CONTRACT.md), so the same checks run for every combination.
//
// 2. ELEMENT FIT: every game / finale element is opened in a real sheet (playground/gift.js ?element=<id>, with a sample day note)
//    and must FIT the screen: on portrait phones nothing scrolls vertically (sheet body or element), nowhere does anything
//    scroll sideways, and every button is a 44px tap target (wordle keys are only required to be 44px tall: ten keys cannot be
//    44px wide on a 320px screen). Landscape phones may scroll vertically for now but keep the tap-target rule.
//
// Run: npm run test:responsive
//      (SHOTS=1 saves screenshots to tests/shots; THEMES=outdoors SKINS=arcade TIERS=signature narrow the matrix)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5198;
const BASE = `http://localhost:${PORT}`;
const THEMES = (process.env.THEMES || 'desk,outdoors').split(',');
const SKINS = (process.env.SKINS || 'nightsky,arcade').split(',');
const TIERS = (process.env.TIERS || 'spark,countdown,signature').split(',');

// The roles each tier shows. ambient-b is a strip that may start slightly off the left edge, so it is not held to the
// "fully on screen" rule (it still has to be 44px and reachable).
const TIER_ROLES = {
  spark: ['hero'],
  countdown: ['scenic', 'board', 'tally', 'vault', 'hub', 'jar', 'light'],
  signature: ['scenic', 'board', 'tally', 'vault', 'hub', 'jar', 'light', 'app-notes', 'app-music', 'app-gallery', 'toy', 'pet', 'ambient-a', 'ambient-b'],
};
const MAY_OVERLAP = new Set(['scenic', 'ambient-a', 'ambient-b', 'tally', 'board']);
const MAY_BE_OFFSCREEN_X = new Set(['ambient-b']);
const DEVICES = [
  { name: 'small-phone', width: 320, height: 568, touch: true, portraitPhone: true },
  { name: 'se', width: 360, height: 640, touch: true, portraitPhone: true },
  { name: 'iphone', width: 390, height: 844, touch: true, portraitPhone: true },
  { name: 'large-phone', width: 430, height: 932, touch: true, portraitPhone: true },
  { name: 'phone-landscape', width: 844, height: 390, touch: true },
  { name: 'tablet', width: 768, height: 1024, touch: true },
  { name: 'laptop', width: 1280, height: 800, touch: false },
  { name: 'desktop', width: 1920, height: 1080, touch: false },
];
// Worst-case-ish params per fit-required element (placeholders are merged underneath by the gift page).
const FIT_CASES = [
  { id: 'wordle', label: 'wordle-5x5', params: {} },
  { id: 'wordle', label: 'wordle-7x6', params: { answer: 'HEARTSS', maxGuesses: 6 } },
  { id: 'memory', label: 'memory-6-pairs', params: { pairs: 6 } },
  { id: 'memory', label: 'memory-8-pairs', params: { pairs: 8 } },
  { id: 'jigsaw', label: 'jigsaw-3x3', params: {} },
  { id: 'hunt', label: 'hunt', params: {} },
  { id: 'quiz', label: 'quiz', params: {} },
  { id: 'timeline', label: 'timeline-5', params: {} },
  { id: 'vault', label: 'vault-10', params: { code: 'ABCDEFGHJK' } },
  { id: 'music', label: 'music-3', params: {} },
  { id: 'gallery', label: 'gallery-6', params: {} },
  { id: 'notes', label: 'notes-3', params: {} },
];

const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
if (process.env.SHOTS) mkdirSync('tests/shots', { recursive: true });

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log(`  FAIL ${msg}`); } };
const newPage = async (browser, dev) => {
  const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, hasTouch: dev.touch, isMobile: dev.touch });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  return { ctx, page, problems };
};

const browser = await chromium.launch();
try {
  // ------------------------------------------------------------------ 1. world: theme x skin x tier x device
  for (const theme of THEMES) for (const skin of SKINS) {
    for (const tier of TIERS) {
      console.log(`[responsive] ${theme} x ${skin} tier=${tier}`);
      const roles = TIER_ROLES[tier];
      for (const dev of DEVICES) {
        const { ctx, page, problems } = await newPage(browser, dev);
        const label = `${theme}/${skin}/${tier}@${dev.name} ${dev.width}x${dev.height}`;

        await page.goto(`${BASE}/playground/gift.html?tier=${tier}&theme=${theme}&skin=${skin}&mode=all`);
        await page.waitForSelector('[data-part="room"]');
        await page.waitForTimeout(300);

        const m = await page.evaluate(({ roles, mayOverlap, mayOffX }) => {
          const vw = window.innerWidth, vh = window.innerHeight;
          const found = roles.map((role) => {
            const el = document.querySelector(`[data-part="${role}"]`);
            if (!el || el.hidden) return { role, missing: true };
            const r = el.getBoundingClientRect();
            return { role, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height, tally: role === 'tally' };
          });
          const present = found.filter((f) => !f.missing);
          const overlaps = [];
          const hot = present.filter((f) => !mayOverlap.includes(f.role));
          for (let i = 0; i < hot.length; i++) for (let j = i + 1; j < hot.length; j++) {
            const a = hot[i], b = hot[j];
            const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ox > 0 && oy > 0 && (ox * oy) / Math.min(a.w * a.h, b.w * b.h) > 0.12) overlaps.push(`${a.role}/${b.role}`);
          }
          return {
            missing: found.filter((f) => f.missing).map((f) => f.role),
            sideways: document.documentElement.scrollWidth > vw,
            offscreen: present.filter((f) => f.top < -1 || f.bottom > vh + 1 || (!mayOffX.includes(f.role) && (f.left < -1 || f.right > vw + 1))).map((f) => f.role),
            small: present.filter((f) => !f.tally && (f.w < 43.5 || f.h < 43.5)).map((f) => `${f.role} ${Math.round(f.w)}x${Math.round(f.h)}`),
            overlaps,
          };
        }, { roles, mayOverlap: [...MAY_OVERLAP], mayOffX: [...MAY_BE_OFFSCREEN_X] });
        check(m.missing.length === 0, `${label}: roles not rendered: ${m.missing.join(', ')}`);
        check(!m.sideways, `${label}: the page scrolls sideways`);
        check(m.offscreen.length === 0, `${label}: roles cut off: ${m.offscreen.join(', ')}`);
        check(m.small.length === 0, `${label}: roles under 44px: ${m.small.join(', ')}`);
        check(m.overlaps.length === 0, `${label}: roles overlap: ${m.overlaps.join(', ')}`);
        if (process.env.SHOTS) await page.screenshot({ path: `tests/shots/${theme}-${skin}-${tier}-${dev.name}-room.png` });

        if (tier === 'spark') {
          await page.locator('[data-part="hero"]').click();
          await page.waitForSelector('[data-part="finale"][data-state="open"]');
          await page.waitForTimeout(500);
          const fin = await page.evaluate(() => {
            const r = document.querySelector('[data-part="finale"]').getBoundingClientRect();
            return { fits: r.left >= -1 && r.right <= window.innerWidth + 1 && r.top >= -1 && r.bottom <= window.innerHeight + 1, sideways: document.documentElement.scrollWidth > window.innerWidth };
          });
          check(fin.fits, `${label}: finale does not fit the viewport`);
          check(!fin.sideways, `${label}: finale scrolls the page sideways`);
        } else {
          await page.locator('[data-part="hub"]').click();
          await page.waitForSelector('[data-part="sheet"][data-state="open"]');
          await page.waitForTimeout(500);
          const sheet = await page.evaluate(() => {
            const vw = window.innerWidth, vh = window.innerHeight;
            const r = document.querySelector('[data-part="sheet"]').getBoundingClientRect();
            const body = document.querySelector('[data-part="sheet-body"]');
            return { fitsX: r.left >= -1 && r.right <= vw + 1, fitsY: r.top >= -1 && r.bottom <= vh + 1, sideways: body.scrollWidth > body.clientWidth + 1 };
          });
          check(sheet.fitsX && sheet.fitsY, `${label}: sheet does not fit the viewport`);
          check(!sheet.sideways, `${label}: sheet content scrolls sideways`);
        }
        check(problems.length === 0, `${label}: console errors ${problems.join(' | ')}`);
        await ctx.close();
      }
    }
  }

  // ---------------------------------------------------------------- 2. element fit (one world, every skin)
  for (const skin of SKINS) {
    const theme = THEMES[0];
    console.log(`[responsive] skin=${skin} element fit`);
    for (const dev of DEVICES) {
      const { ctx, page, problems } = await newPage(browser, dev);
      for (const c of FIT_CASES) {
        const label = `${c.label}@${dev.name} ${dev.width}x${dev.height}`;
        const q = new URLSearchParams({ tier: 'countdown', theme, skin, element: c.id, params: JSON.stringify(c.params) });
        await page.goto(`${BASE}/playground/gift.html?${q}`);
        await page.waitForSelector(`[data-part="sheet-body"] [data-element="${c.id}"]`);
        await page.waitForTimeout(700); // sheet slide-in + image/asset load

        const m = await page.evaluate((id) => {
          const body = document.querySelector('[data-part="sheet-body"]');
          const el = body.querySelector(`[data-element="${id}"]`);
          const vw = window.innerWidth;
          const buttons = [...body.querySelectorAll('button[data-part]')].filter((b) => b.offsetParent !== null).map((b) => {
            const r = b.getBoundingClientRect();
            return { part: b.dataset.part, w: r.width, h: r.height };
          });
          return {
            bodyOverflowY: body.scrollHeight - body.clientHeight,
            elOverflowY: el.scrollHeight - el.clientHeight,
            elHeight: el.getBoundingClientRect().height,
            sideways: body.scrollWidth > body.clientWidth + 1 || el.scrollWidth > el.clientWidth + 1 || document.documentElement.scrollWidth > vw,
            // tap targets: a part is exempt from the WIDTH rule only for wordle keys (10 keys across a phone)
            smallTaps: buttons.filter((b) => b.h < 43.5 || (b.w < 43.5 && !(id === 'wordle' && b.part === 'key'))).map((b) => `${b.part} ${Math.round(b.w)}x${Math.round(b.h)}`),
          };
        }, c.id);
        if (dev.portraitPhone) {
          check(m.bodyOverflowY <= 1, `${label}: sheet scrolls vertically by ${m.bodyOverflowY}px`);
          check(m.elOverflowY <= 1, `${label}: element scrolls vertically by ${m.elOverflowY}px`);
        }
        // an element in a size-container sheet can collapse to nothing in the auto-height desktop card: it must be visible
        check(m.elHeight >= 120, `${label}: the element is only ${Math.round(m.elHeight)}px tall (collapsed?)`);
        check(!m.sideways, `${label}: scrolls sideways`);
        check(m.smallTaps.length === 0, `${label}: tap targets under 44px: ${[...new Set(m.smallTaps)].join(', ')}`);
        if (process.env.SHOTS && ['wordle-5x5', 'memory-8-pairs', 'timeline-5', 'vault-10', 'jigsaw-3x3'].includes(c.label)) {
          await page.screenshot({ path: `tests/shots/fit-${c.label}-${dev.name}.png` });
        }
      }
      check(problems.length === 0, `element fit @${dev.name}: console errors ${problems.join(' | ')}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} responsive problem(s)` : '\nresponsive checks passed');
process.exit(failures ? 1 : 0);
