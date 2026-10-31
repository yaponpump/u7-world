import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { panelLineTexture, wornPaintTextures } from './textures.js';

// VUZZ: mecha kecil dari logam aus, warna ungu, lime, oranye.
// Kalau nanti ada model GLB asli, API (setState, update) tetep sama.

const COL = {
  violet: 0x6d3df5,
  violetDark: 0x3b1f8f,
  lime: 0xb8ff3c,
  orange: 0xff8a2a,
  graphite: 0x1d2027,
  visor: 0x0b0d12,
};

const shared = {};

export const STATES = ['idle', 'walk', 'run', 'sit', 'drink', 'yawn', 'sleep', 'throw', 'curious', 'wave', 'jump'];

export function createRobot({ dormant = false } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // bagian yang bob
  root.add(body);

  // Material: cat logam yang udah aus, sendi baja, kaca visor
  // Tekstur canvasnya mahal, dipakai bareng kalau robotnya lebih dari satu
  shared.panels ??= panelLineTexture();
  shared.wear ??= wornPaintTextures();
  const { panels, wear } = shared;
  const paint = (color, metalness = 0.55) => new THREE.MeshStandardMaterial({
    color, map: wear.map, roughnessMap: wear.rough, roughness: 1, metalness,
    bumpMap: panels, bumpScale: 0.6, envMapIntensity: 1.15,
  });
  const violet = paint(COL.violet);
  const violetDark = paint(COL.violetDark);
  const orange = paint(COL.orange, 0.4);
  const graphite = new THREE.MeshStandardMaterial({ color: COL.graphite, map: wear.map, roughnessMap: wear.rough, roughness: 0.8, metalness: 0.9, envMapIntensity: 1.2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xa9adb3, roughnessMap: wear.rough, roughness: 0.55, metalness: 1, envMapIntensity: 1.3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9, metalness: 0 });
  const lime = new THREE.MeshStandardMaterial({ color: COL.lime, roughness: 0.35, emissive: COL.lime, emissiveIntensity: 0.9 });
  const visorMat = new THREE.MeshPhysicalMaterial({ color: COL.visor, roughness: 0.08, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: COL.lime, emissive: COL.lime, emissiveIntensity: 2.2, toneMapped: false });

  const box = (w, h, d, mat, r = 0.04, seg = 3) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) * 0.49)), mat);
  const cyl = (r1, r2, h, mat, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  const place = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const boltGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.012, 6);
  // Baut di pelat, sumbu ngarah ke z
  const bolts = (parent, pts) => { for (const [x, y, z] of pts) { const b = new THREE.Mesh(boltGeo, steel); b.rotation.x = Math.PI / 2; parent.add(place(b, x, y, z)); } };
  const piston = (parent, x, y0, y1, z) => {
    parent.add(place(cyl(0.028, 0.028, Math.abs(y1 - y0) * 0.55, graphite, 10), x, y0 + (y1 - y0) * 0.27, z));
    parent.add(place(cyl(0.014, 0.014, Math.abs(y1 - y0), steel, 10), x, (y0 + y1) / 2, z));
  };

  // Kaki: paha, lutut, tulang kering, bot
  function leg(side) {
    const g = new THREE.Group();
    g.position.set(side * 0.21, 0.42, 0);
    g.add(place(cyl(0.11, 0.1, 0.34, graphite), 0, 0.04, 0));
    g.add(place(box(0.25, 0.22, 0.27, violet, 0.06), 0, 0.17, 0.01));
    const knee = cyl(0.085, 0.085, 0.27, steel); knee.rotation.z = Math.PI / 2;
    g.add(place(knee, 0, 0.0, 0.02));
    g.add(place(box(0.2, 0.09, 0.09, orange, 0.03), 0, 0.0, 0.14));
    g.add(place(box(0.24, 0.27, 0.27, violetDark, 0.06), 0, -0.17, 0.02));
    piston(g, side * 0.14, 0.1, -0.2, -0.06);
    g.add(place(cyl(0.09, 0.11, 0.06, graphite), 0, -0.31, 0.02));
    g.add(place(box(0.32, 0.12, 0.44, violet, 0.05), 0, -0.33, 0.06));
    g.add(place(box(0.34, 0.035, 0.47, rubber, 0.012), 0, -0.395, 0.06));
    g.add(place(box(0.27, 0.05, 0.14, orange, 0.02), 0, -0.29, 0.22));
    return g;
  }
  const legL = leg(-1);
  const legR = leg(1);
  const legs = new THREE.Group();
  legs.add(legL, legR);
  body.add(legs);

  // Torso: pinggul, perut berusuk, dada berlapis
  const torso = new THREE.Group();
  torso.add(place(box(0.66, 0.16, 0.42, graphite, 0.05), 0, 0.68, 0));
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.024, 8, 24), rubber);
    rib.rotation.x = Math.PI / 2;
    rib.scale.set(1.25, 0.88, 1);
    torso.add(place(rib, 0, 0.77 + i * 0.05, 0));
  }
  torso.add(place(cyl(0.22, 0.22, 0.16, graphite), 0, 0.82, 0));
  torso.add(place(box(0.82, 0.52, 0.5, violet, 0.1, 5), 0, 1.13, 0));
  torso.add(place(box(0.62, 0.17, 0.05, violetDark, 0.02), 0, 0.95, 0.25));
  const stripe = box(0.5, 0.028, 0.02, lime, 0.008);
  torso.add(place(stripe, 0, 0.95, 0.283));
  const chestPlate = box(0.42, 0.2, 0.05, orange, 0.02);
  torso.add(place(chestPlate, 0, 1.2, 0.255));
  bolts(torso, [[-0.19, 1.28, 0.283], [0.19, 1.28, 0.283], [-0.19, 1.12, 0.283], [0.19, 1.12, 0.283]]);
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.13), new THREE.MeshBasicMaterial({ map: makeLabelTexture('VUZZ'), transparent: true }));
  torso.add(place(decal, 0, 1.2, 0.282));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) torso.add(place(box(0.13, 0.014, 0.012, rubber, 0.004), s * 0.31, 1.25 - i * 0.04, 0.25));
  }
  torso.add(place(box(0.52, 0.34, 0.14, graphite, 0.04), 0, 1.12, -0.28));
  body.add(torso);

  // Pelindung bahu
  for (const s of [-1, 1]) {
    const pad = box(0.26, 0.2, 0.36, orange, 0.06);
    pad.rotation.z = -s * 0.22;
    body.add(place(pad, s * 0.5, 1.38, 0));
    const trim = box(0.27, 0.03, 0.37, violetDark, 0.01);
    trim.rotation.z = -s * 0.22;
    body.add(place(trim, s * 0.5, 1.27, 0));
  }

  // Lengan (pivot di bahu): sendi, piston, lengan bawah, capit tiga jari
  function arm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.52, 1.2, 0);
    pivot.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), steel));
    pivot.add(place(cyl(0.065, 0.075, 0.24, graphite), 0, -0.14, 0));
    piston(pivot, side * 0.09, -0.04, -0.26, 0.02);
    pivot.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), steel), 0, -0.28, 0));
    pivot.add(place(box(0.19, 0.25, 0.2, violet, 0.05), 0, -0.4, 0));
    pivot.add(place(box(0.2, 0.05, 0.21, orange, 0.015), 0, -0.34, 0));
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.014, 8, 20), lime);
    cuff.rotation.x = Math.PI / 2;
    pivot.add(place(cuff, 0, -0.54, 0));
    const hand = new THREE.Group();
    hand.position.y = -0.58;
    hand.add(place(cyl(0.08, 0.07, 0.07, graphite), 0, 0.02, 0));
    for (const [x, z] of [[-0.05, 0.05], [0.05, 0.05], [0, -0.06]]) {
      const f = box(0.04, 0.12, 0.04, steel, 0.012);
      f.rotation.x = z > 0 ? -0.2 : 0.2;
      hand.add(place(f, x, -0.07, z));
    }
    pivot.add(hand);
    return { pivot, hand };
  }
  const armL = arm(-1);
  const armR = arm(1);
  body.add(armL.pivot, armR.pivot);

  // Kepala besar (pivot di leher): helm, visor kaca, antena
  const head = new THREE.Group();
  head.position.y = 1.42;
  const neck = cyl(0.13, 0.17, 0.2, graphite);
  neck.position.y = 0.06;
  head.add(neck);
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.18, -0.02, -0.12), new THREE.Vector3(s * 0.3, 0.08, -0.2), new THREE.Vector3(s * 0.26, 0.24, -0.1)]);
    head.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.016, 6), rubber));
  }
  const skull = box(1.14, 0.84, 1.02, violet, 0.3, 8);
  skull.position.y = 0.58;
  const brow = box(0.98, 0.1, 0.12, violetDark, 0.04);
  brow.position.set(0, 0.87, 0.46);
  const jaw = box(0.9, 0.2, 0.86, violetDark, 0.09, 5);
  jaw.position.set(0, 0.22, 0.02);
  const visor = box(0.9, 0.42, 0.14, visorMat, 0.09, 6);
  visor.position.set(0, 0.56, 0.47);
  const eyeGeo = new THREE.CircleGeometry(0.09, 24);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.2, 0.6, 0.545);
  eyeR.position.set(0.2, 0.6, 0.545);
  for (const s of [-1, 1]) {
    const ear = cyl(0.17, 0.17, 0.09, graphite, 24);
    ear.rotation.z = Math.PI / 2;
    head.add(place(ear, s * 0.59, 0.58, 0));
    const earCap = cyl(0.1, 0.1, 0.1, orange, 24);
    earCap.rotation.z = Math.PI / 2;
    head.add(place(earCap, s * 0.61, 0.58, 0));
  }
  // sirip antena sinyal
  const finGeo = new THREE.ConeGeometry(0.06, 0.34, 4);
  const finL = new THREE.Mesh(finGeo, lime);
  const finR = new THREE.Mesh(finGeo, lime);
  finL.position.set(-0.56, 0.86, -0.05);
  finR.position.set(0.56, 0.86, -0.05);
  finL.rotation.z = 0.55;
  finR.rotation.z = -0.55;
  head.add(place(cyl(0.012, 0.018, 0.34, steel, 8), 0.22, 1.12, -0.2));
  head.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), lime), 0.22, 1.3, -0.2));
  const crest = box(0.1, 0.1, 0.46, orange, 0.03);
  crest.position.set(0, 1.0, -0.06);
  const hazard = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.06), new THREE.MeshBasicMaterial({ map: makeHazardTexture(), transparent: true }));
  hazard.position.set(0, 0.87, 0.523);
  bolts(head, [[-0.48, 0.87, 0.522], [0.48, 0.87, 0.522]]);
  head.add(skull, jaw, brow, visor, eyeL, eyeR, finL, finR, crest, hazard);
  body.add(head);

  // Cangkir kopi (muncul pas minum / duduk)
  const cup = new THREE.Group();
  const cupBody = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.18, 12), new THREE.MeshStandardMaterial({ color: 0xfaf6ea }));
  const cupBand = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.06, 12), orange);
  cup.add(cupBody, cupBand);
  cup.visible = false;
  armR.hand.add(cup);
  cup.position.set(0, -0.05, 0.14);

  // Zzz sprite
  const zz = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('z z z', '#b8ff3c', 'transparent'), transparent: true }));
  zz.scale.set(0.9, 0.45, 1);
  zz.position.set(0.5, 2.6, 0);
  zz.visible = false;
  root.add(zz);

  // Lampu lime di dada biar kelihatan malam
  const glow = new THREE.PointLight(COL.lime, 0.8, 4, 2);
  glow.position.set(0, 1.1, 0.5);
  if (!dormant) root.add(glow);

  root.traverse((m) => { if (m.isMesh) m.castShadow = true; });

  // ---- state & animasi ----
  const state = { name: 'idle', t: 0, blink: 0, eyeMode: 'normal', squash: 0 };
  const api = {
    root, head, state,
    setState(name) {
      if (state.name === name) return;
      state.name = name;
      state.t = 0;
      cup.visible = name === 'drink' || name === 'sit';
      zz.visible = name === 'sleep' && !dormant;
      api.setEyes(name === 'sleep' ? 'closed' : name === 'yawn' ? 'squint' : name === 'curious' ? 'wide' : name === 'sit' || name === 'drink' ? 'happy' : 'normal');
    },
    // Warna hex, semua opsional. Default tetep ungu, lime, oranye.
    setSkin({ primary = COL.violet, secondary = COL.violetDark, accent = COL.orange, emissive = COL.lime } = {}) {
      violet.color.set(primary);
      violetDark.color.set(secondary);
      orange.color.set(accent);
      lime.color.set(emissive);
      lime.emissive.set(emissive);
      eyeMat.color.set(emissive);
      eyeMat.emissive.set(emissive);
      glow.color.set(emissive);
    },
    // Efek ngempis pas napak, numpang di atas animasi apa pun
    land() { state.squash = 1; },
    // Unit mati: satu mata nyala pas kotanya penuh lagi
    setEyeSignal(on) {
      eyeR.material = on ? signalEye : eyeL.material;
      eyeR.scale.set(1, on ? 1 : 0.06, 1);
    },
    setEyes(mode) {
      state.eyeMode = mode;
      const s = { normal: [1, 1], happy: [1, 0.55], squint: [1, 0.25], closed: [1, 0.06], wide: [1.3, 1.3] }[mode] || [1, 1];
      eyeL.scale.set(s[0], s[1], 1);
      eyeR.scale.set(s[0], s[1], 1);
      eyeL.position.y = eyeR.position.y = mode === 'happy' ? 0.64 : 0.6;
    },
    update(dt, speed, time) {
      state.t += dt;
      const t = state.t;
      const n = state.name;

      // reset pose default lalu tambahin per state
      body.position.y = 0;
      body.scale.set(1, 1, 1);
      body.rotation.set(0, 0, 0);
      head.rotation.set(0, 0, 0);
      legL.rotation.set(0, 0, 0);
      legR.rotation.set(0, 0, 0);
      armL.pivot.rotation.set(0, 0, -0.12);
      armR.pivot.rotation.set(0, 0, 0.12);
      legs.position.set(0, 0, 0);
      torso.position.set(0, 0, 0);

      // kedip
      state.blink -= dt;
      if (state.blink < -0.12) state.blink = 2.5 + Math.random() * 3;
      const blinking = state.blink < 0 && n !== 'sleep';
      if (blinking) { eyeL.scale.y = eyeR.scale.y = 0.08; } else api.setEyes(state.eyeMode);

      if (n === 'walk' || n === 'run') {
        const f = n === 'run' ? 11 : 7;
        const amp = n === 'run' ? 0.9 : 0.6;
        legL.rotation.x = Math.sin(time * f) * amp;
        legR.rotation.x = -Math.sin(time * f) * amp;
        armL.pivot.rotation.x = -Math.sin(time * f) * amp * 0.8;
        armR.pivot.rotation.x = Math.sin(time * f) * amp * 0.8;
        body.position.y = Math.abs(Math.sin(time * f)) * (n === 'run' ? 0.12 : 0.06);
        body.rotation.x = n === 'run' ? 0.18 : 0.06;
        head.rotation.z = Math.sin(time * f * 0.5) * 0.05;
      } else if (n === 'idle') {
        body.position.y = Math.sin(time * 2) * 0.02;
        head.rotation.y = Math.sin(time * 0.6) * 0.25;
        head.rotation.x = Math.sin(time * 0.9) * 0.05;
        armL.pivot.rotation.x = Math.sin(time * 2) * 0.04;
        armR.pivot.rotation.x = -Math.sin(time * 2) * 0.04;
      } else if (n === 'sit') {
        legs.position.set(0, 0.25, 0.28);
        legL.rotation.x = -1.45;
        legR.rotation.x = -1.45;
        body.position.y = -0.3;
        torso.position.y = 0;
        armL.pivot.rotation.x = -0.6;
        armR.pivot.rotation.x = -1.2;
        armR.pivot.rotation.z = -0.2;
        head.rotation.x = -0.12 + Math.sin(time * 0.8) * 0.04;
        head.rotation.y = Math.sin(time * 0.4) * 0.3;
        // sesekali nyeruput
        const sip = Math.max(0, Math.sin(time * 0.7));
        if (sip > 0.92) { armR.pivot.rotation.x = -1.8; armR.pivot.rotation.z = -0.35; head.rotation.x = 0.12; }
      } else if (n === 'drink') {
        const k = Math.min(1, t / 0.6);
        armR.pivot.rotation.x = -1.8 * k;
        armR.pivot.rotation.z = 0.12 - 0.47 * k;
        head.rotation.x = 0.18 * k;
        body.position.y = Math.sin(time * 2) * 0.02;
        if (t > 1.6) { head.rotation.x = -0.25; } // puas
      } else if (n === 'yawn') {
        const k = Math.sin(Math.min(1, t / 1.6) * Math.PI);
        head.rotation.x = -0.45 * k;
        armL.pivot.rotation.z = -0.12 - 2 * k;
        armR.pivot.rotation.z = 0.12 + 2 * k;
        body.rotation.x = -0.12 * k;
      } else if (n === 'sleep') {
        legs.position.set(0, 0.25, 0.28);
        legL.rotation.x = -1.45;
        legR.rotation.x = -1.45;
        body.position.y = -0.3 + Math.sin(time * 1.2) * 0.015;
        head.rotation.x = 0.55;
        head.rotation.z = 0.35;
        armL.pivot.rotation.x = -0.5;
        armR.pivot.rotation.x = -0.5;
        zz.position.y = 2.5 + Math.sin(time * 1.5) * 0.15;
        zz.material.opacity = 0.6 + Math.sin(time * 1.5) * 0.4;
      } else if (n === 'throw') {
        const k = Math.min(1, t / 0.5);
        armR.pivot.rotation.x = k < 0.5 ? -2.8 * (k * 2) : -2.8 + (k - 0.5) * 2 * 3.6;
        armR.pivot.rotation.z = 0.45;
        body.rotation.y = k < 0.5 ? -0.5 * k * 2 : -0.5 + (k - 0.5) * 2 * 0.9;
        head.rotation.x = -0.15;
      } else if (n === 'curious') {
        body.position.y = -0.12;
        body.rotation.x = 0.35;
        head.rotation.z = 0.3;
        head.rotation.x = 0.2;
        armR.pivot.rotation.x = -1.2;
        legL.rotation.x = -0.4;
        legR.rotation.x = -0.4;
      } else if (n === 'jump') {
        legL.rotation.x = -0.75;
        legR.rotation.x = 0.35;
        legs.position.set(0, 0.08, 0.04);
        armL.pivot.rotation.set(-0.5, 0, -0.75);
        armR.pivot.rotation.set(0.35, 0, 0.75);
        head.rotation.x = -0.1;
        body.rotation.x = 0.08;
      } else if (n === 'wave') {
        armR.pivot.rotation.z = 2.3 + Math.sin(time * 10) * 0.3;
        head.rotation.z = -0.15;
      }
      if (state.squash > 0) {
        state.squash = Math.max(0, state.squash - dt / 0.22);
        const k = state.squash * state.squash;
        body.scale.set(1 + k * 0.1, 1 - k * 0.16, 1 + k * 0.1);
      }
    },
  };
  api.setEyes('normal');
  const signalEye = eyeMat.clone();
  signalEye.emissive.set(COL.lime);
  signalEye.color.set(COL.lime);
  return api;
}

function makeLabelTexture(text, color = '#111', bg = '#ff8a2a') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 128); }
  ctx.fillStyle = color;
  ctx.font = 'bold 72px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeHazardTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 40;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 ? '#ff8a2a' : '#111';
    ctx.beginPath();
    ctx.moveTo(i * 16, 0); ctx.lineTo(i * 16 + 16, 0); ctx.lineTo(i * 16 + 4, 40); ctx.lineTo(i * 16 - 12, 40);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
