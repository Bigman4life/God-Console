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

// 2. ocean planet + moons + rings + auroras
await type('create an ocean planet', 2200);
await type('add three moons', 2200);
await type('add rings', 800);
await type('add auroras', 1200);
await shot('02-ocean-moons.png');

// 3. life + civ + accelerate (first contact)
await type('create intelligent life', 1000);
await type('accelerate time', 1500);
await page.waitForTimeout(2500);
await shot('03-life-time.png');
await type('pause', 300);

// 4. cosmic: comet + black hole companion
await type('spawn a comet', 600);
await type('a black hole orbits the moon', 1800);
await shot('12-blackhole.png');

// 5. supernova
await type('zoom to solar system', 1200);
await type('trigger a supernova', 1200);
await shot('13-supernova.png');
await page.waitForTimeout(2200);

// 6. what-if experiments
await type('zoom to planet', 800);
await type('create an earth-like planet', 1500);
await type('create life', 600);
await type('what if gravity was 10x?', 1500);
await shot('14-whatif.png');

// 7. asteroid impact
await type('what if dinosaurs survived?', 1000);
await type('strike the planet with an asteroid', 2600);
await shot('15-asteroid.png');

// 8. timelines + saved-universe browser
await type('branch timeline', 600);
await type('save my-cool-world', 800);
await type('list universes', 1000);
await shot('16-browser.png');

// 9. autocomplete suggestion bar
await page.click('#cmd');
await page.fill('#cmd', 'make it');
await page.dispatchEvent('#cmd', 'input');
await page.waitForTimeout(500);
await shot('17-suggest.png');
const sugCount = await page.evaluate(() => document.querySelectorAll('#suggest .sug').length);
console.log('suggestions shown:', sugCount);

// state probe
const probe = await page.evaluate(() => {
  const W = window.GC.World;
  return {
    born: W.born, level: W.cam.level, climate: W.planet.climate,
    moons: W.planet.moons.length, gravity: W.planet.gravity,
    blackHole: !!W.blackHole, starType: W.star.type,
    branches: W.branches.length, saves: W.listSaves().length,
    aurora: W.planet.aurora,
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
