// Suara U-7 dan dunianya, semuanya disintesis di browser pakai Web Audio.
// Nggak ada file audio, jadi nggak ada masalah lisensi dan nggak nambah ukuran download.
//
// API:
//   const audio = createAudio();
//   audio.unlock();                       // panggil dari klik/tap pertama (autoplay policy)
//   audio.onState(next, prev);            // dipanggil tiap state robot ganti
//   audio.play('chime' | 'lamp' | 'plunk' | 'whoosh' | 'gulp' | ...);
//   audio.update({ dt, hour, state, moving, run, waterDist, surface, time });
//   audio.toggleMute() -> boolean muted

export function createAudio() {
  let ctx = null;
  let master, comp;
  let muted = false;
  let noiseBuf = null;
  const amb = {}; // loop ambience: wind, leaves, water, crickets
  const loops = {}; // loop per state: sleep hum
  let stepPhase = 0;
  let lastStep = 0;
  let nextBird = 0;
  let nextFrog = 0;
  let nextSleepBip = 0;

  try { muted = localStorage.getItem('u7-muted') === '1'; } catch {}

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = makeNoise(ctx, 2);
    buildAmbience();
    return true;
  }

  function makeNoise(ac, seconds) {
    const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      // pink-ish noise, lebih alami buat angin/air daripada white
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return buf;
  }

  function noiseSource(loop = true) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = loop;
    return s;
  }

  // ---- ambience loops: semua mulai dari gain 0, diatur di update() ----
  function ambLoop(filterType, freq, q = 1) {
    const src = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(master);
    src.start();
    return { src, f, g };
  }
  function buildAmbience() {
    amb.wind = ambLoop('lowpass', 260, 0.7);
    amb.leaves = ambLoop('bandpass', 2600, 0.8);
    amb.water = ambLoop('bandpass', 700, 0.9);
    // jangkrik: noise sempit di 4.2k dipulse LFO
    amb.crickets = ambLoop('bandpass', 4200, 18);
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 9;
    const lg = ctx.createGain(); lg.gain.value = 0.5;
    const off = ctx.createConstantSource(); off.offset.value = 0.5;
    const trem = ctx.createGain(); trem.gain.value = 0;
    lfo.connect(lg).connect(trem.gain); off.connect(trem.gain);
    amb.crickets.g.disconnect();
    amb.crickets.g.connect(trem).connect(master);
    lfo.start(); off.start();
    // angin punya "hembusan": LFO lambat ke frekuensi lowpass
    const wl = ctx.createOscillator(); wl.type = 'sine'; wl.frequency.value = 0.09;
    const wg = ctx.createGain(); wg.gain.value = 140;
    wl.connect(wg).connect(amb.wind.f.frequency); wl.start();
  }

  // ---- helper sintesis one-shot ----
  const now = () => ctx.currentTime;
  function env(g, t0, a, peak, d, sustainTo = 0.0001) {
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(sustainTo, t0 + a + d);
  }
  function tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.2, gain = 0.2, delay = 0, attack = 0.005, filter = null, pan = 0 }) {
    const t0 = now() + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain(); env(g, t0, attack, gain, dur);
    let node = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.type || 'lowpass'; f.frequency.value = filter.freq; f.Q.value = filter.q || 1; node.connect(f); node = f; }
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    node.connect(g).connect(p).connect(master);
    o.start(t0); o.stop(t0 + attack + dur + 0.05);
  }
  function burst({ dur = 0.1, gain = 0.2, delay = 0, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, attack = 0.003 }) {
    const t0 = now() + delay;
    const s = noiseSource(false);
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    const g = ctx.createGain(); env(g, t0, attack, gain, dur);
    s.connect(f).connect(g).connect(master);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + attack + dur + 0.05);
  }

  // ---- kamus suara ----
  const sounds = {
    // servo kecil tiap langkah + injakan sesuai permukaan
    step(surface, run) {
      const v = run ? 1.4 : 1;
      tone({ type: 'sawtooth', f0: 240, f1: 420, dur: 0.06, gain: 0.025 * v, filter: { type: 'lowpass', freq: 1800 } });
      if (surface === 'wood') {
        tone({ type: 'sine', f0: 160, f1: 70, dur: 0.12, gain: 0.16 * v });
        burst({ dur: 0.05, gain: 0.05 * v, f0: 900, q: 2 });
      } else if (surface === 'stone') {
        burst({ dur: 0.05, gain: 0.08 * v, type: 'highpass', f0: 2200 });
        tone({ type: 'triangle', f0: 400, f1: 180, dur: 0.05, gain: 0.05 * v });
      } else { // rumput / tanah
        burst({ dur: 0.09, gain: 0.07 * v, f0: 1400, f1: 500, q: 0.8 });
        tone({ type: 'sine', f0: 90, f1: 50, dur: 0.09, gain: 0.07 * v });
      }
    },
    // motor pelan waktu duduk / berdiri
    motor(up = false) {
      tone({ type: 'sawtooth', f0: up ? 80 : 130, f1: up ? 130 : 80, dur: 0.45, gain: 0.05, attack: 0.03, filter: { type: 'lowpass', freq: 600 } });
      tone({ type: 'square', f0: 260, f1: 240, dur: 0.4, gain: 0.012, attack: 0.03, filter: { type: 'lowpass', freq: 900 } });
    },
    gulp() {
      tone({ type: 'sine', f0: 190, f1: 95, dur: 0.11, gain: 0.12 });
      tone({ type: 'sine', f0: 210, f1: 100, dur: 0.11, gain: 0.1, delay: 0.22 });
      tone({ type: 'sine', f0: 170, f1: 90, dur: 0.12, gain: 0.08, delay: 0.45 });
    },
    yawn() {
      // desah yang naik lalu turun, pakai vibrato
      const t0 = now();
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(240, t0);
      o.frequency.linearRampToValueAtTime(360, t0 + 0.6);
      o.frequency.exponentialRampToValueAtTime(150, t0 + 1.5);
      const vib = ctx.createOscillator(); vib.frequency.value = 6;
      const vg = ctx.createGain(); vg.gain.value = 9;
      vib.connect(vg).connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = ctx.createGain(); env(g, t0, 0.25, 0.09, 1.3);
      o.connect(f).connect(g).connect(master);
      o.start(t0); vib.start(t0); o.stop(t0 + 1.7); vib.stop(t0 + 1.7);
      burst({ dur: 1.2, gain: 0.03, f0: 1200, f1: 600, attack: 0.3 });
    },
    sleepBip() {
      tone({ type: 'sine', f0: 820, dur: 0.08, gain: 0.02 });
    },
    curious() {
      tone({ type: 'square', f0: 620, dur: 0.08, gain: 0.04, filter: { type: 'lowpass', freq: 2400 } });
      tone({ type: 'square', f0: 880, f1: 980, dur: 0.14, gain: 0.04, delay: 0.12, filter: { type: 'lowpass', freq: 2400 } });
    },
    wave() {
      tone({ type: 'square', f0: 740, dur: 0.07, gain: 0.04, filter: { type: 'lowpass', freq: 2600 } });
      tone({ type: 'square', f0: 990, dur: 0.07, gain: 0.04, delay: 0.1, filter: { type: 'lowpass', freq: 2600 } });
      tone({ type: 'square', f0: 1240, dur: 0.12, gain: 0.04, delay: 0.2, filter: { type: 'lowpass', freq: 2600 } });
    },
    // sinyal ketemu: arpeggio terang + shimmer
    chime() {
      [880, 1109, 1319, 1760].forEach((f, i) => {
        tone({ type: 'sine', f0: f, dur: 0.9, gain: 0.12, delay: i * 0.09, pan: (i - 1.5) * 0.3 });
        tone({ type: 'triangle', f0: f * 2, dur: 0.5, gain: 0.02, delay: i * 0.09 });
      });
      burst({ dur: 0.6, gain: 0.03, type: 'highpass', f0: 5000, attack: 0.05 });
    },
    // lampu kota nyala: "tung" lonceng rendah + hum trafo sebentar
    lamp() {
      tone({ type: 'sine', f0: 196, dur: 1.6, gain: 0.18 });
      tone({ type: 'sine', f0: 392, dur: 1.0, gain: 0.06 });
      tone({ type: 'sine', f0: 587, dur: 0.6, gain: 0.03 });
      tone({ type: 'sawtooth', f0: 100, dur: 0.8, gain: 0.015, delay: 0.1, attack: 0.1, filter: { type: 'lowpass', freq: 300 } });
    },
    whoosh() {
      burst({ dur: 0.32, gain: 0.12, f0: 500, f1: 2400, q: 1.2, attack: 0.04 });
    },
    plunk() {
      tone({ type: 'sine', f0: 520, f1: 140, dur: 0.14, gain: 0.18 });
      burst({ dur: 0.35, gain: 0.14, f0: 1800, f1: 500, q: 0.7, attack: 0.01 });
      burst({ dur: 0.6, gain: 0.05, f0: 600, q: 0.5, delay: 0.08, attack: 0.1 });
    },
    bird() {
      const base = 2400 + Math.random() * 1200;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        tone({ type: 'sine', f0: base, f1: base * (1.25 + Math.random() * 0.3), dur: 0.08 + Math.random() * 0.06, gain: 0.025, delay: i * 0.13, pan: Math.random() * 1.4 - 0.7 });
      }
    },
    frog() {
      tone({ type: 'sawtooth', f0: 140, f1: 110, dur: 0.18, gain: 0.03, filter: { type: 'lowpass', freq: 500 }, pan: Math.random() * 1.2 - 0.6 });
      tone({ type: 'sawtooth', f0: 150, f1: 115, dur: 0.18, gain: 0.025, delay: 0.26, filter: { type: 'lowpass', freq: 500 } });
    },
    boot() {
      // sistem nyala pas intro: hum naik + 3 bip
      tone({ type: 'sawtooth', f0: 60, f1: 140, dur: 1.2, gain: 0.06, attack: 0.2, filter: { type: 'lowpass', freq: 500 } });
      [520, 660, 880].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.1, gain: 0.03, delay: 0.5 + i * 0.16, filter: { type: 'lowpass', freq: 3000 } }));
    },
  };

  function play(name, ...args) {
    if (!ctx || muted) return;
    if (ctx.state === 'suspended') ctx.resume();
    sounds[name]?.(...args);
  }

  // dengung tidur: loop pelan selama state sleep
  function setSleepHum(on) {
    if (on && !loops.sleep) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 52;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
      const g = ctx.createGain(); g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.045, now() + 1.5);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.25;
      const lg = ctx.createGain(); lg.gain.value = 0.015;
      lfo.connect(lg).connect(g.gain);
      o.connect(f).connect(g).connect(master);
      o.start(); lfo.start();
      loops.sleep = { o, lfo, g };
    } else if (!on && loops.sleep) {
      const { o, lfo, g } = loops.sleep;
      g.gain.cancelScheduledValues(now());
      g.gain.setValueAtTime(g.gain.value, now());
      g.gain.linearRampToValueAtTime(0, now() + 0.4);
      o.stop(now() + 0.5); lfo.stop(now() + 0.5);
      loops.sleep = null;
    }
  }

  const api = {
    get muted() { return muted; },
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('u7-muted', muted ? '1' : '0'); } catch {}
      if (ctx) master.gain.linearRampToValueAtTime(muted ? 0 : 0.8, now() + 0.15);
      return muted;
    },
    play,
    onState(next, prev) {
      if (!ctx) return;
      if (prev === 'sleep') setSleepHum(false);
      switch (next) {
        case 'sit': play('motor', false); break;
        case 'drink': play('gulp'); break;
        case 'yawn': play('yawn'); break;
        case 'sleep': setSleepHum(true); break;
        case 'throw': play('whoosh'); break;
        case 'curious': play('curious'); break;
        case 'wave': play('wave'); break;
        case 'idle': if (prev === 'sit' || prev === 'sleep') play('motor', true); break;
      }
    },
    // dipanggil tiap frame
    update({ dt, hour, state, moving, run, waterDist = 99, surface = 'grass', time = 0 }) {
      if (!ctx || muted) return;
      const elev = Math.sin(((hour - 6) / 12) * Math.PI);
      const day = Math.max(0, elev);
      const night = Math.min(1, Math.max(0, 1 - (elev + 0.15) * 3));
      const lerp = (g, v, k = 0.04) => { g.value += (v - g.value) * k; };
      const quiet = state === 'sleep' ? 0.6 : 1;
      lerp(amb.wind.g.gain, (0.05 + day * 0.035) * quiet);
      lerp(amb.leaves.g.gain, (0.012 + day * 0.012) * quiet);
      const waterK = Math.max(0, 1 - waterDist / 18);
      lerp(amb.water.g.gain, waterK * waterK * 0.16);
      lerp(amb.crickets.g.gain, night * 0.014);

      // burung pagi/siang, katak malam dekat air
      if (day > 0.1 && time > nextBird) { play('bird'); nextBird = time + 2 + Math.random() * 7 / (0.3 + day); }
      if (night > 0.4 && waterK > 0.2 && time > nextFrog) { play('frog'); nextFrog = time + 3 + Math.random() * 6; }

      // langkah: ikut frekuensi animasi kaki (7 Hz jalan, 11 lari), dua langkah per siklus
      if (moving && (state === 'walk' || state === 'run')) {
        const f = run ? 11 : 7;
        const phase = Math.floor((time * f) / Math.PI);
        if (phase !== stepPhase && time - lastStep > 0.12) { stepPhase = phase; lastStep = time; play('step', surface, run); }
      }
      if (state === 'sleep' && time > nextSleepBip) { play('sleepBip'); nextSleepBip = time + 2.6 + Math.random() * 1.2; }
    },
  };
  return api;
}
