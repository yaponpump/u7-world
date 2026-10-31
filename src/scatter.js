import * as THREE from 'three';

const m = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3(), s = new THREE.Vector3(), sphere = new THREE.Sphere();
const frustum = new THREE.Frustum(), vp = new THREE.Matrix4();

// Milih level detail tiap pohon, beberapa kali per detik
export class Scatter {
  constructor(group, tiers, items, radius, capacities) {
    this.items = items.map((i) => {
      q.setFromAxisAngle(UP, i.ry);
      return { ...i, matrix: new THREE.Matrix4().compose(v.set(i.x, i.y, i.z), q, s.setScalar(i.s)) };
    });
    this.radius = radius;
    this.tiers = tiers.map((t, n) => ({
      far: t.far,
      parts: t.parts.map((p) => {
        const mesh = new THREE.InstancedMesh(p.geometry, p.material, capacities[n]);
        mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true; mesh.count = 0;
        group.add(mesh);
        return { mesh, local: p.local };
      }),
    }));
  }
  update(camera) {
    frustum.setFromProjectionMatrix(vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const counts = this.tiers.map(() => 0);
    for (const it of this.items) {
      const d = Math.hypot(it.x - camera.position.x, it.z - camera.position.z);
      const n = this.tiers.findIndex((t) => d < t.far);
      if (n < 0) continue;
      sphere.center.set(it.x, it.y + it.s * this.radius * 0.5, it.z);
      sphere.radius = it.s * this.radius;
      if (d > 45 && !frustum.intersectsSphere(sphere)) continue;
      const t = this.tiers[n], c = counts[n];
      if (c >= t.parts[0].mesh.instanceMatrix.count) continue;
      counts[n]++;
      for (const p of t.parts) p.mesh.setMatrixAt(c, m.multiplyMatrices(it.matrix, p.local));
    }
    this.tiers.forEach((t, n) => t.parts.forEach((p) => { p.mesh.count = counts[n]; p.mesh.instanceMatrix.needsUpdate = true; }));
  }
}

// Ambil mesh GLB jadi bagian instanced, daun jadi cutout biar murah
export function partsOf(model, { leafTint = true } = {}) {
  model.updateMatrixWorld(true);
  const parts = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const a = o.material, cut = a.transparent || a.alphaTest > 0;
    const material = new THREE.MeshStandardMaterial({
      map: a.map, normalMap: a.normalMap, roughnessMap: a.roughnessMap, roughness: a.roughness, metalness: 0,
      side: cut ? THREE.DoubleSide : THREE.FrontSide, alphaTest: cut ? 0.5 : 0,
    });
    // Tekstur daunnya gelap banget, di bawah langit terang jadi kebaca kayak ranting
    if (cut && leafTint) material.color.setRGB(3.2, 4.2, 2.1);
    if (material.map) material.map.anisotropy = 8;
    parts.push({ geometry: o.geometry, material, local: o.matrixWorld.clone() });
  });
  return parts;
}
