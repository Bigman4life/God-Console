/* God Console — ui.js
   Autocomplete suggestion bar + the saved-universe browser panel.
   Loaded before game.js; game.boot() calls GC.ui.init(). Handlers invoke
   GC.game.runCommand lazily, so cross-module order is fine. */
(function (GC) {
  'use strict';

  // curated example phrases the suggester ranks against the current input
  const COMMANDS = [
    'let there be light',
    'create an ocean planet', 'create an earth-like planet', 'make it volcanic',
    'start an ice age', 'turn it into a desert', 'make it a jungle world', 'make it barren',
    'increase gravity to 2G', 'remove gravity', 'double the size of the sun',
    'add three moons', 'add rings', 'make the oceans purple', 'make the land red',
    'make it rain', 'start a storm', 'make it snow', 'darker', 'brighter',
    'create life', 'create intelligent life', 'start a war', 'cause a mass extinction',
    'go to surface', 'return to space',
    'grow a forest', 'plant cherry trees in the north', 'plant pine trees',
    'bloom wildflowers', 'plant purple flowers in the south',
    'raise mountains', 'flood the south', 'drain the sea', 'make a desert',
    'set fire to the forest', 'build a village', 'spawn animals', 'flatten the land',
    'add auroras', 'spawn a comet', 'create a black hole', 'a black hole orbits the moon',
    'trigger a supernova', 'strike the planet with an asteroid',
    'accelerate time', 'advance one million years', 'pause', 'resume',
    'zoom out', 'zoom in', 'go to galaxy', 'view surface', 'zoom to atom', 'zoom to universe',
    'what if gravity was 10x?', 'what if oxygen disappeared?', 'what if dinosaurs survived?',
    'what if Earth had rings?', 'what if the sun disappeared?',
    'branch timeline', 'duplicate this planet', 'save', 'load', 'undo', 'redo',
    'list universes', 'reset', 'help',
  ];

  let input, sugEl, browser, broList, broName, active = -1, current = [];
  const U = GC.util;

  function rank(q) {
    q = q.toLowerCase().trim();
    if (!q) return [];
    const toks = q.split(/\s+/);
    const scored = [];
    for (const c of COMMANDS) {
      const lc = c.toLowerCase();
      let score = 0;
      if (lc.startsWith(q)) score += 100;
      else if (lc.includes(q)) score += 50;
      for (const tk of toks) if (lc.includes(tk)) score += 8;
      if (score > 0) scored.push({ c, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 5).map((s) => s.c);
  }

  function renderSuggest() {
    if (!sugEl) return;
    sugEl.innerHTML = '';
    if (!current.length) { sugEl.classList.remove('show'); return; }
    sugEl.classList.add('show');
    current.forEach((c, i) => {
      const span = document.createElement('span');
      span.className = 'sug' + (i === active ? ' active' : '');
      span.textContent = c;
      span.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = c.replace(/\?$/, '');
        run();
      });
      sugEl.appendChild(span);
    });
  }

  function refresh() {
    current = rank(input.value);
    active = current.length ? 0 : -1;
    renderSuggest();
  }
  function clearSuggest() { current = []; active = -1; renderSuggest(); }

  function run() {
    const v = input.value.trim();
    clearSuggest();
    if (v && GC.game && GC.game.runCommand) { input.value = ''; GC.game.runCommand(v); }
  }

  /* ---- universe browser ---- */
  function openBrowser() {
    if (!browser) return;
    populate();
    browser.classList.remove('hidden');
  }
  function closeBrowser() { if (browser) browser.classList.add('hidden'); }
  function populate() {
    const W = GC.World;
    broList.innerHTML = '';
    const saves = W.listSaves();
    if (!saves.length) { broList.innerHTML = '<div class="bro-empty">No saved universes yet.</div>'; }
    for (const name of saves) {
      const row = document.createElement('div'); row.className = 'bro-row';
      const label = document.createElement('span'); label.className = 'bro-label'; label.textContent = name;
      const load = document.createElement('button'); load.textContent = 'load';
      const del = document.createElement('button'); del.textContent = '×'; del.className = 'del';
      load.addEventListener('click', () => { W.loadLocal(name); GC.companion.sys('Universe "' + name + '" restored.'); GC.companion.updateStatus(); closeBrowser(); });
      del.addEventListener('click', () => { W.deleteSave(name); populate(); });
      row.appendChild(label); row.appendChild(load); row.appendChild(del);
      broList.appendChild(row);
    }
    // also list in-memory timeline branches
    if (W.branches && W.branches.length) {
      const hdr = document.createElement('div'); hdr.className = 'bro-empty'; hdr.textContent = 'timeline branches:';
      broList.appendChild(hdr);
      W.branches.forEach((b, i) => {
        const row = document.createElement('div'); row.className = 'bro-row';
        const label = document.createElement('span'); label.className = 'bro-label';
        label.textContent = b.label + ' · ' + U.fmt(b.at) + ' yr';
        const load = document.createElement('button'); load.textContent = 'jump';
        load.addEventListener('click', () => { W.importState(b.snap); GC.companion.sys('Jumped to timeline "' + b.label + '".'); GC.companion.updateStatus(); closeBrowser(); });
        row.appendChild(label); row.appendChild(load);
        broList.appendChild(row);
      });
    }
  }

  function init() {
    input = document.getElementById('cmd');
    sugEl = document.getElementById('suggest');
    browser = document.getElementById('browser');
    broList = document.getElementById('bro-list');
    broName = document.getElementById('bro-name');

    input.addEventListener('input', refresh);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        if (current.length) { e.preventDefault(); input.value = current[active >= 0 ? active : 0].replace(/\?$/, ''); refresh(); }
      } else if (e.key === 'ArrowRight' && current.length && input.selectionStart === input.value.length) {
        input.value = current[active >= 0 ? active : 0].replace(/\?$/, ''); refresh();
      } else if (e.key === 'Enter') {
        clearSuggest();
      } else if (e.key === 'Escape') {
        clearSuggest();
      }
    });

    const closeBtn = document.getElementById('bro-close');
    if (closeBtn) closeBtn.addEventListener('click', closeBrowser);
    const saveBtn = document.getElementById('bro-save');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      const n = (broName.value || 'autosave').trim();
      GC.World.saveLocal(n); broName.value = ''; populate();
      GC.companion.sys('Universe saved as "' + n + '".');
    });
  }

  GC.ui = { init, openBrowser, closeBrowser };
})(window.GC = window.GC || {});
