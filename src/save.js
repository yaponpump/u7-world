// Progres pemain disimpan di browser (localStorage). Nanti bisa dipindah per wallet.
// Isi: sinyal yang udah ketemu, lampu kota, wajah pilihan, jam dunia, posisi terakhir,
// ending udah dilihat, dan misi harian hari ini.
const KEY = 'vuzz-save';

// Tanpa address: save utama. Dengan address: salinan per wallet di browser ini.
export function loadSave(address = null) {
  try {
    const raw = localStorage.getItem(address ? `${KEY}:${address}` : KEY);
    const d = raw ? JSON.parse(raw) : null;
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}

export function writeSave(data, address = null) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    if (address) localStorage.setItem(`${KEY}:${address}`, JSON.stringify(data));
    return true;
  } catch { return false; }
}

// Dipakai buat milih save mana yang lebih jauh progresnya
export function saveScore(d) {
  return (d.finaleDone ? 10 : 0) + (d.signals?.length || 0) + (d.quest?.gens?.length || 0) + (d.quest?.parts?.length || 0);
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch {}
}
