import * as THREE from 'three';

// Skin holder: palet warna buat armor VUZZ.
// unlock: 'free' (semua), 'wallet' (wallet connect), atau id tier dari CONFIG.tiers.

export const SKINS = [
  { id: 'unit7', name: 'Unit-7', unlock: 'free', primary: '#6d3df5', secondary: '#3b1f8f', accent: '#ff8a2a', emissive: '#b8ff3c' },
  { id: 'ember', name: 'Ember', unlock: 'free', primary: '#e0441c', secondary: '#5c1a0c', accent: '#ffd166', emissive: '#ffb347' },
  { id: 'glacier', name: 'Glacier', unlock: 'wallet', primary: '#dfe9f3', secondary: '#7f93a8', accent: '#2d9cdb', emissive: '#7fe3ff' },
  { id: 'midnight', name: 'Midnight', unlock: 'wallet', primary: '#15181f', secondary: '#0a0b0f', accent: '#6d3df5', emissive: '#b8ff3c' },
  { id: 'acid', name: 'Acid', unlock: 'spark', primary: '#b8ff3c', secondary: '#3d5a0a', accent: '#1d2027', emissive: '#ffffff' },
  { id: 'rosegold', name: 'Rose Gold', unlock: 'spark', primary: '#e8b4a0', secondary: '#8a5a4a', accent: '#f4d7c3', emissive: '#fff1e6' },
  { id: 'beacon', name: 'Beacon', unlock: 'beacon', primary: '#ffffff', secondary: '#c9c9d4', accent: '#ff8a2a', emissive: '#ffd27a' },
  { id: 'core', name: 'Core', unlock: 'core', primary: '#0b0d12', secondary: '#1d2027', accent: '#ff2e63', emissive: '#ff2e63' },
];

export function isUnlocked(skin, wallet, tiers) {
  if (skin.unlock === 'free') return true;
  if (!wallet?.isHolder) return false;
  if (skin.unlock === 'wallet') return true;
  const need = tiers.findIndex((t) => t.id === skin.unlock);
  const have = tiers.findIndex((t) => t.id === wallet.tier?.id);
  return have >= need;
}

// Fallback kalau robot belum punya setSkin(): recolor material yang warnanya dekat palet default.
const DEFAULTS = {
  primary: new THREE.Color('#6d3df5'),
  secondary: new THREE.Color('#3b1f8f'),
  accent: new THREE.Color('#ff8a2a'),
  emissive: new THREE.Color('#b8ff3c'),
};
const tagged = new WeakMap(); // material -> slot asal
function slotOf(mat) {
  if (tagged.has(mat)) return tagged.get(mat);
  let best = null, bd = 0.22;
  const c = mat.color;
  if (!c) { tagged.set(mat, null); return null; }
  for (const [slot, ref] of Object.entries(DEFAULTS)) {
    const d = Math.hypot(c.r - ref.r, c.g - ref.g, c.b - ref.b);
    if (d < bd) { bd = d; best = slot; }
  }
  // material emissive lime (mata, lampu) dikenali dari emissive-nya
  if (!best && mat.emissive && mat.emissiveIntensity > 0.2) {
    const e = mat.emissive, ref = DEFAULTS.emissive;
    if (Math.hypot(e.r - ref.r, e.g - ref.g, e.b - ref.b) < 0.22) best = 'emissive';
  }
  tagged.set(mat, best);
  return best;
}

export function applySkin(robot, skin) {
  if (typeof robot.setSkin === 'function') { robot.setSkin(skin); return; }
  robot.root.traverse((m) => {
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const slot = slotOf(mat);
      if (!slot) continue;
      const col = new THREE.Color(skin[slot]);
      if (slot === 'emissive') {
        if (mat.emissive) mat.emissive.copy(col);
        if (mat.color && mat.emissiveIntensity > 0.2) mat.color.copy(col);
      } else {
        mat.color.copy(col);
        if (mat.emissive && mat.emissiveIntensity > 0.2 && mat.emissiveIntensity < 1) mat.emissive.copy(col);
      }
      mat.needsUpdate = true;
    }
    if (m.isPointLight) m.color.set(skin.emissive);
  });
}
