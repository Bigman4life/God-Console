/* God Console — sim.js
   The simulation layer. Advances time and evolves orbits, life, and
   civilizations. Time-based progression is derived from accumulated age so
   it survives undo/redo. Emits narration through GC.companion when present. */
(function (GC) {
  'use strict';
  const U = GC.util;
  const { CIV_AGES } = GC.data;

  // progression thresholds, in "years"
  const T = {
    multicellular: 4e5,
    complexLife: 9e5,
    civEmerge: 1.2e6,   // after life begins (unless spawned directly)
    ageStep: 1800,      // years per civilization age tier
  };

  function emit(text, kind) {
    const W = GC.World;
    W.events.unshift({ t: W.time.age, text });
    if (W.events.length > 40) W.events.pop();
    if (GC.companion && GC.companion.event) GC.companion.event(text, kind);
  }

  const Sim = {};

  Sim.spawnLife = function () {
    const p = GC.World.planet;
    if (p.life.present) return;
    p.life = { present: true, stage: 1, biodiversity: 0.1, since: GC.World.time.age };
    p.lastLifeMs = -1;
    emit('Life detected.', 'life');
  };

  Sim.spawnCiv = function (age) {
    const p = GC.World.planet;
    if (!p.life.present) Sim.spawnLife();
    if (p.civ.present) return;
    const startIdx = Math.max(1, CIV_AGES.indexOf(age || 'stone age'));
    p.civ = {
      present: true, level: startIdx, age: CIV_AGES[startIdx],
      population: 1e4 * Math.pow(8, startIdx), factions: 1,
      contacted: false, mood: 'curious', war: false,
      since: GC.World.time.age,
    };
    emit('A civilization stirs — ' + p.civ.age + '.', 'civ');
  };

  Sim.tick = function (dt) {
    const W = GC.World;
    if (!W.born) return;
    const ts = W.time.paused ? 0 : W.time.scale;
    const dAge = ts * dt;
    W.time.age += dAge;

    const p = W.planet;

    // orbital motion (visual spin handled here so it persists across views)
    const spinBoost = ts > 1 ? Math.min(40, Math.log10(ts) * 6) : 1;
    p.spin = U.wrapAngle(p.spin + p.spinRate * dt * spinBoost);
    const gfac = p.gravity === 0 ? 0.05 : p.gravity;
    for (const m of p.moons) {
      m.ang = U.wrapAngle(m.ang + m.speed * dt * (0.5 + 0.5 * gfac) * spinBoost);
      m.grow = U.lerp(m.grow == null ? 0 : m.grow, 1, 0.04);
    }
    if (W.system) for (const sp of W.system.planets) {
      sp.ang = U.wrapAngle(sp.ang + sp.speed * dt * spinBoost);
    }

    // --- life evolution ---
    if (p.life.present) {
      const lifeAge = W.time.age - (p.life.since || 0);
      p.life.biodiversity = U.clamp(0.1 + lifeAge / 2e6, 0, 1);
      milestone(p, 'multi', lifeAge >= T.multicellular, 'Single cells multiply across the seas.', 'life');
      milestone(p, 'complex', lifeAge >= T.complexLife, 'Complex organisms emerge. Biodiversity climbing.', 'life');
      if (!p.civ.present && lifeAge >= T.civEmerge) Sim.spawnCiv('stone age');
    }

    // --- civilization advancement ---
    if (p.civ.present) {
      const civAge = W.time.age - (p.civ.since || 0);
      const tier = U.clamp(1 + Math.floor(civAge / T.ageStep) + (p.civ.startBoost || 0), 1, CIV_AGES.length - 1);
      if (tier > p.civ.level) {
        p.civ.level = tier;
        p.civ.age = CIV_AGES[tier];
        emit('Civilization advances to the ' + p.civ.age + '.', 'civ');
        if (tier >= 4 && p.civ.factions < 3 && Math.random() < 0.6) p.civ.factions++;
      }
      // population dynamics
      const target = 1e4 * Math.pow(7.5, p.civ.level) * (p.life.biodiversity + 0.3);
      p.civ.population = U.lerp(p.civ.population, target, U.clamp(dAge / 5e4, 0, 0.3) + 0.001);

      // first contact: they discover the player
      if (!p.civ.contacted && p.civ.level >= CIV_AGES.indexOf('information')) {
        p.civ.contacted = true;
        emit('A civilization builds radio telescopes. They are looking outward.', 'civ');
        if (GC.companion && GC.companion.contact) GC.companion.contact(p);
      }
    }
  };

  function milestone(p, key, cond, text, kind) {
    p._ms = p._ms || {};
    if (cond && !p._ms[key]) { p._ms[key] = true; emit(text, kind); }
    if (!cond) p._ms[key] = p._ms[key] || false;
  }

  Sim.emit = emit;
  GC.sim = Sim;
})(window.GC = window.GC || {});
