// Suara robot kota: text-to-speech bawaan browser, tiap robot punya nada dan kecepatan sendiri.
// Satu robot ngomong dalam satu waktu. Nggak ada server dan nggak ada biaya.
const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
let voices = [];
function loadVoices() { if (synth) voices = synth.getVoices().filter((v) => /^en/i.test(v.lang)); }
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// Profil per nama: nada, kecepatan, dan pilihan suara biar tiap robot kedengeran beda
export function profileFor(name) {
  const h = hash(name);
  return { pitch: 0.55 + ((h % 11) / 10) * 1.1, rate: 0.9 + ((h >> 4) % 4) * 0.08, voiceIdx: (h >> 8) % Math.max(1, voices.length) };
}

// suara bahasa Inggris paling natural yang tersedia di browser ini
const PREFER = [/natural/i, /neural/i, /google us english/i, /aria|jenny|guy/i, /samantha/i, /google uk english female/i, /en-us/i];
function clearVoice() {
  for (const re of PREFER) { const v = voices.find((x) => re.test(x.name) || re.test(x.lang)); if (v) return v; }
  return voices[0] || null;
}

let current = null;
export const voice = {
  get supported() { return !!synth; },
  // volume 0..1, biasanya ngikut jarak ke 7POD
  // `clear: true` = suara paling jelas yang ada (dipakai robot 7POD di website)
  speak(name, text, { volume = 1, clear = false } = {}) {
    if (!synth || volume <= 0.02) return;
    if (!voices.length) loadVoices();
    const p = profileFor(name);
    const u = new SpeechSynthesisUtterance(text.replace(/\$?7POD/g, 'Seven Pod'));
    u.volume = Math.min(1, volume);
    if (clear) {
      u.pitch = 1.15; u.rate = 0.92;
      const v = clearVoice(); if (v) u.voice = v;
    } else {
      u.pitch = p.pitch; u.rate = p.rate;
      if (voices.length) u.voice = voices[p.voiceIdx];
    }
    synth.cancel();
    current = u;
    synth.speak(u);
  },
  stop() { if (synth) synth.cancel(); current = null; },
};
