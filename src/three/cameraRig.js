// Caméras de la vue 3D.
//  - joueur (Arène) : proche, éloignée, télé ;
//  - spectateur (match Manager en 3D, spectateurs) : réalisateur automatique, latérale (télé), tribune haute,
//    derrière le but (frontale), ballon, joueur suivi, caméra libre (glisser : orbite, clic droit / Maj : déplacement,
//    molette : distance, flèches / ZQSD : déplacement).
import * as THREE from "three";
import { FIELD } from "../../shared/action/sim.js";

export const PLAYER_CAMS = ["near", "far", "broadcast"];
export const SPEC_CAMS = ["auto", "tv", "tactical", "goal", "ball", "player", "free"];
const FOV = { near: 62, far: 60, broadcast: 44, tv: 38, tactical: 46, goal: 52, ball: 62, player: 58, free: 55, replay: 50 };

export function createCameraRig(camera, canvas, { interactive = true, mode } = {}) {
  const list = interactive ? PLAYER_CAMS : SPEC_CAMS;
  let cur = list.includes(mode) ? mode : list[0];
  let follow = -1;           // joueur suivi par la caméra « joueur » (-1 : porteur du ballon)
  let shakeAmt = 0, cut = true, shakeOn = true;
  let specZoom = 0; // plans spectateur : -1 (éloigné) … +1 (proche)
  const pos = new THREE.Vector3(12, 10, 0), look = new THREE.Vector3(), dPos = new THREE.Vector3(), dLook = new THREE.Vector3();
  const chaseDir = new THREE.Vector2(1, 0);
  // réalisateur : plan courant, fin minimale, cible
  const dir = { shot: "tv", until: 0, focus: -1, lastVariety: 0 };
  // caméra libre
  const free = { target: new THREE.Vector3(0, 0, 0), yaw: Math.PI / 2, pitch: 0.62, dist: 34, drag: null, keys: new Set() };
  const now = () => performance.now() / 1000;

  // ── caméra libre : souris / tactile / clavier ──
  const onDown = e => {
    if (cur !== "free") return;
    free.drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey || e.pointerType === "touch" && e.isPrimary === false };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = e => {
    if (cur !== "free" || !free.drag) return;
    const dx = e.clientX - free.drag.x, dy = e.clientY - free.drag.y; free.drag.x = e.clientX; free.drag.y = e.clientY;
    if (free.drag.pan) {
      const s = free.dist * 0.0022; const c = Math.cos(free.yaw), sn = Math.sin(free.yaw);
      // saisir le sol : glisser vers la droite déplace la vue vers la gauche, vers le bas l'avance
      free.target.x += (-c * dy - sn * dx) * s; free.target.z += (-sn * dy + c * dx) * s;
      clampTarget();
    } else { free.yaw -= dx * 0.006; free.pitch = Math.max(0.08, Math.min(1.45, free.pitch + dy * 0.005)); }
  };
  const onUp = () => { free.drag = null; };
  const onWheel = e => {
    if (cur === "free") { e.preventDefault(); free.dist = Math.max(4, Math.min(70, free.dist * (1 + Math.sign(e.deltaY) * 0.1))); return; }
    if (!interactive) { e.preventDefault(); specZoom = Math.max(-1, Math.min(1, specZoom - Math.sign(e.deltaY) * 0.2)); }
  };
  const onKey = isDown => e => { if (cur !== "free" || interactive) return; if (e.target?.tagName === "INPUT" || e.target?.tagName === "SELECT") return; if (isDown) free.keys.add(e.code); else free.keys.delete(e.code); };
  const kd = onKey(true), ku = onKey(false);
  const noCtx = e => { if (cur === "free") e.preventDefault(); };
  canvas.addEventListener("pointerdown", onDown); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false }); canvas.addEventListener("contextmenu", noCtx);
  window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
  function clampTarget() { free.target.x = Math.max(-FIELD.HX - 10, Math.min(FIELD.HX + 10, free.target.x)); free.target.z = Math.max(-FIELD.HZ - 8, Math.min(FIELD.HZ + 8, free.target.z)); }

  // Caméras qui suivent un joueur : la caméra reste à l'intérieur de la cage de verre. Près d'un but ou d'une
  // paroi, la perche (joueur → caméra) se raccourcit et la caméra monte d'autant : ni vitre, ni filet, ni
  // tribune entre la caméra et l'action (TD-004).
  const IN_X = FIELD.HX - 0.7, IN_Z = FIELD.HZ - 0.7;
  function keepInside(ax, az, lift = 0.45) {
    const dx = dPos.x - ax, dz = dPos.z - az; let k = 1;
    // raccourcir la perche seulement si elle sort de la cage alors que le joueur est à l'intérieur de la marge
    if (Math.abs(dPos.x) > IN_X && Math.abs(ax) < IN_X && dx) k = Math.min(k, (Math.sign(dx) * IN_X - ax) / dx);
    if (Math.abs(dPos.z) > IN_Z && Math.abs(az) < IN_Z && dz) k = Math.min(k, (Math.sign(dz) * IN_Z - az) / dz);
    k = Math.max(0, Math.min(1, k));
    const pulled = Math.hypot(dx, dz) * (1 - k);
    dPos.x = ax + dx * k; dPos.z = az + dz * k;
    // joueur collé à une paroi ou dans son but : simple translation vers l'intérieur
    dPos.x = Math.max(-IN_X, Math.min(IN_X, dPos.x)); dPos.z = Math.max(-IN_Z, Math.min(IN_Z, dPos.z));
    if (pulled > 0) {
      dPos.y += pulled * lift;
      // caméra plus haute et plus proche : on vise plus près du joueur pour qu'il reste au centre (pas sous le HUD)
      const w = Math.min(0.7, pulled * 0.09); dLook.x += (ax - dLook.x) * w; dLook.z += (az - dLook.z) * w;
    }
    return pulled;
  }

  function avatarOf(ctx, slot) { return slot >= 0 ? ctx.avatars?.[slot]?.group || null : null; }
  function forwardOf(g) { const r = g.rotation.y; return { x: Math.sin(r), z: Math.cos(r) }; } // les avatars regardent leur +Z local

  // plan souhaité pour un mode donné → dPos, dLook ; renvoie la vitesse de lissage
  function shot(m, ctx) {
    const B = ctx.ball || new THREE.Vector3(); const bx = B.x, bz = B.z;
    switch (m) {
      case "near": case "far": {
        const me = ctx.me; if (!me) return shot("broadcast", ctx);
        const far = m === "far"; const zoom = 1 + (ctx.zoom || 0) * 0.6;
        const dist = (far ? 10 : 5.8) * zoom, h = ((far ? 4.2 : 2.2) + ctx.pitch * (far ? 7 : 5)) * Math.sqrt(zoom);
        dPos.set(me.position.x - Math.cos(ctx.yaw) * dist, h, me.position.z - Math.sin(ctx.yaw) * dist);
        dLook.set(me.position.x + Math.cos(ctx.yaw) * 4, 1.1, me.position.z + Math.sin(ctx.yaw) * 4);
        keepInside(me.position.x, me.position.z);
        // le long d'une paroi latérale : caméra légèrement rentrée vers le terrain (moins de vitre et de tribune à l'écran)
        const SZ = FIELD.HZ - 2.5; if (Math.abs(dPos.z) > SZ) dPos.z = Math.sign(dPos.z) * (SZ + (Math.abs(dPos.z) - SZ) * 0.4);
        return 12;
      }
      case "broadcast": dPos.set(bx * 0.8, 17, 24); dLook.set(bx * 0.9, 0, bz * 0.3); return 3;
      case "tv": dPos.set(bx * 0.72, 12.5, 27); dLook.set(bx * 0.88, 0.4, bz * 0.22); return 2.6;
      case "tactical": dPos.set(bx * 0.35, 36, 21); dLook.set(bx * 0.45, 0, 0); return 2;
      case "goal": {
        const side = Math.sign(bx) || 1; // derrière le but le plus proche du ballon, face au jeu
        dPos.set(side * (FIELD.HX + 8.5), 5.2, bz * 0.25); dLook.set(bx * 0.55 + side * 4, 0.9, bz * 0.5);
        return 3.2;
      }
      case "ball": {
        const v = ctx.ballVel; if (v && Math.hypot(v.x, v.z) > 1.2) { chaseDir.set(v.x, v.z).normalize(); }
        dPos.set(bx - chaseDir.x * 7.5, Math.max(2.6, B.y + 2.4), bz - chaseDir.y * 7.5);
        dLook.set(bx + chaseDir.x * 5, Math.max(0.5, B.y * 0.6), bz + chaseDir.y * 5);
        keepInside(bx, bz);
        return 4.5;
      }
      case "player": {
        const slot = follow >= 0 ? follow : ctx.owner >= 0 ? ctx.owner : dir.focus;
        const g = avatarOf(ctx, slot); if (!g) return shot("tv", ctx);
        const f = forwardOf(g); const p = g.position;
        dPos.set(p.x - f.x * 5.4, 2.7, p.z - f.z * 5.4); dLook.set(p.x + f.x * 3.5, 1.2, p.z + f.z * 3.5);
        keepInside(p.x, p.z);
        return 5;
      }
      case "celebrate": { // plan serré de face sur le buteur
        const g = avatarOf(ctx, dir.focus); if (!g) return shot("goal", ctx);
        const p = g.position; const f = forwardOf(g);
        dPos.set(p.x + f.x * 3.6, 1.9, p.z + f.z * 3.6 + 0.8); dLook.set(p.x, 1.25, p.z);
        keepInside(p.x, p.z);
        return 4;
      }
      case "free": {
        const t = free.target; const c = Math.cos(free.pitch);
        dPos.set(t.x + Math.cos(free.yaw) * c * free.dist, t.y + Math.sin(free.pitch) * free.dist, t.z + Math.sin(free.yaw) * c * free.dist);
        dLook.copy(t);
        return 10;
      }
      default: return shot("tv", ctx);
    }
  }

  // réalisateur automatique : télé par défaut, but pour les occasions, ballon / joueur pour varier, buteur après un but
  function director(ctx) {
    const t = now(); const B = ctx.ball || new THREE.Vector3();
    if (t < dir.until) return dir.shot;
    let next = "tv";
    const nearGoal = Math.abs(B.x) > FIELD.HX - 11 && ctx.phase === "play";
    if (ctx.phase === "goal") next = "tv";
    else if (nearGoal) next = "goal";
    else if (t - dir.lastVariety > 14 && ctx.owner >= 0 && ctx.phase === "play") { next = Math.random() < 0.5 ? "ball" : "player"; dir.lastVariety = t; }
    if (next !== dir.shot) { dir.shot = next; cut = true; }
    dir.until = t + (next === "goal" ? 2.6 : next === "tv" ? 1.5 : 4);
    return dir.shot;
  }

  function update(dt, ctx) {
    // caméra libre au clavier (spectateur)
    if (cur === "free" && free.keys.size) {
      const s = free.dist * 0.9 * dt; const c = Math.cos(free.yaw), sn = Math.sin(free.yaw);
      const k = code => free.keys.has(code);
      const f = (k("ArrowUp") || k("KeyW") ? 1 : 0) - (k("ArrowDown") || k("KeyS") ? 1 : 0), r = (k("ArrowRight") || k("KeyD") ? 1 : 0) - (k("ArrowLeft") || k("KeyA") ? 1 : 0);
      free.target.x += (-c * f + sn * r) * s; free.target.z += (-sn * f - c * r) * s; clampTarget();
      if (k("KeyQ") || k("PageUp")) free.yaw += dt * 1.2; if (k("KeyE") || k("PageDown")) free.yaw -= dt * 1.2;
    }
    let speed, fov;
    if (ctx.replay) {
      // ralenti : caméra cinéma basse, près du but, qui suit le ballon en travelling
      const side = Math.sign(ctx.replay.gx); const t = ctx.replay.t; const B = ctx.ball;
      dPos.set(ctx.replay.gx - side * (9 - t * 0.6), 2.6 + t * 0.25, 7 + Math.sin(t * 0.5) * 3); dLook.set(B.x, Math.max(0.6, B.y), B.z);
      speed = 6; fov = FOV.replay;
    } else {
      let m = cur;
      if (m === "auto") { m = director(ctx); if (dir.celebrateUntil > now()) m = "celebrate"; }
      speed = shot(m, ctx); fov = FOV[m] || 55;
      // proche / éloignée : on rapproche ou recule la caméra de son point de visée
      if (!interactive && m !== "free" && specZoom) { const k = 1 - specZoom * 0.5; dPos.sub(dLook).multiplyScalar(k).add(dLook); if (dPos.y < 1.2) dPos.y = 1.2; }
    }
    if (cut) { pos.copy(dPos); look.copy(dLook); cut = false; }
    else { const k = 1 - Math.exp(-dt * speed); pos.lerp(dPos, k); look.lerp(dLook, 1 - Math.exp(-dt * Math.max(speed, 6))); }
    camera.position.copy(pos); camera.lookAt(look);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 4)); camera.updateProjectionMatrix(); }
    if (shakeAmt > 0.001) { camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt; shakeAmt *= Math.exp(-dt * 7); }
  }

  return {
    get mode() { return cur; }, get follow() { return follow; }, list,
    update,
    setMode(m) { if (!list.includes(m) || m === cur) return; if (m === "free") { free.target.set(look.x, 0, look.z); const d = pos.clone().sub(look); free.dist = Math.max(6, d.length()); free.yaw = Math.atan2(d.z, d.x); free.pitch = Math.max(0.1, Math.asin(Math.min(1, d.y / free.dist))); } cur = m; },
    cycle() { this.setMode(list[(list.indexOf(cur) + 1) % list.length]); },
    get zoom() { return specZoom; },
    setZoom(z) { specZoom = Math.max(-1, Math.min(1, z)); },
    setFollow(slot) { follow = Number.isInteger(slot) ? slot : -1; if (follow >= 0 && !interactive && cur !== "player") cur = "player"; },
    shake(v) { if (shakeOn) shakeAmt = Math.max(shakeAmt, v); },
    setShake(on) { shakeOn = !!on; if (!on) shakeAmt = 0; },
    onGoal(slot) { if (cur === "auto" && slot >= 0) { dir.focus = slot; dir.celebrateUntil = now() + 3.2; dir.until = now() + 3.2; cut = true; } },
    onShot() { /* le réalisateur reste sur son plan : pas de coupe pendant une frappe */ if (cur === "auto") dir.until = Math.max(dir.until, now() + 1.2); },
    dispose() {
      canvas.removeEventListener("pointerdown", onDown); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel); canvas.removeEventListener("contextmenu", noCtx);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
    },
  };
}
