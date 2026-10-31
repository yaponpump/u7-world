import * as THREE from 'three';

// Palet dunia
const C = {
  grass: 0x6fbf5a,
  grassDark: 0x4f9a43,
  path: 0xe4d6b8,
  water: 0x4fb3d9,
  wood: 0x9a6b3f,
  woodDark: 0x6f4a2a,
  trunk: 0x7a5533,
  leaf: 0x3f8f3a,
  leaf2: 0x5fae45,
  stone: 0xb9b9b4,
  lampPost: 0x2b2f38,
  lampGlow: 0xffb347,
};

export const WORLD = {
  size: 140,
  lake: { x: -34, z: 30, r: 22 },
  park: { x: 20, z: 0, r: 20 },
  hill: { x: 44, z: -40, r: 26, h: 9 },
  cafe: { x: 44, z: 24 },
  pier: { x: -14, z: 22, w: 3, len: 10 },
  bridge: { x: -4, z: -16, w: 4, len: 10 },
  benches: [],
  lamps: [],
  fountain: { x: 20, z: 0, r: 3.2 },
  signals: [],
};

// Sungai: kurva dari utara-barat ke danau
export const riverCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-70, 0, -60),
  new THREE.Vector3(-40, 0, -40),
  new THREE.Vector3(-12, 0, -16),
  new THREE.Vector3(-22, 0, 8),
  new THREE.Vector3(-34, 0, 30),
]);

function ribbonGeometry(curve, width, segments = 120) {
  const pts = curve.getSpacedPoints(segments);
  const pos = [];
  const uv = [];
  const idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = curve.getTangentAt(i / (pts.length - 1));
    const n = new THREE.Vector3().crossVectors(up, t).normalize().multiplyScalar(width / 2);
    pos.push(p.x - n.x, 0, p.z - n.z, p.x + n.x, 0, p.z + n.z);
    uv.push(0, i / segments, 1, i / segments);
    if (i < pts.length - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function distToRiver(x, z) {
  // Pendekatan: cek jarak ke titik sampel kurva
  let best = Infinity;
  const pts = riverSamples;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - x;
    const dz = pts[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
const riverSamples = riverCurve.getSpacedPoints(80);

export function hillHeight(x, z) {
  const h = WORLD.hill;
  const d = Math.hypot(x - h.x, z - h.z);
  if (d > h.r) return 0;
  const t = 1 - d / h.r;
  return h.h * (t * t * (3 - 2 * t));
}

export function groundHeight(x, z) {
  return hillHeight(x, z);
}

export function isWater(x, z) {
  const l = WORLD.lake;
  if (Math.hypot(x - l.x, z - l.z) < l.r - 0.5) {
    // dermaga
    const p = WORLD.pier;
    if (Math.abs(x - p.x) < p.w / 2 && z > p.z - p.len / 2 && z < p.z + p.len / 2) return false;
    return true;
  }
  if (distToRiver(x, z) < 3.2) {
    const b = WORLD.bridge;
    if (Math.abs(x - b.x) < b.len / 2 + 1 && Math.abs(z - b.z) < b.w / 2 + 1) return false;
    return true;
  }
  return false;
}

export function buildWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // Tanah dengan bukit
  const seg = 120;
  const groundGeo = new THREE.PlaneGeometry(WORLD.size * 1.6, WORLD.size * 1.6, seg, seg);
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position;
  const colors = [];
  const grass = new THREE.Color(C.grass);
  const grassDark = new THREE.Color(C.grassDark);
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    let y = hillHeight(x, z);
    if (isWater(x, z)) y = -1.2;
    gp.setY(i, y - 0.02);
    const shade = 0.5 + 0.5 * Math.sin(x * 0.21) * Math.cos(z * 0.17);
    const c = grass.clone().lerp(grassDark, shade * 0.6);
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  group.add(ground);

  // Air: danau + sungai
  const waterMat = new THREE.MeshStandardMaterial({
    color: C.water, transparent: true, opacity: 0.82, roughness: 0.15, metalness: 0.1,
  });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(WORLD.lake.r, 48), waterMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(WORLD.lake.x, -0.25, WORLD.lake.z);
  group.add(lake);
  const river = new THREE.Mesh(ribbonGeometry(riverCurve, 6), waterMat);
  river.position.y = -0.25;
  group.add(river);

  // Jalan setapak di taman
  const pathMat = new THREE.MeshStandardMaterial({ color: C.path, roughness: 1 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(WORLD.park.r - 2.2, WORLD.park.r, 64), pathMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(WORLD.park.x, 0.02, WORLD.park.z);
  group.add(ring);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(6.5, 40), pathMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(WORLD.park.x, 0.02, WORLD.park.z);
  group.add(plaza);

  // Air mancur
  const stoneMat = new THREE.MeshStandardMaterial({ color: C.stone, roughness: 0.9 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.7, 32, 1, true), stoneMat);
  basin.position.set(WORLD.fountain.x, 0.35, WORLD.fountain.z);
  group.add(basin);
  const basinWater = new THREE.Mesh(new THREE.CircleGeometry(3.1, 32), waterMat);
  basinWater.rotation.x = -Math.PI / 2;
  basinWater.position.set(WORLD.fountain.x, 0.6, WORLD.fountain.z);
  group.add(basinWater);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.2, 16), stoneMat);
  column.position.set(WORLD.fountain.x, 1.1, WORLD.fountain.z);
  group.add(column);
  const spray = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(300).fill(0), 3)),
    new THREE.PointsMaterial({ color: 0xcfefff, size: 0.12, transparent: true, opacity: 0.9 }),
  );
  spray.position.set(WORLD.fountain.x, 2.2, WORLD.fountain.z);
  group.add(spray);

  // Bangku
  const woodMat = new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.8 });
  const woodDark = new THREE.MeshStandardMaterial({ color: C.woodDark, roughness: 0.8 });
  function bench(x, z, rotY) {
    const b = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.7), woodMat);
    seat.position.y = 0.55;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.1), woodMat);
    back.position.set(0, 0.95, -0.3);
    const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.6), woodDark);
    l1.position.set(-0.9, 0.27, 0);
    const l2 = l1.clone();
    l2.position.x = 0.9;
    b.add(seat, back, l1, l2);
    b.position.set(x, groundHeight(x, z), z);
    b.rotation.y = rotY;
    b.traverse((m) => { m.castShadow = true; });
    group.add(b);
    WORLD.benches.push({ x, z, rotY, y: groundHeight(x, z) });
  }
  bench(20, 9, Math.PI);
  bench(20, -9, 0);
  bench(29, 0, -Math.PI / 2);
  bench(-16, 36, Math.PI * 0.85);
  bench(44, -40, Math.PI * 0.75); // puncak bukit

  // Dermaga
  const pier = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(WORLD.pier.w, 0.2, WORLD.pier.len), woodMat);
  deck.position.y = 0.3;
  pier.add(deck);
  for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.8, 8), woodDark);
    post.position.set(i * (WORLD.pier.w / 2 - 0.2), -0.4, j * (WORLD.pier.len / 2 - 0.3));
    pier.add(post);
  }
  pier.position.set(WORLD.pier.x, 0, WORLD.pier.z);
  group.add(pier);

  // Jembatan
  const bridge = new THREE.Group();
  const bdeck = new THREE.Mesh(new THREE.BoxGeometry(WORLD.bridge.len + 2, 0.25, WORLD.bridge.w), woodMat);
  bdeck.position.y = 0.5;
  bridge.add(bdeck);
  for (let s = -1; s <= 1; s += 2) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(WORLD.bridge.len + 2, 0.08, 0.08), woodDark);
    rail.position.set(0, 1.4, s * (WORLD.bridge.w / 2 - 0.1));
    bridge.add(rail);
    for (let i = -5; i <= 5; i += 2.5) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), woodDark);
      p.position.set(i, 0.95, s * (WORLD.bridge.w / 2 - 0.1));
      bridge.add(p);
    }
  }
  bridge.position.set(WORLD.bridge.x, 0, WORLD.bridge.z);
  group.add(bridge);

  // Pohon
  const trunkMat = new THREE.MeshStandardMaterial({ color: C.trunk, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: C.leaf, roughness: 1 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: C.leaf2, roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 2.4, 7);
  const leafGeo = new THREE.IcosahedronGeometry(1.6, 1);
  const treePositions = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 120; i++) {
    const x = (rnd() - 0.5) * WORLD.size * 1.4;
    const z = (rnd() - 0.5) * WORLD.size * 1.4;
    if (isWater(x, z) || distToRiver(x, z) < 5) continue;
    if (Math.hypot(x - WORLD.park.x, z - WORLD.park.z) < WORLD.park.r + 2) continue;
    if (Math.hypot(x - WORLD.lake.x, z - WORLD.lake.z) < WORLD.lake.r + 3) continue;
    if (Math.hypot(x - WORLD.cafe.x, z - WORLD.cafe.z) < 7) continue;
    treePositions.push([x, z, 0.8 + rnd() * 0.7]);
  }
  for (const [x, z, s] of treePositions) {
    const y = groundHeight(x, z);
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(x, y + 1.2 * s, z);
    t.scale.setScalar(s);
    const l = new THREE.Mesh(leafGeo, rnd() > 0.5 ? leafMat : leafMat2);
    l.position.set(x, y + 3.2 * s, z);
    l.scale.setScalar(s);
    t.castShadow = l.castShadow = true;
    group.add(t, l);
  }

  // Lampu taman (5 = milestone komunitas)
  const lampMat = new THREE.MeshStandardMaterial({ color: C.lampPost, roughness: 0.6, metalness: 0.4 });
  const lampPositions = [
    [WORLD.park.x + 12, WORLD.park.z + 12], [WORLD.park.x - 12, WORLD.park.z + 12],
    [WORLD.park.x - 12, WORLD.park.z - 12], [WORLD.park.x + 12, WORLD.park.z - 12],
    [WORLD.pier.x + 4, WORLD.pier.z - 8],
  ];
  lampPositions.forEach(([x, z], i) => {
    const y = groundHeight(x, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.6, 8), lampMat);
    post.position.set(x, y + 1.8, z);
    const headMat = new THREE.MeshStandardMaterial({ color: C.lampGlow, emissive: C.lampGlow, emissiveIntensity: 0 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), headMat);
    head.position.set(x, y + 3.7, z);
    const light = new THREE.PointLight(C.lampGlow, 0, 14, 2);
    light.position.set(x, y + 3.5, z);
    group.add(post, head, light);
    WORLD.lamps.push({ head, headMat, light, on: i < 3 });
  });

  // Kafe / kios tokenomics
  const cafe = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), new THREE.MeshStandardMaterial({ color: 0xf2e9dc, roughness: 1 }));
  wall.position.y = 1.5;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.8, 4), new THREE.MeshStandardMaterial({ color: 0x6d3df5, roughness: 0.9 }));
  roof.position.y = 3.9;
  roof.rotation.y = Math.PI / 4;
  const awning = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.1, 1.6), new THREE.MeshStandardMaterial({ color: 0xff8a2a }));
  awning.position.set(0, 2.3, 2.6);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 0.6), woodMat);
  counter.position.set(0, 0.5, 2.3);
  cafe.add(wall, roof, awning, counter);
  cafe.position.set(WORLD.cafe.x, 0, WORLD.cafe.z);
  cafe.traverse((m) => { m.castShadow = true; });
  group.add(cafe);

  // Papan pengumuman (roadmap)
  const board = new THREE.Group();
  const bb = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 0.12), woodDark);
  bb.position.y = 1.9;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4), new THREE.MeshStandardMaterial({ color: 0xfaf6ea }));
  paper.position.set(0, 1.9, 0.07);
  const bl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), woodDark);
  bl.position.set(-1.2, 0.6, 0);
  const br = bl.clone();
  br.position.x = 1.2;
  board.add(bb, paper, bl, br);
  board.position.set(WORLD.park.x + 4, 0, WORLD.park.z - 17);
  group.add(board);

  // Menara lampu komunitas (di tengah taman, dekat air mancur)
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 7, 10), lampMat);
  tower.position.set(WORLD.park.x + 6, 3.5, WORLD.park.z + 6);
  group.add(tower);
  const towerLights = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshStandardMaterial({ color: 0xb8ff3c, emissive: 0xb8ff3c, emissiveIntensity: i < 3 ? 1.6 : 0 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 8, 24), m);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(WORLD.park.x + 6, 1.5 + i * 1.2, WORLD.park.z + 6);
    group.add(ring);
    towerLights.push(m);
  }
  WORLD.towerLights = towerLights;

  // "Sinyal" yang hilang: 5 kristal buat quest
  const sigGeo = new THREE.OctahedronGeometry(0.4, 0);
  const sigPos = [[-24, 40], [-10, -30], [44, -38], [52, 20], [-50, -10]];
  for (const [x, z] of sigPos) {
    const m = new THREE.MeshStandardMaterial({ color: 0xb8ff3c, emissive: 0xb8ff3c, emissiveIntensity: 1.2 });
    const s = new THREE.Mesh(sigGeo, m);
    s.position.set(x, groundHeight(x, z) + 1.2, z);
    group.add(s);
    WORLD.signals.push({ mesh: s, x, z, taken: false });
  }

  // Batu loncatan di sungai
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8e8e88, roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const p = riverCurve.getPointAt(0.3 + i * 0.03);
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + (i % 2) * 0.2, 0), rockMat);
    r.position.set(p.x + (i % 2 ? 1 : -1) * 1.2, -0.1, p.z);
    group.add(r);
  }

  // Burung sederhana yang terbang muter
  const birds = new THREE.Group();
  const birdMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 4), birdMat);
    b.rotation.x = Math.PI / 2;
    birds.add(b);
  }
  group.add(birds);

  // Ikan di danau (titik yang loncat sesekali)
  const fish = [];
  const fishMat = new THREE.MeshStandardMaterial({ color: 0xff8a2a });
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 5), fishMat);
    f.rotation.x = Math.PI / 2;
    f.visible = false;
    group.add(f);
    fish.push({ mesh: f, t: Math.random() * 10, angle: Math.random() * Math.PI * 2, r: 6 + Math.random() * 10 });
  }

  return {
    group, waterMat, spray, birds, fish, lake, river,
    update(t) {
      // riak air
      lake.position.y = -0.25 + Math.sin(t * 1.3) * 0.03;
      river.position.y = -0.25 + Math.cos(t * 1.1) * 0.03;
      // semprotan air mancur
      const sp = spray.geometry.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const ph = (t * 1.4 + i * 0.37) % 1;
        const a = i * 2.399;
        const rad = ph * 1.6;
        sp.setXYZ(i, Math.cos(a) * rad, (1 - ph) * ph * 4 + 0.2, Math.sin(a) * rad);
      }
      sp.needsUpdate = true;
      // burung
      birds.children.forEach((b, i) => {
        const a = t * 0.25 + i * 1.05;
        b.position.set(WORLD.lake.x + Math.cos(a) * 30, 14 + Math.sin(t + i) * 1.5, WORLD.lake.z + Math.sin(a) * 30);
        b.rotation.y = -a;
        b.scale.y = 1 + Math.sin(t * 9 + i) * 0.3;
      });
      // ikan loncat
      for (const f of fish) {
        f.t += 0.016;
        const cycle = f.t % 7;
        if (cycle < 1.2) {
          f.mesh.visible = true;
          const k = cycle / 1.2;
          f.mesh.position.set(
            WORLD.lake.x + Math.cos(f.angle) * f.r,
            -0.3 + Math.sin(k * Math.PI) * 1.4,
            WORLD.lake.z + Math.sin(f.angle) * f.r,
          );
          f.mesh.rotation.x = Math.PI / 2 - (k - 0.5) * 2.5;
        } else {
          f.mesh.visible = false;
          if (cycle > 6.9) f.angle = Math.random() * Math.PI * 2;
        }
      }
      // sinyal berputar
      for (const s of WORLD.signals) {
        if (s.taken) continue;
        s.mesh.rotation.y = t * 1.5;
        s.mesh.position.y = groundHeight(s.x, s.z) + 1.2 + Math.sin(t * 2 + s.x) * 0.2;
      }
    },
  };
}

// Nyalain lampu kota sesuai jumlah sinyal (milestone komunitas)
export function setCityLights(n) {
  WORLD.lamps.forEach((l, i) => {
    l.on = i < n;
  });
  WORLD.towerLights?.forEach((m, i) => {
    m.emissiveIntensity = i < n ? 1.6 : 0;
  });
}

export function applyNight(nightAmount) {
  for (const l of WORLD.lamps) {
    const k = l.on ? nightAmount : 0;
    l.headMat.emissiveIntensity = k * 2.2;
    l.light.intensity = k * 18;
  }
}
