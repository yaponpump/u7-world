import * as THREE from 'three';

// Tekstur prosedural (nggak ada asset eksternal). Semuanya di-generate pas load.

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise tileable
function makeNoise(size, seed) {
  const rnd = mulberry(seed);
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const sample = (x, y) => {
    const xi = Math.floor(x) % size, yi = Math.floor(y) % size;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = g[yi * size + xi], b = g[yi * size + ((xi + 1) % size)];
    const c = g[((yi + 1) % size) * size + xi], d = g[((yi + 1) % size) * size + ((xi + 1) % size)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  return (u, v, octaves = 5) => {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += sample(((u * freq) % 1 + 1) % 1 * size, ((v * freq) % 1 + 1) % 1 * size) * amp;
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  };
}

function canvasTex(size, draw, { srgb = true, repeat = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  draw(img.data, size);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function hslToRgb(h, s, l) {
  const c = new THREE.Color().setHSL(h, s, l);
  return [c.r * 255, c.g * 255, c.b * 255];
}

export function grassTexture(size = 1024) {
  const n1 = makeNoise(64, 11), n2 = makeNoise(128, 23), n3 = makeNoise(16, 5);
  return canvasTex(size, (d, s) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s;
      const big = n3(u, v, 3);
      const mid = n1(u, v, 4);
      const fine = n2(u * 3, v * 3, 4);
      const hue = 0.23 + (big - 0.5) * 0.08 + (mid - 0.5) * 0.03;
      const light = 0.22 + big * 0.12 + (fine - 0.5) * 0.18;
      const sat = 0.42 + (mid - 0.5) * 0.2;
      const [r, g, b] = hslToRgb(hue, sat, Math.max(0.08, Math.min(0.5, light)));
      const i = (y * s + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }, { repeat: 1 });
}

export function dirtTexture(size = 512) {
  const n1 = makeNoise(64, 31), n2 = makeNoise(256, 41);
  return canvasTex(size, (d, s) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s;
      const a = n1(u, v, 4), b = n2(u, v, 3);
      const l = 0.42 + (a - 0.5) * 0.2 + (b - 0.5) * 0.25;
      const [r, g, bb] = hslToRgb(0.09, 0.28 + (a - 0.5) * 0.1, l);
      const i = (y * s + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = bb; d[i + 3] = 255;
    }
  });
}

export function barkTexture(size = 512) {
  const n1 = makeNoise(32, 71), n2 = makeNoise(128, 73);
  return canvasTex(size, (d, s) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s;
      // alur vertikal
      const ridge = n1(u * 6, v * 0.5, 3);
      const fine = n2(u, v, 4);
      const l = 0.16 + ridge * 0.2 + (fine - 0.5) * 0.18;
      const [r, g, b] = hslToRgb(0.075, 0.35, Math.max(0.05, l));
      const i = (y * s + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }, { repeat: 1 });
}

// Kartu daun: beberapa daun dalam satu kartu dengan alpha
export function leafCardTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rnd = mulberry(99);
  for (let i = 0; i < 14; i++) {
    const cx = size * (0.2 + rnd() * 0.6), cy = size * (0.2 + rnd() * 0.6);
    const len = size * (0.16 + rnd() * 0.14), wid = len * (0.35 + rnd() * 0.25);
    const ang = rnd() * Math.PI * 2;
    const hue = 0.24 + (rnd() - 0.5) * 0.08;
    const light = 0.22 + rnd() * 0.2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const grad = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
    grad.addColorStop(0, `hsl(${hue * 360},45%,${light * 100}%)`);
    grad.addColorStop(1, `hsl(${hue * 360},50%,${(light + 0.12) * 100}%)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.quadraticCurveTo(0, -wid, len / 2, 0);
    ctx.quadraticCurveTo(0, wid, -len / 2, 0);
    ctx.fill();
    ctx.strokeStyle = `hsla(${hue * 360},40%,${(light - 0.1) * 100}%,0.6)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Normal map air: dari tinggi noise, tileable
export function waterNormalTexture(size = 512) {
  const n = makeNoise(64, 1234);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    h[y * size + x] = n(u, v, 5) * 0.7 + n(u * 3 + 0.3, v * 3 + 0.7, 3) * 0.3;
  }
  return canvasTex(size, (d, s) => {
    const str = 6.0;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const l = h[y * s + ((x - 1 + s) % s)], r = h[y * s + ((x + 1) % s)];
      const u = h[((y - 1 + s) % s) * s + x], dn = h[((y + 1) % s) * s + x];
      const nx = (l - r) * str, ny = (u - dn) * str;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * s + x) * 4;
      d[i] = (nx / len * 0.5 + 0.5) * 255;
      d[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }, { srgb: false });
}

// Garis panel buat armor robot (roughness/bump)
export function panelLineTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry(7);
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const x = rnd() * size, y = rnd() * size, w = 40 + rnd() * 160, hgt = 30 + rnd() * 120;
    ctx.strokeRect(x, y, w, hgt);
  }
  // goresan halus
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 300; i++) {
    const x = rnd() * size, y = rnd() * size;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 8); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function stoneTexture(size = 512) {
  const n1 = makeNoise(32, 301), n2 = makeNoise(256, 302);
  return canvasTex(size, (d, s) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s;
      const a = n1(u, v, 3), b = n2(u, v, 4);
      const l = 0.5 + (a - 0.5) * 0.25 + (b - 0.5) * 0.2;
      const [r, g, bb] = hslToRgb(0.1, 0.06, l);
      const i = (y * s + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = bb; d[i + 3] = 255;
    }
  });
}

export function woodTexture(size = 512) {
  const n1 = makeNoise(16, 401), n2 = makeNoise(128, 402);
  return canvasTex(size, (d, s) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s;
      const grain = Math.sin((v * 2 + n1(u, v, 2) * 1.2) * Math.PI * 14) * 0.5 + 0.5;
      const fine = n2(u * 0.3, v * 4, 3);
      const l = 0.3 + grain * 0.12 + (fine - 0.5) * 0.15;
      const [r, g, b] = hslToRgb(0.07, 0.42, l);
      const i = (y * s + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  });
}

// Cat logam aus: bintik kotor, baret tipis, dan bagian cat yang kelupas
export function wornPaintTextures(size = 1024) {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const a = mk(), b = mk();
  const ca = a.getContext('2d'), cb = b.getContext('2d');
  ca.fillStyle = '#cfcfcf'; ca.fillRect(0, 0, size, size);
  cb.fillStyle = '#7a7a7a'; cb.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = Math.random() * Math.random() * 7;
    const v = 150 + Math.random() * 90 | 0;
    ca.fillStyle = `rgba(${v},${v},${v},0.16)`;
    ca.beginPath(); ca.arc(x, y, r, 0, 6.28); ca.fill();
    const w = 90 + Math.random() * 90 | 0;
    cb.fillStyle = `rgba(${w},${w},${w},0.14)`;
    cb.beginPath(); cb.arc(x, y, r * 1.6, 0, 6.28); cb.fill();
  }
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * size, y = Math.random() * size, ang = Math.random() * 6.28, len = 10 + Math.random() * 90;
    ca.strokeStyle = 'rgba(255,255,255,0.5)'; cb.strokeStyle = 'rgba(45,45,45,0.55)';
    ca.lineWidth = cb.lineWidth = 0.6 + Math.random() * 1.2;
    for (const ctx of [ca, cb]) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * size, y = Math.random() * size, n = 6 + Math.random() * 10 | 0;
    for (let k = 0; k < n; k++) {
      const px = x + (Math.random() - 0.5) * 34, py = y + (Math.random() - 0.5) * 18, r = 1 + Math.random() * 5;
      ca.fillStyle = 'rgba(70,68,66,0.8)'; cb.fillStyle = 'rgba(200,200,200,0.8)';
      for (const ctx of [ca, cb]) { ctx.beginPath(); ctx.arc(px, py, r, 0, 6.28); ctx.fill(); }
    }
  }
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(a, true), rough: tex(b, false) };
}
