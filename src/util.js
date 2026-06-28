/* God Console — util.js
   Math, color, and RNG helpers. Attaches to global GC namespace so all
   modules can be loaded as classic scripts (works over file://). */
(function (GC) {
  'use strict';

  const U = {};

  U.TAU = Math.PI * 2;
  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.invlerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  U.smooth = (t) => t * t * (3 - 2 * t);
  U.mix = (a, b, t) => a.map((x, i) => U.lerp(x, b[i], t));
  U.rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  U.randInt = (a, b) => Math.floor(U.rand(a, b + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  U.wrapAngle = (a) => ((a % U.TAU) + U.TAU) % U.TAU;

  /* Seeded RNG (mulberry32) for deterministic procedural generation. */
  U.makeRng = function (seed) {
    let s = seed >>> 0 || 1;
    const fn = function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    fn.range = (a, b) => a + fn() * (b - a);
    fn.int = (a, b) => Math.floor(fn.range(a, b + 1));
    fn.pick = (arr) => arr[Math.floor(fn() * arr.length)];
    fn.sign = () => (fn() < 0.5 ? -1 : 1);
    return fn;
  };

  U.hashStr = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  /* ---- color ---- */
  U.hexRgb = function (h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgbStr = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  U.mixHex = function (h1, h2, t) {
    return U.mix(U.hexRgb(h1), U.hexRgb(h2), t);
  };
  U.shade = function (c, amt) {
    // amt -1..1 ; negative darker, positive lighter
    if (amt >= 0) return c.map((x) => U.lerp(x, 255, amt));
    return c.map((x) => U.lerp(x, 0, -amt));
  };
  U.hsl = function (h, s, l) {
    // h 0..360, s/l 0..1 -> [r,g,b]
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  };

  /* value noise (smooth pseudo-random field), for terrain/clouds */
  U.noise1 = function (rng, n) {
    const a = [];
    for (let i = 0; i < n; i++) a.push(rng());
    return function (x) {
      x = ((x % n) + n) % n;
      const i = Math.floor(x), f = x - i, t = U.smooth(f);
      return U.lerp(a[i], a[(i + 1) % n], t);
    };
  };

  /* format large numbers (years, population) */
  U.fmt = function (n) {
    n = Math.round(n);
    if (n >= 1e12) return (n / 1e12).toFixed(2).replace(/\.?0+$/, '') + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'k';
    return '' + n;
  };

  GC.util = U;
})(window.GC = window.GC || {});
