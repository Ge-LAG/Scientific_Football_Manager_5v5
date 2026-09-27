// Vue 3D de l'Arène : rendu Three.js, interpolation des instantanés serveur, prédiction du joueur local,
// caméras (3e personne, télé, tribune, but, ballon, joueur, libre, réalisateur automatique), effets et sons.
// Envoie les entrées du joueur via onInput et les demandes de changement de joueur via onSwitch.
import * as THREE from "three";
import { createStadium, createAvatar, createBall, createEffects } from "./visual/index.js";
import { createSfx } from "../audio/sfx.js";
import { createInput } from "./input.js";
import { controlsOf } from "./controls.js";
import { createPuVisuals } from "./puVisuals.js";
import { createCameraRig } from "./cameraRig.js";
import { createPipeline } from "./render/pipeline.js";
import { createQualityManager, detectInitialQuality, normLevel } from "./render/quality.js";
import { createPerfOverlay } from "./render/perfOverlay.js";
import { getPlayer, getPowerUp, defaultLoadout } from "../../shared/data/content.js";
import { FIELD, statOf, stepMovement } from "../../shared/action/sim.js";
import { BTN } from "../../shared/rooms/arenaRoom.js";

const INTERP_DELAY = 0.1; // s
// ralenti des buts : 2,8 s avant le but jusqu'à 0,3 s après, à 65 % de la vitesse, 0,9 s après le but
const REPLAY = { before: 2.8, after: 0.3, speed: 0.65, delay: 0.9 };
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export function createArenaView(container, options) {
  let { slots, teams, mySlot, settings, onInput, onEvent, onHud, onSwitch, interactive = true } = options;
  // l'anticrénelage, la tonalité et les ombres sont gérés par le pipeline de rendu (SMAA / MSAA selon la qualité)
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false });
  const auto = !settings.quality || settings.quality === "auto";
  const quality = auto ? detectInitialQuality(renderer) : normLevel(settings.quality);
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement; canvas.tabIndex = 0; canvas.style.outline = "none";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  const pipeline = createPipeline(renderer, scene, camera, { quality });
  const overlay = createPerfOverlay(container);
  const stadium = createStadium(scene, { quality, homeColor: teams[0].color, awayColor: teams[1].color });
  const effects = createEffects(scene, { quality });
  const ball = createBall({ quality }); scene.add(ball.mesh); scene.add(ball.trail);
  const sfx = createSfx(); sfx.setVolume(settings.volume ?? 0.7);
  const puVisuals = createPuVisuals(scene, effects);
  // qualité adaptative : on baisse vite si les images/s chutent, on remonte prudemment (jamais au-dessus du choix du joueur)
  const qm = createQualityManager({ initial: quality, max: quality, onChange: ({ level, scale }) => {
    pipeline.setQuality(level); pipeline.setResolutionScale(scale); stadium.setQuality?.(level); effects.setQuality?.(level); ball.setQuality?.(level);
  } });
  if (settings.adaptiveQuality === false) qm.lock(quality);
  const onF3 = e => { if (e.code === "F3") { e.preventDefault(); overlay.toggle(); } };
  window.addEventListener("keydown", onF3);
  const passRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  passRing.rotation.x = -Math.PI / 2; passRing.position.y = 0.03; passRing.visible = false; scene.add(passRing);
  // repère du joueur contrôlé (anneau au sol, suit le changement de joueur)
  const meRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  meRing.rotation.x = -Math.PI / 2; meRing.position.y = 0.035; meRing.visible = false; scene.add(meRing);
  let controls = controlsOf(settings);
  const input = interactive ? createInput(canvas, { sensitivity: settings.sensitivity, invertY: settings.invertY, controls }) : spectatorInput();

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
  const dropTag = a => { if (a.tag) { a.group.remove(a.tag); a.tag.material.map.dispose(); a.tag.material.dispose(); a.tag = null; a.tagKey = ""; } };
  function refreshTag(a, s) {
    const key = s.human && s.pseudo && s.slot !== mySlot ? s.pseudo : "";
    if (key === a.tagKey) return;
    dropTag(a);
    if (key) { a.tag = tagSprite("👤 " + key, teams[s.team].color); a.tag.position.y = (getPlayer(s.charId)?.taille || 1.8) + 0.78; a.group.add(a.tag); a.tagKey = key; }
  }

  // avatars (reconstruits individuellement : personnage ou apparence modifiés)
  let avatars = [];
  const lookKey = s => JSON.stringify(s.look || null);
  function makeAvatar(s) {
    const p = getPlayer(s.charId); const team = teams[s.team];
    const a = createAvatar(p, { teamColor: team.color, teamColor2: "#10131f", isKeeper: s.slot % 5 === 0, quality, appearance: s.look || undefined });
    Object.assign(a, { slot: s.slot, charId: s.charId, team: s.team, lookKey: lookKey(s), tagKey: "" });
    refreshTag(a, s); scene.add(a.group);
    return a;
  }
  function disposeAvatar(a) { scene.remove(a.group); dropTag(a); a.dispose(); }
  function syncAvatars(sl) {
    for (let i = 0; i < sl.length; i++) {
      const s = sl[i]; let a = avatars[i];
      if (a && a.charId !== s.charId) { const pos = a.group.position.clone(), rot = a.group.rotation.y; disposeAvatar(a); a = avatars[i] = makeAvatar(s); a.group.position.copy(pos); a.group.rotation.y = rot; }
      else if (!a) a = avatars[i] = makeAvatar(s);
      else if (a.lookKey !== lookKey(s)) { a.lookKey = lookKey(s); a.lblVis = undefined; if (a.setAppearance) a.setAppearance(s.look || undefined); }
      refreshTag(a, s);
      a.setHighlight(i === mySlot);
    }
  }
  syncAvatars(slots);

  // caméra initiale : derrière son joueur, face au but adverse
  const myTeam = () => (mySlot != null ? slots[mySlot].team : 0);
  input.state.yaw = myTeam() === 0 ? 0 : Math.PI;
  const rig = createCameraRig(camera, canvas, { interactive, mode: interactive ? settings.camera || "near" : settings.specCam || "auto" });

  // ── Instantanés ────────────────────────────────────────
  const buffer = []; let lastRecvLocal = 0, lastSnapT = 0, latest = null;
  const pred = { x: 0, z: 0, vx: 0, vz: 0, facing: 0, stamina: 100, ok: false };
  const seen = new Set();

  let replay = null; // { start, end, beginAt (horloge locale), team }
  let passFollow = null; // changement automatique après une passe : { until }
  function pushSnapshot(snap, events) {
    buffer.push(snap); while (buffer.length > 2 && buffer[0].t < snap.t - 8) buffer.shift();
    latest = snap; lastRecvLocal = performance.now() / 1000; lastSnapT = snap.t;
    for (const ev of events || []) handleEvent(ev);
  }

  const posOf = slot => { const P = latest?.p?.[slot]; return P ? new THREE.Vector3(P[0], 0.2, P[1]) : null; };
  function handleEvent(ev) {
    const key = ev.id + ":" + ev.type + ":" + ev.t; if (seen.has(key)) return; seen.add(key);
    if (seen.size > 4000) seen.clear();
    const pos = posOf(ev.slot) || new THREE.Vector3(latest?.b[0] || 0, 0.2, latest?.b[2] || 0);
    const color = ev.slot >= 0 ? getPlayer(slots[ev.slot]?.charId)?.color || "#fff" : "#fff";
    const mine = ev.slot === mySlot && mySlot != null;
    switch (ev.type) {
      case "GOAL": {
        rig.shake(0.35); const gx = ev.team === 0 ? FIELD.HX : -FIELD.HX; effects.goalExplosion(new THREE.Vector3(gx, 1.1, 0), teams[ev.team].color); stadium.flash(teams[ev.team].color, { side: gx > 0 ? 1 : -1 }); pipeline.flash?.(teams[ev.team].color, 0.2); sfx.goal();
        stadium.netImpact?.(Math.sign(gx), new THREE.Vector3(gx, latest?.b[1] || 1, latest?.b[2] || 0));
        if (mySlot != null && slots[mySlot].team === ev.team) input.rumble?.(0.8, 0.6, 450);
        if (options.replays !== false) replay = { start: ev.t - REPLAY.before, end: ev.t + REPLAY.after, beginAt: performance.now() / 1000 + REPLAY.delay, team: ev.team, gx };
        rig.onGoal(ev.slot, ev.team);
        break;
      }
      case "SHOT": effects.kickSpark(pos, "#ffffff"); sfx.kick(Math.min(1, (ev.power || 20) / 30)); if (ev.power > 24) rig.shake(0.12); if (mine) input.rumble?.(0.35, 0.5, 110); rig.onShot(ev.slot); break;
      case "SAVE": effects.ring(pos, "#00F0FF", { radius: 2, duration: 0.6 }); sfx.save(); break;
      case "TACKLE": effects.burst(pos, "#8B5CF6", { count: 18, speed: 3 }); effects.dust?.(pos); effects.sparks?.(pos.clone().setY(0.6), "#FFFFFF", { count: 10 }); sfx.tackle(); if (ev.victim === mySlot) input.rumble?.(0.9, 0.4, 220); else if (mine) input.rumble?.(0.4, 0.3, 120); break;
      case "POWERUP": {
        effects.ring(pos, color, { radius: 4, duration: 0.9 }); effects.burst(pos, color, { count: 40, speed: 5, up: 3 }); sfx.powerUp(); if (mine) input.rumble?.(0.3, 0.7, 180);
        if (ev.effect === "shockwave") { (effects.shockwave || effects.ring)(pos, "#FFFFFF", { radius: 4.5, duration: 0.5 }); effects.dust?.(pos); rig.shake(0.18); for (const h of ev.hit || []) { const q = posOf(h); if (q) effects.burst(q, color, { count: 12, speed: 3, up: 1.5 }); } }
        if (ev.effect === "freezeNearest" && ev.victim >= 0) { const q = posOf(ev.victim); if (q) { effects.burst(q.setY(1), "#BFEFFF", { count: 36, speed: 2.2, up: 1.2, size: 1.2, gravity: -1 }); effects.ring(q.setY(0.1), "#9FE8FF", { radius: 1.3, duration: 1.4 }); } if (ev.victim === mySlot) input.rumble?.(0.6, 0.6, 300); }
        if (ev.effect === "dash") { effects.burst(pos, color, { count: 24, speed: 4, up: 0.4, drag: 2 }); effects.dust?.(pos); }
        break;
      }
      case "FIREWALL": effects.ring(pos, "#39FF14", { radius: 3.2, duration: 0.7 }); sfx.tackle(); break;
      case "POST": sfx.bounce(1); effects.kickSpark(new THREE.Vector3(latest.b[0], latest.b[1], latest.b[2]), "#ffffff"); rig.shake(0.1); break;
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

  // effet Arène actif d'un joueur (bits des power-ups actifs → sélection du slot)
  const loadoutOf = i => slots[i]?.loadout || defaultLoadout(slots[i]?.charId);
  const activeEffect = (i, P) => { const m = P?.[12] || 0; const lo = loadoutOf(i); for (let k = 0; k < lo.length; k++) if (m & (1 << k)) return getPowerUp(lo[k])?.arena?.effect; return null; };

  // ── Boucle ──────────────────────────────────────────────
  let raf = 0, last = performance.now(), alive = true, inputAcc = 0, hudAcc = 0, lastInputSent = null, fpsAcc = 0, fpsN = 0, lastFps = 60, switchAcc = 0, pendingEdges = new Set();
  const ballPos = new THREE.Vector3(), ballVel = new THREE.Vector3();
  let menuOpen = false, boardOpen = false;

  function frame(nowMs) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    // pas de temps borné : l'horodatage de la première image peut précéder la création de la vue (dt < 0)
    const realDt = Math.max(0, (nowMs - last) / 1000);
    const dt = Math.min(0.05, realDt); last = Math.max(last, nowMs);
    qm.sample(realDt);
    const nowS = nowMs / 1000; let replayRt = null;
    if (replay && nowS >= replay.beginAt) {
      replayRt = replay.start + (nowS - replay.beginAt) * REPLAY.speed;
      if (replayRt > replay.end || (latest && latest.ph !== "goal")) { replay = null; replayRt = null; }
    }
    const S = sample(replayRt ?? undefined);
    const inp = input.read(dt);
    if (replayRt != null && (inp.edges.has("pass") || inp.edges.has("shootPress") || inp.edges.has("menu"))) { replay = null; replayRt = null; } // passer le ralenti
    if (inp.edges.has("cam")) rig.cycle();
    if (inp.edges.has("menu")) { menuOpen = !menuOpen; if (menuOpen) input.unlock(); }
    boardOpen = inp.board;
    const yaw = input.state.yaw;
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    // intention → monde (avant = direction caméra, droite = perpendiculaire)
    let mx = inp.fwd * dx + inp.right * -dz, mz = inp.fwd * dz + inp.right * dx;
    const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
    if (menuOpen) { mx = 0; mz = 0; }
    const hasBall = !!latest && latest.b[6] === mySlot && mySlot != null;

    if (S) {
      const { a, b, k } = S;
      const B = a.b.map((v, i) => (i < 6 ? lerp(v, b.b[i], k) : b.b[i]));
      for (let i = 0; i < avatars.length; i++) {
        const av = avatars[i]; const pa = a.p[i], pb = b.p[i]; if (!pa || !pb) continue;
        let x = lerp(pa[0], pb[0], k), z = lerp(pa[1], pb[1], k), face = lerpAngle(pa[4], pb[4], k);
        const vx = pb[2], vz = pb[3];
        if (i === mySlot && latest && replayRt == null && interactive) {
          // prédiction locale : on intègre ses propres entrées, recalées doucement sur le serveur
          const L = latest.p[i];
          if (!pred.ok) Object.assign(pred, { x: L[0], z: L[1], vx: L[2], vz: L[3], facing: L[4], ok: true });
          predictStep(pred, i, mx, mz, inp.sprint, dt, L);
          const lag = Math.min(0.35, (options.getRtt?.() || 0) + (performance.now() / 1000 - lastRecvLocal));
          const ex = L[0] + L[2] * lag - pred.x, ez = L[1] + L[3] * lag - pred.z;
          if (Math.hypot(ex, ez) > 3) { pred.x = L[0]; pred.z = L[1]; } else { const g = Math.min(1, dt * 4); pred.x += ex * g; pred.z += ez * g; }
          x = pred.x; z = pred.z; face = pred.facing;
          if (b.b[6] === i) { B[0] = x + Math.cos(face) * 0.5; B[2] = z + Math.sin(face) * 0.5; B[1] = latest.b[1]; }
        }
        av.group.position.set(x, 0, z);
        av.group.rotation.y = Math.atan2(Math.cos(face), Math.sin(face));
        const flags = pb[6]; const speed = Math.hypot(vx, vz);
        let action = speed > 0.4 ? (flags & 1 ? "sprint" : "run") : "idle", actionT = 0.5;
        if (pb[8] === "kick" || pb[8] === "pass") action = pb[8];
        if (pb[8] === "tackle" || pb[8] === "poke") action = "tackle";
        if (flags & 16) { action = "charge"; actionT = pb[7] || 0; }
        if (flags & 4) action = "dive"; else if (flags & 2) action = "stunned";
        if (b.ph === "goal" && isScorerTeam(i)) action = "celebrate";
        const localDive = Math.sign(-Math.sin(av.group.rotation.y) * (pb[10] || 1)) || 1;
        av.setState({ speed, action, actionT, diveDir: localDive, celebrateSeed: lastGoalId }, dt);
        av.setPowerUp(!!(flags & 8), getPlayer(av.charId)?.color || "#fff");
        if (av.setLookAt) av.setLookAt(ballPos);
      }
      ballPos.set(B[0], B[1], B[2]); ballVel.set(B[3], B[4], B[5]);
      ball.update({ x: B[0], y: B[1], z: B[2] }, { x: B[3], y: B[4], z: B[5] }, dt);
      const puGlow = puVisuals.update(avatars, i => b.p[i]?.[6] || 0, i => activeEffect(i, b.p[i]), dt, nowS, b.b[6]);
      ball.setGlow(mySlot != null && b.p[mySlot]?.[6] & 16 ? "#FFD700" : puGlow);
    }

    // ── Entrées → serveur (30 Hz) ──
    if (mySlot != null && interactive) {
      for (const e of inp.edges) pendingEdges.add(e);
      // touches contextuelles : quand un adversaire a le ballon, Passe = tacle, Tir = tacle glissé
      // (la passe est aussi envoyée : le serveur ne l'exécute que si l'on a réellement le ballon)
      const oppBall = latest && latest.b[6] >= 0 && slots[latest.b[6]]?.team !== slots[mySlot].team;
      if (controls.contextKeys && oppBall && !hasBall && latest.ph === "play") {
        if (inp.edges.has("pass")) pendingEdges.add("tackle");
        if (inp.edges.has("shootPress")) pendingEdges.add("slide");
      }
      if (inp.edges.has("switch") && !menuOpen) requestSwitch("auto");
      autoSwitch(dt, hasBall);
      inputAcc += dt;
      if (inputAcc >= 1 / 30) {
        inputAcc = 0;
        let bits = 0;
        if (inp.sprint) bits |= BTN.sprint;
        if (inp.shoot && !menuOpen) bits |= BTN.shoot; // sans effet côté serveur si l'on n'a pas le ballon
        const E = pendingEdges; pendingEdges = new Set();
        if (E.has("pass") && hasBall) { onEvent?.({ type: "MY_PASS", slot: mySlot, local: true }); if (controls.autoSwitch !== "off") passFollow = { until: nowS + 2.2 }; }
        if (E.has("lob") && hasBall && controls.autoSwitch !== "off") passFollow = { until: nowS + 2.6 };
        if (E.has("pass")) bits |= BTN.pass;
        if (E.has("lob")) bits |= BTN.lob;
        if (E.has("tackle")) bits |= BTN.tackle;
        if (E.has("slide")) bits |= BTN.slide;
        if (E.has("pu1")) bits |= BTN.pu;
        if (E.has("pu2")) bits |= BTN.pu2;
        if (E.has("call")) bits |= BTN.call;
        if (E.has("skill")) { bits |= BTN.skill; if (hasBall && pred.ok) { const side = (inp.right || 0) >= 0 ? 1 : -1; const perp = pred.facing + side * Math.PI / 2; pred.vx += Math.cos(perp) * 5; pred.vz += Math.sin(perp) * 5; } }
        for (let k = 1; k <= 5; k++) if (E.has("emote" + k)) onEvent?.({ type: "EMOTE_KEY", n: k, local: true });
        const aimFace = input.state.locked || input.state.usingPad;
        if (aimFace) bits |= BTN.aimFace;
        const aim = aimFace ? yaw : (Math.hypot(mx, mz) > 0.1 ? Math.atan2(mz, mx) : yaw);
        const msg = { mx: +mx.toFixed(3), mz: +mz.toFixed(3), aim: +aim.toFixed(3), b: bits };
        const key = JSON.stringify(msg);
        if (key !== lastInputSent || bits) { onInput(msg); lastInputSent = key; }
      }
    }

    // indicateur de passe : le coéquipier le mieux aligné avec la visée quand on a le ballon
    passRing.visible = false;
    if (S && hasBall) {
      const me = avatars[mySlot].group.position; const aimYaw = input.state.locked || input.state.usingPad ? yaw : (Math.hypot(mx, mz) > 0.1 ? Math.atan2(mz, mx) : yaw);
      let best = null;
      for (const av of avatars) {
        if (av.slot === mySlot || av.team !== slots[mySlot].team) continue;
        const q = av.group.position; const ddx = q.x - me.x, ddz = q.z - me.z, d = Math.hypot(ddx, ddz); if (d < 1.5) continue;
        const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(ddz, ddx) - aimYaw), Math.cos(Math.atan2(ddz, ddx) - aimYaw)));
        if (ang > 1.0) continue; const sc = ang * 3 + d * 0.04; if (!best || sc < best.sc) best = { q, sc };
      }
      if (best) { passRing.visible = true; passRing.position.x = best.q.x; passRing.position.z = best.q.z; passRing.scale.setScalar(1 + Math.sin(nowMs / 150) * 0.08); }
    }
    meRing.visible = mySlot != null && interactive && !!avatars[mySlot];
    if (meRing.visible) { const q = avatars[mySlot].group.position; meRing.position.set(q.x, 0.035, q.z); meRing.material.color.set(teams[slots[mySlot].team].color); meRing.scale.setScalar(1 + Math.sin(nowMs / 220) * 0.05); }

    rig.update(dt, {
      replay: replayRt != null && replay ? { gx: replay.gx, t: nowS - replay.beginAt } : null,
      yaw, pitch: input.state.pitch, zoom: input.state.zoom, me: mySlot != null && interactive ? avatars[mySlot]?.group : null,
      ball: ballPos, ballVel, owner: latest ? latest.b[6] : -1, avatars, phase: latest?.ph,
    });
    // étiquettes de nom : masquées près de la caméra (caméras joueur / proche) et au-dessus de son propre joueur
    for (const av of avatars) {
      const vis = av.group.position.distanceTo(camera.position) > 6.5 && !(interactive && av.slot === mySlot);
      if (av.lblVis !== vis) { av.lblVis = vis; av.setLabelVisible?.(vis); }
    }
    stadium.update(dt, nowS, ballPos);
    // lignes de vitesse quand son joueur sprinte vite
    if (mySlot != null && interactive && latest) { const P = latest.p[mySlot]; const sp = Math.hypot(P[2], P[3]); effects.setSpeedLines?.(P[6] & 1 ? Math.min(1, Math.max(0, (sp - 6) / 3)) * 0.6 : 0, teams[slots[mySlot].team].color); }
    effects.update(dt, camera);
    if (latest) { const ex = 0.3 + Math.min(0.5, Math.abs(latest.b[0]) / 40); sfx.crowd(ex); stadium.setCrowdExcitement?.(ex); }
    pipeline.render(dt);
    if (overlay.visible) overlay.update(renderer, realDt, { level: qm.level, scale: qm.scale });

    fpsAcc += realDt; fpsN++;
    if (fpsAcc > 1) { lastFps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    hudAcc += dt;
    if (hudAcc > 0.1 && latest) { hudAcc = 0; onHud?.(hudState()); }
  }

  // ── Changement de joueur ─────────────────────────────────
  let lastSwitchAt = 0;
  function requestSwitch(to) {
    const now = performance.now();
    if (!onSwitch || mySlot == null || now - lastSwitchAt < 300) return;
    if (to !== "auto" && (slots[to]?.human || slots[to]?.left || slots[to]?.team !== slots[mySlot].team || to === mySlot)) return;
    lastSwitchAt = now; onSwitch(to);
  }
  // automatique : suivre le ballon après une passe ; « assist » : en défense, prendre le mieux placé
  function autoSwitch(dt, hasBall) {
    if (controls.autoSwitch === "off" || !latest || latest.ph !== "play") return;
    const owner = latest.b[6]; const nowS = performance.now() / 1000;
    if (passFollow) {
      if (nowS > passFollow.until) passFollow = null;
      else if (owner >= 0 && owner !== mySlot && slots[owner]?.team === slots[mySlot].team && !slots[owner].human && !slots[owner].left) { passFollow = null; requestSwitch(owner); return; }
      else if (owner >= 0 && slots[owner]?.team !== slots[mySlot].team) passFollow = null;
    }
    if (controls.autoSwitch !== "assist" || hasBall) return;
    switchAcc += dt; if (switchAcc < 1.2) return; switchAcc = 0;
    if (owner < 0 || slots[owner]?.team === slots[mySlot].team) return;
    const P = latest.p, bx = latest.b[0], bz = latest.b[2];
    const dMe = Math.hypot(P[mySlot][0] - bx, P[mySlot][1] - bz);
    let best = -1, bd = 1e9;
    for (let i = 0; i < slots.length; i++) { if (slots[i].team !== slots[mySlot].team || slots[i].human || slots[i].left || i % 5 === 0) continue; const d = Math.hypot(P[i][0] - bx, P[i][1] - bz); if (d < bd) { bd = d; best = i; } }
    if (best >= 0 && dMe > 9 && bd < dMe - 5) requestSwitch(best);
  }

  let lastGoalTeam = -1, lastGoalId = 0;
  const isScorerTeam = i => lastGoalTeam === slots[i].team;

  function predictStep(p, i, mx, mz, sprint, dt, L) {
    const char = getPlayer(slots[i].charId); const lo = loadoutOf(i); const mask = L[12] || 0;
    // élan (dash) décidé par le serveur : on reprend sa vitesse dès qu'il apparaît
    if (L[6] & 128) { if (!p.dashSeen) { p.vx = L[2]; p.vz = L[3]; p.dashSeen = true; } } else p.dashSeen = false;
    // auras d'équipe actives (vitesse) des coéquipiers
    const auras = [];
    for (let j = 0; j < slots.length; j++) { if (slots[j].team !== slots[i].team) continue; const e = activeEffect(j, latest.p[j]); if (e === "teamSpeed") { const pu = loadoutOf(j).map(getPowerUp).find(u => u?.arena?.effect === "teamSpeed"); if (pu) auras.push({ kind: "speed", team: slots[i].team, until: 1e9, value: pu.arena.value || 1.1 }); } }
    const fakeP = { char, stamina: L[5], pus: lo.map((id, k) => ({ def: getPowerUp(id), until: mask & (1 << k) ? 1e9 : 0 })), boostUntil: 0, dashUntil: L[6] & 128 ? 1e9 : 0, stunUntil: L[6] & 2 ? 1e9 : 0, diveUntil: L[6] & 4 ? 1e9 : 0, team: slots[i].team, x: p.x, z: p.z, vx: p.vx, vz: p.vz, facing: p.facing, slot: i };
    const fakeSim = { time: 0, auras, slows: [], ball: { owner: latest.b[6] } };
    stepMovement(fakeP, { mx, mz, sprint, aim: input.state.yaw, aimFace: input.state.locked }, fakeSim, dt);
    p.x = fakeP.x; p.z = fakeP.z; p.vx = fakeP.vx; p.vz = fakeP.vz; p.facing = fakeP.facing;
  }

  function hudState() {
    const L = latest; const me = mySlot != null ? L.p[mySlot] : null;
    const lo = mySlot != null ? loadoutOf(mySlot) : [];
    return {
      score: L.s, clock: L.c, half: L.h, phase: L.ph, mySlot,
      me: me && { stamina: me[5], charging: !!(me[6] & 16), charge: me[7], puActive: !!(me[6] & 8), puCd: me[9], hasBall: L.b[6] === mySlot,
        pus: lo.map((id, k) => ({ id, cd: k === 0 ? me[9] : me[11] || 0, active: !!((me[12] || 0) & (1 << k)) })) },
      fps: lastFps, quality: qm.level, replay: !!replay && performance.now() / 1000 >= replay.beginAt, locked: input.state.locked, menu: menuOpen, board: boardOpen, cam: rig.mode, follow: rig.follow, usingPad: input.state.usingPad,
      players: L.p.map(p => ({ stamina: p[5], flags: p[6], x: p[0], z: p[1] })), ball: [L.b[0], L.b[2]], owner: L.b[6],
    };
  }

  function resize() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    pipeline.setSize(w, h, window.devicePixelRatio || 1); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  if (typeof window !== "undefined") window.__ll3d = { camera, scene, renderer, pipeline, get latest() { return latest; }, get camMode() { return rig.mode; }, get mySlot() { return mySlot; }, get quality() { return qm.level; }, get looks() { return avatars.map(a => ({ slot: a.slot, charId: a.charId, outfit: a.appearance?.outfit, hair: a.appearance?.hairStyle })); } }; // inspection (diagnostic)
  raf = requestAnimationFrame(frame);

  return {
    pushSnapshot: (snap, events) => {
      for (const ev of events || []) if (ev.type === "GOAL") { lastGoalTeam = ev.team; lastGoalId++; } else if (ev.type === "KICKOFF" || ev.type === "SECOND_HALF") lastGoalTeam = -1;
      if (snap.ph === "play") lastGoalTeam = -1;
      pushSnapshot(snap, events);
    },
    setSlots(sl) { slots = sl; syncAvatars(sl); },
    setMySlot(s) {
      if (s === mySlot) return;
      avatars[mySlot]?.setHighlight(false); mySlot = s; pred.ok = false; passFollow = null; lastInputSent = null; // renvoyer l'entrée courante
      syncAvatars(slots);
      if (s != null) { const q = avatars[s]?.group.position; if (q) effects.ring(new THREE.Vector3(q.x, 0.1, q.z), teams[slots[s].team].color, { radius: 1.6, duration: 0.45 }); }
    },
    setTeams(t) { teams = t; stadium.setTeamColors?.(t[0].color, t[1].color); },
    setMenu(v) { menuOpen = v; if (!v) input.lock(); },
    setCam(v) { rig.setMode(v); },
    setFollow(slot) { rig.setFollow(slot); },
    zoomCam(d) { rig.setZoom(rig.zoom + d * 0.34); },
    switchTo: to => requestSwitch(to),
    setSettings(s) { sfx.setVolume(s.volume ?? 0.7); input.setSensitivity(s.sensitivity, s.invertY); controls = controlsOf(s); input.setControls?.(controls); qm.lock(s.adaptiveQuality === false ? qm.level : null); },
    toggleStats: () => overlay.toggle(),
    unlockAudio: () => sfx.unlock(),
    touch: input.touch,
    lock: () => input.lock(),
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); input.dispose(); rig.dispose(); window.removeEventListener("keydown", onF3); overlay.dispose(); pipeline.dispose();
      for (const a of avatars) disposeAvatar(a); ball.dispose?.(); passRing.geometry.dispose(); passRing.material.dispose(); meRing.geometry.dispose(); meRing.material.dispose(); effects.dispose(); puVisuals.dispose(); stadium.dispose(); sfx.dispose();
      renderer.dispose(); canvas.remove();
    },
  };
}

// entrées neutres pour une vue spectateur (match Manager en 3D)
function spectatorInput() {
  const touch = { mx: 0, mz: 0, btn: new Set() };
  return { state: { yaw: 0, pitch: 0.3, zoom: 0, edges: new Set(), locked: false, usingPad: false, touch }, touch, read: () => ({ fwd: 0, right: 0, sprint: false, shoot: false, edges: new Set(), board: false }), rumble() {}, setSensitivity() {}, setControls() {}, lock() {}, unlock() {}, dispose() {} };
}

export { statOf };
