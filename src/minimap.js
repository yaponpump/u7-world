import * as THREE from 'three';
import { WORLD, riverCurve, groundHeight } from './world.js';
import { BUILDINGS, CITY } from './city.js';

// Minimap (canvas 2D) + label lokasi di layar, biar jelas ada apa di map dan arah mau ke mana.
// Klik minimap buat ganti zoom (sekitar robot) / full map.

const COL = {
  ground: '#2b4a27', park: '#3d6b35', hill: '#5a7a3a', path: '#b9a98a', water: '#2f6f9c',
  wood: '#8a6a44', cafe: '#ff8a2a', city: '#2a2c31', building: '#4a4d55', skyline: '#1a1b1f',
  robot: '#b8ff3c', signal: '#b8ff3c', text: 'rgba(244,242,255,0.9)',
};

export function defaultLandmarks() {
  const c = { x: (CITY.x0 + CITY.x1) / 2, z: (CITY.z0 + 100) / 2 };
  return [
    { id: 'park', name: 'Park', x: WORLD.park.x, z: WORLD.park.z, kind: 'park' },
    { id: 'lake', name: 'Lake', x: WORLD.lake.x, z: WORLD.lake.z, kind: 'water' },
    { id: 'pier', name: 'Pier', x: WORLD.pier.x, z: WORLD.pier.z, kind: 'wood' },
    { id: 'hill', name: 'Hill', x: WORLD.hill.x, z: WORLD.hill.z, kind: 'hill' },
    { id: 'cafe', name: 'Cafe', x: WORLD.cafe.x, z: WORLD.cafe.z, kind: 'cafe' },
    { id: 'bridge', name: 'Bridge', x: WORLD.bridge.x, z: WORLD.bridge.z, kind: 'wood' },
    { id: 'city', name: 'City', x: c.x, z: c.z, kind: 'city' },
  ];
}

export function createMinimap({ canvas, labelsEl, objectiveEl = null }) {
  const SIZE = 176;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = SIZE * dpr; canvas.height = SIZE * dpr;
  canvas.style.width = canvas.style.height = SIZE + 'px';
  const ctx = canvas.getContext('2d');

  // peta statis: 2 px per unit dunia, rentang -110..130
  const PPU = 2, MIN = -110, MAX = 130, EXT = MAX - MIN;
  const stat = document.createElement('canvas');
  stat.width = stat.height = EXT * PPU;
  const sc = stat.getContext('2d');
  const W = (x) => (x - MIN) * PPU;
  const landmarks = () => (WORLD.landmarks?.length ? WORLD.landmarks : defaultLandmarks()).filter((l) => !l.minor);

  function drawStatic() {
    sc.fillStyle = COL.ground; sc.fillRect(0, 0, stat.width, stat.height);
    // bukit
    const h = WORLD.hill;
    const g = sc.createRadialGradient(W(h.x), W(h.z), 0, W(h.x), W(h.z), h.r * PPU);
    g.addColorStop(0, '#7a9a4a'); g.addColorStop(1, COL.ground);
    sc.fillStyle = g; sc.beginPath(); sc.arc(W(h.x), W(h.z), h.r * PPU, 0, Math.PI * 2); sc.fill();
    // taman
    sc.fillStyle = COL.park; sc.beginPath(); sc.arc(W(WORLD.park.x), W(WORLD.park.z), WORLD.park.r * PPU, 0, Math.PI * 2); sc.fill();
    // kota
    sc.fillStyle = COL.city; sc.fillRect(W(CITY.x0), W(CITY.z0), (CITY.x1 - CITY.x0) * PPU, (CITY.z1 - CITY.z0) * PPU);
    sc.fillStyle = COL.building;
    for (const b of BUILDINGS) sc.fillRect(W(b.x), W(b.z), b.w * PPU, b.d * PPU);
    sc.fillStyle = COL.skyline; sc.fillRect(W(-26), W(106), 152 * PPU, 12 * PPU);
    // jalur setapak
    sc.strokeStyle = COL.path; sc.lineWidth = 2.6 * PPU; sc.lineCap = 'round';
    const P = WORLD.park;
    sc.beginPath();
    sc.moveTo(W(P.x), W(P.z)); sc.lineTo(W(WORLD.cafe.x), W(P.z));            // ke kafe
    sc.moveTo(W(P.x), W(P.z)); sc.lineTo(W(P.x), W(-30));                      // ke bukit
    sc.moveTo(W(WORLD.pier.x), W(22)); sc.lineTo(W(P.x), W(22));               // ke danau
    sc.moveTo(W(P.x), W(P.z + P.r)); sc.lineTo(W(P.x), W(CITY.z0 + 2));        // ke kota
    sc.stroke();
    sc.beginPath(); sc.arc(W(P.x), W(P.z), (P.r - 1.3) * PPU, 0, Math.PI * 2); sc.lineWidth = 2 * PPU; sc.stroke();
    // sungai
    sc.strokeStyle = COL.water; sc.lineWidth = 6.4 * PPU; sc.lineJoin = 'round';
    const pts = riverCurve.getSpacedPoints(60);
    sc.beginPath(); pts.forEach((p, i) => (i ? sc.lineTo(W(p.x), W(p.z)) : sc.moveTo(W(p.x), W(p.z)))); sc.stroke();
    // danau + air mancur
    sc.fillStyle = COL.water;
    sc.beginPath(); sc.arc(W(WORLD.lake.x), W(WORLD.lake.z), WORLD.lake.r * PPU, 0, Math.PI * 2); sc.fill();
    sc.beginPath(); sc.arc(W(WORLD.fountain.x), W(WORLD.fountain.z), WORLD.fountain.r * PPU, 0, Math.PI * 2); sc.fill();
    // dermaga, jembatan, kafe
    sc.fillStyle = COL.wood;
    const pr = WORLD.pier; sc.fillRect(W(pr.x - pr.len / 2), W(pr.z - pr.w / 2), pr.len * PPU, pr.w * PPU);
    for (const br of WORLD.bridges || [WORLD.bridge]) {
      // sumbu panjang = (cos rotY, -sin rotY)
      sc.save(); sc.translate(W(br.x), W(br.z)); sc.rotate(-(br.rotY || 0));
      sc.fillRect(-br.len / 2 * PPU, -br.w / 2 * PPU, br.len * PPU, br.w * PPU); sc.restore();
    }
    sc.fillStyle = '#9a9a92';
    for (const [x, z] of WORLD.steppingStones || []) { sc.beginPath(); sc.arc(W(x), W(z), 0.6 * PPU, 0, Math.PI * 2); sc.fill(); }
    sc.fillStyle = COL.wood;
    sc.fillStyle = COL.cafe; sc.fillRect(W(WORLD.cafe.x - 3), W(WORLD.cafe.z - 2.5), 6 * PPU, 5 * PPU);
    // bangku
    sc.fillStyle = '#c9b48a';
    for (const b of WORLD.benches) sc.fillRect(W(b.x) - 1.5, W(b.z) - 1.5, 3, 3);
  }
  drawStatic();

  let zoom = true; // true = sekitar robot, false = full map
  const ZOOM_R = 42; // radius unit dunia yang kelihatan
  canvas.addEventListener('click', () => { zoom = !zoom; });

  // label di layar
  const pool = [];
  function label(i) {
    if (!pool[i]) { const d = document.createElement('div'); d.className = 'loc-label'; labelsEl.appendChild(d); pool[i] = d; }
    return pool[i];
  }
  const tmp = new THREE.Vector3();

  return {
    get zoom() { return zoom; },
    toggleZoom() { zoom = !zoom; },
    update({ pos, rotY, camYaw, camera, signals = [], objectiveLabel = 'signal', started = true }) {
      // ---- minimap ----
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2); ctx.clip();
      let toMap;
      if (zoom) {
        const s = SIZE / (ZOOM_R * 2); // px per unit
        toMap = (x, z) => [SIZE / 2 + (x - pos.x) * s, SIZE / 2 + (z - pos.z) * s];
        const sx = W(pos.x - ZOOM_R), sz = W(pos.z - ZOOM_R), sw = ZOOM_R * 2 * PPU;
        ctx.drawImage(stat, sx, sz, sw, sw, 0, 0, SIZE, SIZE);
      } else {
        const s = SIZE / EXT;
        toMap = (x, z) => [(x - MIN) * s, (z - MIN) * s];
        ctx.drawImage(stat, 0, 0, SIZE, SIZE);
      }
      // label tempat di peta
      ctx.font = `${zoom ? 10 : 8}px Chakra Petch, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = COL.text;
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3;
      for (const l of landmarks()) { const [x, y] = toMap(l.x, l.z); if (x > -20 && x < SIZE + 20 && y > -10 && y < SIZE + 10) ctx.fillText(l.name, x, y - 4); }
      ctx.shadowBlur = 0;
      // sinyal quest yang belum diambil
      const t = performance.now() / 1000;
      for (const s of signals) {
        if (s.taken) continue;
        const [x, y] = toMap(s.x, s.z);
        const r = 3 + Math.sin(t * 4) * 1.2;
        ctx.fillStyle = COL.signal; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // kerucut pandang kamera
      const [rx, ry] = toMap(pos.x, pos.z);
      const fwd = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw)); // arah kamera di dunia (x,z)
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.moveTo(rx, ry);
      ctx.arc(rx, ry, zoom ? 34 : 16, fwd - Math.PI / 2 - 0.55, fwd - Math.PI / 2 + 0.55); ctx.closePath(); ctx.fill();
      // robot: segitiga menghadap rotY (maju = (sin rotY, cos rotY))
      ctx.save(); ctx.translate(rx, ry); ctx.rotate(Math.atan2(Math.sin(rotY), -Math.cos(rotY)) + Math.PI);
      ctx.fillStyle = COL.robot; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.restore();
      // bingkai + arah utara
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = COL.text; ctx.font = '10px Chakra Petch, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('N', SIZE / 2, 11);
      ctx.textAlign = 'right'; ctx.font = '9px Figtree, sans-serif'; ctx.fillStyle = 'rgba(244,242,255,0.6)';
      ctx.fillText(zoom ? 'click: full map' : 'click: zoom', SIZE - 8, SIZE - 7);

      // ---- label lokasi di layar ----
      let i = 0;
      if (started) {
        const items = landmarks().map((l) => ({ ...l, y: groundHeight(l.x, l.z) + (l.kind === 'hill' ? 10 : l.kind === 'city' ? 14 : 3.2) }));
        // sinyal terdekat juga dilabelin kalau dekat
        let near = null, nd = 45;
        for (const s of signals) { if (s.taken) continue; const d = Math.hypot(s.x - pos.x, s.z - pos.z); if (d < nd) { nd = d; near = s; } }
        const goalName = { signal: 'Lost signal', crate: 'Supply crate', generator: 'Generator', parcel: 'Parcel', courier: near?.name || 'Courier', 'lost part': 'Lost part' }[objectiveLabel] || objectiveLabel;
        if (near) items.push({ id: 'signal', name: goalName, x: near.x, z: near.z, y: (near.y || 0) + 1.6, kind: 'signal' });
        // yang lebih dekat digambar dulu; label yang numpuk di layar dilewatin
        items.forEach((it) => { it.d = Math.hypot(it.x - pos.x, it.z - pos.z); });
        items.sort((a, b) => a.d - b.d);
        const placed = [];
        for (const it of items) {
          const d = it.d;
          if (d < 6 || d > 110) continue;
          tmp.set(it.x, it.y, it.z).project(camera);
          if (tmp.z > 1 || Math.abs(tmp.x) > 1.05 || Math.abs(tmp.y) > 1.05) continue;
          const sx = (tmp.x * 0.5 + 0.5) * window.innerWidth;
          const sy = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
          if (placed.some((p) => Math.abs(p.x - sx) < 90 && Math.abs(p.y - sy) < 26)) continue;
          placed.push({ x: sx, y: sy });
          const el = label(i++);
          el.textContent = `${it.name} · ${Math.round(d)} m`;
          el.className = 'loc-label' + (it.kind === 'signal' ? ' signal' : '');
          el.style.left = `${sx}px`;
          el.style.top = `${sy}px`;
          el.style.opacity = String(Math.min(1, Math.max(0.35, 1.2 - d / 110)));
          el.hidden = false;
        }
      }
      for (; i < pool.length; i++) pool[i].hidden = true;

      // ---- panah objektif ke sinyal terdekat ----
      if (objectiveEl) {
        let near = null, nd = Infinity;
        for (const s of signals) { if (s.taken) continue; const d = Math.hypot(s.x - pos.x, s.z - pos.z); if (d < nd) { nd = d; near = s; } }
        if (started && near) {
          // sudut relatif ke arah pandang kamera: 0 = lurus di depan
          const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
          const dx = (near.x - pos.x) / nd, dz = (near.z - pos.z) / nd;
          const ang = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz); // positif = kanan
          objectiveEl.hidden = false;
          objectiveEl.querySelector('.arrow').style.transform = `rotate(${ang}rad)`;
          objectiveEl.querySelector('.txt').textContent = `Nearest ${objectiveLabel} · ${Math.round(nd)} m`;
        } else objectiveEl.hidden = true;
      }
    },
  };
}
