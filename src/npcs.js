import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRobot } from './robot.js';
import { addObstacle, BUILDINGS, SHOP } from './city.js';

// Robot kurir yang jalan kaki keliling kota, plus saudara VUZZ yang mati di pinggir tembok.
// Rutenya di tengah jalan, jauh dari mobil parkir, barikade, dan gedung.
const ROUTES = [
  [[8, 50], [34, 50], [34, 78], [8, 78]],
  [[34, 50], [60, 50]],
  [[60, 78], [86, 78], [86, 56], [86, 78]],
  [[8, 78], [8, 100], [8, 78], [34, 78], [34, 100], [34, 78]],
];
const COURIERS = [
  { name: 'Mira', scale: 0.82, skin: { primary: 0x1fa8a0, secondary: 0x0f5c5a, accent: 0xffd166, emissive: 0x7fffe0 } },
  { name: 'Oke', scale: 0.92, skin: { primary: 0xe8892c, secondary: 0x8a4a12, accent: 0x2b2f38, emissive: 0xffd27a } },
  { name: 'Dex', scale: 0.78, skin: { primary: 0x8d9299, secondary: 0x4b5058, accent: 0xb8ff3c, emissive: 0xb8ff3c } },
  { name: 'Nuri', scale: 0.86, skin: { primary: 0xe86a9a, secondary: 0x8f2f58, accent: 0xf4f1e6, emissive: 0xffb0d0 } },
];
const WALK_SPEED = 1.9;
const BOLT_LINES = [
  'Bolt, city mechanic. If it sparks, it comes to me eventually.',
  'Those generators held up, then? Told you the old levers only need a firm pull.',
  'The mini mart keeps me in spare fuses. Nobody else is buying.',
  'Three pieces of you went missing in The Blackout, VUZZ. Bring them here and I would still say you look fine.',
];

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

export function createNpcs(group) {
  const couriers = COURIERS.map((c, i) => {
    // dormant: tanpa PointLight sendiri, jumlah lampu scene nggak boleh berubah
    const r = createRobot({ dormant: true });
    r.setSkin(c.skin);
    r.setEyeSignal(false);
    r.setState('walk');
    r.root.scale.setScalar(c.scale);
    group.add(r.root);
    return { robot: r, route: ROUTES[i], seg: 0, t: 0.15 + i * 0.13, yaw: 0, talk: 0, live: { id: c.name.toLowerCase(), name: c.name, kind: 'robot', x: 0, z: 0 } };
  });

  // Bolt si mekanik: robot kuning-hitam yang berdiri di samping pintu toko, nunggu paket
  const bolt = createRobot({ dormant: true });
  bolt.setSkin({ primary: 0xf2c531, secondary: 0x1d2027, accent: 0x2b2f38, emissive: 0xfff1a0 });
  bolt.setEyeSignal(false);
  bolt.setState('idle');
  const boltLive = { id: 'bolt', name: 'Bolt', kind: 'robot', x: SHOP.x - 2.4, z: SHOP.z - SHOP.hd - 1.1, lines: BOLT_LINES };
  bolt.root.position.set(boltLive.x, 0.14, boltLive.z);
  bolt.root.scale.setScalar(0.9);
  group.add(bolt.root);
  addObstacle(boltLive.x, boltLive.z, 0.4, 0.4, 2);

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
    sisters,
    live: [...couriers.map((d) => d.live), boltLive],
    talk(id, seconds) {
      const d = couriers.find((x) => x.live.id === id);
      if (d) d.talk = seconds;
      if (id === 'bolt') bolt.setState('wave');
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
      const boltNear = player ? Math.hypot(player.x - boltLive.x, player.z - boltLive.z) : 99;
      if (boltNear < 50) {
        if (boltNear < 7) {
          let diff = Math.atan2(player.x - boltLive.x, player.z - boltLive.z) - bolt.root.rotation.y;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          bolt.root.rotation.y += diff * Math.min(1, dt * 5);
        }
        if (bolt.state.name === 'wave' && bolt.state.t > 2.5) bolt.setState('idle');
        bolt.update(dt, 0, time);
      }
      for (const d of couriers) {
        const a = d.route[d.seg], b = d.route[(d.seg + 1) % d.route.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const near = player ? Math.hypot(player.x - d.live.x, player.z - d.live.z) : 99;
        // berhenti kalau diajak ngomong atau VUZZ ada di deketnya, biar gampang disamperin
        d.talk = Math.max(0, d.talk - dt);
        const stop = d.talk > 0 || near < 3;
        if (!stop) d.t += (dt * WALK_SPEED) / len;
        if (d.t >= 1) { d.t = 0; d.seg = (d.seg + 1) % d.route.length; }
        const x = a[0] + (b[0] - a[0]) * d.t, z = a[1] + (b[1] - a[1]) * d.t;
        d.robot.root.position.set(x, 0, z);
        d.live.x = x; d.live.z = z;
        const want = stop && player ? Math.atan2(player.x - x, player.z - z) : Math.atan2(b[0] - a[0], b[1] - a[1]);
        let diff = want - d.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        d.yaw += diff * Math.min(1, dt * 6);
        d.robot.root.rotation.y = d.yaw;
        const state = stop ? 'idle' : 'walk';
        if (d.robot.state.name !== state) d.robot.setState(state);
        if (near < 70) d.robot.update(dt, 0, time);
      }
    },
  };
}
