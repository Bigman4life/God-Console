/* God Console — audio.js
   Generative ambient via Web Audio. No asset files. Silent until creation,
   then a slow drone fades in; events trigger soft tones. Respects autoplay
   policy (only starts after a user gesture). */
(function (GC) {
  'use strict';

  let actx = null, master = null, drone = null, started = false, enabled = true;
  const A = {};

  function ensure() {
    if (actx) return true;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain();
      master.gain.value = 0.0;
      master.connect(actx.destination);
      return true;
    } catch (e) { enabled = false; return false; }
  }

  A.toggle = function () {
    enabled = !enabled;
    if (master) master.gain.linearRampToValueAtTime(enabled ? 0.18 : 0.0001, actx.currentTime + 0.6);
    return enabled;
  };
  A.isOn = function () { return enabled; };

  A.start = function () {
    if (started || !enabled) return;
    if (!ensure()) return;
    if (actx.state === 'suspended') actx.resume();
    started = true;
    master.gain.linearRampToValueAtTime(0.18, actx.currentTime + 4);

    // layered drone: two slightly detuned oscillators + slow LFO on filter
    drone = actx.createGain(); drone.gain.value = 0.5;
    const filt = actx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 420; filt.Q.value = 2;
    const o1 = actx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = actx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 55 * 1.5;
    const o3 = actx.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 110.3;
    const lfo = actx.createOscillator(); lfo.frequency.value = 0.05;
    const lfoGain = actx.createGain(); lfoGain.gain.value = 180;
    lfo.connect(lfoGain); lfoGain.connect(filt.frequency);
    [o1, o2, o3].forEach((o) => o.connect(filt));
    filt.connect(drone); drone.connect(master);
    [o1, o2, o3, lfo].forEach((o) => o.start());
  };

  // a soft bell/tone for events
  A.tone = function (freq, dur, type, vol) {
    if (!enabled || !ensure() || !started) return;
    const t = actx.currentTime;
    const o = actx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    const g = actx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime((vol || 0.12), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 1.2));
    o.connect(g); g.connect(master); o.start(t); o.stop(t + (dur || 1.2) + 0.05);
  };

  A.chord = function (base, type) {
    [1, 1.25, 1.5].forEach((m, i) => setTimeout(() => A.tone(base * m, 1.6, type || 'sine', 0.07), i * 70));
  };

  // map event kinds to sounds
  A.event = function (kind) {
    if (kind === 'life') A.chord(330, 'sine');
    else if (kind === 'civ') A.chord(294, 'triangle');
    else if (kind === 'cataclysm') A.tone(70, 2.2, 'sawtooth', 0.16);
    else if (kind === 'create') A.chord(262, 'sine');
    else A.tone(440, 0.5, 'sine', 0.06);
  };

  GC.audio = A;
})(window.GC = window.GC || {});
