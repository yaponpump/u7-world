// Website 7POD: satu canvas Three.js tetap di belakang, seksi DOM di depan,
// scroll halus (Lenis) yang nyetir kamera, pose robot, frame sequence, dan teks (GSAP).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import Lenis from 'lenis';
import { createRobot, EXPRESSIONS } from '../src/robot.js';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

const cfg = window.VUZZ_SITE || {};
const $ = (id) => document.getElementById(id);
const ASSETS = `${import.meta.env.BASE_URL}site-assets/`;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const narrow = () => innerWidth < 900;

// ---------- preloader ----------
const load = { done: 0, total: 0, pct: { v: 0 } };
function track(p) {
  load.total++;
  return Promise.resolve(p).finally(() => { load.done++; paintLoader(); });
}
function paintLoader() {
  const target = Math.round((load.done / Math.max(1, load.total)) * 100);
  gsap.to(load.pct, { v: target, duration: 0.5, ease: 'power2.out', overwrite: true, onUpdate() {
    $('loader-pct').textContent = Math.round(load.pct.v);
    $('loader-fill').style.width = `${load.pct.v}%`;
  } });
}
document.body.classList.add('loading');
const loadImage = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

// ---------- frame sequence (dengan fallback kalau filenya nggak ada) ----------
async function loadSequence(name, count) {
  const pad = (n) => String(n).padStart(4, '0');
  const first = await loadImage(`${ASSETS}frames/${name}/${pad(1)}.webp`);
  if (!first) return null;
  const frames = new Array(count).fill(null);
  frames[0] = first;
  // 12 frame pertama ikut preloader, sisanya ngalir di belakang
  const eager = [];
  for (let i = 2; i <= Math.min(4, count); i++) eager.push(loadImage(`${ASSETS}frames/${name}/${pad(i)}.webp`).then((im) => { frames[i - 1] = im; }));
  await Promise.all(eager);
  (async () => { for (let i = 13; i <= count; i++) frames[i - 1] = await loadImage(`${ASSETS}frames/${name}/${pad(i)}.webp`); })();
  return frames;
}

// ---------- 3D ----------
const stage = $('stage');
const canvas = $('gl');
let renderer = null, scene, camera, robot, dust, shadowMesh, env;
const view = { x: 2.3, y: 0, z: 0, ry: -0.45, s: 0.92, cx: 0.3, cy: 1.3, cz: 7.2, lx: 0.3, look: 1.35, on: 0 };
// tulisan 7POD 3D di hero, nempel ke kamera biar selalu di tengah layar
const word = { s: 1, rx: 0, ry: 0, y: 0, z: 0, o: 1, spin: 0 };
let wordMesh = null, grid = null;

// Garis tengah huruf (tinggi 2). Tiap titik [x, y, radius sudut]. closed = bentuk tertutup.
const GLYPHS = {
  '7': { w: 1.25, closed: false, pts: [[0, 2, 0], [1.25, 2, 0.32], [0.42, 0, 0]] },
  'P': { w: 1.1, closed: false, capEnd: false, pts: [[0, 0, 0], [0, 2, 0.4], [1.1, 2, 0.5], [1.1, 0.85, 0.5], [0.05, 0.85, 0]] },
  'O': { w: 1.35, closed: true, pts: [[0, 0, 0.5], [1.35, 0, 0.5], [1.35, 2, 0.5], [0, 2, 0.5]] },
  'D': { w: 1.3, closed: true, pts: [[0, 0, 0.38], [1.3, 0, 0.7], [1.3, 2, 0.7], [0, 2, 0.38]] },
};
function roundedPath(pts, closed) {
  const V = (p) => new THREE.Vector3(p[0], p[1], 0);
  const path = new THREE.CurvePath();
  const n = pts.length;
  const corner = (i) => {
    const p = V(pts[i]), r = pts[i][2];
    const prev = V(pts[(i - 1 + n) % n]), next = V(pts[(i + 1) % n]);
    const a = p.clone().add(prev.clone().sub(p).setLength(Math.min(r, prev.distanceTo(p) / 2)));
    const b = p.clone().add(next.clone().sub(p).setLength(Math.min(r, next.distanceTo(p) / 2)));
    return { a, p, b };
  };
  const cs = pts.map((_, i) => (closed || (i > 0 && i < n - 1)) ? corner(i) : { a: V(pts[i]), p: V(pts[i]), b: V(pts[i]) });
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const c = cs[i], d = cs[(i + 1) % n];
    if (c.a.distanceTo(c.b) > 1e-4) path.add(new THREE.QuadraticBezierCurve3(c.a, c.p, c.b));
    path.add(new THREE.LineCurve3(c.b, d.a));
  }
  return path;
}
function buildWord() {
  const group = new THREE.Group();
  const R = 0.2;
  const env = { envMapIntensity: 1.5 };
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf6f0ea, roughness: 0.16, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, ...env });
  const copper = new THREE.MeshPhysicalMaterial({ color: 0xff5a1f, roughness: 0.22, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06, emissive: 0x5a1400, emissiveIntensity: 0.35, ...env });
  // outline: cangkang gelap - terang - gelap - terang tipis
  const shells = [
    [1.22, new THREE.MeshBasicMaterial({ color: 0x1a0c08, side: THREE.BackSide })],
    [1.34, new THREE.MeshBasicMaterial({ color: 0xd8c2b2, side: THREE.BackSide })],
    [1.46, new THREE.MeshBasicMaterial({ color: 0x1a0c08, side: THREE.BackSide })],
    [1.56, new THREE.MeshBasicMaterial({ color: 0x8a6a5a, side: THREE.BackSide, transparent: true, opacity: 0.6 })],
  ];
  let x = 0;
  [...'7POD'].forEach((ch, i) => {
    const g = GLYPHS[ch];
    const path = roundedPath(g.pts, g.closed);
    const ends = g.closed ? [] : g.capEnd === false ? [g.pts[0]] : [g.pts[0], g.pts[g.pts.length - 1]];
    const letter = new THREE.Group();
    const add = (r, mat) => {
      letter.add(new THREE.Mesh(new THREE.TubeGeometry(path, 160, r, 20, g.closed), mat));
      for (const e of ends) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat); m.position.set(e[0], e[1], 0); letter.add(m); }
    };
    add(R, i === 0 ? copper : white);
    for (const [k, mat] of shells) add(R * k, mat);
    letter.position.x = x;
    group.add(letter);
    x += g.w + 0.62;
  });
  const width = x - 0.62;
  group.children.forEach((l) => { l.position.x -= width / 2; l.position.y = -1; });
  group.userData.width = width + R * 3;
  return group;
}
function buildGrid() {
  // lantai grid tipis yang memudar ke pinggir, kayak panggung
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uO: { value: 1 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vP; uniform float uO;
      void main(){ vec2 g = abs(fract(vP * 0.9) - 0.5) / fwidth(vP * 0.9); float l = 1.0 - min(min(g.x, g.y), 1.0);
        float fade = 1.0 - smoothstep(2.0, 11.0, length(vP * vec2(0.8, 1.0)));
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.85), l * fade * 0.16 * uO); }`,
  });
  mat.extensions = { derivatives: true };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}
let webgl = false;
try { webgl = !reduced && !!document.createElement('canvas').getContext('webgl2'); } catch { webgl = false; }

function setup3D() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, narrow() ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 60);
  const pmrem = new THREE.PMREMGenerator(renderer);
  env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  pmrem.dispose();

  // cahaya: key hangat (ember), rim ungu, isi dingin lembut
  scene.add(new THREE.HemisphereLight(0x8d7cff, 0x1a0d08, 0.5));
  const key = new THREE.DirectionalLight(0xffb070, 2.2); key.position.set(2.5, 3.5, 2.5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9b6bff, 2.8); rim.position.set(-3, 2.2, -2.5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xb8ff3c, 0.35); fill.position.set(-1, 0.5, 3); scene.add(fill);

  robot = createRobot({ dormant: true });
  robot.root.position.set(0, 0, 0);
  scene.add(robot.root);

  // 7POD gaya tabung kembung: huruf dari garis tengah + TubeGeometry, outline berlapis pakai cangkang BackSide
  wordMesh = buildWord();
  camera.add(wordMesh);
  grid = buildGrid();
  camera.add(grid);
  scene.add(camera);
  robot.setState('idle');

  // bayangan kontak palsu (radial gradient) biar robot nggak ngambang
  const sc = document.createElement('canvas'); sc.width = sc.height = 256;
  const g = sc.getContext('2d'); const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.75)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadowMesh.rotation.x = -Math.PI / 2; shadowMesh.position.y = 0.005;
  robot.root.add(shadowMesh);

  // debu melayang: partikel kecil di sekitar robot
  const N = coarse ? 160 : 360;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 9; pos[i * 3 + 1] = Math.random() * 4.5; pos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd9a8, size: 0.03, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  addEventListener('resize', () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, narrow() ? 1.5 : 2));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  });
  addEventListener('pagehide', () => { renderer.dispose(); env.dispose(); geo.dispose(); });
}

const mouse = { x: 0, y: 0 };
addEventListener('pointermove', (e) => { mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!document.hidden && renderer) {
    const t = now / 1000;
    const r = robot.root;
    // skala layar sempit: robot lebih kecil dan ke tengah
    const nw = narrow();
    const mid = !nw && innerWidth < 1250;
    const k = nw ? 0.35 : mid ? 0.92 : 1;
    r.position.set(view.x * k, view.y + (nw ? 1.9 : 0), view.z);
    r.rotation.y = view.ry + mouse.x * 0.18;
    r.scale.setScalar(view.s * view.on * (nw ? 0.82 : mid ? 0.86 : 1));
    r.visible = view.on > 0.01;
    camera.position.set(view.cx * k + mouse.x * 0.12, view.cy + 0.25 + mouse.y * -0.08, view.cz * (nw ? 2.1 : 1));
    camera.lookAt(view.lx * k, view.look + (nw ? 0.7 : 0), 0);
    robot.update(dt, 0, t);
    dust.rotation.y = t * 0.02;
    dust.position.y = Math.sin(t * 0.3) * 0.1;
    if (wordMesh) {
      // muat 62% lebar layar, maksimal tinggi 30% layar
      const dist = 6;
      const vh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const fit = Math.min((vh * camera.aspect * (camera.aspect < 1 ? 0.84 : 0.66)) / wordMesh.userData.width, vh * 0.17);
      wordMesh.visible = word.o > 0.01;
      wordMesh.position.set(0, vh * 0.06 + word.y, -dist + word.z);
      grid.position.set(0, vh * 0.06 - 1.35 * fit + word.y, -dist - 2 + word.z);
      grid.material.uniforms.uO.value = word.o;
      grid.visible = word.o > 0.01;
      wordMesh.scale.setScalar(fit * word.s * Math.max(0.001, word.o));
      wordMesh.rotation.set(word.rx + mouse.y * 0.12 + Math.sin(t * 0.6) * 0.03, word.ry + word.spin + mouse.x * 0.28, 0);
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

// ---------- scroll halus ----------
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const el = document.querySelector(a.getAttribute('href'));
    if (!el) return;
    e.preventDefault();
    lenis.scrollTo(el, { offset: 0, duration: 1.4 });
  }));
}

// ---------- teks: judul per baris, paragraf fade ----------
function splitTitles() {
  if (reduced) return;
  document.fonts.ready.then(() => {
    document.querySelectorAll('.split').forEach((el) => {
      const split = new SplitText(el, { type: 'lines', linesClass: 'line' });
      split.lines.forEach((l) => { const d = document.createElement('div'); d.append(...l.childNodes); l.append(d); });
      gsap.from(split.lines.map((l) => l.firstChild), {
        yPercent: 110, opacity: 0, duration: 1.1, ease: 'power4.out', stagger: 0.09,
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      });
    });
    document.querySelectorAll('.reveal').forEach((el) => {
      gsap.from(el, { y: 28, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });
    ScrollTrigger.refresh();
  });
}

// ---------- UI tetap: progress, tag seksi, nav aktif, cue ----------
function fixedUI() {
  const sections = [...document.querySelectorAll('section.s')];
  sections.forEach((s) => {
    ScrollTrigger.create({
      trigger: s, start: 'top 50%', end: 'bottom 50%',
      onToggle(self) {
        if (!self.isActive) return;
        document.body.dataset.section = s.id;
        $('section-tag').textContent = s.dataset.tag || '';
        document.querySelectorAll('.menu a').forEach((a) => a.classList.toggle('active', a.dataset.nav === s.id));
      },
    });
  });
  ScrollTrigger.create({
    start: 0, end: () => ScrollTrigger.maxScroll(window),
    onUpdate(self) { $('progress').style.transform = `scaleX(${self.progress})`; $('scroll-cue').classList.toggle('off', self.scroll() > 80); },
  });
  // warna glow latar ikut seksi
  const glows = { hero: ['#4a1a0c', '#1c0906'], story: ['#1a1030', '#1a0b05'], live: ['#2a1f08', '#17110a'], world: ['#2d1a5c', '#1d1208'], moods: ['#3a1d6e', '#2b1206'], token: ['#1c2a0e', '#14100a'], buy: ['#2d1a5c', '#1d1208'], plan: ['#1a1030', '#1a0b05'], end: ['#4a2690', '#3a1706'] };
  new MutationObserver(() => {
    const [a, b] = glows[document.body.dataset.section] || glows.hero;
    document.documentElement.style.setProperty('--glow-a', a);
    document.documentElement.style.setProperty('--glow-b', b);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-section'] });
}

// ---------- robot ikut scroll: pose per seksi ----------
function robotTimeline() {
  // tiap seksi = satu pose; di antaranya robot nyelip keluar/masuk
  const at = (id) => $(id);
  const pose = (vals, trigger, start = 'top bottom', end = 'top top') => gsap.to(view, {
    ...vals, ease: 'none', scrollTrigger: { trigger, start, end, scrub: 0.6 },
  });
  // hero: pelan muter waktu mulai scroll, lalu mundur keluar ke kanan
  gsap.to(word, { s: 0.55, rx: -0.5, z: -4, y: 0.8, o: 0, ease: 'none', scrollTrigger: { trigger: at('hero'), start: 'top top', end: 'bottom top', scrub: 0.6 } });
  // moods: 7POD di tengah kanan, deket, muter pelan
  pose({ x: 2.0, y: 0, z: 0, ry: -0.25, s: 1, cz: 6.8, cy: 1.4, cx: 0.4, lx: 0.4, look: 1.4, on: 1 }, at('moods'), 'top bottom', 'top top');
  gsap.to(view, { ry: 0.35, ease: 'none', scrollTrigger: { trigger: at('moods'), start: 'top top', end: 'bottom bottom', scrub: 0.6 } });
  pose({ on: 0, y: -0.4 }, at('moods'), 'bottom 60%', 'bottom top');
  // end: 7POD di tengah, dadah
  pose({ x: 0, y: 0, z: 0, ry: 0.1, s: 1, cz: 8.6, cy: 1.2, cx: 0, lx: 0, look: 1.6, on: 1 }, at('end'), 'top bottom', 'top 30%');
  ScrollTrigger.create({ trigger: at('end'), start: 'top 60%', onEnter() { robot.setState('wave'); robot.setExpression('happy', 6); }, onLeaveBack() { robot.setState('idle'); } });
  // hero: dadah sekali waktu loading selesai
}

// ---------- 02 story: frame sequence kota + 4 langkah teks + lampu ----------
async function story(seqPromise) {
  const steps = [...$('story-steps').children];
  const lamps = [...$('lamps').children];
  const seq = await seqPromise;
  const seqCanvas = $('story-seq');
  const lit = $('lit');
  let draw = null;
  if (seq) {
    seqCanvas.style.display = 'block';
    [...$('story-stage').querySelectorAll('img')].forEach((i) => { i.style.display = 'none'; });
    const ctx = seqCanvas.getContext('2d');
    let cur = -1;
    const fit = () => { const r = Math.min(devicePixelRatio, 2); seqCanvas.width = seqCanvas.clientWidth * r; seqCanvas.height = seqCanvas.clientHeight * r; cur = -1; };
    fit(); addEventListener('resize', fit);
    draw = (k) => {
      let i = Math.round(k * (seq.length - 1));
      while (i > 0 && !seq[i]) i--; // frame belum kebuka, pakai yang sebelumnya
      if (i === cur || !seq[i]) return;
      cur = i;
      const im = seq[i], cw = seqCanvas.width, ch = seqCanvas.height;
      const s = Math.max(cw / im.width, ch / im.height);
      const w = im.width * s, h = im.height * s;
      ctx.drawImage(im, (cw - w) / 2, (ch - h) / 2, w, h);
    };
    draw(0);
  }
  const paint = (k) => {
    if (draw) draw(k); else lit.style.opacity = k;
    lamps.forEach((l, i) => l.classList.toggle('on', k >= (i + 0.5) / lamps.length));
  };
  if (reduced) { paint(1); return; }
  ScrollTrigger.create({
    trigger: $('story'), start: 'top top', end: 'bottom bottom', scrub: 0.6,
    onUpdate(self) { paint(self.progress); },
  });
  // teks: tiap langkah dapet jatah 1/4 scroll
  const tl = gsap.timeline({ scrollTrigger: { trigger: $('story'), start: 'top top', end: 'bottom bottom', scrub: 0.6 } });
  steps.forEach((s, i) => {
    tl.to(s, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, i * 2.4 + 0.2);
    if (i < steps.length - 1) tl.to(s, { opacity: 0, y: -24, duration: 0.5, ease: 'power2.in' }, i * 2.4 + 2.0);
  });
}

// ---------- 04 world: kartu parallax + ganti ke stills render ----------
function world() {
  document.querySelectorAll('.card img[data-still]').forEach((img) => {
    const src = `${ASSETS}stills/${img.dataset.still}.jpg`;
    loadImage(src).then((im) => { if (im) img.src = src; });
  });
  if (reduced) return;
  document.querySelectorAll('.card').forEach((c) => {
    const d = parseFloat(c.dataset.depth) || 0.1;
    gsap.fromTo(c, { y: 60 * d * 4 }, { y: -60 * d * 4, ease: 'none', scrollTrigger: { trigger: c, start: 'top bottom', end: 'bottom top', scrub: 0.6 } });
    gsap.fromTo(c.querySelector('img'), { scale: 1.16 }, { scale: 1.0, ease: 'none', scrollTrigger: { trigger: c, start: 'top bottom', end: 'bottom top', scrub: 0.6 } });
  });
}

// ---------- 05 moods: scroll atau klik ganti ekspresi robot ----------
function moods() {
  const items = [...$('faces').children];
  let cur = -1;
  const set = (i, hold = Infinity) => {
    i = Math.max(0, Math.min(items.length - 1, i));
    if (i === cur) return;
    cur = i;
    items.forEach((li, j) => li.classList.toggle('active', j === i));
    const face = items[i].dataset.face;
    if (robot && EXPRESSIONS.includes(face)) {
      robot.setFace(face);
      robot.setState(face === 'surprised' ? 'curious' : face === 'sad' ? 'yawn' : 'idle');
    }
  };
  items.forEach((li, i) => li.addEventListener('click', () => { set(i); if (robot) robot.land(); }));
  if (reduced) { set(0); return; }
  ScrollTrigger.create({
    trigger: $('moods'), start: 'top top', end: 'bottom bottom', scrub: true,
    onUpdate(self) { set(Math.floor(self.progress * items.length * 0.999)); },
    onLeave() { if (robot) { robot.setFace('neutral'); robot.setState('idle'); } },
    onLeaveBack() { if (robot) { robot.setFace('neutral'); robot.setState('idle'); } },
  });
}

// ---------- data token: cuma tampil kalau udah diisi di config.js ----------
function tokenData() {
  document.querySelectorAll('[data-play]').forEach((a) => { if (cfg.playUrl) a.href = cfg.playUrl; });
  const mainnet = cfg.network === 'mainnet';
  if (cfg.mint) {
    $('status').textContent = mainnet ? 'Live on Solana' : 'Solana devnet test, not real money';
    $('ca').hidden = false;
    $('ca-value').textContent = `${cfg.mint.slice(0, 6)}...${cfg.mint.slice(-6)}`;
    $('ca-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(cfg.mint); $('ca-copy').textContent = 'Copied'; }
      catch { $('ca-copy').textContent = 'Copy failed'; }
      setTimeout(() => { $('ca-copy').textContent = 'Copy'; }, 1600);
    });
  }
  if (cfg.buyUrl && mainnet) {
    const b = $('buy-link');
    b.href = cfg.buyUrl; b.target = '_blank'; b.rel = 'noopener';
    b.removeAttribute('aria-disabled'); b.textContent = 'Buy $7POD';
  }
  for (const { label, url } of cfg.links || []) {
    const a = document.createElement('a');
    a.href = url; a.textContent = label; a.rel = 'noopener'; a.target = '_blank';
    $('links').appendChild(a);
  }
  // Jumlah holder asli dari server/holders. Kalau gagal, teks awal tetap dipakai.
  async function holders() {
    try {
      const u = new URL(cfg.holdersUrl);
      u.searchParams.set('mint', cfg.mint);
      u.searchParams.set('network', cfg.network || 'mainnet');
      const r = await fetch(u);
      if (!r.ok) return;
      const d = await r.json();
      if (typeof d.holders !== 'number') return;
      const text = `${d.holders.toLocaleString('en-US')} signals`;
      if (reduced) $('holders').textContent = text;
      else gsap.to($('holders'), { duration: 1.4, scrambleText: { text, chars: '0123456789', speed: 0.6 } });
      $('holders-note').textContent = `Counted from the chain. Updated ${new Date(d.updatedAt).toLocaleTimeString()}.`;
    } catch { /* biarin teks awal */ }
  }
  if (cfg.holdersUrl && cfg.mint) { holders(); setInterval(holders, 5 * 60 * 1000); }
  // teks hitung: scramble masuk sekali waktu kelihatan
  if (!reduced) {
    const el = $('holders'); const text = el.textContent;
    ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter() { gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 1.6, scrambleText: { text, chars: 'upperAndLowerCase', speed: 0.5 } }); } });
  }
}

// ---------- mulai ----------
async function main() {
  const seqPromise = track(loadSequence('city', 90));
  const jobs = [
    track(document.fonts.ready),
    seqPromise,
  ];
  if (webgl) {
    try { setup3D(); jobs.push(track(new Promise((ok) => { renderer.compile(scene, camera); ok(); }))); }
    catch (e) { console.warn('3D off:', e); webgl = false; renderer = null; }
  }
  if (!webgl) { stage.style.display = 'none'; }
  tokenData();
  // jangan nahan layar lebih dari 4 detik, sisanya ngalir di belakang
  await Promise.race([Promise.all(jobs), new Promise((ok) => setTimeout(ok, 4000))]);
  // selesai: tutup loader, mulai render, dan robot dadah sekali
  await gsap.to(load.pct, { v: 100, duration: 0.4, onUpdate() { $('loader-pct').textContent = Math.round(load.pct.v); $('loader-fill').style.width = `${load.pct.v}%`; } });
  gsap.to($('loader'), { yPercent: -100, duration: 0.9, ease: 'power4.inOut', onComplete() { $('loader').remove(); } });
  document.body.classList.remove('loading');
  if (renderer) {
    requestAnimationFrame(frame);
    document.body.classList.add('gl');
    gsap.from(word, { spin: -Math.PI * 1.5, s: 0.2, rx: 0.8, duration: 2.0, ease: 'expo.out', delay: 0.2 });
  }
  splitTitles();
  fixedUI();
  if (renderer) robotTimeline();
  story(seqPromise);
  world();
  moods();
  ScrollTrigger.refresh();
  window.__vuzzSite = { view, robot, lenis, ScrollTrigger };
}
main();
