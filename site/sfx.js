// Suara robot di website: bunyi beep kecil (WebAudio) + ngomong pendek (speechSynthesis).
// Browser baru ngizinin suara setelah klik/tekan tombol pertama, jadi semuanya nunggu itu.
import { voice } from '../src/voice.js';

const KEY = '7pod-sound';
let ctx = null, master = null, unlocked = false;
let on = true;
try { on = localStorage.getItem(KEY) !== 'off'; } catch { /* storage diblok, pakai default */ }
const listeners = new Set();

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.22; master.connect(ctx.destination);
  return ctx;
}

// satu nada pendek dengan glide frekuensi
function tone(f0, f1, start, dur, type = 'square', vol = 1) {
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + start;
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

const SOUNDS = {
  hi: () => { tone(520, 880, 0, 0.12); tone(700, 1200, 0.14, 0.16); },
  happy: () => [660, 830, 990, 1320].forEach((f, i) => tone(f, f * 1.02, i * 0.07, 0.09, 'triangle')),
  hop: () => tone(220, 900, 0, 0.22, 'sine', 1.2),
  surprised: () => { tone(400, 1600, 0, 0.28, 'sine', 1.1); tone(1600, 1500, 0.28, 0.08, 'sine', 0.6); },
  think: () => { tone(300, 260, 0, 0.16, 'triangle'); tone(260, 300, 0.22, 0.18, 'triangle'); },
  look: () => { tone(900, 700, 0, 0.07); tone(700, 900, 0.16, 0.07); tone(900, 700, 0.32, 0.07); },
  dance: () => [523, 659, 784, 659, 523, 784].forEach((f, i) => tone(f, f, i * 0.11, 0.08, 'square', 0.7)),
  blip: () => tone(1200, 1500, 0, 0.05, 'square', 0.6),
};

export const sfx = {
  get on() { return on; },
  get ready() { return unlocked && on; },
  set(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* abaikan */ }
    if (!on) voice.stop();
    if (on && ensure()?.state === 'suspended') ctx.resume();
    listeners.forEach((fn) => fn(on));
  },
  onChange(fn) { listeners.add(fn); fn(on); },
  play(name) {
    if (!unlocked || !on || !ensure() || !SOUNDS[name]) return;
    if (ctx.state === 'suspended') ctx.resume();
    SOUNDS[name]();
  },
  say(text) {
    if (!unlocked || !on || !voice.supported) return;
    voice.speak('Pod', text, { volume: 0.9 });
  },
};

// buka kunci suara di interaksi pertama
const unlock = () => {
  if (unlocked) return;
  unlocked = true;
  if (ensure()?.state === 'suspended') ctx.resume();
  removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock);
};
addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
