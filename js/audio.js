/* Music — sayfaya özel şarkılar (mobil/iOS uyumlu <audio> çapraz geçiş) + zaman makinesi ses efektleri (WebAudio) */
(function (global) {
  'use strict';
  const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

  let ctx = null, sfxBus = null;
  let channels = [makeChannel(), makeChannel()];
  let active = -1;
  let current = null;
  let pending = null;
  let muted = false;
  let unlocked = false;
  let wasPlaying = false;
  let onBlocked = null;
  const MUSIC_VOL = 0.85;

  function makeChannel() {
    const el = new Audio();
    el.preload = 'auto';
    el.loop = false;
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    const ch = { el, start: 0, fading: null, targetVol: 0 };
    el.addEventListener('ended', () => {
      try {
        el.currentTime = ch.start || 0;
        el.play().catch(() => {});
      } catch (e) {}
    });
    return ch;
  }

  function unlock() {
    // 1) WebAudio SFX kilidini aç
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!ctx && AC) {
        ctx = new AC();
        sfxBus = ctx.createGain();
        sfxBus.gain.value = muted ? 0 : 0.9;
        sfxBus.connect(ctx.destination);
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
    } catch (e) {}

    // 2) Her iki <audio> kanalını kullanıcı dokunuşu içinde senkron olarak aç (iOS/Android için şart)
    if (!unlocked) {
      channels.forEach((ch) => {
        try {
          if (!ch.el.src) ch.el.src = SILENT_WAV;
          ch.el.volume = 0;
          const p = ch.el.play();
          if (p && p.then) {
            p.then(() => {
              if (channels[active] !== ch) {
                ch.el.pause();
                ch.el.currentTime = 0;
              }
            }).catch(() => {});
          }
        } catch (e) {}
      });
      unlocked = true;
    }

    if (pending) {
      const p = pending;
      pending = null;
      play(p.url, p.id, p.opts);
    }
    return true;
  }

  function ramp(ch, to, dur) {
    clearInterval(ch.fading);
    ch.targetVol = to;
    const steps = 24;
    const v0 = ch.el.volume;
    const d = (to - v0) / steps;
    let i = 0;
    ch.fading = setInterval(() => {
      i++;
      try {
        ch.el.volume = Math.max(0, Math.min(1, v0 + d * i));
      } catch (e) {
        // iOS Safari'de volume salt okunur olabilir, sessizce geç
        clearInterval(ch.fading);
      }
      if (i >= steps) clearInterval(ch.fading);
    }, Math.max(20, ((dur || 1.2) * 1000) / steps));
  }

  function play(url, id, opts) {
    opts = opts || {};
    if (!url) return;
    const start = Math.max(0, Number(opts.start) || 0);
    if (!unlocked) {
      pending = { url, id, opts };
      return;
    }
    if (current && current.id === id && current.start === start && active >= 0 && !channels[active].el.paused) return;

    const old = active >= 0 ? channels[active] : null;
    const next = channels[active === 0 ? 1 : 0];
    const idx = channels.indexOf(next);

    clearInterval(next.fading);
    next.start = start;
    next.el.muted = muted;
    next.el.src = url;
    try { next.el.volume = 0.01; } catch (e) {}

    const begin = () => {
      try { if (start > 0) next.el.currentTime = start; } catch (e) {}
      const pr = next.el.play();
      if (pr && pr.catch) {
        pr.catch(() => {
          if (typeof onBlocked === 'function') onBlocked();
        });
      }
    };

    if (next.el.readyState >= 1) begin();
    else next.el.addEventListener('loadedmetadata', begin, { once: true });

    ramp(next, MUSIC_VOL, opts.fade || 1.6);

    if (old && old !== next) {
      ramp(old, 0, opts.fade || 1.4);
      setTimeout(() => {
        if (active !== channels.indexOf(old)) {
          try { old.el.pause(); } catch (e) {}
        }
      }, ((opts.fade || 1.4) * 1000) + 120);
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
    setTimeout(() => {
      if (active === a || active === -1) {
        try { ch.el.pause(); } catch (e) {}
      }
    }, ((fade || 1.2) * 1000) + 100);
    active = -1;
    current = null;
    wasPlaying = false;
  }

  function setMuted(m) {
    muted = !!m;
    channels.forEach((c) => { c.el.muted = muted; });
    if (sfxBus && ctx) {
      const t = ctx.currentTime;
      sfxBus.gain.cancelScheduledValues(t);
      sfxBus.gain.setValueAtTime(sfxBus.gain.value, t);
      sfxBus.gain.linearRampToValueAtTime(muted ? 0 : 0.9, t + 0.2);
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
    powerUp(dur) {
      if (!ctx || !sfxBus) return;
      const t = ctx.currentTime, d = dur || 2.6;
      const out = ctx.createGain(); out.gain.value = 0; out.connect(sfxBus);
      out.gain.linearRampToValueAtTime(0.45, t + d * 0.7);
      out.gain.linearRampToValueAtTime(0, t + d + 0.8);
      [55, 82.4, 110].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = i === 0 ? 'sawtooth' : 'sine';
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 3.2, t + d);
        const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(260, t); fl.frequency.exponentialRampToValueAtTime(2600, t + d);
        o.connect(fl).connect(out); o.start(t); o.stop(t + d + 1);
      });
    },
    whoosh(dur, peak) {
      if (!ctx || !sfxBus) return;
      const t = ctx.currentTime, d = dur || 1.6;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(d + 0.5);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(peak || 3400, t + d);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + d * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.4);
      src.connect(bp).connect(g).connect(sfxBus); src.start(t); src.stop(t + d + 0.6);
    },
    tick(vol) {
      if (!ctx || !sfxBus) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1800;
      const g = ctx.createGain(); g.gain.setValueAtTime((vol || 0.05), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(sfxBus); o.start(t); o.stop(t + 0.06);
    },
    arrive() {
      if (!ctx || !sfxBus) return;
      const t = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx.createGain(); const s = t + i * 0.11;
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.2, s + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 2.2);
        o.connect(g).connect(sfxBus); o.start(s); o.stop(s + 2.4);
      });
    },
    page() {
      if (!ctx || !sfxBus) return;
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
    setOnBlocked(fn) { onBlocked = fn; },
    get unlocked() { return unlocked; },
    get muted() { return muted; },
    get currentTime() { return active >= 0 ? channels[active].el.currentTime : 0; }
  };
})(window);
