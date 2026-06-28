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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
async function shot(name) {
  await page.screenshot({ path: resolve(shotDir, name) });
  console.log('shot:', name);
}

// 1. genesis
await type('let there be light', 5200);
await shot('01-genesis.png');

// 2. ocean planet + moons + rings
await type('create an ocean planet', 2500);
await type('add three moons', 2500);
await type('add rings', 1200);
await shot('02-ocean-moons.png');

// 3. life + civ + accelerate
await type('create intelligent life', 1200);
await type('accelerate time', 1500);
await page.waitForTimeout(2500);
await shot('03-life-time.png');

// 4. ice age
await type('start an ice age', 2000);
await shot('04-ice.png');

// 5. volcanic + make oceans red
await type('make it volcanic', 1500);
await type('make the oceans red', 1500);
await shot('05-volcanic.png');

// 6. zoom out to system, galaxy, universe
await type('pause', 300);
await type('zoom to solar system', 1500);
await shot('06-system.png');
await type('zoom to galaxy', 1500);
await shot('07-galaxy.png');
await type('zoom to universe', 1500);
await shot('08-universe.png');

// 7. zoom into surface + atom
await type('zoom to surface', 1500);
await shot('09-surface.png');
await type('zoom to atom', 1500);
await shot('10-atom.png');

// 8. undo a couple times
await type('zoom to planet', 800);
await type('double the size of the sun', 1500);
await shot('11-bigsun.png');

// state probe
const probe = await page.evaluate(() => {
  const W = window.GC.World;
  return {
    born: W.born, level: W.cam.level, climate: W.planet.climate,
    moons: W.planet.moons.length, gravity: W.planet.gravity,
    life: W.planet.life.present, civ: W.planet.civ.present,
    age: Math.round(W.time.age), star: Math.round(W.star.baseRadius),
  };
});
console.log('STATE:', JSON.stringify(probe));

await browser.close();

if (errors.length) {
  console.log('\n--- ERRORS (' + errors.length + ') ---');
  for (const e of errors.slice(0, 30)) console.log(e);
  process.exit(1);
} else {
  console.log('\nNo console/page errors. ✓');
}
