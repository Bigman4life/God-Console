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
  const B = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, ROCK: 4, PEAK: 5, SNOW: 6, DESERT: 7, LAVA: 8, ASH: 9, MARSH: 10 };
  // tree types
  const TR = { NONE: 0, GREEN: 1, AUTUMN: 2, BLOSSOM: 3, PINE: 4, JUNGLE: 5, DEAD: 6 };

  const PAL = {
    [B.DEEP]: ['#173a6b', '#1b4378'],
    [B.WATER]: ['#2f73c4', '#3a83d6'],
    [B.SAND]: ['#d8c98f', '#cabd83'],
    [B.GRASS]: ['#5a9e3c', '#69ab46'],
    [B.ROCK]: ['#4a4a52', '#565660'],
    [B.PEAK]: ['#d7dbe2', '#c2c7d0'],
    [B.SNOW]: ['#e9f1f7', '#dbe6ef'],
    [B.DESERT]: ['#cda85e', '#bd9a52'],
    [B.LAVA]: ['#e0591f', '#c8431a'],
    [B.ASH]: ['#3a3438', '#443d42'],
    [B.MARSH]: ['#3f7d5a', '#478a63'],
  };
  const TREE_COL = {
    [TR.GREEN]: ['#2f7d2a', '#3c9636', '#205a1c'],
    [TR.AUTUMN]: ['#c87a1f', '#d98f2c', '#9c5a14'],
    [TR.BLOSSOM]: ['#cf6f9e', '#e08bb4', '#a8547d'],
    [TR.PINE]: ['#1f5f3a', '#2a7449', '#16462a'],
    [TR.JUNGLE]: ['#1f7a32', '#2a9440', '#155322'],
    [TR.DEAD]: ['#5a4a3a', '#6b5746', '#42352a'],
  };

  const TS = 9;          // baked tile size in px
  let MW = 0, MH = 0;
  let elev, moist, biome, tree, fire;
  let waterTiles = [];
  let units = [], villages = [];
  let base = null, bctx = null, dirty = true, generated = false;
  let camX = 0.5, camY = 0.5, zoom = 1; // view focus (0..1) + zoom factor

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

  /* ---------- generation ---------- */
  function generate(planet) {
    MW = 128; MH = 80;
    const n = MW * MH;
    elev = new Float32Array(n); moist = new Float32Array(n);
    biome = new Uint8Array(n); tree = new Uint8Array(n); fire = new Uint8Array(n);
    units = []; villages = []; waterTiles = [];
    const seed = planet.seed | 0;
    const cl = planet.climate;
    const sea = cl === 'ocean' ? 0.56 : cl === 'desert' ? 0.40 : cl === 'barren' ? 0.46 : 0.48;
    const tempBase = ({ ice: -0.5, volcanic: 0.7, desert: 0.6, jungle: 0.45, ocean: 0.2, barren: -0.1, temperate: 0.25 })[cl] ?? 0.25;
    const scale = 5.2;
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const nx = x / MW * scale, ny = y / MH * scale;
        let e = fbm(nx, ny, seed);
        // island-ish falloff toward edges so the "world" reads as a landmass set in ocean
        const dx = (x / MW - 0.5) * 2, dy = (y / MH - 0.5) * 2;
        e -= Math.pow(dx * dx + dy * dy, 1.4) * 0.30;
        const m = fbm(nx + 100, ny + 100, seed ^ 0x55);
        const lat = 1 - Math.abs(y / MH - 0.5) * 2;        // 1 at equator, 0 at poles
        const temp = tempBase + (lat - 0.5) * 0.9 - (e > sea ? (e - sea) * 0.8 : 0);
        elev[idx(x, y)] = e; moist[idx(x, y)] = m;
        biome[idx(x, y)] = classify(e, m, temp, sea, cl);
      }
    }
    // beaches: land tiles next to water become sand (if low)
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = idx(x, y);
      if (biome[i] === B.GRASS && elev[i] < sea + 0.06 && nearWater(x, y)) biome[i] = B.SAND;
    }
    // trees + water list
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = idx(x, y), b = biome[i];
      if (b === B.DEEP || b === B.WATER) waterTiles.push(i);
      if ((b === B.GRASS || b === B.MARSH) && moist[i] > 0.42) {
        const lat = 1 - Math.abs(y / MH - 0.5) * 2;
        const temp = tempBase + (lat - 0.5) * 0.9;
        if (hash(x, y, seed ^ 0x9) < (b === B.MARSH ? 0.7 : 0.45)) tree[i] = treeType(temp, moist[i], cl);
      }
    }
    if (planet.civ && planet.civ.present) seedVillages(planet.civ.level + 2);
    if (planet.life && planet.life.present) seedAnimals(40);
    dirty = true; generated = true;
  }

  function classify(e, m, temp, sea, cl) {
    if (e < sea - 0.07) return B.DEEP;
    if (e < sea) return B.WATER;
    if (cl === 'volcanic' && e > sea && e < sea + 0.05 && m < 0.4) return B.LAVA;
    if (e > 0.80) return temp < 0 ? B.PEAK : B.PEAK;
    if (e > 0.68) return B.ROCK;
    if (temp < -0.15) return B.SNOW;
    if (temp > 0.5 && m < 0.32) return cl === 'volcanic' ? B.ASH : B.DESERT;
    if (m > 0.66 && temp > 0.1) return B.MARSH;
    return B.GRASS;
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
      if (inb(x + dx, y + dy)) { const b = biome[idx(x + dx, y + dy)]; if (b === B.WATER || b === B.DEEP) return true; }
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
      if (b !== B.DEEP && b !== B.WATER && b !== B.LAVA) { units.push({ x, y, t: tree[i] ? 'deer' : 'critter', cd: U.rand(0, 1) }); placed++; }
    }
  }

  /* ---------- baking ---------- */
  function rebake() {
    if (!base) { base = document.createElement('canvas'); bctx = base.getContext('2d'); }
    base.width = MW * TS; base.height = MH * TS;
    bctx.imageSmoothingEnabled = false;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = idx(x, y), b = biome[i];
      const pal = PAL[b];
      const shadeNoise = ((x * 7 + y * 13 + (hash(x, y, 1) * 4 | 0)) % 2);
      bctx.fillStyle = pal[shadeNoise];
      bctx.fillRect(x * TS, y * TS, TS, TS);
      // mountain shading / snow caps
      if (b === B.ROCK || b === B.PEAK) {
        bctx.fillStyle = 'rgba(255,255,255,0.10)';
        bctx.fillRect(x * TS, y * TS, TS, 2);
        bctx.fillStyle = 'rgba(0,0,0,0.18)';
        bctx.fillRect(x * TS, y * TS + TS - 2, TS, 2);
      }
      // coastline darken on deep edges
      if (b === B.DEEP) { bctx.fillStyle = 'rgba(0,0,0,0.12)'; bctx.fillRect(x * TS, y * TS, TS, TS); }
      if (tree[i]) drawTreeBaked(x, y, tree[i]);
    }
    // village huts baked in
    for (const v of villages) drawVillageBaked(v);
    dirty = false;
  }

  function drawTreeBaked(x, y, ty) {
    const c = TREE_COL[ty]; const px = x * TS, py = y * TS;
    // trunk
    bctx.fillStyle = '#5a3f28'; bctx.fillRect(px + TS / 2 - 1, py + TS - 3, 2, 3);
    // canopy (chunky)
    bctx.fillStyle = c[2]; bctx.fillRect(px + 1, py + 1, TS - 2, TS - 3);   // outline/shadow
    bctx.fillStyle = c[0]; bctx.fillRect(px + 1, py + 1, TS - 3, TS - 4);
    bctx.fillStyle = c[1]; bctx.fillRect(px + 2, py + 2, TS - 5, TS - 6);   // highlight
  }
  function drawVillageBaked(v) {
    const px = v.x * TS, py = v.y * TS;
    for (let k = 0; k < v.size; k++) {
      const ox = px + (k % 2) * 4 - 2, oy = py + Math.floor(k / 2) * 4 - 2;
      bctx.fillStyle = '#7a3b2a'; bctx.fillRect(ox, oy, 4, 4);
      bctx.fillStyle = '#9c4a34'; bctx.fillRect(ox, oy, 4, 2);
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
      if (b === B.DEEP || b === B.WATER) continue;
      fn(x, y, i);
    }
  }

  const ops = {
    forest(p) {
      const ty = p.tree || null;
      eachLand(region(p.region), (x, y, i) => {
        if ((biome[i] === B.GRASS || biome[i] === B.MARSH) && Math.random() < 0.55)
          tree[i] = ty || treeType(0.2, 0.6, GC.World.planet.climate);
      });
    },
    deforest(p) { eachLand(region(p.region), (x, y, i) => { tree[i] = 0; }); },
    grass(p) { eachLand(region(p.region), (x, y, i) => { if (biome[i] !== B.PEAK && biome[i] !== B.ROCK) { biome[i] = B.GRASS; } }); },
    desert(p) { eachLand(region(p.region), (x, y, i) => { biome[i] = B.DESERT; tree[i] = 0; }); },
    snow(p) { eachLand(region(p.region), (x, y, i) => { biome[i] = B.SNOW; if (tree[i]) tree[i] = TR.PINE; }); },
    mountains(p) {
      eachLand(region(p.region), (x, y, i) => { if (Math.random() < 0.5) { biome[i] = Math.random() < 0.4 ? B.PEAK : B.ROCK; tree[i] = 0; elev[i] = 0.85; } });
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
        if (biome[i] === B.WATER || biome[i] === B.DEEP) { biome[i] = B.SAND; elev[i] = 0.5; }
      }
      recomputeWater();
    },
    lava(p) { eachLand(region(p.region), (x, y, i) => { if (Math.random() < 0.4) { biome[i] = B.LAVA; tree[i] = 0; } }); },
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
    for (let i = 0; i < biome.length; i++) if (biome[i] === B.DEEP || biome[i] === B.WATER) waterTiles.push(i);
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
      rain: () => ops.rain(p),
    };
    if (!map[v]) return false;
    map[v](); dirty = true;
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
        if (inb(nx, ny)) { const b = biome[idx(nx, ny)]; if (b !== B.DEEP && b !== B.WATER && b !== B.LAVA) { u.x = nx; u.y = ny; } }
      }
    }
    if (changed) dirty = true;
  }

  /* ---------- render ---------- */
  function render(ctx, opt) {
    const W = opt.W, H = opt.H, t = opt.t, tr = opt.tr;
    if (!generated) generate(GC.World.planet);
    if (dirty) rebake();

    // fit baked map into the buffer (contain), with zoom + camera
    const fit = Math.min(W / base.width, H / base.height) * zoom;
    const drawW = base.width * fit, drawH = base.height * fit;
    const ox = (W - drawW) / 2 - (camX - 0.5) * drawW * (zoom - 1);
    const oy = (H - drawH) / 2 - (camY - 0.5) * drawH * (zoom - 1);
    const TILE = TS * fit;

    // deep-space backdrop behind the map (the void around the planet disc)
    ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, H);

    // transition: fade/zoom-in when descending
    ctx.save();
    if (tr < 1) { const s = U.lerp(opt.dir < 0 ? 1.3 : 0.8, 1, tr); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); ctx.globalAlpha = U.lerp(0.2, 1, tr); }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, ox, oy, drawW, drawH);

    // animated water sparkles
    const tw = (t * 6) | 0;
    ctx.fillStyle = 'rgba(220,240,255,0.5)';
    for (let k = 0; k < 80; k++) {
      const wi = waterTiles[(k * 977 + tw * 131) % (waterTiles.length || 1)];
      if (wi == null) break;
      const x = wi % MW, y = (wi / MW) | 0;
      if (((x + y + tw) % 5) === 0) ctx.fillRect((ox + x * TILE) | 0, (oy + y * TILE + (tw % 2)) | 0, Math.max(1, TILE * 0.3), 1);
    }

    // fire
    for (let i = 0; i < fire.length; i++) {
      if (fire[i] > 0) {
        const x = i % MW, y = (i / MW) | 0;
        const fx = ox + x * TILE, fy = oy + y * TILE;
        ctx.fillStyle = Math.random() < 0.5 ? '#ff7a1f' : '#ffd24a';
        ctx.fillRect(fx | 0, (fy - TILE * 0.3) | 0, Math.max(1, TILE * 0.7), Math.max(1, TILE * 0.9));
      }
    }

    // units
    for (const u of units) {
      const ux = ox + u.x * TILE + TILE * 0.25, uy = oy + u.y * TILE + TILE * 0.25;
      ctx.fillStyle = u.t === 'deer' ? '#b07a45' : '#d8d2c0';
      ctx.fillRect(ux | 0, uy | 0, Math.max(1, TILE * 0.45), Math.max(1, TILE * 0.45));
    }

    ctx.restore();

    // soft top-down light vignette
    const vg = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(255,250,230,0.04)'); vg.addColorStop(1, 'rgba(0,0,10,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  function enter(planet) {
    if (!generated || S_lastSeed !== planet.seed || S_lastClimate !== planet.climate) {
      generate(planet); S_lastSeed = planet.seed; S_lastClimate = planet.climate;
    }
    zoom = 1; camX = camY = 0.5;
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
    zoomBy: function (f) { zoom = U.clamp(zoom * f, 1, 5); },
  };
})(window.GC = window.GC || {});
