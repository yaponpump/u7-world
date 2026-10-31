// Progres pemain disimpan di browser (localStorage). Nanti bisa dipindah per wallet.
// Isi: sinyal yang udah ketemu, lampu kota, wajah pilihan, jam dunia, posisi terakhir,
// ending udah dilihat, dan misi harian hari ini.
const KEY = 'vuzz-save';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    const d = raw ? JSON.parse(raw) : null;
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}

export function writeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch {}
}
