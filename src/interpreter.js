/* God Console — interpreter.js
   Turns a sentence into an intent object {verb, params}. Deterministic and
   extensible. The LLM adapter (optional) emits the SAME intent shape, so the
   engine never changes — that is the "ultra code" upgrade path. */
(function (GC) {
  'use strict';
  const U = GC.util;

  const COLORS = {
    purple: '#7b3fc4', violet: '#8a4fd0', red: '#b03a3a', crimson: '#8b1e1e',
    green: '#2e8b3a', emerald: '#1f8b5a', blue: '#2a6db0', azure: '#3a8fd0',
    teal: '#1e8b8b', cyan: '#39c0c0', black: '#101015', white: '#dfe6ee',
    gold: '#c8a84b', yellow: '#d6c24a', orange: '#c8761f', pink: '#c45f8e',
    silver: '#b9c0c8', gray: '#8a8f96', grey: '#8a8f96', brown: '#7a5230',
  };

  function colorFrom(t) { for (const k in COLORS) if (t.includes(k)) return COLORS[k]; return null; }
  const WORDNUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12, hundred: 100, thousand: 1000, million: 1e6, billion: 1e9 };
  function numFrom(t) {
    const m = t.match(/(-?\d+(\.\d+)?)/);
    if (m) return parseFloat(m[1]);
    for (const w in WORDNUM) if (new RegExp('\\b' + w + '\\b').test(t)) return WORDNUM[w];
    return null;
  }

  const I = {};

  /* The deterministic parser. Returns {verb, params}. */
  I.parse = function (raw) {
    const it = parseRaw(raw);
    const reg = regionFrom(raw.toLowerCase());
    if (reg) { it.params = it.params || {}; if (it.params.region === undefined) it.params.region = reg; }
    return it;
  };

  function parseRaw(raw) {
    const t = raw.toLowerCase().trim();
    const has = (...w) => w.some((x) => t.includes(x));
    const W = GC.World;

    if (!W.born) {
      // any first command sparks creation; "light" gets the classic line
      return { verb: 'genesis', params: { phrase: t } };
    }

    // what-if sandbox experiments (check early so "what if gravity..." routes here)
    if (has('what if', 'what would happen', 'imagine if')) return { verb: 'whatif', params: { raw: t } };

    // cosmic objects & cataclysms
    if (has('black hole', 'blackhole', 'singularity')) {
      const mode = has('moon', 'orbit', 'companion', 'near') ? 'companion' : 'star';
      return { verb: 'blackhole', params: { mode } };
    }
    if (has('supernova', 'explode the star', 'detonate the star', 'star explode')) return { verb: 'supernova' };
    if (has('comet', 'shooting star')) return { verb: 'comet' };
    if (has('asteroid', 'meteor', 'impact', 'strike the planet')) return { verb: 'asteroid' };
    if (has('aurora', 'northern lights')) return { verb: 'aurora', params: { on: !has('remove', 'no ') } };

    // view transitions: space <-> God Eye (surface)
    if (has('descend', 'go to surface', 'enter the surface', 'land on', 'god eye', 'surface view', 'zoom to surface', 'to the surface', 'on the surface'))
      return { verb: 'descend' };
    if (has('ascend', 'return to space', 'back to space', 'leave the surface', 'into orbit', 'back to orbit', 'zoom to space'))
      return { verb: 'ascend' };

    // surface (God Eye) terrain powers  (fire before forest so "set fire to the forest" burns)
    if (has('set fire', 'wildfire', 'burn', 'ignite')) return { verb: 'fire' };
    if (has('deforest', 'cut down', 'clear the forest', 'clear the tree', 'chop down')) return { verb: 'deforest' };
    if (has('forest', 'grove', 'woods', 'orchard', 'plant', 'tree', 'jungle')) return { verb: 'forest', params: treeParam(t) };
    if (has('mountain', 'raise the land', 'raise terrain', 'raise mountains', 'hills', 'highlands')) return { verb: 'mountains' };
    if (has('flatten', 'level the land', 'lower the land')) return { verb: 'flatten' };
    if (has('drain', 'dry up', 'lower the sea', 'recede the')) return { verb: 'drain' };
    if (has('flood', 'raise the sea', 'raise water', 'lake', 'river', 'sea level')) return { verb: 'flood' };
    if (has('village', 'settlement', 'town', 'build a city', 'spawn people', 'spawn humans')) return { verb: 'village' };
    if (has('animal', 'wildlife', 'critter', 'beast', 'fauna', 'herd')) return { verb: 'animals' };

    // timelines / duplication
    if (has('branch')) return { verb: 'branch', params: { label: nameAfter(t, 'branch') } };
    if (has('duplicate', 'clone', 'copy this planet', 'copy the planet')) return { verb: 'duplicate' };
    if (has('list universe', 'universes', 'show saves', 'saved universes', 'my universes')) return { verb: 'universes' };

    // meta / control
    if (has('undo', 'revert', 'go back')) return { verb: 'undo' };
    if (has('redo')) return { verb: 'redo' };
    if (has('save')) return { verb: 'save', params: { name: nameAfter(t, 'save') } };
    if (has('load', 'restore')) return { verb: 'load', params: { name: nameAfter(t, 'load') } };
    if (has('reset', 'start over', 'big crunch', 'destroy everything', 'delete universe'))
      return { verb: 'reset' };
    if (has('help', 'what can', 'commands', 'how do i')) return { verb: 'help' };

    // time
    if (has('pause', 'freeze time', 'stop time', 'halt time')) return { verb: 'time', params: { scale: 0 } };
    if (has('resume', 'unpause', 'play', 'normal time')) return { verb: 'time', params: { scale: 1 } };
    if (has('accelerate', 'fast forward', 'speed up', 'advance', 'skip ahead')) {
      const n = numFrom(t);
      let scale = 5000;
      if (n != null) {
        if (has('million')) scale = n * 1e6 / 4; else if (has('thousand', 'year')) scale = Math.max(50, n);
        else scale = U.clamp(n, 1, 1e7);
      }
      return { verb: 'time', params: { scale: U.clamp(scale, 1, 1e7) } };
    }

    // zoom
    if (has('zoom out', 'pull back', 'zoom-out')) return { verb: 'zoom', params: { d: +1 } };
    if (has('zoom in', 'zoom-in', 'dive', 'go deeper', 'closer')) return { verb: 'zoom', params: { d: -1 } };
    if (has('zoom to', 'go to', 'view ')) { const lvl = levelFrom(t); if (lvl != null) return { verb: 'zoomTo', params: { level: lvl } }; }
    { const lvl = standaloneLevel(t); if (lvl != null) return { verb: 'zoomTo', params: { level: lvl } }; }

    // physics
    if (has('gravity')) {
      if (has('remove', 'no gravity', 'zero gravity', 'disable')) return { verb: 'gravity', params: { g: 0 } };
      const n = numFrom(t);
      return { verb: 'gravity', params: { g: n != null ? U.clamp(n, 0, 50) : W.planet.gravity * 2 } };
    }

    // moons / rings
    if (has('moon')) {
      if (has('remove', 'delete', 'destroy')) return { verb: 'removeMoon' };
      const n = numFrom(t) || 1; return { verb: 'moon', params: { count: U.clamp(n, 1, 8) } };
    }
    if (has('ring')) return { verb: 'rings', params: { on: !has('remove', 'no ') } };

    // star / sun
    if (has('sun', 'star')) {
      if (has('double', 'bigger', 'grow', 'larger', 'expand')) return { verb: 'sun', params: { mul: 2 } };
      if (has('half', 'smaller', 'shrink', 'reduce')) return { verb: 'sun', params: { mul: 0.5 } };
      const c = colorFrom(t); if (c) return { verb: 'starColor', params: { color: c } };
    }

    // climate / biome
    if (has('ice age', 'glacial', 'freeze the', 'frozen world', 'snowball')) return { verb: 'climate', params: { type: 'ice' } };
    if (has('volcan', 'lava', 'obsidian', 'molten', 'magma')) return { verb: 'climate', params: { type: 'volcanic' } };
    if (has('ocean world', 'water world', 'ocean planet', 'flood', 'drown')) return { verb: 'climate', params: { type: 'ocean' } };
    if (has('desert', 'arid', 'dune')) return { verb: 'climate', params: { type: 'desert' } };
    if (has('jungle', 'rainforest', 'tropical', 'verdant')) return { verb: 'climate', params: { type: 'jungle' } };
    if (has('barren', 'dead world', 'lifeless rock', 'airless')) return { verb: 'climate', params: { type: 'barren' } };
    if (has('temperate', 'earth-like', 'earthlike', 'earth like', 'habitable')) return { verb: 'climate', params: { type: 'temperate' } };

    // weather
    if (has('rain', 'storm', 'lightning', 'thunder')) return { verb: 'weather', params: { w: has('storm', 'lightning', 'thunder') ? 'storm' : 'rain' } };
    if (has('snow', 'blizzard')) return { verb: 'weather', params: { w: 'snow' } };
    if (has('clear sky', 'clear weather', 'calm', 'sunny')) return { verb: 'weather', params: { w: 'clear' } };
    if (has('cloud')) return { verb: 'clouds', params: { d: has('remove', 'less', 'fewer', 'clear') ? -0.3 : 0.3 } };

    // colors of features
    if (has('ocean', 'water', 'sea')) { const c = colorFrom(t); if (c) return { verb: 'ocean', params: { color: c } }; }
    if (has('land', 'grass', 'terrain', 'ground', 'continent')) { const c = colorFrom(t); if (c) return { verb: 'land', params: { color: c } }; }
    if (has('sky', 'atmosphere')) { const c = colorFrom(t); if (c) return { verb: 'sky', params: { color: c } }; }

    // brightness
    if (has('darker', 'dim', 'night', 'shadow')) return { verb: 'brightness', params: { d: -1 } };
    if (has('brighter', 'lighter', 'brighten', 'day')) return { verb: 'brightness', params: { d: +1 } };

    // life & civ
    if (has('intelligent life', 'sentient', 'civiliz', 'people', 'humans', 'intelligent species')) {
      const age = ageFrom(t);
      return { verb: 'civ', params: { age } };
    }
    if (has('life', 'creatures', 'ecosystem', 'animals', 'plants', 'biodiversity')) return { verb: 'life' };
    if (has('war', 'conflict', 'fight')) return { verb: 'war', params: { on: !has('end', 'stop', 'peace') } };
    if (has('peace')) return { verb: 'war', params: { on: false } };
    if (has('extinct', 'wipe out', 'apocalypse', 'kill all', 'mass extinction')) return { verb: 'extinct' };

    // create a fresh planet with description
    if (has('create', 'make a', 'spawn', 'new planet', 'generate', 'build')) {
      if (has('planet', 'world', 'moon', 'star')) {
        const type = climateFromDesc(t) || 'temperate';
        return { verb: 'newPlanet', params: { type, desc: t } };
      }
    }

    if (has('planet', 'world', 'earth')) {
      const type = climateFromDesc(t);
      if (type) return { verb: 'climate', params: { type } };
    }

    return { verb: 'unknown', params: { raw } };
  };

  // tree-type words -> surface TR ids (1 green,2 autumn,3 blossom,4 pine,5 jungle,6 dead)
  function treeParam(t) {
    if (/(pine|conifer|fir|spruce|evergreen)/.test(t)) return { tree: 4 };
    if (/(autumn|orange|maple|fall )/.test(t)) return { tree: 2 };
    if (/(cherry|blossom|sakura|pink)/.test(t)) return { tree: 3 };
    if (/(jungle|tropical|palm)/.test(t)) return { tree: 5 };
    if (/(dead|charred|barren)/.test(t)) return { tree: 6 };
    if (/green/.test(t)) return { tree: 1 };
    return {};
  }
  function regionFrom(t) {
    if (/\bnorth/.test(t)) return 'north';
    if (/\bsouth/.test(t)) return 'south';
    if (/\beast/.test(t)) return 'east';
    if (/\bwest/.test(t)) return 'west';
    if (/(center|centre|middle|here)/.test(t)) return 'center';
    return null;
  }

  function nameAfter(t, kw) {
    const i = t.indexOf(kw);
    const FILLER = { this: 1, the: 1, my: 1, universe: 1, as: 1, timeline: 1, called: 1, it: 1 };
    const tokens = t.slice(i + kw.length).trim().split(/\s+/).filter((w) => w && !FILLER[w]);
    return tokens.join(' ') || (kw === 'branch' ? '' : 'autosave');
  }
  function ageFrom(t) {
    for (const a of GC.data.CIV_AGES) if (a !== 'none' && t.includes(a.split(' ')[0])) return a;
    if (t.includes('bronze')) return 'bronze age';
    if (t.includes('medieval')) return 'iron age';
    if (t.includes('modern') || t.includes('present')) return 'information';
    if (t.includes('future') || t.includes('advanced')) return 'spacefaring';
    return 'stone age';
  }
  function climateFromDesc(t) {
    if (/(ice|frozen|snow|glacial)/.test(t)) return 'ice';
    if (/(volcan|lava|magma|molten|obsidian)/.test(t)) return 'volcanic';
    if (/(ocean|water world|sea world)/.test(t)) return 'ocean';
    if (/(desert|arid|dune|sand)/.test(t)) return 'desert';
    if (/(jungle|tropical|rainforest|verdant)/.test(t)) return 'jungle';
    if (/(barren|dead|airless|rock)/.test(t)) return 'barren';
    if (/(earth|temperate|habitable|calm)/.test(t)) return 'temperate';
    return null;
  }
  const LEVEL_WORDS = {
    quantum: 0, atom: 1, atomic: 1, object: 2, room: 3, building: 4, street: 5,
    city: 6, country: 7, surface: 8, ground: 8, planet: 9, world: 9,
    system: 10, 'solar system': 10, galaxy: 11, universe: 12, cosmos: 12,
  };
  function levelFrom(t) { for (const k in LEVEL_WORDS) if (t.includes(k)) return LEVEL_WORDS[k]; return null; }
  function standaloneLevel(t) {
    const words = t.split(/\s+/);
    if (words.length <= 2) { for (const k in LEVEL_WORDS) if (t === k || t === 'the ' + k) return LEVEL_WORDS[k]; }
    return null;
  }

  /* ---------------- LLM adapter (optional) ----------------
     If an API key is configured, route free-form text through Claude, which
     returns a JSON intent (or a list of intents). Falls back to parse(). */
  I.llmEnabled = function () { return !!localStorage.getItem('godconsole:apikey'); };

  I.parseLLM = async function (raw) {
    const key = localStorage.getItem('godconsole:apikey');
    if (!key) return [I.parse(raw)];
    const verbs = "genesis,undo,redo,save,load,reset,help,time(scale),zoom(d),zoomTo(level 0-12),gravity(g),moon(count),removeMoon,rings(on),sun(mul),starColor(color hex),climate(type: temperate|ocean|ice|volcanic|desert|jungle|barren),weather(w: clear|rain|snow|storm),clouds(d),ocean(color),land(color),sky(color),brightness(d),life,civ(age),war(on),extinct,newPlanet(type,desc),blackhole(mode: star|companion),supernova,comet,asteroid,aurora(on),branch(label),duplicate";
    const sys = `You are the natural-language interpreter for a god-game. Convert the player's sentence into a JSON array of intent objects the engine can run. Allowed verbs and params: ${verbs}. Colors must be hex. Respond with ONLY a JSON array, e.g. [{"verb":"climate","params":{"type":"ice"}}].`;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-8',
          max_tokens: 400,
          system: sys,
          messages: [{ role: 'user', content: raw }],
        }),
      });
      const data = await res.json();
      const text = (data.content && data.content[0] && data.content[0].text) || '[]';
      const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
      const arr = JSON.parse(json);
      return Array.isArray(arr) && arr.length ? arr : [I.parse(raw)];
    } catch (e) {
      return [I.parse(raw)];
    }
  };

  GC.interpreter = I;
})(window.GC = window.GC || {});
