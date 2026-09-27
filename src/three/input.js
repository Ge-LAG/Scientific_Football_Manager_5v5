// Contrôles de l'Arène : clavier (positions physiques → ZQSD sur AZERTY, WASD sur QWERTY), souris (verrouillage du pointeur),
// manette (API Gamepad) et commandes tactiles. Produit un état lu à chaque image par la vue 3D.

export function createInput(canvas, { sensitivity = 1, invertY = false } = {}) {
  const keys = new Set();
  const st = { yaw: 0, pitch: 0.28, sens: sensitivity, invertY, locked: false, mouseL: false, mouseR: false, edges: new Set(), touch: { mx: 0, mz: 0, btn: new Set() }, pad: null, usingPad: false, lastPadButtons: [] };
  const EDGE_KEYS = { KeyE: "pass", KeyF: "lob", KeyC: "tackle", ControlLeft: "tackle", ControlRight: "tackle", KeyR: "pu", KeyV: "cam", Escape: "menu", Tab: "board", KeyX: "call", KeyQ: "skill",
    Digit1: "emote1", Digit2: "emote2", Digit3: "emote3", Digit4: "emote4", Digit5: "emote5" };

  const onKey = down => e => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
    const c = e.code;
    if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ControlLeft"].includes(c)) e.preventDefault();
    if (down) { if (!keys.has(c) && EDGE_KEYS[c]) st.edges.add(EDGE_KEYS[c]); keys.add(c); } else keys.delete(c);
    st.usingPad = false;
  };
  const kd = onKey(true), ku = onKey(false);
  const onMouseMove = e => { if (!st.locked) return; st.yaw += e.movementX * 0.0024 * st.sens; st.pitch = Math.max(0.05, Math.min(0.9, st.pitch + e.movementY * 0.0018 * st.sens * (st.invertY ? -1 : 1))); };
  const onMouseDown = e => { if (!st.locked) { canvas.requestPointerLock?.()?.catch?.(() => {}); return; } if (e.button === 0) st.mouseL = true; if (e.button === 2) { st.mouseR = true; st.edges.add("pass"); } };
  const onMouseUp = e => { if (e.button === 0) st.mouseL = false; if (e.button === 2) st.mouseR = false; };
  const onLock = () => { st.locked = document.pointerLockElement === canvas; if (!st.locked) { st.mouseL = false; } };
  const noCtx = e => e.preventDefault();
  const blur = () => { keys.clear(); st.mouseL = false; };
  window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); window.addEventListener("blur", blur);
  document.addEventListener("mousemove", onMouseMove); canvas.addEventListener("mousedown", onMouseDown); window.addEventListener("mouseup", onMouseUp);
  document.addEventListener("pointerlockchange", onLock); canvas.addEventListener("contextmenu", noCtx);

  function pollPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find(p => p && p.connected);
    st.pad = null; if (!pad) return;
    const dz = v => (Math.abs(v) < 0.15 ? 0 : v);
    const b = i => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value || 0) > 0.35;
    const prev = st.lastPadButtons;
    const edge = (i, name) => { if (b(i) && !prev[i]) st.edges.add(name); };
    edge(0, "pass"); edge(1, "tackle"); edge(3, "pu"); edge(4, "lob"); edge(8, "cam"); edge(9, "menu"); edge(11, "call"); edge(10, "skill");
    st.lastPadButtons = pad.buttons.map((_, i) => b(i));
    const rx = dz(pad.axes[2] || 0), ry = dz(pad.axes[3] || 0);
    st.yaw += rx * 2.6 * dt * st.sens; st.pitch = Math.max(0.05, Math.min(0.9, st.pitch + ry * 1.4 * dt * (st.invertY ? -1 : 1)));
    st.pad = { lx: dz(pad.axes[0] || 0), ly: dz(pad.axes[1] || 0), shoot: b(2), sprint: b(7) || b(5) };
    if (st.pad.lx || st.pad.ly || st.pad.shoot || rx) st.usingPad = true;
  }

  // Lecture de l'intention du joueur en coordonnées « caméra » : avant/droite ∈ [-1, 1]
  function read(dt) {
    pollPad(dt);
    let fwd = 0, right = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) fwd += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) fwd -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) right += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) right -= 1;
    if (st.pad && (st.pad.lx || st.pad.ly)) { fwd = -st.pad.ly; right = st.pad.lx; }
    if (st.touch.mx || st.touch.mz) { fwd = st.touch.mz; right = st.touch.mx; }
    const edges = new Set(st.edges); st.edges.clear();
    for (const b of st.touch.btn) if (b !== "shoot" && b !== "sprint") edges.add(b);
    st.touch.btn = new Set([...st.touch.btn].filter(b => b === "shoot" || b === "sprint"));
    return {
      fwd, right,
      sprint: keys.has("ShiftLeft") || keys.has("ShiftRight") || !!st.pad?.sprint || st.touch.btn.has("sprint"),
      shoot: st.mouseL || keys.has("Space") || !!st.pad?.shoot || st.touch.btn.has("shoot"),
      edges, board: keys.has("Tab"),
    };
  }

  return {
    state: st, read,
    setSensitivity: (s, inv) => { st.sens = s; st.invertY = inv; },
    lock: () => canvas.requestPointerLock?.()?.catch?.(() => {}),
    unlock: () => document.exitPointerLock?.(),
    touch: st.touch,
    dispose() {
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", blur);
      document.removeEventListener("mousemove", onMouseMove); canvas.removeEventListener("mousedown", onMouseDown); window.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("pointerlockchange", onLock); canvas.removeEventListener("contextmenu", noCtx);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
  };
}
