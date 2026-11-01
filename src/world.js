import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import {
  grassTexture, dirtTexture, barkTexture, leafCardTexture, waterNormalTexture, stoneTexture, woodTexture,
} from './textures.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbrMaterial } from './assets.js';
import { Scatter, partsOf } from './scatter.js';
import { createWeather } from './weather.js';
import { createNpcs } from './npcs.js';
import { createEcosystem } from './ecosystem.js';
import { addObstacle, CAFE, CLUB, DOOR_H, ROOM_H, setInsideRoom, blockedByBuilding, buildCity, cityFlat, ROOF, SHOP, setCityFinale, setCityPower, CITY_SIGNALS, inCity, onSidewalk, setCityLit, setCityNight } from './city.js';

export const WORLD = {
  size: 140,
  lake: { x: -34, z: 30, r: 22 },
  park: { x: 20, z: 0, r: 20 },
  hill: { x: 44, z: -40, r: 26, h: 9 },
  cafe: { x: 44, z: 24 },
  pier: { x: -17.5, z: 22, w: 3, len: 11 },
  // rotY: sumbu panjang jembatan = (cos rotY, -sin rotY). deckY: tinggi lantainya.
  bridges: [
    { x: -12, z: -14, w: 4, len: 10, rotY: 0, deckY: 0.62 },
    { x: -22, z: 7, w: 4, len: 10, rotY: -0.51, deckY: 0.62 },
    { x: -40, z: -40, w: 4, len: 10, rotY: 0.98, deckY: 0.62 },
  ],
  steppingStones: [[-19.4, -2.1], [-18, -1.8], [-16.6, -2.2], [-15.2, -1.9], [-13.8, -2.2], [-12.5, -1.9]],
  benches: [],
  lamps: [],
  fountain: { x: 20, z: 0, r: 3.2 },
  signals: [],
};

WORLD.bridge = WORLD.bridges[0];

export const riverCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-70, 0, -60),
  new THREE.Vector3(-40, 0, -40),
  new THREE.Vector3(-12, 0, -16),
  new THREE.Vector3(-22, 0, 8),
  new THREE.Vector3(-34, 0, 30),
]);
const riverSamples = riverCurve.getSpacedPoints(100);

const inLake = (p) => Math.hypot(p.x - WORLD.lake.x, p.z - WORLD.lake.z) < WORLD.lake.r - 1;

function ribbonGeometry(curve, width, segments = 140) {
  const pts = curve.getSpacedPoints(segments);
  const pos = [], uv = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = curve.getTangentAt(i / (pts.length - 1));
    const n = new THREE.Vector3().crossVectors(up, t).normalize().multiplyScalar(width / 2);
    pos.push(p.x - n.x, 0, p.z - n.z, p.x + n.x, 0, p.z + n.z);
    uv.push(0, (i / segments) * 12, 1, (i / segments) * 12);
    if (i < pts.length - 1 && !inLake(pts[i + 1])) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Gradasi terang di pinggir sungai: nempel tepi, pudar ke tengah
function shallowGeometry(curve, segments = 140) {
  const pts = curve.getSpacedPoints(segments), up = new THREE.Vector3(0, 1, 0);
  const pos = [], col = [], idx = [];
  const offsets = [[-3.3, 0.6], [-1.7, 0], [1.7, 0], [3.3, 0.6]];
  pts.forEach((p, i) => {
    const n = new THREE.Vector3().crossVectors(up, curve.getTangentAt(i / segments)).normalize();
    for (const [d, a] of offsets) {
      const x = p.x + n.x * d, z = p.z + n.z * d;
      // di dalam danau gradasinya dimatiin, biar nggak jadi garis putih di air
      const inLake = Math.hypot(x - WORLD.lake.x, z - WORLD.lake.z) < WORLD.lake.r + 1;
      pos.push(x, 0, z);
      col.push(0.62, 0.8, 0.74, inLake ? 0 : a);
    }
    if (i < segments && !inLake(pts[i + 1])) {
      const b = i * 4;
      for (const k of [0, 2]) idx.push(b + k, b + k + 4, b + k + 1, b + k + 1, b + k + 4, b + k + 5);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

export function distToRiver(x, z) {
  let best = Infinity;
  for (const p of riverSamples) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) best = d; }
  return Math.sqrt(best);
}

export function hillHeight(x, z) {
  const h = WORLD.hill;
  const d = Math.hypot(x - h.x, z - h.z);
  if (d > h.r) return 0;
  const t = 1 - d / h.r;
  return h.h * (t * t * (3 - 2 * t));
}
// undulasi halus biar tanah nggak rata sempurna
function microHeight(x, z) {
  return Math.sin(x * 0.11) * Math.cos(z * 0.13) * 0.25 + Math.sin(x * 0.31 + z * 0.17) * 0.1;
}
const CAFE_FLOOR = 0.15;
export function groundHeight(x, z) {
  // Tanah di bawah kafe diratain, kalau nggak rumputnya nembus lantai
  if (Math.abs(x - CAFE.x) < CAFE.hw + 0.5 && Math.abs(z - CAFE.z) < CAFE.hd + 0.5) return CAFE_FLOOR;
  return (hillHeight(x, z) + microHeight(x, z)) * cityFlat(x, z) + (onSidewalk(x, z) ? 0.14 : 0);
}

// ---------- Rute dan papan petunjuk ----------
// Garis tengah jalan setapak. Dipakai buat mesh jalan, nyisihin rumput/pohon, dan minimap.
WORLD.routes = [
  { id: 'cafe', points: [[26.8, 0], [44, 0], [44, 18], [37.5, 18], [37.5, 30], [44, 30]] },
  { id: 'hill', points: [[20, -6.8], [20, -30], [34, -30]] },
  { id: 'lake', points: [[20, 6.8], [20, 22], [-11, 22]] },
  { id: 'city', points: [[20, 22], [20, 46]] },
  { id: 'bridge', points: [[13.2, 0], [3, 0], [3, -14], [-6.2, -14]] },
  { id: 'bridge2', points: [[-5, 22], [-5, 10], [-16.2, 9.9]] },
  { id: 'bridge3', points: [[3, -14], [3, -41], [-36.4, -45.4]] },
];
// Tempat yang bisa ditekan E: { id, name, x, z, line }
WORLD.interactables = [
  { id: 'tower', name: 'Signal Tower', x: 26, z: 6, line: 'It hums a little louder after every burn. 7POD listens to it.' },
  { id: 'notice', name: 'Notice board', x: 24, z: -17, line: 'The board tracks 7POD. Every burn moves it one step closer to the next level.' },
  { id: 'hill', name: 'Hill lookout', x: 39.5, z: -35.5, line: 'You can see the whole city from up here. Most of it is still dark.' },
  { id: 'pier', name: 'Pier', x: -19, z: 22, line: 'End of the line. Press R and skip a rock.' },
  { id: 'cafeCounter', name: 'Cafe counter', x: CAFE.x, z: CAFE.z - 1.5, line: 'Nobody has run this counter since The Blackout. The coffee machine still hums.' },
  { id: 'cityGate', name: 'City gate', x: 20, z: 44, line: 'Road closed since The Blackout. Barriers only stop cars.' },
];
WORLD.cafe.counter = { x: CAFE.x, z: CAFE.z - 1.5 };
WORLD.shop = { x: SHOP.x, z: SHOP.z, counter: { x: SHOP.x + 2.4, z: SHOP.z + 0.9 } };
WORLD.interactables.push({ id: 'shopCounter', name: 'Shop counter', ...WORLD.shop.counter, line: 'The till still has power. The shelves are full and nobody came back to buy anything.' });
// Quest berantai setelah ending: nyalain generator, antar paket, cari bagian tubuh VUZZ
WORLD.generators = [
  { id: 'tower', x: 30.5, z: 9.5, label: 'behind the Signal Tower' },
  { id: 'cafe', x: 51, z: 28, label: 'east of the cafe' },
  { id: 'skyline', x: 74, z: 106, label: 'at the far end of the city' },
];
WORLD.parcel = { x: 41.6, z: 30.2 };
{
  const roof = ROOF.b;
  WORLD.parts = [
    { id: 'antenna', x: roof.x + 1.3, z: roof.z + roof.d - 1.3, y: roof.h, label: 'on the rooftop with the iron stairs' },
    { id: 'plate', x: -34.5, z: -43, label: 'beside the north bridge' },
    { id: 'core', x: WORLD.lake.x - WORLD.lake.r - 3, z: WORLD.lake.z, label: 'on the west shore of the lake' },
  ];
}
// Titik misi harian, semuanya bisa dicapai jalan kaki
WORLD.dailySpots = [
  { x: 11, z: 13, label: 'by the park lawn' },
  { x: 31, z: -13, label: 'south side of the park' },
  { x: 50.5, z: 18, label: 'behind the cafe' },
  { x: 40, z: -37, label: 'top of the hill' },
  { x: -7, z: 38, label: 'on the lake shore' },
  { x: -34, z: 56, label: 'far shore of the lake' },
  { x: -3.5, z: -14, label: 'east end of the old bridge' },
  { x: -16, z: 12.5, label: 'by the lake bridge' },
  { x: -34, z: -48, label: 'at the north bridge' },
  { x: -60, z: -22, label: 'out in the west field' },
  { x: 8, z: 66, label: 'in a city side street' },
  { x: 60, z: 90, label: 'deep in the city' },
  { x: ROOF.cx, z: ROOF.cz, label: 'on the rooftop' },
];
WORLD.landmarks = [
  { id: 'park', name: 'Park', x: 20, z: 0, kind: 'park' },
  { id: 'fountain', name: 'Fountain', x: 20, z: 0, kind: 'fountain', minor: true },
  { id: 'lake', name: 'Lake', x: -34, z: 30, kind: 'lake' },
  { id: 'pier', name: 'Pier', x: -17.5, z: 22, kind: 'pier' },
  { id: 'bridge', name: 'Bridge', x: -12, z: -14, kind: 'bridge' },
  { id: 'bridge2', name: 'Bridge', x: -22, z: 7, kind: 'bridge' },
  { id: 'bridge3', name: 'Bridge', x: -40, z: -40, kind: 'bridge' },
  { id: 'stones', name: 'Stepping stones', x: -16, z: -2, kind: 'stone', minor: true },
  { id: 'hill', name: 'Hill lookout', x: 44, z: -40, kind: 'hill' },
  { id: 'tower', name: 'Signal Tower', x: 26, z: 6, kind: 'tower' },
  { id: 'notice', name: 'Notice board', x: 24, z: -17, kind: 'board', minor: true },
  { id: 'cafe', name: 'Cafe', x: 44, z: 24, kind: 'cafe' },
  { id: 'shop', name: 'Shop', x: SHOP.x, z: SHOP.z, kind: 'cafe' },
  { id: 'city', name: 'City', x: 40, z: 72, kind: 'city' },
];

function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
function onRoute(x, z) {
  return WORLD.routes.some((r) => r.points.some((p, i) => i > 0 && segDist(x, z, r.points[i - 1], p) < 1.7));
}

// Pita jalan dan batu tepinya
function buildPaths(group, mat, hi) {
  const pos = [], uv = [], idx = [], stones = [];
  const lines = WORLD.routes.map((r) => r.points);
  const ring = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    ring.push([WORLD.park.x + Math.cos(a) * 18.9, WORLD.park.z + Math.sin(a) * 18.9]);
  }
  lines.push(ring);
  for (const line of lines) {
    let run = 0;
    for (let s = 1; s < line.length; s++) {
      const [ax, az] = line[s - 1], [bx, bz] = line[s];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      const steps = Math.max(1, Math.round(len / 1.4));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const base = pos.length / 3;
        for (const side of [-1, 1]) {
          const px = x + nx * side * 1.25, pz = z + nz * side * 1.25;
          pos.push(px, groundHeight(px, pz) + 0.07, pz);
          uv.push((side + 1) * 0.31, (run + len * t) / 2.5);
        }
        if (i < steps) idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        if (i % (hi ? 1 : 2) === 0) {
          for (const side of [-1, 1]) {
            const px = x + nx * side * (1.42 + Math.sin(i * 7.1) * 0.05), pz = z + nz * side * (1.42 + Math.cos(i * 5.3) * 0.05);
            stones.push([px, groundHeight(px, pz) + 0.06, pz, 0.7 + ((i * 37) % 10) * 0.07]);
          }
        }
      }
      run += len;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const road = new THREE.Mesh(g, mat);
  road.receiveShadow = true;
  group.add(road);

  const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 0.95 }), stones.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  stones.forEach(([x, y, z, k], i) => {
    q.setFromEuler(new THREE.Euler(i, i * 2.3, i * 1.1));
    rock.setMatrixAt(i, m.compose(v.set(x, y, z), q, s.set(k, k * 0.7, k)));
  });
  rock.receiveShadow = true;
  group.add(rock);
}

// AO bawaan tekstur bikin jalan keliatan gelap dari jauh
function lightPath(mat) { mat.aoMap = null; mat.needsUpdate = true; return mat; }

function noticeTexture() {
  const c = document.createElement('canvas');
  c.width = 780; c.height = 420;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f5efe2';
  ctx.fillRect(0, 0, 780, 420);
  ctx.fillStyle = '#23262c';
  ctx.textAlign = 'center';
  ctx.font = 'bold 62px "Chakra Petch", sans-serif';
  ctx.fillText('CITY NOTICE', 390, 92);
  ctx.font = '38px "Figtree", sans-serif';
  ['Creator fees buy back 7POD every hour.', 'Every burn helps 7POD evolve.', 'Next stop: superintelligence (fiction).'].forEach((t, i) => ctx.fillText(t, 390, 180 + i * 66));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signLabel(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe6d2';
  ctx.font = 'bold 76px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return new THREE.MeshBasicMaterial({ map: t, transparent: true });
}

// Tiang kayu dengan papan yang ujungnya nunjuk ke tujuan
function buildSignposts(group, woodMat, list) {
  const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 3.1, 10);
  const boardGeo = new THREE.BoxGeometry(1.6, 0.34, 0.06);
  const tipGeo = new THREE.ConeGeometry(0.17 * Math.SQRT2, 0.24, 4);
  tipGeo.rotateY(Math.PI / 4);
  tipGeo.rotateZ(-Math.PI / 2);
  tipGeo.scale(1, 1, 0.18);
  const planeGeo = new THREE.PlaneGeometry(1.44, 0.36);
  const stripGeo = new THREE.BoxGeometry(1.5, 0.03, 0.075);
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x20261a, emissive: 0xb8ff3c, emissiveIntensity: 0 });
  WORLD.signGlow = stripMat;
  const labels = new Map();
  for (const { x, z, to } of list) {
    const sign = new THREE.Group();
    const y0 = groundHeight(x, z);
    sign.position.set(x, y0, z);
    addObstacle(x, z, 0.12, 0.12, 99);
    const post = new THREE.Mesh(postGeo, woodMat);
    post.position.y = 1.55;
    post.castShadow = true;
    sign.add(post);
    to.forEach((id, i) => {
      const lm = WORLD.landmarks.find((l) => l.id === id);
      const arm = new THREE.Group();
      arm.position.y = 2.8 - i * 0.43;
      arm.rotation.y = -Math.atan2(lm.z - z, lm.x - x);
      const board = new THREE.Mesh(boardGeo, woodMat);
      board.position.x = 0.84;
      board.castShadow = true;
      const tip = new THREE.Mesh(tipGeo, woodMat);
      tip.position.x = 1.76;
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.set(0.84, -0.17, 0);
      if (!labels.has(id)) labels.set(id, signLabel(lm.name));
      const front = new THREE.Mesh(planeGeo, labels.get(id));
      front.position.set(0.84, 0, 0.033);
      const back = new THREE.Mesh(planeGeo, labels.get(id));
      back.position.set(0.84, 0, -0.033);
      back.rotation.y = Math.PI;
      arm.add(board, tip, strip, front, back);
      sign.add(arm);
    });
    group.add(sign);
  }
}

function onPath(x, z) {
  if (inCity(x, z)) return true;
  if (onRoute(x, z)) return true;
  const d = Math.hypot(x - WORLD.park.x, z - WORLD.park.z);
  if (d < 6.8) return true;
  if (d > WORLD.park.r - 2.4 && d < WORLD.park.r + 0.2) return true;
  // jalur ke bukit, kafe, danau
  if (Math.abs(z - WORLD.park.z) < 1.4 && x > WORLD.park.x && x < WORLD.cafe.x) return true;
  if (Math.abs(x - WORLD.park.x) < 1.4 && z < WORLD.park.z && z > -30) return true;
  if (Math.abs(z - 22) < 1.4 && x > WORLD.pier.x && x < WORLD.park.x) return true;
  return false;
}

export function onPier(x, z) {
  const p = WORLD.pier;
  return Math.abs(x - p.x) < p.len / 2 && Math.abs(z - p.z) < p.w / 2;
}

const bridgeLocal = (b, x, z) => {
  const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rotY), s = Math.sin(b.rotY);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
};
// Tinggi lantai jembatan di titik ini, ngikutin lengkungannya
export function deckHeight(b, x, z) {
  const t = Math.min(1, Math.max(0, (bridgeLocal(b, x, z).lx + 5.7) / 11.4));
  return 0.55 + Math.sin(t * Math.PI) * 0.35;
}
// Pagar jembatan: nggak bisa ditembus dari dalam maupun luar
export function blockedByRail(x, z) {
  return WORLD.bridges.some((b) => {
    const { lx, lz } = bridgeLocal(b, x, z);
    return Math.abs(lx) < b.len / 2 + 0.2 && Math.abs(Math.abs(lz) - b.w / 2) < 0.28;
  });
}

// Jembatan yang lagi diinjek di titik ini, kalau ada
export function onBridge(x, z) {
  return WORLD.bridges.find((b) => {
    const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rotY), s = Math.sin(b.rotY);
    return Math.abs(dx * c - dz * s) < b.len / 2 + 1 && Math.abs(dx * s + dz * c) < b.w / 2;
  }) || null;
}

// Air beneran, termasuk yang ada di bawah dermaga dan jembatan
function overWater(x, z) {
  const l = WORLD.lake;
  return Math.hypot(x - l.x, z - l.z) < l.r - 0.5 || distToRiver(x, z) < 3.2;
}

export function isWater(x, z) {
  return overWater(x, z) && !onPier(x, z) && !onBridge(x, z);
}

// Titik bulat lembut buat cipratan, biar partikel nggak jadi kotak
function dropTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

// ---------- Shader tambahan: angin buat rumput dan daun ----------
const windScale = { value: 1 };
function addWind(material, { strength = 0.25, leaf = false } = {}) {
  material.userData.wind = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = material.userData.wind;
    shader.uniforms.uWind = windScale;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime, uWind;`)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 wp = instanceMatrix * vec4(transformed, 1.0);
        #else
          vec4 wp = vec4(transformed, 1.0);
        #endif
        float ph = wp.x * 0.35 + wp.z * 0.27;
        float sway = sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.4;
        float k = ${leaf ? 'clamp(uv.y, 0.0, 1.0) * 0.5 + 0.5' : 'uv.y * uv.y'};
        transformed.x += sway * ${strength.toFixed(3)} * k * uWind;
        transformed.z += cos(uTime * 1.3 + ph) * ${(strength * 0.5).toFixed(3)} * k * uWind;
      `);
  };
}

export function buildWorld(scene, renderer, { quality = 'high', assets = { textures: {}, trees: [], props: {} } } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const hi = quality === 'high';

  // ---------- Tekstur ----------
  const texGrass = grassTexture();
  const texDirt = dirtTexture();
  const texBark = barkTexture();
  const texLeaf = leafCardTexture();
  const texWaterN = waterNormalTexture();
  const texStone = stoneTexture();
  const texWood = woodTexture();

  // ---------- Tanah ----------
  const seg = hi ? 200 : 110;
  const groundGeo = new THREE.PlaneGeometry(WORLD.size * 1.8, WORLD.size * 1.8, seg, seg);
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position;
  const guv = groundGeo.attributes.uv;
  const mix = []; // 0 rumput, 1 tanah/jalan
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    let y = groundHeight(x, z);
    if (overWater(x, z)) y = -1.6 + Math.min(0, -distToRiver(x, z) * 0.1);
    gp.setY(i, y - 0.02);
    guv.setXY(i, x / 6, z / 6);
    mix.push(onPath(x, z) ? 1 : 0);
  }
  groundGeo.setAttribute('aMix', new THREE.Float32BufferAttribute(mix, 1));
  groundGeo.computeVertexNormals();
  const A = assets.textures || {};
  const groundMat = pbrMaterial(A.grass, texGrass, { roughness: 0.95, normalScale: 0.8, color: A.grass ? 0xb8ea7a : 0xffffff });
  const dirtSet = A.dirt;
  groundMat.onBeforeCompile = (shader) => {
    shader.uniforms.tDirt = { value: dirtSet?.map || texDirt };
    shader.uniforms.tDirtN = { value: dirtSet?.normalMap || null };
    shader.uniforms.uHasDirtN = { value: dirtSet?.normalMap ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMix; varying float vMix;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMix = aMix;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDirt; uniform sampler2D tDirtN; uniform float uHasDirtN; varying float vMix;')
      .replace('#include <map_fragment>', `
        vec4 g = texture2D(map, vMapUv);
        vec4 d = texture2D(tDirt, vMapUv * 1.7);
        diffuseColor *= mix(g, d, smoothstep(0.2, 0.8, vMix));
      `)
      .replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP
          vec3 nG = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          vec3 nD = uHasDirtN > 0.5 ? texture2D(tDirtN, vNormalMapUv * 1.7).xyz * 2.0 - 1.0 : nG;
          vec3 mapN = mix(nG, nD, smoothstep(0.2, 0.8, vMix));
          mapN.xy *= normalScale;
          normal = normalize( tbn * mapN );
        #endif
      `);
  };
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  // ---------- Rumput (instanced blades) ----------
  // Tiap instance = serumpun helai, biar padat tanpa nambah instance terlalu banyak
  const bladeCount = hi ? 200000 : 60000;
  let gseed = 1234567;
  const grnd = () => { gseed = (gseed + 0x6D2B79F5) | 0; let t = Math.imul(gseed ^ (gseed >>> 15), 1 | gseed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const tuft = [];
  for (let b = 0; b < (hi ? 5 : 4); b++) {
    const g = new THREE.PlaneGeometry(0.032, 0.5, 1, 2);
    g.translate(0, 0.25, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 - Math.pow(p.getY(i) / 0.5, 2) * 0.95));
    const h = 0.6 + grnd() * 0.7, a = grnd() * 6.28, r = grnd() * 0.17;
    g.scale(1, h, 1);
    g.rotateY(grnd() * Math.PI);
    g.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    tuft.push(g);
  }
  const bladeGeo = mergeGeometries(tuft);
  const bladeMat = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide });
  bladeMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = bladeMat.userData.wind;
    shader.uniforms.uWind = windScale;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uWind; varying float vH;')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(transformed, 1.0);
        float ph = wp.x * 0.5 + wp.z * 0.4;
        float k = uv.y * uv.y;
        transformed.x += (sin(uTime * 1.8 + ph) * 0.5 + sin(uTime * 3.1 + ph * 2.3) * 0.25) * 0.2 * k * uWind;
        transformed.z += cos(uTime * 1.4 + ph) * 0.1 * k * uWind;
        vH = uv.y;
      `);
    // Normal selalu ke atas: rumput kena cahaya kayak tanahnya, sisi belakang nggak jadi item
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.32, 0.85, vH);');
  };
  bladeMat.userData.wind = { value: 0 };
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, bladeCount);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const colorTmp = new THREE.Color();
  let seed = 3;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  let placed = 0;
  // lebih padat deket taman, makin jarang ke pinggir
  while (placed < bladeCount) {
    const ang = grnd() * Math.PI * 2, rad = Math.pow(grnd(), 0.6) * 85;
    const x = WORLD.park.x * 0.4 + Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    if (isWater(x, z) || onPath(x, z) || distToRiver(x, z) < 3.6) continue;
    if (Math.hypot(x - WORLD.cafe.x, z - WORLD.cafe.z) < 7) continue;
    if (Math.abs(x - WORLD.pier.x) < WORLD.pier.len / 2 + 0.6 && Math.abs(z - WORLD.pier.z) < WORLD.pier.w / 2 + 0.3) continue;
    if (onBridge(x, z)) continue;
    const y = groundHeight(x, z);
    v3.set(x, y, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), grnd() * Math.PI);
    const patch = Math.sin(x * 0.13 + Math.sin(z * 0.09) * 2) * 0.5 + Math.sin(z * 0.17 + x * 0.05) * 0.5;
    const sc = 0.55 + grnd() * 0.5 + Math.max(0, patch) * 0.45;
    s3.set(1, sc, 1);
    m4.compose(v3, q, s3);
    blades.setMatrixAt(placed, m4);
    {
      const u = grnd(), dry = Math.max(0, -patch) * 0.65 * grnd();
      colorTmp.setRGB(0.07 + u * 0.09 + dry * 0.2, 0.13 + u * 0.09 + dry * 0.1, 0.03 + u * 0.03 + dry * 0.04);
    }
    blades.setColorAt(placed, colorTmp);
    placed++;
  }
  blades.instanceMatrix.needsUpdate = true;
  blades.castShadow = false;
  blades.receiveShadow = true;
  group.add(blades);

  // ---------- Air (reflektif) ----------
  const sunDir = new THREE.Vector3(0.3, 0.8, 0.5).normalize();
  function makeWater(geo, color) {
    const w = new Water(geo, {
      textureWidth: hi ? 512 : 256,
      textureHeight: hi ? 512 : 256,
      waterNormals: texWaterN,
      sunDirection: sunDir.clone(),
      sunColor: 0xffffff,
      waterColor: color,
      distortionScale: 2.4,
      fog: true,
    });
    w.material.uniforms.size.value = 3.5;
    // Pantulan air nggak perlu rumput: ini yang paling makan GPU
    const reflect = w.onBeforeRender;
    w.onBeforeRender = (renderer, scene, camera) => {
      if (Math.hypot(camera.position.x - WORLD.lake.x, camera.position.z - WORLD.lake.z) > WORLD.lake.r + 55) return;
      blades.visible = false;
      reflect.call(w, renderer, scene, camera);
      blades.visible = true;
    };
    return w;
  }
  const lake = makeWater(new THREE.CircleGeometry(WORLD.lake.r, 64), 0x0f3b4a);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(WORLD.lake.x, -0.2, WORLD.lake.z);
  group.add(lake);
  const riverGeo = ribbonGeometry(riverCurve, 6.4);
  const river = new THREE.Mesh(riverGeo, new THREE.MeshStandardMaterial({
    color: 0x1f5a68, roughness: 0.12, metalness: 0.1,
    transparent: true, opacity: 0.82, normalMap: texWaterN, normalScale: new THREE.Vector2(0.35, 0.35),
  }));
  river.position.y = -0.2;
  group.add(river);
  const shallows = new THREE.Mesh(shallowGeometry(riverCurve), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  shallows.position.y = -0.17;
  group.add(shallows);

  // Tepian air (pasir basah)
  const shoreMat = new THREE.MeshStandardMaterial({ color: 0x6b5d45, roughness: 1 });
  const shore = new THREE.Mesh(new THREE.RingGeometry(WORLD.lake.r - 1.2, WORLD.lake.r + 1.4, 64), shoreMat);
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(WORLD.lake.x, 0.01, WORLD.lake.z);
  group.add(shore);

  // ---------- Air mancur ----------
  const stoneMat = pbrMaterial(A.stone, texStone, { roughness: 0.85, repeat: 2 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.5, 0.75, 48, 1, true), stoneMat);
  basin.position.set(WORLD.fountain.x, 0.37, WORLD.fountain.z);
  // kolam air mancur: tepinya setinggi lutut, bisa dilompatin tapi nggak ditembus
  addObstacle(WORLD.fountain.x, WORLD.fountain.z, 2.5, 2.5, 0.8);
  const basinRim = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.18, 12, 48), stoneMat);
  basinRim.rotation.x = Math.PI / 2;
  basinRim.position.set(WORLD.fountain.x, 0.75, WORLD.fountain.z);
  const basinWater = new THREE.Mesh(new THREE.CircleGeometry(3.1, 40), new THREE.MeshStandardMaterial({
    color: 0x1d5e73, roughness: 0.1, metalness: 0.2, normalMap: texWaterN, normalScale: new THREE.Vector2(0.3, 0.3),
  }));
  basinWater.rotation.x = -Math.PI / 2;
  basinWater.position.set(WORLD.fountain.x, 0.62, WORLD.fountain.z);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 2.4, 24), stoneMat);
  column.position.set(WORLD.fountain.x, 1.2, WORLD.fountain.z);
  basin.castShadow = column.castShadow = true;
  group.add(basin, basinRim, basinWater, column);
  const sprayCount = 600;
  const spray = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(sprayCount * 3).fill(0), 3)),
    new THREE.PointsMaterial({ color: 0xe8f6ff, size: 0.02, map: dropTexture(), transparent: true, opacity: 0.55, depthWrite: false }),
  );
  spray.position.set(WORLD.fountain.x, 2.4, WORLD.fountain.z);
  group.add(spray);

  // ---------- Bangku ----------
  const woodMat = pbrMaterial(A.wood, texWood, { roughness: 0.7, repeat: 1 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.5, metalness: 0.8 });
  function bench(x, z, rotY) {
    const b = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.18), woodMat);
      slat.position.set(0, 0.55, -0.22 + i * 0.22);
      b.add(slat);
    }
    for (let i = 0; i < 2; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.05), woodMat);
      slat.position.set(0, 0.8 + i * 0.22, -0.34);
      slat.rotation.x = -0.15;
      b.add(slat);
    }
    for (const sx of [-0.95, 0.95]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.6), ironMat);
      leg.position.set(sx, 0.27, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.08), ironMat);
      arm.position.set(sx, 0.85, -0.34);
      b.add(leg, arm);
    }
    const y = groundHeight(x, z);
    b.position.set(x, y, z);
    b.rotation.y = rotY;
    b.traverse((m) => { m.castShadow = true; m.receiveShadow = true; });
    group.add(b);
    WORLD.benches.push({ x, z, rotY, y });
    // badan bangku padat; dudukannya rendah jadi masih bisa dilompatin dan diinjek
    const along = Math.abs(Math.cos(rotY)) > 0.7;
    addObstacle(x, z, along ? 1.1 : 0.35, along ? 0.35 : 1.1, 0.62);
  }
  bench(20, 9, Math.PI);
  bench(20, -9, 0);
  bench(29, 0, -Math.PI / 2);
  bench(-10, 37, Math.PI * 0.6); // di tepi danau, bukan di dalam air
  bench(44, -40, Math.PI * 0.75);

  // ---------- Dermaga ----------
  const pier = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(WORLD.pier.w, 0.08, 0.6), woodMat);
    plank.position.set(0, 0.3, -WORLD.pier.len / 2 + 0.2 + i * 0.7);
    plank.castShadow = plank.receiveShadow = true;
    pier.add(plank);
  }
  for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 1) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.4, 10), woodMat);
    post.position.set(i * (WORLD.pier.w / 2 - 0.15), -0.6, j * (WORLD.pier.len / 2 - 0.4));
    pier.add(post);
  }
  pier.position.set(WORLD.pier.x, 0, WORLD.pier.z);
  pier.rotation.y = Math.PI / 2;
  group.add(pier);

  // ---------- Jembatan ----------
  for (const def of WORLD.bridges) {
    const bridge = new THREE.Group();
    for (let i = 0; i < 20; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, def.w), woodMat);
      plank.position.set(-def.len / 2 - 0.7 + i * 0.6, 0.5 + Math.sin((i / 19) * Math.PI) * 0.35, 0);
      plank.castShadow = plank.receiveShadow = true;
      bridge.add(plank);
    }
    for (let s = -1; s <= 1; s += 2) {
      for (let i = -5; i <= 5; i += 2.5) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), woodMat);
        const yy = 0.5 + Math.sin(((i + 6) / 12) * Math.PI) * 0.35;
        p.position.set(i, yy + 0.5, s * (def.w / 2 - 0.1));
        bridge.add(p);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.07, 0.07), woodMat);
        rail.position.set(i + 1.25, yy + 1.0, s * (def.w / 2 - 0.1));
        if (i < 5) bridge.add(rail);
      }
    }
    bridge.position.set(def.x, 0, def.z);
    bridge.rotation.y = def.rotY;
    group.add(bridge);
  }

  // Batu pijakan, biar nyebrang di bagian dangkal keliatan disengaja
  const stepMat = new THREE.MeshStandardMaterial({ map: texStone, color: 0xa8a59c, roughness: 0.9 });
  WORLD.steppingStones.forEach(([x, z], i) => {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 1), stepMat);
    stone.position.set(x, -0.14, z);
    stone.scale.set(1, 0.42, 0.9);
    stone.rotation.y = i * 1.7;
    stone.castShadow = stone.receiveShadow = true;
    group.add(stone);
  });

  // ---------- Pohon (batang + kartu daun instanced) ----------
  const trunkMat = pbrMaterial(A.bark, texBark, { roughness: 1, repeat: 1 });
  const treePositions = [];
  seed = 7;
  for (let i = 0; i < (hi ? 160 : 90); i++) {
    const x = (rnd() - 0.5) * WORLD.size * 1.5;
    const z = (rnd() - 0.5) * WORLD.size * 1.5;
    if (isWater(x, z) || distToRiver(x, z) < 5.5 || onPath(x, z)) continue;
    if (Math.hypot(x - WORLD.park.x, z - WORLD.park.z) < WORLD.park.r + 1) continue;
    if (Math.hypot(x - WORLD.lake.x, z - WORLD.lake.z) < WORLD.lake.r + 3) continue;
    if (Math.hypot(x - WORLD.cafe.x, z - WORLD.cafe.z) < 7) continue;
    if (Math.hypot(x - 44, z + 40) < 4) continue;
    treePositions.push([x, z, 0.8 + rnd() * 0.9]);
  }
  // batang pohon padat
  for (const [x, z, s] of treePositions) addObstacle(x, z, 0.26 * s, 0.26 * s, 99);
  const treeModels = assets.trees || [];
  let leafMat = null;
  const treeSets = [];
  const leafWind = { uTime: bladeMat.userData.wind, uWind: windScale };
  if (treeModels.length) {
    // Model asli: pohon deket detail tinggi, pohon jauh versi ringan
    const perModel = treeModels.map(() => []);
    treePositions.forEach((tp, i) => perModel[i % treeModels.length].push(tp));
    treeModels.forEach((model, mi) => {
      const list = perModel[mi];
      if (!list.length) return;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const h = Math.max(0.01, box.max.y - box.min.y);
      const norm = 11 / h; // tinggi pohon ~11 m
      const items = list.map(([x, z, sc]) => {
        return { x, z, y: groundHeight(x, z) - box.min.y * norm * sc, s: norm * sc, ry: rnd() * Math.PI * 2 };
      });
      treeSets.push(new Scatter(group, [
        { far: 32, parts: partsOf(model, { wind: leafWind }) },
        { far: 400, parts: partsOf(assets.treesFar?.[mi] || model) },
      ], items, Math.max(box.max.x - box.min.x, h), [Math.min(list.length, 14), list.length]));
    });
  } else {
    const cardsPerTree = hi ? 110 : 60;
    const leafGeo = new THREE.PlaneGeometry(1.6, 1.6);
    leafMat = new THREE.MeshStandardMaterial({
      map: texLeaf, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: 0xd8ffd0,
    });
    addWind(leafMat, { strength: 0.12, leaf: true });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, treePositions.length * cardsPerTree);
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    let li = 0;
    for (const [x, z, s] of treePositions) {
      const y = groundHeight(x, z);
      const trunkH = 3.2 * s;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.32 * s, trunkH, 9), trunkMat);
      trunk.position.set(x, y + trunkH / 2, z);
      trunk.castShadow = true;
      group.add(trunk);
      for (let b = 0; b < 3; b++) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.1 * s, 1.6 * s, 6), trunkMat);
        const a = b * 2.1 + rnd();
        br.position.set(x + Math.cos(a) * 0.5 * s, y + trunkH * 0.85, z + Math.sin(a) * 0.5 * s);
        br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
        group.add(br);
      }
      const cx = x, cy = y + trunkH + 0.8 * s, cz = z;
      const cr = 2.1 * s;
      for (let c = 0; c < cardsPerTree; c++) {
        const u = rnd(), v = rnd(), w = Math.cbrt(rnd());
        const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
        v3.set(cx + Math.sin(ph) * Math.cos(th) * cr * w, cy + Math.cos(ph) * cr * 0.8 * w, cz + Math.sin(ph) * Math.sin(th) * cr * w);
        q.setFromEuler(new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI));
        s3.setScalar(0.9 * s + rnd() * 0.6);
        m4.compose(v3, q, s3);
        leaves.setMatrixAt(li, m4);
        colorTmp.setHSL(0.26 + (rnd() - 0.5) * 0.05, 0.45, 0.42 + rnd() * 0.2);
        leaves.setColorAt(li, colorTmp);
        li++;
      }
    }
    leaves.count = li;
    leaves.instanceMatrix.needsUpdate = true;
    group.add(leaves);
  }

  // ---------- Lampu taman ----------
  const lampPositions = [
    [WORLD.park.x + 13, WORLD.park.z + 13], [WORLD.park.x - 13, WORLD.park.z + 13],
    [WORLD.park.x - 13, WORLD.park.z - 13], [WORLD.park.x + 13, WORLD.park.z - 13],
    [WORLD.pier.x + 4, WORLD.pier.z - 8],
  ];
  lampPositions.forEach(([x, z], i) => {
    const y = groundHeight(x, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, 4.2, 12), ironMat);
    post.position.set(x, y + 2.1, z);
    post.castShadow = true;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, 12), ironMat);
    cap.position.set(x, y + 4.45, z);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffb347, emissiveIntensity: 0, roughness: 0.3 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 16), headMat);
    head.position.set(x, y + 4.2, z);
    const light = new THREE.PointLight(0xffb347, 0, 16, 2);
    light.position.set(x, y + 4.0, z);
    group.add(post, cap, head, light);
    addObstacle(x, z, 0.14, 0.14, 99);
    WORLD.lamps.push({ head, headMat, light, on: i < 3 });
  });

  // ---------- Kafe ----------
  const cafe = new THREE.Group();
  const plaster = new THREE.MeshStandardMaterial({ color: 0xe8ddc8, roughness: 0.95 });
  plaster.emissive = new THREE.Color(0x4a3220);
  plaster.emissiveIntensity = 0.35;
  const DOOR_HALF = 1.3;
  const rooms = [];
  // Empat tembok + pintu lebar di tengah satu sisi. doorZ: -1 pintu di utara, 1 di selatan.
  function buildRoom(parent, r, doorZ, mat, base = 0) {
    const side = r.hw - DOOR_HALF, mid = DOOR_HALF + side / 2;
    const panels = [
      [r.hw * 2, ROOM_H, 0.14, 0, ROOM_H / 2, -doorZ * r.hd],
      [0.14, ROOM_H, r.hd * 2, -r.hw, ROOM_H / 2, 0],
      [0.14, ROOM_H, r.hd * 2, r.hw, ROOM_H / 2, 0],
      [side, ROOM_H, 0.14, -mid, ROOM_H / 2, doorZ * r.hd],
      [side, ROOM_H, 0.14, mid, ROOM_H / 2, doorZ * r.hd],
      [DOOR_HALF * 2, ROOM_H - DOOR_H, 0.14, 0, (ROOM_H + DOOR_H) / 2, doorZ * r.hd],
    ];
    const meshes = panels.map(([sx, sy, sz, x, y, z]) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      panel.position.set(x, base + y, z);
      parent.add(panel);
      return panel;
    });
    rooms.push({ r, back: [meshes[0]], left: [meshes[1]], right: [meshes[2]], front: meshes.slice(3), doorZ });
    for (const [x, z, hx, hz] of [[0, -doorZ * r.hd, r.hw, 0.1], [-r.hw, 0, 0.1, r.hd], [r.hw, 0, 0.1, r.hd], [-mid, doorZ * r.hd, side / 2, 0.1], [mid, doorZ * r.hd, side / 2, 0.1]]) {
      addObstacle(r.x + x, r.z + z, hx, hz, 99);
    }
  }
  buildRoom(cafe, CAFE, 1, plaster);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(CAFE.hw * 2 - 0.1, 0.06, CAFE.hd * 2 - 0.1), woodMat);
  floor.position.y = CAFE_FLOOR - 0.01;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x332a1c, emissive: 0xffc98a, emissiveIntensity: 2.4, toneMapped: false });
  for (const x of [-3, 0, 3]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), lampMat);
    lamp.position.set(x, ROOM_H - 1.1, 0);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), ironMat);
    cord.position.set(x, ROOM_H - 0.5, 0);
    cafe.add(lamp, cord);
  }
  const counter = new THREE.Mesh(new THREE.BoxGeometry(5, 1.0, 0.7), woodMat);
  counter.position.set(0, 0.5, -2.6);
  addObstacle(CAFE.x, CAFE.z - 2.6, 2.5, 0.35, 1.0);
  const coffee = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.5), ironMat);
  coffee.position.set(-1.4, 1.45, -2.6);
  const coffeeLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0x223018, emissive: 0xb8ff3c, emissiveIntensity: 2.4, toneMapped: false }));
  coffeeLight.position.set(-1.2, 1.6, -2.33);
  cafe.add(coffee, coffeeLight);
  const stool = (x, z) => {
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 14), woodMat);
    seat.position.set(x, 0.62, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 8), ironMat);
    leg.position.set(x, 0.3, z);
    cafe.add(seat, leg);
  };
  for (const sx of [-1.4, 0, 1.4]) stool(sx, -1.8);
  for (const [tx, tz] of [[-3.3, 0.2], [3.3, 0.2], [-3.3, 2.4], [3.3, 2.4]]) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 18), woodMat);
    top.position.set(tx, 0.82, tz);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, 0.8, 8), ironMat);
    stem.position.set(tx, 0.4, tz);
    cafe.add(top, stem);
    stool(tx - 0.95, tz);
    stool(tx + 0.95, tz);
    addObstacle(CAFE.x + tx, CAFE.z + tz, 0.5, 0.5, 0.85);
  }
  cafe.add(floor, counter);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7.6, 1.9, 4), new THREE.MeshStandardMaterial({ color: 0x3a2f4f, roughness: 0.8 }));
  roof.position.y = ROOM_H + 0.95;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.8;
  const awning = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.06, 1.7), new THREE.MeshStandardMaterial({ color: 0xc2552a, roughness: 0.9 }));
  awning.position.set(0, DOOR_H + 0.3, CAFE.hd + 0.65);
  awning.rotation.x = 0.18;
  const cafeSignCanvas = document.createElement('canvas');
  cafeSignCanvas.width = 512; cafeSignCanvas.height = 90;
  {
    const c = cafeSignCanvas.getContext('2d');
    c.fillStyle = '#231a12'; c.fillRect(0, 0, 512, 90);
    c.fillStyle = '#ffc98a'; c.font = '700 60px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('CAFE', 256, 48);
  }
  const cafeSignTex = new THREE.CanvasTexture(cafeSignCanvas);
  cafeSignTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.74), new THREE.MeshStandardMaterial({ map: cafeSignTex, emissive: 0xffffff, emissiveMap: cafeSignTex, emissiveIntensity: 0.3 }));
  sign.position.set(0, ROOM_H - 0.62, CAFE.hd + 0.09);
  cafe.add(roof, awning, sign);
  WORLD.cafeAwning = awning;
  WORLD.cafeRoof = roof;
  cafe.position.set(WORLD.cafe.x, 0, WORLD.cafe.z);
  cafe.traverse((m) => { m.castShadow = true; m.receiveShadow = true; });
  group.add(cafe);

  // ---------- Minimarket ----------
  const shop = new THREE.Group();
  const { hw, hd } = SHOP;
  const shopWallMat = new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.8, emissive: 0x20282c, emissiveIntensity: 0.5 });
  const shopBase = 0.14;
  const addBox = (sx, sy, sz, x, y, z, mat, parent = shop) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, shopBase + y, z);
    parent.add(m);
    return m;
  };
  buildRoom(shop, SHOP, -1, shopWallMat, shopBase);
  addBox(hw * 2, 0.04, hd * 2, 0, 0.02, 0, new THREE.MeshStandardMaterial({ color: 0xbfc6c4, roughness: 0.35 }));
  const neonMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdff5ff, emissiveIntensity: 2.6, toneMapped: false });
  for (const x of [-2.6, 0, 2.6]) addBox(0.16, 0.05, hd * 1.5, x, ROOM_H - 0.1, 0, neonMat);
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.5, metalness: 0.5 });
  // Barang di rak satu InstancedMesh, biar ratusan kotak tetep satu draw call
  const goodsColors = [0xe0441c, 0xffd166, 0x2d9cdb, 0xb8ff3c, 0xf4f1e6, 0xff8a2a].map((v) => new THREE.Color(v));
  const shelfX = [-3.3, -1], levels = [0.45, 1.0, 1.55, 2.1, 2.65], perRow = 12;
  const goods = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.3, 0.24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), shelfX.length * levels.length * perRow * 2);
  const goodsM = new THREE.Matrix4();
  let goodsN = 0;
  for (const sx of shelfX) {
    addBox(0.5, 3, 4, sx, 1.5, -0.2, shelfMat);
    addObstacle(SHOP.x + sx, SHOP.z - 0.2, 0.25, 2, 99);
    for (const level of levels) {
      for (let i = 0; i < perRow; i++) {
        for (const side of [-1, 1]) {
          goodsM.setPosition(sx + side * 0.3, shopBase + level, -1.95 + i * 0.32);
          goods.setMatrixAt(goodsN, goodsM);
          goods.setColorAt(goodsN, goodsColors[(i * 5 + Math.round(level * 7) + (side > 0 ? 2 : 0)) % goodsColors.length]);
          goodsN++;
        }
      }
    }
  }
  shop.add(goods);
  const fridgeMat = new THREE.MeshStandardMaterial({ color: 0x8fd4ff, emissive: 0x4fb4ff, emissiveIntensity: 0.9, roughness: 0.2 });
  addBox(3.4, 3, 0.5, -2.2, 1.5, hd - 0.35, fridgeMat);
  addObstacle(SHOP.x - 2.2, SHOP.z + hd - 0.35, 1.7, 0.25, 99);
  const till = addBox(2.6, 1, 0.7, 2.4, 0.5, 1.9, woodMat);
  till.castShadow = true;
  addObstacle(SHOP.x + 2.4, SHOP.z + 1.9, 1.3, 0.35, 1.14);
  addBox(0.4, 0.3, 0.3, 2, 1.15, 1.9, ironMat);
  const shopRoof = addBox(hw * 2 + 0.3, 0.18, hd * 2 + 0.3, 0, ROOM_H + 0.08, 0, new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8 }));
  const shopSignCanvas = document.createElement('canvas');
  shopSignCanvas.width = 512; shopSignCanvas.height = 96;
  {
    const c = shopSignCanvas.getContext('2d');
    c.fillStyle = '#10131a'; c.fillRect(0, 0, 512, 96);
    c.fillStyle = '#b8ff3c'; c.font = '700 58px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('MINI MART', 256, 50);
  }
  const shopSign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.74), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(shopSignCanvas), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.25 }));
  shopSign.material.map.colorSpace = THREE.SRGBColorSpace;
  shopSign.position.set(0, shopBase + ROOM_H - 0.8, -hd - 0.1);
  shopSign.rotation.y = Math.PI;
  shop.add(shopSign);
  shop.position.set(SHOP.x, 0, SHOP.z);
  shop.traverse((m) => { if (m.isMesh && m !== shopSign && m !== goods) { m.castShadow = true; m.receiveShadow = true; } });
  group.add(shop);
  WORLD.shopRoof = shopRoof;

  // ---------- Generator ----------
  const genBody = new THREE.MeshStandardMaterial({ color: 0x4b5058, roughness: 0.6, metalness: 0.6 });
  const genStripe = new THREE.MeshStandardMaterial({ color: 0xffc83a, roughness: 0.7 });
  const genGeo = new THREE.BoxGeometry(1.6, 1.8, 1.3), stripeGeo = new THREE.BoxGeometry(1.62, 0.14, 1.32);
  const leverGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), knobGeo = new THREE.SphereGeometry(0.11, 10, 8), lampGeo = new THREE.SphereGeometry(0.15, 12, 8);
  const genOff = new THREE.MeshStandardMaterial({ color: 0x401010, emissive: 0xff2a1a, emissiveIntensity: 1.6, toneMapped: false });
  const genOn = new THREE.MeshStandardMaterial({ color: 0x103010, emissive: 0x4dff5a, emissiveIntensity: 3, toneMapped: false });
  for (const g of WORLD.generators) {
    const m = new THREE.Group(), y = groundHeight(g.x, g.z);
    const body = new THREE.Mesh(genGeo, genBody);
    body.position.y = 0.9;
    body.castShadow = true;
    const stripe = new THREE.Mesh(stripeGeo, genStripe);
    stripe.position.y = 1.5;
    const lamp = new THREE.Mesh(lampGeo, genOff);
    lamp.position.y = 1.95;
    const lever = new THREE.Group();
    lever.position.set(0.5, 1, 0.68);
    const stick = new THREE.Mesh(leverGeo, ironMat);
    stick.position.y = 0.3;
    const knob = new THREE.Mesh(knobGeo, genStripe);
    knob.position.y = 0.62;
    lever.add(stick, knob);
    lever.rotation.x = -0.7;
    m.add(body, stripe, lamp, lever);
    m.position.set(g.x, y, g.z);
    group.add(m);
    g.lamp = lamp; g.lever = lever; g.on = false;
    addObstacle(g.x, g.z, 0.8, 0.65, y + 1.8);
  }

  // ---------- Papan harga di jalan masuk kota ----------
  const boardPos = { x: 28, z: 43 };
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 1024; boardCanvas.height = 512;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.55, roughness: 0.6 });
  const boardFace = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), boardMat);
  boardFace.position.set(boardPos.x, 5.6, boardPos.z - 0.09);
  boardFace.rotation.y = Math.PI;
  const boardBack = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.7, 0.16), ironMat);
  boardBack.position.set(boardPos.x, 5.6, boardPos.z);
  group.add(boardFace, boardBack);
  for (const dx of [-2.6, 2.6]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 4, 8), ironMat);
    pole.position.set(boardPos.x + dx, 2, boardPos.z);
    pole.castShadow = true;
    group.add(pole);
    addObstacle(boardPos.x + dx, boardPos.z, 0.15, 0.15, 99);
  }

  // ---------- Lounge holder di atap ----------
  const club = new THREE.Group();
  const neon = new THREE.MeshStandardMaterial({ color: 0x223018, emissive: 0xb8ff3c, emissiveIntensity: 2.4, toneMapped: false });
  const rimY = CLUB.h + 0.35, cx = CLUB.x + CLUB.w / 2, cz = CLUB.z + CLUB.d / 2;
  for (const [sx, sz, x, z] of [[CLUB.w, 0.08, cx, CLUB.z], [CLUB.w, 0.08, cx, CLUB.z + CLUB.d], [0.08, CLUB.d, CLUB.x, cz], [0.08, CLUB.d, CLUB.x + CLUB.w, cz]]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.08, sz), neon);
    rim.position.set(x, rimY, z);
    club.add(rim);
  }
  const sofaMat = new THREE.MeshStandardMaterial({ color: 0x3b1f8f, roughness: 0.7 });
  for (const dx of [-1.6, 1.6]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 0.8), sofaMat);
    seat.position.set(cx + dx, CLUB.h + 0.23, cz + 1);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.2), sofaMat);
    back.position.set(cx + dx, CLUB.h + 0.7, cz + 1.3);
    club.add(seat, back);
  }
  group.add(club);

  // ---------- Jendela holder: jendela wallet pemain plus sorot lime biar gampang dicari ----------
  const holderGlow = new THREE.MeshBasicMaterial({ color: 0xb8ff3c, toneMapped: false });
  const holderBeamMat = new THREE.MeshBasicMaterial({ color: 0xb8ff3c, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false });
  const holderWindow = new THREE.Group();
  const holderPane = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 1.87), holderGlow);
  holderPane.rotation.y = Math.PI;
  const holderBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 70, 8, 1, true), holderBeamMat);
  holderBeam.position.set(0, 35, -0.4);
  holderWindow.add(holderPane, holderBeam);
  holderWindow.visible = false;
  group.add(holderWindow);

  // ---------- Paket kiriman + bagian tubuh VUZZ ----------
  const glowOrange = new THREE.MeshStandardMaterial({ color: 0x5a1a08, emissive: 0xff5a1f, emissiveIntensity: 2.4, toneMapped: false });
  const parcelMesh = new THREE.Group();
  const parcelBox = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.5), new THREE.MeshStandardMaterial({ color: 0xa97a4a, roughness: 0.9 }));
  parcelBox.castShadow = true;
  const parcelTape = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.44, 0.1), new THREE.MeshStandardMaterial({ color: 0xb8ff3c, emissive: 0xb8ff3c, emissiveIntensity: 1.8, toneMapped: false }));
  parcelMesh.add(parcelBox, parcelTape);
  parcelMesh.position.set(WORLD.parcel.x, groundHeight(WORLD.parcel.x, WORLD.parcel.z) + 0.25, WORLD.parcel.z);
  group.add(parcelMesh);
  const partGeo = { antenna: new THREE.CylinderGeometry(0.06, 0.1, 0.9, 8), plate: new THREE.BoxGeometry(0.7, 0.12, 0.5), core: new THREE.IcosahedronGeometry(0.3, 0) };
  for (const p of WORLD.parts) {
    const base = p.y ?? Math.max(groundHeight(p.x, p.z), -0.2);
    p.y = base;
    p.mesh = new THREE.Mesh(partGeo[p.id], glowOrange);
    p.baseY = base + 0.7;
    p.mesh.position.set(p.x, p.baseY, p.z);
    group.add(p.mesh);
  }
  WORLD.cafeSign = sign.material;

  // ---------- Papan pengumuman ----------
  const board = new THREE.Group();
  const bb = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 0.12), woodMat);
  bb.position.y = 1.9;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4), new THREE.MeshStandardMaterial({ map: noticeTexture(), roughness: 1 }));
  paper.position.set(0, 1.9, 0.07);
  for (const sx of [-1.2, 1.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), woodMat);
    leg.position.set(sx, 0.6, 0);
    board.add(leg);
  }
  board.add(bb, paper);
  board.position.set(WORLD.park.x + 4, 0, WORLD.park.z - 17);
  board.traverse((m) => { m.castShadow = true; });
  group.add(board);

  // ---------- Menara lampu komunitas ----------
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 7.5, 16), ironMat);
  tower.position.set(WORLD.park.x + 6, 3.75, WORLD.park.z + 6);
  tower.castShadow = true;
  group.add(tower);
  const towerLights = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshStandardMaterial({ color: 0xb8ff3c, emissive: 0xb8ff3c, emissiveIntensity: i < 3 ? 2.5 : 0, roughness: 0.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 10, 32), m);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(WORLD.park.x + 6, 1.6 + i * 1.25, WORLD.park.z + 6);
    group.add(ring);
    towerLights.push(m);
  }
  WORLD.towerLights = towerLights;

  // ---------- Sinyal quest ----------
  const sigGeo = new THREE.OctahedronGeometry(0.35, 0);
  const sigGlow = new THREE.SpriteMaterial({ map: dropTexture(), color: 0xb8ff3c, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const [x, z] of [[-22, 22], ...CITY_SIGNALS, [44, -38], [-50, -10]]) {
    const m = new THREE.MeshStandardMaterial({ color: 0xb8ff3c, emissive: 0xb8ff3c, emissiveIntensity: 2.5, roughness: 0.2 });
    const s = new THREE.Mesh(sigGeo, m);
    s.position.set(x, groundHeight(x, z) + 1.2, z);
    s.add(new THREE.Sprite(sigGlow));
    s.children[0].scale.setScalar(3.4);
    group.add(s);
    WORLD.signals.push({ mesh: s, x, z, taken: false });
  }

  buildCity(group, { hi, A, props: assets.props, fallback: texStone });
  buildPaths(group, lightPath(pbrMaterial(A.sidewalk, texStone, { roughness: 0.95, color: 0xfff0cc })), hi);
  buildSignposts(group, woodMat, [
    { x: 27.5, z: 3.2, to: ['lake', 'pier', 'hill', 'cafe', 'city'] },
    { x: 22.6, z: 24.4, to: ['city', 'pier', 'park'] },
    { x: 22.6, z: -28, to: ['hill', 'park'] },
    { x: 46.4, z: 2.4, to: ['cafe', 'park'] },
    { x: 5.4, z: 2.2, to: ['bridge', 'park'] },
    { x: 22.6, z: 43, to: ['city', 'park'] },
  ]);

  // ---------- Batu ----------
  const rockMat = new THREE.MeshStandardMaterial({ map: texStone, roughness: 0.95 });
  for (let i = 0; i < 28; i++) {
    let x, z;
    if (i < 8) { const p = riverCurve.getPointAt(0.28 + i * 0.025); x = p.x + (i % 2 ? 1 : -1) * 1.4; z = p.z; }
    else { const a = rnd() * Math.PI * 2; const r = WORLD.lake.r + 0.6 + rnd() * 1.5; x = WORLD.lake.x + Math.cos(a) * r; z = WORLD.lake.z + Math.sin(a) * r; }
    const rockSize = 0.3 + rnd() * 0.5;
    if (WORLD.bridges.some((b) => Math.hypot(x - b.x, z - b.z) < 8)) continue;
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rockSize, 1), rockMat);
    r.position.set(x, groundHeight(x, z) - 0.15, z);
    r.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    r.scale.set(1, 0.6 + rnd() * 0.4, 1);
    r.castShadow = r.receiveShadow = true;
    group.add(r);
  }

  // ---------- Burung ----------
  const birds = new THREE.Group();
  const birdMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Group();
    const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), birdMat);
    const wingR = wingL.clone();
    wingL.position.x = -0.25; wingR.position.x = 0.25;
    b.add(wingL, wingR);
    b.userData = { wingL, wingR };
    birds.add(b);
  }
  group.add(birds);

  // ---------- Ikan ----------
  const fish = [];
  const fishMat = new THREE.MeshStandardMaterial({ color: 0xc9d4d8, metalness: 0.6, roughness: 0.3 });
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), fishMat);
    f.visible = false;
    group.add(f);
    fish.push({ mesh: f, t: Math.random() * 10, angle: Math.random() * Math.PI * 2, r: 6 + Math.random() * 10 });
  }

  // ---------- Debu / serbuk di udara (partikel halus) ----------
  const moteCount = hi ? 900 : 300;
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 120;
    motePos[i * 3 + 1] = Math.random() * 10;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 120;
  }
  const motes = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(motePos, 3)),
    new THREE.PointsMaterial({ color: 0xfff4d6, size: 0.05, map: dropTexture(), transparent: true, opacity: 0.5, depthWrite: false }),
  );
  group.add(motes);

  const waters = [lake];

  const weather = createWeather(scene, renderer, { hi, waters, wind: windScale });
  const npcs = createNpcs(group);
  WORLD.npcs = npcs.live;
  WORLD.interactables.push({ id: 'rooftop', name: 'Rooftop', x: ROOF.cx, z: ROOF.cz, line: 'You can see the whole city from up here. Every dark window is somebody who left.' });
  for (const s of npcs.sisters) {
    WORLD.interactables.push({ id: 'unit', name: 'Dormant unit', x: s.root.position.x, z: s.root.position.z, line: 'Another mind of the network. Still asleep. More burns will wake it.' });
  }

  const ecosystem = createEcosystem(group, {
    hi, groundHeight, isWater, blocked: blockedByBuilding,
    centers: [[36, 12], [6, 10], [34, -16], [-30, -6], [10, 30]],
    lake: WORLD.lake, onPier, river: riverCurve.getSpacedPoints(30), park: WORLD.park,
  });
  let player = null, finale = null;

  const api = {
    group, waters, river, lake, npcs, ecosystem,
    setPlayer(pos) { player = pos; },
    finaleDone: false,
    npcTalk(id, seconds = 4) { npcs.talk(id, seconds); },
    // Momen akhir: lampu nyala satu-satu, jendela nyusul, dua unit bangun. Cuma sekali.
    playFinale({ onLamp, onDone } = {}) {
      if (finale || api.finaleDone) return 0;
      setCityLights(0);
      finale = { t: 0, next: 0, onLamp, onDone, woke: false };
      ecosystem.burst(FINALE_SECONDS);
      return FINALE_SECONDS;
    },
    setWeather(opts) { weather.set(opts); },
    // Lampu status + jendela sekota. Aman dipanggil berulang, misal pas muat save.
    setGenerator(id, on) {
      const g = WORLD.generators.find((k) => k.id === id);
      if (!g) return;
      g.on = on;
      g.lamp.material = on ? genOn : genOff;
      g.lever.rotation.x = on ? 0.7 : -0.7;
      setCityPower(WORLD.generators.filter((k) => k.on).length);
    },
    setParcel(visible) { parcelMesh.visible = visible; },
    setHolderWindow(spot) {
      holderWindow.visible = !!spot;
      if (spot) holderWindow.position.set(spot.x, spot.y, spot.z);
    },
    // tag: LIVE atau DEMO, biar nggak ada angka palsu yang keliatan asli
    setBillboard({ tag, price, note }) {
      const c = boardCanvas.getContext('2d');
      c.fillStyle = '#0d1016'; c.fillRect(0, 0, 1024, 512);
      c.textBaseline = 'middle';
      c.fillStyle = '#b8ff3c'; c.font = '700 96px sans-serif'; c.textAlign = 'left';
      c.fillText('7POD', 56, 96);
      c.fillStyle = tag === 'LIVE' ? '#b8ff3c' : '#ffb347'; c.font = '700 64px sans-serif'; c.textAlign = 'right';
      c.fillText(tag, 968, 96);
      c.fillStyle = '#ece6d6'; c.font = '700 120px sans-serif'; c.textAlign = 'left';
      c.fillText(price, 56, 270);
      c.fillStyle = '#a7a396'; c.font = '48px sans-serif';
      c.fillText(note, 56, 420);
      boardTex.needsUpdate = true;
    },
    setPart(id, visible) {
      const p = WORLD.parts.find((k) => k.id === id);
      if (p) p.mesh.visible = visible;
    },
    get weather() { return weather.state; },
    updateTrees(camera) { for (const t of treeSets) t.update(camera); },
    // Pemain di dalam ruangan: kamera boleh di luar, tembok yang ngalangin ilang
    updateRooms(camera) {
      if (!player) return;
      let inside = null;
      const c = camera.position;
      for (const room of rooms) {
        const { r, back, left, right, front, doorZ } = room;
        const isIn = Math.abs(player.x - r.x) < r.hw && Math.abs(player.z - r.z) < r.hd;
        if (isIn) inside = r;
        const show = (list, hide) => { for (const m of list) m.visible = !(isIn && hide); };
        show(left, c.x < r.x - r.hw);
        show(right, c.x > r.x + r.hw);
        show(back, (c.z - r.z) * -doorZ > r.hd);
        show(front, (c.z - r.z) * doorZ > r.hd);
      }
      setInsideRoom(inside);
    },
    setSun(dir, color) {
      weather.apply();
      for (const w of waters) {
        w.material.uniforms.sunDirection.value.copy(dir);
        w.material.uniforms.sunColor.value.copy(color);
      }
    },
    update(t, dt) {
      weather.update(t, dt);
      if (finale) {
        finale.t += dt;
        if (finale.next < 5 && finale.t >= 0.4 + finale.next * 0.8) {
          setCityLights(finale.next + 1);
          finale.onLamp?.(finale.next);
          finale.next++;
        }
        setCityFinale(Math.min(0.95, (finale.t / 6.5) * 0.95));
        if (!finale.woke && finale.t > 5) { finale.woke = true; npcs.wakeSisters(); }
        if (finale.t >= FINALE_SECONDS) {
          const done = finale.onDone;
          finale = null;
          api.finaleDone = true;
          done?.();
        }
      }
      for (const p of WORLD.parts) {
        if (!p.mesh.visible) continue;
        p.mesh.position.y = p.baseY + Math.sin(t * 2) * 0.1;
        p.mesh.rotation.y = t;
      }
      if (player) {
        const inShop = Math.abs(player.x - SHOP.x) < SHOP.hw && Math.abs(player.z - SHOP.z) < SHOP.hd;
        WORLD.shopRoof.visible = !inShop;
      }
      if (WORLD.cafeRoof && player) {
        const inside = Math.abs(player.x - CAFE.x) < CAFE.hw && Math.abs(player.z - CAFE.z) < CAFE.hd;
        WORLD.cafeRoof.visible = WORLD.cafeAwning.visible = !inside;
      }
      npcs.update(dt, t, cityLightCount, player);
      ecosystem.update(dt, t, nightNow, player);
      bladeMat.userData.wind.value = t;
      if (leafMat) leafMat.userData.wind.value = t;
      for (const w of waters) w.material.uniforms.time.value = t * 0.6;
      texWaterN.offset.set(t * 0.015, t * 0.02);
      // air mancur
      const sp = spray.geometry.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const ph = (t * 1.1 + i * 0.173) % 1;
        const a = i * 2.399;
        const rad = ph * 2.0 + Math.sin(i) * 0.1;
        sp.setXYZ(i, Math.cos(a) * rad, (1 - ph) * ph * 4.5 + 0.1, Math.sin(a) * rad);
      }
      sp.needsUpdate = true;
      // burung
      birds.children.forEach((b, i) => {
        const a = t * 0.22 + i * 0.7;
        const r = 26 + (i % 3) * 6;
        b.position.set(WORLD.lake.x + Math.cos(a) * r, 16 + Math.sin(t * 0.7 + i) * 2, WORLD.lake.z + Math.sin(a) * r);
        b.rotation.y = -a + Math.PI / 2;
        const flap = Math.sin(t * 7 + i) * 0.7;
        b.userData.wingL.rotation.z = flap;
        b.userData.wingR.rotation.z = -flap;
      });
      // ikan
      for (const f of fish) {
        f.t += dt;
        const cycle = f.t % 8;
        if (cycle < 1.1) {
          f.mesh.visible = true;
          const k = cycle / 1.1;
          f.mesh.position.set(
            WORLD.lake.x + Math.cos(f.angle) * f.r + k * 1.2,
            -0.3 + Math.sin(k * Math.PI) * 1.2,
            WORLD.lake.z + Math.sin(f.angle) * f.r,
          );
          f.mesh.rotation.z = -Math.PI / 2 + (k - 0.5) * 2.4;
        } else {
          f.mesh.visible = false;
          if (cycle > 7.9) f.angle = Math.random() * Math.PI * 2;
        }
      }
      // sinyal
      for (const s of WORLD.signals) {
        if (s.taken) continue;
        s.mesh.rotation.y = t * 1.5;
        s.mesh.position.y = groundHeight(s.x, s.z) + 1.2 + Math.sin(t * 2 + s.x) * 0.2;
      }
      // debu melayang
      motes.position.y = Math.sin(t * 0.3) * 0.5;
      motes.rotation.y = t * 0.01;
    },
  };
  if (import.meta.env.DEV) window.__world = api;
  return api;
}

const FINALE_SECONDS = 9;
let cityLightCount = 3;
let nightNow = 0;
export function setCityLights(n) {
  cityLightCount = n;
  WORLD.lamps.forEach((l, i) => { l.on = i < n; });
  setCityLit(n);
  WORLD.towerLights?.forEach((m, i) => { m.emissiveIntensity = i < n ? 2.5 : 0; });
}

export function applyNight(nightAmount) {
  nightNow = nightAmount;
  if (WORLD.signGlow) WORLD.signGlow.emissiveIntensity = nightAmount * 2.2;
  setCityNight(nightAmount);
  for (const l of WORLD.lamps) {
    const k = l.on ? nightAmount : 0;
    l.headMat.emissiveIntensity = k * 4;
    l.light.intensity = k * 40;
  }
  if (WORLD.cafeSign) WORLD.cafeSign.emissiveIntensity = 0.3 + nightAmount * 0.7;
}
