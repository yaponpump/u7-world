import * as THREE from 'three';
import { panelLineTexture } from './textures.js';

// U-7 sementara: dibangun dari bentuk dasar, warna colorful (ungu, lime, oranye).
// Nanti diganti model GLB asli, tapi API (setState, update) tetep sama.

const COL = {
  violet: 0x6d3df5,
  violetDark: 0x3b1f8f,
  lime: 0xb8ff3c,
  orange: 0xff8a2a,
  graphite: 0x1d2027,
  visor: 0x0b0d12,
};

export const STATES = ['idle', 'walk', 'run', 'sit', 'drink', 'yawn', 'sleep', 'throw', 'curious', 'wave'];

export function createRobot() {
  const root = new THREE.Group();
  const body = new THREE.Group(); // bagian yang bob
  root.add(body);

  // Material PBR: armor glossy ber-clearcoat dengan garis panel, sendi graphite semi-metal
  const panels = panelLineTexture();
  const armor = (color) => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.42, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12,
    roughnessMap: panels, bumpMap: panels, bumpScale: 0.004, envMapIntensity: 1.1,
  });
  const violet = armor(COL.violet);
  const violetDark = armor(COL.violetDark);
  const lime = new THREE.MeshPhysicalMaterial({ color: COL.lime, roughness: 0.3, emissive: COL.lime, emissiveIntensity: 0.35, clearcoat: 0.6 });
  const orange = armor(COL.orange);
  const graphite = new THREE.MeshStandardMaterial({ color: COL.graphite, roughness: 0.55, metalness: 0.85, envMapIntensity: 1.2 });
  const visorMat = new THREE.MeshPhysicalMaterial({ color: COL.visor, roughness: 0.04, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: COL.lime, emissive: COL.lime, emissiveIntensity: 3.5, toneMapped: false });

  // Kaki
  const legGeo = new THREE.CapsuleGeometry(0.16, 0.32, 4, 10);
  const legL = new THREE.Mesh(legGeo, graphite);
  const legR = new THREE.Mesh(legGeo, graphite);
  legL.position.set(-0.2, 0.42, 0);
  legR.position.set(0.2, 0.42, 0);
  const bootGeo = new THREE.BoxGeometry(0.3, 0.16, 0.42);
  const bootL = new THREE.Mesh(bootGeo, violet);
  const bootR = new THREE.Mesh(bootGeo, violet);
  bootL.position.set(0, -0.3, 0.05);
  bootR.position.set(0, -0.3, 0.05);
  legL.add(bootL);
  legR.add(bootR);
  const legs = new THREE.Group();
  legs.add(legL, legR);
  body.add(legs);

  // Torso
  const torso = new THREE.Group();
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.35, 6, 16), violet);
  chest.scale.set(1, 0.9, 0.8);
  chest.position.y = 0.95;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), violetDark);
  belly.scale.set(1, 0.75, 0.8);
  belly.position.set(0, 0.78, 0.08);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.1), lime);
  stripe.position.set(0, 1.0, 0.36);
  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.06), orange);
  chestPlate.position.set(0, 1.18, 0.37);
  // decal "U-7" pakai canvas
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.14), new THREE.MeshBasicMaterial({ map: makeLabelTexture('YOZ'), transparent: true }));
  decal.position.set(0, 1.18, 0.405);
  torso.add(chest, belly, stripe, chestPlate, decal);
  body.add(torso);

  // Pylon bahu
  const pylonGeo = new THREE.BoxGeometry(0.22, 0.5, 0.3);
  const pylL = new THREE.Mesh(pylonGeo, orange);
  const pylR = new THREE.Mesh(pylonGeo, orange);
  pylL.position.set(-0.52, 1.32, 0);
  pylR.position.set(0.52, 1.32, 0);
  pylL.rotation.z = 0.25;
  pylR.rotation.z = -0.25;
  body.add(pylL, pylR);

  // Lengan (pivot di bahu)
  function arm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.5, 1.15, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 4, 10), graphite);
    upper.position.y = -0.22;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), violet);
    hand.position.y = -0.52;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 8, 16), lime);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.4;
    pivot.add(upper, hand, cuff);
    return { pivot, hand };
  }
  const armL = arm(-1);
  const armR = arm(1);
  body.add(armL.pivot, armR.pivot);

  // Kepala besar (pivot di leher)
  const head = new THREE.Group();
  head.position.y = 1.48;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.18, 10), graphite);
  neck.position.y = 0.02;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 18), violet);
  skull.scale.set(1, 0.88, 0.95);
  skull.position.y = 0.55;
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), violetDark);
  jaw.scale.set(1.05, 0.5, 0.9);
  jaw.position.set(0, 0.28, 0.05);
  // visor
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), visorMat);
  visor.rotation.x = Math.PI / 2 - 0.25;
  visor.scale.set(0.95, 0.9, 0.9);
  visor.position.set(0, 0.56, 0.2);
  // mata
  const eyeGeo = new THREE.CircleGeometry(0.11, 20);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.19, 0.6, 0.66);
  eyeR.position.set(0.19, 0.6, 0.66);
  eyeL.rotation.y = -0.25;
  eyeR.rotation.y = 0.25;
  // sirip kecil samping helm + sirip kecil atas
  const finGeo = new THREE.ConeGeometry(0.1, 0.42, 4);
  const finL = new THREE.Mesh(finGeo, lime);
  const finR = new THREE.Mesh(finGeo, lime);
  finL.position.set(-0.6, 0.78, -0.05);
  finR.position.set(0.6, 0.78, -0.05);
  finL.rotation.z = 0.7;
  finR.rotation.z = -0.7;
  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 4), orange);
  crest.position.set(0, 1.1, -0.1);
  crest.rotation.x = -0.4;
  // garis hazard di dahi
  const hazard = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.08), new THREE.MeshBasicMaterial({ map: makeHazardTexture(), transparent: true }));
  hazard.position.set(0, 0.98, 0.5);
  hazard.rotation.x = -0.5;
  head.add(neck, skull, jaw, visor, eyeL, eyeR, finL, finR, crest, hazard);
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
  root.add(glow);

  root.traverse((m) => { if (m.isMesh) m.castShadow = true; });

  // ---- state & animasi ----
  const state = { name: 'idle', t: 0, blink: 0, eyeMode: 'normal' };
  const api = {
    root, head, state,
    setState(name) {
      if (state.name === name) return;
      state.name = name;
      state.t = 0;
      cup.visible = name === 'drink' || name === 'sit';
      zz.visible = name === 'sleep';
      api.setEyes(name === 'sleep' ? 'closed' : name === 'yawn' ? 'squint' : name === 'curious' ? 'wide' : name === 'sit' || name === 'drink' ? 'happy' : 'normal');
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
      body.rotation.set(0, 0, 0);
      head.rotation.set(0, 0, 0);
      legL.rotation.set(0, 0, 0);
      legR.rotation.set(0, 0, 0);
      armL.pivot.rotation.set(0, 0, 0.12);
      armR.pivot.rotation.set(0, 0, -0.12);
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
        armR.pivot.rotation.x = -1.3;
        armR.pivot.rotation.z = -0.4;
        head.rotation.x = -0.12 + Math.sin(time * 0.8) * 0.04;
        head.rotation.y = Math.sin(time * 0.4) * 0.3;
        // sesekali nyeruput
        const sip = Math.max(0, Math.sin(time * 0.7));
        if (sip > 0.92) { armR.pivot.rotation.x = -2.3; armR.pivot.rotation.z = -0.1; head.rotation.x = 0.12; }
      } else if (n === 'drink') {
        const k = Math.min(1, t / 0.6);
        armR.pivot.rotation.x = -2.2 * k;
        armR.pivot.rotation.z = -0.15;
        head.rotation.x = 0.18 * k;
        body.position.y = Math.sin(time * 2) * 0.02;
        if (t > 1.6) { head.rotation.x = -0.25; } // puas
      } else if (n === 'yawn') {
        const k = Math.sin(Math.min(1, t / 1.6) * Math.PI);
        head.rotation.x = -0.45 * k;
        armL.pivot.rotation.x = -2.6 * k;
        armR.pivot.rotation.x = -2.6 * k;
        armL.pivot.rotation.z = 0.5 * k;
        armR.pivot.rotation.z = -0.5 * k;
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
      } else if (n === 'wave') {
        armR.pivot.rotation.x = -2.6;
        armR.pivot.rotation.z = -0.4 + Math.sin(time * 10) * 0.35;
        head.rotation.z = -0.15;
      }
    },
  };
  api.setEyes('normal');
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
