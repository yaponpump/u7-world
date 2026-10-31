// Input: keyboard (WASD/arrow), mouse drag + scroll buat kamera, joystick sentuh di HP.
// Semua gerakan kamera dan input jalan dihaluskan di poll(dt): drag punya inersia,
// yaw/pitch ngejar target dengan damping, dan arah jalan nggak loncat.
export function createControls(canvas) {
  const keys = new Set();
  const input = {
    move: { x: 0, y: 0 },      // -1..1, sudah dihaluskan
    moveRaw: { x: 0, y: 0 },   // input mentah
    run: false,
    camYaw: 0,                 // orbit kamera (nilai halus yang dipakai render)
    camPitch: 0.35,
    camDist: 6.5,
    pressed: new Set(),         // aksi sekali tekan (e, f, r, q, m)
    anyInput: false,
    dragging: false,
    sinceDrag: 99,              // detik sejak terakhir user muter kamera (buat auto-follow)
  };
  // target kamera (yang digeser input), nilai halus ngejar ini
  const cam = { yaw: 0, pitch: 0.35, dist: 6.5, yawVel: 0, pitchVel: 0 };
  const SENS = { mouse: 0.0032, touch: 0.0045 };
  const PITCH_MIN = 0.08, PITCH_MAX = 1.1;
  const DIST_MIN = 3.5, DIST_MAX = 11;

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (['e', 'f', 'r', 'q', 'm', ' '].includes(k)) input.pressed.add(k);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  function applyDrag(dx, dy, sens) {
    cam.yaw -= dx * sens;
    cam.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, cam.pitch + dy * sens * 0.8));
    // simpan kecepatan buat inersia pas dilepas
    cam.yawVel = -dx * sens;
    cam.pitchVel = dy * sens * 0.8;
    input.sinceDrag = 0;
  }

  // Mouse drag orbit (tombol kiri atau kanan), scroll buat zoom
  let dragging = false;
  let lastX = 0, lastY = 0;
  canvas.style.cursor = 'grab';
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    cam.yawVel = cam.pitchVel = 0;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture?.(e.pointerId);
  });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return;
    dragging = false;
    canvas.style.cursor = 'grab';
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    applyDrag(e.clientX - lastX, e.clientY - lastY, SENS.mouse);
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, cam.dist + Math.sign(e.deltaY) * 0.6));
  }, { passive: false });

  // Touch: joystick kiri, drag kamera di sisa layar, pinch buat zoom
  const joy = document.getElementById('joystick');
  const knob = joy.querySelector('.knob');
  let joyId = null;
  let joyCenter = { x: 0, y: 0 };
  const joyVec = { x: 0, y: 0 };
  joy.addEventListener('pointerdown', (e) => {
    joyId = e.pointerId;
    const r = joy.getBoundingClientRect();
    joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    joy.setPointerCapture(e.pointerId);
  });
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    const dx = e.clientX - joyCenter.x;
    const dy = e.clientY - joyCenter.y;
    const len = Math.hypot(dx, dy);
    const max = 44;
    const k = len > max ? max / len : 1;
    joyVec.x = (dx * k) / max;
    joyVec.y = (dy * k) / max;
    knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
  });
  const joyEnd = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null; joyVec.x = joyVec.y = 0;
    knob.style.transform = 'translate(-50%, -50%)';
  };
  joy.addEventListener('pointerup', joyEnd);
  joy.addEventListener('pointercancel', joyEnd);

  const touches = new Map();
  let pinchDist = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const t = touches.get(e.pointerId);
    if (!t) return;
    if (touches.size === 1) applyDrag(e.clientX - t.x, e.clientY - t.y, SENS.touch);
    t.x = e.clientX; t.y = e.clientY;
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      cam.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, cam.dist - (d - pinchDist) * 0.02));
      pinchDist = d;
    }
  });
  const camEnd = (e) => { touches.delete(e.pointerId); };
  canvas.addEventListener('pointerup', camEnd);
  canvas.addEventListener('pointercancel', camEnd);

  // Tombol aksi di HUD → sama kayak tombol keyboard
  for (const [id, key] of [['act-sit', 'e'], ['act-drink', 'f'], ['act-throw', 'r'], ['act-photo', 'q']]) {
    document.getElementById(id)?.addEventListener('click', () => input.pressed.add(key));
  }

  const damp = (k, dt) => 1 - Math.exp(-k * dt);

  return {
    input,
    poll(dt = 1 / 60) {
      let x = 0, y = 0;
      if (keys.has('w') || keys.has('arrowup')) y -= 1;
      if (keys.has('s') || keys.has('arrowdown')) y += 1;
      if (keys.has('a') || keys.has('arrowleft')) x -= 1;
      if (keys.has('d') || keys.has('arrowright')) x += 1;
      x += joyVec.x; y += joyVec.y;
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      input.moveRaw.x = x; input.moveRaw.y = y;
      // arah jalan dihaluskan: cepat nambah, lebih cepat berhenti
      const k = damp(len > 0.05 ? 10 : 16, dt);
      input.move.x += (x - input.move.x) * k;
      input.move.y += (y - input.move.y) * k;
      if (Math.hypot(input.move.x, input.move.y) < 0.02 && len < 0.05) input.move.x = input.move.y = 0;
      input.run = keys.has('shift') || Math.hypot(joyVec.x, joyVec.y) > 0.92;
      input.dragging = dragging || touches.size > 0;
      input.anyInput = len > 0.05 || input.dragging || input.pressed.size > 0;
      input.sinceDrag += dt;

      // inersia kamera setelah drag dilepas
      if (!input.dragging) {
        cam.yaw += cam.yawVel;
        cam.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, cam.pitch + cam.pitchVel));
        const f = Math.exp(-dt * 7);
        cam.yawVel *= f; cam.pitchVel *= f;
      }
      // nilai halus ngejar target
      const kc = damp(input.dragging ? 22 : 12, dt);
      let dy = cam.yaw - input.camYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      input.camYaw += dy * kc;
      input.camPitch += (cam.pitch - input.camPitch) * kc;
      input.camDist += (cam.dist - input.camDist) * damp(8, dt);
    },
    // auto-follow: geser target yaw pelan ke belakang robot (dipanggil main pas jalan tanpa drag)
    followYaw(targetYaw, dt, strength = 1.2) {
      let d = targetYaw - cam.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      cam.yaw += d * damp(strength, dt);
    },
    setYaw(yaw) { cam.yaw = yaw; input.camYaw = yaw; },
    consume(key) {
      if (input.pressed.has(key)) { input.pressed.delete(key); return true; }
      return false;
    },
    clearPressed() { input.pressed.clear(); },
  };
}
