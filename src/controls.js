// Input: keyboard (WASD/arrow), mouse drag buat kamera, joystick sentuh di HP.
export function createControls(canvas) {
  const keys = new Set();
  const input = {
    move: { x: 0, y: 0 },      // -1..1
    run: false,
    camYaw: 0,                 // orbit kamera
    camPitch: 0.35,
    pressed: new Set(),         // aksi sekali tekan (e, f, r, q)
    anyInput: false,
  };

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (['e', 'f', 'r', 'q', ' '].includes(k)) input.pressed.add(k);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  // Mouse drag orbit
  let dragging = false;
  let lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    input.camYaw -= (e.clientX - lastX) * 0.005;
    input.camPitch = Math.min(1.2, Math.max(0.05, input.camPitch + (e.clientY - lastY) * 0.004));
    lastX = e.clientX; lastY = e.clientY;
  });

  // Touch: joystick kiri, drag kamera di sisa layar
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

  let camTouchId = null;
  let camLast = { x: 0, y: 0 };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    camTouchId = e.pointerId; camLast = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== camTouchId) return;
    input.camYaw -= (e.clientX - camLast.x) * 0.006;
    input.camPitch = Math.min(1.2, Math.max(0.05, input.camPitch + (e.clientY - camLast.y) * 0.004));
    camLast = { x: e.clientX, y: e.clientY };
  });
  const camEnd = (e) => { if (e.pointerId === camTouchId) camTouchId = null; };
  canvas.addEventListener('pointerup', camEnd);
  canvas.addEventListener('pointercancel', camEnd);

  // Tombol aksi di HUD → sama kayak tombol keyboard
  for (const [id, key] of [['act-sit', 'e'], ['act-drink', 'f'], ['act-throw', 'r'], ['act-photo', 'q']]) {
    document.getElementById(id)?.addEventListener('click', () => input.pressed.add(key));
  }

  return {
    input,
    poll() {
      let x = 0, y = 0;
      if (keys.has('w') || keys.has('arrowup')) y -= 1;
      if (keys.has('s') || keys.has('arrowdown')) y += 1;
      if (keys.has('a') || keys.has('arrowleft')) x -= 1;
      if (keys.has('d') || keys.has('arrowright')) x += 1;
      x += joyVec.x; y += joyVec.y;
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      input.move.x = x; input.move.y = y;
      input.run = keys.has('shift') || Math.hypot(joyVec.x, joyVec.y) > 0.92;
      input.anyInput = len > 0.05 || dragging || input.pressed.size > 0;
    },
    consume(key) {
      if (input.pressed.has(key)) { input.pressed.delete(key); return true; }
      return false;
    },
    clearPressed() { input.pressed.clear(); },
  };
}
