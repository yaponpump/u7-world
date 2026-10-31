import * as THREE from 'three';

// Misi harian: tiap hari (UTC) 3 peti suplai muncul di titik yang beda, dipilih dari daftar
// titik aman di map. Seed dari tanggal, jadi semua pemain dapet titik yang sama di hari itu.
export function dayKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function seeded(key) {
  let h = 2166136261;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

export function pickSpots(spots, key, count = 3) {
  const rnd = seeded(key);
  const pool = spots.slice();
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

export function createDaily(scene, { spots, key = dayKey(), taken = [], groundHeight = () => 0 }) {
  const group = new THREE.Group();
  scene.add(group);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a2a6a, roughness: 0.6, metalness: 0.3 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xb8ff3c, emissive: 0xb8ff3c, emissiveIntensity: 2.2, toneMapped: false });
  const items = pickSpots(spots, key).map((sp, i) => {
    const id = `${key}-${i}`;
    const m = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), bodyMat);
    box.castShadow = true;
    m.add(box);
    // garis hijau di rusuk peti
    for (const [ax, ay] of [[0, 0], [0, Math.PI / 2], [Math.PI / 2, 0]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.035, 6, 4), glowMat);
      ring.rotation.set(ax, ay, Math.PI / 4);
      m.add(ring);
    }
    const y = groundHeight(sp.x, sp.z);
    m.position.set(sp.x, y + 0.6, sp.z);
    const isTaken = taken.includes(id);
    m.visible = !isTaken;
    group.add(m);
    return { id, x: sp.x, z: sp.z, baseY: y + 0.6, label: sp.label || 'somewhere', taken: isTaken, mesh: m };
  });

  return {
    key,
    items,
    get found() { return items.filter((i) => i.taken).length; },
    get done() { return items.length > 0 && items.every((i) => i.taken); },
    update(elapsed) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.taken) continue;
        it.mesh.position.y = it.baseY + Math.sin(elapsed * 2 + i) * 0.12;
        it.mesh.rotation.y = elapsed * 0.8 + i;
      }
    },
    // ambil peti terdekat dalam radius; balikin item atau null
    collectNear(x, z, r = 1.7) {
      for (const it of items) {
        if (it.taken) continue;
        if (Math.hypot(it.x - x, it.z - z) < r) { it.taken = true; it.mesh.visible = false; return it; }
      }
      return null;
    },
    dispose() { scene.remove(group); },
  };
}

// Titik cadangan kalau dunia belum nyediain WORLD.dailySpots
export function defaultSpots(WORLD) {
  const l = WORLD.lake, h = WORLD.hill, c = WORLD.cafe, p = WORLD.park;
  return [
    { x: h.x, z: h.z, label: 'top of the hill' },
    { x: c.x + 4, z: c.z - 4, label: 'behind the cafe' },
    { x: p.x, z: p.z - 14, label: 'north edge of the park' },
    { x: p.x + 16, z: p.z + 10, label: 'east side of the park' },
    { x: l.x + l.r + 3, z: l.z + 6, label: 'east shore of the lake' },
    { x: l.x - 6, z: l.z - l.r - 3, label: 'north shore of the lake' },
    { x: -12, z: -20, label: 'past the main bridge' },
    { x: -40, z: -48, label: 'by the upstream bridge' },
    { x: 20, z: 38, label: 'the road into the city' },
    { x: 60, z: 90, label: 'deep in the city' },
    { x: 100, z: 60, label: 'the east end of the city' },
    { x: 70, z: -20, label: 'the far east field' },
  ];
}
