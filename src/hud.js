// Tampilan tombol aksi ala Astro Bot: tiap tombol "KEY · Label" dipecah jadi kotak tombol (kbd) + label.
// main.js tetap nulis textContent biasa; di sini cuma diformat ulang tiap teksnya berubah.
const KEY_NAMES = { ' ': 'Space', Space: 'Space' };
function format(btn) {
  if (btn.dataset.fmt === btn.textContent) return;
  const raw = btn.textContent.trim();
  const m = raw.match(/^([^·]+?)\s*·\s*(.+)$/);
  if (!m) return;
  const key = KEY_NAMES[m[1].trim()] || m[1].trim();
  btn.innerHTML = `<kbd>${key}</kbd><span>${m[2].trim()}</span>`;
  btn.dataset.fmt = btn.textContent;
}
function watch(btn) {
  format(btn);
  new MutationObserver(() => format(btn)).observe(btn, { childList: true, characterData: true, subtree: true });
}
document.querySelectorAll('.actions .btn, #face-btn').forEach(watch);

// Hint bawaan (WASD ...) diganti legenda gerak yang rapi; hint kontekstual tetap tampil sebagai pesan.
const hint = document.getElementById('hint');
const legend = document.getElementById('legend');
function syncHint() {
  const generic = /^WASD move/.test(hint.textContent);
  hint.classList.toggle('generic', generic);
  if (legend) legend.hidden = !generic;
}
syncHint();
new MutationObserver(syncHint).observe(hint, { childList: true, characterData: true, subtree: true });
