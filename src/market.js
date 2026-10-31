import { CONFIG } from './config.js';

// Market feed → mood dunia. Mood dipakai buat cuaca (world.setWeather) dan HUD.
// Sumber: CoinGecko simple price (24h change) atau DexScreener pair (h1/h24).
// Kalau config kosong atau fetch gagal: demo mode, mood muter pelan biar dunia tetep hidup.
//
// mood: 'storm' | 'rain' | 'cloudy' | 'clear' | 'golden'
// Override buat tes: ?mood=storm

const MOODS = ['storm', 'rain', 'cloudy', 'clear', 'golden'];

export function moodFromChange(pct) {
  if (pct <= -15) return 'storm';
  if (pct <= -4) return 'rain';
  if (pct < 4) return 'cloudy';
  if (pct < 15) return 'clear';
  return 'golden';
}

export function createMarket({ onChange = () => {} } = {}) {
  const params = new URLSearchParams(location.search);
  const override = params.get('mood');
  const state = {
    source: 'demo',  // demo | coingecko | dexscreener | override
    price: null,
    change24: null,
    change1h: null,
    mood: 'cloudy',
    intensity: 0.3,  // 0..1 seberapa kuat cuacanya
    updatedAt: 0,
  };
  let timer = null;

  function setFromChange(pct, src) {
    state.change24 = pct;
    state.mood = moodFromChange(pct);
    // intensitas: seberapa jauh dari ambang terdekat, clamp 0.25..1
    const a = Math.abs(pct);
    state.intensity = Math.min(1, Math.max(0.25, a / 20));
    state.source = src;
    state.updatedAt = Date.now();
    onChange({ ...state });
  }

  async function fetchCoingecko(id) {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`);
    if (!r.ok) throw new Error('coingecko ' + r.status);
    const j = await r.json();
    const d = j[id];
    if (!d) throw new Error('coingecko: id nggak ketemu');
    state.price = d.usd;
    setFromChange(d.usd_24h_change ?? 0, 'coingecko');
  }
  async function fetchDexscreener(pair) {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/pairs/${pair}`);
    if (!r.ok) throw new Error('dexscreener ' + r.status);
    const j = await r.json();
    const p = j.pair || j.pairs?.[0];
    if (!p) throw new Error('dexscreener: pair nggak ketemu');
    state.price = Number(p.priceUsd);
    state.change1h = p.priceChange?.h1 ?? null;
    setFromChange(p.priceChange?.h24 ?? 0, 'dexscreener');
  }

  // Demo: perubahan harga palsu yang bergeser pelan (periode ~20 menit), deterministik dari jam.
  function demoTick() {
    const t = Date.now() / 1000;
    const pct = Math.sin(t / 190) * 12 + Math.sin(t / 47) * 5 + Math.sin(t / 11) * 1.5;
    state.price = null;
    setFromChange(pct, 'demo');
  }

  async function poll() {
    if (override && MOODS.includes(override)) {
      state.mood = override; state.intensity = 0.8; state.source = 'override'; state.updatedAt = Date.now();
      onChange({ ...state });
      return;
    }
    const m = CONFIG.market;
    try {
      if (m.dexscreener) await fetchDexscreener(m.dexscreener);
      else if (m.coingeckoId) await fetchCoingecko(m.coingeckoId);
      else demoTick();
    } catch (e) {
      console.warn('[market]', e.message, '→ demo mode');
      demoTick();
    }
  }

  return {
    get state() { return { ...state }; },
    start() {
      poll();
      const every = (override ? 0 : CONFIG.market.coingeckoId || CONFIG.market.dexscreener) ? CONFIG.market.pollSeconds * 1000 : 20000;
      if (every) timer = setInterval(poll, every);
    },
    stop() { clearInterval(timer); },
    refresh: poll,
  };
}

export const MOOD_LABEL = {
  storm: 'Storm · market dumping',
  rain: 'Rain · market red',
  cloudy: 'Overcast · flat market',
  clear: 'Clear · market green',
  golden: 'Golden hour · market pumping',
};
