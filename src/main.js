import * as THREE from 'three';
import { buildWorld, WORLD, groundHeight, isWater, setCityLights, applyNight, distToRiver } from './world.js';
import { blockedByBuilding } from './city.js';
import { createRobot } from './robot.js';
import { createAudio } from './audio.js';
import { createControls } from './controls.js';
import { loadAssets } from './assets.js';

import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// ---------- Setup ----------
const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
const qParam = new URLSearchParams(location.search).get('q');
const QUALITY = qParam === 'low' || qParam === 'high' ? qParam : (isMobile ? 'low' : 'high');
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY === 'high' ? 2 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.75;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xcfe0ee, 0.0035);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 600);

const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3b5a2e, 0.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(QUALITY === 'high' ? 4096 : 2048, QUALITY === 'high' ? 4096 : 2048);
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 250;
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 2;
scene.add(sun, sun.target);

// Langit fisik (Preetham) + matahari asli
const sky = new Sky();
sky.scale.setScalar(5000);
scene.add(sky);
const skyU = sky.material.uniforms;
skyU.turbidity.value = 4;
skyU.rayleigh.value = 1.6;
skyU.mieCoefficient.value = 0.006;
skyU.mieDirectionalG.value = 0.85;
const sunDir = new THREE.Vector3();

// Bintang buat malam
const starGeo = new THREE.BufferGeometry();
{
  const n = 1800, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.9 + 0.05);
    arr[i * 3] = Math.sin(ph) * Math.cos(th) * 480; arr[i * 3 + 1] = Math.cos(ph) * 480; arr[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 480;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
}
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
scene.add(new THREE.Points(starGeo, starMat));

// Environment map dari langit (refleksi di robot, air, kaca)
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = new Sky();
envSky.scale.setScalar(5000);
envScene.add(envSky);
let envRT = null;
function refreshEnvironment() {
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) envSky.material.uniforms[k].value = skyU[k].value;
  envSky.material.uniforms.sunPosition.value.copy(skyU.sunPosition.value);
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0.02);
  // siang pakai HDRI asli kalau ada (refleksi lebih kaya), malam pakai langit
  scene.environment = (typeof hdriRT !== 'undefined' && hdriRT && skyU.sunPosition.value.y > 0.05) ? hdriRT.texture : envRT.texture;
}

const assets = await loadAssets((msg) => { const el = document.getElementById('load-status'); if (el) el.textContent = msg; });
const world = buildWorld(scene, renderer, { quality: QUALITY, assets });
{ const el = document.getElementById('load-status'); if (el) el.textContent = assets.manifest ? 'Asset asli kepasang' : 'Mode prosedural'; }
let hdriRT = null;
if (assets.hdri) { hdriRT = pmrem.fromEquirectangular(assets.hdri); }
const robot = createRobot();
scene.add(robot.root);
// Suara: tiap ganti state robot, audio ikut (servo, gulp, nguap, dengung tidur, dst)
const audio = createAudio();
{
  const setState = robot.setState;
  robot.setState = (name) => {
    const prev = robot.state.name;
    if (prev !== name) audio.onState(name, prev);
    setState(name);
  };
}
robot.root.position.set(WORLD.park.x, 0, WORLD.park.z + 12);
robot.root.rotation.y = Math.PI;

// Post-processing: bloom halus + vignette/grain + SMAA
const composer = QUALITY === 'high'
  ? new EffectComposer(renderer, new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 }))
  : new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.25, 0.5, 0.9);
composer.addPass(bloom);
const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uWarm: { value: 0.5 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uWarm; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // sedikit chromatic aberration di pinggir
      vec2 d = (vUv - 0.5) * 0.004;
      c.r = texture2D(tDiffuse, vUv + d).r;
      c.b = texture2D(tDiffuse, vUv - d).b;
      // vignette
      float v = smoothstep(0.95, 0.35, length(vUv - 0.5));
      c.rgb *= mix(0.72, 1.0, v);
      // color grade hangat tipis
      c.rgb = mix(c.rgb, c.rgb * vec3(1.04, 1.0, 0.95), uWarm);
      // film grain
      c.rgb += (hash(vUv * 1000.0 + uTime) - 0.5) * 0.025;
      gl_FragColor = c;
    }`,
});
composer.addPass(gradePass);
composer.addPass(new OutputPass());
if (QUALITY === 'high') composer.addPass(new SMAAPass(window.innerWidth, window.innerHeight));

const controls = createControls(canvas);

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const hud = $('hud');
const bubble = $('bubble');
const toast = $('toast');
const hint = $('hint');
let cityLights = 3;
let signalsFound = 0;
const lampsEl = $('lamps');
for (let i = 0; i < 5; i++) {
  const d = document.createElement('div');
  d.className = 'lamp' + (i < cityLights ? ' on' : '');
  lampsEl.appendChild(d);
}
function refreshLamps() {
  [...lampsEl.children].forEach((d, i) => d.classList.toggle('on', i < cityLights));
  $('lamps-text').textContent = `${cityLights}/5 · ${(cityLights * 333).toLocaleString('id-ID')} sinyal`;
  setCityLights(cityLights);
}
refreshLamps();

function refreshMuteBtn() { $('mute-btn').textContent = audio.muted ? 'M · Suara off' : 'M · Suara on'; }
function toggleMute() {
  audio.unlock();
  const m = audio.toggleMute();
  refreshMuteBtn();
  showToast(m ? 'Suara dimatiin' : 'Suara nyala', 1400);
}
$('mute-btn').addEventListener('click', toggleMute);
refreshMuteBtn();

let toastTimer;
function showToast(msg, ms = 2600) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, ms);
}
let bubbleTimer;
function say(text, ms = 3200) {
  bubble.textContent = text;
  bubble.hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms);
}

$('wallet-btn').addEventListener('click', () => {
  showToast('Connect wallet nyusul di versi berikutnya. Sementara, nikmatin dulu kotanya.');
});

// Intro
$('start-btn').addEventListener('click', () => {
  $('intro').classList.add('hidden');
  started = true;
  audio.unlock();
  audio.play('boot');
  robot.setState('yawn');
  behavior.lock = 1.8;
  setTimeout(() => say('...oh. Ada sinyal baru. Lu beneran dateng?'), 1900);
});
let started = false;

// ---------- Perilaku "manusia" ----------
const behavior = {
  idleTime: 0,        // berapa lama nggak ada input
  lock: 0,            // lama state dikunci (animasi sekali jalan)
  sitting: null,      // bangku yang diduduki
  nearBench: null,
  nearDrink: false,
  nearPier: false,
  lastChat: 0,
  rockFlight: null,
};

const idleLines = [
  'Dulu kota ini rame banget.',
  'Gua masih nunggu enam unit lainnya.',
  'Kopi ini nggak ngaruh ke sistem gua. Tapi enak aja.',
  'Lampu ke-4 kapan nyala ya...',
  'Sunset di bukit itu, lu harus liat.',
];
const sitLines = ['Bangku ini tempat favorit gua.', 'Duduk bentar. Sistem gua butuh... nggak sih. Pengen aja.', 'Dari sini kelihatan danau sama dermaga.'];

// batu lemparan
const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), new THREE.MeshStandardMaterial({ color: 0x777 }));
rock.visible = false;
scene.add(rock);
const splashes = [];
function splash(x, z) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, -0.2, z);
  scene.add(ring);
  splashes.push({ ring, t: 0 });
  audio.play('plunk');
}

// ---------- Siang / malam ikut jam asli ----------
const hourParam = new URLSearchParams(location.search).get('hour'); // ?hour=12 buat ngetes siang
function timeOfDay() {
  if (hourParam !== null) return +hourParam;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}
let lastEnvHour = -1;
const sunColor = new THREE.Color();
const fogDay = new THREE.Color(0xcfe0ee), fogDusk = new THREE.Color(0xe8b48a), fogNight = new THREE.Color(0x0a0f1c);
function applyDaylight(h) {
  // elevasi matahari: -1 tengah malam, 1 tengah hari
  const elev = Math.sin(((h - 6) / 12) * Math.PI);
  const daylight = Math.max(0, elev);
  const night = THREE.MathUtils.clamp(1 - (elev + 0.15) * 3, 0, 1);
  const dusk = Math.exp(-Math.pow(elev / 0.18, 2)); // puncak pas matahari di horizon
  const ang = ((h - 6) / 12) * Math.PI;
  // azimut geser biar bayangan panjang pas sore
  sunDir.set(Math.cos(ang) * 0.8, Math.max(-0.35, Math.sin(ang)), 0.45 + Math.cos(ang) * 0.3).normalize();
  skyU.sunPosition.value.copy(sunDir);
  skyU.turbidity.value = 3 + dusk * 6;
  skyU.rayleigh.value = 1.2 + dusk * 2.5;
  skyU.mieCoefficient.value = 0.004 + dusk * 0.02;
  sunColor.setHSL(0.09 - dusk * 0.03, 0.55 + dusk * 0.35, 0.55 + daylight * 0.4 - dusk * 0.15);
  sun.color.copy(sunColor);
  sun.intensity = 0.05 + daylight * 3.4;
  sun.position.copy(sunDir).multiplyScalar(120).add(robot.root.position);
  hemi.intensity = 0.06 + daylight * 0.4;
  hemi.color.setHSL(0.6, 0.4, 0.5 + daylight * 0.3);
  starMat.opacity = night * 0.9;
  scene.fog.color.copy(fogDay).lerp(fogDusk, dusk).lerp(fogNight, night);
  scene.fog.density = 0.0028 + dusk * 0.0025 + night * 0.001;
  renderer.toneMappingExposure = 0.5 + daylight * 0.22 + dusk * 0.08;
  // Siang pakai foto langit asli kalau ada, senja dan malam balik ke langit fisik
  const photoSky = assets.hdri && daylight > 0.3;
  sky.visible = !photoSky;
  scene.background = photoSky ? assets.hdri : null;
  gradePass.uniforms.uWarm.value = 0.3 + dusk * 0.7;
  bloom.strength = 0.2 + night * 0.4;
  world.setSun(sunDir, sunColor);
  applyNight(night);
  // refresh env map tiap ~6 menit waktu asli (0.1 jam)
  if (Math.abs(h - lastEnvHour) > 0.1) { lastEnvHour = h; refreshEnvironment(); }
  $('clock').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
}

// ---------- Loop ----------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
let elapsed = 0;
let frameNo = 0;
const SPEED_WALK = 4.2;
const SPEED_RUN = 8.5;

function nearest(list, x, z, maxD) {
  let best = null, bd = maxD;
  for (const b of list) {
    const d = Math.hypot(b.x - x, b.z - z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function setHint(text) { if (hint.textContent !== text) hint.textContent = text; }

function tick() {
  const rawDt = clock.getDelta();
  const dt = Math.min(0.05, rawDt); // fisika di-clamp biar nggak loncat
  elapsed += dt;
  controls.poll();
  const inp = controls.input;
  const pos = robot.root.position;

  if (started) {
    // --- deteksi sekitar ---
    behavior.nearBench = nearest(WORLD.benches, pos.x, pos.z, 2.6);
    const f = WORLD.fountain;
    behavior.nearDrink = Math.hypot(pos.x - f.x, pos.z - f.z) < f.r + 2.2 || Math.hypot(pos.x - WORLD.cafe.x, pos.z - (WORLD.cafe.z + 3.5)) < 3.5;
    behavior.nearPier = Math.hypot(pos.x - WORLD.pier.x, pos.z - (WORLD.pier.z + WORLD.pier.len / 2 - 1)) < 2.5
      || Math.hypot(pos.x - WORLD.lake.x, pos.z - WORLD.lake.z) < WORLD.lake.r + 2.5;
    $('act-sit').hidden = !behavior.nearBench && !behavior.sitting;
    $('act-sit').textContent = behavior.sitting ? 'E · Berdiri' : 'E · Duduk';
    $('act-drink').hidden = !behavior.nearDrink || !!behavior.sitting;
    $('act-throw').hidden = !behavior.nearPier || !!behavior.sitting;

    // --- aksi ---
    if (controls.consume('e')) {
      if (behavior.sitting) {
        behavior.sitting = null;
        robot.setState('idle');
      } else if (behavior.nearBench) {
        const b = behavior.nearBench;
        behavior.sitting = b;
        pos.set(b.x + Math.sin(b.rotY) * 0.05, b.y, b.z + Math.cos(b.rotY) * 0.05);
        robot.root.rotation.y = b.rotY;
        robot.setState('sit');
        behavior.idleTime = 0;
        say(sitLines[Math.floor(Math.random() * sitLines.length)]);
      }
    }
    if (controls.consume('f') && behavior.nearDrink && !behavior.sitting) {
      robot.setState('drink');
      behavior.lock = 2.4;
      setTimeout(() => say('Ahh. Nggak kerasa apa-apa. Tapi enak.'), 1500);
    }
    if (controls.consume('r') && behavior.nearPier && !behavior.sitting) {
      robot.setState('throw');
      behavior.lock = 0.9;
      const dir = new THREE.Vector3(Math.sin(robot.root.rotation.y), 0, Math.cos(robot.root.rotation.y));
      behavior.rockFlight = { t: 0, from: pos.clone().add(new THREE.Vector3(0, 1.2, 0)), dir, bounces: 0 };
      rock.visible = true;
    }
    if (controls.consume('q')) takePhoto();
    if (controls.consume('m')) toggleMute();

    // --- gerak ---
    behavior.lock = Math.max(0, behavior.lock - rawDt);
    const moving = Math.hypot(inp.move.x, inp.move.y) > 0.05;
    if (moving && behavior.lock <= 0) {
      if (behavior.sitting) { behavior.sitting = null; }
      const speed = inp.run ? SPEED_RUN : SPEED_WALK;
      // arah relatif kamera
      const yaw = inp.camYaw;
      const dx = inp.move.x * Math.cos(yaw) - inp.move.y * Math.sin(yaw);
      const dz = inp.move.x * Math.sin(yaw) + inp.move.y * Math.cos(yaw);
      const nx = pos.x + dx * speed * dt;
      const nz = pos.z + dz * speed * dt;
      const half = WORLD.size * 0.75;
      const free = (x, z) => !isWater(x, z) && !blockedByBuilding(x, z) && Math.abs(x) < half && Math.abs(z) < half;
      if (free(nx, nz)) {
        pos.x = nx; pos.z = nz;
      } else if (blockedByBuilding(nx, nz) && free(nx, pos.z)) {
        pos.x = nx; // meluncur sepanjang tembok
      } else if (blockedByBuilding(nx, nz) && free(pos.x, nz)) {
        pos.z = nz;
      } else if (isWater(nx, nz) && Math.random() < 0.02) {
        say('Air. Nggak dulu, sistem gua belum kedap.', 1600);
      }
      const targetRot = Math.atan2(dx, dz);
      let diff = targetRot - robot.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      robot.root.rotation.y += diff * Math.min(1, dt * 12);
      robot.setState(inp.run ? 'run' : 'walk');
      behavior.idleTime = 0;
    } else if (behavior.lock <= 0 && !behavior.sitting) {
      if (['walk', 'run', 'drink', 'throw', 'curious', 'yawn', 'wave'].includes(robot.state.name)) robot.setState('idle');
    }

    // tinggi tanah (bukit, jembatan, dermaga)
    let gy = groundHeight(pos.x, pos.z);
    const b = WORLD.bridge;
    if (Math.abs(pos.x - b.x) < b.len / 2 + 1 && Math.abs(pos.z - b.z) < b.w / 2) gy = 0.62;
    const p = WORLD.pier;
    if (Math.abs(pos.x - p.x) < p.w / 2 && Math.abs(pos.z - p.z) < p.len / 2) gy = 0.4;
    if (!behavior.sitting) pos.y += (gy - pos.y) * Math.min(1, dt * 14);

    // --- idle: nguap lalu tidur ---
    if (inp.anyInput) behavior.idleTime = 0; else behavior.idleTime += rawDt;
    if (!behavior.sitting && behavior.lock <= 0) {
      if (behavior.idleTime > 14 && behavior.idleTime < 14.1) { robot.setState('yawn'); behavior.lock = 1.8; }
      if (behavior.idleTime > 30 && robot.state.name !== 'sleep') { robot.setState('sleep'); say('...zzz', 2000); }
      // penasaran sama sungai/danau
      if (behavior.idleTime > 4 && behavior.idleTime < 4.1 && behavior.nearPier) { robot.setState('curious'); behavior.lock = 3; }
    }
    if (behavior.sitting && behavior.idleTime > 40 && robot.state.name !== 'sleep') { robot.setState('sleep'); }
    if (robot.state.name === 'sleep' && inp.anyInput) { robot.setState(behavior.sitting ? 'sit' : 'idle'); say('Eh! Gua nggak tidur kok.', 1800); }

    // ngomong sendiri sesekali
    behavior.lastChat += rawDt;
    if (behavior.lastChat > 25 && robot.state.name !== 'sleep') {
      behavior.lastChat = 0;
      say(idleLines[Math.floor(Math.random() * idleLines.length)]);
    }

    // --- quest: sinyal hilang ---
    for (const s of WORLD.signals) {
      if (s.taken) continue;
      if (Math.hypot(pos.x - s.x, pos.z - s.z) < 1.6) {
        s.taken = true;
        s.mesh.visible = false;
        signalsFound++;
        $('quest-count').textContent = signalsFound;
        showToast(`Sinyal ketemu (${signalsFound}/5)`);
        audio.play('chime');
        robot.setState('wave');
        behavior.lock = 1.2;
        if (signalsFound === 3 && cityLights < 4) { cityLights = 4; refreshLamps(); setTimeout(() => audio.play('lamp'), 500); say('Lampu keempat! Kotanya makin terang.'); }
        if (signalsFound === 5) { cityLights = 5; refreshLamps(); setTimeout(() => audio.play('lamp'), 500); say('Semua lampu nyala. Gua... inget rasanya kayak gini.', 5000); }
      }
    }

    // hint kontekstual
    if (behavior.sitting) setHint('Tekan E atau gerak buat berdiri. Diemin aja, dia bakal ketiduran.');
    else if (behavior.nearBench) setHint('Ada bangku. E buat duduk.');
    else if (behavior.nearDrink) setHint('F buat "minum". Nggak ngaruh ke sistemnya, tapi dia suka.');
    else if (behavior.nearPier) setHint('R buat lempar batu ke danau.');
    else setHint('WASD / joystick buat jalan · Shift lari · geser mouse buat muter kamera');
  }

  // batu terbang
  if (behavior.rockFlight) {
    const r = behavior.rockFlight;
    r.t += dt;
    const d = r.t * 9;
    const y = r.from.y + r.t * 4 - 9.8 * r.t * r.t * 0.5 - r.bounces * 0.6;
    rock.position.set(r.from.x + r.dir.x * d, y, r.from.z + r.dir.z * d);
    if (y < -0.2) {
      if (r.bounces < 2 && isWater(rock.position.x, rock.position.z)) {
        splash(rock.position.x, rock.position.z);
        r.bounces++;
        r.from.set(rock.position.x, 0.2, rock.position.z);
        r.t = 0;
        r.from.y = 0.1;
      } else {
        if (isWater(rock.position.x, rock.position.z)) splash(rock.position.x, rock.position.z);
        rock.visible = false;
        behavior.rockFlight = null;
        if (r.bounces >= 2) say('Tiga kali! Lu liat kan?', 2200);
      }
    }
  }
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i];
    s.t += dt;
    s.ring.scale.setScalar(1 + s.t * 6);
    s.ring.material.opacity = Math.max(0, 0.8 - s.t * 1.2);
    if (s.t > 0.7) { scene.remove(s.ring); splashes.splice(i, 1); }
  }

  // update dunia + robot + langit
  world.update(elapsed, dt);
  if (frameNo++ % 12 === 0) { camera.updateMatrixWorld(); world.updateTrees(camera); }
  gradePass.uniforms.uTime.value = elapsed;
  robot.update(dt, 0, elapsed);
  const hourNow = window.__u7?.forceHour ?? timeOfDay();
  applyDaylight(hourNow);
  if (started) {
    const onWood = Math.abs(pos.y - 0.62) < 0.08 || Math.abs(pos.y - 0.4) < 0.08;
    const nearFountain = Math.hypot(pos.x - WORLD.fountain.x, pos.z - WORLD.fountain.z) < WORLD.fountain.r + 3;
    const lakeDist = Math.max(0, Math.hypot(pos.x - WORLD.lake.x, pos.z - WORLD.lake.z) - WORLD.lake.r);
    audio.update({
      dt: rawDt, hour: hourNow, state: robot.state.name, time: elapsed,
      moving: Math.hypot(inp.move.x, inp.move.y) > 0.05 && behavior.lock <= 0, run: inp.run,
      waterDist: Math.min(lakeDist, distToRiver(pos.x, pos.z) - 3, nearFountain ? 2 : 99),
      surface: onWood ? 'wood' : nearFountain ? 'stone' : 'grass',
    });
  }

  // kamera orbit ngikutin robot
  const dist = 6.5;
  const yaw = inp.camYaw;
  const pitch = inp.camPitch;
  camTarget.set(pos.x, pos.y + 1.4, pos.z);
  camPos.set(
    pos.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    pos.y + 1.4 + Math.sin(pitch) * dist,
    pos.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  const camGround = groundHeight(camPos.x, camPos.z) + 0.6;
  if (camPos.y < camGround) camPos.y = camGround;
  camera.position.lerp(camPos, started ? Math.min(1, dt * 6) : 1);
  camera.lookAt(camTarget);
  sun.target.position.copy(pos);

  // posisi bubble di atas kepala
  if (!bubble.hidden) {
    const v = new THREE.Vector3(pos.x, pos.y + 2.9, pos.z).project(camera);
    bubble.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    bubble.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  }

  composer.render();
  requestAnimationFrame(tick);
}

function takePhoto() {
  hud.classList.add('hidden');
  requestAnimationFrame(() => {
    composer.render();
    try {
      const url = renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `u7-world-${Date.now()}.png`;
      a.click();
      showToast('Foto tersimpan. Share ke X pake #VUZZWorld');
    } catch (e) {
      showToast('Foto gagal disimpan di browser ini.');
    }
    hud.classList.remove('hidden');
  });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

window.__u7 = { robot, behavior, controls, audio, scene, camera, renderer, blockedByBuilding };

// kamera awal: dari depan robot
controls.input.camYaw = Math.PI;
tick();
