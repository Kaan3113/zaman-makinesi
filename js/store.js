/* Store — içerik (content.json), taslak (IndexedDB) ve medya çözümleyici.
   Hem site hem yönetim paneli kullanır. */
(function (global) {
  'use strict';
  const DB_NAME = 'zaman-makinesi';
  const DB_VER = 1;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('media')) db.createObjectStore('media');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(store, mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      try { out = fn(s); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const idb = {
    get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
    put: (store, key, val) => tx(store, 'readwrite', (s) => { s.put(val, key); }),
    del: (store, key) => tx(store, 'readwrite', (s) => { s.delete(key); }),
    keys: (store) => tx(store, 'readonly', (s) => s.getAllKeys()),
    clear: (store) => tx(store, 'readwrite', (s) => { s.clear(); })
  };

  const blobUrls = new Map(); // path -> objectURL (yalnızca önizleme/yönetim)
  let useDraftMedia = false;

  async function fetchPublished() {
    const res = await fetch('content.json?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('content.json okunamadı (' + res.status + ')');
    return res.json();
  }

  function normalize(c) {
    c = c || {};
    c.version = 1;
    c.settings = Object.assign({
      siteTitle: 'Zaman Makinesi',
      introEyebrow: 'Sana özel bir yolculuk',
      introQuestion: 'Kendini ilk tanıştığımız güne götürmeye hazır mısın?',
      introButton: 'Hazırım',
      introHint: 'Sesi açmayı unutma',
      meetDate: '', sinceDate: '', herName: '',
      journeyCaptions: ['Zamanı geri sarıyoruz…', 'Biraz daha…', 'Geldik'],
      finaleCounterLabel: 'Birlikte geçirdiğimiz zaman',
      replayLabel: 'Baştan yaşa',
      pinHash: ''
    }, c.settings || {});
    c.tracks = Array.isArray(c.tracks) ? c.tracks : [];
    c.pages = Array.isArray(c.pages) ? c.pages : [];
    c.pages.forEach((p) => {
      p.photos = Array.isArray(p.photos) ? p.photos : [];
      p.type = p.type || 'memory';
      p.palette = p.palette || 'golden';
      p.particles = p.particles || 'pollen';
      p.layout = p.layout || 'polaroid';
      p.musicStart = Number(p.musicStart) || 0;
      if (p.trackId == null) p.trackId = '';
    });
    return c;
  }

  /** İçeriği yükle. preview=true ise önce taslağa (IndexedDB) bakar. */
  async function load(opts) {
    opts = opts || {};
    let content = null;
    if (opts.preview) {
      try { content = await idb.get('kv', 'draft'); } catch (e) { /* yok say */ }
      useDraftMedia = true;
    }
    if (!content) content = await fetchPublished();
    content = normalize(content);
    if (useDraftMedia) await preloadMedia(content);
    return content;
  }

  function mediaPaths(content) {
    const set = new Set();
    content.tracks.forEach((t) => t.file && set.add(t.file));
    content.pages.forEach((p) => p.photos.forEach((ph) => ph.src && set.add(ph.src)));
    return [...set];
  }

  async function preloadMedia(content) {
    for (const path of mediaPaths(content)) {
      if (blobUrls.has(path)) continue;
      try {
        const rec = await idb.get('media', path);
        if (rec && rec.blob) blobUrls.set(path, URL.createObjectURL(rec.blob));
      } catch (e) { /* yok say */ }
    }
  }

  function url(path) {
    if (!path) return '';
    if (/^(blob:|data:|https?:)/.test(path)) return path;
    return blobUrls.get(path) || path;
  }

  async function saveDraft(content) {
    await idb.put('kv', 'draft', JSON.parse(JSON.stringify(content)));
  }

  async function putMedia(path, blob, meta) {
    await idb.put('media', path, { blob, type: blob.type, name: (meta && meta.name) || '', size: blob.size });
    if (blobUrls.has(path)) URL.revokeObjectURL(blobUrls.get(path));
    blobUrls.set(path, URL.createObjectURL(blob));
  }

  async function getMediaBlob(path) {
    try {
      const rec = await idb.get('media', path);
      if (rec && rec.blob) return rec.blob;
    } catch (e) { /* yok say */ }
    return null;
  }

  async function resetDraft() {
    await idb.clear('kv');
    await idb.clear('media');
    blobUrls.forEach((u) => URL.revokeObjectURL(u));
    blobUrls.clear();
  }

  global.Store = { load, normalize, url, saveDraft, putMedia, getMediaBlob, resetDraft, mediaPaths, fetchPublished, idb, preloadMedia };
})(window);
