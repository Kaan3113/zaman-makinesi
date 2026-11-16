/* TimeMachine — SVG zaman makinesi (kapı, saat, dişliler, enerji halkası) + kapıdan içeri kamera hareketi */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';

  function gearPath(cx, cy, ro, ri, teeth) {
    let d = '';
    const step = (Math.PI * 2) / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      [[a - step * 0.28, ri], [a - step * 0.17, ro], [a + step * 0.17, ro], [a + step * 0.28, ri]].forEach((p, j) => {
        d += (i === 0 && j === 0 ? 'M' : 'L') + (cx + Math.cos(p[0]) * p[1]).toFixed(2) + ' ' + (cy + Math.sin(p[0]) * p[1]).toFixed(2) + ' ';
      });
    }
    return d + 'Z';
  }

  function swirlArms(cx, cy) {
    let out = '';
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2;
      let d = '';
      for (let r = 3; r <= 78; r += 3) {
        const a = a0 + r * 0.075;
        d += (r === 3 ? 'M' : 'L') + (cx + Math.cos(a) * r).toFixed(1) + ' ' + (cy + Math.sin(a) * r).toFixed(1) + ' ';
      }
      out += '<path d="' + d + '" fill="none" stroke="#fff" stroke-opacity="' + (0.35 + (k % 2) * 0.25) + '" stroke-width="' + (2.2 + (k % 3)) + '" stroke-linecap="round"/>';
    }
    return out;
  }

  function build() {
    let ticks = '';
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 * Math.PI) / 180, big = i % 3 === 0, r1 = big ? 21 : 25, r2 = 29;
      ticks += '<line x1="' + (160 + Math.sin(a) * r1).toFixed(2) + '" y1="' + (164 - Math.cos(a) * r1).toFixed(2) + '" x2="' + (160 + Math.sin(a) * r2).toFixed(2) + '" y2="' + (164 - Math.cos(a) * r2).toFixed(2) + '" stroke="#ffe9a8" stroke-width="' + (big ? 2.2 : 1.2) + '" stroke-linecap="round"/>';
    }
    let rivets = '';
    for (let i = 0; i < 8; i++) {
      const y = 232 + i * 22;
      rivets += '<circle cx="100" cy="' + y + '" r="1.8" fill="#ffe9a8" opacity=".7"/><circle cx="220" cy="' + y + '" r="1.8" fill="#ffe9a8" opacity=".7"/>';
    }
    let motes = '';
    for (let i = 0; i < 18; i++) {
      const x = 40 + Math.random() * 240, y = 330 + Math.random() * 90, r = 0.8 + Math.random() * 1.8;
      motes += '<circle class="mote" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + (i % 3 ? '#ffe9a8' : '#9ff4ff') + '" style="animation-delay:' + (-Math.random() * 6).toFixed(2) + 's;animation-duration:' + (4 + Math.random() * 4).toFixed(2) + 's"/>';
    }
    return '' +
'<svg class="tm-svg" viewBox="0 0 320 440" xmlns="' + NS + '" aria-hidden="true">' +
'<defs>' +
'<linearGradient id="gBody" gradientUnits="userSpaceOnUse" x1="92" y1="0" x2="228" y2="0"><stop offset="0" stop-color="#121839"/><stop offset=".22" stop-color="#25326e"/><stop offset=".5" stop-color="#3a4b9c"/><stop offset=".78" stop-color="#25326e"/><stop offset="1" stop-color="#121839"/></linearGradient>' +
'<linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".5" stop-color="#e0ae4a"/><stop offset="1" stop-color="#8a5a1a"/></linearGradient>' +
'<linearGradient id="gGoldH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a5a1a"/><stop offset=".5" stop-color="#ffe9a8"/><stop offset="1" stop-color="#8a5a1a"/></linearGradient>' +
'<radialGradient id="gInterior" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#ffffff"/><stop offset=".22" stop-color="#fff2c2"/><stop offset=".5" stop-color="#ffbf5e"/><stop offset=".78" stop-color="#e0643e"/><stop offset="1" stop-color="#4f2386"/></radialGradient>' +
'<radialGradient id="gPlat" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7ae8ff" stop-opacity=".55"/><stop offset=".6" stop-color="#6d5cff" stop-opacity=".2"/><stop offset="1" stop-color="#6d5cff" stop-opacity="0"/></radialGradient>' +
'<radialGradient id="gBulb" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#a6f6ff"/><stop offset="1" stop-color="#3ac8ff" stop-opacity="0"/></radialGradient>' +
'<linearGradient id="gBeam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#b6f7ff" stop-opacity=".5"/><stop offset="1" stop-color="#b6f7ff" stop-opacity="0"/></linearGradient>' +
'<linearGradient id="gSpill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c2" stop-opacity=".95"/><stop offset="1" stop-color="#ffbf5e" stop-opacity="0"/></linearGradient>' +
'<linearGradient id="gRing" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7ae8ff"/><stop offset=".5" stop-color="#ffe9a8"/><stop offset="1" stop-color="#ff9fc0"/></linearGradient>' +
'<linearGradient id="gLeaf" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b2459"/><stop offset=".5" stop-color="#34459a"/><stop offset="1" stop-color="#1b2459"/></linearGradient>' +
'<clipPath id="doorClip"><path d="M120 392 L120 254 A40 40 0 0 1 200 254 L200 392 Z"/></clipPath>' +
'</defs>' +
/* platform */
'<ellipse class="plat-glow" cx="160" cy="414" rx="156" ry="30" fill="url(#gPlat)"/>' +
'<ellipse cx="160" cy="412" rx="140" ry="20" fill="#0a0d2a" stroke="url(#gGoldH)" stroke-width="2"/>' +
'<ellipse cx="160" cy="410" rx="118" ry="14" fill="#161d4d" stroke="#7ae8ff" stroke-opacity=".5" stroke-width="1"/>' +
/* back ring */
'<path class="ring ring-glow" d="M36 296 A124 22 0 0 1 284 296" fill="none" stroke="url(#gRing)" stroke-opacity=".25" stroke-width="7"/>' +
'<path class="ring ring-flow" d="M36 296 A124 22 0 0 1 284 296" fill="none" stroke="url(#gRing)" stroke-width="2" stroke-dasharray="7 9"/>' +
/* beacon */
'<path class="beam" d="M160 92 L112 6 L208 6 Z" fill="url(#gBeam)"/>' +
'<path d="M146 114 L151 100 L169 100 L174 114 Z" fill="url(#gGold)"/>' +
'<circle class="bulb-glow" cx="160" cy="92" r="20" fill="url(#gBulb)"/>' +
'<circle cx="160" cy="92" r="7" fill="#e8fdff"/>' +
/* gears */
'<g class="gear gear-l"><path d="' + gearPath(84, 280, 24, 18, 12) + '" fill="#1a2250" stroke="url(#gGoldH)" stroke-width="2"/><circle cx="84" cy="280" r="7" fill="#0a0d2a" stroke="#ffe9a8" stroke-width="1.5"/></g>' +
'<g class="gear gear-r"><path d="' + gearPath(236, 300, 20, 15, 10) + '" fill="#1a2250" stroke="url(#gGoldH)" stroke-width="2"/><circle cx="236" cy="300" r="6" fill="#0a0d2a" stroke="#ffe9a8" stroke-width="1.5"/></g>' +
/* body */
'<path d="M82 404 L82 190 A78 78 0 0 1 238 190 L238 404 Z" fill="url(#gGold)"/>' +
'<path d="M92 400 L92 190 A68 68 0 0 1 228 190 L228 400 Z" fill="url(#gBody)"/>' +
'<path d="M92 190 A68 68 0 0 1 228 190" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>' +
'<line x1="160" y1="124" x2="160" y2="132" stroke="#ffe9a8" stroke-opacity=".5"/>' +
rivets +
/* clock */
'<circle cx="160" cy="164" r="35" fill="url(#gGold)"/>' +
'<circle cx="160" cy="164" r="31" fill="#090c2a"/>' +
'<circle cx="160" cy="164" r="31" fill="none" stroke="#7ae8ff" stroke-opacity=".5" stroke-width="1"/>' +
ticks +
'<g class="hand hand-h"><line x1="160" y1="164" x2="160" y2="150" stroke="#ffe9a8" stroke-width="3.2" stroke-linecap="round"/></g>' +
'<g class="hand hand-m"><line x1="160" y1="164" x2="160" y2="141" stroke="#9ff4ff" stroke-width="2" stroke-linecap="round"/></g>' +
'<circle cx="160" cy="164" r="3.4" fill="#ffe9a8"/>' +
'<path d="M140 150 A25 25 0 0 1 166 138" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2" stroke-linecap="round"/>' +
/* door interior */
'<g clip-path="url(#doorClip)">' +
'<rect x="120" y="214" width="80" height="180" fill="url(#gInterior)"/>' +
'<g class="swirl">' + swirlArms(160, 314) + '</g>' +
'<circle class="core" cx="160" cy="314" r="26" fill="#fff" opacity=".85"/>' +
'</g>' +
/* spill */
'<path class="spill" d="M120 392 L200 392 L296 440 L24 440 Z" fill="url(#gSpill)"/>' +
/* door leaves */
'<g class="door door-l"><path d="M120 392 L120 254 A40 40 0 0 1 160 214 L160 392 Z" fill="url(#gLeaf)" stroke="url(#gGoldH)" stroke-width="2"/>' +
'<rect x="132" y="262" width="12" height="46" rx="6" fill="#7ae8ff" opacity=".55"/><rect x="152" y="300" width="4" height="26" rx="2" fill="url(#gGold)"/></g>' +
'<g class="door door-r"><path d="M160 214 A40 40 0 0 1 200 254 L200 392 L160 392 Z" fill="url(#gLeaf)" stroke="url(#gGoldH)" stroke-width="2"/>' +
'<rect x="176" y="262" width="12" height="46" rx="6" fill="#7ae8ff" opacity=".55"/><rect x="164" y="300" width="4" height="26" rx="2" fill="url(#gGold)"/></g>' +
/* jambs (kapı kanatlarını örter) */
'<rect x="92" y="236" width="28" height="164" fill="url(#gBody)"/><rect x="200" y="236" width="28" height="164" fill="url(#gBody)"/>' +
'<path d="M120 392 L120 254 A40 40 0 0 1 200 254 L200 392" fill="none" stroke="url(#gGoldH)" stroke-width="3.5"/>' +
'<line class="seam" x1="160" y1="216" x2="160" y2="392" stroke="#ffe9a8" stroke-width="2.4"/>' +
/* front ring */
'<path class="ring ring-glow" d="M36 296 A124 22 0 0 0 284 296" fill="none" stroke="url(#gRing)" stroke-opacity=".28" stroke-width="7"/>' +
'<path class="ring ring-flow" d="M36 296 A124 22 0 0 0 284 296" fill="none" stroke="url(#gRing)" stroke-width="2.2" stroke-dasharray="7 9"/>' +
motes +
'</svg>';
  }

  let stage = null, float = null;

  function mount(el) {
    stage = el;
    stage.innerHTML = '<div class="tm-float">' + build() + '</div>';
    float = stage.querySelector('.tm-float');
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function powerUp() { stage.classList.add('powered'); }
  async function open() { stage.classList.add('open'); await sleep(1350); }

  /** Kamerayı kapının içine doğru götürür (WAAPI) */
  function zoomIn(duration) {
    const r = stage.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, k = r.width / 320;
    const dx = vw / 2 - (r.left + r.width * 0.5), dy = vh / 2 - (r.top + r.height * (310 / 440));
    const S = Math.max((vh / 2) / (50 * k), (vw / 2) / (36 * k)) * 1.1;
    stage.style.transformOrigin = '50% ' + ((310 / 440) * 100).toFixed(2) + '%';
    const anim = stage.animate(
      [{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + S.toFixed(2) + ')' }],
      { duration: duration || 1900, easing: 'cubic-bezier(.66,0,.2,1)', fill: 'forwards' }
    );
    return anim.finished.then(() => anim);
  }

  function reset() {
    if (!stage) return;
    stage.getAnimations().forEach((a) => a.cancel());
    stage.style.transformOrigin = '';
    stage.classList.remove('open', 'powered');
  }

  global.TimeMachine = { mount, powerUp, open, zoomIn, reset, el: () => stage };
})(window);
