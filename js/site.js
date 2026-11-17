/* Site denetleyicisi: zaman makinesi yolculuğu → sayfalar → final */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const PREVIEW = qs.get('preview') === '1';
  const START_PAGE = qs.has('page') ? parseInt(qs.get('page'), 10) : -1;
  const AUTO = qs.get('auto') === '1';
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  let content, pages = [], S = {};
  let idx = -1, busy = false, journeyRunning = false, currentEl = null, navTimer = null;

  /* ---------- yardımcılar ---------- */
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  const fmtDate = (d) => d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  function pageLabel(p) { return (p.dateLabel && p.dateLabel.trim()) || (parseISO(p.date) ? fmtDate(parseISO(p.date)) : ''); }
  function fill(str) {
    const name = (S.herName || '').trim();
    let out = String(str || '');
    out = name ? out.replace(/\{isim\}|\{name\}/gi, name) : out.replace(/\{isim\}|\{name\}/gi, '').replace(/^[,\s]+/, '');
    return out;
  }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function fatal(msg) { const f = $('fatal'); f.hidden = false; f.innerHTML = msg; }
  function words(text, startDelay, step) {
    const wrap = document.createDocumentFragment();
    let i = 0;
    String(text).split(/(\s+)/).forEach((tok) => {
      if (!tok) return;
      if (/^\s+$/.test(tok)) { wrap.appendChild(document.createTextNode(' ')); return; }
      const s = el('span', 'w'); s.textContent = tok; s.style.setProperty('--i', i++); wrap.appendChild(s);
    });
    return { frag: wrap, count: i };
  }
  const CLOCK_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const CAM_SVG = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>';

  function flashTo(opacity, ms, color) {
    const f = $('flash');
    if (color) f.style.background = color;
    const from = parseFloat(getComputedStyle(f).opacity) || 0;
    const a = f.animate([{ opacity: from }, { opacity }], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
    return a.finished.then(() => { f.style.opacity = opacity; a.cancel(); });
  }

  /* ---------- açılış ---------- */
  function applySettings() {
    document.title = S.siteTitle || 'Zaman Makinesi';
    $('introEyebrow').textContent = fill(S.introEyebrow);
    $('introQuestion').textContent = fill(S.introQuestion);
    $('introBtnText').textContent = fill(S.introButton);
    $('introHint').textContent = S.introHint ? '🎧 ' + fill(S.introHint) : '';
    const muted = localStorage.getItem('zm-muted') === '1';
    Music.setMuted(muted); $('soundBtn').classList.toggle('muted', muted);
  }

  function showIntro() {
    World.setMode('space');
    World.setPalette('golden', true);
    World.setParticles('none');
    $('story').hidden = true; $('pageHost').innerHTML = ''; currentEl = null; idx = -1;
    const intro = $('intro');
    intro.classList.remove('go', 'fade'); intro.hidden = false;
    $('journey').classList.remove('on');
    TimeMachine.reset();
  }

  /* ---------- yolculuk ---------- */
  function journeyTarget() {
    const first = pages[0] || {};
    return parseISO(first.date) || parseISO(S.meetDate) || null;
  }

  async function startJourney() {
    if (journeyRunning) return;
    journeyRunning = true;
    Music.unlock();
    const intro = $('intro');
    intro.classList.add('go');
    TimeMachine.powerUp(); Music.sfx.powerUp(3);
    await sleep(1500);
    Music.sfx.whoosh(2.2, 3400);
    await TimeMachine.open();
    await sleep(120);

    // kapının içine gir
    World.resetWarp(); World.warpGlow(2.4, 0.01);
    setTimeout(() => World.setMode('warp'), 1250);
    await TimeMachine.zoomIn(2100);
    $('journey').classList.add('on');
    intro.classList.add('fade');
    World.warpSpeed(1, 1.6); World.warpGlow(1, 2.2);

    // tünel: tarih geriye akar
    const first = pages[0];
    const now = new Date();
    const target = journeyTarget();
    const fromMs = now.getTime();
    const toMs = target ? target.getTime() : fromMs - 365 * 864e5;
    const caps = (S.journeyCaptions && S.journeyCaptions.length ? S.journeyCaptions : ['Zamanı geri sarıyoruz…', 'Biraz daha…', 'Geldik']).map(fill);
    const D = 5800, t0 = performance.now();
    let skipped = false, capIdx = -1, decel = false, lastTick = 0;
    const jDate = $('jDate'), jCap = $('jCaption');
    $('jSkip').onclick = () => { skipped = true; };
    await new Promise((res) => {
      (function frame() {
        const nowT = performance.now();
        let u = Math.min(1, (nowT - t0) / D);
        if (skipped) u = 1;
        const p = inOut(Math.min(1, u / 0.9));
        jDate.textContent = fmtDate(new Date(fromMs + (toMs - fromMs) * p));
        const ci = u < 0.4 ? 0 : u < 0.82 ? 1 : 2;
        if (ci !== capIdx) { capIdx = ci; jCap.textContent = caps[Math.min(ci, caps.length - 1)]; }
        if (u > 0.76 && !decel) { decel = true; World.warpSpeed(0.3, 1.2); }
        if (nowT - lastTick > 130 && u < 0.85) { lastTick = nowT; Music.sfx.tick(0.02); }
        if (u >= 1) return res();
        requestAnimationFrame(frame);
      })();
    });
    // iniş
    jDate.textContent = target ? fmtDate(target) : (first ? pageLabel(first) : '');
    jDate.classList.add('land');
    await sleep(900);

    // beyaz parlama → orman
    Music.sfx.arrive();
    await flashTo(1, 520, '#fff');
    $('journey').classList.remove('on'); jDate.classList.remove('land'); jDate.textContent = ''; jCap.textContent = '';
    intro.hidden = true; TimeMachine.reset(); World.resetWarp();
    prepareStory(0, true);
    World.dolly(1.34, 1, 5600, 'out'); World.rayBoost(2.8, 1, 4600, 'out');
    await sleep(260);
    flashTo(0, 2600, '#fff');
    applyMusic(0);
    await sleep(1700);
    await goTo(0, { first: true });
    journeyRunning = false;
  }

  /* ---------- hikâye ---------- */
  function prepareStory(i, silent) {
    const p = pages[i];
    World.setMode('scene');
    World.setPalette(p.palette, true);
    World.setParticles(p.particles);
    $('story').style.setProperty('--accent', World.accentOf(p.palette));
    $('story').hidden = false;
    buildProgress();
    $('nav').classList.add('wait');
  }

  function buildProgress() {
    const box = $('progress'); box.innerHTML = '';
    pages.forEach(() => box.appendChild(el('i')));
  }
  function updateProgress() {
    [...$('progress').children].forEach((n, i) => { n.className = i < idx ? 'done' : i === idx ? 'cur' : ''; });
  }

  function effectiveTrack(i) {
    for (let j = i; j >= 0; j--) {
      const p = pages[j];
      if (p.trackId) return { id: p.trackId, start: p.musicStart || 0 };
    }
    return null;
  }
  function applyMusic(i) {
    const e = effectiveTrack(i);
    if (!e) return;
    if (e.id === 'none') { Music.stop(1.4); return; }
    const tr = content.tracks.find((t) => t.id === e.id);
    if (!tr) return;
    Music.play(Store.url(tr.file), tr.id, { start: e.start, fade: 1.8 });
  }

  /* fotoğraf destesi */
  function buildStack(photos, page) {
    const area = el('div', 'photo-area'), stack = el('div', 'polaroid-stack');
    area.appendChild(stack);
    const list = photos.length ? photos : [null];
    const cards = list.map((ph) => {
      const fig = el('figure', 'polaroid');
      const box = el('div', 'photo');
      if (ph && ph.src) {
        const img = new Image(); img.decoding = 'async'; img.alt = ph.caption || ''; img.draggable = false; img.src = Store.url(ph.src); box.appendChild(img);
      } else { box.className = 'photo ph'; box.innerHTML = '<div>' + CAM_SVG + 'Buraya fotoğraf gelecek</div>'; }
      fig.appendChild(box);
      fig.appendChild(el('figcaption', null)).textContent = (ph && ph.caption) || '';
      stack.appendChild(fig);
      return fig;
    });
    const ROT = [-2.4, 3.2, -5.5, 6.5], OFF = [[0, 0], [10, 7], [-12, 12], [14, 16]];
    let order = cards.map((_, i) => i), hint = null;
    function arrange() {
      order.forEach((ci, pos) => {
        const k = Math.min(pos, 3), c = cards[ci];
        c.style.setProperty('--rot', ROT[k] + 'deg'); c.style.setProperty('--ox', OFF[k][0] + 'px'); c.style.setProperty('--oy', OFF[k][1] + 'px');
        c.style.setProperty('--z', cards.length - pos); c.style.opacity = pos > 3 ? 0 : 1;
      });
      if (hint) hint.textContent = (order[0] + 1) + '/' + cards.length;
    }
    function cycle() {
      if (cards.length < 2) { const t = cards[0]; t.animate([{ transform: 'rotate(var(--rot)) scale(1)' }, { transform: 'rotate(calc(var(--rot) + 3deg)) scale(1.03)' }, { transform: 'rotate(var(--rot)) scale(1)' }], { duration: 520, easing: 'ease-in-out' }); return; }
      const top = cards[order[0]]; top.classList.add('fly'); Music.sfx.page();
      setTimeout(() => { top.classList.remove('fly'); order.push(order.shift()); arrange(); }, 430);
    }
    arrange();
    if (cards.length > 1) {
      stack.dataset.multi = '1';
      hint = el('div', 'stack-hint'); stack.appendChild(hint); arrange();
    }
    stack.addEventListener('click', cycle);
    stack._cycle = cycle;
    return area;
  }

  function buildFullBg(photos) {
    const bg = el('div', 'full-bg');
    const imgs = photos.filter((p) => p.src).map((p) => { const i = new Image(); i.src = Store.url(p.src); i.alt = p.caption || ''; bg.appendChild(i); return i; });
    if (imgs.length) {
      requestAnimationFrame(() => imgs[0].classList.add('on'));
      if (imgs.length > 1) {
        let k = 0;
        bg._timer = setInterval(() => { imgs[k].classList.remove('on'); k = (k + 1) % imgs.length; imgs[k].classList.add('on'); }, 5200);
      }
    }
    return bg;
  }

  function daysBetween(a, b) { return Math.floor((b - a) / 864e5); }
  function diffYMD(a, b) {
    let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate();
    if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
    if (m < 0) { y--; m += 12; }
    return { y: Math.max(0, y), m: Math.max(0, m), d: Math.max(0, d) };
  }

  function buildPage(p, i) {
    const finale = p.type === 'finale';
    const layout = p.layout === 'full' || p.layout === 'text' ? p.layout : 'polaroid';
    const page = el('article', 'page layout-' + layout + (finale ? ' finale' : ''));
    let reveal = 1.0;

    if (layout === 'full') page.appendChild(buildFullBg(p.photos));
    if (layout === 'polaroid') page.appendChild(buildStack(p.photos, p));

    const col = el('div', 'text-col');
    const label = pageLabel(p);
    if (label) { const chip = el('div', 'date-chip rv', CLOCK_SVG + '<span></span>'); chip.querySelector('span').textContent = label; chip.style.setProperty('--d', '.15s'); col.appendChild(chip); }

    const area = el('div', 'text-area rv'); area.style.setProperty('--d', '.8s');
    if (p.title) {
      const h = el('h2', 'page-title'); const w = words(fill(p.title), 0, 0.06); h.appendChild(w.frag);
      h.style.setProperty('--d', '1s'); h.style.setProperty('--step', '.06s'); area.appendChild(h);
      reveal = 1 + w.count * 0.06;
    }
    const body = el('div', 'page-body');
    const paras = String(fill(p.text || '')).split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    const total = paras.join(' ').split(/\s+/).filter(Boolean).length;
    const step = clamp(2.6 / Math.max(1, total), 0.014, 0.045);
    let off = 0;
    paras.forEach((t) => {
      const pe = el('p'); const w = words(t.replace(/\n/g, ' '), 0, step);
      pe.appendChild(w.frag);
      pe.querySelectorAll('.w').forEach((s) => s.style.setProperty('--i', +s.style.getPropertyValue('--i') + off));
      off += w.count; body.appendChild(pe);
    });
    body.style.setProperty('--d', reveal + 0.15 + 's'); body.style.setProperty('--step', step + 's');
    reveal += 0.15 + total * step;
    area.appendChild(body);

    if (finale) {
      const since = parseISO(S.sinceDate);
      if (since && p.showCounter !== false) {
        const d = diffYMD(since, new Date()), total = daysBetween(since, new Date());
        const c = el('div', 'counter rv');
        c.style.setProperty('--d', reveal + 0.2 + 's');
        c.innerHTML = '<div class="counter-label"></div><div class="counter-grid"><div><b data-n="' + d.y + '">0</b><span>yıl</span></div><div><b data-n="' + d.m + '">0</b><span>ay</span></div><div><b data-n="' + d.d + '">0</b><span>gün</span></div></div><div class="counter-total">Yani tam <b data-n="' + total + '" data-fmt="1">0</b> gün ❤</div>';
        c.querySelector('.counter-label').textContent = fill(S.finaleCounterLabel);
        area.appendChild(c); reveal += 1.4;
        page._counter = c; page._counterDelay = (reveal - 1.2) * 1000;
      }
      const act = el('div', 'finale-actions rv'); act.style.setProperty('--d', reveal + 0.1 + 's');
      const rb = el('button', 'btn-primary', '<span></span><i class="shine"></i>'); rb.querySelector('span').textContent = fill(S.replayLabel) + ' ↺';
      rb.addEventListener('click', replay); act.appendChild(rb); area.appendChild(act); reveal += 0.6;
    }
    col.appendChild(area); page.appendChild(col);
    page._reveal = reveal;
    return page;
  }

  function runCounter(c) {
    const nums = [...c.querySelectorAll('b[data-n]')], t0 = performance.now(), D = 2200;
    (function f() {
      const u = clamp((performance.now() - t0) / D, 0, 1), e = 1 - Math.pow(1 - u, 3);
      nums.forEach((b) => { const n = Math.round(+b.dataset.n * e); b.textContent = b.dataset.fmt ? n.toLocaleString('tr-TR') : n; });
      if (u < 1) requestAnimationFrame(f);
    })();
  }

  async function goTo(i, opts) {
    opts = opts || {};
    if (busy || i < 0 || i >= pages.length) return;
    busy = true;
    const back = i < idx, old = currentEl, p = pages[i];
    clearTimeout(navTimer);
    $('nav').classList.add('wait');
    $('story').style.setProperty('--accent', World.accentOf(p.palette));
    World.setPalette(p.palette); World.setParticles(p.particles);
    if (!opts.first) { World.pulse(0.07); Music.sfx.page(); applyMusic(i); }
    if (old) {
      old.classList.add('leave'); if (back) old.classList.add('back');
      const fb = old.querySelector('.full-bg'); if (fb && fb._timer) clearInterval(fb._timer);
      await sleep(480); old.remove();
    }
    idx = i;
    const page = buildPage(p, i);
    currentEl = page;
    $('pageHost').appendChild(page);
    void page.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => page.classList.add('in')));
    updateProgress();
    const nav = $('nav'), last = i === pages.length - 1;
    nav.classList.toggle('hide-prev', i === 0);
    nav.classList.toggle('hide-next', p.type === 'finale');
    $('nextLabel').textContent = last ? fill(S.replayLabel) + ' ↺' : (i === pages.length - 2 && pages[pages.length - 1].type === 'finale' ? 'Son sürpriz' : 'Devam');
    navTimer = setTimeout(() => nav.classList.remove('wait'), clamp(page._reveal * 1000 * 0.7, 1500, 3200));
    if (page._counter) setTimeout(() => runCounter(page._counter), page._counterDelay + 200);
    if (p.type === 'finale') {
      setTimeout(() => FX.burst(innerWidth / 2, innerHeight * 0.38, 130), 900);
      setTimeout(() => FX.burst(innerWidth * 0.25, innerHeight * 0.5, 70), 1500);
      setTimeout(() => FX.burst(innerWidth * 0.75, innerHeight * 0.5, 70), 1900);
    }
    await sleep(700);
    busy = false;
  }

  const next = () => { if (idx < 0) return; if (idx < pages.length - 1) goTo(idx + 1); else if (pages[idx].type !== 'finale') replay(); };
  const prev = () => { if (idx > 0) goTo(idx - 1); };

  async function replay() {
    if (busy) return;
    busy = true;
    Music.stop(1.4);
    await flashTo(1, 700, '#05061a');
    showIntro();
    journeyRunning = false; busy = false;
    await sleep(120);
    flashTo(0, 900, '#05061a');
  }

  /* ---------- önizleme / doğrudan başlatma ---------- */
  async function quickStart(i) {
    $('intro').hidden = true;
    prepareStory(i, true);
    World.dolly(1.12, 1, 2400, 'out'); World.rayBoost(1.8, 1, 2400, 'out');
    $('nav').classList.remove('wait');
    await goTo(i, { first: true });
    if (!Music.unlocked) {
      const pill = $('soundPill'); pill.hidden = false;
      pill.onclick = () => { Music.unlock(); applyMusic(idx); pill.hidden = true; };
    }
  }

  /* ---------- olaylar ---------- */
  function bind() {
    $('introBtn').addEventListener('click', startJourney);
    const stage = $('tmStage');
    stage.addEventListener('click', startJourney);
    stage.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startJourney(); } });
    $('nextBtn').addEventListener('click', next);
    $('prevBtn').addEventListener('click', prev);
    $('soundBtn').addEventListener('click', () => {
      if (!Music.unlocked) { Music.unlock(); applyMusic(Math.max(0, idx)); }
      const m = !Music.muted; Music.setMuted(m); localStorage.setItem('zm-muted', m ? '1' : '0'); $('soundBtn').classList.toggle('muted', m);
    });
    document.addEventListener('keydown', (e) => {
      if ($('story').hidden) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'Enter') { if (e.target.tagName === 'BUTTON') return; e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prev(); }
    });
    // kaydırma hareketleri
    let sx = 0, sy = 0, st = 0, sT = null;
    const host = $('story');
    host.addEventListener('touchstart', (e) => { if (e.touches.length !== 1) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); sT = e.target; }, { passive: true });
    host.addEventListener('touchend', (e) => {
      if (!sT || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy, dt = Date.now() - st;
      const stack = sT.closest && sT.closest('.polaroid-stack'), ta = sT.closest && sT.closest('.text-area');
      sT = null;
      if (dt > 800) return;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        if (stack && stack.dataset.multi && stack._cycle) { stack._cycle(); return; }
        dx < 0 ? next() : prev();
      } else if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 1.4) {
        if (ta && ta.scrollHeight > ta.clientHeight + 2) return;
        dy < 0 ? next() : prev();
      }
    }, { passive: true });
    let wheelLock = 0;
    host.addEventListener('wheel', (e) => {
      const ta = e.target.closest && e.target.closest('.text-area');
      if (ta && ta.scrollHeight > ta.clientHeight + 2) return;
      if (Math.abs(e.deltaY) < 30 || Date.now() < wheelLock) return;
      wheelLock = Date.now() + 1000; e.deltaY > 0 ? next() : prev();
    }, { passive: true });
  }

  /* ---------- başlat ---------- */
  async function boot() {
    try { content = await Store.load({ preview: PREVIEW }); }
    catch (e) { fatal('İçerik yüklenemedi.<br><small>' + (e.message || e) + '</small><br><small>Siteyi bir web sunucusu üzerinden aç (ör. Netlify ya da localhost).</small>'); return; }
    S = content.settings; pages = content.pages;
    if (!pages.length) { fatal('Henüz hiç sayfa yok.<br><small>Yönetim panelinden (admin.html) sayfa ekle.</small>'); return; }
    World.init($('world')); FX.init($('fx'));
    TimeMachine.mount($('tmStage'));
    applySettings(); bind();
    Music.setOnBlocked(() => {
      const pill = $('soundPill');
      pill.hidden = false;
      pill.onclick = () => {
        Music.unlock();
        applyMusic(Math.max(0, idx));
        pill.hidden = true;
      };
    });
    if (START_PAGE >= 0) await quickStart(clamp(START_PAGE, 0, pages.length - 1));
    else { showIntro(); if (AUTO) setTimeout(startJourney, 800); }
  }
  boot();
})();
