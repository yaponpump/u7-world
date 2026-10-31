import * as THREE from 'three';

// Cuaca: awan, hujan, angin, dan sinar emas. Nilainya pindah pelan-pelan biar transisinya halus.
const KINDS = {
  clear: { cover: 0, rain: 0, wind: 1, gold: 0 },
  cloudy: { cover: 0.72, rain: 0, wind: 1.3, gold: 0 },
  rain: { cover: 0.88, rain: 0.6, wind: 1.7, gold: 0 },
  storm: { cover: 1, rain: 1, wind: 2.6, gold: 0 },
  golden: { cover: 0, rain: 0, wind: 1, gold: 1 },
};
const RANGE = 36, HEIGHT = 18;
const grey = new THREE.Color(), warm = new THREE.Color(0xffc27a), flashColor = new THREE.Color(0xdfe6ff);

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * 1024, y = Math.random() * 512, r = 30 + Math.random() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const v = Math.random() > 0.5 ? 255 : 90;
    g.addColorStop(0, `rgba(${v},${v},${v},0.16)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWeather(scene, renderer, { hi, waters, wind }) {
  let sun = null, hemi = null;
  scene.traverse((o) => { if (o.isDirectionalLight) sun = o; if (o.isHemisphereLight) hemi = o; });

  const cur = { ...KINDS.clear }, target = { ...KINDS.clear };
  let flash = 0, nextFlash = 4, kindNow = 'clear', frame = 0;
  // Bayangan nggak perlu dihitung ulang tiap frame
  if (sun) sun.shadow.autoUpdate = false;

  // Kubah awan: nutup foto langit pas mendung. Kena depth test, jadi cuma keliatan di langit.
  const domeMat = new THREE.MeshBasicMaterial({ map: cloudTexture(), side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), domeMat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  dome.visible = false;
  scene.add(dome);

  // Hujan: garis-garis yang ngebungkus kamera, posisinya dihitung di GPU
  const count = hi ? 6000 : 2200;
  const seed = new Float32Array(count * 2 * 3), end = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    seed.set([x, y, z, x, y, z], i * 6);
    end[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(seed, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const rainU = { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uSlant: { value: 0.1 }, uBright: { value: 0.3 } };
  const rainMat = new THREE.ShaderMaterial({
    uniforms: rainU, transparent: true, depthWrite: false,
    vertexShader: `
      attribute float aEnd; uniform vec3 uCam; uniform float uTime, uSlant;
      varying float vA;
      void main() {
        float fall = 15.0 + position.z * 7.0;
        float y = mod(position.y * ${HEIGHT.toFixed(1)} - uTime * fall, ${HEIGHT.toFixed(1)});
        vec3 p = vec3(mod(position.x * ${RANGE.toFixed(1)} - uCam.x + y * uSlant, ${RANGE.toFixed(1)}), y, mod(position.z * ${RANGE.toFixed(1)} - uCam.z, ${RANGE.toFixed(1)}));
        p.xz += uCam.xz - ${(RANGE / 2).toFixed(1)};
        p.y += uCam.y - 5.0;
        p += vec3(uSlant, 1.0, 0.0) * aEnd * 0.55;
        vA = mix(0.15, 1.0, aEnd);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uBright; varying float vA;
      void main() { gl_FragColor = vec4(vec3(0.78, 0.84, 0.92), vA * uBright); }`,
  });
  const rain = new THREE.LineSegments(geo, rainMat);
  rain.frustumCulled = false;
  rain.visible = false;
  rain.onBeforeRender = (_r, _s, camera) => { rainU.uCam.value.copy(camera.position); };
  scene.add(rain);

  const baseDistortion = waters.map((w) => w.material.uniforms.distortionScale.value);

  return {
    set({ kind = 'clear', intensity = 1 } = {}) {
      const k = KINDS[kind] || KINDS.clear, i = Math.min(1, Math.max(0, intensity));
      kindNow = kind;
      target.cover = k.cover * i;
      target.rain = k.rain * i;
      target.gold = k.gold * i;
      target.wind = 1 + (k.wind - 1) * i;
    },
    get state() { return { kind: kindNow, ...cur }; },
    update(t, dt) {
      const k = 1 - Math.exp(-dt * 0.8);
      for (const key of ['cover', 'rain', 'wind', 'gold']) cur[key] += (target[key] - cur[key]) * k;
      wind.value = cur.wind;
      rainU.uTime.value = t;
      rainU.uSlant.value = 0.08 * cur.wind;
      rainU.uBright.value = 0.34 * Math.min(1, cur.rain * 2);
      rain.visible = cur.rain > 0.01;
      geo.setDrawRange(0, Math.floor(count * 2 * cur.rain));
      // Petir cuma pas badai beneran
      flash = Math.max(0, flash - dt * 5);
      if (target.rain > 0.8 && cur.cover > 0.8) {
        nextFlash -= dt;
        if (nextFlash < 0) { flash = 1; nextFlash = 5 + Math.random() * 12; }
      }
    },
    // Dipanggil abis siklus siang/malam, jadi cuaca numpang di atas nilainya
    apply() {
      if (sun && frame++ % 3 === 0) sun.shadow.needsUpdate = true;
      const { cover, rain: wet, gold } = cur;
      const c = scene.fog.color;
      const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
      grey.setRGB(l * 0.72, l * 0.76, l * 0.82);
      c.lerp(grey, cover).lerp(warm, gold * 0.35);
      scene.fog.density *= 1 + cover * 0.7 + wet * 1.6;
      domeMat.color.copy(c).lerp(flashColor, flash * 0.7);
      domeMat.opacity = Math.min(0.97, cover * 1.25);
      dome.visible = domeMat.opacity > 0.01;
      domeMat.map.offset.x = performance.now() * 0.000003 * cur.wind;
      if (sun) {
        sun.intensity *= (1 - cover * 0.86) * (1 + gold * 0.3);
        sun.color.lerp(warm, gold * 0.65);
      }
      if (hemi) hemi.intensity = hemi.intensity * (1 - cover * 0.2) + flash * 2.2;
      renderer.toneMappingExposure *= 1 - cover * 0.1 + gold * 0.1;
      scene.environmentIntensity = 1 - cover * 0.5 + gold * 0.12 + flash * 0.8;
      waters.forEach((w, i) => { w.material.uniforms.distortionScale.value = baseDistortion[i] * (1 + wet * 1.4); });
    },
  };
}
