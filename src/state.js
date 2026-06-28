/* God Console — state.js
   The single source of truth. Pure data + history (undo/redo) + pronoun
   memory + save/load. Sim and Render read from World; commands mutate it. */
(function (GC) {
  'use strict';
  const U = GC.util;

  const CLIMATES = {
    temperate: { ocean: '#2a6db0', land: '#3c6b3a', ice: '#eef4fa', sky: [10, 14, 30], temp: 14, atm: 0.9, weather: 'clear' },
    ocean: { ocean: '#1f7ab0', land: '#2e8b6a', ice: '#dfeef0', sky: [12, 26, 40], temp: 20, atm: 0.95, weather: 'rain' },
    ice: { ocean: '#9fc7e8', land: '#dfe7ee', ice: '#ffffff', sky: [20, 30, 46], temp: -25, atm: 0.7, weather: 'snow' },
    volcanic: { ocean: '#3a1410', land: '#2a2228', ice: '#5a3020', sky: [34, 10, 8], temp: 80, atm: 0.5, weather: 'ash' },
    desert: { ocean: '#caa15a', land: '#b07b3a', ice: '#e8d6a8', sky: [40, 30, 18], temp: 45, atm: 0.6, weather: 'clear' },
    jungle: { ocean: '#1f8b7a', land: '#1f7a32', ice: '#dfeee0', sky: [12, 30, 22], temp: 28, atm: 1.0, weather: 'rain' },
    barren: { ocean: '#3a3a40', land: '#55504a', ice: '#cfcfcf', sky: [8, 8, 12], temp: -40, atm: 0.05, weather: 'clear' },
  };

  const CIV_AGES = ['none', 'stone age', 'bronze age', 'iron age', 'industrial', 'atomic', 'information', 'spacefaring', 'post-singularity'];

  function makePlanet(seed, climate) {
    climate = climate || 'temperate';
    const c = CLIMATES[climate];
    const rng = U.makeRng(seed);
    return {
      name: 'Unnamed World',
      seed: seed,
      radius: 0, baseRadius: 150,
      gravity: 1,
      oceanColor: c.ocean, landColor: c.land, iceColor: c.ice,
      climate: climate,
      temperature: c.temp,
      cloudiness: 0.45,
      weather: c.weather,
      hasRings: false, ringColor: '#caa97a', ringTilt: rng.range(0.2, 0.5),
      axialTilt: rng.range(-0.35, 0.35),
      spin: 0, spinRate: 0.25,
      atmosphere: c.atm,
      skyTint: c.sky.slice(),
      moons: [],
      continents: rng.int(4, 7),
      aurora: false,
      life: { present: false, stage: 0, biodiversity: 0 },
      civ: { present: false, level: 0, age: 'none', population: 0, factions: 1, contacted: false, mood: 'curious', war: false },
    };
  }

  function makeStar(seed) {
    const rng = U.makeRng(seed ^ 0x9e3779b9);
    return { radius: 0, baseRadius: 48, color: '#ffd27f', temp: 5800, x: 0, y: 0, type: 'main', remnant: null };
  }

  /* extra procedural planets for the solar-system view */
  function makeSystem(seed) {
    const rng = U.makeRng(seed ^ 0x1234567);
    const planets = [];
    const n = rng.int(4, 7);
    const palette = ['#b9885a', '#9fb0c8', '#c87f5a', '#7a9fc8', '#c8b07a', '#8ac8a0', '#c88a9f'];
    for (let i = 0; i < n; i++) {
      planets.push({
        dist: 90 + i * 70 + rng.range(-12, 12),
        ang: rng.range(0, U.TAU),
        speed: (0.25 - i * 0.025) * rng.range(0.8, 1.2),
        r: rng.range(6, 18),
        color: palette[i % palette.length],
        rings: rng() < 0.25,
      });
    }
    return { planets: planets };
  }

  const World = {};

  function fresh() {
    const seed = (Math.random() * 1e9) | 0;
    Object.assign(World, {
      seed: seed,
      born: false,
      genesisPhase: 0,
      time: { scale: 1, age: 0, paused: false },
      cam: { level: 9, scale: 1, targetScale: 1, transition: 1, fromLevel: 9 },
      planet: makePlanet(seed, 'temperate'),
      star: makeStar(seed),
      system: makeSystem(seed),
      galaxySeed: seed ^ 0xabcdef,
      universeSeed: seed ^ 0x0f0f0f0,
      blackHole: null,
      it: 'planet',
      events: [],
    });
  }
  fresh();

  /* ---- pronoun memory ---- */
  World.resolveIt = function () {
    if (World.it === 'planet') return World.planet;
    if (World.it === 'star') return World.star;
    if (World.it === 'moon') return World.planet.moons[World.planet.moons.length - 1];
    return World.planet;
  };

  /* ---- history (undo / redo) ---- */
  const SNAP_KEYS = ['seed', 'born', 'time', 'cam', 'planet', 'star', 'system', 'galaxySeed', 'universeSeed', 'blackHole', 'it'];
  const history = { stack: [], idx: -1 };

  function serialize() {
    const o = {};
    for (const k of SNAP_KEYS) o[k] = World[k];
    return JSON.stringify(o);
  }
  function applySnap(json) {
    const o = JSON.parse(json);
    for (const k of SNAP_KEYS) if (o[k] !== undefined) World[k] = o[k];
  }

  World.commit = function () {
    // drop any redo tail, push new snapshot
    history.stack.length = history.idx + 1;
    history.stack.push(serialize());
    if (history.stack.length > 80) history.stack.shift();
    history.idx = history.stack.length - 1;
  };
  World.undo = function () {
    if (history.idx <= 0) return false;
    history.idx--;
    applySnap(history.stack[history.idx]);
    return true;
  };
  World.redo = function () {
    if (history.idx >= history.stack.length - 1) return false;
    history.idx++;
    applySnap(history.stack[history.idx]);
    return true;
  };

  /* ---- save / load ---- */
  World.exportState = function () { return serialize(); };
  World.importState = function (json) {
    applySnap(json);
    World.commit();
  };
  World.saveLocal = function (name) {
    try { localStorage.setItem('godconsole:' + (name || 'autosave'), serialize()); return true; }
    catch (e) { return false; }
  };
  World.loadLocal = function (name) {
    try {
      const j = localStorage.getItem('godconsole:' + (name || 'autosave'));
      if (!j) return false; applySnap(j); World.commit(); return true;
    } catch (e) { return false; }
  };

  World.listSaves = function () {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('godconsole:') === 0) out.push(k.slice('godconsole:'.length));
      }
    } catch (e) { /* ignore */ }
    return out.sort();
  };
  World.deleteSave = function (name) {
    try { localStorage.removeItem('godconsole:' + name); return true; } catch (e) { return false; }
  };

  /* branching timelines: keep a small in-memory set of named branches */
  World.branches = [];
  World.branch = function (label) {
    World.branches.push({ label: label || ('branch ' + (World.branches.length + 1)), at: World.time.age, snap: serialize() });
    if (World.branches.length > 12) World.branches.shift();
    return World.branches[World.branches.length - 1].label;
  };

  World.reset = function () {
    fresh();
    history.stack.length = 0; history.idx = -1;
    World.branches = [];
  };

  GC.World = World;
  GC.data = { CLIMATES, CIV_AGES, makePlanet, makeStar, makeSystem };
})(window.GC = window.GC || {});
