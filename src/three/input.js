// Entrées de l'Arène : clavier (touches réaffectables, positions physiques), souris (verrouillage du pointeur,
// caméra et visée), manette (API Gamepad, vibrations) et commandes tactiles. État lu à chaque image par la vue 3D.
import { resolveBindings, EDGE_ACTIONS } from "./controls.js";

const EMOTE_KEYS = { Digit1: "emote1", Digit2: "emote2", Digit3: "emote3", Digit4: "emote4", Digit5: "emote5" };
const ALWAYS_PREVENT = new Set(["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export function createInput(canvas, { sensitivity = 1, invertY = false, controls = null } = {}) {
  let cfg = resolveBindings(controls);
  const down = new Set();
  const st = { yaw: 0, pitch: 0.28, zoom: 0, sens: sensitivity, invertY, locked: false, mouseL: false, mouseR: false, edges: new Set(), touch: { mx: 0, mz: 0, btn: new Set() }, pad: null, padId: null, usingPad: false, lastPadButtons: [], shootWasDown: false };

  const typing = e => e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable);
  const onKey = isDown => e => {
    if (typing(e)) return;
    const c = e.code; const acts = cfg.keyToActions.get(c);
    if (acts || ALWAYS_PREVENT.has(c) || c === "ControlLeft") e.preventDefault();
    if (isDown) {
      if (!down.has(c)) { for (const a of acts || []) if (EDGE_ACTIONS.includes(a)) st.edges.add(a); if (EMOTE_KEYS[c] && !acts) st.edges.add(EMOTE_KEYS[c]); }
      down.add(c);
    } else down.delete(c);
    st.usingPad = false;
  };
  const kd = onKey(true), ku = onKey(false);
  const held = a => cfg.keys[a].some(c => down.has(c));

  const onMouseMove = e => { if (!st.locked) return; st.yaw += e.movementX * 0.0024 * st.sens; st.pitch = Math.max(0.05, Math.min(0.9, st.pitch + e.movementY * 0.0018 * st.sens * (st.invertY ? -1 : 1))); };
  const onMouseDown = e => {
    canvas.focus?.();
    if (!st.locked) { if (cfg.mouseCamera) canvas.requestPointerLock?.()?.catch?.(() => {}); return; }
    if (e.button === 0) st.mouseL = true;
    if (e.button === 2) { st.mouseR = true; st.edges.add("pass"); }
    if (e.button === 1) { st.edges.add("switch"); e.preventDefault(); }
  };
  const onMouseUp = e => { if (e.button === 0) st.mouseL = false; if (e.button === 2) st.mouseR = false; };
  const onWheel = e => { if (!st.locked && !cfg.mouseCamera) return; e.preventDefault(); st.zoom = Math.max(-1, Math.min(1, st.zoom + Math.sign(e.deltaY) * 0.15)); };
  const onLock = () => { st.locked = document.pointerLockElement === canvas; if (!st.locked) st.mouseL = false; };
  const noCtx = e => e.preventDefault();
  const blur = () => { down.clear(); st.mouseL = false; };
  window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); window.addEventListener("blur", blur);
  document.addEventListener("mousemove", onMouseMove); canvas.addEventListener("mousedown", onMouseDown); window.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("pointerlockchange", onLock); canvas.addEventListener("contextmenu", noCtx);

  function currentPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return [...pads].find(p => p && p.connected && (st.padId == null || p.id === st.padId)) || [...pads].find(p => p && p.connected) || null;
  }

  function pollPad(dt) {
    const pad = currentPad();
    st.pad = null; if (!pad) return;
    st.padId = pad.id;
    const dz = v => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    const b = i => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value || 0) > 0.35;
    const prev = st.lastPadButtons;
    const any = a => cfg.pad[a].some(b);
    for (const a of EDGE_ACTIONS) if (cfg.pad[a].some(i => b(i) && !prev[i])) st.edges.add(a);
    st.lastPadButtons = pad.buttons.map((_, i) => b(i));
    const rx = dz(pad.axes[2] || 0), ry = dz(pad.axes[3] || 0);
    st.yaw += rx * 2.6 * dt * st.sens; st.pitch = Math.max(0.05, Math.min(0.9, st.pitch + ry * 1.4 * dt * (st.invertY ? -1 : 1)));
    st.pad = { lx: dz(pad.axes[0] || 0), ly: dz(pad.axes[1] || 0), shoot: any("shoot"), sprint: any("sprint"), board: any("board"), press: any("press"), pass: any("pass"),
      up: any("up"), down: any("down"), left: any("left"), right: any("right") };
    if (st.pad.lx || st.pad.ly || st.pad.shoot || st.pad.sprint || rx || st.lastPadButtons.some(Boolean)) st.usingPad = true;
  }

  // Lecture de l'intention du joueur en coordonnées « caméra » : avant/droite ∈ [-1, 1]
  function read(dt) {
    pollPad(dt);
    let fwd = (held("up") ? 1 : 0) - (held("down") ? 1 : 0);
    let right = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);
    const P = st.pad;
    if (P && (P.lx || P.ly)) { fwd = -P.ly; right = P.lx; }
    else if (P && (P.up || P.down || P.left || P.right)) { fwd = (P.up ? 1 : 0) - (P.down ? 1 : 0); right = (P.right ? 1 : 0) - (P.left ? 1 : 0); }
    if (st.touch.mx || st.touch.mz) { fwd = st.touch.mz; right = st.touch.mx; }
    const shoot = st.mouseL || held("shoot") || !!P?.shoot || st.touch.btn.has("shoot");
    const edges = new Set(st.edges); st.edges.clear();
    if (shoot && !st.shootWasDown) edges.add("shootPress"); // front du tir (touches contextuelles en défense)
    st.shootWasDown = shoot;
    const HELD = ["shoot", "sprint", "press"];
    for (const b of st.touch.btn) if (!HELD.includes(b)) edges.add(b);
    st.touch.btn = new Set([...st.touch.btn].filter(b => HELD.includes(b)));
    return { fwd, right, shoot, edges, sprint: held("sprint") || !!P?.sprint || st.touch.btn.has("sprint"), board: held("board") || !!P?.board,
      press: held("press") || !!P?.press || st.touch.btn.has("press"), passHeld: held("pass") || !!P?.pass || st.mouseR };
  }

  // vibration de la manette (si le navigateur et la manette le permettent)
  function rumble(strong = 0.5, weak = 0.3, ms = 120) {
    if (!cfg.vibration || !st.usingPad) return;
    const pad = currentPad(); const act = pad?.vibrationActuator;
    try {
      if (act?.playEffect) act.playEffect(act.type === "trigger-rumble" ? "trigger-rumble" : "dual-rumble", { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch?.(() => {});
      else pad?.hapticActuators?.[0]?.pulse?.(strong, ms);
    } catch { /* non pris en charge */ }
  }

  return {
    state: st, read, rumble,
    get bindings() { return cfg; },
    setSensitivity: (s, inv) => { st.sens = s; st.invertY = inv; },
    setControls: c => { cfg = resolveBindings(c); down.clear(); },
    lock: () => { if (cfg.mouseCamera) canvas.requestPointerLock?.()?.catch?.(() => {}); canvas.focus?.(); },
    unlock: () => document.exitPointerLock?.(),
    touch: st.touch,
    dispose() {
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", blur);
      document.removeEventListener("mousemove", onMouseMove); canvas.removeEventListener("mousedown", onMouseDown); window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      document.removeEventListener("pointerlockchange", onLock); canvas.removeEventListener("contextmenu", noCtx);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
  };
}
