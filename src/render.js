/* God Console — render.js
   Progressive canvas renderer with a camera that zooms across scales.
   Distinct scenes per zoom level; the Planet view uses orthographic column
   sampling of a procedurally generated globe texture for a real 3D feel. */
(function (GC) {
  'use strict';
  const U = GC.util;

  let canvas, ctx, W, H, CX, CY, DPR = 1;
  const particles = [];
  let bgStars = [];
  let nebula = [];

  const R = {};

  R.init = function (cv) {
    canvas = cv; ctx = canvas.getContext('2d');
    R.resize();
    addEventListener('resize', R.resize);
  };
  R.resize = function () {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    CX = W / 2; CY = H / 2;
    makeBgStars(); makeNebula();
  };

  function makeBgStars() {
    bgStars = [];
    const n = Math.round((W * H) / 1600);
    const rng = U.makeRng(12345);
    for (let i = 0; i < n; i++) {
      bgStars.push({ x: rng(), y: rng(), z: rng.range(0.2, 1), tw: rng.range(0, U.TAU), hue: rng() < 0.1 ? rng.range(180, 260) : 0 });
    }
  }
  function makeNebula() {
    nebula = [];
    const rng = U.makeRng(777);
    for (let i = 0; i < 5; i++) {
      nebula.push({
        x: rng(), y: rng(), r: rng.range(0.3, 0.7),
        c: U.hsl(rng.range(200, 320), 0.6, 0.5), a: rng.range(0.04, 0.10),
      });
    }
  }

  /* ---- particles (genesis & debris) ---- */
  R.burst = function (x, y, n, power, color) {
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, U.TAU), s = U.rand(0.4, power);
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1, decay: U.rand(0.004, 0.013), r: U.rand(0.6, 2.6),
        c: color || [255, U.rand(210, 255), U.rand(160, 255)],
      });
    }
  };
  function drawParticles() {
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.vy *= 0.99; p.life -= p.decay;
      ctx.fillStyle = U.rgbStr(p.c, U.clamp(p.life, 0, 1));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.fill();
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  }

  /* ====================================================================
     PLANET GLOBE — procedural texture + orthographic column rendering
     ==================================================================== */
  function noise2D(rng, gw, gh) {
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    return function (x, y) {
      const fx = x * gw, fy = y * gh;
      const x0 = ((Math.floor(fx) % gw) + gw) % gw, y0 = U.clamp(Math.floor(fy), 0, gh - 1);
      const x1 = (x0 + 1) % gw, y1 = U.clamp(y0 + 1, 0, gh - 1);
      const tx = U.smooth(fx - Math.floor(fx)), ty = U.smooth(fy - Math.floor(fy));
      const a = U.lerp(g[y0 * gw + x0], g[y0 * gw + x1], tx);
      const b = U.lerp(g[y1 * gw + x0], g[y1 * gw + x1], tx);
      return U.lerp(a, b, ty);
    };
  }

  function buildGlobeTexture(p) {
    const key = [p.seed, p.climate, p.oceanColor, p.landColor, p.iceColor, p.continents].join('|');
    if (p._texKey === key && p._tex) return;
    p._texKey = key;
    const TW = 360, TH = 180;
    const tex = document.createElement('canvas'); tex.width = TW; tex.height = TH;
    const tctx = tex.getContext('2d');
    const img = tctx.createImageData(TW, TH);
    const rng = U.makeRng(p.seed);
    const n1 = noise2D(rng, 8, 5), n2 = noise2D(rng, 16, 10), n3 = noise2D(rng, 32, 20);
    const ocean = U.hexRgb(p.oceanColor), land = U.hexRgb(p.landColor), ice = U.hexRgb(p.iceColor);
    const landHi = U.shade(land, 0.25), landLo = U.shade(land, -0.25);
    const seaLevel = p.climate === 'ocean' ? 0.62 : p.climate === 'desert' ? 0.38 : 0.5;
    for (let y = 0; y < TH; y++) {
      const lat = y / TH;                 // 0..1 (pole to pole)
      const polar = Math.abs(lat - 0.5) * 2; // 0 eq -> 1 pole
      for (let x = 0; x < TW; x++) {
        const u = x / TW;
        let h = n1(u, lat) * 0.6 + n2(u, lat) * 0.3 + n3(u, lat) * 0.1;
        h += (0.5 - polar) * 0.05;
        let col;
        if (h < seaLevel) {
          const d = U.invlerp(0, seaLevel, h);
          col = U.mix(U.shade(ocean, -0.3), ocean, d);
        } else {
          const e = U.invlerp(seaLevel, 1, h);
          col = U.mix(landLo, landHi, e);
        }
        // ice caps near poles (climate dependent)
        const iceLine = p.climate === 'ice' ? 0.25 : p.climate === 'volcanic' ? 1.1 : 0.78;
        if (polar > iceLine) col = U.mix(col, ice, U.clamp((polar - iceLine) / (1 - iceLine), 0, 1));
        const idx = (y * TW + x) * 4;
        img.data[idx] = col[0]; img.data[idx + 1] = col[1]; img.data[idx + 2] = col[2]; img.data[idx + 3] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);
    p._tex = wrapPad(tex, TW, TH); p._texW = TW; p._texH = TH;

    // cloud texture (alpha)
    const cl = document.createElement('canvas'); cl.width = TW; cl.height = TH;
    const clx = cl.getContext('2d'); const cimg = clx.createImageData(TW, TH);
    const c1 = noise2D(rng, 10, 6), c2 = noise2D(rng, 22, 12);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const v = c1(x / TW, y / TH) * 0.6 + c2(x / TW, y / TH) * 0.4;
      const a = U.clamp((v - 0.45) * 3, 0, 1) * 255;
      const idx = (y * TW + x) * 4;
      cimg.data[idx] = cimg.data[idx + 1] = cimg.data[idx + 2] = 255; cimg.data[idx + 3] = a;
    }
    clx.putImageData(cimg, 0, 0); p._cloudTex = wrapPad(cl, TW, TH);
  }

  // pad a tileable texture with a copy of its first column at the right edge,
  // so orthographic sampling at u=1 wraps continuously to u=0 (no seam).
  function wrapPad(src, TW, TH) {
    const pad = document.createElement('canvas'); pad.width = TW + 1; pad.height = TH;
    const pc = pad.getContext('2d');
    pc.drawImage(src, 0, 0);
    pc.drawImage(src, 0, 0, 1, TH, TW, 0, 1, TH);
    return pad;
  }

  // light direction (sun) on screen for the planet/system views
  function sunDir() {
    return { x: -0.72, y: -0.45 }; // upper-left light
  }

  function drawGlobe(cx, cy, r, p, opt) {
    opt = opt || {};
    buildGlobeTexture(p);
    const tex = p._tex, cloud = p._cloudTex, TW = p._texW, TH = p._texH;
    const spin = p.spin || 0;
    const tilt = p.axialTilt || 0;
    const cols = Math.max(60, Math.floor(r * 2));
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, U.TAU); ctx.clip();

    // rotate the clip space for axial tilt
    ctx.translate(cx, cy); ctx.rotate(tilt); ctx.translate(-cx, -cy);

    for (let i = 0; i <= cols; i++) {
      const sx = -r + (i / cols) * 2 * r;     // screen offset -r..r
      const f = U.clamp(sx / r, -1, 1);
      const lon = Math.asin(f);                // orthographic longitude
      let texU = (spin + lon) / U.TAU;
      texU = ((texU % 1) + 1) % 1;
      const chord = Math.sqrt(Math.max(0, r * r - sx * sx));
      const colW = (2 * r) / cols + 1;
      ctx.drawImage(tex, texU * TW, 0, 1, TH, cx + sx, cy - chord, colW, chord * 2);
    }
    // clouds layer (slower spin)
    if (p.cloudiness > 0.02) {
      ctx.globalAlpha = U.clamp(p.cloudiness, 0, 1) * 0.8;
      const cspin = spin * 0.6;
      for (let i = 0; i <= cols; i++) {
        const sx = -r + (i / cols) * 2 * r;
        const f = U.clamp(sx / r, -1, 1);
        const lon = Math.asin(f);
        let texU = (cspin + lon) / U.TAU; texU = ((texU % 1) + 1) % 1;
        const chord = Math.sqrt(Math.max(0, r * r - sx * sx));
        const colW = (2 * r) / cols + 1;
        ctx.drawImage(cloud, texU * TW, 0, 1, TH, cx + sx, cy - chord, colW, chord * 2);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // limb darkening + day/night terminator
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, U.TAU); ctx.clip();
    const ld = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    ld.addColorStop(0, 'rgba(0,0,0,0)'); ld.addColorStop(1, 'rgba(0,0,12,0.55)');
    ctx.fillStyle = ld; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const L = sunDir();
    const tg = ctx.createLinearGradient(cx + L.x * r, cy + L.y * r, cx - L.x * r, cy - L.y * r);
    tg.addColorStop(0, 'rgba(255,250,235,0.12)');
    tg.addColorStop(0.5, 'rgba(0,0,0,0)');
    tg.addColorStop(0.72, 'rgba(0,0,14,0.45)');
    tg.addColorStop(1, 'rgba(0,0,14,0.78)');
    ctx.fillStyle = tg; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // night lights for advanced civs
    if (p.civ && p.civ.present && p.civ.level >= 4) {
      ctx.globalCompositeOperation = 'lighter';
      const rng = U.makeRng(p.seed ^ 0x55);
      const lights = Math.min(120, p.civ.level * 18);
      for (let i = 0; i < lights; i++) {
        const a = rng.range(0, U.TAU), rr = rng.range(0, r * 0.95);
        const lx = cx + Math.cos(a) * rr, ly = cy + Math.sin(a) * rr;
        // only on night side
        const ndot = (lx - cx) * -L.x + (ly - cy) * -L.y;
        if (ndot > 0) { ctx.fillStyle = 'rgba(255,220,150,0.5)'; ctx.fillRect(lx, ly, 1.4, 1.4); }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // atmosphere rim
    if (p.atmosphere > 0.05) {
      const atmC = U.mix([150, 195, 255], U.hexRgb(p.oceanColor), 0.2);
      const ag = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.14);
      ag.addColorStop(0, U.rgbStr(atmC, 0));
      ag.addColorStop(0.6, U.rgbStr(atmC, 0.18 * p.atmosphere));
      ag.addColorStop(1, U.rgbStr(atmC, 0));
      ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, cy, r * 1.14, 0, U.TAU); ctx.fill();
    }
    // life halo
    if (p.life && p.life.present) {
      ctx.strokeStyle = U.rgbStr([120, 255, 170], 0.10 + 0.08 * p.life.biodiversity);
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r * 1.18, 0, U.TAU); ctx.stroke();
    }
  }

  function drawRings(cx, cy, r, p, front) {
    if (!p.hasRings) return;
    const col = U.hexRgb(p.ringColor);
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(p.ringTilt || 0.4); ctx.scale(1, 0.32);
    for (let rr = r * 1.4; rr < r * 2.2; rr += 3) {
      const a = 0.18 + 0.12 * Math.sin(rr * 0.6);
      ctx.strokeStyle = U.rgbStr(col, a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      // back half vs front half (relative to viewer): split by y sign in unscaled space
      if (front) ctx.arc(0, 0, rr, 0, Math.PI);
      else ctx.arc(0, 0, rr, Math.PI, U.TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStar(cx, cy, r, color) {
    const c = color || '#ffd27f';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.6);
    g.addColorStop(0, 'rgba(255,245,225,0.98)');
    g.addColorStop(0.35, U.rgbStr(U.hexRgb(c), 0.6));
    g.addColorStop(1, U.rgbStr(U.hexRgb(c), 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 2.6, 0, U.TAU); ctx.fill();
    ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, U.TAU); ctx.fill();
  }

  /* ---- backgrounds ---- */
  function drawSpaceBg(tint, t) {
    const [r, g, b] = tint || [6, 8, 16];
    const grd = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.85);
    grd.addColorStop(0, `rgb(${r + 5},${g + 6},${b + 10})`);
    grd.addColorStop(1, `rgb(${Math.max(0, r - 4)},${Math.max(0, g - 4)},${Math.max(0, b - 2)})`);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    for (const nb of nebula) {
      const ng = ctx.createRadialGradient(nb.x * W, nb.y * H, 0, nb.x * W, nb.y * H, nb.r * Math.max(W, H));
      ng.addColorStop(0, U.rgbStr(nb.c, nb.a));
      ng.addColorStop(1, U.rgbStr(nb.c, 0));
      ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
    }
    for (const s of bgStars) {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(s.tw + t * 1.6)) * s.z;
      ctx.fillStyle = s.hue ? U.rgbStr(U.hsl(s.hue, 0.5, 0.8), a) : `rgba(255,255,255,${a})`;
      const sz = s.z * 1.7;
      ctx.fillRect(s.x * W, s.y * H, sz, sz);
    }
  }

  /* ====================================================================
     SCENES
     ==================================================================== */
  function scenePlanet(W_, t) {
    const p = W_.planet;
    drawSpaceBg(p.skyTint, t);
    // the star, off to the side
    drawStar(CX - W * 0.34, CY - H * 0.3, W_.star.baseRadius * 0.7, W_.star.color);
    const r = U.clamp(p.baseRadius, 10, Math.min(W, H) * 0.34);
    p.radius = U.lerp(p.radius, r, 0.06);
    drawRings(CX, CY, p.radius, p, false);
    drawGlobe(CX, CY, p.radius, p);
    drawRings(CX, CY, p.radius, p, true);
    // moons
    for (const m of p.moons) {
      const mx = CX + Math.cos(m.ang) * m.dist;
      const my = CY + Math.sin(m.ang) * m.dist * 0.55;
      const front = Math.sin(m.ang) >= 0;
      const mr = m.r * (m.grow == null ? 1 : m.grow);
      const g = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 0, mx, my, mr);
      g.addColorStop(0, m.color || '#d8d8d8'); g.addColorStop(1, U.rgbStr(U.shade(U.hexRgb(m.color || '#d8d8d8'), -0.5)));
      ctx.globalAlpha = front ? 1 : 0.85;
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, Math.max(1, mr), 0, U.TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function sceneSystem(W_, t) {
    drawSpaceBg([4, 6, 12], t);
    drawStar(CX, CY, W_.star.baseRadius * 0.8, W_.star.color);
    const sys = W_.system;
    for (let i = 0; i < sys.planets.length; i++) {
      const sp = sys.planets[i];
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.ellipse(CX, CY, sp.dist, sp.dist * 0.4, 0, 0, U.TAU); ctx.stroke();
      const x = CX + Math.cos(sp.ang) * sp.dist, y = CY + Math.sin(sp.ang) * sp.dist * 0.4;
      ctx.fillStyle = sp.color; ctx.beginPath(); ctx.arc(x, y, sp.r, 0, U.TAU); ctx.fill();
      if (sp.rings) { ctx.strokeStyle = 'rgba(200,180,140,0.4)'; ctx.beginPath(); ctx.ellipse(x, y, sp.r * 1.8, sp.r * 0.6, 0.4, 0, U.TAU); ctx.stroke(); }
    }
    // the focus planet sits in a highlighted orbit
    const fp = W_.planet;
    const fd = 220, fx = CX + Math.cos(fp.spin) * fd, fy = CY + Math.sin(fp.spin) * fd * 0.4;
    ctx.strokeStyle = 'rgba(160,210,255,0.25)';
    ctx.beginPath(); ctx.ellipse(CX, CY, fd, fd * 0.4, 0, 0, U.TAU); ctx.stroke();
    drawGlobe(fx, fy, 20, fp);
  }

  function sceneGalaxy(W_, t) {
    drawSpaceBg([6, 5, 14], t);
    const rng = U.makeRng(W_.galaxySeed);
    const arms = 4, n = 1400;
    ctx.save(); ctx.translate(CX, CY); ctx.rotate(t * 0.02);
    for (let i = 0; i < n; i++) {
      const arm = i % arms;
      const dist = Math.pow(rng(), 0.5) * Math.min(W, H) * 0.46;
      const baseA = (arm / arms) * U.TAU + dist * 0.012;
      const a = baseA + rng.range(-0.18, 0.18);
      const x = Math.cos(a) * dist, y = Math.sin(a) * dist * 0.6;
      const hue = 200 + rng.range(-30, 80);
      const br = 0.4 + 0.6 * (1 - dist / (Math.min(W, H) * 0.46));
      ctx.fillStyle = U.rgbStr(U.hsl(hue, 0.4, 0.7), br);
      const sz = rng() < 0.04 ? 2.2 : 1;
      ctx.fillRect(x, y, sz, sz);
    }
    // core glow
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.min(W, H) * 0.22);
    cg.addColorStop(0, 'rgba(255,240,210,0.5)');
    cg.addColorStop(0.4, 'rgba(255,200,150,0.18)');
    cg.addColorStop(1, 'rgba(255,180,120,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, Math.min(W, H) * 0.22, 0, U.TAU); ctx.fill();
    ctx.restore();
  }

  function sceneUniverse(W_, t) {
    drawSpaceBg([3, 3, 8], t);
    const rng = U.makeRng(W_.universeSeed);
    for (let i = 0; i < 26; i++) {
      const x = rng() * W, y = rng() * H, r = rng.range(12, 46);
      const hue = rng.range(190, 320);
      ctx.save(); ctx.translate(x, y); ctx.rotate(rng.range(0, U.TAU));
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, U.rgbStr(U.hsl(hue, 0.5, 0.8), 0.6));
      g.addColorStop(0.4, U.rgbStr(U.hsl(hue, 0.5, 0.6), 0.2));
      g.addColorStop(1, U.rgbStr(U.hsl(hue, 0.5, 0.5), 0));
      ctx.scale(1, 0.5); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, U.TAU); ctx.fill();
      ctx.restore();
    }
  }

  function skyGradient(p, day) {
    const tint = p.skyTint;
    const top = U.shade(tint, day ? 0.15 : -0.4);
    const bot = U.mix(tint, U.hexRgb(p.oceanColor), 0.4);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, U.rgbStr(top));
    g.addColorStop(1, U.rgbStr(U.shade(bot, day ? 0.2 : -0.2)));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function sceneSurface(W_, t) {
    const p = W_.planet;
    skyGradient(p, true);
    // sun / moons on horizon band
    drawStar(W * 0.78, H * 0.26, 26, W_.star.color);
    for (const m of p.moons) {
      const mx = (Math.cos(m.ang) * 0.5 + 0.5) * W;
      ctx.fillStyle = m.color || '#ddd';
      ctx.beginPath(); ctx.arc(mx, H * 0.18 + Math.sin(m.ang) * 20, m.r * 0.8, 0, U.TAU); ctx.fill();
    }
    // terrain silhouette (procedural ridge)
    const rng = U.makeRng(p.seed ^ 0x9);
    const nz = U.noise1(rng, 24);
    const horizon = H * 0.62;
    ctx.fillStyle = U.rgbStr(U.shade(U.hexRgb(p.landColor), -0.1));
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) {
      const y = horizon + nz(x * 0.02 + p.seed * 0.001) * 80 - 40;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // closer ridge
    ctx.fillStyle = U.rgbStr(U.shade(U.hexRgb(p.landColor), -0.35));
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) {
      const y = horizon + 70 + nz(x * 0.035 + 99) * 60;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    // vegetation if life
    if (p.life && p.life.present) {
      const veg = Math.floor(40 * p.life.biodiversity) + 6;
      const vr = U.makeRng(p.seed ^ 0x77);
      ctx.fillStyle = U.rgbStr(U.shade(U.hexRgb(p.landColor), -0.5));
      for (let i = 0; i < veg; i++) {
        const x = vr() * W, y = horizon + 70 + vr() * 70;
        ctx.fillRect(x, y - 10, 2, 10);
        ctx.beginPath(); ctx.arc(x + 1, y - 12, 4, 0, U.TAU); ctx.fill();
      }
    }
    // weather particles
    drawWeather(p, t);
  }

  function sceneCity(W_, t) {
    const p = W_.planet;
    skyGradient(p, true);
    const hasCiv = p.civ && p.civ.present;
    const level = hasCiv ? p.civ.level : 0;
    const rng = U.makeRng(p.seed ^ 0xc1);
    const ground = H * 0.78;
    // far skyline
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = U.rgbStr(U.shade(U.hexRgb(p.landColor), layer === 0 ? -0.55 : -0.7));
      let x = 0;
      while (x < W) {
        const bw = rng.range(30, 70);
        const bh = rng.range(40, 220) * (0.5 + level / 8) * (layer === 0 ? 1 : 0.7);
        const by = ground - bh - layer * 10;
        ctx.fillRect(x, by, bw - 4, bh + 40);
        // windows for advanced civ
        if (level >= 3) {
          ctx.fillStyle = 'rgba(255,220,150,0.5)';
          for (let wy = by + 8; wy < ground; wy += 12)
            for (let wx = x + 4; wx < x + bw - 8; wx += 10)
              if (rng() < 0.5) ctx.fillRect(wx, wy, 4, 5);
          ctx.fillStyle = U.rgbStr(U.shade(U.hexRgb(p.landColor), layer === 0 ? -0.55 : -0.7));
        }
        x += bw;
      }
    }
    ctx.fillStyle = U.rgbStr(U.shade(U.hexRgb(p.landColor), -0.3));
    ctx.fillRect(0, ground, W, H - ground);
    drawWeather(p, t);
  }

  function drawWeather(p, t) {
    const w = p.weather;
    if (w === 'clear') return;
    const rng = U.makeRng(99);
    const n = 220;
    ctx.save();
    if (w === 'rain') {
      ctx.strokeStyle = 'rgba(170,200,235,0.45)'; ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const x = (rng() * W + t * 200) % W;
        const y = (rng() * H + t * 700) % H;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); ctx.stroke();
      }
    } else if (w === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < n; i++) {
        const x = (rng() * W + Math.sin(t + i) * 20) % W;
        const y = (rng() * H + t * 60) % H;
        ctx.beginPath(); ctx.arc(x, y, rng.range(0.6, 2), 0, U.TAU); ctx.fill();
      }
    } else if (w === 'ash') {
      ctx.fillStyle = 'rgba(255,120,60,0.5)';
      for (let i = 0; i < n; i++) {
        const x = (rng() * W) % W;
        const y = (rng() * H - t * 90 + H) % H;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    } else if (w === 'storm') {
      if (Math.sin(t * 3) > 0.985) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, 0, W, H); }
      ctx.strokeStyle = 'rgba(170,200,235,0.5)';
      for (let i = 0; i < n; i++) {
        const x = (rng() * W + t * 320) % W, y = (rng() * H + t * 900) % H;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 14); ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* generic stylized close-ups for human-scale levels */
  function sceneAbstract(W_, t, level) {
    const p = W_.planet;
    skyGradient(p, true);
    const rng = U.makeRng(p.seed ^ (level * 131));
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 60; i++) {
      const x = rng() * W, y = rng() * H, s = rng.range(20, 160);
      ctx.fillStyle = U.rgbStr(U.shade(U.hexRgb(rng() < 0.5 ? p.landColor : p.oceanColor), rng.range(-0.4, 0.3)), 0.5);
      ctx.fillRect(x, y, s, s * rng.range(0.4, 1.2));
    }
    ctx.globalAlpha = 1;
  }

  function sceneAtom(W_, t) {
    drawSpaceBg([2, 4, 10], t);
    const cx = CX, cy = CY;
    const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
    ng.addColorStop(0, 'rgba(255,180,120,0.95)'); ng.addColorStop(1, 'rgba(255,90,60,0)');
    ctx.fillStyle = ng; ctx.beginPath(); ctx.arc(cx, cy, 40, 0, U.TAU); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const rx = 120 + i * 60, ry = (60 + i * 30) * (i % 2 ? -1 : 1) + 110;
      const rot = i * 1.1 + t * 0.2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      ctx.strokeStyle = 'rgba(150,200,255,0.25)';
      ctx.beginPath(); ctx.ellipse(0, 0, rx, Math.abs(ry), 0, 0, U.TAU); ctx.stroke();
      const ea = t * (1.5 + i);
      const ex = Math.cos(ea) * rx, ey = Math.sin(ea) * Math.abs(ry);
      ctx.fillStyle = '#9fd2ff'; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, U.TAU); ctx.fill();
      ctx.restore();
    }
  }

  function sceneQuantum(W_, t) {
    drawSpaceBg([4, 2, 10], t);
    for (let i = 0; i < 260; i++) {
      const x = CX + Math.cos(i * 2.4 + t) * 280 * Math.sin(i + t * 0.5);
      const y = CY + Math.sin(i * 1.7 + t) * 220 * Math.cos(i + t * 0.3);
      ctx.fillStyle = U.rgbStr(U.hsl(200 + (i % 80), 0.7, 0.7), 0.5);
      ctx.fillRect(x, y, 2, 2);
    }
  }

  const SCENES = [
    sceneQuantum,   // 0
    sceneAtom,      // 1
    (w, t) => sceneAbstract(w, t, 2), // Object
    (w, t) => sceneAbstract(w, t, 3), // Room
    (w, t) => sceneAbstract(w, t, 4), // Building
    (w, t) => sceneAbstract(w, t, 5), // Street
    sceneCity,      // 6 City
    (w, t) => sceneAbstract(w, t, 7), // Country
    sceneSurface,   // 8 Surface
    scenePlanet,    // 9 Planet
    sceneSystem,    // 10 Solar System
    sceneGalaxy,    // 11 Galaxy
    sceneUniverse,  // 12 Universe
  ];

  /* ---- genesis overlay (the assembling light) ---- */
  let genesis = null;
  R.genesis = function () {
    genesis = { r: 0, max: Math.min(W, H) * 0.55, glow: 0, on: true };
    R.burst(CX, CY, 160, 7.5);
    setTimeout(() => { if (genesis) genesis.glow = 1; }, 120);
  };
  R.endGenesis = function () { if (genesis) genesis.glow = 0; setTimeout(() => genesis = null, 1500); };

  /* ---- main draw ---- */
  let lastT = 0;
  R.draw = function (now) {
    const W_ = GC.World;
    const t = now / 1000; lastT = t;
    ctx.clearRect(0, 0, W, H);

    if (!W_.born) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      // faint pre-genesis stars
      for (const s of bgStars) {
        const a = 0.05 + 0.05 * Math.abs(Math.sin(s.tw + t));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(s.x * W, s.y * H, 1, 1);
      }
      drawParticles();
      return;
    }

    // camera transition (zoom punch + fade)
    const cam = W_.cam;
    cam.transition = U.clamp(cam.transition + 0.045, 0, 1);
    const tr = U.smooth(cam.transition);
    const scaleFrom = cam.dir < 0 ? 1.7 : 0.62;
    const s = U.lerp(scaleFrom, 1, tr);
    ctx.save();
    ctx.translate(CX, CY); ctx.scale(s, s); ctx.translate(-CX, -CY);
    ctx.globalAlpha = U.lerp(0.2, 1, tr);

    const scene = SCENES[U.clamp(cam.level, 0, SCENES.length - 1)];
    scene(W_, t);

    ctx.restore();
    ctx.globalAlpha = 1;

    // genesis light on top
    if (genesis) {
      genesis.r = U.lerp(genesis.r, genesis.glow ? genesis.max : 0, 0.05);
      const lg = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.max(1, genesis.r));
      lg.addColorStop(0, `rgba(255,255,255,${0.95 * genesis.glow})`);
      lg.addColorStop(0.25, `rgba(220,235,255,${0.5 * genesis.glow})`);
      lg.addColorStop(1, 'rgba(180,200,255,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    }
    drawParticles();

    // vignette
    const vg = ctx.createRadialGradient(CX, CY, Math.min(W, H) * 0.4, CX, CY, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  };

  R.setLevel = function (newLevel) {
    const cam = GC.World.cam;
    cam.dir = newLevel < cam.level ? -1 : 1; // -1 = zoom in (deeper)
    cam.fromLevel = cam.level;
    cam.level = newLevel;
    cam.transition = 0;
  };

  R.flash = function () { /* used on big events */
    R.burst(CX, CY, 40, 4);
  };

  GC.render = R;
})(window.GC = window.GC || {});
