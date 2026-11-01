import * as THREE from 'three';
import { buildWorld, WORLD, groundHeight, isWater, setCityLights, applyNight, distToRiver, onBridge, onPier, deckHeight, blockedByRail } from './world.js';
import { BUILDINGS, setCityHolders, setCityPower, blockedByBuilding, cameraBlocked, inCity, onClubRoof, nearestFree, obstacleSlip, obstacleTop, rooftopHeight, touchingWall } from './city.js';
import { createRobot, STATES } from './robot.js';
import { createAudio } from './audio.js';
import { createWallet } from './wallet.js';
import { createMarket, MOOD_LABEL } from './market.js';
import { SKINS, isUnlocked, applySkin } from './skins.js';
import { CONFIG } from './config.js';
import { createMinimap } from './minimap.js';
import { createControls } from './controls.js';
import { loadAssets } from './assets.js';
import { loadSave, saveScore, writeSave } from './save.js';
import { watchEvolution } from './evolution.js';
import { pollHolders } from './holders.js';
import { windowFor } from './holderWindow.js';

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
let pixelRatio = Math.min(window.devicePixelRatio, QUALITY === 'high' ? 1.5 : 1.25);
renderer.setPixelRatio(pixelRatio);
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
sun.shadow.mapSize.set(QUALITY === 'high' ? 2048 : 1024, QUALITY === 'high' ? 2048 : 1024);
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
{ const el = document.getElementById('load-status'); if (el) el.textContent = assets.manifest ? 'Real assets loaded' : 'Procedural mode'; }
let hdriRT = null;
let photoDome = null;
if (assets.hdri) {
  photoDome = new THREE.Mesh(new THREE.SphereGeometry(460, 32, 16), new THREE.MeshBasicMaterial({
    map: assets.hdri, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false,
  }));
  photoDome.renderOrder = -2;
  photoDome.frustumCulled = false;
  scene.add(photoDome);
}
if (assets.hdri) { hdriRT = pmrem.fromEquirectangular(assets.hdri); }
const robot = createRobot();
scene.add(robot.root);
// state evolusi (diisi watchEvolution di bawah)
const evo = { level: 0, name: 'Dormant', pct: 0 };
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

// ---------- Progres tersimpan ----------
const save = loadSave();
let finaleDone = !!save.finaleDone;
// Baut: mata uang kecil dari peti harian dan quest, dibelanjain di minimarket
let bolts = save.bolts || 0;
const gear = { light: false, battery: false, hat: false, ...(save.gear || {}) };
let daily = null;
let chain = null;
let restoring = false;
function currentSave() {
  return {
    v: 1,
    signals: WORLD.signals.map((s, i) => (s.taken ? i : -1)).filter((i) => i >= 0),
    lights: cityLights,
    face: robot.state?.base || 'neutral',
    hour: gameClock.hour,
    pos: [+robot.root.position.x.toFixed(1), +robot.root.position.z.toFixed(1)],
    finaleDone,
    bolts,
    gear,
    daily: daily ? { key: daily.key, taken: daily.items.filter((i) => i.taken).map((i) => i.id) } : save.daily || null,
    quest: chain ? chain.data : save.quest || null,
    savedAt: Date.now(),
  };
}
function persist() {
  if (!restoring) writeSave(currentSave(), walletState.address);
}
let persistTimer = 0;

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
const minimap = createMinimap({ canvas: document.getElementById('minimap'), labelsEl: document.getElementById('labels'), objectiveEl: document.getElementById('objective') });

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
let liveHolders = null; // jumlah holder asli dari server/holders, null = belum ada
function refreshLampHud(n = cityLights) {
  [...lampsEl.children].forEach((d, i) => d.classList.toggle('on', i < n));
  $('lamps-text').textContent = liveHolders != null
    ? `${n}/5 · ${liveHolders.toLocaleString('en-US')} holders`
    : `${n}/5 lamps`;
}
// Holder count live (kalau CONFIG.token.holdersUrl diisi), di-poll tiap 5 menit
if (CONFIG.token.holdersUrl) pollHolders((count) => { if (typeof count === 'number') { liveHolders = count; setCityHolders(count); refreshLampHud(); } });
function refreshLamps() {
  refreshLampHud();
  setCityLights(cityLights);
}
refreshLamps();

// ---------- Evolusi: level robot dari total burn ----------
function renderEvolution(st) {
  evo.level = st.level; evo.name = st.name; evo.pct = st.pct;
  robot.setEvolution(st.level);
  cityLights = 3 + Math.min(2, Math.floor(st.level / 2));
  refreshLamps();
  setCityPower(Math.min(3, Math.ceil(st.level / 2)));
  const span = Math.max(1e-9, st.next - st.prev);
  const prog = Math.min(1, Math.max(0, (st.pct - st.prev) / span));
  $('evo-lv').textContent = `Lv ${st.level}`;
  $('evo-name').textContent = st.name;
  $('evo-fill').style.width = `${(st.level === 0 && st.pct === 0 ? 0 : prog * 100).toFixed(1)}%`;
  const fmt = (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)}%`;
  $('evo-text').textContent = st.source === 'prelaunch' ? 'Waiting for the first burn'
    : `${fmt(st.pct)} burned · next at ${fmt(st.next)}${st.source === 'preview' ? ' · preview' : ''}`;
  $('intro-evo').textContent = `Evolution · ${st.name}`;
  if (st.leveledUp && started) {
    const p = $('evo-panel'); p.classList.remove('up'); void p.offsetWidth; p.classList.add('up');
    audio.play('lamp'); express('surprised', 2); setTimeout(() => { express('happy', 4); robot.setState('wave'); }, 1200);
    showToast(`7POD evolved · ${st.name}`, 4500);
    say(`I feel... different. ${st.line}`, 4200);
  }
}
watchEvolution(renderEvolution);
// Tanpa quest: sinyal di dunia disembunyiin, lampu kota ikut level evolusi
for (const sg of WORLD.signals) { sg.taken = true; sg.mesh.visible = false; if (sg.light) sg.light.intensity = 0; }
if (Array.isArray(save.pos) && save.pos.length === 2 && Number.isFinite(save.pos[0])) robot.root.position.set(save.pos[0], 0, save.pos[1]);

function refreshMuteBtn() { $('mute-btn').textContent = audio.muted ? 'M · Sound off' : 'M · Sound on'; }
function toggleMute() {
  audio.unlock();
  const m = audio.toggleMute();
  refreshMuteBtn();
  showToast(m ? 'Sound off' : 'Sound on', 1400);
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
// Bubble omongan NPC, nempel di atas kepala NPC-nya (posisi live dari WORLD.npcs)
const npcBubble = $('npc-bubble');
let npcBubbleTimer = null, npcSpeaker = null;
function npcSay(npc, text, ms = 4800) {
  npcSpeaker = npc;
  npcBubble.innerHTML = `<b>${npc.name}</b>${text}`;
  npcBubble.hidden = false;
  clearTimeout(npcBubbleTimer);
  npcBubbleTimer = setTimeout(() => { npcBubble.hidden = true; npcSpeaker = null; }, ms);
}
function say(text, ms = 3200) {
  bubble.textContent = text;
  bubble.hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms);
}

// ---------- Jendela holder ----------
// Di mainnet butuh saldo token. Sebelum itu semua wallet dapet jendela demo.
let holderSpot = null;
function refreshHolderWindow(s) {
  const onMainnet = CONFIG.token.network === 'mainnet' && !!CONFIG.token.address;
  const holds = s.status === 'connected' && !!s.address && (!onMainnet || s.balance > 0);
  const next = holds ? windowFor(s.address, BUILDINGS) : null;
  const fresh = next && !holderSpot;
  holderSpot = next;
  world.setHolderWindow(next);
  if (fresh) setTimeout(() => showToast(onMainnet ? 'Your window is lit · follow the arrow' : 'Demo · your window is lit, follow the arrow', 4200), 2800);
}

// ---------- Wallet + skin holder ----------
let walletState = { isHolder: false };
const wallet = createWallet({
  onChange(s) {
    walletState = s;
    refreshHolderWindow(s);
    const btn = $('wallet-btn');
    if (s.status === 'connected') {
      // Progres per wallet: kalau wallet ini pernah lebih jauh di browser ini, lanjut dari situ
      const mine = s.address ? loadSave(s.address) : {};
      if (!restoring && saveScore(mine) > saveScore(currentSave())) {
        restoring = true;
        writeSave(mine);
        showToast('Wallet progress found · loading it', 2000);
        setTimeout(() => location.reload(), 1600);
      }
      btn.textContent = `${s.short} · ${s.tier?.label || 'Signal'}`;
      btn.classList.add('connected');
      $('skin-hint').textContent = CONFIG.token.address
        ? `Balance ${s.balance == null ? '?' : s.balance.toLocaleString('en-US')} ${CONFIG.ticker} · tier ${s.tier?.label}`
        : 'Wallet connected. Tier skins unlock once the token launches.';
    } else if (s.status === 'connecting') {
      btn.textContent = 'Connecting...';
    } else {
      btn.textContent = 'Connect wallet';
      btn.classList.remove('connected');
      $('skin-hint').textContent = 'Connect a wallet to unlock more skins.';
      if (s.status === 'error') {
        showToast(s.error === 'no-wallet' ? 'No wallet found in this browser. Install Phantom or MetaMask first.'
          : s.error === 'rejected' ? 'Alright, maybe later.' : `Wallet error: ${s.error}`);
      }
    }
    renderSkins();
  },
});
$('wallet-btn').addEventListener('click', async () => {
  if (walletState.status === 'connected') {
    await wallet.disconnect();
    showToast('Wallet disconnected');
    return;
  }
  const ok = await wallet.connect();
  if (ok) {
    showToast(`New signal from ${walletState.providerName}. Welcome.`);
    say("You're really here. The lights in this place stay on because of people like you.", 3600);
  }
});
wallet.eager();

let currentSkin = SKINS[0];
function pickSkin(skin, { silent = false } = {}) {
  if (!isUnlocked(skin, walletState, CONFIG.tiers)) { showToast('This skin is locked. Connect a wallet or reach a higher tier.'); return; }
  currentSkin = skin;
  applySkin(robot, skin);
  document.documentElement.style.setProperty('--violet', skin.primary);
  try { localStorage.setItem('vuzz-skin', skin.id); } catch {}
  renderSkins();
  if (!silent) showToast(`Skin ${skin.name}`, 1400);
}
function renderSkins() {
  const grid = $('skin-grid');
  grid.innerHTML = '';
  for (const s of SKINS) {
    const unlocked = isUnlocked(s, walletState, CONFIG.tiers);
    const el = document.createElement('button');
    el.className = 'skin' + (s.id === currentSkin.id ? ' active' : '') + (unlocked ? '' : ' locked');
    el.title = unlocked ? s.name : `${s.name} · needs ${s.unlock === 'wallet' ? 'a wallet' : 'tier ' + (CONFIG.tiers.find((t) => t.id === s.unlock)?.label || s.unlock)}`;
    el.innerHTML = `<span class="sw" style="background:linear-gradient(135deg,${s.primary} 55%,${s.secondary} 55%);--acc:${s.accent};--emi:${s.emissive}"></span><span>${s.name}</span>`;
    el.addEventListener('click', () => pickSkin(s));
    grid.appendChild(el);
  }
}
$('skin-btn').addEventListener('click', () => { const p = $('skins-panel'); p.hidden = !p.hidden; });

// Tombol wajah: sekali pencet ganti ke ekspresi berikutnya, bertahan sampai diganti lagi
const FACE_OPTIONS = [['neutral', 'Normal'], ['happy', 'Happy'], ['sad', 'Sad'], ['angry', 'Angry'], ['surprised', 'Surprised'], ['disgust', 'Disgust']];
function pickFace(name) {
  robot.setFace(name);
  $('face-btn').textContent = `G · ${FACE_OPTIONS.find(([id]) => id === name)[1]}`;
  const lines = faceLines[name];
  if (lines) say(lines[Math.floor(Math.random() * lines.length)], 2200);
}
if (save.face && FACE_OPTIONS.some(([id]) => id === save.face)) { robot.setFace(save.face); $('face-btn').textContent = `G · ${FACE_OPTIONS.find(([id]) => id === save.face)[1]}`; }
function nextFace() {
  const i = FACE_OPTIONS.findIndex(([id]) => id === (robot.state.base || 'neutral'));
  pickFace(FACE_OPTIONS[(i + 1) % FACE_OPTIONS.length][0]);
}
$('face-btn').addEventListener('click', nextFace);
renderSkins();
{
  let saved = null;
  try { saved = localStorage.getItem('vuzz-skin'); } catch {}
  const s = SKINS.find((k) => k.id === saved);
  if (s && isUnlocked(s, walletState, CONFIG.tiers)) pickSkin(s, { silent: true });
}

// ---------- Market → cuaca ----------
let marketState = null;
const market = createMarket({
  onChange(s) {
    const first = !marketState;
    const prevMood = marketState?.mood;
    marketState = s;
    const chg = s.change24 == null ? '' : `${s.change24 >= 0 ? '+' : ''}${s.change24.toFixed(1)}% 24h`;
    const price = s.price == null ? (s.source === 'demo' ? 'Demo · token not launched yet' : '') : `$${s.price < 1 ? s.price.toPrecision(3) : s.price.toFixed(2)}`;
    const livePrice = CONFIG.token.network === 'mainnet' && s.price != null;
    world.setBillboard(livePrice ? { tag: 'LIVE', price, note: chg || 'Market price' } : { tag: 'DEMO', price: 'No live price', note: 'Testnet · token not launched yet' });
    $('market-text').innerHTML = `<span>${MOOD_LABEL[s.mood]}</span><span class="chg ${s.change24 >= 0 ? 'up' : 'down'}">${[price, chg].filter(Boolean).join(' · ')}</span>`;
    world.setWeather?.({ kind: s.mood, intensity: s.intensity });
    if (!first && prevMood !== s.mood && started) {
      const lines = {
        storm: "Storm. My sensors say the market is dumping. I'll wait under a roof.",
        rain: "Rain. Market's red. The burns still count, though.",
        cloudy: 'Overcast. Flat market. Just another day in this city.',
        clear: "Clear sky. Market's green. Good day for a walk.",
        golden: 'Look at that sky. Busy market, bigger burns.',
      };
      say(lines[s.mood], 4200);
      if (s.mood === 'storm' || s.mood === 'rain') express('sad', 4); else if (s.mood === 'golden') express('happy', 4);
    }
  },
});
market.start();

// ---------- Misi harian (kebuka setelah ending) ----------
function refreshQuestText() {
  if (chain?.text) {
    $('quest-text').innerHTML = chain.text;
  } else if (daily) {
    $('quest-text').innerHTML = daily.done
      ? `Daily done · come back tomorrow`
      : `Daily · find 3 supply crates · <b id="quest-count">${daily.found}</b>/3`;
  } else {
    $('quest-text').innerHTML = `Find the 5 lost signals · <b id="quest-count">${signalsFound}</b>/5`;
  }
}
function setupDaily() {}
// ---------- Lounge holder di atap ----------
// Sebelum mainnet cukup connect wallet (demo). Di mainnet butuh tier Spark ke atas.
function clubOpen() {
  if (walletState.status !== 'connected') return false;
  if (CONFIG.token.network !== 'mainnet' || !CONFIG.token.address) return true;
  return CONFIG.tiers.findIndex((t) => t.id === walletState.tier?.id) >= 1;
}
function clubNotice(open) {
  if (performance.now() < (behavior.clubToast || 0)) return;
  behavior.clubToast = performance.now() + 6000;
  const demo = CONFIG.token.network !== 'mainnet';
  if (open) showToast(demo ? 'Holders lounge · demo access until mainnet' : 'Holders lounge · welcome in', 3600);
  else showToast(walletState.status === 'connected' ? 'Holders lounge · needs Spark tier or higher' : `Holders lounge · connect a wallet${demo ? ' (demo until mainnet)' : ''}`, 3600);
}

// ---------- Baut & minimarket ----------
const SHOP_ITEMS = [
  { id: 'light', name: 'Headlamp', cost: 0, desc: 'Lights your way at night.' },
  { id: 'battery', name: 'Battery pack', cost: 0, desc: '+15% run speed, forever.' },
  { id: 'hat', name: 'Party hat', cost: 0, desc: 'Looks great. Does nothing.' },
];
function refreshBolts() {
  const el = $('bolts-text');
  if (el) el.textContent = `${bolts} bolt${bolts === 1 ? '' : 's'} · spend them at the shop`;
  renderShop();
}
function earnBolts(n, why) {
  bolts += n;
  showToast(`+${n} bolt${n === 1 ? '' : 's'} · ${why}`, 2600);
  refreshBolts();
}
function applyGear() {
  robot.setHat?.(!!gear.hat);
}
function renderShop() {
  const list = $('shop-list');
  if (!list) return;
  list.innerHTML = '';
  for (const it of SHOP_ITEMS) {
    const row = document.createElement('div');
    row.className = 'shop-item' + (gear[it.id] ? ' owned' : '');
    const can = !gear[it.id] && bolts >= it.cost;
    row.innerHTML = `<div><b>${it.name}</b><div class="muted">${it.desc}</div></div><button class="btn action" ${can ? '' : 'disabled'}>${gear[it.id] ? 'Owned' : 'Take it'}</button>`;
    row.querySelector('button').addEventListener('click', () => buyItem(it));
    list.appendChild(row);
  }
  $('shop-bolts').textContent = 'Everything here is free.';
}
function buyItem(it) {
  if (gear[it.id] || bolts < it.cost) return;
  bolts -= it.cost;
  gear[it.id] = true;
  applyGear();
  audio.play('chime');
  express('happy', 3);
  showToast(`Bought ${it.name}`, 2600);
  say(it.id === 'hat' ? 'Do I look taller? I feel taller.' : it.id === 'light' ? 'Night shift just got easier.' : 'Faster. I can feel it in my knees.', 2800);
  refreshBolts();
  persist();
}
function openShop(open = true) {
  $('shop-panel').hidden = !open;
  if (open) renderShop();
}
$('shop-close')?.addEventListener('click', () => openShop(false));
applyGear();
refreshBolts();

// ---------- Quest berantai (kebuka setelah ending) ----------
function onChain(event, value) {
  audio.play(event === 'generator' ? 'lamp' : 'chime');
  express('happy', 3);
  if (event === 'start') { showToast('New job · restart the 3 city generators', 4500); say('The lamps are back, but the grid is failing. Three generators, three levers.', 4200); }
  if (event === 'generator') {
    earnBolts(2, 'generator restarted');
    showToast(value === 3 ? 'Grid stable · 3/3 generators' : `Generator back online · ${value}/3`, 3200);
    say(value === 3 ? "Grid's stable. There's a parcel outside the cafe with a courier's name on it." : ['Hear that hum? Good hum.', 'Two down. The windows look brighter already.'][value - 1], 3600);
  }
  if (event === 'parcel') { showToast(`Parcel picked up · bring it to ${value.name}`, 3600); say(`For ${value.name}. Heavier than it looks.`, 2800); }
  if (event === 'delivered') {
    world.npcTalk?.(value.id, 5);
    earnBolts(3, 'delivery');
    npcSay(value, "That's your old parts list. Three pieces of you were scattered in The Blackout.", 5600);
    setTimeout(() => say('Pieces of me? Then I know what we are doing next.', 3400), 3200);
  }
  if (event === 'part') { earnBolts(3, 'lost part'); showToast(value === 3 ? 'All parts found' : `Lost part found · ${value}/3`, 3200); if (value < 3) say(['That one is definitely mine.', 'I knew I felt lighter.'][value - 1], 2800); }
  if (event === 'done') { robot.setState('wave'); say('All of me, all of the lights. This city has a robot again.', 5000); }
  refreshQuestText();
  persist();
}
// Quest dimatiin: chain cuma stub biar loop utama tetap jalan
chain = { text: '', data: null, targets: [], label: '', start() {}, hint() { return null; }, note() { return null; }, use() { return false; }, update() {} };
void onChain;
world.setParcel?.(false);

// ---------- Ending: semua sinyal ketemu ----------
let finale = null; // { t, dur }
function startFinale() {
  cityLights = 5;
  finaleDone = true;
  behavior.lock = 11;
  robot.setState('idle');
  express('surprised', 3);
  let dur = 0;
  try { dur = world.playFinale?.({ onLamp: (i) => { audio.play('lamp'); refreshLampHud(i + 1); }, onDone: () => {} }) || 0; } catch (e) { console.warn('[finale]', e); }
  if (!dur) { refreshLamps(); for (let i = 0; i < 5; i++) setTimeout(() => audio.play('lamp'), 600 + i * 800); dur = 9; }
  else refreshLampHud(0);
  finale = { t: 0, dur: Math.max(8, dur) };
  say('All five. Hold on. Look at the city.', 4000);
  setTimeout(() => say('I remember this. All of it. Thank you.', 4500), 4500);
  setTimeout(() => {
    finale = null;
    behavior.lock = 0;
    refreshLamps();
    express('happy', 5);
    robot.setState('wave');
    showToast('The city is awake · daily supply runs unlocked', 4500);
    setupDaily();
    setTimeout(() => chain.start(), 5000);
    persist();
  }, finale.dur * 1000);
}

// Label testnet selama token belum mainnet, biar nggak ada yang ngira ini udah bisa dibeli
if (CONFIG.token.network !== 'mainnet') $('net-chip').hidden = false;

// Tips di layar awal, ganti tiap 4 detik sampai mulai
const INTRO_TIPS = [
  'Every burn makes 7POD evolve. Watch the panel top left.',
  'Hold Shift to run. Space jumps high enough to clear a car.',
  'Press B for a backflip. Press G to change 7POD\'s face.',
  'The river is shallow. Wade across, or use a bridge or the stepping stones.',
  'Talk to the city robots (E). They know what the market is doing.',
  'Press T to skip three hours. Nights pass faster than days.',
  'Press Q for a photo with the $7POD mark. Share it on X.',
  'Leave 7POD alone for a while. It gets bored, then sleepy.',
  'At Superintelligence, 7POD wears a golden halo.',
];
{
  let ti = Math.floor(Math.random() * INTRO_TIPS.length);
  const el = $('intro-tip');
  const timer = setInterval(() => {
    if (started) { clearInterval(timer); return; }
    ti = (ti + 1) % INTRO_TIPS.length;
    el.style.opacity = 0;
    setTimeout(() => { el.textContent = 'Tip: ' + INTRO_TIPS[ti]; el.style.opacity = 0.85; }, 400);
  }, 4000);
}

// Intro
$('start-btn').addEventListener('click', () => {
  $('intro').classList.add('hidden');
  started = true;
  audio.unlock();
  audio.play('boot');
  robot.setState('yawn');
  behavior.lock = 1.8;
  setTimeout(() => say(evo.level ? `...oh. Hi. I'm at ${evo.name} now. Look at me.` : "...oh. Hi. Still dormant. Waiting for the first burn."), 1900);
});
let started = false;

// ---------- Perilaku "manusia" ----------
const behavior = {
  idleTime: 0,        // berapa lama nggak ada input
  lock: 0,            // lama state dikunci (animasi sekali jalan)
  speed: 0,           // kecepatan jalan sekarang (ramp)
  camDist: null,      // jarak kamera halus
  grounded: true,     // lagi napak atau lagi di udara (loncat)
  vy: 0,              // kecepatan vertikal
  wading: false,      // lagi nyebrang air dangkal
  wasWading: false,
  wadeStep: 0,
  wadeTime: 0,
  flipping: false,
  bump: 0,
  sitting: null,      // bangku yang diduduki
  nearBench: null,
  nearDrink: false,
  nearPier: false,
  lastChat: 0,
  rockFlight: null,
};

const idleLines = [
  'This city used to be so loud.',
  "I'm still waiting for the other six units.",
  "This coffee does nothing for my systems. It's just nice.",
  'One more burn and I might learn something new...',
  'The sunset from that hill. You have to see it.',
];
const sitLines = ['This bench is my favorite spot.', "Sitting for a bit. My systems need it... no they don't. I just want to.", 'You can see the lake and the pier from here.'];

// batu lemparan
const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 0), new THREE.MeshStandardMaterial({ color: 0x777 }));
rock.visible = false;
scene.add(rock);
const splashes = [];
// Ekspresi wajah: robot.setExpression(name, detik). Kalau robot belum punya, ya diem aja.
function express(name, seconds = 2.5) { robot.setExpression?.(name, seconds); }
const faceLines = {
  happy: ['Best day. No contest.', 'Look at me go.'],
  sad: ['Slow hour. Small burn.', 'The city used to be brighter.'],
  angry: ['Who turned the lights off. WHO.', 'My patience module is at 3%.'],
  surprised: ['Wait. What was that.', 'Did the ground just move?'],
  disgust: ['Ugh. Wet socks. I have no socks.', 'That smell is not in my database.'],
};

// ---------- Ngobrol sama drone kurir ----------
// Kalimat mereka ngikutin keadaan: pasar/cuaca, jam dunia, lampu kota, misi harian.
function npcLine(npc) {
  const h = gameClock.hour, mood = marketState?.mood || 'cloudy';
  const pool = [];
  if (mood === 'storm') pool.push("Storm's bad for deliveries. Market's worse. Hold on tight.", 'Everyone is selling. I just deliver. Rain in my gears.');
  if (mood === 'rain') pool.push("Red candles, wet streets. Same thing, really.", "Market's down. The lamps still burn, though. That's what matters.");
  if (mood === 'cloudy') pool.push('Flat market, flat sky. Quiet route today.', "Nothing's moving. Not the charts, not the clouds.");
  if (mood === 'clear') pool.push("Green day. Even my battery feels fuller.", "Market's up. Someone bought a lamp for the north street.");
  if (mood === 'golden') pool.push("Look at that sky! Charts look the same. Everything's up!", "Golden hour and a golden chart. I'm flying extra routes today.");
  if (h < 6 || h >= 20) pool.push('Night shift again. The city hums when the lamps are on.', 'Careful by the river at night. Fish jump. Scares me every time.');
  else if (h < 11) pool.push("Morning. Coffee machine at the cafe still works. Nobody to drink it.", 'Early route. The park is full of butterflies right now.');
  else if (h < 17) pool.push("Midday. Hill lookout has the best view if you're not busy.", "Deliveries to the east end today. Watch the cars, they don't move but you might.");
  else pool.push('Sunset. Best time for a photo. Press Q, I will not look.', 'Evening. The lamps come on one by one. Count them with me.');
  pool.push(evo.level >= 5 ? 'That halo on 7POD. Every burn made it brighter.' : `7POD is at ${evo.name}. Every hour another burn. You can feel it changing.`);
  if (evo.level >= 3) pool.push('Did you see the lights on its head? That is a brain now.');
  pool.push(`I'm ${npc.name}. I keep the city moving when nobody else does.`);
  if (npc.lines?.length) return npc.lines[Math.floor(Math.random() * npc.lines.length)];
  return pool[Math.floor(Math.random() * pool.length)];
}
function talkTo(npc) {
  world.npcTalk?.(npc.id, 4.5);
  robot.root.rotation.y = Math.atan2(npc.x - robot.root.position.x, npc.z - robot.root.position.z);
  npcSay(npc, npcLine(npc), 4800);
  express('happy', 2);
  behavior.idleTime = 0;
  behavior.lock = 0.6;
}

// geometri + material dipakai bareng, biar cipratan tiap 0,4 detik nggak bikin alokasi baru
const splashGeo = new THREE.RingGeometry(0.2, 0.3, 24);
const splashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
function splash(x, z) {
  if (splashes.length > 12) return;
  const ring = new THREE.Mesh(splashGeo, splashMat.clone());
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, -0.2, z);
  scene.add(ring);
  splashes.push({ ring, t: 0 });
  audio.play('plunk');
}

// ---------- Siklus hari sendiri ----------
// Dunia punya jamnya sendiri: mulai pagi, satu hari penuh = 12 menit nyata (siang agak lebih
// lama, malam lebih cepat). ?hour=12 ngunci jam (buat tes), ?realtime=1 ngikut jam komputer.
// Tombol T lompat 3 jam. Pas VUZZ tidur, waktunya jalan 6x lebih cepat.
const urlParams = new URLSearchParams(location.search);
const hourParam = urlParams.get('hour');
const realtime = urlParams.get('realtime') === '1';
const DAY_SECONDS = 12 * 60;
const gameClock = { hour: Number.isFinite(save.hour) ? save.hour : 7.5 };
function advanceClock(dt, speed = 1) {
  if (hourParam !== null || realtime) return;
  const h = gameClock.hour;
  // 06-19 jalan normal, 19-06 jalan 1,8x biar malam nggak kelamaan
  const night = h < 6 || h >= 19 ? 1.8 : 1;
  gameClock.hour = (h + dt * (24 / DAY_SECONDS) * night * speed) % 24;
}
function timeOfDay() {
  if (hourParam !== null) return +hourParam;
  if (realtime) { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
  return gameClock.hour;
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
  // Foto langit nongol pelan-pelan pas pagi dan ilang pelan-pelan pas sore
  if (photoDome) {
    photoDome.material.opacity = THREE.MathUtils.smoothstep(daylight, 0.2, 0.5);
    photoDome.visible = photoDome.material.opacity > 0.01;
  }
  gradePass.uniforms.uWarm.value = 0.3 + dusk * 0.7;
  bloom.strength = 0.2 + night * 0.4;
  world.setSun(sunDir, sunColor);
  applyNight(night);
  // refresh env map tiap ~6 menit waktu asli (0.1 jam)
  if (Math.abs(h - lastEnvHour) > 0.75) { lastEnvHour = h; refreshEnvironment(); }
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
const JUMP_SPEED = 7.3; // cukup buat lompatin mobil (puncak 1,45)
const GRAVITY = 16;
const ROOF_JUMP = 11.5; // dari atap: cukup buat nyebrang jalan kalau sambil lari
const WALL_KICK = 9;    // Space waktu nempel tembok, tahan buat manjat
const BOUNDS = { min: -126, max: 126 }; // tepi tanah yang bisa diinjak, kota sampai ~126

// Semua air dangkal: sungai dan danau bisa dijalanin, makin ke tengah makin dalam.
function wadeDepth(x, z) {
  const l = WORLD.lake;
  const dl = Math.hypot(x - l.x, z - l.z);
  if (dl < l.r) return 0.3 + Math.max(0, Math.min(1, (l.r - 0.5 - dl) / 4)) * 0.4;
  const dr = distToRiver(x, z);
  return 0.2 + Math.max(0, 1 - dr / 3.2) * 0.3; // paling dalam 0.5 di tengah sungai
}
function wadeable(x, z) {
  const l = WORLD.lake;
  const dl = Math.hypot(x - l.x, z - l.z);
  if (dl < l.r - 0.5) return true;
  return distToRiver(x, z) < 3.2;
}
// batu pijakan: puncaknya y≈0.1, radius ~0.6
function onStone(x, z) {
  for (const [sx, sz] of WORLD.steppingStones || []) if (Math.hypot(x - sx, z - sz) < 0.6) return true;
  return false;
}

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
  controls.poll(rawDt);
  const inp = controls.input;
  const pos = robot.root.position;

  if (started) {
    // --- deteksi sekitar ---
    behavior.nearBench = nearest(WORLD.benches, pos.x, pos.z, 2.6);
    behavior.nearThing = nearest(WORLD.interactables, pos.x, pos.z, 3.4);
    behavior.nearNpc = nearest(WORLD.npcs || [], pos.x, pos.z, 2.8);
    const f = WORLD.fountain;
    const cc = WORLD.cafe.counter || { x: WORLD.cafe.x, z: WORLD.cafe.z - 0.4 };
    behavior.nearCafe = Math.hypot(pos.x - cc.x, pos.z - cc.z) < 3.6;
    behavior.nearDrink = behavior.nearCafe || Math.hypot(pos.x - f.x, pos.z - f.z) < f.r + 2.2 || Math.hypot(pos.x - WORLD.cafe.x, pos.z - (WORLD.cafe.z + 3.5)) < 3.5;
    if (!$('shop-panel').hidden && (!behavior.nearThing || behavior.nearThing.id !== 'shopCounter')) openShop(false);
    behavior.nearPier = Math.hypot(pos.x - (WORLD.pier.x - WORLD.pier.len / 2 + 1), pos.z - WORLD.pier.z) < 3
      || Math.hypot(pos.x - WORLD.lake.x, pos.z - WORLD.lake.z) < WORLD.lake.r + 2.5;
    const chainHint = chain.hint?.(pos); // ada yang bisa dipakai pakai E
    const chainNote = chain.note?.(pos) ?? chainHint; // cuma petunjuk
    $('act-sit').hidden = !chainHint && !behavior.nearBench && !behavior.sitting && !behavior.nearThing && !behavior.nearNpc;
    $('act-sit').textContent = behavior.sitting ? 'E · Stand up' : chainHint ? 'E · Use' : behavior.nearBench ? 'E · Sit' : 'E · Inspect';
    $('act-drink').hidden = !behavior.nearDrink || !!behavior.sitting;
    $('act-drink').textContent = behavior.nearCafe ? 'F · Coffee' : 'F · Drink';
    $('act-throw').hidden = !behavior.nearPier || !!behavior.sitting;

    // --- aksi ---
    if (controls.consume('e')) {
      if (behavior.sitting) {
        behavior.sitting = null;
        robot.setState('idle');
      } else if (chain.use(pos)) {
        behavior.idleTime = 0;
      } else if (behavior.nearBench) {
        const b = behavior.nearBench;
        behavior.sitting = b;
        pos.set(b.x + Math.sin(b.rotY) * 0.05, b.y, b.z + Math.cos(b.rotY) * 0.05);
        robot.root.rotation.y = b.rotY;
        robot.setState('sit');
        behavior.idleTime = 0;
        say(sitLines[Math.floor(Math.random() * sitLines.length)]);
      } else if (behavior.nearNpc) {
        talkTo(behavior.nearNpc);
      } else if (behavior.nearThing?.id === 'shopCounter') {
        openShop($('shop-panel').hidden);
        behavior.idleTime = 0;
      } else if (behavior.nearThing) {
        showToast(behavior.nearThing.name, 1800);
        say(behavior.nearThing.line, 4200);
        behavior.idleTime = 0;
      }
    }
    if (controls.consume('f') && behavior.nearDrink && !behavior.sitting) {
      robot.setState('drink');
      behavior.lock = 2.4;
      if (behavior.nearCafe) {
        behavior.boost = 60;
        setTimeout(() => { say('Coffee. Legs feel electric.', 2200); showToast('Coffee · +25% speed for 60 s', 3000); express('happy', 4); }, 1500);
      } else setTimeout(() => say("Ahh. Can't taste a thing. Still good."), 1500);
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
    if (controls.consume('g')) nextFace();

    // kejepit di dalam gedung atau mobil (misal dari save lama): keluarin ke titik bebas terdekat
    if (behavior.grounded && blockedByBuilding(pos.x, pos.z, pos.y)) {
      [pos.x, pos.z] = nearestFree(pos.x, pos.z);
      pos.y = groundHeight(pos.x, pos.z);
    }

    // --- gerak ---
    behavior.wall = false;
    behavior.lock = Math.max(0, behavior.lock - rawDt);
    const moving = Math.hypot(inp.moveRaw.x, inp.moveRaw.y) > 0.05 || Math.hypot(inp.move.x, inp.move.y) > 0.08;
    // kecepatan naik-turun halus (ramp), bukan langsung penuh
    behavior.wading = isWater(pos.x, pos.z) && wadeable(pos.x, pos.z) && !onBridge(pos.x, pos.z) && !onStone(pos.x, pos.z);
    behavior.boost = Math.max(0, (behavior.boost || 0) - rawDt);
    const speedMul = (behavior.boost > 0 ? 1.25 : 1) * (gear.battery && inp.run ? 1.15 : 1);
    const targetSpeed = moving && behavior.lock <= 0 ? (inp.run ? SPEED_RUN : SPEED_WALK) * speedMul * (behavior.wading ? 0.55 : 1) : 0;
    behavior.speed += (targetSpeed - behavior.speed) * Math.min(1, dt * (targetSpeed > behavior.speed ? 6 : 10));
    if (moving && behavior.lock <= 0) {
      if (behavior.sitting) { behavior.sitting = null; }
      const speed = behavior.speed;
      // arah relatif kamera: kamera ada di pos + (sin yaw, cos yaw), jadi "maju" (W) = (-sin yaw, -cos yaw)
      const yaw = inp.camYaw;
      const mv = inp.move;
      const dx = mv.x * Math.cos(yaw) + mv.y * Math.sin(yaw);
      const dz = -mv.x * Math.sin(yaw) + mv.y * Math.cos(yaw);
      const nx = pos.x + dx * speed * dt;
      const nz = pos.z + dz * speed * dt;
      // seluruh map bisa dijelajahi: batasnya tepi tanah, termasuk kota di tenggara.
      // Sungai dan pinggir danau dangkal, bisa diseberangi jalan kaki; tengah danau tetap dalam.
      const clubGate = onClubRoof(nx, nz, pos.y);
      if (clubGate) clubNotice(clubOpen());
      const free = (x, z) => (!isWater(x, z) || wadeable(x, z)) && !blockedByBuilding(x, z, pos.y) && !(onClubRoof(x, z, pos.y) && !clubOpen()) && !blockedByRail(x, z) && x > BOUNDS.min && x < BOUNDS.max && z > BOUNDS.min && z < BOUNDS.max;
      if (free(nx, nz)) {
        pos.x = nx; pos.z = nz;
      } else if (free(nx, pos.z)) {
        pos.x = nx; // meluncur sepanjang tembok / tepi
      } else if (free(pos.x, nz)) {
        pos.z = nz;
      } else {
        behavior.bump = (behavior.bump || 0) + dt;
        if (behavior.bump > 1.6) { behavior.bump = 0; express('angry', 2); say(['Who put a wall here.', 'Move. Please. I asked nicely.', 'Fine. Other way.'][Math.floor(Math.random() * 3)], 1600); }
      }
      behavior.wall = !behavior.grounded && touchingWall(nx, nz, pos.y);
      const targetRot = Math.atan2(dx, dz);
      let diff = targetRot - robot.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      robot.root.rotation.y += diff * Math.min(1, dt * 10);
      if (behavior.grounded) robot.setState(inp.run ? 'run' : 'walk');
      behavior.idleTime = 0;
    } else if (behavior.lock <= 0 && !behavior.sitting && behavior.grounded) {
      if (['walk', 'run', 'drink', 'throw', 'curious', 'yawn', 'wave'].includes(robot.state.name)) robot.setState('idle');
    }

    // --- ekspresi manual: 1-5 (seneng, sedih, marah, terkejut, jijik) ---
    for (const [k, name] of [['1', 'happy'], ['2', 'sad'], ['3', 'angry'], ['4', 'surprised'], ['5', 'disgust']]) {
      if (controls.consume(k)) { pickFace(robot.state.base === name ? 'neutral' : name); }
    }

    // --- backflip (B) ---
    if (controls.consume('b') && behavior.grounded && !behavior.sitting && behavior.lock <= 0) {
      behavior.grounded = false;
      behavior.vy = JUMP_SPEED * 1.25;
      behavior.flipping = true;
      audio.play('whoosh');
      robot.setState(STATES.includes('backflip') ? 'backflip' : 'jump');
      express('happy', 2);
    }

    // --- loncat (Space), ala Roblox ---
    const wantJump = controls.consume(' ') || inp.jumpHeld;
    if (wantJump && behavior.grounded && !behavior.sitting && behavior.lock <= 0) {
      if (behavior.sitting) behavior.sitting = null;
      behavior.grounded = false;
      behavior.vy = behavior.onRoof ? ROOF_JUMP : JUMP_SPEED;
      audio.play('jump');
      if (STATES.includes('jump')) robot.setState('jump');
    } else if (wantJump && behavior.wall && behavior.vy < 2 && behavior.lock <= 0) {
      behavior.vy = WALL_KICK;
      audio.play('jump');
      if (STATES.includes('jump')) robot.setState('jump');
    }

    // tinggi tanah (bukit, jembatan, dermaga, air dangkal)
    let gy = groundHeight(pos.x, pos.z);
    const deck = onBridge(pos.x, pos.z);
    if (deck) gy = deckHeight(deck, pos.x, pos.z);
    else if (onStone(pos.x, pos.z)) gy = 0.1;
    if (onPier(pos.x, pos.z)) gy = 0.34;
    const roofY = rooftopHeight(pos.x, pos.z, pos.y); // tangga besi + atap gedung di kota
    gy = Math.max(gy, roofY);
    behavior.onRoof = roofY > 1 && pos.y - roofY < 0.3;
    // atap mobil / pembatas: napak di atasnya kalau kakinya udah setinggi itu
    const oTop = obstacleTop(pos.x, pos.z);
    if (oTop > 0 && pos.y > oTop - 0.35) {
      gy = Math.max(gy, oTop);
      // bibir pijakan di luar bodi mobil: tergelincir turun, jangan berdiri ngambang
      const slip = behavior.grounded && !behavior.sitting ? obstacleSlip(pos.x, pos.z) : null;
      if (slip && !blockedByBuilding(pos.x + slip[0] * 0.5, pos.z + slip[1] * 0.5, 0)) {
        pos.x += slip[0] * 3 * dt;
        pos.z += slip[1] * 3 * dt;
      }
    }
    // jalan keluar dari atap: jatuh beneran, bukan meluncur turun
    if (behavior.grounded && pos.y > gy + 0.6) { behavior.grounded = false; behavior.vy = 0; }
    if (behavior.wading) {
      gy = Math.min(gy, -0.2 - wadeDepth(pos.x, pos.z)); // kaki nyemplung di bawah permukaan air (y -0.2)
      if (!behavior.wasWading) { audio.play('plunk'); splash(pos.x, pos.z); express('surprised', 1.5); behavior.wadeTime = 0; if (Math.random() < 0.5) say('Cold. Fine. I can do this.', 1600); }
      behavior.wadeTime += rawDt;
      if (behavior.wadeTime > 7 && behavior.wadeTime < 7.1) { express('disgust', 2.5); say('Something slimy just touched my foot.', 2000); }
      behavior.wadeStep += rawDt * (moving ? 1 : 0);
      if (behavior.wadeStep > 0.4) { behavior.wadeStep = 0; splash(pos.x, pos.z); }
    }
    behavior.wasWading = behavior.wading;
    if (!behavior.sitting) {
      if (!behavior.grounded) {
        behavior.vy -= GRAVITY * dt;
        pos.y += behavior.vy * dt;
        if (pos.y <= gy && behavior.vy <= 0) {
          pos.y = gy; behavior.grounded = true; behavior.vy = 0;
          audio.play('land');
          robot.land();
          if (behavior.flipping) {
            behavior.flipping = false;
            if (behavior.wading) { express('surprised', 2); say('Cold landing.', 1400); }
            else if (Math.random() < 0.4) say(['Nailed it.', 'Did you see that?', 'Stuck the landing.'][Math.floor(Math.random() * 3)], 1600);
          }
          if (robot.state.name === 'jump' || robot.state.name === 'backflip') robot.setState(moving ? (inp.run ? 'run' : 'walk') : 'idle');
        }
      } else {
        pos.y += (gy - pos.y) * Math.min(1, dt * 14);
      }
    }

    // --- idle: nguap lalu tidur ---
    if (inp.anyInput) behavior.idleTime = 0; else behavior.idleTime += rawDt;
    if (!behavior.sitting && behavior.lock <= 0) {
      if (behavior.idleTime > 14 && behavior.idleTime < 14.1) { robot.setState('yawn'); behavior.lock = 1.8; }
      if (behavior.idleTime > 30 && robot.state.name !== 'sleep') { robot.setState('sleep'); say('...zzz', 2000); }
      // penasaran sama sungai/danau
      if (behavior.idleTime > 4 && behavior.idleTime < 4.1 && behavior.nearPier) { robot.setState('curious'); behavior.lock = 3; }
    }
    if (behavior.sitting && behavior.idleTime > 40 && robot.state.name !== 'sleep') { robot.setState('sleep'); }
    if (robot.state.name === 'sleep' && inp.anyInput) { robot.setState(behavior.sitting ? 'sit' : 'idle'); say("Huh! I wasn't sleeping.", 1800); }

    // ngomong sendiri sesekali
    behavior.lastChat += rawDt;
    if (behavior.lastChat > 25 && robot.state.name !== 'sleep') {
      behavior.lastChat = 0;
      say(idleLines[Math.floor(Math.random() * idleLines.length)]);
    }

    chain.update(pos);
    if (holderSpot && !holderSpot.seen && Math.hypot(pos.x - holderSpot.x, pos.z - holderSpot.z) < 9) {
      holderSpot.seen = true;
      express('happy', 3);
      say('That one is yours. It stays on as long as you do.', 4200);
    }
    // senter nyala sendiri pas gelap
    const dark = gameClock.hour < 6.3 || gameClock.hour >= 18.3;
    if (behavior.lampOn !== (gear.light && dark)) { behavior.lampOn = gear.light && dark; robot.setLight?.(behavior.lampOn); }
    persistTimer += rawDt;
    if (persistTimer > 5) { persistTimer = 0; persist(); }

    // hint kontekstual
    if (behavior.sitting) setHint('Press E or move to stand up. Leave it alone and it will doze off.');
    else if (chainNote) setHint(chainNote);
    else if (behavior.nearBench) setHint('A bench. Press E to sit.');
    else if (behavior.nearNpc) setHint(`${behavior.nearNpc.name}. Press E to talk.`);
    else if (behavior.nearThing?.id === 'shopCounter') setHint('Minimarket. Press E to look around.');
    else if (behavior.nearThing) setHint(`${behavior.nearThing.name}. Press E to inspect.`);
    else if (behavior.nearCafe) setHint('Cafe counter. Press F for a coffee: +25% speed for a minute.');
    else if (behavior.nearDrink) setHint('Press F to "drink". Does nothing for its systems, but it likes it.');
    else if (behavior.wading) setHint('Shallow water. Slow going, but you can wade anywhere in the river and the lake.');
    else if (onBridge(pos.x, pos.z)) setHint('A bridge over the river. Walk straight across.');
    else if (behavior.nearPier) setHint('Press R to skip a rock across the lake.');
    else if (distToRiver(pos.x, pos.z) < 7) setHint('The river is shallow: wade straight across, or take a bridge or the stepping stones.');
    else setHint('WASD move · Space jump · hold Space on a wall to climb · B backflip · G face · T skip time · Shift run · right-drag to look · follow the green arrow');
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
        if (r.bounces >= 2) say('Three skips! You saw that, right?', 2200);
      }
    }
  }
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i];
    s.t += dt;
    s.ring.scale.setScalar(1 + s.t * 6);
    s.ring.material.opacity = Math.max(0, 0.8 - s.t * 1.2);
    if (s.t > 0.7) { scene.remove(s.ring); s.ring.material.dispose(); splashes.splice(i, 1); }
  }

  // update dunia + robot + langit
  world.setPlayer(robot.root.position);
  world.update(elapsed, dt);
  world.updateRooms(camera);
  if (frameNo++ % 12 === 0) { camera.updateMatrixWorld(); world.updateTrees(camera); }
  gradePass.uniforms.uTime.value = elapsed;
  robot.update(dt, 0, elapsed);
  if (started) {
    advanceClock(rawDt, robot.state.name === 'sleep' ? 6 : 1);
    if (controls.consume('t')) {
      if (hourParam === null && !realtime) { gameClock.hour = (gameClock.hour + 3) % 24; lastEnvHour = -1; showToast(`Skipped ahead · ${String(Math.floor(gameClock.hour)).padStart(2, '0')}:00`); }
    }
  }
  const hourNow = window.__u7?.forceHour ?? timeOfDay();
  applyDaylight(hourNow);
  if (started) {
    const onWood = !!onBridge(pos.x, pos.z) || onPier(pos.x, pos.z);
    const nearFountain = Math.hypot(pos.x - WORLD.fountain.x, pos.z - WORLD.fountain.z) < WORLD.fountain.r + 3;
    const lakeDist = Math.max(0, Math.hypot(pos.x - WORLD.lake.x, pos.z - WORLD.lake.z) - WORLD.lake.r);
    audio.update({
      dt: rawDt, hour: hourNow, state: robot.state.name, time: elapsed,
      moving: Math.hypot(inp.move.x, inp.move.y) > 0.05 && behavior.lock <= 0, run: inp.run,
      waterDist: Math.min(lakeDist, distToRiver(pos.x, pos.z) - 3, nearFountain ? 2 : 99),
      mood: marketState?.mood || 'cloudy', musicLevel: finale ? 1.4 : 1,
      surface: behavior.wading ? 'water' : onWood ? 'wood' : nearFountain || inCity(pos.x, pos.z) ? 'stone' : 'grass',
      cityK: pos.x > -20 ? Math.min(1, Math.max(0, (pos.z - 36) / 14)) : 0,
    });
  }

  // kamera orbit ngikutin robot. Yaw/pitch/dist udah di-damp di controls, jadi posisi
  // dihitung langsung dari sudut (nggak lerp posisi, biar nggak motong lewat tengah pas orbit).
  // Yang di-damp cuma titik fokusnya, biar nggak ikut goyang tiap langkah.
  const yaw = inp.camYaw;
  const pitch = inp.camPitch;
  const focus = new THREE.Vector3(pos.x, pos.y + 1.4, pos.z);
  camTarget.lerp(focus, started ? Math.min(1, dt * 10) : 1);
  // jarak kamera dipendekin kalau kehalang gedung atau tanah
  let dist = inp.camDist;
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  for (let d = 0.8; d < dist; d += 0.25) {
    if (cameraBlocked(camTarget.x + dir.x * d, camTarget.y + dir.y * d, camTarget.z + dir.z * d)) { dist = Math.max(1.1, d - 0.25); break; }
  }
  behavior.camDist = behavior.camDist == null ? dist : behavior.camDist + (dist - behavior.camDist) * Math.min(1, dt * (dist < behavior.camDist ? 12 : 3));
  camPos.copy(camTarget).addScaledVector(dir, behavior.camDist);
  const camGround = groundHeight(camPos.x, camPos.z) + 0.6;
  if (camPos.y < camGround) camPos.y = camGround;
  if (finale) {
    // sinematik ending: kamera naik pelan di belakang VUZZ, pandangan geser dari dia ke kota
    finale.t += dt;
    const p = Math.min(1, finale.t / finale.dur);
    const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const city = new THREE.Vector3(40, 6, 72);
    const toCity = new THREE.Vector3().subVectors(city, pos).setY(0).normalize();
    camPos.set(pos.x - toCity.x * (9 + ease * 6), pos.y + 4 + ease * 14, pos.z - toCity.z * (9 + ease * 6));
    camTarget.lerpVectors(new THREE.Vector3(pos.x, pos.y + 1.6, pos.z), city, Math.min(1, ease * 1.3));
    behavior.camDist = camPos.distanceTo(camTarget);
  }
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  const windowGoal = holderSpot && !holderSpot.seen ? [holderSpot] : [];
  const chainGoals = windowGoal.length ? windowGoal : chain.targets;
  minimap.update({ pos, rotY: robot.root.rotation.y, camYaw: yaw, camera, signals: chainGoals, objectiveLabel: 'window', started: started && !finale });
  sun.target.position.copy(pos);

  // posisi bubble NPC di atas kepala NPC yang lagi ngomong
  if (!npcBubble.hidden && npcSpeaker) {
    const sp = (WORLD.npcs || []).find((n) => n.id === npcSpeaker.id) || npcSpeaker;
    const v = new THREE.Vector3(sp.x, (sp.y ?? groundHeight(sp.x, sp.z)) + (sp.kind === 'robot' ? 2.6 : 2.2), sp.z).project(camera);
    const onScreen = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
    npcBubble.style.opacity = onScreen ? 1 : 0;
    npcBubble.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    npcBubble.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  }
  // posisi bubble di atas kepala
  if (!bubble.hidden) {
    const v = new THREE.Vector3(pos.x, pos.y + 2.9, pos.z).project(camera);
    bubble.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    bubble.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  }

  composer.render();
  adaptQuality(rawDt);
  requestAnimationFrame(tick);
}

// Kualitas adaptif: kalau rata-rata di bawah ~40 fps selama 3 detik, turunin resolusi render
// setahap (sampai 1.0), terus matiin bloom. Nggak pernah naik lagi biar nggak kedip-kedip.
const perf = { acc: 0, n: 0, cooldown: 4 };
function adaptQuality(dt) {
  if (!started || document.hidden) return;
  // frame yang kelewat lama (tab di-pause, window kehalang) bukan ukuran performa, abaikan dan mulai ulang
  if (dt > 0.25) { perf.acc = 0; perf.n = 0; perf.cooldown = Math.max(perf.cooldown, 1); return; }
  perf.cooldown -= dt;
  if (perf.cooldown > 0) return;
  perf.acc += dt; perf.n++;
  if (perf.acc < 3) return;
  const fps = perf.n / perf.acc;
  perf.acc = 0; perf.n = 0; perf.cooldown = 3;
  if (fps >= 40) return;
  if (pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(window.innerWidth, window.innerHeight);
    console.info(`[perf] ${fps.toFixed(0)} fps → pixel ratio ${pixelRatio}`);
  } else if (bloom.enabled) {
    bloom.enabled = false;
    console.info(`[perf] ${fps.toFixed(0)} fps → bloom off`);
  }
}

function takePhoto() {
  hud.classList.add('hidden');
  requestAnimationFrame(() => {
    composer.render();
    try {
      // tempel watermark $VUZZ + jam dunia di pojok, lalu simpan
      const src = renderer.domElement;
      const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
      const g = c.getContext('2d');
      g.drawImage(src, 0, 0);
      const k = Math.max(1, src.width / 1280);
      const h = gameClock.hour;
      const clock = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
      g.font = `700 ${Math.round(34 * k)}px Chakra Petch, sans-serif`; g.textBaseline = 'bottom';
      g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 10 * k;
      g.fillStyle = '#b8ff3c'; g.fillText(CONFIG.ticker, 28 * k, c.height - 26 * k);
      g.font = `500 ${Math.round(16 * k)}px Chakra Petch, sans-serif`; g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText(`7POD World · ${clock} · ${evo.name}`, 30 * k, c.height - 64 * k);
      const a = document.createElement('a');
      a.href = c.toDataURL('image/png');
      a.download = `vuzz-world-${Date.now()}.png`;
      a.click();
      showToast('Photo saved with the $7POD mark. Share it on X');
    } catch (e) {
      showToast('Could not save the photo in this browser.');
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

window.__u7 = { get chain() { return chain; }, shop: { buy: buyItem, open: openShop, add: earnBolts, get bolts() { return bolts; }, gear, items: SHOP_ITEMS }, gameClock, BUILDINGS, rooftopHeight, obstacleTop, WORLD, world, get daily() { return daily; }, signals: WORLD.signals, robot, behavior, controls, audio, scene, camera, renderer, blockedByBuilding, isWater, wadeable, onBridge, groundHeight };

// kamera awal: dari depan robot
controls.setYaw(Math.PI);
tick();
