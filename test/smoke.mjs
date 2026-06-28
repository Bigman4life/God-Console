/* Headless browser smoke test for God Console.
   Loads index.html, drives commands, captures screenshots and console errors. */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexUrl = pathToFileURL(resolve(__dirname, '..', 'index.html')).href;
const shotDir = resolve(__dirname, '..', 'assets');

const errors = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(indexUrl);
await page.waitForTimeout(600);

async function type(cmd, wait = 800) {
  await page.click('#cmd');
  await page.fill('#cmd', cmd);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(wait);
}
async function shot(name) { await page.screenshot({ path: resolve(shotDir, name) }); console.log('shot:', name); }

// genesis -> pixel planet in space
await type('let there be light', 5200);
await type('create an earth-like planet', 1800);
await type('add three moons', 1800);
await shot('20-space-planet.png');

// descend to the God Eye surface
await type('create intelligent life', 800);
await type('go to surface', 2000);
await shot('21-godeye.png');

// zoom in for detailed (tier-2) sprites + bounce-in
await type('zoom in', 500);
await type('zoom in', 500);
await type('zoom in', 900);
await shot('25-godeye-detail.png');
await type('zoom out', 400);
await type('zoom out', 400);
await type('zoom out', 600);

// shape the surface
await type('grow a forest', 1200);
await type('plant cherry trees in the north', 1200);
await type('raise mountains in the east', 1200);
await type('flood the south', 1400);
await shot('22-surface-shaped.png');

// fire spreads
await type('build a village', 600);
await type('spawn animals', 600);
await type('set fire to the forest', 400);
await type('accelerate time', 2200);
await shot('23-surface-fire.png');
await type('pause', 200);

// back to space, then a desert world to verify regen
await type('return to space', 1600);
await type('make it volcanic', 1500);
await type('go to surface', 1800);
await shot('24-volcanic-surface.png');

const probe = await page.evaluate(() => {
  const W = window.GC.World;
  const s = window.GC.surface.stats();
  return { view: W.view, level: W.cam.level, climate: W.planet.climate, surf: s };
});
console.log('STATE:', JSON.stringify(probe));

await browser.close();
if (errors.length) {
  console.log('\n--- ERRORS (' + errors.length + ') ---');
  for (const e of errors.slice(0, 30)) console.log(e);
  process.exit(1);
} else console.log('\nNo console/page errors. ✓');
