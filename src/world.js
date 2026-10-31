import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import {
  grassTexture, dirtTexture, barkTexture, leafCardTexture, waterNormalTexture, stoneTexture, woodTexture,
} from './textures.js';

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

export const riverCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-70, 0, -60),
  new THREE.Vector3(-40, 0, -40),
  new THREE.Vector3(-12, 0, -16),
  new THREE.Vector3(-22, 0, 8),
  new THREE.Vector3(-34, 0, 30),
]);
const riverSamples = riverCurve.getSpacedPoints(100);

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
    if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
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
export function groundHeight(x, z) {
  return hillHeight(x, z) + microHeight(x, z);
}

function onPath(x, z) {
  const d = Math.hypot(x - WORLD.park.x, z - WORLD.park.z);
  if (d < 6.8) return true;
  if (d > WORLD.park.r - 2.4 && d < WORLD.park.r + 0.2) return true;
  // jalur ke bukit, kafe, danau
  if (Math.abs(z - WORLD.park.z) < 1.4 && x > WORLD.park.x && x < WORLD.cafe.x) return true;
  if (Math.abs(x - WORLD.park.x) < 1.4 && z < WORLD.park.z && z > -30) return true;
  if (Math.abs(z - 22) < 1.4 && x > WORLD.pier.x && x < WORLD.park.x) return true;
  return false;
}

export function isWater(x, z) {
  const l = WORLD.lake;
  if (Math.hypot(x - l.x, z - l.z) < l.r - 0.5) {
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

// ---------- Shader tambahan: angin buat rumput dan daun ----------
function addWind(material, { strength = 0.25, leaf = false } = {}) {
  material.userData.wind = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = material.userData.wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;`)
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
        transformed.x += sway * ${strength.toFixed(3)} * k;
        transformed.z += cos(uTime * 1.3 + ph) * ${(strength * 0.5).toFixed(3)} * k;
      `);
  };
}

export function buildWorld(scene, renderer, { quality = 'high' } = {}) {
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
    if (isWater(x, z)) y = -1.6 + Math.min(0, -distToRiver(x, z) * 0.1);
    gp.setY(i, y - 0.02);
    guv.setXY(i, x / 6, z / 6);
    mix.push(onPath(x, z) ? 1 : 0);
  }
  groundGeo.setAttribute('aMix', new THREE.Float32BufferAttribute(mix, 1));
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshStandardMaterial({ map: texGrass, roughness: 0.95, metalness: 0 });
  groundMat.onBeforeCompile = (shader) => {
    shader.uniforms.tDirt = { value: texDirt };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMix; varying float vMix;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMix = aMix;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDirt; varying float vMix;')
      .replace('#include <map_fragment>', `
        vec4 g = texture2D(map, vMapUv);
        vec4 d = texture2D(tDirt, vMapUv * 1.7);
        diffuseColor *= mix(g, d, smoothstep(0.2, 0.8, vMix));
      `);
  };
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  // ---------- Rumput (instanced blades) ----------
  const bladeCount = hi ? 160000 : 60000;
  const bladeGeo = new THREE.PlaneGeometry(0.07, 0.42, 1, 3);
  bladeGeo.translate(0, 0.21, 0);
  // lancip di ujung
  const bp = bladeGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) { const y = bp.getY(i) / 0.42; bp.setX(i, bp.getX(i) * (1 - y * 0.9)); }
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x4f8a34, roughness: 0.95, side: THREE.DoubleSide });
  bladeMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = bladeMat.userData.wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying float vH;')
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(transformed, 1.0);
        float ph = wp.x * 0.5 + wp.z * 0.4;
        float k = uv.y * uv.y;
        transformed.x += (sin(uTime * 1.8 + ph) * 0.5 + sin(uTime * 3.1 + ph * 2.3) * 0.25) * 0.28 * k;
        transformed.z += cos(uTime * 1.4 + ph) * 0.12 * k;
        vH = uv.y;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.45, 1.15, vH);');
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
    const ang = rnd() * Math.PI * 2, rad = Math.pow(rnd(), 0.6) * 85;
    const x = WORLD.park.x * 0.4 + Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    if (isWater(x, z) || onPath(x, z) || distToRiver(x, z) < 3.6) continue;
    if (Math.hypot(x - WORLD.cafe.x, z - WORLD.cafe.z) < 4) continue;
    const y = groundHeight(x, z);
    v3.set(x, y, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
    const sc = 0.6 + rnd() * 1.0;
    s3.set(1, sc, 1);
    m4.compose(v3, q, s3);
    blades.setMatrixAt(placed, m4);
    colorTmp.setHSL(0.25 + (rnd() - 0.5) * 0.05, 0.45, 0.26 + rnd() * 0.12);
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
      textureWidth: hi ? 1024 : 512,
      textureHeight: hi ? 1024 : 512,
      waterNormals: texWaterN,
      sunDirection: sunDir.clone(),
      sunColor: 0xffffff,
      waterColor: color,
      distortionScale: 2.4,
      fog: true,
    });
    w.material.uniforms.size.value = 3.5;
    return w;
  }
  const lake = makeWater(new THREE.CircleGeometry(WORLD.lake.r, 64), 0x0f3b4a);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(WORLD.lake.x, -0.2, WORLD.lake.z);
  group.add(lake);
  const riverGeo = ribbonGeometry(riverCurve, 6.4);
  const river = new THREE.Mesh(riverGeo, new THREE.MeshPhysicalMaterial({
    color: 0x1b4f5e, roughness: 0.08, metalness: 0.0, transmission: 0.35, thickness: 1.5,
    transparent: true, opacity: 0.92, normalMap: texWaterN, normalScale: new THREE.Vector2(0.35, 0.35),
    clearcoat: 1, clearcoatRoughness: 0.05,
  }));
  river.position.y = -0.2;
  group.add(river);

  // Tepian air (pasir basah)
  const shoreMat = new THREE.MeshStandardMaterial({ color: 0x6b5d45, roughness: 1 });
  const shore = new THREE.Mesh(new THREE.RingGeometry(WORLD.lake.r - 1.2, WORLD.lake.r + 1.4, 64), shoreMat);
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(WORLD.lake.x, 0.01, WORLD.lake.z);
  group.add(shore);

  // ---------- Air mancur ----------
  const stoneMat = new THREE.MeshStandardMaterial({ map: texStone, roughness: 0.85 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.5, 0.75, 48, 1, true), stoneMat);
  basin.position.set(WORLD.fountain.x, 0.37, WORLD.fountain.z);
  const basinRim = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.18, 12, 48), stoneMat);
  basinRim.rotation.x = Math.PI / 2;
  basinRim.position.set(WORLD.fountain.x, 0.75, WORLD.fountain.z);
  const basinWater = makeWater(new THREE.CircleGeometry(3.1, 40), 0x1d5e73);
  basinWater.rotation.x = -Math.PI / 2;
  basinWater.position.set(WORLD.fountain.x, 0.62, WORLD.fountain.z);
  basinWater.material.uniforms.distortionScale.value = 1.2;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 2.4, 24), stoneMat);
  column.position.set(WORLD.fountain.x, 1.2, WORLD.fountain.z);
  basin.castShadow = column.castShadow = true;
  group.add(basin, basinRim, basinWater, column);
  const sprayCount = 600;
  const spray = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(sprayCount * 3).fill(0), 3)),
    new THREE.PointsMaterial({ color: 0xe8f6ff, size: 0.07, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  spray.position.set(WORLD.fountain.x, 2.4, WORLD.fountain.z);
  group.add(spray);

  // ---------- Bangku ----------
  const woodMat = new THREE.MeshStandardMaterial({ map: texWood, roughness: 0.7 });
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
  }
  bench(20, 9, Math.PI);
  bench(20, -9, 0);
  bench(29, 0, -Math.PI / 2);
  bench(-16, 36, Math.PI * 0.85);
  bench(44, -40, Math.PI * 0.75);

  // ---------- Dermaga ----------
  const pier = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(WORLD.pier.w, 0.08, 0.6), woodMat);
    plank.position.set(0, 0.3, -WORLD.pier.len / 2 + 0.35 + i * 0.7);
    plank.castShadow = plank.receiveShadow = true;
    pier.add(plank);
  }
  for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 1) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.4, 10), woodMat);
    post.position.set(i * (WORLD.pier.w / 2 - 0.15), -0.6, j * (WORLD.pier.len / 2 - 0.4));
    pier.add(post);
  }
  pier.position.set(WORLD.pier.x, 0, WORLD.pier.z);
  group.add(pier);

  // ---------- Jembatan ----------
  const bridge = new THREE.Group();
  for (let i = 0; i < 20; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, WORLD.bridge.w), woodMat);
    plank.position.set(-WORLD.bridge.len / 2 - 0.7 + i * 0.6, 0.5 + Math.sin((i / 19) * Math.PI) * 0.35, 0);
    plank.castShadow = plank.receiveShadow = true;
    bridge.add(plank);
  }
  for (let s = -1; s <= 1; s += 2) {
    for (let i = -5; i <= 5; i += 2.5) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), woodMat);
      const yy = 0.5 + Math.sin(((i + 6) / 12) * Math.PI) * 0.35;
      p.position.set(i, yy + 0.5, s * (WORLD.bridge.w / 2 - 0.1));
      bridge.add(p);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.07, 0.07), woodMat);
      rail.position.set(i + 1.25, yy + 1.0, s * (WORLD.bridge.w / 2 - 0.1));
      if (i < 5) bridge.add(rail);
    }
  }
  bridge.position.set(WORLD.bridge.x, 0, WORLD.bridge.z);
  group.add(bridge);

  // ---------- Pohon (batang + kartu daun instanced) ----------
  const trunkMat = new THREE.MeshStandardMaterial({ map: texBark, roughness: 1 });
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
  const cardsPerTree = hi ? 110 : 60;
  const leafGeo = new THREE.PlaneGeometry(1.6, 1.6);
  const leafMat = new THREE.MeshStandardMaterial({
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
    // cabang
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
      // distribusi dalam elipsoid, lebih padat di luar
      const u = rnd(), v = rnd(), w = Math.cbrt(rnd());
      const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
      const px = cx + Math.sin(ph) * Math.cos(th) * cr * w;
      const py = cy + Math.cos(ph) * cr * 0.8 * w;
      const pz = cz + Math.sin(ph) * Math.sin(th) * cr * w;
      v3.set(px, py, pz);
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
    WORLD.lamps.push({ head, headMat, light, on: i < 3 });
  });

  // ---------- Kafe ----------
  const cafe = new THREE.Group();
  const plaster = new THREE.MeshStandardMaterial({ color: 0xe8ddc8, roughness: 0.95 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.1, 4.2), plaster);
  wall.position.y = 1.55;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 1.9, 4), new THREE.MeshStandardMaterial({ color: 0x3a2f4f, roughness: 0.8 }));
  roof.position.y = 4.0;
  roof.rotation.y = Math.PI / 4;
  const awning = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.06, 1.7), new THREE.MeshStandardMaterial({ color: 0xc2552a, roughness: 0.9 }));
  awning.position.set(0, 2.35, 2.7);
  awning.rotation.x = 0.18;
  const counter = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.0, 0.6), woodMat);
  counter.position.set(0, 0.5, 2.4);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.2), new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.2, clearcoat: 1 }));
  win.position.set(0, 1.8, 2.11);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshStandardMaterial({ color: 0xb8ff3c, emissive: 0xb8ff3c, emissiveIntensity: 0.6 }));
  sign.position.set(0, 2.85, 2.12);
  cafe.add(wall, roof, awning, counter, win, sign);
  cafe.position.set(WORLD.cafe.x, 0, WORLD.cafe.z);
  cafe.traverse((m) => { m.castShadow = true; m.receiveShadow = true; });
  group.add(cafe);
  WORLD.cafeSign = sign.material;

  // ---------- Papan pengumuman ----------
  const board = new THREE.Group();
  const bb = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 0.12), woodMat);
  bb.position.y = 1.9;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4), new THREE.MeshStandardMaterial({ color: 0xf5efe2, roughness: 1 }));
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
  for (const [x, z] of [[-24, 40], [-10, -30], [44, -38], [52, 20], [-50, -10]]) {
    const m = new THREE.MeshStandardMaterial({ color: 0xb8ff3c, emissive: 0xb8ff3c, emissiveIntensity: 2.5, roughness: 0.2 });
    const s = new THREE.Mesh(sigGeo, m);
    s.position.set(x, groundHeight(x, z) + 1.2, z);
    const l = new THREE.PointLight(0xb8ff3c, 4, 6, 2);
    s.add(l);
    group.add(s);
    WORLD.signals.push({ mesh: s, x, z, taken: false });
  }

  // ---------- Batu ----------
  const rockMat = new THREE.MeshStandardMaterial({ map: texStone, roughness: 0.95 });
  for (let i = 0; i < 28; i++) {
    let x, z;
    if (i < 8) { const p = riverCurve.getPointAt(0.28 + i * 0.025); x = p.x + (i % 2 ? 1 : -1) * 1.4; z = p.z; }
    else { const a = rnd() * Math.PI * 2; const r = WORLD.lake.r + 0.6 + rnd() * 1.5; x = WORLD.lake.x + Math.cos(a) * r; z = WORLD.lake.z + Math.sin(a) * r; }
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rnd() * 0.5, 1), rockMat);
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
    new THREE.PointsMaterial({ color: 0xfff4d6, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  group.add(motes);

  const waters = [lake, basinWater];

  return {
    group, waters, river, lake,
    setSun(dir, color) {
      for (const w of waters) {
        w.material.uniforms.sunDirection.value.copy(dir);
        w.material.uniforms.sunColor.value.copy(color);
      }
    },
    update(t, dt) {
      bladeMat.userData.wind.value = t;
      leafMat.userData.wind.value = t;
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
}

export function setCityLights(n) {
  WORLD.lamps.forEach((l, i) => { l.on = i < n; });
  WORLD.towerLights?.forEach((m, i) => { m.emissiveIntensity = i < n ? 2.5 : 0; });
}

export function applyNight(nightAmount) {
  for (const l of WORLD.lamps) {
    const k = l.on ? nightAmount : 0;
    l.headMat.emissiveIntensity = k * 4;
    l.light.intensity = k * 40;
  }
  if (WORLD.cafeSign) WORLD.cafeSign.emissiveIntensity = 0.3 + nightAmount * 2.5;
}
