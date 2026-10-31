import { CONFIG } from './config.js';

// Jumlah holder dari server/holders. Balikin angka, atau null kalau belum diset atau gagal.
export async function fetchHolders(url = CONFIG.token.holdersUrl) {
  if (!url || !CONFIG.token.address) return null;
  try {
    const u = new URL(url);
    u.searchParams.set('mint', CONFIG.token.address);
    u.searchParams.set('network', CONFIG.token.network || 'mainnet');
    const r = await fetch(u);
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.holders === 'number' ? d.holders : null;
  } catch {
    return null;
  }
}

// Ngecek tiap 5 menit, ngasih tau kalau dapet angka. Balikin fungsi buat berhenti.
export function pollHolders(onCount, ms = 5 * 60 * 1000) {
  const tick = async () => {
    const n = await fetchHolders();
    if (n !== null) onCount(n);
  };
  tick();
  const id = setInterval(tick, ms);
  return () => clearInterval(id);
}
