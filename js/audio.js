/* Music — sayfaya özel şarkılar (çapraz geçişli) + zaman makinesi ses efektleri (WebAudio) */
(function (global) {
  'use strict';
  let ctx = null, master = null, sfxBus = null, musicBus = null;
  let channels = [];
  let active = -1;            // şu an çalan kanal
  let current = null;         // {id, start}
  let pending = null;         // kullanıcı etkileşimi öncesi istenen parça
  let muted = false;
  let unlocked = false;
  let wasPlaying = false;
  const MUSIC_VOL = 0.85;

  function makeChannel() {
    const el = new Audio();
    el.preload = 'auto';
    el.loop = false;
    el.setAttribute('playsinline', '');
    const ch = { el, gain: null, node: null, start: 0, fading: null };
    try {
      ch.node = ctx.createMediaElementSource(el);
      ch.gain = ctx.createGain();
      ch.gain.gain.value = 0;
      ch.node.connect(ch.gain).connect(musicBus);
    } catch (e) { ch.gain = null; }
    el.addEventListener('ended', () => {            // başlangıç saniyesine dönerek döngü
      try { el.currentTime = ch.start || 0; el.play().catch(() => {}); } catch (e) {}
    });
    return ch;
  }

  function unlock() {
    if (unlocked) { if (ctx && ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      channels = [makeChannel(), makeChannel()];
      if (ctx.state === 'suspended') ctx.resume();
      unlocked = true;
    } catch (e) {
      // WebAudio yoksa düz <audio> ile devam et
      ctx = null;
      channels = [{ el: new Audio(), gain: null, start: 0 }, { el: new Audio(), gain: null, start: 0 }];
      channels.forEach((ch) => ch.el.addEventListener('ended', () => { ch.el.currentTime = ch.start || 0; ch.el.play().catch(() => {}); }));
      unlocked = true;
    }
    if (pending) { const p = pending; pending = null; play(p.url, p.id, p.opts); }
    return true;
  }

  function ramp(ch, to, dur) {
    if (ch.gain && ctx) {
      const g = ch.gain.gain, t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(to, t + dur);
    } else {
      // WebAudio yok: elle ses yükseltme/azaltma
      clearInterval(ch.fading);
      const steps = 20, v0 = ch.el.volume, d = (to - v0) / steps;
      let i = 0;
      ch.fading = setInterval(() => {
        i++; ch.el.volume = Math.max(0, Math.min(1, v0 + d * i));
        if (i >= steps) clearInterval(ch.fading);
      }, (dur * 1000) / steps);
    }
  }

  function play(url, id, opts) {
    opts = opts || {};
    const start = Math.max(0, Number(opts.start) || 0);
    if (!unlocked) { pending = { url, id, opts }; return; }
    if (current && current.id === id && current.start === start && active >= 0 && !channels[active].el.paused) return;
    const old = active >= 0 ? channels[active] : null;
    const next = channels[active === 0 ? 1 : 0];
    const idx = channels.indexOf(next);
    next.start = start;
    next.el.src = url;
    const begin = () => {
      try { if (start > 0) next.el.currentTime = start; } catch (e) {}
      next.el.play().then(() => {}, () => {});
    };
    if (next.el.readyState >= 1) begin();
    else next.el.addEventListener('loadedmetadata', begin, { once: true });
    if (!next.gain) next.el.volume = 0;
    ramp(next, 1, opts.fade || 1.6);
    if (old) {
      ramp(old, 0, opts.fade || 1.6);
      setTimeout(() => { if (active !== channels.indexOf(old)) { try { old.el.pause(); } catch (e) {} } }, ((opts.fade || 1.6) * 1000) + 120);
    }
    active = idx;
    current = { id, start };
    wasPlaying = true;
  }

  function stop(fade) {
    pending = null;
    if (active < 0) return;
    const ch = channels[active];
    ramp(ch, 0, fade || 1.2);
    const a = active;
    setTimeout(() => { if (active === a || active === -1) { try { ch.el.pause(); } catch (e) {} } }, ((fade || 1.2) * 1000) + 100);
    active = -1; current = null; wasPlaying = false;
  }

  function setMuted(m) {
    muted = !!m;
    if (master && ctx) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(muted ? 0 : 1, t + 0.25);
    } else {
      channels.forEach((c) => { c.el.muted = muted; });
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!unlocked) return;
    if (document.hidden) {
      channels.forEach((c) => { try { c.el.pause(); } catch (e) {} });
      if (ctx && ctx.state === 'running') ctx.suspend();
    } else {
      if (ctx && ctx.state === 'suspended') ctx.resume();
      if (wasPlaying && active >= 0) channels[active].el.play().catch(() => {});
    }
  });

  /* ---------- Ses efektleri (sentez) ---------- */
  function noiseBuffer(sec) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  const sfx = {
    /** Makine çalışıyor: alçak uğultu, yükselen ton */
    powerUp(dur) {
      if (!ctx) return;
      const t = ctx.currentTime, d = dur || 2.6;
      const out = ctx.createGain(); out.gain.value = 0; out.connect(sfxBus);
      out.gain.linearRampToValueAtTime(0.5, t + d * 0.7);
      out.gain.linearRampToValueAtTime(0, t + d + 0.8);
      [55, 82.4, 110].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = i === 0 ? 'sawtooth' : 'sine';
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 3.2, t + d);
        const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(260, t); fl.frequency.exponentialRampToValueAtTime(2600, t + d);
        o.connect(fl).connect(out); o.start(t); o.stop(t + d + 1);
      });
    },
    /** Kapı açılırken hava/ışık sesi */
    whoosh(dur, peak) {
      if (!ctx) return;
      const t = ctx.currentTime, d = dur || 1.6;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(d + 0.5);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(peak || 3400, t + d);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.55, t + d * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.4);
      src.connect(bp).connect(g).connect(sfxBus); src.start(t); src.stop(t + d + 0.6);
    },
    /** Geri sayım tiktak */
    tick(vol) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1800;
      const g = ctx.createGain(); g.gain.setValueAtTime((vol || 0.05), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(sfxBus); o.start(t); o.stop(t + 0.06);
    },
    /** Vardık: parıltılı çan */
    arrive() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx.createGain(); const s = t + i * 0.11;
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.22, s + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 2.2);
        o.connect(g).connect(sfxBus); o.start(s); o.stop(s + 2.4);
      });
    },
    /** Sayfa geçişi: yumuşak "pırıl" */
    page() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [880, 1318.5].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = ctx.createGain(); const s = t + i * 0.06;
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.07, s + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.7);
        o.connect(g).connect(sfxBus); o.start(s); o.stop(s + 0.8);
      });
    }
  };

  global.Music = {
    unlock, play, stop, setMuted, sfx,
    get unlocked() { return unlocked; },
    get muted() { return muted; },
    get currentTime() { return active >= 0 ? channels[active].el.currentTime : 0; }
  };
})(window);
