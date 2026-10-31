// Tiap wallet punya satu jendela tetap di kota, dihitung dari alamatnya.
// Nggak butuh server: wallet yang sama selalu dapet jendela yang sama, di device mana pun.
function hash(text) {
  let h = 2166136261;
  for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const CELL_W = 3, CELL_H = 3.3; // ukuran grid jendela di shader gedung

export function windowFor(address, buildings) {
  // Cuma gedung yang mukanya ngadep jalan, biar jendelanya bisa dilihat dari bawah
  const street = buildings.filter((b) => b.z < 60 || (b.z > 80 && b.z < 86));
  const h = hash(address);
  const b = street[h % street.length];
  const cols = Math.max(1, Math.floor(b.w / CELL_W));
  const rows = Math.max(1, Math.min(4, Math.floor(b.h / CELL_H) - 1));
  const col = (h >>> 8) % cols, row = 1 + (h >>> 16) % rows;
  return { x: b.x + b.w - (col + 0.5) * CELL_W, y: (row + 0.52) * CELL_H, z: b.z - 0.04, floor: row + 1 };
}
