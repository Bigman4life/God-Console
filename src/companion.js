/* God Console — companion.js
   The calm operating-system voice. Writes terse readouts to the console log
   and the live status panel. Never intrusive. */
(function (GC) {
  'use strict';
  const U = GC.util;

  let logEl, statusEl, zoomEl;
  const C = {};

  C.init = function (els) { logEl = els.log; statusEl = els.status; zoomEl = els.zoom; };

  function line(text, cls) {
    if (!logEl) return;
    const d = document.createElement('div');
    d.className = 'line ' + (cls || '');
    d.textContent = text;
    logEl.appendChild(d);
    while (logEl.children.length > 200) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }
  C.you = (t) => line('> ' + t, 'you');
  C.sys = (t) => line(t, 'sys');
  C.dim = (t) => line(t, 'dim');
  C.err = (t) => line(t, 'err');

  // event from simulation -> log + sound
  C.event = function (text, kind) {
    line('  ' + text, 'evt');
    if (GC.audio) GC.audio.event(kind);
  };

  // first-contact moment: the civilization speaks back
  C.contact = function (p) {
    setTimeout(() => {
      line('  Incoming transmission on the console:', 'evt');
      C.dim('     "...is someone there?"');
      C.dim('     "We have always wondered if we were created."');
      if (GC.audio) GC.audio.chord(392, 'sine');
    }, 1400);
  };

  const ZOOM_LEVELS = ['Quantum', 'Atom', 'Object', 'Room', 'Building', 'Street',
    'City', 'Country', 'Surface', 'Planet', 'Solar System', 'Galaxy', 'Universe'];

  C.updateStatus = function () {
    const W = GC.World;
    if (!W.born) { if (statusEl) statusEl.innerHTML = ''; if (zoomEl) zoomEl.textContent = ''; return; }
    const p = W.planet;
    if (zoomEl) zoomEl.textContent = '⟸  ' + ZOOM_LEVELS[U.clamp(W.cam.level, 0, 12)] + '  ⟹';
    const civ = p.civ.present ? `${p.civ.age} · ${U.fmt(p.civ.population)}` : (p.life.present ? 'pre-sentient' : 'none');
    const ts = W.time.paused || W.time.scale === 0 ? 'paused'
      : W.time.scale <= 1 ? '1×' : U.fmt(W.time.scale) + ' yr/s';
    if (statusEl) statusEl.innerHTML =
      `gravity <b>${p.gravity}G</b><br>` +
      `time <b>${ts}</b><br>` +
      `age <b>${U.fmt(W.time.age)} yr</b><br>` +
      `climate <b>${p.climate}</b><br>` +
      `weather <b>${p.weather}</b><br>` +
      `moons <b>${p.moons.length}</b><br>` +
      `life <b>${civ}</b>`;
  };

  GC.companion = C;
})(window.GC = window.GC || {});
