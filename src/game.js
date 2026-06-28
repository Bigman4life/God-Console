/* God Console — game.js
   Wires everything together: executes intents against World, runs the genesis
   sequence, drives the main loop, handles input + history + shortcuts. */
(function (GC) {
  'use strict';
  const U = GC.util;
  const W = GC.World;
  const R = GC.render;
  const C = GC.companion;
  const Sim = GC.sim;
  const I = GC.interpreter;
  const A = GC.audio;

  let input, hint, consoleEl;
  const cmdHistory = []; let histIdx = -1;

  /* ---------------- genesis ---------------- */
  function genesis(phrase) {
    if (W.born) return;
    W.born = true;
    hint.classList.add('gone');
    A.start();
    R.genesis();
    if (/(light|let there be)/.test(phrase || '')) C.sys('...');
    const stages = [
      [900, () => C.sys('Light.')],
      [1500, () => C.sys('Space unfolds.')],
      [2300, () => { C.sys('A star ignites.'); A.event('create'); }],
      [3300, () => { C.sys('Matter gathers into a world.'); }],
      [4400, () => { R.endGenesis(); }],
      [4700, () => { C.sys('Reality online. The console is yours.'); W.commit(); }],
    ];
    for (const [d, fn] of stages) setTimeout(fn, d);
  }

  // verbs that only make sense on the surface (God Eye)
  const SURFACE_VERBS = ['forest', 'deforest', 'grass', 'mountains', 'flatten', 'flood', 'drain', 'lava', 'fire', 'village', 'animals'];
  // space-mode fallbacks when a surface verb is typed while in orbit
  const SPACE_FALLBACK = { flood: { verb: 'climate', params: { type: 'ocean' } }, lava: { verb: 'climate', params: { type: 'volcanic' } }, forest: { verb: 'climate', params: { type: 'jungle' } }, village: { verb: 'civ', params: { age: 'stone age' } }, animals: { verb: 'life' } };

  // translate a parsed intent into a surface op while in God Eye
  function surfaceTranslate(it) {
    const p = it.params || {};
    switch (it.verb) {
      case 'climate': return { verb: { ocean: 'flood', ice: 'snow', volcanic: 'lava', desert: 'desert', jungle: 'forest', temperate: 'grass', barren: 'grass' }[p.type] || 'grass', params: { region: p.region, tree: p.type === 'jungle' ? 5 : undefined } };
      case 'weather': return { verb: p.w === 'snow' ? 'snow' : (p.w === 'rain' || p.w === 'storm') ? 'rain' : null, params: p };
      case 'life': return { verb: 'animals', params: p };
      case 'civ': return { verb: 'village', params: p };
      case 'extinct': return { verb: 'fire', params: { region: p.region } };
      case 'asteroid': return { verb: 'fire', params: {} };
      default: return it; // forest, mountains, flood, etc. pass straight through
    }
  }

  /* ---------------- intent execution ---------------- */
  function exec(it) {
    const p = W.planet;
    let commit = true;

    // ---- God Eye: route creation/terrain commands to the surface ----
    if (W.view === 'surface') {
      const sit = surfaceTranslate(it);
      if (sit && sit.verb && GC.surface.handle(sit)) {
        C.sys(surfaceLine(sit.verb, sit.params));
        A.event(sit.verb === 'fire' || sit.verb === 'lava' ? 'cataclysm' : 'create');
        C.updateStatus();
        return; // surface edits aren't part of undo history (yet)
      }
      // otherwise fall through: meta verbs (zoom, time, undo, ascend, ...) still work
    } else if (SURFACE_VERBS.indexOf(it.verb) >= 0) {
      if (SPACE_FALLBACK[it.verb]) it = SPACE_FALLBACK[it.verb];
      else { C.dim('That shapes the land itself — say "go to surface" to enter the God Eye first.'); return; }
    }

    switch (it.verb) {
      case 'genesis': genesis(it.params && it.params.phrase); commit = false; break;

      case 'descend': setLevel(8); commit = false; break;
      case 'ascend': setLevel(9); commit = false; break;

      case 'undo': {
        const ok = W.undo(); p && (p._texKey = null); W.planet._texKey = null;
        C[ok ? 'sys' : 'dim'](ok ? 'Reality reverted one step.' : 'Nothing to undo. Reality holds.');
        commit = false; break;
      }
      case 'redo': {
        const ok = W.redo(); W.planet._texKey = null;
        C[ok ? 'sys' : 'dim'](ok ? 'Reality steps forward.' : 'Nothing to redo.');
        commit = false; break;
      }
      case 'reset': bigCrunch(); commit = false; break;

      case 'save': {
        const ok = W.saveLocal(it.params.name);
        downloadState();
        C.sys(ok ? `Universe saved as "${it.params.name}". History persists.` : 'Save failed (storage blocked).');
        commit = false; break;
      }
      case 'load': {
        const ok = W.loadLocal(it.params.name);
        C[ok ? 'sys' : 'dim'](ok ? `Universe "${it.params.name}" restored.` : 'No saved universe by that name.');
        commit = false; break;
      }
      case 'help': showHelp(); commit = false; break;

      case 'time': {
        W.time.scale = it.params.scale; W.time.paused = it.params.scale === 0;
        C.sys(it.params.scale === 0 ? 'Time paused. Clouds hang midair.'
          : it.params.scale <= 1 ? 'Time flows normally.'
            : `Time accelerated — ${U.fmt(it.params.scale)} years per second.`);
        commit = false; break;
      }
      case 'zoom': {
        // walk the main ladder: Surface(8) <-> Planet(9) <-> System(10) <-> Galaxy(11) <-> Universe(12)
        if (W.view === 'surface') {
          if (it.params.d > 0) setLevel(9);              // zoom out -> back to orbit
          else GC.surface.zoomBy(1.4);                   // zoom in -> magnify the map
        } else {
          setLevel(U.clamp(W.cam.level + it.params.d, 8, 12));
        }
        commit = false; break;
      }
      case 'zoomTo': { setLevel(U.clamp(it.params.level, 0, 12)); commit = false; break; }

      case 'gravity': {
        p.gravity = it.params.g;
        if (p.gravity === 0) { C.sys('Gravity removed. Matter drifts free.'); (function(c){R.burst(c.x,c.y,80,3,U.hexRgb(p.landColor));})(R.center()); }
        else C.sys(`Gravity set to ${p.gravity}G. The world adjusts.`);
        break;
      }
      case 'moon': {
        const cnt = it.params.count;
        for (let i = 0; i < cnt; i++) setTimeout(() => { addMoon(); if (i === cnt - 1) W.commit(); }, i * 300);
        C.sys(`The sky tears open — ${cnt} moon${cnt > 1 ? 's emerge' : ' emerges'}. Tides shift.`);
        W.it = 'moon'; commit = false; break;
      }
      case 'removeMoon': { p.moons.pop(); C.sys('A moon crumbles to dust.'); break; }
      case 'rings': { p.hasRings = it.params.on; C.sys(it.params.on ? 'A ring system coalesces from debris.' : 'The rings disperse.'); break; }

      case 'sun': {
        W.star.baseRadius = U.clamp(W.star.baseRadius * it.params.mul, 16, 160);
        if (it.params.mul > 1) { C.sys('The star swells. Temperature climbs, ice melts.'); p.temperature += 30; thawCheck(); }
        else { C.sys('The star dims and shrinks. A chill sets in.'); p.temperature -= 30; }
        W.it = 'star'; break;
      }
      case 'starColor': { W.star.color = it.params.color; C.sys('The star burns a new color.'); break; }

      case 'climate': setClimate(it.params.type); break;
      case 'weather': { p.weather = it.params.w; C.sys(weatherLine(it.params.w)); break; }
      case 'clouds': { p.cloudiness = U.clamp(p.cloudiness + it.params.d, 0, 1); C.sys(it.params.d > 0 ? 'Clouds thicken.' : 'Skies clear.'); break; }

      case 'ocean': { p.oceanColor = it.params.color; p._texKey = null; C.sys('The oceans change hue.'); break; }
      case 'land': { p.landColor = it.params.color; p._texKey = null; C.sys('The land takes on a new color.'); break; }
      case 'sky': { p.skyTint = U.hexRgb(it.params.color).map((x) => x * 0.4); C.sys('The sky shifts.'); break; }
      case 'brightness': {
        const d = it.params.d * 8; p.skyTint = p.skyTint.map((c) => U.clamp(c + d, 2, 90));
        C.sys(d < 0 ? 'The world darkens.' : 'The world brightens.'); break;
      }

      case 'life': { Sim.spawnLife(); C.sys('You seed the world with life.'); W.it = 'planet'; break; }
      case 'civ': { Sim.spawnCiv(it.params.age); C.sys(`Intelligent life arises at the ${it.params.age}.`); break; }
      case 'war': {
        if (it.params.on) { p.civ.war = true; p.civ.factions = Math.max(2, p.civ.factions); C.sys('War erupts between the civilizations.'); A.event('cataclysm'); }
        else { p.civ.war = false; C.sys('An uneasy peace settles.'); }
        break;
      }
      case 'extinct': {
        p.life = { present: false, stage: 0, biodiversity: 0 };
        p.civ = { present: false, level: 0, age: 'none', population: 0, factions: 1, contacted: false, mood: 'curious', war: false };
        p._ms = {};
        C.sys('A mass extinction. The world falls silent.'); A.event('cataclysm');
        (function(c){R.burst(c.x,c.y,60,4,[120,40,40]);})(R.center()); break;
      }

      case 'aurora': {
        p.aurora = it.params.on;
        C.sys(it.params.on ? 'Auroras shimmer across the poles.' : 'The auroras fade.'); break;
      }
      case 'comet': {
        R.spawnComet(true); C.sys('A comet streaks across the heavens.'); A.event(); commit = false; break;
      }
      case 'blackhole': {
        W.blackHole = it.params.mode === 'companion'
          ? { mode: 'companion', r: 22, ang: 0, dist: 280 }
          : { mode: 'star', r: 34 };
        if (it.params.mode === 'star') { W.star.type = 'remnant'; }
        C.sys(it.params.mode === 'companion'
          ? 'A black hole coils into orbit, devouring stray matter. Tides scream.'
          : 'The star collapses into a black hole. Light bends around the abyss.');
        A.event('cataclysm'); R.flash(); break;
      }
      case 'supernova': {
        const sx = innerWidth / 2 - innerWidth * 0.34, sy = innerHeight / 2 - innerHeight * 0.3;
        R.shockwave(sx, sy, [255, 240, 210], 1.2); R.burst(sx, sy, 220, 9, [255, 220, 170]);
        C.sys('The star detonates — a supernova floods the system with light and fire.');
        A.event('cataclysm');
        setTimeout(() => {
          W.star.type = 'remnant'; W.star.baseRadius = 18; W.star.color = '#bfe0ff';
          if (p.life.present && Math.random() < 0.8) exec({ verb: 'extinct' });
          Sim.emit('Only a dense remnant remains where the star once burned.');
          W.commit(); C.updateStatus();
        }, 1800);
        break;
      }
      case 'asteroid': {
        C.sys('An asteroid falls toward the world...');
        R.asteroid(() => {
          const lethal = p.life.present && Math.random() < 0.6;
          if (lethal) { exec({ verb: 'extinct' }); Sim.emit('The impact triggers a mass extinction.'); }
          else { Sim.emit('Impact! Dust veils the sky for a generation.'); p.weather = 'ash'; }
          W.commit(); C.updateStatus();
        });
        commit = false; break;
      }

      case 'branch': {
        const label = W.branch(it.params.label);
        C.sys(`Timeline branched: "${label}" (at ${U.fmt(W.time.age)} yr). Saved ${W.branches.length} branch${W.branches.length > 1 ? 'es' : ''}.`);
        commit = false; break;
      }
      case 'duplicate': {
        const sys = W.system;
        sys.planets.push({ dist: 90 + sys.planets.length * 70, ang: Math.random() * 6.28, speed: 0.12, r: 14, color: p.oceanColor, rings: p.hasRings });
        C.sys('A twin world condenses in a neighboring orbit.'); break;
      }
      case 'universes': {
        const saves = W.listSaves();
        if (GC.ui && GC.ui.openBrowser) GC.ui.openBrowser();
        C.dim(saves.length ? 'Saved universes: ' + saves.join(', ') : 'No saved universes yet. Type "save <name>".');
        commit = false; break;
      }
      case 'whatif': { whatIf(it.params.raw); commit = false; break; }

      case 'newPlanet': {
        Object.assign(p, GC.data.makePlanet((Math.random() * 1e9) | 0, it.params.type));
        p.radius = 0; p._texKey = null; W.it = 'planet'; setLevel(9);
        C.sys('A new world condenses from the void.'); A.event('create'); break;
      }

      default:
        if (I.llmEnabled()) C.dim('The interpreter could not map that. Try rephrasing.');
        else {
          C.dim('Reality strains to understand.');
          C.dim('This build uses a keyword interpreter — type "help", or add an API key with /key for open-ended language.');
        }
        commit = false;
    }
    if (commit) W.commit();
    C.updateStatus();
  }

  /* sandbox experiments: map "what if X" to a plausible chain of consequences */
  function whatIf(raw) {
    const t = raw || '';
    const h = (...w) => w.some((x) => t.includes(x));
    C.sys('Simulating: "' + t.replace(/^.*?what if/i, 'what if').trim() + '"');
    const after = [];
    if (h('10x', 'ten times', 'high gravity', 'gravity was 10', 'much stronger gravity')) {
      exec({ verb: 'gravity', params: { g: 10 } });
      after.push('Mountains flatten under their own weight. Nothing taller than a shrub survives.', 'Flight becomes impossible. Bones thicken across every species.');
    } else if (h('no gravity', 'gravity disappear', 'gravity was gone', 'without gravity')) {
      exec({ verb: 'gravity', params: { g: 0 } });
      after.push('Oceans lift into drifting spheres. The atmosphere bleeds into space.');
    } else if (h('oxygen', 'no air', 'air disappear')) {
      W.planet.atmosphere = 0.05; W.planet.weather = 'clear';
      if (W.planet.life.present) exec({ verb: 'extinct' });
      after.push('Fires gutter out instantly. Every breathing thing suffocates within minutes.', 'Only anaerobic microbes cling on in the deep.');
    } else if (h('dinosaur', 'dinos survived')) {
      if (!W.planet.life.present) Sim.spawnLife();
      after.push('The asteroid misses. Reptilian megafauna keep their throne.', 'Mammals stay small and nocturnal for another hundred million years.');
    } else if (h('ring')) {
      exec({ verb: 'rings', params: { on: true } });
      after.push('A brilliant arc splits the night sky from every horizon.', 'Eternal twilight shadows fall where the rings eclipse the sun.');
    } else if (h('black hole')) {
      exec({ verb: 'blackhole', params: { mode: 'companion' } });
      after.push('Tides rise to swallow coastlines twice a day.', 'Time itself runs slower on the side facing the abyss.');
    } else if (h('no sun', 'sun disappear', 'star disappear', 'without the sun')) {
      setClimate('ice'); W.planet.skyTint = [2, 2, 6];
      after.push('Darkness falls in eight minutes. Within a week the oceans skin over with ice.', 'Photosynthesis ends. The food chain collapses from the bottom up.');
    } else if (h('two sun', 'binary', 'second sun', 'twin sun')) {
      exec({ verb: 'sun', params: { mul: 1.4 } });
      after.push('Double shadows fall at noon. Seasons grow chaotic and long.');
    } else {
      after.push('Reality runs the experiment... the consequences ripple outward in ways even I cannot fully predict.', 'Try a sharper premise — "what if gravity was 10x?" or "what if oxygen disappeared?"');
    }
    after.forEach((line, i) => setTimeout(() => Sim.emit(line), 700 + i * 900));
    W.commit();
  }

  function addMoon() {
    const p = W.planet;
    const n = p.moons.length;
    const rng = U.makeRng((W.seed ^ (n * 7919)) >>> 0);
    p.moons.push({
      ang: rng.range(0, U.TAU), dist: 230 + n * 46 + rng.range(-10, 10),
      speed: rng.range(0.4, 0.9) * rng.sign(), r: rng.range(8, 16),
      color: rng() < 0.3 ? '#c9a98a' : '#cfcfcf', grow: 0,
    });
  }

  function setClimate(type) {
    const p = W.planet; const c = GC.data.CLIMATES[type]; if (!c) return;
    p.climate = type; p.oceanColor = c.ocean; p.landColor = c.land; p.iceColor = c.ice;
    p.skyTint = c.sky.slice(); p.temperature = c.temp; p.atmosphere = c.atm; p.weather = c.weather;
    p._texKey = null;
    const lines = {
      ice: 'Snow spreads across the continents. Oceans freeze.',
      volcanic: 'Black sand, obsidian peaks, rivers of glowing lava.',
      ocean: 'Waters rise — a calm ocean world with floating islands.',
      desert: 'Dunes march to the horizon under a burning sky.',
      jungle: 'Dense rainforest swallows the land.',
      barren: 'The air thins to nothing. A dead, silent rock.',
      temperate: 'A mild, blue-green, Earth-like world.',
    };
    C.sys(lines[type] || 'The climate shifts.');
    Sim.emit('Climate shift: ' + type + '.');
  }

  function thawCheck() {
    const p = W.planet;
    if (p.climate === 'ice' && p.temperature > 0) { setClimate('temperate'); Sim.emit('The ice retreats as the world warms.'); }
  }

  function weatherLine(w) {
    return { clear: 'The skies clear.', rain: 'Rain begins to fall.', snow: 'Snow drifts down.', storm: 'Storm clouds gather; lightning splits the sky.' }[w] || 'The weather turns.';
  }

  function surfaceLine(verb, params) {
    const where = params && params.region ? ' in the ' + params.region : '';
    return {
      forest: 'Forests spread across the land' + where + '.',
      deforest: 'The trees are cleared' + where + '.',
      grass: 'Green plains roll out' + where + '.',
      desert: 'Sands bury the land' + where + '.',
      snow: 'Snow blankets the ground' + where + '.',
      mountains: 'Mountains heave upward' + where + '.',
      flatten: 'The land is leveled' + where + '.',
      flood: 'Waters rise and drown the lowlands' + where + '.',
      drain: 'The seas recede, baring the seabed.',
      lava: 'Lava bursts through the crust' + where + '.',
      fire: 'Wildfire races across the land' + where + '.',
      village: 'Villages take root among the hills.',
      animals: 'Wildlife spreads across the surface.',
      rain: 'Rain sweeps through, dousing the flames.',
    }[verb] || 'The surface reshapes.';
  }

  function setLevel(level) {
    const wasSurface = W.view === 'surface';
    W.view = level === 8 ? 'surface' : 'space';
    if (W.view === 'surface' && GC.surface) GC.surface.enter(W.planet);
    R.setLevel(level);
    W.it = 'planet';
    if (W.view === 'surface' && !wasSurface) C.sys('Descending to the surface — the God Eye opens.');
    if (W.view !== 'surface' && wasSurface) C.sys('Rising back into orbit.');
    C.updateStatus();
  }

  function bigCrunch() {
    C.sys('The universe collapses to a point...');
    A.event('cataclysm');
    (function(c){R.burst(c.x,c.y,200,8,[255,230,200]);})(R.center());
    setTimeout(() => {
      W.reset();
      C.dim('— void —');
      C.dim('An endless dark. A blinking prompt. Type something — try: let there be light');
    }, 1200);
  }

  function downloadState() {
    try {
      const blob = new Blob([W.exportState()], { type: 'application/json' });
      const u = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = u; a.download = 'universe.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    } catch (e) { /* ignore */ }
  }

  function showHelp() {
    C.dim('— GOD CONSOLE — language is the interface —');
    C.dim('views:     SPACE (3D) shapes worlds & cosmos · GOD EYE (2D) shapes the surface');
    C.dim('           say "go to surface" to descend · "return to space" to ascend');
    C.dim('genesis:   let there be light');
    C.dim('surface:   grow a forest · plant cherry trees in the north · raise mountains · flood the south');
    C.dim('           make a desert · set fire to the forest · build a village · spawn animals');
    C.dim('worlds:    create an ocean planet · make it volcanic · start an ice age · desert · jungle');
    C.dim('physics:   increase gravity to 2G · remove gravity · double the size of the sun');
    C.dim('sky:       add three moons · add rings · make the oceans purple · darker · make it rain · add auroras');
    C.dim('life:      create life · create intelligent life · start a war · cause mass extinction');
    C.dim('cosmos:    spawn a comet · create a black hole · a black hole orbits the moon · trigger a supernova · strike with an asteroid');
    C.dim('sandbox:   what if gravity was 10x? · what if oxygen disappeared? · what if dinosaurs survived?');
    C.dim('time:      accelerate time · advance one million years · pause · resume');
    C.dim('zoom:      zoom out · zoom in · go to galaxy · view surface · zoom to atom');
    C.dim('worldsmgmt: branch timeline · duplicate this planet · save <name> · load <name> · universes');
    C.dim('meta:      undo · redo · reset · /key (enable AI interpreter)');
  }

  /* ---------------- input ---------------- */
  async function runCommand(raw) {
    C.you(raw);
    cmdHistory.push(raw); histIdx = cmdHistory.length;

    if (raw.trim().toLowerCase().startsWith('/key')) { setApiKey(raw); return; }
    if (raw.trim().toLowerCase() === '/audio') { C.dim('Audio ' + (A.toggle() ? 'on.' : 'off.')); return; }

    if (W.born && I.llmEnabled()) {
      C.dim('· interpreting ·');
      const intents = await I.parseLLM(raw);
      removeLastDim();
      for (const it of intents) exec(it);
    } else {
      exec(I.parse(raw));
    }
  }

  function removeLastDim() {
    const log = document.getElementById('log');
    const last = log && log.lastChild;
    if (last && last.textContent === '· interpreting ·') log.removeChild(last);
  }

  function setApiKey(raw) {
    const key = raw.replace(/^\/key\s*/i, '').trim();
    if (!key) {
      const has = I.llmEnabled();
      C.dim(has ? 'AI interpreter is ON. Type "/key off" to disable.' : 'Paste an Anthropic API key: /key sk-ant-...  (enables open-ended language; stored locally only)');
      return;
    }
    if (key.toLowerCase() === 'off') { localStorage.removeItem('godconsole:apikey'); C.dim('AI interpreter disabled.'); return; }
    localStorage.setItem('godconsole:apikey', key);
    C.dim('AI interpreter enabled. Speak freely — every sentence reshapes reality.');
  }

  /* ---------------- observe-fade ---------------- */
  let observeTimer;
  function poke() {
    consoleEl.classList.remove('observing');
    clearTimeout(observeTimer);
    observeTimer = setTimeout(() => { if (W.born) consoleEl.classList.add('observing'); }, 6000);
  }

  /* ---------------- main loop ---------------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    Sim.tick(dt);
    if (W.view === 'surface' && GC.surface) GC.surface.tick(dt, W.time.paused ? 0 : W.time.scale);
    R.draw(now);
    statusTick = (statusTick + 1) % 12;
    if (statusTick === 0) C.updateStatus();
    requestAnimationFrame(frame);
  }
  let statusTick = 0;

  /* ---------------- boot ---------------- */
  function boot() {
    const canvas = document.getElementById('stage');
    input = document.getElementById('cmd');
    hint = document.getElementById('hint');
    consoleEl = document.getElementById('console');
    R.init(canvas);
    C.init({ log: document.getElementById('log'), status: document.getElementById('status'), zoom: document.getElementById('zoom') });
    if (GC.ui) GC.ui.init();

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const raw = input.value.trim(); if (!raw) return;
        input.value = ''; runCommand(raw);
      } else if (e.key === 'ArrowUp') {
        if (histIdx > 0) { histIdx--; input.value = cmdHistory[histIdx] || ''; e.preventDefault(); }
      } else if (e.key === 'ArrowDown') {
        if (histIdx < cmdHistory.length - 1) { histIdx++; input.value = cmdHistory[histIdx] || ''; }
        else { histIdx = cmdHistory.length; input.value = ''; }
      }
    });

    ['mousemove', 'keydown', 'click', 'wheel'].forEach((ev) => addEventListener(ev, poke));
    addEventListener('wheel', (e) => {
      if (!W.born) return;
      if (Math.abs(e.deltaY) < 2) return;
      exec({ verb: 'zoom', params: { d: e.deltaY > 0 ? 1 : -1 } });
    }, { passive: true });
    poke();
    input.focus();
    document.addEventListener('click', () => input.focus());

    setTimeout(() => C.dim('An endless void. A blinking prompt. Type something — try: let there be light'), 800);
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  GC.game = { exec, runCommand };
})(window.GC = window.GC || {});
