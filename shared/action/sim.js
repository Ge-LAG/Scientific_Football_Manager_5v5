// ═══════════════════════════════════════════════════════════════
// Simulation de l'Arène 5v5 (mode Action) — autoritaire, 30 Hz.
// Repère : x = longueur [-20, 20] (l'équipe 0 attaque vers +x), z = largeur [-12, 12], y = hauteur.
// Arène fermée par des parois vitrées : le ballon rebondit, le jeu ne s'arrête jamais.
// Les 9 caractéristiques des scientifiques pilotent vitesse, contrôle, tirs, passes, tacles et arrêts.
// ═══════════════════════════════════════════════════════════════
import { makeRng } from "../rng.js";
import { getPlayer, narrKey } from "../data/content.js";
import { ARENA_EFFECTS } from "../data/enrichment.js";

export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;
export const FIELD = { L: 40, W: 24, HX: 20, HZ: 12, GOAL_HW: 2.5, GOAL_H: 2.2, GOAL_D: 1.2, BOX_D: 6, BOX_HW: 6 };
const BALL_R = 0.11, PLAYER_R = 0.42, G = 9.81, POST_R = 0.06;
export const GOAL_PAUSE = 6.2; // s : célébration + ralenti côté client
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hyp = Math.hypot;

// Positions de base (équipe 0, attaque vers +x) : gardien, défenseur, milieux, attaquant.
export const BASE = [{ x: -18.3, z: 0 }, { x: -12, z: 0 }, { x: -7, z: -6 }, { x: -7, z: 6 }, { x: -2.2, z: 0 }];
export const ROLES = ["gk", "def", "mid", "mid", "att"];

export const emptyInput = () => ({ mx: 0, mz: 0, aim: 0, sprint: false, shoot: false, pass: false, lob: false, tackle: false, pu: false, call: false, skill: false });

// Caractéristique effective (base + bonus actifs + fatigue).
export function statOf(p, key, sim) {
  let v = p.char.attributs[key] ?? 50;
  if (p.puUntil > sim.time) v += p.char.powerUp?.buffs?.[key] || 0;
  for (const a of sim.auras) if (a.team === p.team && a.until > sim.time && (key === "Vision" || key === "Sang-froid")) v += a.value;
  for (const a of sim.slows) if (a.team !== p.team && a.until > sim.time && key === "Sang-froid") v -= 8;
  if (p.stamina < 40) v *= 0.82 + 0.18 * (p.stamina / 40);
  return clamp(v, 1, 99);
}

export function maxSpeed(p, sim) {
  const vit = statOf(p, "Vitesse", sim);
  let s = 4.6 + vit / 99 * 3.0;
  const fx = p.fx(sim);
  if (fx === "speedBoost" || fx === "ballGlue" || fx === "freeSprint") s *= p.char.powerUp.arena.value || 1.1;
  if (sim.ball.owner === p.slot) s *= 0.86 + statOf(p, "Dribble", sim) / 99 * 0.12;
  for (const a of sim.slows) if (a.team !== p.team && a.until > sim.time && hyp(a.x - p.x, a.z - p.z) < a.radius) s *= a.value;
  if (p.boostUntil > sim.time) s *= 1.18;
  return s;
}

// Intégration du déplacement d'un joueur (partagée avec la prédiction côté client).
export function stepMovement(p, input, sim, dt = DT) {
  const stunned = p.stunUntil > sim.time;
  let mx = input.mx || 0, mz = input.mz || 0;
  const m = hyp(mx, mz); if (m > 1) { mx /= m; mz /= m; }
  const canSprint = input.sprint && p.stamina > 8 && !stunned && m > 0.1;
  let vmax = maxSpeed(p, sim) * (canSprint ? 1.35 : 1) * (stunned ? 0.25 : 1);
  if (p.diveUntil > sim.time) vmax = 0; // plongeon : trajectoire propre
  const acc = (16 + statOf(p, "Vitesse", sim) / 99 * 10) * (stunned ? 0.3 : 1);
  const tvx = mx * vmax, tvz = mz * vmax;
  const dvx = tvx - p.vx, dvz = tvz - p.vz, dv = hyp(dvx, dvz);
  if (p.diveUntil <= sim.time) {
    if (dv <= acc * dt) { p.vx = tvx; p.vz = tvz; } else { p.vx += dvx / dv * acc * dt; p.vz += dvz / dv * acc * dt; }
  } else { p.vx *= 0.9; p.vz *= 0.9; }
  p.x += p.vx * dt; p.z += p.vz * dt;
  const sp = hyp(p.vx, p.vz);
  if (sp > 0.3) p.facing = Math.atan2(p.vz, p.vx);
  else if (input.aimFace) p.facing = input.aim;
  // endurance
  const fx = p.fx(sim);
  const free = fx === "noStaminaDrain" || fx === "freeSprint";
  if (canSprint && sp > 1 && !free) p.stamina = Math.max(0, p.stamina - dt * 10 * (1.3 - statOf(p, "Endurance", sim) / 99 * 0.6));
  else p.stamina = Math.min(100, p.stamina + dt * (sp < 1 ? 6 : 3.2) * (0.6 + p.char.attributs.Endurance / 99 * 0.6));
  p.sprinting = canSprint && sp > 1;
  // bornes : parois (le gardien peut entrer dans sa cage)
  const lim = FIELD.HX - PLAYER_R;
  const inMouth = Math.abs(p.z) < FIELD.GOAL_HW - PLAYER_R;
  p.x = clamp(p.x, inMouth ? -FIELD.HX - FIELD.GOAL_D + PLAYER_R : -lim, inMouth ? FIELD.HX + FIELD.GOAL_D - PLAYER_R : lim);
  p.z = clamp(p.z, -FIELD.HZ + PLAYER_R, FIELD.HZ - PLAYER_R);
}

export class ArenaSim {
  /**
   * @param {{ slots: {charId:string, name?:string, human?:boolean}[10], seed?:number, halfSeconds?:number }} o
   * slots 0-4 : équipe 0 (0 = gardien) ; slots 5-9 : équipe 1 (5 = gardien).
   */
  constructor(o) {
    this.rng = makeRng(o.seed ?? 7);
    this.halfSeconds = o.halfSeconds || 180;
    this.time = 0; this.tick = 0; this.half = 1; this.playClock = 0;
    this.phase = "kickoff"; this.phaseUntil = 2.5;
    this.score = [0, 0];
    this.events = []; this.auras = []; this.slows = [];
    this.players = o.slots.map((s, slot) => this.makePlayer(slot, s));
    this.inputs = this.players.map(() => emptyInput());
    this.ball = { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: -1, last: -1, prev: -1, curl: 0, holdSince: 0 };
    this.stats = this.players.map(() => ({ goals: 0, assists: 0, shots: 0, onTarget: 0, saves: 0, tackles: 0, passes: 0, passesOk: 0, fouls: 0, powerups: 0, touches: 0 }));
    this.kickoff(0);
  }

  makePlayer(slot, s) {
    const char = getPlayer(s.charId);
    if (!char) throw new Error("Personnage inconnu : " + s.charId);
    const team = slot < 5 ? 0 : 1; const role = ROLES[slot % 5];
    const p = {
      slot, team, role, char, name: s.name || char.nom, human: !!s.human,
      x: 0, z: 0, vx: 0, vz: 0, facing: team === 0 ? 0 : Math.PI, stamina: 100, sprinting: false,
      charge: 0, charging: false, kickCd: 0, tackleCd: 0, stunUntil: 0, diveUntil: 0, diveDir: 0, action: "", actionUntil: 0,
      puUntil: 0, puCd: 0, puPending: null, boostUntil: 0, protectedUntil: 0, holdUntil: 0, callUntil: 0, skillUntil: 0, skillCd: 0,
    };
    p.fx = sim => (p.puUntil > sim.time ? p.char.powerUp.arena.effect : null);
    return p;
  }

  setSlot(slot, s) { // un humain remplace un bot (ou l'inverse) en conservant la position
    const old = this.players[slot];
    const np = this.makePlayer(slot, s);
    for (const k of ["x", "z", "vx", "vz", "facing", "stamina"]) np[k] = old[k];
    if (old.char.id === np.char.id) for (const k of ["puUntil", "puCd"]) np[k] = old[k];
    this.players[slot] = np; this.inputs[slot] = emptyInput();
  }

  basePos(p) { const b = BASE[p.slot % 5]; return p.team === 0 ? { x: b.x, z: b.z } : { x: -b.x, z: -b.z }; }
  goalX(team) { return team === 0 ? FIELD.HX : -FIELD.HX; }       // but attaqué
  ownGoalX(team) { return team === 0 ? -FIELD.HX : FIELD.HX; }
  isKeeper(p) { return p.slot % 5 === 0; }
  inOwnBox(p) { const gx = this.ownGoalX(p.team); return Math.abs(p.x - gx) < FIELD.BOX_D + 0.5 && Math.abs(p.z) < FIELD.BOX_HW + 0.5; }
  owner() { return this.ball.owner >= 0 ? this.players[this.ball.owner] : null; }

  event(type, slot = -1, extra = {}, narrCat = null) {
    const p = slot >= 0 ? this.players[slot] : null;
    const ev = { id: this.events.length, t: Math.round(this.time * 10) / 10, type, slot, team: p ? p.team : -1, ...extra };
    if (narrCat && p) ev.n = narrKey(narrCat, p.char.domaine, this.rng);
    this.events.push(ev);
    return ev;
  }

  kickoff(team) {
    for (const p of this.players) {
      const b = this.basePos(p); p.x = b.x; p.z = b.z; p.vx = p.vz = 0; p.charge = 0; p.charging = false; p.stunUntil = 0; p.diveUntil = 0;
      p.facing = p.team === 0 ? 0 : Math.PI;
    }
    const taker = this.players[team * 5 + 4];
    taker.x = team === 0 ? -0.6 : 0.6; taker.z = 0;
    Object.assign(this.ball, { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: taker.slot, last: taker.slot, prev: -1, curl: 0 });
    this.phase = "kickoff"; this.phaseUntil = this.time + 2;
  }

  setInput(slot, input) { if (slot >= 0 && slot < 10) this.inputs[slot] = { ...emptyInput(), ...input }; }

  // ── Boucle principale ────────────────────────────────────
  step() {
    if (this.phase === "ended") return false;
    this.tick++; this.time = this.tick * DT;
    this.auras = this.auras.filter(a => a.until > this.time); this.slows = this.slows.filter(a => a.until > this.time);

    if (this.phase === "goal" || this.phase === "halftime") {
      for (const p of this.players) { p.vx *= 0.9; p.vz *= 0.9; p.x += p.vx * DT; p.z += p.vz * DT; }
      if (this.time >= this.phaseUntil) {
        if (this.phase === "halftime") { this.half = 2; this.event("SECOND_HALF"); }
        this.kickoff(this.pendingKick ?? 0);
      }
      return true;
    }
    if (this.playTime() >= this.halfSeconds * this.half) {
      if (this.half === 1) { this.phase = "halftime"; this.phaseUntil = this.time + 5; this.pendingKick = 1; this.event("HALFTIME"); return true; }
      this.finish(); return false;
    }
    // le jeu démarre à la fin du compte à rebours ou dès que le porteur touche le ballon
    if (this.phase === "kickoff" && (this.time >= this.phaseUntil || (this.owner() && this.owner().human && (this.inputs[this.ball.owner].shoot || this.inputs[this.ball.owner].pass)))) this.phase = "play";

    for (const p of this.players) this.stepPlayer(p, this.inputs[p.slot]);
    this.collidePlayers();
    this.stepBall();
    this.checkFirewalls();
    if (this.phase === "play") this.playClock += DT;
    return true;
  }

  playTime() { return this.playClock; }
  clock() { return Math.max(0, this.halfSeconds * this.half - this.playTime()); }

  stepPlayer(p, inp) {
    const t = this.time;
    if (p.kickCd > 0) p.kickCd -= DT;
    if (p.tackleCd > 0) p.tackleCd -= DT;
    const frozen = this.phase === "kickoff" && this.ball.owner !== p.slot; // seuls les joueurs du coup d'envoi bougent librement
    stepMovement(p, frozen ? { ...inp, mx: inp.mx * 0.6, mz: inp.mz * 0.6 } : inp, this);
    if (this.phase === "kickoff") { // rester dans son camp (et hors du rond central pour l'équipe qui ne donne pas le coup d'envoi)
      if (p.team === 0) p.x = Math.min(p.x, p.slot === this.ball.owner ? 0 : -0.5); else p.x = Math.max(p.x, p.slot === this.ball.owner ? 0 : 0.5);
      const kicking = this.ball.owner >= 0 && this.players[this.ball.owner].team === p.team;
      const r = Math.hypot(p.x, p.z);
      if (!kicking && r < 3.2) { const k = 3.2 / (r || 1); p.x = r ? p.x * k : (p.team === 0 ? -3.2 : 3.2); p.z *= k; }
    }
    if (inp.pu) this.activatePowerUp(p);
    if (inp.call && this.ball.owner !== p.slot && p.callUntil <= t) { p.callUntil = t + 1.6; this.event("CALL", p.slot); } // appel de balle
    const own = this.ball.owner === p.slot;
    // tir chargé : on charge tant que le bouton est maintenu, on frappe au relâchement
    if (own && inp.shoot && p.kickCd <= 0) { p.charging = true; p.charge = Math.min(1, p.charge + DT / 0.85); }
    else if (own && p.charging && !inp.shoot) { this.shoot(p, inp.aim, p.charge); p.charging = false; p.charge = 0; }
    else if (!own) { p.charging = false; p.charge = 0; }
    if (own && (inp.pass || inp.lob) && p.kickCd <= 0 && !p.charging) this.pass(p, inp.aim, inp.lob);
    if (own && inp.skill && p.skillCd <= t && p.stunUntil <= t) this.skillMove(p, inp);
    if (inp.tackle && !own) {
      if (this.isKeeper(p) && this.inOwnBox(p)) this.dive(p, inp);
      else if (p.tackleCd <= 0 && p.stunUntil <= t) this.tackle(p, inp);
    }
    if (p.action && p.actionUntil <= t) p.action = "";
  }

  collidePlayers() {
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j]; const dx = b.x - a.x, dz = b.z - a.z; const d = hyp(dx, dz); const min = PLAYER_R * 2;
      if (d < min && d > 1e-4) {
        const push = (min - d) / 2; const nx = dx / d, nz = dz / d;
        const fa = statOf(a, "Force", this), fb = statOf(b, "Force", this); const wa = fb / (fa + fb), wb = fa / (fa + fb);
        a.x -= nx * push * 2 * wa; a.z -= nz * push * 2 * wa; b.x += nx * push * 2 * wb; b.z += nz * push * 2 * wb;
      }
    }
  }

  // ── Ballon ────────────────────────────────────────────────
  stepBall() {
    const b = this.ball; const o = this.owner();
    if (o) {
      // conduite de balle : le ballon reste devant le pied du porteur
      const fx = o.fx(this);
      const off = 0.5 + (fx === "ballGlue" ? -0.1 : 0);
      const tx = o.x + Math.cos(o.facing) * off, tz = o.z + Math.sin(o.facing) * off;
      b.vx = (tx - b.x) / DT * 0.6 + o.vx * 0.4; b.vz = (tz - b.z) / DT * 0.6 + o.vz * 0.4; b.vy = 0;
      b.x += (tx - b.x) * 0.6; b.z += (tz - b.z) * 0.6; b.y = BALL_R;
      if (this.isKeeper(o) && this.inOwnBox(o) && o.holdUntil > this.time) { b.y = 1.0; }
      return;
    }
    // vol libre
    const px = b.x, pz = b.z, py = b.y;
    const sp0 = hyp(b.vx, b.vy, b.vz); if (sp0 > 40) { b.vx *= 40 / sp0; b.vy *= 40 / sp0; b.vz *= 40 / sp0; }
    b.vy -= G * DT;
    if (b.curl) { const sp = hyp(b.vx, b.vz) || 1; b.vx += -b.vz / sp * b.curl * DT; b.vz += b.vx / sp * b.curl * DT; b.curl *= 0.97; }
    b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;
    if (b.y < BALL_R) {
      b.y = BALL_R;
      if (b.vy < -1.5) { b.vy = -b.vy * 0.5; this.bounceEvt(Math.abs(b.vy)); } else b.vy = 0;
      const f = Math.exp(-0.9 * DT); b.vx *= f; b.vz *= f; // roulement
      if (hyp(b.vx, b.vz) < 0.05) { b.vx = 0; b.vz = 0; }
    } else { const f = Math.exp(-0.08 * DT); b.vx *= f; b.vz *= f; }
    this.ballWalls(px, py, pz);
    if (this.phase === "ended" || this.phase === "goal") return;
    this.touchBall(px, pz);
    if (this.ball.owner >= 0) return;
    this.checkGoal(px);
  }

  bounceEvt(v) { if (v > 2.5 && this.rng() < 0.5) this.events.push({ id: this.events.length, t: this.time, type: "BOUNCE", slot: -1, v: Math.round(v) }); }

  ballWalls(px, py, pz) {
    const b = this.ball; const HX = FIELD.HX, HZ = FIELD.HZ;
    // montants et barre transversale
    for (const gx of [-HX, HX]) {
      const crossed = (px - gx) * (b.x - gx) <= 0 || Math.abs(b.x - gx) < BALL_R + POST_R;
      if (!crossed) continue;
      for (const pzPost of [-FIELD.GOAL_HW, FIELD.GOAL_HW]) {
        if (Math.abs(b.z - pzPost) < BALL_R + POST_R && b.y < FIELD.GOAL_H + BALL_R) {
          b.vx = -b.vx * 0.75; b.vz += (b.z - pzPost) * 8; b.x = px; this.event("POST", this.ball.last); return;
        }
      }
      if (Math.abs(b.z) < FIELD.GOAL_HW && Math.abs(b.y - FIELD.GOAL_H) < BALL_R + POST_R) {
        b.vx = -b.vx * 0.6; b.vy = -Math.abs(b.vy) * 0.5 - 1; b.x = px; this.event("POST", this.ball.last, { bar: true }); return;
      }
    }
    const inMouth = Math.abs(b.z) < FIELD.GOAL_HW - BALL_R && b.y < FIELD.GOAL_H - BALL_R;
    if (!inMouth) {
      if (b.x > HX - BALL_R && px <= HX - BALL_R + 0.3) { b.x = HX - BALL_R; b.vx = -Math.abs(b.vx) * 0.7; this.bounceEvt(Math.abs(b.vx)); }
      if (b.x < -HX + BALL_R && px >= -HX + BALL_R - 0.3) { b.x = -HX + BALL_R; b.vx = Math.abs(b.vx) * 0.7; this.bounceEvt(Math.abs(b.vx)); }
    }
    if (b.z > HZ - BALL_R) { b.z = HZ - BALL_R; b.vz = -Math.abs(b.vz) * 0.7; this.bounceEvt(Math.abs(b.vz)); }
    if (b.z < -HZ + BALL_R) { b.z = -HZ + BALL_R; b.vz = Math.abs(b.vz) * 0.7; this.bounceEvt(Math.abs(b.vz)); }
    if (b.y > 8) { b.y = 8; b.vy = -Math.abs(b.vy) * 0.3; } // filet de toit de la cage vitrée
    // fond de filet
    for (const gx of [-HX, HX]) {
      const s = Math.sign(gx);
      if (s * b.x > HX + FIELD.GOAL_D - BALL_R) { b.x = gx + s * (FIELD.GOAL_D - BALL_R); b.vx = -b.vx * 0.15; b.vz *= 0.3; }
      if (s * b.x > HX && Math.abs(b.z) > FIELD.GOAL_HW - BALL_R) { b.z = Math.sign(b.z) * (FIELD.GOAL_HW - BALL_R); b.vz = -b.vz * 0.2; }
      if (s * b.x > HX && b.y > FIELD.GOAL_H - BALL_R) { b.y = FIELD.GOAL_H - BALL_R; b.vy = -Math.abs(b.vy) * 0.2; }
    }
  }

  checkGoal(px) {
    const b = this.ball;
    for (const team of [0, 1]) {
      const gx = this.goalX(team); const s = Math.sign(gx);
      if (s * px <= FIELD.HX && s * b.x > FIELD.HX && Math.abs(b.z) < FIELD.GOAL_HW && b.y < FIELD.GOAL_H) return this.goal(team);
    }
  }

  goal(team) {
    this.score[team]++;
    const last = this.ball.last >= 0 ? this.players[this.ball.last] : null;
    const scorer = last && last.team === team ? last : null;
    let assist = -1;
    if (scorer) {
      this.stats[scorer.slot].goals++;
      const prev = this.ball.prev >= 0 ? this.players[this.ball.prev] : null;
      if (prev && prev.team === team && prev.slot !== scorer.slot && this.time - (this.ball.prevT || 0) < 8) { assist = prev.slot; this.stats[assist].assists++; }
    }
    this.event("GOAL", scorer ? scorer.slot : -1, { team, own: !scorer, assist, score: [...this.score] }, scorer ? "but_marque" : null);
    this.phase = "goal"; this.phaseUntil = this.time + GOAL_PAUSE; this.pendingKick = 1 - team;
  }

  // prise de balle / déviation au contact d'un joueur
  touchBall(px = this.ball.x, pz = this.ball.z) {
    const b = this.ball; let best = null;
    const sx = b.x - px, sz = b.z - pz, sl = sx * sx + sz * sz || 1e-9;
    for (const p of this.players) {
      if ((p.stunUntil > this.time && p.diveUntil <= this.time) || p.kickCd > 0.12) continue;
      // distance au segment parcouru par le ballon pendant le tick (tirs rapides)
      const t = clamp(((p.x - px) * sx + (p.z - pz) * sz) / sl, 0, 1);
      const d = hyp(p.x - (px + sx * t), p.z - (pz + sz * t));
      const keeperHands = this.isKeeper(p) && this.inOwnBox(p);
      const reachH = keeperHands ? (p.diveUntil > this.time ? 2.4 : 2.1) : 0.9;
      if (b.y > reachH) continue;
      const ctrl = 0.55 + statOf(p, "Dribble", this) / 99 * 0.25 + (keeperHands ? 0.25 + statOf(p, "Réflexes", this) / 99 * 0.3 : 0) + (p.diveUntil > this.time ? 0.9 : 0);
      if (d < ctrl && (!best || d < best.d)) best = { p, d, keeperHands };
    }
    if (!best) return;
    const p = best.p; const rel = hyp(b.vx - p.vx, b.vz - p.vz);
    // gardien face à un tir : une seule tentative d'arrêt par tir (Réflexes, vitesse, placement, plongeon)
    if (best.keeperHands && this.pendingShot && this.pendingShot.team !== p.team && rel > 9) {
      const ps = this.pendingShot; ps.tried = ps.tried || {};
      if (ps.tried[p.slot] === false) return;           // déjà battu sur ce tir
      if (ps.tried[p.slot] === undefined) {
        const R = statOf(p, "Réflexes", this); const diving = p.diveUntil > this.time;
        const reach = diving ? 2.1 : 1.0;
        const pSave = clamp(1.03 - (rel - 12) / 26 * 0.5 - (best.d / reach) * 0.35 + (R - 60) / 100 * 0.6 + (diving ? 0.1 : 0) - (b.y > 1.6 ? 0.1 : 0), 0.08, 0.93);
        ps.tried[p.slot] = this.rng() < pSave;
        if (!ps.tried[p.slot]) { this.event("BEATEN", p.slot); return; }
      }
    }
    const limit = best.keeperHands ? 16 + statOf(p, "Réflexes", this) / 99 * 12 : 9 + statOf(p, "Dribble", this) / 99 * 7;
    const shotOnGoal = this.pendingShot && this.pendingShot.team !== p.team && this.time - this.pendingShot.t < 2.5;
    if (rel < limit) {
      if (best.keeperHands && shotOnGoal) { this.stats[p.slot].saves++; this.event("SAVE", p.slot, { catch: true }, "arret"); }
      else if (shotOnGoal && p.team !== this.pendingShot.team) this.event("BLOCK", p.slot);
      this.giveBall(p);
      if (best.keeperHands) { p.holdUntil = this.time + 6; }
    } else {
      // trop rapide : déviation (parade du gardien ou contre)
      const dl = hyp(b.x - p.x, b.z - p.z) || 1; const nx = (b.x - p.x) / dl, nz = (b.z - p.z) / dl;
      const damp = best.keeperHands ? 0.35 : 0.5;
      const vn = b.vx * nx + b.vz * nz;
      b.vx = (b.vx - 2 * vn * nx) * damp; b.vz = (b.vz - 2 * vn * nz) * damp; b.vy = Math.abs(b.vy) * 0.4 + (best.keeperHands ? 2 : 0.5);
      if (best.keeperHands && shotOnGoal) { this.stats[p.slot].saves++; this.event("SAVE", p.slot, { parry: true }, "arret"); }
      this.pendingShot = null;
      this.touch(p);
    }
  }

  touch(p) { const b = this.ball; if (b.last !== p.slot) { b.prev = b.last; b.prevT = this.time; b.last = p.slot; } this.stats[p.slot].touches++; }

  giveBall(p) {
    const b = this.ball;
    const passer = b.last >= 0 ? this.players[b.last] : null;
    if (this.pendingPass && this.pendingPass.from !== p.slot) {
      if (passer && passer.team === p.team && this.pendingPass.from === passer.slot) {
        this.stats[passer.slot].passesOk++;
        if (passer.fx(this) === "passBoost") p.boostUntil = this.time + 2.5;
      } else if (passer && passer.team !== p.team) this.event("INTERCEPT", p.slot, {}, "tacle_reussi");
    }
    this.pendingPass = null; this.pendingShot = null;
    this.touch(p);
    b.owner = p.slot; b.curl = 0;
    p.holdUntil = 0;
  }

  release(p) {
    const b = this.ball; b.owner = -1; p.kickCd = 0.3;
    b.x = p.x + Math.cos(p.facing) * 0.5; b.z = p.z + Math.sin(p.facing) * 0.5; b.y = Math.max(b.y, 0.11);
  }

  // ── Actions ───────────────────────────────────────────────
  aimAssist(p, aim) {
    const gx = this.goalX(p.team);
    const toGoal = Math.atan2(0 - p.z, gx - p.x);
    let diff = Math.atan2(Math.sin(aim - toGoal), Math.cos(aim - toGoal));
    const dGoal = hyp(gx - p.x, p.z);
    if (Math.abs(diff) < 0.6 && dGoal < 26) {
      // viser l'intérieur du cadre selon la déviation de la visée
      const tz = clamp(Math.tan(diff) * dGoal, -FIELD.GOAL_HW + 0.35, FIELD.GOAL_HW - 0.35);
      return Math.atan2(tz - p.z, gx - p.x);
    }
    return aim;
  }

  shoot(p, aim, charge) {
    const b = this.ball; const fx = p.fx(this);
    const fin = statOf(p, "Finition", this), sf = statOf(p, "Sang-froid", this), force = statOf(p, "Force", this);
    const near = this.players.filter(o => o.team !== p.team && hyp(o.x - p.x, o.z - p.z) < 2.2).length;
    const pressure = 1 + near * 0.35 * (1 - sf / 99 * 0.5);
    let dir = this.aimAssist(p, aim);
    let power = (11 + charge * 17) * (0.82 + force / 99 * 0.33);
    let err = (1 - fin / 99) * 0.16 * pressure * (1.15 - p.stamina / 100 * 0.3) * (0.5 + charge * 0.7);
    let loft = 0.8 + charge * charge * 4.2 + this.rng() * 0.6;
    if (fx === "perfectShot") { err *= 0.1; power *= 1.2; loft = Math.min(loft, 2.2); this.consumePu(p); }
    if (fx === "powerShot") { power *= p.char.powerUp.arena.value; b.curl = (this.rng() < 0.5 ? -1 : 1) * 6; this.consumePu(p); }
    dir += (this.rng() - 0.5) * 2 * err;
    loft += (this.rng() - 0.5) * err * 10;
    this.release(p);
    b.vx = Math.cos(dir) * power; b.vz = Math.sin(dir) * power; b.vy = Math.max(0.5, loft);
    this.stats[p.slot].shots++;
    // tir cadré ? (prédiction simple à la ligne de but)
    const gx = this.goalX(p.team); const tHit = (gx - b.x) / (b.vx || 1e-6);
    const onTarget = tHit > 0 && Math.abs(b.z + b.vz * tHit) < FIELD.GOAL_HW && (b.y + b.vy * tHit - 0.5 * G * tHit * tHit) < FIELD.GOAL_H;
    if (onTarget) this.stats[p.slot].onTarget++;
    this.pendingShot = { team: p.team, from: p.slot, t: this.time, onTarget };
    p.action = "kick"; p.actionUntil = this.time + 0.35;
    this.event("SHOT", p.slot, { power: Math.round(power), onTarget });
  }

  passTarget(p, aim) {
    let best = null;
    for (const m of this.players) {
      if (m.team !== p.team || m === p) continue;
      const dx = m.x - p.x, dz = m.z - p.z, d = hyp(dx, dz);
      if (d < 1.5) continue;
      const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dz, dx) - aim), Math.cos(Math.atan2(dz, dx) - aim)));
      if (ang > 1.0) continue;
      const sc = ang * 3 + d * 0.04;
      if (!best || sc < best.sc) best = { m, sc, d };
    }
    return best;
  }

  pass(p, aim, lob) {
    const b = this.ball; const fx = p.fx(this);
    const vis = statOf(p, "Vision", this);
    const tgt = this.passTarget(p, aim);
    let dir = aim, d = 12;
    if (tgt) {
      const lead = Math.min(0.9, tgt.d / 16);
      const tx = tgt.m.x + tgt.m.vx * lead, tz = tgt.m.z + tgt.m.vz * lead;
      dir = Math.atan2(tz - p.z, tx - p.x); d = hyp(tx - p.x, tz - p.z);
    }
    let err = (1 - vis / 99) * 0.12 * (1.2 - p.stamina / 100 * 0.3);
    if (fx === "perfectPass") err = 0;
    dir += (this.rng() - 0.5) * 2 * err;
    this.release(p);
    if (lob) {
      const T = clamp(d / 11, 0.6, 1.6); const v = d / T * (fx === "perfectPass" ? 1 : 1 + (this.rng() - 0.5) * err * 2);
      b.vx = Math.cos(dir) * v * 0.93; b.vz = Math.sin(dir) * v * 0.93; b.vy = G * T / 2;
    } else {
      const v = clamp(d * 1.45 + 5, 8, 21) * (fx === "perfectPass" ? 1.15 : 1);
      b.vx = Math.cos(dir) * v; b.vz = Math.sin(dir) * v; b.vy = 0.3;
    }
    this.stats[p.slot].passes++;
    this.pendingPass = { from: p.slot, t: this.time };
    p.action = "pass"; p.actionUntil = this.time + 0.3;
  }

  tackle(p, inp) {
    const o = this.owner(); const fx = p.fx(this);
    const slide = inp.sprint || p.sprinting;
    let reach = (slide ? 2.3 : 1.35) * (fx === "tackleRange" ? p.char.powerUp.arena.value : 1);
    p.tackleCd = slide ? 1.1 : 0.55; p.action = slide ? "tackle" : "poke"; p.actionUntil = this.time + (slide ? 0.55 : 0.3);
    if (slide) { const s = 7.5; p.vx = Math.cos(p.facing) * s; p.vz = Math.sin(p.facing) * s; }
    if (!o || o.team === p.team) {
      // tacle sur ballon libre : dégagement
      const b = this.ball; if (this.ball.owner < 0 && hyp(b.x - p.x, b.z - p.z) < reach * 0.7 && b.y < 0.6) { this.touch(p); b.vx = Math.cos(p.facing) * 9; b.vz = Math.sin(p.facing) * 9; b.vy = 1; }
      if (slide) p.stunUntil = this.time + 0.45;
      return;
    }
    const d = hyp(o.x - p.x, o.z - p.z);
    if (d > reach) { if (slide) p.stunUntil = this.time + 0.6; return; }
    const ofx = o.fx(this);
    let pr = clamp(0.42 + (statOf(p, "Tacle", this) - statOf(o, "Dribble", this)) / 100 * 0.9 + (statOf(p, "Force", this) - statOf(o, "Force", this)) / 100 * 0.25 + (slide ? 0.08 : 0), 0.12, 0.9);
    if (fx === "sureTackle") { pr = 1; this.consumePu(p); }
    if (ofx === "tackleImmune" || o.protectedUntil > this.time) pr = 0;
    if (o.skillUntil > this.time) pr *= 1 - statOf(o, "Dribble", this) / 99 * 0.75; // crochet réussi
    if (this.isKeeper(o) && this.inOwnBox(o) && o.holdUntil > this.time) pr = 0;
    if (this.rng() < pr) {
      this.stats[p.slot].tackles++;
      const b = this.ball; this.release(o); o.kickCd = 0.5; o.stunUntil = this.time + 0.45;
      this.touch(p);
      if (slide) { b.vx = Math.cos(p.facing) * 6; b.vz = Math.sin(p.facing) * 6; b.vy = 0.4; } else this.giveBall(p);
      this.event("TACKLE", p.slot, { victim: o.slot }, "tacle_reussi");
    } else {
      const foul = d < 1.1 && this.rng() < (slide ? 0.35 : 0.15) && pr > 0;
      if (foul) {
        this.stats[p.slot].fouls++;
        p.stunUntil = this.time + 1.4; o.protectedUntil = this.time + 1.5;
        for (const q of this.players) if (q.team !== o.team && hyp(q.x - o.x, q.z - o.z) < 3) { const k = 3 / (hyp(q.x - o.x, q.z - o.z) || 1); q.x = o.x + (q.x - o.x) * k; q.z = o.z + (q.z - o.z) * k; }
        this.event("FOUL", p.slot, { victim: o.slot }, "faute");
      } else if (slide) p.stunUntil = this.time + 0.8;
    }
  }

  // crochet : écart latéral explosif ballon au pied ; les tacles pendant l'esquive échouent souvent
  skillMove(p, inp) {
    const side = inp.mx || inp.mz ? Math.sign(Math.cos(p.facing) * (inp.mz || 0) - Math.sin(p.facing) * (inp.mx || 0)) || 1 : (this.rng() < 0.5 ? -1 : 1);
    const perp = p.facing + side * Math.PI / 2; const s = 4 + statOf(p, "Dribble", this) / 99 * 3;
    p.vx += Math.cos(perp) * s; p.vz += Math.sin(perp) * s;
    p.skillUntil = this.time + 0.4; p.skillCd = this.time + 1.6 - statOf(p, "Dribble", this) / 99 * 0.6;
    p.action = "kick"; p.actionUntil = this.time + 0.2;
    this.event("SKILL", p.slot, {}, "dribble_reussi");
  }

  dive(p, inp) {
    if (p.diveUntil > this.time || p.tackleCd > 0) return;
    const b = this.ball;
    const dirZ = inp.mz !== 0 ? Math.sign(inp.mz) : Math.sign((b.z + b.vz * 0.3) - p.z) || 1;
    const reflex = statOf(p, "Réflexes", this);
    const s = 4.5 + reflex / 99 * 4.5;
    p.vx = (inp.mx || 0) * 2; p.vz = dirZ * s; p.diveUntil = this.time + 0.55; p.diveDir = dirZ;
    p.stunUntil = this.time + 0.9; p.tackleCd = 1.2; p.action = "dive"; p.actionUntil = this.time + 0.9;
  }

  activatePowerUp(p) {
    const pu = p.char.powerUp; if (!pu || p.puCd > this.time || this.phase !== "play" && this.phase !== "kickoff") return false;
    const fx = pu.arena;
    p.puUntil = this.time + fx.duration; p.puCd = this.time + fx.cooldown;
    this.stats[p.slot].powerups++;
    if (fx.effect === "teamStamina") for (const q of this.players) if (q.team === p.team) q.stamina = Math.min(100, q.stamina + fx.value);
    if (fx.effect === "teamAura") this.auras.push({ team: p.team, until: p.puUntil, value: fx.value });
    if (fx.effect === "slowAura") this.slows.push({ team: p.team, until: p.puUntil, value: fx.value, radius: fx.radius, get x() { return p.x; }, get z() { return p.z; } });
    this.event("POWERUP", p.slot, { pu: pu.id, effect: fx.effect }, "power_up");
    return true;
  }

  consumePu(p) { p.puUntil = Math.min(p.puUntil, this.time + 0.05); }

  checkFirewalls() {
    const o = this.owner(); if (!o) return;
    for (const p of this.players) {
      if (p.team === o.team || p.fx(this) !== "firewall") continue;
      if (hyp(p.x - o.x, p.z - o.z) < p.char.powerUp.arena.radius) {
        this.release(o); o.kickCd = 0.6;
        const b = this.ball; const d = hyp(p.x - b.x, p.z - b.z) || 1;
        b.vx = (p.x - b.x) / d * 5; b.vz = (p.z - b.z) / d * 5; b.vy = 1.2;
        this.event("FIREWALL", p.slot, { victim: o.slot });
        return;
      }
    }
  }

  finish() {
    this.phase = "ended";
    const r = this.ratings();
    this.event("END", -1, { score: [...this.score], mvp: r.mvp });
  }

  ratings() {
    const res = this.players.map((p, i) => {
      const s = this.stats[i]; const won = Math.sign(this.score[p.team] - this.score[1 - p.team]);
      const conceded = this.score[1 - p.team];
      let r = 6 + s.goals * 1.1 + s.assists * 0.7 + s.onTarget * 0.15 + s.saves * 0.35 + s.tackles * 0.2 + s.passesOk * 0.04 - s.fouls * 0.15 + won * 0.4;
      if (this.isKeeper(p)) r -= conceded * 0.25;
      return Math.round(clamp(r, 3, 10) * 10) / 10;
    });
    let mvp = 0; res.forEach((r, i) => { if (r > res[mvp]) mvp = i; });
    return { ratings: res, mvp };
  }

  // ── Vue réseau compacte ──────────────────────────────────
  snapshot() {
    const r2 = v => Math.round(v * 100) / 100;
    const b = this.ball;
    return {
      k: this.tick, t: r2(this.time), ph: this.phase, h: this.half, c: Math.ceil(this.clock()), s: [...this.score],
      b: [r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz), b.owner],
      p: this.players.map(p => [r2(p.x), r2(p.z), r2(p.vx), r2(p.vz), r2(p.facing), Math.round(p.stamina),
        (p.sprinting ? 1 : 0) | (p.stunUntil > this.time ? 2 : 0) | (p.diveUntil > this.time ? 4 : 0) | (p.puUntil > this.time ? 8 : 0) | (p.charging ? 16 : 0) | (p.holdUntil > this.time ? 32 : 0) | (p.callUntil > this.time ? 64 : 0),
        r2(p.charge), p.action, Math.max(0, r2(p.puCd - this.time)), p.diveDir]),
    };
  }
}
