/* Admin Paneli — Sayfa/Date Ekle-Çıkar, Fotoğraf/Müzik Yönetimi, Canlı Önizleme, QR & ZIP Paketleme */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  const PALETTES = [
    { id: 'golden', name: 'Gün ışığı', grad: 'linear-gradient(135deg,#5694d6,#ffecb0)' },
    { id: 'sunset', name: 'Gün batımı', grad: 'linear-gradient(135deg,#322462,#e06862,#ffb862)' },
    { id: 'night',  name: 'Yıldızlı gece', grad: 'linear-gradient(135deg,#05071c,#443a7a)' },
    { id: 'autumn', name: 'Sonbahar', grad: 'linear-gradient(135deg,#68628c,#f0a86c)' },
    { id: 'winter', name: 'Kış', grad: 'linear-gradient(135deg,#7696cc,#f6fbff)' },
    { id: 'sakura', name: 'Sakura', grad: 'linear-gradient(135deg,#ffbed4,#fff4ec)' }
  ];

  const PARTICLES = [
    { id: 'pollen', name: 'Güneş tozları' },
    { id: 'fireflies', name: 'Ateş böcekleri' },
    { id: 'leaves', name: 'Sonbahar yaprakları' },
    { id: 'petals', name: 'Sakura yaprakları' },
    { id: 'snow', name: 'Kar taneleri' },
    { id: 'hearts', name: 'Kalpler' },
    { id: 'none', name: 'Parçacık yok' }
  ];

  const LAYOUTS = [
    { id: 'polaroid', name: 'Polaroid Deste' },
    { id: 'full', name: 'Tam Ekran Fotoğraf' },
    { id: 'text', name: 'Sadece Yazı' }
  ];

  let content = null;
  let activeTab = 'pages';
  let selectedPageIdx = 0;
  let saveTimer = null;
  let previewTimer = null;

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  function scheduleSave(refreshPreview) {
    $('saveBadge').textContent = 'Kaydediliyor…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await Store.saveDraft(content);
      $('saveBadge').textContent = '✓ Taslak kaydedildi';
      if (refreshPreview) reloadPreview();
    }, 220);
  }

  function reloadPreview(mode) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const iframe = $('previewFrame');
      if (!iframe) return;
      if (mode === 'intro') {
        iframe.src = 'index.html?preview=1&t=' + Date.now();
      } else {
        iframe.src = 'index.html?preview=1&page=' + Math.max(0, selectedPageIdx) + '&t=' + Date.now();
      }
    }, 250);
  }

  /* ---------------- Tabs ---------------- */
  function bindTabs() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.id !== 'tab-' + activeTab; });
        if (activeTab === 'qr') renderQRCard();
      });
    });
  }

  /* ---------------- Tab 1: Sayfalar & Date ---------------- */
  function renderPageList() {
    const list = $('pageList');
    list.innerHTML = '';
    content.pages.forEach((p, i) => {
      const item = document.createElement('div');
      item.className = 'page-item' + (i === selectedPageIdx ? ' active' : '');
      const subParts = [];
      if (p.dateLabel || p.date) subParts.push(p.dateLabel || p.date);
      if (p.type === 'finale') subParts.push('Final');
      if (p.photos && p.photos.length) subParts.push(p.photos.length + ' foto');

      item.innerHTML = `
        <div class="page-item-meta">
          <div class="page-item-title">${escapeHtml(p.title || (p.type === 'finale' ? 'Final Sayfası' : 'Adsız Sayfa'))}</div>
          <div class="page-item-sub">${escapeHtml(subParts.join(' · ') || 'Sayfa ' + (i + 1))}</div>
        </div>
        <div class="page-item-arrows">
          <button class="arrow-btn" data-mv="-1" title="Yukarı">↑</button>
          <button class="arrow-btn" data-mv="1" title="Aşağı">↓</button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        const mvBtn = e.target.closest('[data-mv]');
        if (mvBtn) {
          e.stopPropagation();
          const dir = parseInt(mvBtn.dataset.mv, 10);
          const ni = i + dir;
          if (ni < 0 || ni >= content.pages.length) return;
          const tmp = content.pages[i];
          content.pages[i] = content.pages[ni];
          content.pages[ni] = tmp;
          if (selectedPageIdx === i) selectedPageIdx = ni;
          else if (selectedPageIdx === ni) selectedPageIdx = i;
          renderPageList();
          renderPageEditor();
          scheduleSave(true);
          return;
        }
        selectedPageIdx = i;
        renderPageList();
        renderPageEditor();
        reloadPreview();
      });

      list.appendChild(item);
    });
  }

  function renderPageEditor() {
    const host = $('pageEditor');
    const p = content.pages[selectedPageIdx];
    if (!p) {
      host.innerHTML = '<p class="hint">Soldan bir sayfa seç ya da yeni bir anı/date sayfası ekle.</p>';
      return;
    }

    const trackOpts = [
      `<option value="">Önceki sayfadaki şarkı devam etsin</option>`,
      `<option value="none">Sessiz (Müziği durdur)</option>`,
      ...content.tracks.map((t) => `<option value="${escapeAttr(t.id)}">🎵 ${escapeHtml(t.name)}</option>`)
    ].join('');

    const layoutOpts = LAYOUTS.map((l) => `<option value="${l.id}">${l.name}</option>`).join('');
    const particleOpts = PARTICLES.map((pt) => `<option value="${pt.id}">${pt.name}</option>`).join('');

    host.innerHTML = `
      <div class="card-title">
        <span>Sayfa Düzenleyici (#${selectedPageIdx + 1})</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button id="dupPageBtn" class="btn btn-ghost btn-sm" type="button">Kopyala</button>
          <button id="delPageBtn" class="btn btn-danger btn-sm" type="button">Sayfayı Sil</button>
        </div>
      </div>

      <div class="form-grid">
        <div class="field">
          <label>Sayfa Türü</label>
          <select id="pType">
            <option value="memory">Anı / Date Sayfası</option>
            <option value="finale">Final (Doğum Günü & Sayaç)</option>
          </select>
        </div>
        <div class="field">
          <label>Sayfa Düzeni</label>
          <select id="pLayout">${layoutOpts}</select>
        </div>
        <div class="field">
          <label>Gerçek Tarih (Zaman tüneli için)</label>
          <input id="pDate" type="date" value="${escapeAttr(p.date || '')}">
        </div>
        <div class="field">
          <label>Ekranda Görünen Etiket</label>
          <input id="pDateLabel" type="text" placeholder="Örn: İlk Date, 14 Şubat..." value="${escapeAttr(p.dateLabel || '')}">
        </div>
      </div>

      <div class="field">
        <label>Sayfa Başlığı</label>
        <input id="pTitle" type="text" placeholder="Örn: İlk Date" value="${escapeAttr(p.title || '')}">
      </div>

      <div class="field">
        <label>
          <span>Hikâye / Metin</span>
          <button id="insertNameBtn" class="btn btn-ghost btn-sm" type="button">{isim} ekle</button>
        </label>
        <textarea id="pText" placeholder="O güne ait anını yaz...">${escapeHtml(p.text || '')}</textarea>
      </div>

      <div class="form-grid">
        <div class="field">
          <label>Bu Sayfada Çalacak Şarkı</label>
          <select id="pTrackId">${trackOpts}</select>
        </div>
        <div class="field">
          <label>Şarkı Başlangıç Saniyesi (sn)</label>
          <input id="pMusicStart" type="number" min="0" step="1" value="${Number(p.musicStart) || 0}">
        </div>
        <div class="field">
          <label>Parçacık Efekti</label>
          <select id="pParticles">${particleOpts}</select>
        </div>
      </div>

      ${p.type === 'finale' ? `
      <div class="field">
        <label style="justify-content:flex-start; gap:8px; cursor:pointer;">
          <input id="pShowCounter" type="checkbox" ${p.showCounter !== false ? 'checked' : ''} style="width:auto;">
          <span>Finalde "Birlikte Geçirdiğimiz Zaman" sayacını göster</span>
        </label>
      </div>` : ''}

      <div class="field">
        <label>Gökyüzü & Orman Atmosferi</label>
        <div class="palette-grid" id="pPaletteGrid">
          ${PALETTES.map((pal) => `
            <button type="button" class="pal-chip ${p.palette === pal.id ? 'active' : ''}" data-pal="${pal.id}">
              <span class="pal-dot" style="background:${pal.grad}"></span>
              <span>${pal.name}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="field" style="margin-top:16px;">
        <label>Bu Sayfanın Fotoğrafları (${p.photos.length} adet)</label>
        <input id="pPhotoInput" type="file" accept="image/*" multiple hidden>
        <div id="pPhotoDrop" class="dropzone">
          <strong>📸 Fotoğraf Seçmek İçin Tıkla veya Sürükle</strong>
          <div class="hint" style="margin-top:4px;">Birden fazla fotoğraf seçebilirsin; Polaroid destesinde sırayla açılır.</div>
        </div>
        <div id="pPhotoList" class="photo-list"></div>
      </div>
    `;

    $('pType').value = p.type || 'memory';
    $('pLayout').value = p.layout || 'polaroid';
    $('pTrackId').value = p.trackId || '';
    $('pParticles').value = p.particles || 'pollen';

    $('pType').onchange = (e) => { p.type = e.target.value; renderPageList(); renderPageEditor(); scheduleSave(true); };
    $('pLayout').onchange = (e) => { p.layout = e.target.value; scheduleSave(true); };
    $('pDate').oninput = (e) => { p.date = e.target.value; renderPageList(); scheduleSave(false); };
    $('pDateLabel').oninput = (e) => { p.dateLabel = e.target.value; renderPageList(); scheduleSave(false); };
    $('pTitle').oninput = (e) => { p.title = e.target.value; renderPageList(); scheduleSave(false); };
    $('pText').oninput = (e) => { p.text = e.target.value; scheduleSave(false); };
    $('pTrackId').onchange = (e) => { p.trackId = e.target.value; scheduleSave(true); };
    $('pMusicStart').oninput = (e) => { p.musicStart = Math.max(0, Number(e.target.value) || 0); scheduleSave(false); };
    $('pParticles').onchange = (e) => { p.particles = e.target.value; scheduleSave(true); };

    if ($('pShowCounter')) {
      $('pShowCounter').onchange = (e) => { p.showCounter = e.target.checked; scheduleSave(true); };
    }

    $('insertNameBtn').onclick = () => {
      const ta = $('pText');
      const start = ta.selectionStart || 0;
      ta.value = ta.value.slice(0, start) + '{isim}' + ta.value.slice(ta.selectionEnd || start);
      p.text = ta.value;
      scheduleSave(false);
    };

    $('pPaletteGrid').querySelectorAll('[data-pal]').forEach((btn) => {
      btn.onclick = () => {
        p.palette = btn.dataset.pal;
        $('pPaletteGrid').querySelectorAll('[data-pal]').forEach((b) => b.classList.toggle('active', b === btn));
        scheduleSave(true);
      };
    });

    $('dupPageBtn').onclick = () => {
      const copy = JSON.parse(JSON.stringify(p));
      copy.id = uid('p');
      copy.title = (copy.title || 'Sayfa') + ' (Kopya)';
      content.pages.splice(selectedPageIdx + 1, 0, copy);
      selectedPageIdx++;
      renderPageList();
      renderPageEditor();
      scheduleSave(true);
      toast('Sayfa kopyalandı');
    };

    $('delPageBtn').onclick = () => {
      if (content.pages.length <= 1) { toast('En az 1 sayfa kalmalı'); return; }
      content.pages.splice(selectedPageIdx, 1);
      selectedPageIdx = Math.max(0, Math.min(selectedPageIdx, content.pages.length - 1));
      renderPageList();
      renderPageEditor();
      scheduleSave(true);
      toast('Sayfa silindi');
    };

    // Photo dropzone & upload
    const drop = $('pPhotoDrop');
    const finp = $('pPhotoInput');
    drop.onclick = () => finp.click();
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('drag'); };
    drop.ondragleave = () => drop.classList.remove('drag');
    drop.ondrop = async (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
      await handlePhotoFiles(p, e.dataTransfer.files);
    };
    finp.onchange = async (e) => {
      await handlePhotoFiles(p, e.target.files);
      finp.value = '';
    };

    renderPhotoList(p);
  }

  function compressPhoto(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const max = 1600;
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w > h) { h = Math.round((h * max) / w); w = max; }
          else { w = Math.round((w * max) / h); h = max; }
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Sıkıştırma hatası')), 'image/jpeg', 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Görsel okunamadı')); };
      img.src = url;
    });
  }

  async function handlePhotoFiles(page, fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    toast(files.length + ' fotoğraf ekleniyor…');
    for (const f of files) {
      try {
        const blob = await compressPhoto(f);
        const path = 'media/photos/' + uid('img') + '.jpg';
        await Store.putMedia(path, blob, { name: f.name });
        page.photos.push({ src: path, caption: '' });
      } catch (err) {
        console.error(err);
      }
    }
    renderPhotoList(page);
    renderPageList();
    scheduleSave(true);
    toast('Fotoğraflar eklendi');
  }

  function renderPhotoList(page) {
    const box = $('pPhotoList');
    box.innerHTML = '';
    page.photos.forEach((ph, idx) => {
      const card = document.createElement('div');
      card.className = 'photo-card';
      card.innerHTML = `
        <img src="${escapeAttr(Store.url(ph.src))}" alt="">
        <div class="photo-card-body">
          <input type="text" placeholder="Alt yazı (Polaroid notu)..." value="${escapeAttr(ph.caption || '')}">
          <div class="photo-card-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-pmv="-1">←</button>
            <button type="button" class="btn btn-ghost btn-sm" data-pmv="1">→</button>
            <button type="button" class="btn btn-danger btn-sm" data-pdel="1">Sil</button>
          </div>
        </div>
      `;
      card.querySelector('input').oninput = (e) => { ph.caption = e.target.value; scheduleSave(false); };
      card.querySelectorAll('[data-pmv]').forEach((b) => {
        b.onclick = () => {
          const ni = idx + parseInt(b.dataset.pmv, 10);
          if (ni < 0 || ni >= page.photos.length) return;
          const t = page.photos[idx]; page.photos[idx] = page.photos[ni]; page.photos[ni] = t;
          renderPhotoList(page);
          scheduleSave(true);
        };
      });
      card.querySelector('[data-pdel]').onclick = () => {
        page.photos.splice(idx, 1);
        renderPhotoList(page);
        renderPageList();
        scheduleSave(true);
      };
      box.appendChild(card);
    });
  }

  /* ---------------- Tab 2: Müzikler ---------------- */
  function renderTracks() {
    const list = $('trackList');
    list.innerHTML = '';
    if (!content.tracks.length) {
      list.innerHTML = '<p class="hint">Henüz şarkı eklenmemiş.</p>';
      return;
    }
    content.tracks.forEach((tr, idx) => {
      const row = document.createElement('div');
      row.className = 'track-item';
      row.innerHTML = `
        <input type="text" value="${escapeAttr(tr.name || '')}" placeholder="Şarkı adı...">
        <audio controls preload="metadata" src="${escapeAttr(Store.url(tr.file))}"></audio>
        <button type="button" class="btn btn-danger btn-sm">Sil</button>
      `;
      row.querySelector('input').oninput = (e) => {
        tr.name = e.target.value;
        renderPageEditor();
        scheduleSave(false);
      };
      row.querySelector('button').onclick = () => {
        const used = content.pages.some((p) => p.trackId === tr.id);
        content.pages.forEach((p) => { if (p.trackId === tr.id) p.trackId = ''; });
        content.tracks.splice(idx, 1);
        renderTracks();
        renderPageEditor();
        scheduleSave(true);
        toast(used ? 'Şarkı silindi (kullanan sayfalar temizlendi)' : 'Şarkı silindi');
      };
      list.appendChild(row);
    });
  }

  function bindAudioUpload() {
    const drop = $('trackDrop');
    const inp = $('trackInput');
    drop.onclick = () => inp.click();
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('drag'); };
    drop.ondragleave = () => drop.classList.remove('drag');
    drop.ondrop = async (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
      await handleAudioFiles(e.dataTransfer.files);
    };
    inp.onchange = async (e) => {
      await handleAudioFiles(e.target.files);
      inp.value = '';
    };
  }

  async function handleAudioFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|aac)$/i.test(f.name));
    if (!files.length) return;
    for (const f of files) {
      const extMatch = /\.([a-z0-9]+)$/i.exec(f.name);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'mp3';
      const id = uid('t');
      const path = 'media/tracks/' + id + '.' + ext;
      await Store.putMedia(path, f, { name: f.name });
      content.tracks.push({
        id,
        name: f.name.replace(/\.[^.]+$/, ''),
        file: path
      });
    }
    renderTracks();
    renderPageEditor();
    scheduleSave(false);
    toast(files.length + ' şarkı kütüphaneye eklendi');
  }

  /* ---------------- Tab 3: Zaman Makinesi & Genel Ayarlar ---------------- */
  function renderSettings() {
    const s = content.settings;
    $('sSiteTitle').value = s.siteTitle || '';
    $('sHerName').value = s.herName || '';
    $('sIntroEyebrow').value = s.introEyebrow || '';
    $('sIntroQuestion').value = s.introQuestion || '';
    $('sIntroButton').value = s.introButton || '';
    $('sIntroHint').value = s.introHint || '';
    $('sMeetDate').value = s.meetDate || '';
    $('sSinceDate').value = s.sinceDate || '';
    const caps = Array.isArray(s.journeyCaptions) ? s.journeyCaptions : ['', '', ''];
    $('sCap0').value = caps[0] || '';
    $('sCap1').value = caps[1] || '';
    $('sCap2').value = caps[2] || '';
    $('sFinaleCounterLabel').value = s.finaleCounterLabel || '';
    $('sReplayLabel').value = s.replayLabel || '';
    $('pinStatusText').textContent = s.pinHash ? 'PIN kilidi aktif' : 'PIN kilidi kapalı (herkes erişebilir)';

    const map = [
      ['sSiteTitle', 'siteTitle'],
      ['sHerName', 'herName'],
      ['sIntroEyebrow', 'introEyebrow'],
      ['sIntroQuestion', 'introQuestion'],
      ['sIntroButton', 'introButton'],
      ['sIntroHint', 'introHint'],
      ['sMeetDate', 'meetDate'],
      ['sSinceDate', 'sinceDate'],
      ['sFinaleCounterLabel', 'finaleCounterLabel'],
      ['sReplayLabel', 'replayLabel']
    ];
    map.forEach(([id, key]) => {
      $(id).oninput = (e) => {
        s[key] = e.target.value;
        scheduleSave(false);
      };
    });

    ['sCap0', 'sCap1', 'sCap2'].forEach((id, idx) => {
      $(id).oninput = (e) => {
        if (!Array.isArray(s.journeyCaptions)) s.journeyCaptions = ['', '', ''];
        s.journeyCaptions[idx] = e.target.value;
        scheduleSave(false);
      };
    });

    $('savePinBtn').onclick = async () => {
      const val = $('sNewPin').value.trim();
      s.pinHash = val ? await sha256Hex(val) : '';
      $('sNewPin').value = '';
      $('pinStatusText').textContent = s.pinHash ? 'PIN kilidi aktif' : 'PIN kilidi kapalı';
      scheduleSave(false);
      toast(s.pinHash ? 'PIN ayarlandı (yayına alınca geçerli olur)' : 'PIN kaldırıldı');
    };
  }

  /* ---------------- Tab 4: QR Kod & Yayına Hazır ZIP ---------------- */
  function renderQRCard() {
    const url = ($('qrUrlInput').value || 'https://kaan3113.github.io/zaman-makinesi/').trim();
    localStorage.setItem('zm-qr-url', url);
    const title = ($('qrCardTitle').value || 'ZAMAN MAKİNESİ ⏳').trim();
    const sub = ($('qrCardSub').value || 'Kamerayı okut ve sesi aç 🎧').trim();

    const cv = $('qrCardCanvas');
    const W = 680, H = 840;
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');

    const grad = c.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#090c2a');
    grad.addColorStop(0.55, '#13163d');
    grad.addColorStop(1, '#26143f');
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);

    // Stars
    c.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 65; i++) {
      const sx = ((i * 197) % (W - 40)) + 20;
      const sy = ((i * 313) % (H - 40)) + 20;
      const sr = (i % 3) * 0.7 + 0.7;
      c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.fill();
    }

    // Gold border
    c.strokeStyle = 'rgba(255, 211, 110, 0.48)';
    c.lineWidth = 3;
    c.strokeRect(24, 24, W - 48, H - 48);

    // Title
    c.fillStyle = '#ffd36e';
    c.font = 'bold 34px Georgia, serif';
    c.textAlign = 'center';
    c.fillText(title, W / 2, 110);

    c.fillStyle = 'rgba(255,255,255,0.78)';
    c.font = '600 20px sans-serif';
    c.fillText(content.settings.introQuestion || 'Kendini ilk tanıştığımız güne götürmeye hazır mısın?', W / 2, 152, W - 96);

    // Generate QR matrix with qrcode-generator
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const count = qr.getModuleCount();
    const qrBox = 380;
    const pad = 22;
    const cardX = (W - (qrBox + pad * 2)) / 2;
    const cardY = 200;

    c.save();
    c.shadowColor = 'rgba(255, 211, 110, 0.35)';
    c.shadowBlur = 32;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.roundRect(cardX, cardY, qrBox + pad * 2, qrBox + pad * 2, 28);
    c.fill();
    c.restore();

    const cell = qrBox / count;
    c.fillStyle = '#0c1030';
    for (let r = 0; r < count; r++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(r, col)) {
          c.fillRect(cardX + pad + col * cell, cardY + pad + r * cell, Math.ceil(cell), Math.ceil(cell));
        }
      }
    }

    c.fillStyle = '#ff9fc0';
    c.font = 'bold 24px sans-serif';
    c.fillText(sub, W / 2, 705);

    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.font = '500 16px monospace';
    c.fillText(url, W / 2, 760, W - 90);
  }

  async function uint8ToBase64(bytes) {
    const CHUNK = 0x8000;
    let bin = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  async function ghPutFile(repo, token, path, bytes, message) {
    const apiUrl = 'https://api.github.com/repos/' + repo + '/contents/' + path;
    const headers = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };
    let sha = undefined;
    try {
      const check = await fetch(apiUrl + '?ref=main&_=' + Date.now(), { headers });
      if (check.ok) {
        const info = await check.json();
        sha = info.sha;
      }
    } catch (e) {}

    const body = {
      message: message || ('Update ' + path),
      content: await uint8ToBase64(bytes),
      branch: 'main'
    };
    if (sha) body.sha = sha;

    const res = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(path + ': ' + (err.message || res.status));
    }
  }

  async function publishToGitHub() {
    const repo = ($('ghRepoInput').value || 'Kaan3113/zaman-makinesi').trim();
    const token = ($('ghTokenInput').value || '').trim();
    const status = $('ghPublishStatus');
    if (!token) {
      toast('Önce GitHub Token girmelisin');
      return;
    }
    localStorage.setItem('zm-gh-repo', repo);
    localStorage.setItem('zm-gh-token', token);

    const btn = $('publishGithubBtn');
    btn.disabled = true;
    status.textContent = 'Hazırlanıyor…';

    try {
      // 1) Sadece IndexedDB taslağında yeni eklenmiş medya dosyalarını yükle
      const mediaList = Store.mediaPaths(content);
      let uploadedCount = 0;
      for (const mPath of mediaList) {
        if (/^(blob:|data:|https?:)/.test(mPath)) continue;
        const blob = await Store.getMediaBlob(mPath);
        if (blob) {
          uploadedCount++;
          status.textContent = `Medya yükleniyor (${uploadedCount}): ${mPath}...`;
          await ghPutFile(repo, token, mPath, new Uint8Array(await blob.arrayBuffer()), 'Upload ' + mPath);
        }
      }

      // 2) Güncel content.json'u yükle
      status.textContent = 'content.json kaydediliyor...';
      const jsonBytes = new TextEncoder().encode(JSON.stringify(content, null, 2));
      await ghPutFile(repo, token, 'content.json', jsonBytes, 'Update content.json from Admin Panel');

      status.textContent = '✓ Yayınlandı! 30-60 sn içinde tüm cihazlarda görünür.';
      toast('GitHub\'a başarıyla yayınlandı!');
    } catch (err) {
      console.error(err);
      status.textContent = 'Hata: ' + err.message;
      toast('Yayınlama hatası: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function downloadFullZip() {
    const btn = $('downloadZipBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Paket hazırlanıyor…';
    try {
      const staticPaths = [
        'index.html',
        'admin.html',
        'favicon.svg',
        'netlify.toml',
        'css/site.css',
        'css/admin.css',
        'js/store.js',
        'js/audio.js',
        'js/world.js',
        'js/timemachine.js',
        'js/site.js',
        'js/admin.js',
        'js/zip.js',
        'js/vendor/qrcode.js'
      ];

      const files = [];
      for (const path of staticPaths) {
        const res = await fetch(path + '?v=' + Date.now(), { cache: 'no-store' });
        if (res.ok) {
          files.push({ path, data: new Uint8Array(await res.arrayBuffer()) });
        }
      }

      // Updated content.json
      const jsonStr = JSON.stringify(content, null, 2);
      files.push({ path: 'content.json', data: new TextEncoder().encode(jsonStr) });

      // Referenced media files (from IDB draft or server fallback)
      const mediaList = Store.mediaPaths(content);
      for (const mPath of mediaList) {
        if (/^(blob:|data:|https?:)/.test(mPath)) continue;
        let blob = await Store.getMediaBlob(mPath);
        if (!blob) {
          try {
            const res = await fetch(mPath + '?v=' + Date.now());
            if (res.ok) blob = await res.blob();
          } catch (e) { /* skip */ }
        }
        if (blob) {
          files.push({ path: mPath, data: new Uint8Array(await blob.arrayBuffer()) });
        }
      }

      const zipBlob = SimpleZip.buildZip(files);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = 'zaman-makinesi-site.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Site paketi (.zip) indirildi!');
    } catch (err) {
      console.error(err);
      toast('Paket oluşturulamadı: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  /* ---------------- Boot & PIN ---------------- */
  async function checkPin(c) {
    if (!c.settings.pinHash || sessionStorage.getItem('zm-pin-ok') === c.settings.pinHash) {
      $('pinOverlay').hidden = true;
      return true;
    }
    $('pinOverlay').hidden = false;
    return new Promise((resolve) => {
      $('pinUnlockBtn').onclick = async () => {
        const h = await sha256Hex($('pinInput').value.trim());
        if (h === c.settings.pinHash) {
          sessionStorage.setItem('zm-pin-ok', h);
          $('pinOverlay').hidden = true;
          resolve(true);
        } else {
          $('pinError').hidden = false;
        }
      };
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  async function boot() {
    content = await Store.load({ preview: true });
    await checkPin(content);

    bindTabs();
    renderPageList();
    renderPageEditor();
    renderTracks();
    bindAudioUpload();
    renderSettings();

    // Add page buttons
    $('addMemoryBtn').onclick = () => {
      content.pages.splice(Math.max(0, content.pages.length - 1), 0, {
        id: uid('p'),
        type: 'memory',
        date: '',
        dateLabel: 'Yeni Anı',
        title: 'Yeni Date / Anı',
        text: 'Buraya o güne ait hikayenizi yaz...',
        photos: [],
        trackId: '',
        musicStart: 0,
        palette: 'golden',
        particles: 'pollen',
        layout: 'polaroid'
      });
      selectedPageIdx = Math.max(0, content.pages.length - 2);
      renderPageList();
      renderPageEditor();
      scheduleSave(true);
      toast('Yeni anı sayfası eklendi');
    };

    $('addFinaleBtn').onclick = () => {
      content.pages.push({
        id: uid('p'),
        type: 'finale',
        date: '',
        dateLabel: 'Bugün',
        title: 'İyi ki doğdun sevgilim',
        text: 'Seni çok seviyorum.',
        photos: [],
        trackId: '',
        musicStart: 0,
        palette: 'night',
        particles: 'fireflies',
        layout: 'polaroid',
        showCounter: true
      });
      selectedPageIdx = content.pages.length - 1;
      renderPageList();
      renderPageEditor();
      scheduleSave(true);
      toast('Final sayfası eklendi');
    };

    // Top & Preview actions
    $('openFullPreviewBtn').onclick = () => window.open('index.html?preview=1', '_blank');
    $('previewIntroBtn').onclick = () => reloadPreview('intro');
    $('previewPageBtn').onclick = () => reloadPreview('page');

    $('mobilePreviewFab').onclick = () => $('previewPane').classList.add('mobile-open');
    $('closeMobilePreviewBtn').onclick = () => $('previewPane').classList.remove('mobile-open');

    // GitHub Publish actions
    $('ghRepoInput').value = localStorage.getItem('zm-gh-repo') || 'Kaan3113/zaman-makinesi';
    $('ghTokenInput').value = localStorage.getItem('zm-gh-token') || '';
    $('publishGithubBtn').onclick = publishToGitHub;

    // QR & Export actions
    $('qrUrlInput').value = localStorage.getItem('zm-qr-url') || 'https://kaan3113.github.io/zaman-makinesi/';
    ['qrUrlInput', 'qrCardTitle', 'qrCardSub'].forEach((id) => {
      $(id).oninput = renderQRCard;
    });
    $('downloadQrBtn').onclick = () => {
      renderQRCard();
      const a = document.createElement('a');
      a.download = 'zaman-makinesi-qr-kart.png';
      a.href = $('qrCardCanvas').toDataURL('image/png');
      a.click();
    };
    $('downloadZipBtn').onclick = downloadFullZip;
    $('downloadJsonBtn').onclick = () => {
      const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.download = 'content.json';
      a.href = URL.createObjectURL(blob);
      a.click();
    };
    $('resetDraftBtn').onclick = async () => {
      if (!confirm('Tarayıcıdaki taslak değişiklikler silinip son kayıtlı content.json verisine dönülsün mü?')) return;
      await Store.resetDraft();
      location.reload();
    };

    reloadPreview('page');
  }

  boot();
})();
