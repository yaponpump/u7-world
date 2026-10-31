import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRobot } from './robot.js';
import { addObstacle, BUILDINGS } from './city.js';

// Drone perawatan yang keliling jalan, plus saudara VUZZ yang mati di pinggir tembok.
const ROUTES = [
  [[8, 50], [34, 50], [34, 78], [8, 78]],
  [[34, 50], [60, 50], [60, 78], [34, 78]],
  [[60, 78], [86, 78], [86, 50], [60, 50]],
  [[8, 78], [8, 100], [34, 100], [34, 78]],
  [[86, 50], [86, 100], [60, 100], [60, 78]],
];

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Unit mati nggak gerak, jadi bagiannya digabung per material biar hemat draw call.
// Mata tetep terpisah karena salah satunya nyala belakangan.
function freeze(robot) {
  const { root } = robot;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map();
  root.traverseVisible((m) => {
    if (!m.isMesh || m.geometry.type === 'CircleGeometry' || m.material.transparent) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(g);
    m.userData.frozen = true;
  });
  root.traverse((m) => { if (m.userData.frozen) m.visible = false; });
  const merged = [];
  for (const [mat, list] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    merged.push(mesh);
  }
  return merged;
}

// Balikin ke robot utuh biar bisa gerak lagi
function unfreeze(robot) {
  for (const m of robot.frozenMeshes) robot.root.remove(m);
  robot.root.traverse((m) => { if (m.userData.frozen) m.visible = true; });
  robot.frozenMeshes = [];
}

function createDrone(shared, route, phase) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(shared.body, shared.shell));
  const band = new THREE.Mesh(shared.band, shared.dark);
  band.rotation.x = Math.PI / 2;
  root.add(band);
  const eye = new THREE.Mesh(shared.eye, shared.lamp);
  eye.position.set(0, -0.02, 0.27);
  root.add(eye);
  const rotors = [];
  for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) {
    const arm = new THREE.Mesh(shared.arm, shared.dark);
    arm.position.set(x * 0.6, 0.05, z * 0.6);
    arm.lookAt(0, 0.05, 0);
    root.add(arm);
    const r = new THREE.Mesh(shared.rotor, shared.dark);
    r.position.set(x, 0.1, z);
    root.add(r);
    rotors.push(r);
  }
  root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  const glow = new THREE.Sprite(shared.glow);
  glow.scale.setScalar(1.8);
  glow.position.set(0, -0.2, 0);
  root.add(glow);
  const pool = new THREE.Mesh(shared.pool, shared.poolMat);
  pool.rotation.x = -Math.PI / 2;
  return { root, rotors, route, pool, seg: 0, t: phase, height: 3 + phase * 1.4, yaw: 0 };
}

export function createNpcs(group, { hi }) {
  const glowMap = glowTexture();
  const shared = {
    body: new THREE.SphereGeometry(0.3, 16, 10),
    band: new THREE.TorusGeometry(0.31, 0.03, 8, 24),
    eye: new THREE.SphereGeometry(0.07, 10, 8),
    arm: new THREE.BoxGeometry(0.03, 0.03, 0.34),
    rotor: new THREE.CylinderGeometry(0.15, 0.15, 0.012, 14),
    pool: new THREE.PlaneGeometry(4.5, 4.5),
    shell: new THREE.MeshStandardMaterial({ color: 0x8d9299, roughness: 0.45, metalness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.6, metalness: 0.7 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x223018, emissive: 0xb8ff3c, emissiveIntensity: 2, toneMapped: false }),
    glow: new THREE.SpriteMaterial({ map: glowMap, color: 0xcfe9a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    poolMat: new THREE.MeshBasicMaterial({ map: glowMap, color: 0xcfe9a0, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  };
  const NAMES = ['Mira', 'Oke', 'Dex', 'Nuri', 'Bolt'];
  const drones = ROUTES.slice(0, hi ? 5 : 4).map((r, i) => {
    const d = createDrone(shared, r, i * 0.27);
    d.live = { id: NAMES[i].toLowerCase(), name: NAMES[i], x: 0, z: 0 };
    d.talk = 0;
    return d;
  });
  for (const d of drones) { group.add(d.root, d.pool); }

  // Duduk nyender ke tembok gedung yang ngadep jalan
  const sisters = [BUILDINGS.find((b) => b.z < 60 && b.x > 30), BUILDINGS.find((b) => b.z < 60 && b.x > 60)]
    .filter(Boolean)
    .map((b, i) => {
      const s = createRobot({ dormant: true });
      s.setSkin({ primary: 0x5a5d62, secondary: 0x3d3f44, accent: 0x6e665c, emissive: 0x1c1e1c });
      s.setState('sleep');
      s.root.position.set(b.x + b.w * (i ? 0.3 : 0.65), 0.14, b.z - 0.5);
      s.root.rotation.y = Math.PI;
      s.update(0.016, 0, 0);
      group.add(s.root);
      s.frozenMeshes = freeze(s);
      addObstacle(s.root.position.x, s.root.position.z, 0.6, 0.45);
      return s;
    });

  const v = new THREE.Vector3();
  let awake = false;
  let woken = false, waveT = 0;
  return {
    drones, sisters,
    live: drones.map((d) => d.live),
    talk(id, seconds) {
      const d = drones.find((x) => x.live.id === id);
      if (d) d.talk = seconds;
    },
    // Dua unit mati bangun, berdiri, dan ngelambai
    wakeSisters() {
      if (woken) return;
      woken = true;
      waveT = 5;
      for (const s of sisters) {
        unfreeze(s);
        s.setEyeSignal(false);
        s.setSkin({ primary: 0x5a5d62, secondary: 0x3d3f44, accent: 0x6e665c, emissive: 0xb8ff3c });
        s.setState('wave');
      }
    },
    update(dt, time, cityLights, player) {
      if (woken) {
        waveT -= dt;
        for (const s of sisters) {
          if (waveT < 0) s.setState('idle');
          s.update(dt, 0, time);
        }
      }
      const wake = cityLights >= 5;
      if (wake !== awake && !woken) { awake = wake; sisters.forEach((s) => s.setEyeSignal(wake)); }
      for (const d of drones) {
        const a = d.route[d.seg], b = d.route[(d.seg + 1) % d.route.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        d.talk = Math.max(0, d.talk - dt);
        if (d.talk <= 0) d.t += (dt * 3.2) / len;
        if (d.t >= 1) { d.t = 0; d.seg = (d.seg + 1) % d.route.length; }
        v.set(a[0] + (b[0] - a[0]) * d.t, d.height + Math.sin(time * 1.4 + d.height) * 0.14, a[1] + (b[1] - a[1]) * d.t);
        d.root.position.copy(v);
        d.pool.position.set(v.x, 0.09, v.z);
        d.live.x = v.x; d.live.z = v.z;
        const want = d.talk > 0 && player ? Math.atan2(player.x - v.x, player.z - v.z) : Math.atan2(b[0] - a[0], b[1] - a[1]);
        let diff = want - d.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        d.yaw += diff * Math.min(1, dt * 2.5);
        d.root.rotation.y = d.yaw;
        d.root.rotation.z = Math.sin(time * 0.9 + d.height) * 0.05;
        for (const r of d.rotors) r.rotation.y = time * 40;
      }
    },
  };
}
