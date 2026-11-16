/* World — tek canvas üzerinde: uzay (giriş) · zaman tüneli · güneşe bakan orman (paletli) + parçacıklar + konfeti */
(function (global) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : a) + ')';
  const ease = {
    linear: (t) => t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    in: (t) => t * t * t,
    outQuart: (t) => 1 - Math.pow(1 - t, 4)
  };
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const gauss = (r) => (r() + r() + r() - 1.5) / 1.5;

  /* ---------------- Paletler ---------------- */
  const PAL = {
    golden: { skyTop: [86, 148, 214], skyMid: [198, 221, 228], skyBot: [255, 236, 176], sun: [255, 252, 232], glow: [255, 224, 140], fog: [255, 232, 176], ray: [255, 242, 196], rayK: 0.36, stars: 0, sunX: 0.5, sunY: 0.27, sunR: 0.045, moon: 0, ground: [36, 30, 12], grade: [255, 200, 120, 0.06], accent: '#ffd36e' },
    sunset: { skyTop: [50, 36, 98], skyMid: [224, 104, 98], skyBot: [255, 184, 98], sun: [255, 232, 180], glow: [255, 128, 72], fog: [255, 150, 104], ray: [255, 178, 112], rayK: 0.32, stars: 0.12, sunX: 0.5, sunY: 0.42, sunR: 0.06, moon: 0, ground: [30, 12, 14], grade: [255, 110, 80, 0.08], accent: '#ff9f7a' },
    night: { skyTop: [5, 7, 28], skyMid: [22, 26, 66], skyBot: [68, 58, 122], sun: [238, 242, 255], glow: [132, 152, 255], fog: [72, 80, 150], ray: [150, 170, 255], rayK: 0.15, stars: 1, sunX: 0.66, sunY: 0.2, sunR: 0.036, moon: 1, ground: [8, 8, 20], grade: [80, 90, 200, 0.08], accent: '#a5b8ff' },
    autumn: { skyTop: [104, 98, 140], skyMid: [240, 168, 108], skyBot: [255, 206, 128], sun: [255, 244, 214], glow: [255, 170, 84], fog: [255, 196, 128], ray: [255, 196, 120], rayK: 0.34, stars: 0, sunX: 0.5, sunY: 0.3, sunR: 0.05, moon: 0, ground: [34, 14, 6], grade: [255, 130, 60, 0.08], accent: '#ffa24d' },
    winter: { skyTop: [118, 150, 204], skyMid: [204, 222, 242], skyBot: [246, 251, 255], sun: [255, 255, 255], glow: [218, 236, 255], fog: [236, 244, 255], ray: [232, 242, 255], rayK: 0.32, stars: 0, sunX: 0.5, sunY: 0.28, sunR: 0.045, moon: 0, ground: [40, 52, 76], grade: [160, 200, 255, 0.06], accent: '#bfe3ff' },
    sakura: { skyTop: [255, 190, 212], skyMid: [255, 222, 232], skyBot: [255, 244, 236], sun: [255, 255, 244], glow: [255, 206, 224], fog: [255, 218, 230], ray: [255, 226, 238], rayK: 0.32, stars: 0, sunX: 0.5, sunY: 0.28, sunR: 0.045, moon: 0, ground: [56, 20, 38], grade: [255, 150, 190, 0.07], accent: '#ff9fc0' }
  };
  const PAL_NAMES = { golden: 'Gün ışığı', sunset: 'Gün batımı', night: 'Yıldızlı gece', autumn: 'Sonbahar', winter: 'Kış', sakura: 'Sakura' };
  const clonePal = (p) => { const o = {}; for (const k in p) o[k] = Array.isArray(p[k]) ? p[k].slice() : p[k]; return o; };

  /* ---------------- Durum ---------------- */
  let cv = null, ctx = null, W = 0, H = 0, dpr = 1, qual = 1;
  let mode = 'space', t = 0, last = 0, running = false;
  let pal = clonePal(PAL.golden), tgt = PAL.golden;
  const cam = { zoom: 1, kick: 0, rayBoost: 1, parX: 0, parY: 0, tpX: 0, tpY: 0 };
  let layers = null, building = false, buildKey = '';
  let needsClear = true;
  let noiseCv = null, noisePat = null;
  const tweens = [];
  const perf = { acc: 0, n: 0, slow: 0 };

  function tween(obj, key, to, dur, easing) {
    return new Promise((res) => {
      tweens.push({ o: obj, k: key, from: obj[key], to, t: 0, dur: Math.max(0.001, dur), e: ease[easing || 'inOut'] || ease.inOut, res });
    });
  }

  /* ---------------- Ağaç katmanları (siyah siluet) ---------------- */
  function taper(c, x1, y1, x2, y2, w1, w2) {
    const a = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2, dx = Math.cos(a), dy = Math.sin(a);
    c.beginPath();
    c.moveTo(x1 + dx * w1 / 2, y1 + dy * w1 / 2); c.lineTo(x2 + dx * w2 / 2, y2 + dy * w2 / 2);
    c.lineTo(x2 - dx * w2 / 2, y2 - dy * w2 / 2); c.lineTo(x1 - dx * w1 / 2, y1 - dy * w1 / 2);
    c.closePath(); c.fill();
  }
  function branch(c, x, y, ang, len, w, depth, rnd, tips) {
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    const mx = (x + ex) / 2 + (rnd() - 0.5) * len * 0.22, my = (y + ey) / 2 + (rnd() - 0.5) * len * 0.22;
    taper(c, x, y, mx, my, w, w * 0.76); taper(c, mx, my, ex, ey, w * 0.76, w * 0.5);
    if (depth <= 0) { tips.push([ex, ey]); return; }
    const k = 2 + (rnd() < 0.4 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const da = (i - (k - 1) / 2) * (0.55 + rnd() * 0.35) + (rnd() - 0.5) * 0.3;
      branch(c, ex, ey, ang + da, len * (0.62 + rnd() * 0.2), w * 0.55, depth - 1, rnd, tips);
    }
  }
  function leafCloud(c, cx, cy, rx, ry, ls, rnd, dens) {
    const n = Math.min(1500, Math.floor((rx * ry * Math.PI) / (ls * ls * 1.1) * dens));
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd());
      const x = cx + Math.cos(a) * d * rx + gauss(rnd) * ls * 0.8;
      const y = cy + Math.sin(a) * d * ry * (Math.sin(a) > 0 ? 0.72 : 1) + gauss(rnd) * ls * 0.8;
      c.beginPath(); c.arc(x, y, ls * (0.55 + rnd() * 0.85), 0, TAU); c.fill();
    }
    c.globalCompositeOperation = 'destination-out';
    const g = Math.floor(n * 0.1);
    for (let i = 0; i < g; i++) {
      const a = rnd() * TAU, d = 0.35 + rnd() * 0.6;
      c.beginPath(); c.arc(cx + Math.cos(a) * d * rx * 0.92, cy + Math.sin(a) * d * ry * 0.8, ls * (0.25 + rnd() * 0.5), 0, TAU); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  }
  function drawBroad(c, x, gy, h, rnd, tw, leaf) {
    const trunkH = h * (0.42 + rnd() * 0.12), lean = (rnd() - 0.5) * tw * 3;
    const topX = x + lean, topY = gy - trunkH;
    c.beginPath(); c.moveTo(x - tw, gy + 8);
    c.quadraticCurveTo(x - tw * 0.55 + lean * 0.2, gy - trunkH * 0.5, topX - tw * 0.42, topY);
    c.lineTo(topX + tw * 0.42, topY);
    c.quadraticCurveTo(x + tw * 0.55 + lean * 0.2, gy - trunkH * 0.5, x + tw, gy + 8); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(x - tw * 2.2, gy + 8);
    c.quadraticCurveTo(x - tw * 0.9, gy - tw * 0.5, x - tw * 0.7, gy - tw * 2.4); c.lineTo(x + tw * 0.7, gy - tw * 2.4);
    c.quadraticCurveTo(x + tw * 0.9, gy - tw * 0.5, x + tw * 2.2, gy + 8); c.closePath(); c.fill();
    const tips = [], nb = 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < nb; i++) {
      const side = i % 2 ? 1 : -1, by = topY + trunkH * (0.04 + rnd() * 0.22);
      const ang = -Math.PI / 2 + side * (0.35 + rnd() * 0.7) * (i < 2 ? 1 : 0.6);
      branch(c, topX, by, ang, h * (0.2 + rnd() * 0.14), tw * 0.5, 2, rnd, tips);
    }
    tips.push([topX, topY - h * 0.04]);
    const ls = clamp(h * 0.02 * leaf, 3, 13), R = h * 0.095 * leaf;
    tips.forEach((p) => leafCloud(c, p[0], p[1] - R * 0.1, R * (0.8 + rnd() * 0.5), R * (0.65 + rnd() * 0.35), ls, rnd, 1.7));
  }
  function drawPine(c, x, gy, h, rnd, tw) {
    c.fillRect(x - tw * 0.3, gy - h * 0.25, tw * 0.6, h * 0.25 + 8);
    const tiers = 6 + Math.floor(rnd() * 5), base = h * 0.14;
    for (let i = 0; i < tiers; i++) {
      const f = i / (tiers - 1), y = gy - base - f * (h - base) * 0.92;
      const w = (1 - f * 0.86) * h * 0.16 + 3, th = ((h - base) / tiers) * 1.9, n = 3, pts = [];
      for (let k = 1; k <= n; k++) { const q = k / n; pts.push([w * q, th * q]); pts.push([w * q * 0.8 - w * 0.02, th * q]); }
      c.beginPath(); c.moveTo(x, y - th);
      pts.forEach((p) => c.lineTo(x + p[0], y - th + p[1]));
      for (let j = pts.length - 1; j >= 0; j--) c.lineTo(x - pts[j][0], y - th + pts[j][1]);
      c.closePath(); c.fill();
    }
  }
  function hillY(x, seed, amp) { return Math.sin(x * 0.004 + seed) * amp + Math.sin(x * 0.011 + seed * 2) * amp * 0.4; }

  const LAYER_CFG = [
    { id: 'far', depth: 0.12, ground: 0.68, count: 20, h: [0.16, 0.3], pine: 0.55, tw: 0.006, alpha: 0.5, fog: 0.62, hill: 12, sway: 0.0014, leaf: 1.0 },
    { id: 'mid', depth: 0.3, ground: 0.76, count: 14, h: [0.3, 0.5], pine: 0.35, tw: 0.011, alpha: 0.78, fog: 0.4, hill: 14, sway: 0.002, leaf: 1.05, clear: 0.14 },
    { id: 'near', depth: 0.58, ground: 0.88, count: 8, h: [0.5, 0.82], pine: 0, tw: 0.02, alpha: 0.96, fog: 0.16, hill: 10, sway: 0.0028, leaf: 1.1, clear: 0.26 },
    { id: 'frame', depth: 1.0, ground: 1.04, count: 0, h: [1, 1], pine: 0, tw: 0.075, alpha: 1, fog: 0, hill: 0, sway: 0.0034, leaf: 1.5 }
  ];

  function buildLayer(cfg, idx) {
    const LW = W * 1.6, rnd = mulberry32(1000 + idx * 77);
    const cvs = document.createElement('canvas');
    cvs.width = Math.ceil(LW * dpr * qual); cvs.height = Math.ceil(H * dpr * qual);
    const c = cvs.getContext('2d');
    c.scale(dpr * qual, dpr * qual);
    c.fillStyle = '#000';
    const gy = H * cfg.ground, seed = idx * 3.1;
    const left = (LW - W) / 2;
    if (cfg.id === 'frame') {
      // sol & sağ dev gövdeler + üstten sarkan yapraklar çerçeve oluşturur
      drawBroad(c, left + W * 0.0, gy, H * 1.3, mulberry32(7), W * 0.085, 1.55);
      drawBroad(c, left + W * 1.02, gy, H * 1.15, mulberry32(19), W * 0.07, 1.45);
      const r2 = mulberry32(55);
      leafCloud(c, left + W * 0.12, -H * 0.02, W * 0.34, H * 0.14, 11, r2, 1.9);
      leafCloud(c, left + W * 0.88, -H * 0.03, W * 0.32, H * 0.15, 11, r2, 1.9);
      leafCloud(c, left + W * 0.5, -H * 0.1, W * 0.28, H * 0.1, 10, r2, 1.9);
      // ön plan otları
      const bl = Math.floor(LW / 2.6);
      for (let i = 0; i < bl; i++) {
        const x = rnd() * LW, h = H * (0.025 + Math.pow(rnd(), 2) * 0.1), lean = (rnd() - 0.5) * h * 0.6, by = H + 2;
        c.beginPath(); c.moveTo(x - 2.2, by); c.quadraticCurveTo(x + lean * 0.25, by - h * 0.6, x + lean, by - h);
        c.quadraticCurveTo(x + lean * 0.25 + 1.4, by - h * 0.6, x + 2.2, by); c.fill();
      }
      c.fillRect(0, H * 0.985, LW, H * 0.03);
    } else {
      const xs = [];
      for (let i = 0; i < cfg.count; i++) xs.push((i + 0.5 + (rnd() - 0.5) * 0.9) * (LW / cfg.count));
      xs.forEach((x) => {
        // güneşin göründüğü orta bölge açık kalsın
        if (cfg.clear && Math.abs(x - LW / 2) < W * cfg.clear) { rnd(); rnd(); rnd(); return; }
        const h = H * (cfg.h[0] + rnd() * (cfg.h[1] - cfg.h[0]));
        const base = gy + hillY(x, seed, cfg.hill);
        const tw = Math.max(1.5, W * cfg.tw * (0.8 + rnd() * 0.5));
        if (rnd() < cfg.pine) drawPine(c, x, base, h, rnd, tw * 1.3);
        else drawBroad(c, x, base, h, rnd, tw, cfg.leaf);
      });
      c.beginPath(); c.moveTo(0, H + 4); c.lineTo(0, gy);
      for (let x = 0; x <= LW; x += 20) c.lineTo(x, gy + hillY(x, seed, cfg.hill));
      c.lineTo(LW, H + 4); c.closePath(); c.fill();
    }
    return { cfg, cv: cvs, LW, gy, sway: cfg.sway, swayF: 0.35 + idx * 0.11, swayP: idx * 1.9 };
  }

  async function buildLayers() {
    if (!W) return;
    const key = W + 'x' + H + '@' + dpr + '/' + qual;
    if (layers && buildKey === key) return;
    if (building) return;
    building = true;
    const out = [];
    for (let i = 0; i < LAYER_CFG.length; i++) {
      out.push(buildLayer(LAYER_CFG[i], i));
      await new Promise((r) => setTimeout(r, 0));
    }
    layers = out; buildKey = key; building = false;
  }
  function buildLayersSync() {
    if (layers) return;
    layers = LAYER_CFG.map((c, i) => buildLayer(c, i));
    buildKey = W + 'x' + H + '@' + dpr + '/' + qual;
  }

  /* ---------------- Işık sprite'ları ---------------- */
  const sprites = {};
  function glowSprite(rgb) {
    const key = rgb.join(',');
    if (sprites[key]) return sprites[key];
    const s = document.createElement('canvas'); s.width = s.height = 64;
    const g = s.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(rgb, 1)); gr.addColorStop(0.25, rgba(rgb, 0.55)); gr.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (sprites[key] = s);
  }

  /* ---------------- Parçacıklar ---------------- */
  const parts = [];
  let pKind = 'pollen', spawnAcc = 0;
  const RATE = { pollen: 12, fireflies: 5, leaves: 3.2, snow: 30, petals: 6, hearts: 3, none: 0 };
  const MAXP = { pollen: 110, fireflies: 40, leaves: 40, snow: 220, petals: 60, hearts: 28, none: 0 };
  const LEAF_COL = [[196, 86, 28], [226, 140, 40], [160, 60, 24], [236, 176, 64]];

  function spawn(k) {
    const r = Math.random;
    switch (k) {
      case 'pollen': return { k, x: r() * W, y: H * (0.3 + r() * 0.7), vx: (r() - 0.5) * 8, vy: -(4 + r() * 10), s: 0.8 + r() * 2, ph: r() * TAU, age: 0, ttl: 7 + r() * 8 };
      case 'fireflies': return { k, x: r() * W, y: H * (0.35 + r() * 0.6), vx: 0, vy: 0, s: 1.4 + r() * 1.6, ph: r() * TAU, age: 0, ttl: 10 + r() * 10, a: r() * TAU };
      case 'leaves': return { k, x: r() * W * 1.2 - W * 0.1, y: -20, vx: 10 + r() * 20, vy: 28 + r() * 30, s: 5 + r() * 5, ph: r() * TAU, age: 0, ttl: 99, rot: r() * TAU, vr: (r() - 0.5) * 3, col: LEAF_COL[(r() * 4) | 0] };
      case 'snow': return { k, x: r() * W * 1.1, y: -10, vx: (r() - 0.5) * 14, vy: 24 + r() * 40, s: 1.2 + r() * 2.6, ph: r() * TAU, age: 0, ttl: 99 };
      case 'petals': return { k, x: r() * W * 1.2 - W * 0.1, y: -20, vx: 8 + r() * 18, vy: 20 + r() * 28, s: 5 + r() * 4, ph: r() * TAU, age: 0, ttl: 99, rot: r() * TAU, vr: (r() - 0.5) * 3 };
      case 'hearts': return { k, x: r() * W, y: H + 20, vx: 0, vy: -(30 + r() * 40), s: 7 + r() * 10, ph: r() * TAU, age: 0, ttl: 99 };
    }
    return null;
  }

  function updateParticles(dt) {
    if (mode !== 'scene') return;
    const areaK = clamp((W * H) / (390 * 844), 0.7, 1.8);
    if (RATE[pKind]) {
      spawnAcc += dt * RATE[pKind] * areaK;
      const cap = MAXP[pKind] * areaK;
      let alive = 0; for (const p of parts) if (p.k === pKind) alive++;
      while (spawnAcc >= 1) { spawnAcc -= 1; if (alive < cap) { const p = spawn(pKind); if (p) { parts.push(p); alive++; } } }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.age += dt;
      switch (p.k) {
        case 'pollen': p.x += (p.vx + Math.sin(p.age + p.ph) * 6) * dt; p.y += p.vy * dt; break;
        case 'fireflies': p.a += (Math.random() - 0.5) * dt * 4; p.x += Math.cos(p.a) * 16 * dt; p.y += Math.sin(p.a) * 11 * dt; break;
        case 'leaves': case 'petals': p.x += (p.vx + Math.sin(p.age * 1.4 + p.ph) * 22) * dt; p.y += p.vy * dt; p.rot += p.vr * dt; break;
        case 'snow': p.x += (p.vx + Math.sin(p.age + p.ph) * 10) * dt; p.y += p.vy * dt; break;
        case 'hearts': p.x += Math.sin(p.age * 1.3 + p.ph) * 22 * dt; p.y += p.vy * dt; break;
      }
      if (p.age > p.ttl || p.y > H + 30 || p.y < -40 || p.x > W + 60 || p.x < -60) parts.splice(i, 1);
    }
  }

  function drawParticles() {
    if (!parts.length) return;
    const cool = pal.moon > 0.5, warm = glowSprite(cool ? [190, 210, 255] : [255, 236, 170]), green = glowSprite([214, 255, 140]);
    for (const p of parts) {
      switch (p.k) {
        case 'pollen': {
          const a = Math.sin((p.age / p.ttl) * Math.PI) * (0.55 + 0.45 * Math.sin(p.age * 3 + p.ph));
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(a, 0, 1);
          const s = p.s * 5; ctx.drawImage(warm, p.x - s, p.y - s, s * 2, s * 2); break;
        }
        case 'fireflies': {
          const a = Math.sin((p.age / p.ttl) * Math.PI) * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(p.age * 2.2 + p.ph)));
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(a, 0, 1);
          const s = p.s * 7; ctx.drawImage(green, p.x - s, p.y - s, s * 2, s * 2); break;
        }
        case 'leaves': {
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.95;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, 0.55 + 0.45 * Math.cos(p.age * 2 + p.ph));
          ctx.fillStyle = rgba(p.col, 1); ctx.beginPath(); ctx.moveTo(0, -p.s);
          ctx.quadraticCurveTo(p.s * 0.9, 0, 0, p.s); ctx.quadraticCurveTo(-p.s * 0.9, 0, 0, -p.s); ctx.fill(); ctx.restore(); break;
        }
        case 'petals': {
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.88;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, 0.6 + 0.4 * Math.cos(p.age * 2.2 + p.ph));
          ctx.fillStyle = 'rgb(255,186,208)'; ctx.beginPath(); ctx.moveTo(0, -p.s);
          ctx.bezierCurveTo(p.s * 1.1, -p.s * 0.4, p.s * 0.8, p.s * 0.9, 0, p.s); ctx.bezierCurveTo(-p.s * 0.8, p.s * 0.9, -p.s * 1.1, -p.s * 0.4, 0, -p.s); ctx.fill();
          ctx.restore(); break;
        }
        case 'snow': {
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill(); break;
        }
        case 'hearts': {
          const a = clamp(p.age * 1.5, 0, 1) * 0.55 * clamp((p.y + 20) / (H * 0.3), 0, 1);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
          ctx.save(); ctx.translate(p.x, p.y); const s = p.s; ctx.fillStyle = 'rgb(255,112,150)'; ctx.beginPath();
          ctx.moveTo(0, s * 0.9); ctx.bezierCurveTo(-s * 1.3, s * 0.1, -s * 0.7, -s * 0.9, 0, -s * 0.3);
          ctx.bezierCurveTo(s * 0.7, -s * 0.9, s * 1.3, s * 0.1, 0, s * 0.9); ctx.fill(); ctx.restore(); break;
        }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------- UZAY (giriş) ---------------- */
  const space = { stars: null, shoot: null, nextShoot: 3 };
  function initSpace() {
    const r = mulberry32(42); space.stars = [];
    for (let i = 0; i < 230; i++) space.stars.push({ x: r(), y: r(), r: 0.4 + r() * 1.4, tw: 0.8 + r() * 2.4, ph: r() * TAU, h: r() });
  }
  function drawSpace(dt) {
    if (!space.stars) initSpace();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#04051a'); g.addColorStop(0.55, '#0c0f34'); g.addColorStop(1, '#2a1650');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const blobs = [[0.2, 0.25, 0.55, [90, 60, 200], 0.2], [0.85, 0.5, 0.5, [30, 140, 190], 0.14], [0.45, 0.85, 0.6, [200, 70, 150], 0.14]];
    blobs.forEach((b, i) => {
      const x = W * (b[0] + Math.sin(t * 0.07 + i * 2) * 0.05), y = H * (b[1] + Math.cos(t * 0.06 + i) * 0.04), R = Math.max(W, H) * b[2];
      const gr = ctx.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, rgba(b[3], b[4])); gr.addColorStop(1, rgba(b[3], 0));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    });
    const ang = t * 0.012, ca = Math.cos(ang), sa = Math.sin(ang), cx = W / 2, cy = H * 0.45;
    for (const s of space.stars) {
      const dx = (s.x - 0.5) * W * 1.5, dy = (s.y - 0.5) * H * 1.5;
      const x = cx + dx * ca - dy * sa, y = cy + dx * sa + dy * ca;
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      const a = 0.45 + 0.55 * Math.sin(t * s.tw + s.ph);
      ctx.fillStyle = s.h > 0.85 ? 'rgba(255,214,160,' + (a * 0.9) + ')' : 'rgba(215,226,255,' + (a * 0.9) + ')';
      ctx.beginPath(); ctx.arc(x, y, s.r, 0, TAU); ctx.fill();
    }
    space.nextShoot -= dt;
    if (space.nextShoot <= 0 && !space.shoot) {
      space.shoot = { x: W * (0.2 + Math.random() * 0.7), y: H * (Math.random() * 0.3), vx: -W * 0.7, vy: H * 0.35, a: 1 };
      space.nextShoot = 4 + Math.random() * 6;
    }
    if (space.shoot) {
      const s = space.shoot; s.x += s.vx * dt; s.y += s.vy * dt; s.a -= dt * 1.1;
      const gr = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.18, s.y - s.vy * 0.18);
      gr.addColorStop(0, 'rgba(255,255,255,' + Math.max(0, s.a) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = gr; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.18, s.y - s.vy * 0.18); ctx.stroke();
      if (s.a <= 0) space.shoot = null;
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------- ZAMAN TÜNELİ ---------------- */
  const warp = { speed: 0.25, stars: null, ringT: 0, hand: 0, glow: 1 };
  function initWarp() {
    const r = mulberry32(9); warp.stars = [];
    const hues = [42, 190, 320, 48, 210];
    for (let i = 0; i < 380; i++) warp.stars.push({ a: r() * TAU, d: 0.15 + r() * 0.95, z: r(), h: hues[(r() * hues.length) | 0] });
  }
  function drawWarp(dt) {
    if (!warp.stars) initWarp();
    const cx = W / 2, cy = H * 0.5, M = Math.min(W, H), R = Math.hypot(W, H) / 2, sp = warp.speed;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = needsClear ? 'rgb(4,3,16)' : 'rgba(4,3,16,0.3)';
    ctx.fillRect(0, 0, W, H); needsClear = false;
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, M * (0.5 + 0.2 * sp));
    gr.addColorStop(0, 'rgba(255,220,150,' + (0.5 * warp.glow) + ')'); gr.addColorStop(0.4, 'rgba(150,90,255,' + (0.16 * warp.glow) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // saat halkaları
    warp.ringT += dt * (0.16 + sp * 0.85);
    for (let i = 0; i < 9; i++) {
      const p = (warp.ringT + i / 9) % 1, r = Math.pow(p, 2.1) * R * 1.15, a = Math.sin(Math.PI * p) * 0.55;
      ctx.strokeStyle = 'rgba(' + (255 - p * 80) + ',' + (205 + p * 30) + ',' + (140 + p * 110) + ',' + a + ')';
      ctx.lineWidth = 1.2 + p * 5; ctx.setLineDash([2 + p * 6, 10 + p * 30]); ctx.lineDashOffset = -(t * 60 * (i % 2 ? 1 : -1));
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, r), 0, TAU); ctx.stroke();
    }
    ctx.setLineDash([]);
    // yıldız çizgileri
    const dz = dt * (0.15 + sp * 1.8);
    for (const s of warp.stars) {
      s.z -= dz;
      let r1 = (s.d * R * 0.06) / Math.max(0.001, s.z);
      if (s.z <= 0.02 || r1 > R * 1.3) { s.z = 1; s.a = Math.random() * TAU; s.d = 0.15 + Math.random() * 0.95; continue; }
      const r0 = (s.d * R * 0.06) / (s.z + dz * (2 + sp * 4)), ca = Math.cos(s.a), sa = Math.sin(s.a);
      ctx.strokeStyle = 'hsla(' + s.h + ',85%,72%,' + Math.min(1, (1 - s.z) * 1.5) + ')';
      ctx.lineWidth = 0.5 + (1 - s.z) * 2.6;
      ctx.beginPath(); ctx.moveTo(cx + ca * r0, cy + sa * r0); ctx.lineTo(cx + ca * r1, cy + sa * r1); ctx.stroke();
    }
    // dev saat
    warp.hand -= dt * (1.2 + sp * 14);
    const cr = M * 0.34;
    ctx.strokeStyle = 'rgba(255,232,180,0.2)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, l = i % 3 === 0 ? 0.12 : 0.06;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * cr * (1 - l), cy + Math.sin(a) * cr * (1 - l)); ctx.lineTo(cx + Math.cos(a) * cr, cy + Math.sin(a) * cr); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,240,200,0.4)'; ctx.lineCap = 'round';
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(warp.hand / 12 - Math.PI / 2) * cr * 0.5, cy + Math.sin(warp.hand / 12 - Math.PI / 2) * cr * 0.5); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(warp.hand - Math.PI / 2) * cr * 0.78, cy + Math.sin(warp.hand - Math.PI / 2) * cr * 0.78); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------- ORMAN ---------------- */
  function drawStars(k) {
    if (!space.stars) initSpace();
    for (const s of space.stars) {
      if (s.y > 0.62) continue;
      const a = k * (0.35 + 0.65 * Math.sin(t * s.tw + s.ph) * 0.5 + 0.3) * (1 - s.y * 0.9);
      ctx.fillStyle = 'rgba(235,240,255,' + clamp(a, 0, 1) + ')';
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r * 0.9, 0, TAU); ctx.fill();
    }
  }

  function drawRays(sx, sy) {
    const P = pal, n = 15, len = Math.hypot(W, H) * 1.35;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1), ang = Math.PI / 2 + (f - 0.5) * 2.4 + Math.sin(t * 0.15 + i * 1.7) * 0.035;
      const wd = 0.012 + ((i * 37) % 11) * 0.0027;
      const pulse = 0.45 + 0.55 * Math.pow(Math.sin(t * 0.4 + i * 2.1), 2);
      const a = P.rayK * cam.rayBoost * pulse * (1 - Math.abs(f - 0.5) * 0.9);
      const ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
      const g = ctx.createLinearGradient(sx, sy, ex, ey);
      g.addColorStop(0, rgba(P.ray, a * 0.9)); g.addColorStop(0.5, rgba(P.ray, a * 0.34)); g.addColorStop(1, rgba(P.ray, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(ang - wd) * len, sy + Math.sin(ang - wd) * len);
      ctx.lineTo(sx + Math.cos(ang + wd) * len, sy + Math.sin(ang + wd) * len); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawLayer(L, Z, hy) {
    const sc = 1 + (Z - 1) * (0.35 + L.cfg.depth * 0.9);
    const px = cam.parX * L.cfg.depth * 48, py = cam.parY * L.cfg.depth * 26;
    const sw = Math.sin(t * L.swayF + L.swayP) * L.sway;
    ctx.save(); ctx.globalAlpha = L.cfg.alpha;
    ctx.translate(W / 2 + px, hy + py); ctx.scale(sc, sc); ctx.rotate(sw); ctx.translate(-L.LW / 2, -hy);
    ctx.drawImage(L.cv, 0, 0, L.LW, H);
    ctx.restore();
    if (L.cfg.fog > 0) {
      const gyS = hy + py + (L.gy - hy) * sc, y0 = gyS - H * 0.55 * sc, y1 = gyS + H * 0.04;
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, rgba(pal.fog, 0)); g.addColorStop(1, rgba(pal.fog, L.cfg.fog));
      ctx.fillStyle = g; ctx.fillRect(0, y0, W, y1 - y0);
    }
  }

  const bokeh = (function () { const r = mulberry32(5), a = []; for (let i = 0; i < 9; i++) a.push({ x: r(), y: 0.15 + r() * 0.7, s: 18 + r() * 52, v: 0.002 + r() * 0.006, a: 0.04 + r() * 0.08 }); return a; })();

  function drawScene(dt) {
    if (!layers) buildLayersSync();
    const P = pal, Z = cam.zoom + cam.kick, hy = H * 0.6, M = Math.min(W, H), R = Math.max(W, H);
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.82);
    sky.addColorStop(0, rgba(P.skyTop)); sky.addColorStop(0.5, rgba(P.skyMid)); sky.addColorStop(1, rgba(P.skyBot));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (P.stars > 0.02) drawStars(P.stars);

    const sx = W * P.sunX + cam.parX * 10, sy = H * P.sunY + cam.parY * 6;
    const glowK = 1 + (cam.rayBoost - 1) * 0.6, pulse = 1 + Math.sin(t * 0.9) * 0.025;
    ctx.globalCompositeOperation = 'lighter';
    let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 0.75 * glowK);
    g.addColorStop(0, rgba(P.glow, 0.55)); g.addColorStop(0.25, rgba(P.glow, 0.22)); g.addColorStop(1, rgba(P.glow, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 0.22 * glowK * pulse);
    g.addColorStop(0, rgba(P.sun, 0.95)); g.addColorStop(1, rgba(P.glow, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const dr = M * P.sunR * pulse;
    g = ctx.createRadialGradient(sx, sy, 0, sx, sy, dr * 1.25);
    g.addColorStop(0, rgba(P.sun, 1)); g.addColorStop(0.8, rgba(P.sun, 1)); g.addColorStop(1, rgba(P.sun, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, dr * 1.25, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (P.moon > 0.4) {
      ctx.fillStyle = 'rgba(120,130,170,' + (P.moon * 0.18) + ')';
      [[-0.3, -0.1, 0.22], [0.25, 0.2, 0.16], [0.1, -0.35, 0.12]].forEach((c) => { ctx.beginPath(); ctx.arc(sx + c[0] * dr, sy + c[1] * dr, c[2] * dr, 0, TAU); ctx.fill(); });
    }
    // arka katmanlar → ışık huzmeleri → ön katmanlar
    for (let i = 0; i < layers.length; i++) {
      if (i === 2) drawRays(sx, sy);
      if (i === 3) {
        // zemin ışığı (güneşin yolda parlaması)
        const L = layers[2], sc = 1 + (Z - 1) * (0.35 + L.cfg.depth * 0.9), gyS = hy + (L.gy - hy) * sc;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(sx, gyS + H * 0.02); ctx.scale(1, 0.3);
        const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.7);
        gg.addColorStop(0, rgba(P.glow, clamp(0.4 * cam.rayBoost, 0, 0.8))); gg.addColorStop(1, rgba(P.glow, 0));
        ctx.fillStyle = gg; ctx.fillRect(-W, -W, W * 2, W * 2); ctx.restore();
      }
      drawLayer(layers[i], Z, hy);
    }
    // parıltı taşması (arkadan aydınlatma)
    ctx.globalCompositeOperation = 'lighter';
    g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 0.4 * glowK);
    g.addColorStop(0, rgba(P.glow, 0.2 * Math.min(cam.rayBoost, 2))); g.addColorStop(1, rgba(P.glow, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // bokeh
    for (const b of bokeh) {
      const x = ((b.x + t * b.v) % 1.2 - 0.1) * W, y = b.y * H + Math.sin(t * 0.3 + b.s) * 8;
      const bg = ctx.createRadialGradient(x, y, 0, x, y, b.s);
      bg.addColorStop(0, rgba(P.ray, b.a * P.rayK * 2)); bg.addColorStop(1, rgba(P.ray, 0));
      ctx.fillStyle = bg; ctx.fillRect(x - b.s, y - b.s, b.s * 2, b.s * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba(P.grade.slice(0, 3), P.grade[3]); ctx.fillRect(0, 0, W, H);
    updateParticles(dt); drawParticles();
    // vinyet
    const vg = ctx.createRadialGradient(W / 2, H * 0.5, M * 0.35, W / 2, H * 0.5, R * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // film greni
    if (noisePat) {
      ctx.save(); ctx.globalAlpha = 0.05; ctx.translate(-(Math.random() * 128) | 0, -(Math.random() * 128) | 0);
      ctx.fillStyle = noisePat; ctx.fillRect(0, 0, W + 128, H + 128); ctx.restore();
    }
  }

  /* ---------------- Ana döngü ---------------- */
  function step(ts) {
    if (!running) return;
    requestAnimationFrame(step);
    if (!last) last = ts;
    let dt = (ts - last) / 1000; last = ts;
    if (dt > 0.1) dt = 0.1;
    t += dt;
    // tween'ler
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i]; w.t += dt;
      const k = clamp(w.t / w.dur, 0, 1); w.o[w.k] = lerp(w.from, w.to, w.e(k));
      if (k >= 1) { tweens.splice(i, 1); w.res(); }
    }
    cam.kick *= Math.pow(0.04, dt);
    cam.parX += (cam.tpX - cam.parX) * Math.min(1, dt * 3); cam.parY += (cam.tpY - cam.parY) * Math.min(1, dt * 3);
    // palet geçişi
    const k = Math.min(1, dt * 1.6);
    for (const key in tgt) {
      const a = pal[key], b = tgt[key];
      if (Array.isArray(b)) for (let i = 0; i < b.length; i++) a[i] = lerp(a[i], b[i], k);
      else if (typeof b === 'number') pal[key] = lerp(a, b, k);
    }
    if (mode === 'scene') drawScene(dt); else if (mode === 'warp') drawWarp(dt); else drawSpace(dt);
    // başarım izleme (yavaş cihazlarda kaliteyi düşür)
    perf.acc += dt; perf.n++;
    if (perf.n >= 90) {
      const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
      if (avg > 0.034 && qual > 0.6 && mode === 'scene') { qual = Math.max(0.6, qual - 0.2); layers = null; buildLayersSync(); }
    }
  }

  function resize() {
    W = global.innerWidth; H = global.innerHeight;
    dpr = Math.min(global.devicePixelRatio || 1, W < 700 ? 2 : 1.5);
    cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    needsClear = true; layers = null;
    clearTimeout(resize.t);
    resize.t = setTimeout(() => { buildLayers(); }, 250);
  }

  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d', { alpha: false });
    noiseCv = document.createElement('canvas'); noiseCv.width = noiseCv.height = 128;
    const nc = noiseCv.getContext('2d'), id = nc.createImageData(128, 128);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    nc.putImageData(id, 0, 0); noisePat = ctx.createPattern(noiseCv, 'repeat');
    resize(); global.addEventListener('resize', resize);
    running = true; requestAnimationFrame(step);
    setTimeout(buildLayers, 600);
    global.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      cam.tpX = (e.clientX / W - 0.5) * 2; cam.tpY = (e.clientY / H - 0.5) * 2;
    });
    global.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null) return;
      cam.tpX = clamp(e.gamma / 25, -1, 1); cam.tpY = clamp(((e.beta || 0) - 45) / 25, -1, 1);
    });
  }

  global.World = {
    init,
    PAL_NAMES,
    paletteNames: () => Object.keys(PAL),
    accentOf: (n) => (PAL[n] || PAL.golden).accent,
    paletteColors: (n) => { const p = PAL[n] || PAL.golden; return [rgba(p.skyTop), rgba(p.skyMid), rgba(p.skyBot)]; },
    setMode(m) {
      if (m === mode) return;
      mode = m; needsClear = true;
      if (m === 'scene') buildLayersSync();
    },
    get mode() { return mode; },
    setPalette(name, instant) {
      tgt = PAL[name] || PAL.golden;
      if (instant) pal = clonePal(tgt);
    },
    setParticles(kind) { pKind = RATE[kind] != null ? kind : 'none'; },
    dolly(from, to, dur, e) { cam.zoom = from; return tween(cam, 'zoom', to, dur, e || 'out'); },
    rayBoost(from, to, dur, e) { cam.rayBoost = from; return tween(cam, 'rayBoost', to, dur, e || 'out'); },
    pulse(v) { cam.kick += v == null ? 0.05 : v; },
    warpSpeed(to, dur) { return tween(warp, 'speed', to, dur || 1, 'inOut'); },
    warpGlow(to, dur) { return tween(warp, 'glow', to, dur || 1, 'inOut'); },
    resetWarp() { warp.speed = 0.25; warp.glow = 1; needsClear = true; },
    setParallax(x, y) { cam.tpX = x; cam.tpY = y; },
    ease
  };

  /* ---------------- Konfeti / kalp efekti (üst canvas) ---------------- */
  const FX = (function () {
    let c = null, g = null, w = 0, h = 0, d = 1, list = [], on = false, lt = 0;
    const COLORS = ['#ffd36e', '#ff9fc0', '#ff6f91', '#a5b8ff', '#ffffff', '#ffb36b'];
    function size() { w = innerWidth; h = innerHeight; d = Math.min(devicePixelRatio || 1, 2); c.width = w * d; c.height = h * d; c.style.width = w + 'px'; c.style.height = h + 'px'; g.setTransform(d, 0, 0, d, 0, 0); }
    function init(canvas) { c = canvas; g = c.getContext('2d'); size(); addEventListener('resize', size); }
    function burst(x, y, n) {
      if (!c) return;
      n = n || 90;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = 140 + Math.random() * 420;
        list.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 220, r: 3 + Math.random() * 5, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12, col: COLORS[(Math.random() * COLORS.length) | 0], heart: Math.random() < 0.35, life: 0, ttl: 2.4 + Math.random() * 1.6 });
      }
      if (!on) { on = true; lt = 0; requestAnimationFrame(loop); }
    }
    function loop(ts) {
      if (!lt) lt = ts; const dt = Math.min(0.05, (ts - lt) / 1000); lt = ts;
      g.clearRect(0, 0, w, h);
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]; p.life += dt; p.vy += 620 * dt; p.vx *= Math.pow(0.35, dt); p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        if (p.life > p.ttl || p.y > h + 30) { list.splice(i, 1); continue; }
        g.save(); g.globalAlpha = clamp(1 - (p.life / p.ttl - 0.7) / 0.3, 0, 1); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.col;
        if (p.heart) { const s = p.r * 1.2; g.beginPath(); g.moveTo(0, s * 0.9); g.bezierCurveTo(-s * 1.3, s * 0.1, -s * 0.7, -s * 0.9, 0, -s * 0.3); g.bezierCurveTo(s * 0.7, -s * 0.9, s * 1.3, s * 0.1, 0, s * 0.9); g.fill(); }
        else g.fillRect(-p.r / 2, -p.r * 0.3, p.r, p.r * 0.6);
        g.restore();
      }
      if (list.length) requestAnimationFrame(loop); else { on = false; g.clearRect(0, 0, w, h); }
    }
    return { init, burst };
  })();
  global.FX = FX;
})(window);
