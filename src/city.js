import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pbrMaterial } from './assets.js';
import { partsOf } from './scatter.js';

// Kota yang padam di tepi taman. Jendelanya nyala ngikutin lampu kota.
export const CITY = { x0: -8, x1: 126, z0: 44, z1: 126 };
const COLS = [[-8, 4], [12, 30], [38, 56], [64, 82], [90, 104]];
const ROWS = [[56, 74], [82, 104]];
const ROADS_X = [8, 34, 60, 86];
const ROADS_Z = [50, 78];
const LAMP_HEAD = { y: 6.42, r: 0.3 };

let seed = 41;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

export const BUILDINGS = [];
for (const [c0, c1] of COLS) {
  for (let ri = 0; ri < ROWS.length; ri++) {
    const [r0, r1] = ROWS[ri];
    const depth = (r1 - r0 - 4) / 2;
    for (const front of [true, false]) {
      let x = c0 + 1.3;
      while (x < c1 - 5) {
        let w = 7 + rnd() * 6;
        if (x + w > c1 - 3) w = c1 - 1.3 - x;
        const d = depth - rnd() * 1.5;
        const z = front ? r0 + 1.5 : r1 - 1.5 - d;
        const h = (8 + rnd() * rnd() * 24) * (front ? 1 : 1.35) * (ri ? 1.25 : 1);
        BUILDINGS.push({ x, z, w, d, h, brick: rnd() < 0.35, seed: rnd() });
        x += w + 1;
      }
    }
  }
}
const SKYLINE = [];
for (let x = -24; x < 124; x += 11 + rnd() * 7) {
  SKYLINE.push({ x, z: 108 + rnd() * 6, w: 9 + rnd() * 6, d: 10, h: 30 + rnd() * 30, brick: false, seed: rnd() });
}

const inRect = (x, z, a, b) => x > a[0] && x < a[1] && z > b[0] && z < b[1];
export const inCity = (x, z) => x > CITY.x0 && z > CITY.z0;
export function onSidewalk(x, z) {
  return COLS.some((c) => ROWS.some((r) => inRect(x, z, c, r)));
}
// Mobil dan pembatas jalan, diisi pas kota dibangun
const OBSTACLES = [];
export const addObstacle = (x, z, hx, hz) => OBSTACLES.push({ x, z, hx, hz });
export function blockedByBuilding(x, z) {
  const pad = 0.55;
  const inside = (b) => x > b.x - pad && x < b.x + b.w + pad && z > b.z - pad && z < b.z + b.d + pad;
  return BUILDINGS.some(inside) || SKYLINE.some(inside)
    || OBSTACLES.some((o) => Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad);
}
// Dua sinyal quest di kota: gang paling lebar di blok tengah, dan ujung jalan dekat skyline
function alleySpot() {
  let best = [21, 65], width = 0;
  for (let x = 14; x < 29; x += 1) {
    let run = 0;
    for (let z = 58; z < 73; z += 0.25) {
      run = blockedByBuilding(x, z) ? 0 : run + 0.25;
      if (run > width) { width = run; best = [x, z - run / 2]; }
    }
  }
  return best;
}
export const CITY_SIGNALS = [alleySpot(), [60, 103]];

// Buat kamera: cuma tembok asli yang lebih tinggi dari kamera, mobil dan pagar nggak dihitung
export function cameraBlocked(x, y, z) {
  const pad = 0.25;
  const hit = (b) => y < b.h + 3 && x > b.x - pad && x < b.x + b.w + pad && z > b.z - pad && z < b.z + b.d + pad;
  return BUILDINGS.some(hit) || SKYLINE.some(hit);
}

// 0 di kota, 1 di luar: buat ngeratain tanah di bawah jalan
export function cityFlat(x, z) {
  const d = Math.max(CITY.x0 - x, CITY.z0 - z);
  const t = Math.min(1, Math.max(0, d / 10));
  return t * t * (3 - 2 * t);
}

export const cityUniforms = { uLit: { value: 0.27 }, uGlow: { value: 0 }, uFill: { value: 0 } };
const pools = { mesh: null, heads: null, total: 0, lit: 3, night: 0 };
const updateFill = () => { cityUniforms.uFill.value = pools.night * (0.08 + 0.14 * pools.lit / 5); };

// Cahaya pantul kota: sekadar biar gang gelap tapi masih kebaca
function addFill(mat, inner) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    s.uniforms.uFill = cityUniforms.uFill;
    s.fragmentShader = 'uniform float uFill;\n' + s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uFill;');
  };
  return mat;
}

// Dipanggil pas lampu kota nambah dan tiap ganti waktu
export function setCityLit(n) {
  cityUniforms.uLit.value = n * 0.09;
  pools.lit = n;
  updateFill();
  const on = Math.round(pools.total * n / 5);
  if (pools.mesh) { pools.mesh.count = on; pools.heads.count = on; }
}
export function setCityNight(night) {
  cityUniforms.uGlow.value = night * 1.15;
  pools.night = night;
  updateFill();
  if (pools.mesh) {
    pools.mesh.material.opacity = night * 0.6;
    pools.heads.material.emissiveIntensity = 0.1 + night * 3.4;
  }
}

function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,205,140,0.6)');
  g.addColorStop(0.35, 'rgba(255,180,105,0.26)');
  g.addColorStop(1, 'rgba(255,160,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function boxPiece(b, y0, w, h, d, ox, oz) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(b.x + ox + w / 2, y0 + h / 2, b.z + oz + d / 2);
  // Ukuran dalam meter per sisi, buat grid jendela. Atap ditandai -1.
  const n = g.attributes.position.count, m = new Float32Array(n * 2), uv = g.attributes.uv, s = new Float32Array(n);
  const sizes = [[d, h], [d, h], [-1, -1], [-1, -1], [w, h], [w, h]];
  for (let i = 0; i < n; i++) {
    const [fw, fh] = sizes[Math.floor(i / 4)];
    const u = uv.getX(i), v = uv.getY(i);
    m[i * 2] = fw < 0 ? -1 : u * fw;
    m[i * 2 + 1] = fh < 0 ? -1 : v * fh + y0;
    uv.setXY(i, fw < 0 ? u * w / 4 : u * fw / 4, fw < 0 ? v * d / 4 : (v * fh + y0) / 4);
    s[i] = b.seed;
  }
  g.setAttribute('aM', new THREE.BufferAttribute(m, 2));
  g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
  return g;
}

function buildingGeo(list) {
  const parts = [];
  for (const b of list) {
    parts.push(boxPiece(b, 0, b.w, b.h, b.d, 0, 0));
    // Lantai atas yang nggak utuh, biar siluetnya nggak kotak semua
    if (b.seed > 0.45) {
      const w = b.w * (0.45 + b.seed * 0.3), d = b.d * 0.6;
      parts.push(boxPiece(b, b.h, w, 2.6 + b.seed * 6, d, b.seed > 0.7 ? b.w - w : 0, 0.8));
    }
  }
  return mergeGeometries(parts);
}

function facade(mat) {
  mat.aoMap = null; // AO dinding bikin kaca jendela berbintik
  mat.onBeforeCompile = (s) => {
    s.uniforms.uLit = cityUniforms.uLit;
    s.uniforms.uGlow = cityUniforms.uGlow;
    s.vertexShader = 'attribute vec2 aM; attribute float aSeed; varying vec2 vM; varying float vSeed;\n' + s.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvM = aM; vSeed = aSeed;');
    s.fragmentShader = 'uniform float uLit; uniform float uGlow; varying vec2 vM; varying float vSeed;\n' + s.fragmentShader
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        vec2 cell = vM / vec2(3.0, 3.3);
        vec2 wId = floor(cell), f = fract(cell);
        float wHash = fract(sin(dot(wId + floor(vSeed * 97.0 + 0.5), vec2(12.9898, 78.233))) * 43758.5453);
        float wall = step(0.0, vM.x);
        float win = wall * step(1.0, wId.y) * step(0.18, f.x) * step(f.x, 0.82) * step(0.24, f.y) * step(f.y, 0.8);
        float macro = texture2D(map, vMapUv * 0.07).g;
        float streak = wall * (1.0 - win) * smoothstep(0.24, 0.0, f.y) * step(0.18, f.x) * step(f.x, 0.82) * 0.4;
        diffuseColor.rgb *= (1.05 + macro * 0.6) * (1.0 - streak) * mix(0.5, 1.0, smoothstep(0.0, 5.0, vM.y + (1.0 - wall) * 9.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.026, 0.03), win);
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, wHash > 0.9 ? 0.9 : 0.22, win);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, wHash > 0.9 ? 0.0 : 0.45, win);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, win));')
      .replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        vec3 warm = mix(vec3(1.0, 0.68, 0.34), vec3(0.72, 0.84, 1.0), step(0.82, fract(wHash * 7.0)));
        totalEmissiveRadiance += win * step(wHash, uLit) * warm * uGlow * (0.75 + fract(wHash * 13.0) * 0.5);
      `);
  };
  return mat;
}

function placeModel(group, model, items, size, useHeight) {
  if (!model || !items.length) return;
  const box = new THREE.Box3().setFromObject(model);
  const ext = box.getSize(new THREE.Vector3());
  const k = size / (useHeight ? ext.y : Math.max(ext.x, ext.z));
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3(k, k, k);
  const m = new THREE.Matrix4(), w = new THREE.Matrix4();
  for (const p of partsOf(model, { leafTint: false })) {
    const mesh = new THREE.InstancedMesh(p.geometry, p.material, items.length);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    items.forEach((it, i) => {
      q.setFromAxisAngle(up, it.ry);
      w.compose(v.set(it.x, it.y - box.min.y * k, it.z), q, s);
      mesh.setMatrixAt(i, m.multiplyMatrices(w, p.local));
    });
    group.add(mesh);
  }
}

export function buildCity(group, { hi, A = {}, props = {}, fallback }) {
  const concrete = addFill(facade(pbrMaterial(A.concrete, fallback, { roughness: 0.95 })));
  const brick = addFill(facade(pbrMaterial(A.brick, fallback, { roughness: 0.95 })));
  const all = [...BUILDINGS, ...SKYLINE];
  for (const [list, mat] of [[all.filter((b) => !b.brick), concrete], [all.filter((b) => b.brick), brick]]) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(buildingGeo(list), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Jalan aspal
  const w = CITY.x1 - CITY.x0, d = CITY.z1 - CITY.z0;
  const roadGeo = new THREE.PlaneGeometry(w, d);
  roadGeo.rotateX(-Math.PI / 2);
  const ruv = roadGeo.attributes.uv;
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * w / 6, ruv.getY(i) * d / 6);
  const road = new THREE.Mesh(roadGeo, addFill(pbrMaterial(A.asphalt, fallback, { roughness: 0.95, color: 0x8f8f8f })));
  road.position.set(CITY.x0 + w / 2, 0.03, CITY.z0 + d / 2);
  road.receiveShadow = true;
  group.add(road);

  // Marka putus-putus yang udah pudar
  const dashes = [];
  const dash = (x, z, sx, sz) => { const g = new THREE.PlaneGeometry(sx, sz); g.rotateX(-Math.PI / 2); g.translate(x, 0.05, z); dashes.push(g); };
  for (const rz of ROADS_Z) for (let x = CITY.x0 + 2; x < 110; x += 6) if (rnd() > 0.25) dash(x, rz, 2.6, 0.14);
  for (const rx of ROADS_X) for (let z = CITY.z0 + 2; z < 106; z += 6) if (rnd() > 0.25) dash(rx, z, 0.14, 2.6);
  group.add(new THREE.Mesh(mergeGeometries(dashes), new THREE.MeshStandardMaterial({ color: 0xc9c5b8, roughness: 0.9, transparent: true, opacity: 0.45, depthWrite: false })));

  // Trotoar
  const walks = [];
  for (const [c0, c1] of COLS) {
    for (const [r0, r1] of ROWS) {
      const g = new THREE.BoxGeometry(c1 - c0, 0.14, r1 - r0);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (c1 - c0) / 4, uv.getY(i) * (r1 - r0) / 4);
      g.translate((c0 + c1) / 2, 0.07, (r0 + r1) / 2);
      walks.push(g);
    }
  }
  const walk = new THREE.Mesh(mergeGeometries(walks), addFill(pbrMaterial(A.sidewalk, fallback, { roughness: 0.95, color: 0xa8a59d })));
  walk.receiveShadow = true;
  group.add(walk);

  // Atap: tangki air dan kotak mesin
  const roofMat = pbrMaterial(A.rust, fallback, { roughness: 0.8 });
  const roofs = [];
  for (const b of BUILDINGS) {
    const n = 1 + Math.floor(b.seed * 3);
    for (let i = 0; i < n; i++) {
      const g = i === 0 && b.seed > 0.3 ? new THREE.CylinderGeometry(0.9, 0.9, 1.8, 12) : new THREE.BoxGeometry(1.4, 1, 1.1);
      g.translate(b.x + 1.5 + rnd() * (b.w - 3), b.h + 0.6, b.z + 1.5 + rnd() * (b.d - 3));
      roofs.push(g.index ? g.toNonIndexed() : g);
    }
  }
  const roof = new THREE.Mesh(mergeGeometries(roofs), roofMat);
  roof.castShadow = true;
  group.add(roof);

  // Isi jalan
  const cars = [], lamps = [], barriers = [], boxes = [], hydrants = [], power = [];
  ROADS_Z.forEach((rz) => {
    for (let x = 0; x < 100; x += 9 + rnd() * 15) cars.push({ x, y: 0.03, z: rz + (rnd() > 0.5 ? 2.6 : -2.6), ry: (rnd() > 0.5 ? 0 : Math.PI) + Math.PI / 2 + (rnd() - 0.5) * 0.12 });
  });
  ROADS_X.forEach((rx) => {
    for (let z = 58; z < 102; z += 12 + rnd() * 14) cars.push({ x: rx + (rnd() > 0.5 ? 2.6 : -2.6), y: 0.03, z, ry: (rnd() > 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.12 });
  });
  for (const [c0, c1] of COLS) {
    for (const [r0, r1] of ROWS) {
      for (const [x, z, ry] of [[c0 + 2, r0 + 0.5, 0], [c1 - 2, r0 + 0.5, 0], [c0 + 2, r1 - 0.5, Math.PI], [c1 - 2, r1 - 0.5, Math.PI]]) lamps.push({ x, y: 0.14, z, ry });
      boxes.push({ x: c0 + 5, y: 0.14, z: r0 + 0.6, ry: 0 });
      power.push({ x: c1 - 5, y: 0.14, z: r1 - 0.6, ry: Math.PI });
      hydrants.push({ x: (c0 + c1) / 2, y: 0.14, z: r0 + 0.5, ry: rnd() * 6.28 });
    }
  }
  for (let i = 0; i < 4; i++) barriers.push({ x: 20 + i * 2.1 - 3, y: 0.03, z: 46.2, ry: (rnd() - 0.5) * 0.3 });
  for (let i = 0; i < 3; i++) barriers.push({ x: 60 + (rnd() - 0.5), y: 0.03, z: 62 + i * 2.1, ry: Math.PI / 2 + (rnd() - 0.5) * 0.3 });
  // Sorotan lampu jalan, murah tanpa point light. Urutannya diacak biar nyalanya nyebar.
  const shown = hi ? lamps : lamps.filter((_, i) => i % 2 === 0);
  const lit = shown.slice().sort(() => rnd() - 0.5);
  const poolGeo = new THREE.PlaneGeometry(13, 13);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMesh = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({
    map: poolTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }), lit.length);
  const pm = new THREE.Matrix4();
  lit.forEach((l, i) => { pm.makeTranslation(l.x, 0.17, l.z + (l.ry ? 1.4 : -1.4)); poolMesh.setMatrixAt(i, pm); });
  poolMesh.frustumCulled = false;
  group.add(poolMesh);
  pools.mesh = poolMesh;
  pools.total = lit.length;

  // Kepala lampu yang nyala, kena bloom pas malam
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(LAMP_HEAD.r, 12, 8), new THREE.MeshStandardMaterial({
    color: 0x2a2620, emissive: 0xffc98a, emissiveIntensity: 0.1, roughness: 0.3, toneMapped: false,
  }), lit.length);
  lit.forEach((l, i) => { pm.makeTranslation(l.x, l.y + LAMP_HEAD.y, l.z); heads.setMatrixAt(i, pm); });
  heads.frustumCulled = false;
  group.add(heads);
  pools.heads = heads;

  const shownCars = hi ? cars : cars.slice(0, 12);
  // Mobil jalan searah sumbu x kalau ry deket 90 derajat
  for (const o of [...shownCars, ...barriers]) {
    const alongX = Math.abs(Math.sin(o.ry)) > 0.7;
    const isCar = shownCars.includes(o);
    const long = isCar ? 2.15 : 1.05, wide = isCar ? 0.95 : 0.3;
    OBSTACLES.push({ x: o.x, z: o.z, hx: alongX ? long : wide, hz: alongX ? wide : long });
  }
  placeModel(group, props.car, shownCars, 4.3);
  placeModel(group, props.lamp, shown, 7, true);
  placeModel(group, props.barrier, barriers, 2);
  placeModel(group, props.utility, boxes, 1.4, true);
  placeModel(group, props.power, power, 1.5, true);
  placeModel(group, props.hydrant, hydrants, 0.8, true);
}
