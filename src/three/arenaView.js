// Vue 3D de l'Arène : rendu Three.js, interpolation des instantanés serveur, prédiction du joueur local,
// caméra à la 3e personne, effets et sons. Envoie les entrées du joueur via onInput.
import * as THREE from "three";
import { createStadium, createAvatar, createBall, createEffects } from "./visual/index.js";
import { createSfx } from "../audio/sfx.js";
import { createInput } from "./input.js";
import { createPuVisuals } from "./puVisuals.js";
import { getPlayer } from "../../shared/data/content.js";
import { FIELD, statOf, stepMovement } from "../../shared/action/sim.js";
import { BTN } from "../../shared/rooms/arenaRoom.js";

const INTERP_DELAY = 0.1; // s
// ralenti des buts : 2,8 s avant le but jusqu'à 0,3 s après, à 65 % de la vitesse, 0,9 s après le but
const REPLAY = { before: 2.8, after: 0.3, speed: 0.65, delay: 0.9 };
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export function createArenaView(container, options) {
  let { slots, teams, mySlot, settings, onInput, onEvent, onHud, interactive = true } = options;
  const quality = settings.quality || "high";
  const renderer = new THREE.WebGLRenderer({ antialias: quality !== "low", powerPreference: "high-performance" });
  const maxRatio = Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : quality === "medium" ? 1.5 : 1);
  let ratio = maxRatio; renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = quality === "high"; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement; canvas.tabIndex = 0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  const stadium = createStadium(scene, { quality, homeColor: teams[0].color, awayColor: teams[1].color });
  const effects = createEffects(scene, { quality });
  const ball = createBall({ quality }); scene.add(ball.mesh); scene.add(ball.trail);
  const sfx = createSfx(); sfx.setVolume(settings.volume ?? 0.7);
  const puVisuals = createPuVisuals(scene, effects);
  const passRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  passRing.rotation.x = -Math.PI / 2; passRing.position.y = 0.03; passRing.visible = false; scene.add(passRing);
  const input = interactive ? createInput(canvas, { sensitivity: settings.sensitivity, invertY: settings.invertY }) : spectatorInput();

  // étiquette « pseudo » au-dessus des joueurs humains (utile en ligne)
  function tagSprite(text, color) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 48; const g = c.getContext("2d");
    g.fillStyle = "rgba(5,8,20,.8)"; g.beginPath(); g.roundRect?.(2, 4, 252, 40, 12); g.fill?.(); if (!g.roundRect) g.fillRect(2, 4, 252, 40);
    g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(4, 6, 248, 36);
    g.fillStyle = "#fff"; g.font = "700 24px Rajdhani, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text.slice(0, 18), 128, 25);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(1.6, 0.3, 1); sp.renderOrder = 10; return sp;
  }

  // avatars
  let avatars = [];
  function buildAvatars(sl) {
    for (const a of avatars) { scene.remove(a.group); if (a.tag) { a.tag.material.map.dispose(); a.tag.material.dispose(); } a.dispose(); }
    avatars = sl.map(s => {
      const p = getPlayer(s.charId);
      const team = teams[s.team];
      const a = createAvatar(p, { teamColor: team.color, teamColor2: "#10131f", isKeeper: s.slot % 5 === 0, quality });
      a.slot = s.slot; a.charId = s.charId; a.team = s.team;
      if (s.human && s.pseudo && s.slot !== mySlot) { a.tag = tagSprite("👤 " + s.pseudo, team.color); a.tag.position.y = (p.taille || 1.8) + 0.78; a.group.add(a.tag); }
      scene.add(a.group);
      return a;
    });
    avatars[mySlot]?.setHighlight(true);
  }
  buildAvatars(slots);

  // caméra initiale : derrière son joueur, face au but adverse
  const myTeam = mySlot != null ? slots[mySlot].team : 0;
  input.state.yaw = myTeam === 0 ? 0 : Math.PI;
  let camMode = interactive ? settings.camera || "near" : "broadcast";

  // ── Instantanés ────────────────────────────────────────
  const buffer = []; let lastRecvLocal = 0, lastSnapT = 0, latest = null;
  const pred = { x: 0, z: 0, vx: 0, vz: 0, facing: 0, stamina: 100, ok: false };
  const seen = new Set();

  let replay = null, shake = 0; // tremblement de caméra (tirs puissants, buts) // { start, end, beginAt (horloge locale), team }
  function pushSnapshot(snap, events) {
    buffer.push(snap); while (buffer.length > 2 && buffer[0].t < snap.t - 8) buffer.shift();
    latest = snap; lastRecvLocal = performance.now() / 1000; lastSnapT = snap.t;
    for (const ev of events || []) handleEvent(ev);
  }

  function handleEvent(ev) {
    if (seen.has(ev.id + ":" + ev.type + ":" + ev.t)) return; seen.add(ev.id + ":" + ev.type + ":" + ev.t);
    const P = latest?.p?.[ev.slot];
    const pos = P ? new THREE.Vector3(P[0], 0.2, P[1]) : new THREE.Vector3(latest?.b[0] || 0, 0.2, latest?.b[2] || 0);
    const color = ev.slot >= 0 ? getPlayer(slots[ev.slot]?.charId)?.color || "#fff" : "#fff";
    switch (ev.type) {
      case "GOAL": {
        shake = 0.35; const gx = ev.team === 0 ? FIELD.HX : -FIELD.HX; effects.goalExplosion(new THREE.Vector3(gx, 1.1, 0), teams[ev.team].color); stadium.flash(teams[ev.team].color); sfx.goal();
        if (options.replays !== false) replay = { start: ev.t - REPLAY.before, end: ev.t + REPLAY.after, beginAt: performance.now() / 1000 + REPLAY.delay, team: ev.team, gx };
        break;
      }
      case "SHOT": effects.kickSpark(pos, "#ffffff"); sfx.kick(Math.min(1, (ev.power || 20) / 30)); if (ev.power > 24) shake = Math.max(shake, 0.12); break;
      case "SAVE": effects.ring(pos, "#00F0FF", { radius: 2, duration: 0.6 }); sfx.save(); break;
      case "TACKLE": effects.burst(pos, "#8B5CF6", { count: 18, speed: 3 }); sfx.tackle(); break;
      case "POWERUP": effects.ring(pos, color, { radius: 4, duration: 0.9 }); effects.burst(pos, color, { count: 40, speed: 5, up: 3 }); sfx.powerUp(); break;
      case "FIREWALL": effects.ring(pos, "#39FF14", { radius: 3.2, duration: 0.7 }); sfx.tackle(); break;
      case "POST": sfx.bounce(1); effects.kickSpark(new THREE.Vector3(latest.b[0], latest.b[1], latest.b[2]), "#ffffff"); break;
      case "BOUNCE": sfx.bounce(Math.min(1, (ev.v || 3) / 10)); break;
      case "FOUL": sfx.whistle("foul"); break;
      case "HALFTIME": case "END": sfx.whistle("end"); break;
      case "SECOND_HALF": sfx.whistle("start"); break;
      case "INTERCEPT": sfx.pass(); break;
      case "CALL": effects.ring(pos, "#FFD700", { radius: 1.4, duration: 0.5 }); break;
      case "SKILL": effects.burst(pos, color, { count: 14, speed: 2.5, up: 0.5 }); sfx.pass(); break;
    }
    onEvent?.(ev);
  }

  // état interpolé au temps de rendu (ou au temps du ralenti)
  function sample(rtOverride) {
    if (!buffer.length) return null;
    const now = performance.now() / 1000;
    const rt = rtOverride ?? lastSnapT + (now - lastRecvLocal) - INTERP_DELAY;
    let a = buffer[0], b = buffer[buffer.length - 1];
    for (let i = buffer.length - 1; i > 0; i--) if (buffer[i - 1].t <= rt) { a = buffer[i - 1]; b = buffer[i]; break; }
    const k = b.t > a.t ? Math.max(0, Math.min(1.2, (rt - a.t) / (b.t - a.t))) : 1;
    return { a, b, k };
  }

  // ── Boucle ──────────────────────────────────────────────
  let raf = 0, last = performance.now(), alive = true, inputAcc = 0, hudAcc = 0, lastInputSent = null, ph = null, fpsAcc = 0, fpsN = 0, lastFps = 60;
  const tmpV = new THREE.Vector3(), camPos = new THREE.Vector3(12, 10, 0), camLook = new THREE.Vector3();
  let menuOpen = false, boardOpen = false;

  function frame(nowMs) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    // pas de temps borné : l'horodatage de la première image peut précéder la création de la vue (dt < 0)
    const dt = Math.max(0, Math.min(0.05, (nowMs - last) / 1000)); last = Math.max(last, nowMs);
    // ralenti en cours ?
    const nowS = nowMs / 1000; let replayRt = null;
    if (replay && nowS >= replay.beginAt) {
      replayRt = replay.start + (nowS - replay.beginAt) * REPLAY.speed;
      if (replayRt > replay.end || (latest && latest.ph !== "goal")) { replay = null; replayRt = null; }
    }
    const S = sample(replayRt ?? undefined);
    const inp = input.read(dt);
    if (replayRt != null && (inp.edges.has("pass") || inp.shoot || inp.edges.has("menu"))) { replay = null; replayRt = null; } // passer le ralenti
    if (inp.edges.has("cam")) camMode = camMode === "near" ? "far" : camMode === "far" ? "broadcast" : "near";
    if (inp.edges.has("menu")) { menuOpen = !menuOpen; if (menuOpen) input.unlock(); }
    boardOpen = inp.board;
    const yaw = input.state.yaw;
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    // intention → monde (avant = direction caméra, droite = perpendiculaire)
    let mx = inp.fwd * dx + inp.right * -dz, mz = inp.fwd * dz + inp.right * dx;
    const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
    if (menuOpen) { mx = 0; mz = 0; }

    if (S) {
      const { a, b, k } = S; ph = b.ph;
      // ballon
      const B = a.b.map((v, i) => (i < 6 ? lerp(v, b.b[i], k) : b.b[i]));
      // joueurs
      for (let i = 0; i < avatars.length; i++) {
        const av = avatars[i]; const pa = a.p[i], pb = b.p[i]; if (!pa || !pb) continue;
        let x = lerp(pa[0], pb[0], k), z = lerp(pa[1], pb[1], k), face = lerpAngle(pa[4], pb[4], k);
        const vx = pb[2], vz = pb[3];
        if (i === mySlot && latest && replayRt == null) {
          // prédiction locale : on intègre ses propres entrées, recalées doucement sur le serveur
          const L = latest.p[i];
          if (!pred.ok) Object.assign(pred, { x: L[0], z: L[1], vx: L[2], vz: L[3], facing: L[4], ok: true });
          predictStep(pred, i, mx, mz, inp.sprint, dt, L);
          // la position serveur a « lag » secondes de retard : on l'extrapole avant de corriger la dérive
          const lag = Math.min(0.35, (options.getRtt?.() || 0) + (performance.now() / 1000 - lastRecvLocal));
          const ex = L[0] + L[2] * lag - pred.x, ez = L[1] + L[3] * lag - pred.z;
          if (Math.hypot(ex, ez) > 3) { pred.x = L[0]; pred.z = L[1]; } else { const g = Math.min(1, dt * 4); pred.x += ex * g; pred.z += ez * g; }
          x = pred.x; z = pred.z; face = pred.facing;
          if (b.b[6] === i) { B[0] = x + Math.cos(face) * 0.5; B[2] = z + Math.sin(face) * 0.5; B[1] = latest.b[1]; }
        }
        av.group.position.set(x, 0, z);
        av.group.rotation.y = Math.atan2(Math.cos(face), Math.sin(face));
        const flags = pb[6]; const speed = Math.hypot(vx, vz);
        let action = speed > 0.4 ? (flags & 1 ? "sprint" : "run") : "idle";
        if (pb[8] === "kick" || pb[8] === "pass") action = pb[8];
        if (pb[8] === "tackle" || pb[8] === "poke") action = "tackle";
        if (flags & 4) action = "dive"; else if (flags & 2) action = "stunned";
        if (b.ph === "goal" && isScorerTeam(i)) action = "celebrate";
        const localDive = Math.sign(-Math.sin(av.group.rotation.y) * (pb[10] || 1)) || 1;
        av.setState({ speed, action, actionT: 0.5, diveDir: localDive }, dt);
        av.setPowerUp(!!(flags & 8), getPlayer(av.charId)?.color || "#fff");
      }
      ball.update({ x: B[0], y: B[1], z: B[2] }, { x: B[3], y: B[4], z: B[5] }, dt);
      const puGlow = puVisuals.update(avatars, i => b.p[i]?.[6] || 0, i => getPlayer(slots[i]?.charId)?.powerUp?.arena?.effect, dt, nowMs / 1000, b.b[6]);
      ball.setGlow(b.p[mySlot]?.[6] & 16 ? "#FFD700" : puGlow);
    }

    // entrées → serveur (30 Hz)
    inputAcc += dt;
    if (mySlot != null && inputAcc >= 1 / 30) {
      inputAcc = 0;
      let bits = 0;
      if (inp.sprint) bits |= BTN.sprint;
      if (inp.shoot && !menuOpen) bits |= BTN.shoot;
      if (inp.edges.has("pass")) { bits |= BTN.pass; if (latest && latest.b[6] === mySlot) onEvent?.({ type: "MY_PASS", slot: mySlot, local: true }); }
      if (inp.edges.has("lob")) bits |= BTN.lob;
      if (inp.edges.has("tackle")) bits |= BTN.tackle;
      if (inp.edges.has("pu")) bits |= BTN.pu;
      if (inp.edges.has("call")) bits |= BTN.call;
      if (inp.edges.has("skill")) { bits |= BTN.skill; if (latest && latest.b[6] === mySlot && pred.ok) { const side = (inp.right || 0) >= 0 ? 1 : -1; const perp = pred.facing + side * Math.PI / 2; pred.vx += Math.cos(perp) * 5; pred.vz += Math.sin(perp) * 5; } }
      for (let k = 1; k <= 5; k++) if (inp.edges.has("emote" + k)) onEvent?.({ type: "EMOTE_KEY", n: k, local: true });
      if (input.state.locked || input.state.usingPad) bits |= BTN.aimFace;
      const aim = input.state.locked || input.state.usingPad ? yaw : (Math.hypot(mx, mz) > 0.1 ? Math.atan2(mz, mx) : yaw);
      const msg = { mx: +mx.toFixed(3), mz: +mz.toFixed(3), aim: +aim.toFixed(3), b: bits };
      const key = JSON.stringify(msg);
      if (key !== lastInputSent || bits) { onInput(msg); lastInputSent = key; }
    } else if (mySlot != null) {
      // conserver les fronts de bouton jusqu'à l'envoi suivant
      for (const e of inp.edges) if (e === "pass" || e === "lob" || e === "tackle" || e === "pu" || e === "call" || e === "skill") input.state.edges.add(e);
    }

    // indicateur de passe : le coéquipier le mieux aligné avec la visée quand on a le ballon
    passRing.visible = false;
    if (S && mySlot != null && latest && latest.b[6] === mySlot) {
      const me = avatars[mySlot].group.position; const aimYaw = input.state.locked || input.state.usingPad ? yaw : (Math.hypot(mx, mz) > 0.1 ? Math.atan2(mz, mx) : yaw);
      let best = null;
      for (const av of avatars) {
        if (av.slot === mySlot || av.team !== slots[mySlot].team) continue;
        const q = av.group.position; const dx = q.x - me.x, dz = q.z - me.z, d = Math.hypot(dx, dz); if (d < 1.5) continue;
        const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dz, dx) - aimYaw), Math.cos(Math.atan2(dz, dx) - aimYaw)));
        if (ang > 1.0) continue; const sc = ang * 3 + d * 0.04; if (!best || sc < best.sc) best = { q, sc };
      }
      if (best) { passRing.visible = true; passRing.position.x = best.q.x; passRing.position.z = best.q.z; passRing.scale.setScalar(1 + Math.sin(nowMs / 150) * 0.08); }
    }
    updateCamera(dt, replayRt != null ? S : null);
    stadium.update(dt, nowMs / 1000);
    effects.update(dt);
    if (latest) sfx.crowd(0.3 + Math.min(0.5, Math.abs(latest.b[0]) / 40));
    renderer.render(scene, camera);

    // résolution dynamique : on vise ~55 images/s
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 2) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      const next = fps < 42 ? Math.max(0.6, ratio - 0.2) : fps > 57 ? Math.min(maxRatio, ratio + 0.1) : ratio;
      if (Math.abs(next - ratio) > 0.01) { ratio = next; renderer.setPixelRatio(ratio); resize(); }
      lastFps = Math.round(fps);
    }
    hudAcc += dt;
    if (hudAcc > 0.1 && latest) { hudAcc = 0; onHud?.(hudState()); }
  }

  let lastGoalTeam = -1;
  const isScorerTeam = i => lastGoalTeam === slots[i].team;

  function predictStep(p, i, mx, mz, sprint, dt, L) {
    const char = getPlayer(slots[i].charId);
    const fakeP = { char, stamina: L[5], puUntil: L[6] & 8 ? 1e9 : 0, fx: () => (L[6] & 8 ? char.powerUp.arena.effect : null), boostUntil: 0, stunUntil: L[6] & 2 ? 1e9 : 0, diveUntil: L[6] & 4 ? 1e9 : 0, team: slots[i].team, x: p.x, z: p.z, vx: p.vx, vz: p.vz, facing: p.facing, slot: i };
    const fakeSim = { time: 0, auras: [], slows: [], ball: { owner: latest.b[6] } };
    stepMovement(fakeP, { mx, mz, sprint, aim: input.state.yaw, aimFace: input.state.locked }, fakeSim, dt);
    p.x = fakeP.x; p.z = fakeP.z; p.vx = fakeP.vx; p.vz = fakeP.vz; p.facing = fakeP.facing;
  }

  function updateCamera(dt, replayS) {
    if (replayS && replay) {
      // caméra cinéma : basse, près du but, qui suit le ballon en travelling
      const B = replayS.b.b; const side = Math.sign(replay.gx);
      const t = (performance.now() / 1000 - replay.beginAt);
      const desired = new THREE.Vector3(replay.gx - side * (9 - t * 0.6), 2.6 + t * 0.25, 7 + Math.sin(t * 0.5) * 3);
      const look = new THREE.Vector3(B[0], Math.max(0.6, B[1]), B[2]);
      const k = 1 - Math.exp(-dt * 6); camPos.lerp(desired, k); camLook.lerp(look, 1 - Math.exp(-dt * 10));
      camera.position.copy(camPos); camera.lookAt(camLook); return;
    }
    const yaw = input.state.yaw, pitch = input.state.pitch;
    const me = mySlot != null ? avatars[mySlot]?.group.position : null;
    const target = me || (latest ? tmpV.set(latest.b[0], 0, latest.b[2]) : tmpV.set(0, 0, 0));
    let desired, look;
    if (camMode === "broadcast" || !me) {
      const bx = latest ? latest.b[0] : 0;
      desired = new THREE.Vector3(bx * 0.8, 17, 24);
      look = new THREE.Vector3(bx * 0.9, 0, latest ? latest.b[2] * 0.3 : 0);
    } else {
      const dist = camMode === "far" ? 10 : 5.8, h = (camMode === "far" ? 4.2 : 2.2) + pitch * (camMode === "far" ? 7 : 5);
      desired = new THREE.Vector3(target.x - Math.cos(yaw) * dist, h, target.z - Math.sin(yaw) * dist);
      look = new THREE.Vector3(target.x + Math.cos(yaw) * 4, 1.1, target.z + Math.sin(yaw) * 4);
    }
    const k = 1 - Math.exp(-dt * (camMode === "broadcast" ? 3 : 12));
    camPos.lerp(desired, k); camLook.lerp(look, k);
    camera.position.copy(camPos); camera.lookAt(camLook);
    if (shake > 0.001) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake *= Math.exp(-dt * 7); }
  }

  function hudState() {
    const L = latest; const me = mySlot != null ? L.p[mySlot] : null;
    return {
      score: L.s, clock: L.c, half: L.h, phase: L.ph,
      me: me && { stamina: me[5], charging: !!(me[6] & 16), charge: me[7], puActive: !!(me[6] & 8), puCd: me[9], hasBall: L.b[6] === mySlot },
      fps: lastFps, replay: !!replay && performance.now() / 1000 >= replay.beginAt, locked: input.state.locked, menu: menuOpen, board: boardOpen, cam: camMode, usingPad: input.state.usingPad,
      players: L.p.map(p => ({ stamina: p[5], flags: p[6], x: p[0], z: p[1] })), ball: [L.b[0], L.b[2]],
    };
  }

  function resize() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  if (typeof window !== "undefined") window.__ll3d = { camera, scene, renderer, get latest() { return latest; }, get camMode() { return camMode; } }; // inspection (diagnostic)
  raf = requestAnimationFrame(frame);

  return {
    pushSnapshot: (snap, events) => {
      for (const ev of events || []) if (ev.type === "GOAL") lastGoalTeam = ev.team; else if (ev.type === "KICKOFF" || ev.type === "SECOND_HALF") lastGoalTeam = -1;
      if (snap.ph === "play") lastGoalTeam = -1;
      pushSnapshot(snap, events);
    },
    setSlots(sl) { const changed = sl.some((s, i) => s.charId !== slots[i]?.charId || !!s.human !== !!slots[i]?.human || s.pseudo !== slots[i]?.pseudo); slots = sl; if (changed) buildAvatars(sl); },
    setMenu(v) { menuOpen = v; if (!v) input.lock(); },
    setCam(v) { camMode = v; },
    setSettings(s) { sfx.setVolume(s.volume ?? 0.7); input.setSensitivity(s.sensitivity, s.invertY); },
    unlockAudio: () => sfx.unlock(),
    touch: input.touch,
    lock: () => input.lock(),
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); input.dispose();
      for (const a of avatars) a.dispose(); ball.dispose?.(); passRing.geometry.dispose(); passRing.material.dispose(); effects.dispose(); puVisuals.dispose(); stadium.dispose(); sfx.dispose();
      renderer.dispose(); canvas.remove();
    },
  };
}

// entrées neutres pour une vue spectateur (match Manager en 3D)
function spectatorInput() {
  const touch = { mx: 0, mz: 0, btn: new Set() };
  return { state: { yaw: 0, pitch: 0.3, edges: new Set(), locked: false, usingPad: false, touch }, touch, read: () => ({ fwd: 0, right: 0, sprint: false, shoot: false, edges: new Set(), board: false }), setSensitivity() {}, lock() {}, unlock() {}, dispose() {} };
}

export { statOf };
