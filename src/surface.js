/* God Console — surface.js
   The "God Eye": a top-down 2D pixel tilemap of a planet's surface
   (WorldBox / detailed-pixel style). Generated from the planet's seed and
   climate. Commands typed while in this view act ONLY on the surface.
   Static layers (biomes + trees) are baked to an offscreen canvas; dynamic
   layers (water shimmer, fire, units) draw each frame. */
(function (GC) {
  'use strict';
  const U = GC.util;

  // biome ids
  const B = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, ROCK: 4, PEAK: 5, SNOW: 6, DESERT: 7, LAVA: 8, ASH: 9, MARSH: 10, SAVANNA: 11, CLOSE: 12 };
  // tree types
  const TR = { NONE: 0, GREEN: 1, AUTUMN: 2, BLOSSOM: 3, PINE: 4, JUNGLE: 5, DEAD: 6 };

  const PAL = {
    [B.DEEP]: ['#173a6b', '#1b4378'],
    [B.WATER]: ['#3a83d6', '#4a90dd'],     // shallow / coastal
    [B.CLOSE]: ['#2f73c4', '#357bcb'],     // mid ocean
    [B.SAND]: ['#e0cf94', '#d4c386'],
    [B.GRASS]: ['#57a23a', '#63aa44'],
    [B.ROCK]: ['#5a5a62', '#6a6a74'],
    [B.PEAK]: ['#3a3a42', '#46464e'],      // dark volcanic/obsidian rock (snow drawn on top)
    [B.SNOW]: ['#e9f1f7', '#dbe6ef'],
    [B.DESERT]: ['#d3bd6f', '#c6ae60'],
    [B.LAVA]: ['#e0591f', '#c8431a'],
    [B.ASH]: ['#3a3438', '#443d42'],
    [B.MARSH]: ['#3f7d5a', '#478a63'],
    [B.SAVANNA]: ['#c2b25f', '#cbbb69'],
  };
  const TREE_COL = {
    [TR.GREEN]: ['#2f7d2a', '#3c9636', '#205a1c'],
    [TR.AUTUMN]: ['#c64a1f', '#dd7a22', '#922f12'],
    [TR.BLOSSOM]: ['#df84b0', '#ef9ec4', '#b85d8a'],
    [TR.PINE]: ['#1f5f3a', '#2a7449', '#16462a'],
    [TR.JUNGLE]: ['#1f7a32', '#2a9440', '#155322'],
    [TR.DEAD]: ['#6b5746', '#7d6754', '#4a3a2c'],
  };
  // flower / small-plant colours (flora ids 1..6) — the dense carpet in the refs
  const FLORA = {
    1: ['#d23b3b', '#e85a5a'],   // red
    2: ['#e07a1f', '#f09a3a'],   // orange
    3: ['#e6c63a', '#f2da5a'],   // yellow
    4: ['#a64fc4', '#c46fe0'],   // purple
    5: ['#d46fa0', '#e88fb8'],   // pink
    6: ['#3f8a3a', '#4fa048'],   // bush (green)
  };

  let MW = 0, MH = 0;
  let elev, moist, biome, tree, fire, flora, coast;
  let waterTiles = [];
  let units = [], villages = [];
  let generated = false;
  let seaLevel = 0.48;
  let camX = 0.5, camY = 0.5, zoom = 1; // view focus (0..1) + zoom factor
  let curTier = 0, lastTier = 0, bounceStart = -10; // LOD bounce-in state

  // static-base cache (terrain blends are expensive, so bake & blit)
  let baseCache = null, bctx2 = null, baseKey = '', mapVersion = 0;
  // precomputed per-biome shade variants (organic, non-checker) + ocean depth ramp
  let SHADES = null, DEEP_RGB, SHAL_RGB;
  function buildShades() {
    SHADES = {};
    for (const k in PAL) {
      const base = U.mix(U.hexRgb(PAL[k][0]), U.hexRgb(PAL[k][1]), 0.5);
      SHADES[k] = [-0.09, -0.03, 0.03, 0.09].map((a) => U.rgbStr(U.shade(base, a)));
    }
    DEEP_RGB = U.hexRgb('#0e2a52'); SHAL_RGB = U.hexRgb('#5aa0e0');
  }
  function tileShade(b, x, y) {
    if (!SHADES) buildShades();
    const v = ((hash(x, y, 91) * 4) | 0) & 3;
    return SHADES[b][v];
  }

  function hash(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 0x9e3779b1)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = U.smooth(xf), v = U.smooth(yf);
    const a = U.lerp(hash(xi, yi, s), hash(xi + 1, yi, s), u);
    const b = U.lerp(hash(xi, yi + 1, s), hash(xi + 1, yi + 1, s), u);
    return U.lerp(a, b, v);
  }
  function fbm(x, y, s) {
    let v = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 5; o++) { v += vnoise(x * f, y * f, s + o * 17) * amp; amp *= 0.5; f *= 2; }
    return v;
  }

  function idx(x, y) { return y * MW + x; }
  function inb(x, y) { return x >= 0 && y >= 0 && x < MW && y < MH; }
  function easeOutBack(p) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }

  /* ---------- generation ---------- */
  function generate(planet) {
    MW = 192; MH = 120;          // finer grid -> smaller tiles, more pixel detail
    const n = MW * MH;
    elev = new Float32Array(n); moist = new Float32Array(n);
    biome = new Uint8Array(n); tree = new Uint8Array(n); fire = new Uint8Array(n); flora = new Uint8Array(n);
    units = []; villages = []; waterTiles = [];
    const seed = planet.seed | 0;
    const cl = planet.climate;
    const sea = cl === 'ocean' ? 0.56 : cl === 'desert' ? 0.40 : cl === 'barren' ? 0.46 : 0.48;
    seaLevel = sea; mapVersion++;
    const tempBase = ({ ice: -0.5, volcanic: 0.7, desert: 0.6, jungle: 0.45, ocean: 0.2, barren: -0.1, temperate: 0.25 })[cl] ?? 0.25;
    const scale = 5.2;
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const nx = x / MW * scale, ny = y / MH * scale;
        let e = fbm(nx, ny, seed);
        const dx = (x / MW - 0.5) * 2, dy = (y / MH - 0.5) * 2;
        e -= Math.pow(dx * dx + dy * dy, 1.4) * 0.30;
        const m = fbm(nx + 100, ny + 100, seed ^ 0x55);
        const lat = 1 - Math.abs(y / MH - 0.5) * 2;
        const temp = tempBase + (lat - 0.5) * 0.9 - (e > sea ? (e - sea) * 0.8 : 0);
        elev[idx(x, y)] = e; moist[idx(x, y)] = m;
        biome[idx(x, y)] = classify(e, m, temp, sea, cl);
      }
    }
    // beaches: land tiles next to water become sand (if low)
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = idx(x, y);
      if ((biome[i] === B.GRASS || biome[i] === B.SAVANNA) && elev[i] < sea + 0.06 && nearWater(x, y)) biome[i] = B.SAND;
    }
    // trees, flora carpet, water list
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = idx(x, y), b = biome[i], m = moist[i];
      if (b === B.DEEP || b === B.WATER || b === B.CLOSE) waterTiles.push(i);
      const lat = 1 - Math.abs(y / MH - 0.5) * 2;
      const temp = tempBase + (lat - 0.5) * 0.9;
      if ((b === B.GRASS || b === B.MARSH) && m > 0.42) {
        if (hash(x, y, seed ^ 0x9) < (b === B.MARSH ? 0.72 : 0.42)) tree[i] = treeType(temp, m, cl);
      }
      // dense flower/plant carpet on open grass & savanna (the WorldBox look)
      if (!tree[i] && (b === B.GRASS || b === B.SAVANNA || b === B.MARSH)) {
        const dens = b === B.SAVANNA ? 0.30 : 0.62;
        if (hash(x, y, seed ^ 0x3c1) < dens * (0.5 + m)) flora[i] = floraType(temp, m, x, y, seed, cl);
      }
    }
    if (planet.civ && planet.civ.present) seedVillages(planet.civ.level + 2);
    if (planet.life && planet.life.present) seedAnimals(40);
    generated = true;
  }

  function classify(e, m, temp, sea, cl) {
    if (e < sea - 0.10) return B.DEEP;
    if (e < sea - 0.04) return B.CLOSE;
    if (e < sea) return B.WATER;
    if (cl === 'volcanic' && e > sea && e < sea + 0.05 && m < 0.4) return B.LAVA;
    if (e > 0.80) return B.PEAK;
    if (e > 0.68) return cl === 'volcanic' ? B.PEAK : B.ROCK;
    if (temp < -0.15) return B.SNOW;
    if (temp > 0.5 && m < 0.30) return cl === 'volcanic' ? B.ASH : B.DESERT;
    if (temp > 0.34 && m < 0.46) return B.SAVANNA;
    if (m > 0.66 && temp > 0.1) return B.MARSH;
    return B.GRASS;
  }
  function floraType(temp, m, x, y, seed, cl) {
    if (cl === 'volcanic' || cl === 'barren') return 0;
    const r = hash(x, y, seed ^ 0x7ff);
    if (r < 0.18) return 6;                 // bush
    if (m > 0.6) return r < 0.5 ? 5 : 4;    // wet: pink/purple
    if (temp > 0.4) return r < 0.5 ? 3 : 2; // warm: yellow/orange
    return r < 0.4 ? 1 : (r < 0.7 ? 3 : 4); // red/yellow/purple mix
  }
  function treeType(temp, m, cl) {
    if (cl === 'volcanic') return TR.DEAD;
    if (temp < -0.05) return TR.PINE;
    if (temp > 0.45 && m > 0.5) return TR.JUNGLE;
    if (temp < 0.18) return TR.AUTUMN;
    if (m > 0.62) return TR.BLOSSOM;
    return TR.GREEN;
  }
  function nearWater(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (inb(x + dx, y + dy)) { const b = biome[idx(x + dx, y + dy)]; if (b === B.WATER || b === B.DEEP || b === B.CLOSE) return true; }
    }
    return false;
  }
  function seedVillages(count) {
    let placed = 0, tries = 0;
    while (placed < count && tries++ < 500) {
      const x = U.randInt(2, MW - 3), y = U.randInt(2, MH - 3), i = idx(x, y);
      if (biome[i] === B.GRASS || biome[i] === B.SAND) { villages.push({ x, y, size: U.randInt(1, 3) }); placed++; }
    }
  }
  function seedAnimals(count) {
    let placed = 0, tries = 0;
    while (placed < count && tries++ < 800) {
      const x = U.randInt(0, MW - 1), y = U.randInt(0, MH - 1), i = idx(x, y);
      const b = biome[i];
      if (b !== B.DEEP && b !== B.WATER && b !== B.CLOSE && b !== B.LAVA) { units.push({ x, y, t: tree[i] ? 'deer' : 'critter', cd: U.rand(0, 1) }); placed++; }
    }
  }

  /* ---------- per-tile direct drawing (crisp; no baked downscale) ---------- */
  // village hut footprints, indexed by tile for quick draw
  const villageAt = {};
  function indexVillages() { for (const k in villageAt) delete villageAt[k]; for (const v of villages) villageAt[v.y * MW + v.x] = v; }

  // LOD tier from tile size T (buffer px): 0 far specks · 1 clusters · 2 full sprites
  function tierFor(T) { return T < 9 ? 0 : T < 16 ? 1 : 2; }

  const isWater = (b) => b === B.DEEP || b === B.CLOSE || b === B.WATER;
  function waterColor(e) {
    // continuous ocean depth: deeper -> darker. e ranges roughly [seaLevel-0.25 .. seaLevel]
    const f = U.clamp((e - (seaLevel - 0.22)) / 0.22, 0, 1);
    return U.mix(DEEP_RGB, SHAL_RGB, f);
  }

  // one tile of the STATIC base layer: organic shade, ocean depth, blended edges
  function drawTileBase(ctx, x, y, sx, sy, T) {
    if (!SHADES) buildShades();
    const i = idx(x, y), b = biome[i];
    // base fill
    if (isWater(b)) {
      const c = waterColor(elev[i]);
      const v = (hash(x, y, 91) * 6 | 0) % 3 - 1;        // tiny ripple variation
      ctx.fillStyle = U.rgbStr([c[0] + v * 3, c[1] + v * 3, c[2] + v * 4]);
    } else {
      ctx.fillStyle = tileShade(b, x, y);
    }
    ctx.fillRect(sx, sy, T + 1, T + 1);

    // mountain shading (3D bevel)
    if (b === B.PEAK || b === B.ROCK) {
      ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fillRect(sx, sy, T + 1, Math.max(1, T * 0.3));
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(sx, sy + T - Math.max(1, T * 0.3), T + 1, Math.max(1, T * 0.3));
    }

    // ---- blend edges: dither neighbour colour along differing borders ----
    // (this dissolves the hard tile grid so same-biome areas read as one mass)
    const step = Math.max(1, T >> 2);
    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 2 ? 1 : d === 3 ? -1 : 0);
      const ny = y + (d === 0 ? -1 : d === 1 ? 1 : 0);
      if (!inb(nx, ny)) continue;
      const nb = biome[idx(nx, ny)];
      if (nb === b || (isWater(nb) && isWater(b))) continue;
      // colour of the neighbour to bleed in
      ctx.fillStyle = isWater(nb) ? U.rgbStr(waterColor(elev[idx(nx, ny)])) : tileShade(nb, nx, ny);
      const w = Math.max(1, Math.min(3, Math.round(T * 0.3)));  // thin fringe at all zooms
      for (let p = 0; p <= T; p += 2) {                  // 1-bit dither strip
        if (d === 0) ctx.fillRect(sx + p, sy, 1, w);                    // top
        else if (d === 1) ctx.fillRect(sx + p, sy + T - w, 1, w);       // bottom
        else if (d === 2) ctx.fillRect(sx + T - w, sy + p, w, 1);       // right
        else ctx.fillRect(sx, sy + p, w, 1);                            // left
      }
    }

    // coastal foam: lighten land/sand edge touching water
    if (!isWater(b)) {
      for (let d = 0; d < 4; d++) {
        const nx = x + (d === 2 ? 1 : d === 3 ? -1 : 0), ny = y + (d === 0 ? -1 : d === 1 ? 1 : 0);
        if (inb(nx, ny) && isWater(biome[idx(nx, ny)])) { ctx.fillStyle = 'rgba(255,255,255,0.10)'; break; }
      }
    }
  }

  // objects (trees/flora/mountains-snow/lava/villages) with LOD + sway + bounce
  function drawTileObjects(ctx, x, y, sx, sy, T, env) {
    const i = idx(x, y), b = biome[i];
    const t = env.t, tier = env.tier, bs = env.bounce;
    // snow caps & lava glow scale with detail too
    if (b === B.PEAK && tier >= 1) { ctx.fillStyle = '#eef3f8'; ctx.fillRect(sx + (T >> 2), sy, Math.max(1, T >> 1), Math.max(1, T * 0.3)); }
    if (b === B.LAVA) { const fl = 0.5 + 0.5 * Math.sin(t * 6 + (x + y)); ctx.fillStyle = fl > 0.6 ? '#ffd24a' : '#ff8a2a'; ctx.fillRect(sx + (T >> 2), sy + (T >> 2), Math.max(1, T * 0.45), Math.max(1, T * 0.45)); }

    const v = villageAt[i];
    if (v) { drawVillage(ctx, sx, sy, T, v); return; }
    if (tree[i]) { drawTree(ctx, x, y, sx, sy, T, tree[i], tier, bs, t); return; }
    if (flora[i]) drawFlora(ctx, x, y, sx, sy, T, flora[i], tier, bs);
  }

  // soft pixel shadow under a sub-tile object
  function drawShadow(ctx, sx, sy, T, w) {
    const cx = sx + (T >> 1), by = sy + T - Math.max(1, (T * 0.12) | 0);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(cx - (w >> 1), by, w, Math.max(1, (T * 0.14) | 0));
    ctx.fillRect(cx - (w >> 1) + 1, by - 1, Math.max(1, w - 2), 1);
  }

  function drawTree(ctx, x, y, sx, sy, T, ty, tier, bs, t) {
    const c = TREE_COL[ty];
    if (tier === 0) { ctx.fillStyle = c[0]; ctx.fillRect(sx + (T >> 1) - 1, sy + (T >> 1) - 1, 2, 2); return; }
    const sway = tier === 2 ? Math.round(Math.sin(t * 1.8 + (x * 13 + y * 7)) * Math.max(1, T * 0.06)) : 0;
    let cw = Math.max(3, Math.round(T * (tier === 1 ? 0.72 : 0.9)));
    cw = Math.max(2, Math.round(cw * bs));
    drawShadow(ctx, sx, sy, T, Math.max(3, cw - 1));
    const bx = sx + ((T - cw) >> 1) + sway, by = sy + Math.max(0, Math.floor(T * 0.02));
    if (tier === 2) { ctx.fillStyle = '#4a3320'; ctx.fillRect(sx + (T >> 1) - 1, sy + T - Math.max(2, T * 0.3), 2, Math.max(2, T * 0.3)); }
    // rounded canopy: body + clipped corners + highlight
    ctx.fillStyle = c[2]; ctx.fillRect(bx + 1, by, cw - 2, cw); ctx.fillRect(bx, by + 1, cw, cw - 2);
    ctx.fillStyle = c[0]; ctx.fillRect(bx + 1, by + 1, cw - 2, cw - 3);
    ctx.fillStyle = c[1]; ctx.fillRect(bx + 2, by + 2, Math.max(1, cw - 5), Math.max(1, ((cw - 4) >> 1)));
  }

  function drawFlora(ctx, x, y, sx, sy, T, ft, tier, bs) {
    const c = FLORA[ft];
    const cx = sx + (T >> 1), cy = sy + (T >> 1);
    if (tier === 0) { ctx.fillStyle = c[0]; ctx.fillRect(cx - 1, cy - 1, 2, 2); return; }
    if (ft === 6) { // bush
      let w = Math.max(2, Math.round(T * 0.5 * bs));
      if (tier >= 2) drawShadow(ctx, sx, sy, T, w);
      ctx.fillStyle = c[0]; ctx.fillRect(cx - (w >> 1), cy - (w >> 1), w, w);
      ctx.fillStyle = c[1]; ctx.fillRect(cx - (w >> 1), cy - (w >> 1), Math.max(1, w - 1), Math.max(1, w >> 1));
      return;
    }
    if (tier === 1) { ctx.fillStyle = c[0]; ctx.fillRect(cx - 1, cy - 1, 2, 2); ctx.fillStyle = c[1]; ctx.fillRect(cx, cy - 1, 1, 1); return; }
    // tier 2: little flower — stem + petals + center
    const s = Math.max(3, Math.round(T * 0.42 * bs));
    ctx.fillStyle = '#3f7a32'; ctx.fillRect(cx, cy, 1, Math.max(1, (T * 0.28) | 0)); // stem
    ctx.fillStyle = c[0]; ctx.fillRect(cx - (s >> 1), cy - (s >> 1), s, s);
    ctx.fillStyle = c[1]; ctx.fillRect(cx - (s >> 1) + 1, cy - (s >> 1), Math.max(1, s - 2), 1);
    ctx.fillStyle = '#f2da5a'; ctx.fillRect(cx, cy, 1, 1); // center
  }

  function drawVillage(ctx, sx, sy, T, v) {
    drawShadow(ctx, sx, sy, T, Math.max(3, T - 2));
    const n = Math.min(4, v.size + 1);
    for (let k = 0; k < n; k++) {
      const ox = sx + (k % 2) * (T >> 1), oy = sy + ((k / 2) | 0) * (T >> 1);
      const w = Math.max(2, T >> 1) - 1;
      ctx.fillStyle = '#6b4636'; ctx.fillRect(ox, oy + (w >> 1), w, Math.max(1, w >> 1)); // wall
      ctx.fillStyle = '#b35a3c'; ctx.fillRect(ox, oy, w, Math.max(1, w >> 1));            // roof
      ctx.fillStyle = '#c97a52'; ctx.fillRect(ox, oy, w, 1);                              // roof highlight
    }
  }

  /* ---------- editing operations (god powers on the surface) ---------- */
  function region(name) {
    // returns predicate(x,y)
    switch (name) {
      case 'north': return (x, y) => y < MH * 0.4;
      case 'south': return (x, y) => y > MH * 0.6;
      case 'west': return (x, y) => x < MW * 0.4;
      case 'east': return (x, y) => x > MW * 0.6;
      case 'center': return (x, y) => Math.abs(x - MW / 2) < MW * 0.22 && Math.abs(y - MH / 2) < MH * 0.28;
      default: return () => true;
    }
  }
  function eachLand(pred, fn) {
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (!pred(x, y)) continue;
      const i = idx(x, y), b = biome[i];
      if (b === B.DEEP || b === B.WATER || b === B.CLOSE) continue;
      fn(x, y, i);
    }
  }

  const ops = {
    forest(p) {
      const ty = p.tree || null;
      eachLand(region(p.region), (x, y, i) => {
        if ((biome[i] === B.GRASS || biome[i] === B.MARSH || biome[i] === B.SAVANNA) && Math.random() < 0.55) {
          tree[i] = ty || treeType(0.2, 0.6, GC.World.planet.climate); flora[i] = 0;
        }
      });
    },
    deforest(p) { eachLand(region(p.region), (x, y, i) => { tree[i] = 0; }); },
    flowers(p) {
      const ty = p.flowerType;
      eachLand(region(p.region), (x, y, i) => {
        if ((biome[i] === B.GRASS || biome[i] === B.SAVANNA || biome[i] === B.MARSH) && !tree[i] && Math.random() < 0.7)
          flora[i] = ty || floraType(0.3, moist[i], x, y, GC.World.seed ^ (Date.now() & 0xffff), GC.World.planet.climate) || 3;
      });
    },
    grass(p) { eachLand(region(p.region), (x, y, i) => { if (biome[i] !== B.PEAK && biome[i] !== B.ROCK) { biome[i] = B.GRASS; } }); },
    desert(p) { eachLand(region(p.region), (x, y, i) => { biome[i] = B.DESERT; tree[i] = 0; flora[i] = 0; }); },
    snow(p) { eachLand(region(p.region), (x, y, i) => { biome[i] = B.SNOW; flora[i] = 0; if (tree[i]) tree[i] = TR.PINE; }); },
    mountains(p) {
      eachLand(region(p.region), (x, y, i) => { if (Math.random() < 0.5) { biome[i] = Math.random() < 0.4 ? B.PEAK : B.ROCK; tree[i] = 0; flora[i] = 0; elev[i] = 0.85; } });
    },
    flatten(p) { eachLand(region(p.region), (x, y, i) => { if (biome[i] === B.PEAK || biome[i] === B.ROCK) { biome[i] = B.GRASS; elev[i] = 0.55; } }); },
    flood(p) {
      const pred = region(p.region);
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
        const i = idx(x, y);
        if (pred(x, y) && biome[i] !== B.PEAK && biome[i] !== B.ROCK && elev[i] < 0.62) { biome[i] = elev[i] < 0.5 ? B.DEEP : B.WATER; tree[i] = 0; }
      }
      recomputeWater();
    },
    drain(p) {
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
        const i = idx(x, y);
        if (biome[i] === B.WATER || biome[i] === B.DEEP || biome[i] === B.CLOSE) { biome[i] = B.SAND; elev[i] = 0.5; }
      }
      recomputeWater();
    },
    lava(p) { eachLand(region(p.region), (x, y, i) => { if (Math.random() < 0.4) { biome[i] = B.LAVA; tree[i] = 0; flora[i] = 0; } }); },
    fire(p) {
      let lit = 0;
      eachLand(region(p.region), (x, y, i) => { if (tree[i] && lit < 30 && Math.random() < 0.3) { fire[i] = 60; lit++; } });
    },
    village(p) { seedVillages((p.count || 3)); },
    animals(p) { seedAnimals((p.count || 30)); },
    rain(p) { for (let i = 0; i < fire.length; i++) if (fire[i]) fire[i] = 0; },
  };

  function recomputeWater() {
    waterTiles = [];
    for (let i = 0; i < biome.length; i++) if (biome[i] === B.DEEP || biome[i] === B.WATER || biome[i] === B.CLOSE) waterTiles.push(i);
  }

  // returns true if it handled the verb (surface-relevant); false otherwise
  function S_handle(it) {
    const v = it.verb, p = it.params || {};
    const map = {
      forest: () => ops.forest(p), deforest: () => ops.deforest(p),
      grass: () => ops.grass(p), desert: () => ops.desert(p), snow: () => ops.snow(p),
      mountains: () => ops.mountains(p), flatten: () => ops.flatten(p),
      flood: () => ops.flood(p), drain: () => ops.drain(p), lava: () => ops.lava(p),
      fire: () => ops.fire(p), village: () => ops.village(p), animals: () => ops.animals(p),
      rain: () => ops.rain(p), flowers: () => ops.flowers(p),
    };
    if (!map[v]) return false;
    map[v](); mapVersion++;
    return true;
  }

  /* ---------- simulation ---------- */
  let acc = 0;
  function tick(dt, scale) {
    if (!generated) return;
    const speed = U.clamp(scale, 1, 1e6);
    acc += dt * Math.min(60, 1 + Math.log10(speed + 1) * 6);
    // fire spread
    let changed = false;
    if (acc >= 1) {
      acc = 0;
      // process fire on a sampled subset for performance
      for (let k = 0; k < 400; k++) {
        const i = (Math.random() * biome.length) | 0;
        if (fire[i] > 0) {
          fire[i]--;
          const x = i % MW, y = (i / MW) | 0;
          // spread
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (inb(x + dx, y + dy)) {
              const j = idx(x + dx, y + dy);
              if (!fire[j] && (tree[j] || biome[j] === B.GRASS || biome[j] === B.MARSH) && Math.random() < 0.25) fire[j] = 50;
            }
          }
          if (fire[i] === 0) { tree[i] = 0; biome[i] = B.ASH; changed = true; }
        }
      }
      // ash regrows + tree spread
      for (let k = 0; k < 200; k++) {
        const i = (Math.random() * biome.length) | 0;
        if (biome[i] === B.ASH && Math.random() < 0.02) { biome[i] = B.GRASS; changed = true; }
        else if (biome[i] === B.GRASS && !tree[i] && Math.random() < 0.01) {
          const x = i % MW, y = (i / MW) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (inb(x + dx, y + dy) && tree[idx(x + dx, y + dy)]) { tree[i] = tree[idx(x + dx, y + dy)]; changed = true; break; }
          }
        }
      }
    }
    // units wander every frame (cheap)
    for (const u of units) {
      if (Math.random() < 0.1 * Math.min(6, speed)) {
        const nx = u.x + U.randInt(-1, 1), ny = u.y + U.randInt(-1, 1);
        if (inb(nx, ny)) { const b = biome[idx(nx, ny)]; if (b !== B.DEEP && b !== B.WATER && b !== B.CLOSE && b !== B.LAVA) { u.x = nx; u.y = ny; } }
      }
    }
    if (changed) mapVersion++;
  }

  /* ---------- render (direct crisp tiles, no downscale) ---------- */
  function render(ctx, opt) {
    const W = opt.W, H = opt.H, t = opt.t, tr = opt.tr;
    if (!generated) generate(GC.World.planet);
    indexVillages();

    // integer tile size in buffer px (smaller tiles -> more pixel detail)
    const baseAcross = 130;
    const T = Math.max(4, Math.round((W / baseAcross) * zoom));
    // camera: top-left tile offset so (camX,camY) of the map sits at view center
    const viewTilesX = W / T, viewTilesY = H / T;
    let originX = camX * MW - viewTilesX / 2;
    let originY = camY * MH - viewTilesY / 2;
    originX = U.clamp(originX, 0, Math.max(0, MW - viewTilesX));
    originY = U.clamp(originY, 0, Math.max(0, MH - viewTilesY));

    ctx.fillStyle = '#070a12'; ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (tr < 1) { const s = U.lerp(opt.dir < 0 ? 1.25 : 0.85, 1, tr); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); ctx.globalAlpha = U.lerp(0.25, 1, tr); }
    ctx.imageSmoothingEnabled = false;

    const x0 = Math.floor(originX), y0 = Math.floor(originY);
    const offX = -((originX - x0) * T), offY = -((originY - y0) * T);
    const cols = Math.ceil(viewTilesX) + 1, rows = Math.ceil(viewTilesY) + 1;

    // LOD tier + bounce-in: when detail tier increases, sprites pop in with overshoot
    curTier = tierFor(T);
    if (curTier > lastTier) bounceStart = t;
    lastTier = curTier;
    const bp = U.clamp((t - bounceStart) / 0.4, 0, 1);
    const bounce = bp >= 1 ? 1 : easeOutBack(bp);
    const env = { t, tier: curTier, bounce };

    // pass 1: STATIC base layer (biomes + blended edges + ocean depth) — cached
    const key = mapVersion + '|' + T + '|' + W + '|' + H + '|' + camX.toFixed(3) + '|' + camY.toFixed(3);
    if (key !== baseKey) {
      if (!baseCache) { baseCache = document.createElement('canvas'); bctx2 = baseCache.getContext('2d'); }
      if (baseCache.width !== W || baseCache.height !== H) { baseCache.width = W; baseCache.height = H; }
      bctx2.imageSmoothingEnabled = false;
      bctx2.fillStyle = '#070a12'; bctx2.fillRect(0, 0, W, H);
      for (let ry = 0; ry < rows; ry++) {
        const ty = y0 + ry; if (ty < 0 || ty >= MH) continue;
        const sy = Math.round(offY + ry * T);
        for (let rx = 0; rx < cols; rx++) {
          const tx = x0 + rx; if (tx < 0 || tx >= MW) continue;
          drawTileBase(bctx2, tx, ty, Math.round(offX + rx * T), sy, T);
        }
      }
      baseKey = key;
    }
    ctx.drawImage(baseCache, 0, 0);

    // pass 2: objects (trees/flora/villages) on top, so they overlap neighbours cleanly
    for (let ry = 0; ry < rows; ry++) {
      const ty = y0 + ry; if (ty < 0 || ty >= MH) continue;
      const sy = Math.round(offY + ry * T);
      for (let rx = 0; rx < cols; rx++) {
        const tx = x0 + rx; if (tx < 0 || tx >= MW) continue;
        drawTileObjects(ctx, tx, ty, Math.round(offX + rx * T), sy, T, env);
      }
    }

    // animated water shimmer
    const tw = (t * 5) | 0;
    ctx.fillStyle = 'rgba(225,245,255,0.55)';
    for (let ry = 0; ry < rows; ry++) {
      const ty = y0 + ry; if (ty < 0 || ty >= MH) continue;
      for (let rx = 0; rx < cols; rx++) {
        const tx = x0 + rx; if (tx < 0 || tx >= MW) continue;
        const b = biome[idx(tx, ty)];
        if ((b === B.WATER || b === B.DEEP || b === B.CLOSE) && ((tx + ty + tw) % 6) === 0)
          ctx.fillRect(Math.round(offX + rx * T) + 1, Math.round(offY + ry * T) + 1 + (tw % 2), Math.max(1, T * 0.35) | 0, 1);
      }
    }

    // fire
    for (let i = 0; i < fire.length; i++) {
      if (fire[i] > 0) {
        const x = i % MW, y = (i / MW) | 0;
        if (x < x0 || x >= x0 + cols || y < y0 || y >= y0 + rows) continue;
        const fx = offX + (x - x0) * T, fy = offY + (y - y0) * T;
        ctx.fillStyle = Math.random() < 0.5 ? '#ff7a1f' : '#ffd24a';
        ctx.fillRect(fx | 0, (fy - T * 0.3) | 0, Math.max(1, T * 0.7) | 0, Math.max(1, T) | 0);
      }
    }

    // units
    for (const u of units) {
      if (u.x < x0 || u.x >= x0 + cols || u.y < y0 || u.y >= y0 + rows) continue;
      const ux = offX + (u.x - x0) * T + T * 0.28, uy = offY + (u.y - y0) * T + T * 0.28;
      ctx.fillStyle = u.t === 'deer' ? '#caa06a' : '#e6e0cf';
      const us = Math.max(1, T * 0.4) | 0; ctx.fillRect(ux | 0, uy | 0, us, us);
    }

    ctx.restore();

    // top-down light vignette
    const vg = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(255,250,230,0.05)'); vg.addColorStop(1, 'rgba(0,0,8,0.4)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  function enter(planet) {
    if (!generated || S_lastSeed !== planet.seed || S_lastClimate !== planet.climate) {
      generate(planet); S_lastSeed = planet.seed; S_lastClimate = planet.climate;
    }
    zoom = 1.0; camX = camY = 0.5;
  }
  function invalidate() { generated = false; }
  let S_lastSeed = null, S_lastClimate = null;

  function stats() {
    if (!generated) return { trees: 0, water: 0, villages: 0, units: 0 };
    let trees = 0; for (let i = 0; i < tree.length; i++) if (tree[i]) trees++;
    return { trees, water: waterTiles.length, villages: villages.length, units: units.length };
  }

  GC.surface = {
    render, tick, enter, invalidate, stats,
    handle: function (it) { return S_handle(it); },
    zoomBy: function (f) { zoom = U.clamp(zoom * f, 0.7, 6); },
    atMin: function () { return zoom <= 0.72; },
  };
})(window.GC = window.GC || {});
