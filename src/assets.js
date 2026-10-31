import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Asset asli (CC0, Poly Haven dll) dibaca dari /assets/manifest.json.
// Kalau file nggak ada, semuanya jatuh ke tekstur prosedural, jadi app tetep jalan.
//
// manifest.json:
// {
//   "textures": { "grass": "aerial_grass_rock", "dirt": "forrest_ground_01", "bark": "bark_willow_02",
//                 "stone": "rock_boulder_dry", "wood": "wood_planks_grey", "sand": "..." },
//   "hdri": "hdri/sky_1k.hdr",
//   "trees": ["models/tree_a.glb", "models/tree_b.glb"],
//   "treesFar": ["models/tree_a_far.glb", "models/tree_b_far.glb"],
//   "props": { "bench": "models/bench.glb", "lamp": "models/lamp.glb" }
// }
// Tekstur Poly Haven: textures/<name>/<name>_diff_1k.jpg, _nor_gl_1k.jpg, _rough_1k.jpg, _arm_1k.jpg, _disp_1k.jpg (opsional)

const base = import.meta.env.BASE_URL + 'assets/';

async function fetchJSON(url) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function loadTexture(url, { srgb = false, repeat = 1 } = {}) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      resolve(t);
    }, undefined, () => resolve(null));
  });
}

// Set PBR Poly Haven → { map, normalMap, roughnessMap, aoMap }
async function loadPBR(name, repeat) {
  if (!name) return null;
  const dir = `${base}textures/${name}/${name}`;
  const candidates = {
    map: [`${dir}_diff_1k.jpg`, `${dir}_diff_2k.jpg`, `${dir}_diff_1k.png`],
    normalMap: [`${dir}_nor_gl_1k.jpg`, `${dir}_nor_gl_2k.jpg`, `${dir}_nor_gl_1k.png`],
    roughnessMap: [`${dir}_rough_1k.jpg`, `${dir}_rough_2k.jpg`, `${dir}_arm_1k.jpg`],
    aoMap: [`${dir}_ao_1k.jpg`, `${dir}_arm_1k.jpg`],
  };
  const out = {};
  for (const [k, urls] of Object.entries(candidates)) {
    let t = null;
    for (const u of urls) { t = await loadTexture(u, { srgb: k === 'map', repeat }); if (t) break; }
    out[k] = t;
  }
  if (!out.map) return null;
  out.isARM = out.roughnessMap?.image?.src?.includes('_arm_');
  return out;
}

function loadHDRI(url) {
  return new Promise((resolve) => {
    new RGBELoader().load(url, (t) => { t.mapping = THREE.EquirectangularReflectionMapping; resolve(t); }, undefined, () => resolve(null));
  });
}

function loadGLB(url) {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(url, (g) => resolve(g.scene), undefined, () => resolve(null));
  });
}

export async function loadAssets(onProgress = () => {}) {
  const manifest = await fetchJSON(`${base}manifest.json`);
  const assets = { manifest, textures: {}, hdri: null, trees: [], treesFar: [], props: {} };
  if (!manifest) { onProgress('Asset asli nggak ketemu, pake tekstur prosedural'); return assets; }

  const texJobs = Object.entries(manifest.textures || {}).map(async ([key, name]) => {
    onProgress(`Tekstur ${key}`);
    assets.textures[key] = await loadPBR(name, 1);
  });
  const hdriJob = manifest.hdri ? loadHDRI(base + manifest.hdri).then((t) => { assets.hdri = t; }) : null;
  // treesFar opsional: versi ringan, urutannya sama kayak trees
  const treeJobs = (manifest.trees || []).map(async (p, i) => {
    onProgress(`Pohon ${p.split('/').pop()}`);
    const far = manifest.treesFar?.[i];
    const [s, f] = await Promise.all([loadGLB(base + p), far ? loadGLB(base + far) : null]);
    if (s) { assets.trees.push(s); assets.treesFar.push(f || s); }
  });
  const propJobs = Object.entries(manifest.props || {}).map(async ([k, p]) => {
    const s = await loadGLB(base + p);
    if (s) assets.props[k] = s;
  });
  await Promise.all([...texJobs, hdriJob, ...treeJobs, ...propJobs]);
  return assets;
}

// Bikin MeshStandardMaterial dari set PBR, atau pakai fallback canvas texture
export function pbrMaterial(set, fallbackMap, { repeat = 1, roughness = 1, color = 0xffffff, normalScale = 1 } = {}) {
  if (!set) return new THREE.MeshStandardMaterial({ map: fallbackMap, roughness, color });
  const apply = (t) => { if (t) { t.repeat.set(repeat, repeat); t.needsUpdate = true; } return t; };
  const m = new THREE.MeshStandardMaterial({
    map: apply(set.map),
    normalMap: apply(set.normalMap),
    roughnessMap: apply(set.roughnessMap),
    aoMap: apply(set.aoMap),
    roughness: 1,
    color,
  });
  if (set.normalMap) m.normalScale.set(normalScale, normalScale);
  return m;
}
