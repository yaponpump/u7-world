import * as THREE from 'three';

// Ekosistem kecil: kelinci yang kabur kalau dideketin, kupu-kupu siang, kunang-kunang malam.
function createRabbit(fur, dark) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), fur);
  body.scale.set(0.85, 0.85, 1.25);
  body.position.y = 0.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), fur);
  head.position.set(0, 0.34, 0.2);
  root.add(body, head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.16, 3, 6), fur);
    ear.position.set(s * 0.05, 0.52, 0.17);
    ear.rotation.x = -0.25;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), dark);
    eye.position.set(s * 0.08, 0.37, 0.29);
    root.add(ear, eye);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.9 }));
  tail.position.set(0, 0.23, -0.25);
  root.add(tail);
  root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return root;
}

export function createEcosystem(group, { hi, groundHeight, isWater, blocked, centers, lake, onPier, river, park }) {
  const fur = new THREE.MeshStandardMaterial({ color: 0x8d7a64, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.3 });
  const canStand = (x, z) => !isWater(x, z) && !blocked(x, z);

  const rabbits = centers.slice(0, hi ? 5 : 3).map(([x, z], i) => {
    const root = createRabbit(fur, dark);
    root.position.set(x, groundHeight(x, z), z);
    group.add(root);
    return { root, home: [x, z], from: [x, z], to: [x, z], t: 1, wait: 1 + i * 0.7, speed: 1 };
  });

  // Kupu-kupu: dua sayap yang ngepak
  const wingGeo = new THREE.PlaneGeometry(0.16, 0.13);
  wingGeo.translate(0.08, 0, 0);
  const colors = [0xffb347, 0xf7f3e6, 0x7ec8ff, 0xff7fa8];
  const butterflies = [];
  for (let i = 0; i < (hi ? 12 : 6); i++) {
    const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide });
    const root = new THREE.Group();
    const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat);
    r.scale.x = -1;
    root.add(l, r);
    group.add(root);
    butterflies.push({ root, l, r, cx: 8 + (i * 7) % 26, cz: -12 + (i * 11) % 26, ph: i * 1.9 });
  }

  // Kunang-kunang di sekitar danau
  const fireCount = hi ? 40 : 20, firePos = new Float32Array(fireCount * 3), fireSeed = [];
  for (let i = 0; i < fireCount; i++) {
    const a = Math.random() * 6.28, r = 3 + Math.random() * 6;
    const c = i % 3 === 0 ? park : river[i % river.length];
    const k = i % 3 === 0 ? 3 : 1;
    fireSeed.push({ x: c.x + Math.cos(a) * r * k, z: c.z + Math.sin(a) * r * k, ph: Math.random() * 6.28 });
  }
  const fireGeo = new THREE.BufferGeometry();
  fireGeo.setAttribute('position', new THREE.BufferAttribute(firePos, 3));
  const fireMat = new THREE.PointsMaterial({ color: 0xd8ff7a, size: 0.09, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const fireflies = new THREE.Points(fireGeo, fireMat);
  fireflies.frustumCulled = false;
  group.add(fireflies);

  // Bayangan ikan di danau, satu InstancedMesh
  const fishCount = 8;
  const fishMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.34, 12), new THREE.MeshBasicMaterial({ color: 0x06141a, transparent: true, opacity: 0.32, depthWrite: false }), fishCount);
  fishMesh.frustumCulled = false;
  group.add(fishMesh);
  const fishSeed = Array.from({ length: fishCount }, (_, i) => ({ a: i * 0.8, r: 5 + (i * 2.3) % 13, sp: 0.1 + (i % 3) * 0.05 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const up = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);

  // Bebek di danau
  const duckBody = new THREE.MeshStandardMaterial({ color: 0xe9e3d3, roughness: 0.8 });
  const duckBeak = new THREE.MeshStandardMaterial({ color: 0xe0902c, roughness: 0.6 });
  const ducks = [0, 1].map((i) => {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), duckBody);
    body.scale.set(0.8, 0.65, 1.2);
    const neck = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), duckBody);
    neck.position.set(0, 0.2, 0.17);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 6), duckBeak);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.2, 0.3);
    root.add(body, neck, beak);
    root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    group.add(root);
    return { root, ph: i * 2.6 };
  });

  // Kawanan burung di atas bukit, satu InstancedMesh
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.42, 0.1, 0, 0, 0, 0.12, 0, 0, -0.12, 0.42, 0.1, 0, 0, 0, 0.12, 0, 0, -0.12], 3));
  birdGeo.computeVertexNormals();
  const flock = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: 0x20242a, side: THREE.DoubleSide }), 6);
  flock.frustumCulled = false;
  group.add(flock);

  return {
    rabbits, butterflies, ducks, fishMesh, flock,
    update(dt, t, night, player) {
      for (const r of rabbits) {
        const near = player && Math.hypot(player.x - r.root.position.x, player.z - r.root.position.z) < 4.5;
        if (near && r.t >= 0.6) {
          // Kabur ngejauh dari pemain
          const a = Math.atan2(r.root.position.x - player.x, r.root.position.z - player.z) + (Math.random() - 0.5);
          const to = [r.root.position.x + Math.sin(a) * 5, r.root.position.z + Math.cos(a) * 5];
          if (canStand(to[0], to[1])) { r.from = [r.root.position.x, r.root.position.z]; r.to = to; r.t = 0; r.speed = 2.6; }
        } else if (r.t >= 1) {
          r.wait -= dt;
          if (r.wait <= 0) {
            const to = [r.home[0] + (Math.random() - 0.5) * 12, r.home[1] + (Math.random() - 0.5) * 12];
            r.wait = 1.5 + Math.random() * 4;
            if (canStand(to[0], to[1])) { r.from = [r.root.position.x, r.root.position.z]; r.to = to; r.t = 0; r.speed = 1; }
          }
        }
        if (r.t < 1) {
          const len = Math.max(0.1, Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1]));
          r.t = Math.min(1, r.t + (dt * 2.4 * r.speed) / len);
          const x = r.from[0] + (r.to[0] - r.from[0]) * r.t, z = r.from[1] + (r.to[1] - r.from[1]) * r.t;
          r.root.position.set(x, groundHeight(x, z) + Math.abs(Math.sin(r.t * len * 3.2)) * 0.22, z);
          r.root.rotation.y = Math.atan2(r.to[0] - r.from[0], r.to[1] - r.from[1]);
        }
      }
      fishSeed.forEach((f, i) => {
        const a = f.a + t * f.sp, x = lake.x + Math.cos(a) * f.r, z = lake.z + Math.sin(a) * f.r;
        q.copy(up.setFromAxisAngle(UP, -a)).multiply(flat);
        fishMesh.setMatrixAt(i, m4.compose(v.set(x, -0.185, z), q, s.set(0.6, 1.5, 1)));
      });
      fishMesh.instanceMatrix.needsUpdate = true;
      for (const d of ducks) {
        const a = t * 0.07 + d.ph, r = 13 + Math.sin(t * 0.13 + d.ph) * 2;
        let x = lake.x + Math.cos(a) * r, z = lake.z + Math.sin(a) * r;
        d.root.position.set(x, -0.1 + Math.sin(t * 1.4 + d.ph) * 0.012, z);
        d.root.rotation.y = -a;
      }
      for (let i = 0; i < 6; i++) {
        const a = t * 0.2 + i * 0.32, r = 18 + (i % 2) * 2.5;
        const x = 44 + Math.cos(a) * r, z = -40 + Math.sin(a) * r, y = 19 + Math.sin(i * 1.7) * 1.2;
        const flap = Math.abs(Math.sin(t * 6 + i)) * 0.9 + 0.3;
        q.setFromAxisAngle(UP, -a);
        flock.setMatrixAt(i, m4.compose(v.set(x, y, z), q, s.set(1.1, flap * 1.8, 1.1)));
      }
      flock.instanceMatrix.needsUpdate = true;
      const day = night < 0.4;
      for (const b of butterflies) {
        b.root.visible = day;
        if (!day) continue;
        const a = t * 0.35 + b.ph;
        const x = b.cx + Math.cos(a) * 4 + Math.sin(a * 2.3) * 1.2, z = b.cz + Math.sin(a * 1.3) * 4;
        b.root.position.set(x, groundHeight(x, z) + 0.8 + Math.sin(t * 2 + b.ph) * 0.3, z);
        b.root.rotation.y = -a;
        const flap = Math.sin(t * 16 + b.ph) * 0.9;
        b.l.rotation.y = flap; b.r.rotation.y = -flap;
      }
      fireMat.opacity = Math.max(0, night - 0.3) * 1.2;
      fireflies.visible = fireMat.opacity > 0.01;
      if (fireflies.visible) {
        fireSeed.forEach((f, i) => {
          firePos[i * 3] = f.x + Math.sin(t * 0.5 + f.ph) * 1.4;
          firePos[i * 3 + 1] = groundHeight(f.x, f.z) + 0.7 + Math.sin(t * 0.9 + f.ph * 2) * 0.5;
          firePos[i * 3 + 2] = f.z + Math.cos(t * 0.4 + f.ph) * 1.4;
        });
        fireGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
