import * as THREE from 'three';
import { buildWorld, WORLD, groundHeight, isWater, setCityLights, applyNight } from './world.js';
import { createRobot } from './robot.js';
import { createControls } from './controls.js';

// ---------- Setup ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe6f5, 60, 160);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);

const hemi = new THREE.HemisphereLight(0xdfeeff, 0x3f6b3a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.camera.far = 200;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// Langit: bola besar dengan gradient
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    top: { value: new THREE.Color(0x6fb6ff) },
    bottom: { value: new THREE.Color(0xf4d9b8) },
    stars: { value: 0 },
  },
  vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform vec3 top; uniform vec3 bottom; uniform float stars; varying vec3 vPos;
    float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
    void main(){
      float h = normalize(vPos).y;
      vec3 c = mix(bottom, top, smoothstep(-0.05, 0.6, h));
      float s = step(0.998, hash(floor(normalize(vPos) * 180.0))) * stars * smoothstep(0.05, 0.4, h);
      gl_FragColor = vec4(c + s, 1.0);
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), skyMat);
scene.add(sky);

const world = buildWorld(scene);
const robot = createRobot();
scene.add(robot.root);
robot.root.position.set(WORLD.park.x, 0, WORLD.park.z + 12);
robot.root.rotation.y = Math.PI;

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
}

// ---------- Siang / malam ikut jam asli ----------
const dayColors = {
  top: [new THREE.Color(0x0b1026), new THREE.Color(0xff9a5c), new THREE.Color(0x6fb6ff), new THREE.Color(0xff7a4d), new THREE.Color(0x0b1026)],
  bottom: [new THREE.Color(0x1a1f3a), new THREE.Color(0xffd7a8), new THREE.Color(0xf4d9b8), new THREE.Color(0xffc38a), new THREE.Color(0x1a1f3a)],
};
function timeOfDay() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}
function applyDaylight(h) {
  // 0..24 → fase: malam(0) fajar(6) siang(12) senja(18) malam(24)
  const keys = [0, 6, 12, 18, 24];
  let i = 0;
  while (h >= keys[i + 1]) i++;
  const k = (h - keys[i]) / (keys[i + 1] - keys[i]);
  const sm = k * k * (3 - 2 * k);
  skyMat.uniforms.top.value.copy(dayColors.top[i]).lerp(dayColors.top[i + 1], sm);
  skyMat.uniforms.bottom.value.copy(dayColors.bottom[i]).lerp(dayColors.bottom[i + 1], sm);
  const daylight = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)); // 0 malam, 1 tengah hari
  const night = 1 - Math.min(1, daylight * 2.2);
  skyMat.uniforms.stars.value = night;
  sun.intensity = 0.15 + daylight * 2.2;
  sun.color.setHSL(0.08, 0.6, 0.6 + daylight * 0.35);
  hemi.intensity = 0.25 + daylight * 0.7;
  const ang = ((h - 6) / 12) * Math.PI;
  sun.position.set(Math.cos(ang) * 60, Math.max(8, Math.sin(ang) * 70), 30);
  scene.fog.color.copy(skyMat.uniforms.bottom.value);
  renderer.toneMappingExposure = 0.85 + daylight * 0.3;
  applyNight(night);
  $('clock').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
}

// ---------- Loop ----------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
let elapsed = 0;
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
      if (!isWater(nx, nz) && Math.abs(nx) < half && Math.abs(nz) < half) {
        pos.x = nx; pos.z = nz;
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
        robot.setState('wave');
        behavior.lock = 1.2;
        if (signalsFound === 3 && cityLights < 4) { cityLights = 4; refreshLamps(); say('Lampu keempat! Kotanya makin terang.'); }
        if (signalsFound === 5) { cityLights = 5; refreshLamps(); say('Semua lampu nyala. Gua... inget rasanya kayak gini.', 5000); }
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
  world.update(elapsed);
  robot.update(dt, 0, elapsed);
  applyDaylight(timeOfDay());

  // kamera orbit ngikutin robot
  const dist = 7.5;
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

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function takePhoto() {
  hud.classList.add('hidden');
  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    try {
      const url = renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `u7-world-${Date.now()}.png`;
      a.click();
      showToast('Foto tersimpan. Share ke X pake #U7World');
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
});

window.__u7 = { robot, behavior, controls };

// kamera awal: dari depan robot
controls.input.camYaw = Math.PI;
tick();
