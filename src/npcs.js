import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRobot } from './robot.js';
import { MIND_COUNT, mindsFor as awakeFor } from './evolution.js';
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
  { name: 'Kip', scale: 0.74, skin: { primary: 0x4d7cff, secondary: 0x1f3a8a, accent: 0xffd166, emissive: 0x9fd0ff } },
  { name: 'Umi', scale: 0.84, skin: { primary: 0xf0efe8, secondary: 0x7a7f8a, accent: 0x7a4dff, emissive: 0xc9b6ff } },
  { name: 'Tako', scale: 0.8, skin: { primary: 0xd9483b, secondary: 0x6e1d16, accent: 0x2b2f38, emissive: 0xffb27a } },
  { name: 'Pip', scale: 0.7, skin: { primary: 0x5fd39a, secondary: 0x1f7a52, accent: 0xf4f1e6, emissive: 0xe9ffb0 } },
];

const WALK_SPEED = 1.9;
const BOLT_LINES = [
  'Bolt, city mechanic. If it sparks, it comes to me eventually.',
  'Every hour the burn crew comes through. I just keep the lights wired.',
  'The mini mart keeps me in spare fuses. Nobody else is buying.',
  'Another upgrade, 7POD? Hold still, let me look at those new circuits.',
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
    const route = ROUTES[i % ROUTES.length];
    const seg = i >= ROUTES.length ? Math.floor(route.length / 2) : 0, t = (0.15 + i * 0.13) % 1;
    const p0 = route[seg], p1 = route[(seg + 1) % route.length];
    const x0 = p0[0] + (p1[0] - p0[0]) * t, z0 = p0[1] + (p1[1] - p0[1]) * t;
    r.root.position.set(x0, 0, z0);
    return { robot: r, route, seg, t, yaw: Math.atan2(p1[0] - p0[0], p1[1] - p0[1]), talk: 0, scale: c.scale, awake: true, wakeT: 0, live: { id: c.name.toLowerCase(), name: c.name, kind: 'robot', x: x0, z: z0 } };
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

  // Semua pikiran di kota, urut bangun: kurir, Bolt, lalu dua unit yang nyender di tembok
  const minds = [
    ...couriers.slice(0, 4).map((d) => ({ kind: 'courier', d, robot: d.robot, scale: d.scale })),
    { kind: 'bolt', robot: bolt, scale: 0.9 },
    ...couriers.slice(4).map((d) => ({ kind: 'courier', d, robot: d.robot, scale: d.scale })),
    ...sisters.map((sr) => ({ kind: 'sister', robot: sr, scale: 1 })),
  ];
  minds.forEach((m) => { m.awake = true; m.wakeT = 0; });
  let level = -1;

  function sleepMind(m) {
    m.awake = false;
    if (m.d) { m.d.awake = false; m.d.mode = 'route'; }
    m.robot.setEvolution(0);
    if (m.kind === 'sister') return; // tetap beku nyender
    m.robot.setState('sleep');
  }
  function wakeMind(m, instant) {
    m.awake = true;
    if (m.d) m.d.awake = true;
    if (m.kind === 'sister' && m.robot.frozenMeshes.length) {
      unfreeze(m.robot);
      m.robot.setSkin({ primary: 0x8a8f99, secondary: 0x4a4e58, accent: 0x6e665c, emissive: 0xb8ff3c });
      m.robot.setEyeSignal(false);
    }
    m.wakeT = instant ? 0 : 1.8;
    m.robot.setState(instant ? (m.kind === 'courier' ? 'walk' : 'idle') : 'yawn');
  }

  // ---- kelakuan kurir yang bangun: nyapa, nyamperin, ngobrol satu sama lain, ngikut 7POD ----
  // Kemampuan nambah tiap level: 1 jalan + nengok, 2 nyapa + ngobrol antar robot, 3 nyamperin, 5 ngawal
  const GREET = [
    ['Hey, 7POD.', 'Good to see you up.', 'Watch the cars.'],
    ['7POD! Still glowing.', 'The city feels warmer when you walk by.', 'Need anything delivered?'],
    ['Every burn, I think a little faster.', 'You woke me up. I owe you one.', 'The others are talking about you.'],
    ['We are all connected now. I can feel the next burn coming.', 'Walk with me, I know a shortcut.', 'The network is almost awake.'],
    ['We are one mind now. Lead the way.', 'Every burn is a heartbeat. Can you hear it?', 'The city is thinking. It likes you.'],
  ];
  const CHATTER = [
    ['Did you see the lights on 7POD?', 'Every hour. Like a clock.', 'The shop is still free, right?', 'My route feels shorter today.', 'More of us woke up this morning.', 'I dreamt of the Blackout again.'],
    ['Another burn. Another one of us awake.', 'The halo. Have you seen the halo?', 'I think we are becoming one thing.', 'Quiet. Listen to the hum.'],
  ];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const emit = (d, text, ms) => api.onSay?.(d.live, text, ms);
  const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  const v = new THREE.Vector3();
  let awake = false;
  let woken = false, waveT = 0;
  let chatCool = 4, escort = null;
  const api = {
    sisters,
    onSay: null,
    get awakeCount() { return minds.filter((m) => m.awake).length; },
    total: MIND_COUNT,
    // Level evolusi 7POD: nentuin berapa pikiran yang bangun dan bagian evolusi mereka
    setEvolution(lv) {
      lv = Math.max(0, Math.floor(lv));
      const first = level < 0;
      const n = awakeFor(lv);
      minds.forEach((m, i) => {
        if (i < n) { if (first) wakeMind(m, true); else if (!m.awake) wakeMind(m, false); m.robot.setEvolution(lv); }
        else if (first || m.awake) sleepMind(m);
      });
      woken = minds.some((m) => m.kind === 'sister' && m.awake);
      level = lv;
      if (lv < 5) escort = null;
    },
    live: [...couriers.map((d) => d.live), boltLive],
    talk(id, seconds) {
      const d = couriers.find((x) => x.live.id === id);
      if (d) { d.talk = seconds; d.noticeCool = 14; }
      if (id === 'bolt' && minds[4].awake) bolt.setState('wave');
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
      for (const m of minds) {
        if (m.wakeT > 0) { m.wakeT -= dt; if (m.wakeT <= 0) { m.wakeT = 0; m.robot.setState(m.kind === 'courier' ? 'walk' : 'wave'); if (m.kind !== 'courier') waveT = 3; } }
      }
      if (woken) {
        waveT -= dt;
        for (const s of sisters) {
          if (!minds.find((m) => m.robot === s).awake) continue;
          if (waveT < 0 && s.state.name === 'wave') s.setState('idle');
          s.update(dt, 0, time);
        }
      }
      const wake = cityLights >= 5;
      if (wake !== awake && !woken) { awake = wake; sisters.forEach((s) => s.setEyeSignal(wake)); }
      const boltNear = player ? Math.hypot(player.x - boltLive.x, player.z - boltLive.z) : 99;
      if (boltNear < 50) {
        if (boltNear < 7 && minds[4].awake) {
          let diff = Math.atan2(player.x - boltLive.x, player.z - boltLive.z) - bolt.root.rotation.y;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          bolt.root.rotation.y += diff * Math.min(1, dt * 5);
        }
        if (bolt.state.name === 'wave' && bolt.state.t > 2.5) bolt.setState('idle');
        if (!minds[4].awake && bolt.state.name !== 'sleep') bolt.setState('sleep');
        bolt.update(dt, 0, time);
      }

      chatCool -= dt;
      const awakeC = couriers.filter((d) => d.awake && (minds.find((m) => m.d === d).wakeT === 0));
      // ngobrol antar robot: dua kurir yang kebetulan deket berhenti, hadap-hadapan, saling lempar kalimat
      if (level >= 2 && chatCool <= 0 && player) {
        for (let i = 0; i < awakeC.length && chatCool <= 0; i++) for (let j = i + 1; j < awakeC.length; j++) {
          const A = awakeC[i], B = awakeC[j];
          if (A.mode !== 'route' || B.mode !== 'route') continue;
          if (dist(A.live.x, A.live.z, B.live.x, B.live.z) > 3.2 || dist(player.x, player.z, A.live.x, A.live.z) > 40) continue;
          const pool = CHATTER[level >= 4 ? 1 : 0];
          A.mode = B.mode = 'chat'; A.modeT = 6.5; B.modeT = 6.5; A.partner = B; B.partner = A;
          emit(A, pick(pool), 3000); setTimeout(() => { if (B.mode === 'chat') emit(B, pick(pool), 3000); }, 3200);
          chatCool = 9; break;
        }
      }
      // pengawal: di Superintelligence satu kurir ngikutin 7POD
      if (level >= 5 && player && !escort && awakeC.length) {
        const near = awakeC.filter((d) => d.mode === 'route' && dist(player.x, player.z, d.live.x, d.live.z) < 18);
        if (near.length) { escort = near[0]; escort.mode = 'follow'; escort.modeT = 40; emit(escort, 'I will walk with you for a while.', 3200); }
      }

      for (const d of couriers) {
        const a = d.route[d.seg], b = d.route[(d.seg + 1) % d.route.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const near = player ? Math.hypot(player.x - d.live.x, player.z - d.live.z) : 99;
        const m = minds.find((x) => x.d === d);
        d.talk = Math.max(0, d.talk - dt);
        d.noticeCool = Math.max(0, (d.noticeCool || 0) - dt);
        d.mode ||= 'route'; d.modeT = Math.max(0, (d.modeT || 0) - dt);
        const ready = d.awake && m.wakeT === 0;

        // nyapa: 7POD lewat deket, berhenti, nengok, dadah; mulai level 2 sambil ngomong
        if (ready && level >= 1 && d.mode === 'route' && near < 4.5 && d.noticeCool === 0) {
          d.mode = 'greet'; d.modeT = 2.8; d.noticeCool = 20;
          d.robot.setState('wave');
          if (level >= 2) emit(d, pick(GREET[Math.min(4, level - 1)]), 3200);
        }
        // nyamperin: mulai level 3, kalau liat 7POD dari jauh, jalan ke arahnya dulu
        if (ready && level >= 3 && d.mode === 'route' && near < 13 && near > 5 && d.noticeCool === 0 && Math.random() < dt * 0.35) {
          d.mode = 'approach'; d.modeT = 7; d.noticeCool = 30;
        }
        if (d.mode === 'chat' && (d.modeT === 0 || !d.partner?.awake)) { d.mode = 'route'; d.partner = null; }
        if (d.mode === 'greet' && d.modeT === 0) { d.mode = 'route'; }
        if (d.mode === 'approach' && (d.modeT === 0 || near < 2.6)) {
          if (near < 2.6) { d.mode = 'greet'; d.modeT = 3; d.robot.setState('wave'); emit(d, pick(GREET[Math.min(4, level - 1)]), 3400); }
          else d.mode = 'route';
        }
        if (d.mode === 'follow' && (d.modeT === 0 || near > 30)) { d.mode = 'route'; if (escort === d) escort = null; }

        let x = d.live.x, z = d.live.z, want = d.yaw, moving = false;
        const moveTo = (tx, tz, stopAt, speed) => {
          const dd = dist(x, z, tx, tz);
          if (dd <= stopAt) return false;
          const step = Math.min(dd - stopAt, dt * speed);
          x += ((tx - x) / dd) * step; z += ((tz - z) / dd) * step; want = Math.atan2(tx - x, tz - z);
          return true;
        };
        if (!ready) { /* tidur di tempat */ }
        else if (d.mode === 'approach' && player) moving = moveTo(player.x, player.z, 2.4, WALK_SPEED * 1.15);
        else if (d.mode === 'follow' && player) moving = moveTo(player.x, player.z, 2.2, WALK_SPEED * 1.35);
        else if (d.mode === 'chat' && d.partner) want = Math.atan2(d.partner.live.x - x, d.partner.live.z - z);
        else if (d.mode === 'greet' && player) want = Math.atan2(player.x - x, player.z - z);
        else {
          const stop = d.talk > 0 || near < 3;
          if (stop && player) want = Math.atan2(player.x - x, player.z - z);
          else {
            // balik ke rute: kalau sempat keluar rute, jalan ke titik rute terdekat dulu
            const rx = a[0] + (b[0] - a[0]) * d.t, rz = a[1] + (b[1] - a[1]) * d.t;
            if (dist(x, z, rx, rz) > 0.3) moving = moveTo(rx, rz, 0.05, WALK_SPEED);
            else {
              d.t += (dt * WALK_SPEED) / len;
              if (d.t >= 1) { d.t = 0; d.seg = (d.seg + 1) % d.route.length; }
              const a2 = d.route[d.seg], b2 = d.route[(d.seg + 1) % d.route.length];
              x = a2[0] + (b2[0] - a2[0]) * d.t; z = a2[1] + (b2[1] - a2[1]) * d.t;
              want = Math.atan2(b2[0] - a2[0], b2[1] - a2[1]); moving = true;
            }
          }
        }
        d.robot.root.position.set(x, 0, z);
        d.live.x = x; d.live.z = z;
        let diff = want - d.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        d.yaw += diff * Math.min(1, dt * 6);
        d.robot.root.rotation.y = d.yaw;
        const state = !d.awake ? 'sleep' : m.wakeT > 0 ? 'yawn' : d.mode === 'greet' ? 'wave' : moving ? 'walk' : 'idle';
        if (d.robot.state.name !== state) d.robot.setState(state);
        if (near < 70) d.robot.update(dt, 0, time);
      }
    },
  };
  return api;
}
