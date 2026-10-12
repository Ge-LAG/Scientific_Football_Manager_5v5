// ═══════════════════════════════════════════════════════════════
// Simulation de l'Arène 5v5 (mode Action) — autoritaire, 30 Hz.
// Repère : x = longueur [-20, 20] (l'équipe 0 attaque vers +x), z = largeur [-12, 12], y = hauteur.
// Arène fermée par des parois vitrées : le ballon rebondit, le jeu ne s'arrête jamais.
// Les 9 caractéristiques des scientifiques pilotent vitesse, contrôle, tirs, passes, tacles et arrêts.
// ═══════════════════════════════════════════════════════════════
import { makeRng } from "../rng.js";
import { getPlayer, getPowerUp, sanitizeLoadout, withStats, narrKey } from "../data/content.js";

export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;
export const FIELD = { L: 40, W: 24, HX: 20, HZ: 12, GOAL_HW: 2.5, GOAL_H: 2.2, GOAL_D: 1.2, BOX_D: 6, BOX_HW: 6 };
const BALL_R = 0.11, PLAYER_R = 0.42, G = 9.81, POST_R = 0.06;
export const GOAL_PAUSE = 6.2; // s : célébration + ralenti côté client
export const PEN_D = 5.2;       // distance du point de penalty à la ligne de but
const FK_DIST = 4.5;            // distance imposée aux adversaires sur coup franc
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hyp = Math.hypot;

// Positions de base (équipe 0, attaque vers +x) : gardien, défenseur, milieux, attaquant.
export const BASE = [{ x: -18.3, z: 0 }, { x: -12, z: 0 }, { x: -7, z: -6 }, { x: -7, z: 6 }, { x: -2.2, z: 0 }];
export const ROLES = ["gk", "def", "mid", "mid", "att"];

export const emptyInput = () => ({ mx: 0, mz: 0, aim: 0, sprint: false, shoot: false, pass: false, lob: false, tackle: false, press: false, pu: false, pu2: false, call: false, skill: false });

// Effet Arène d'un power-up actif du joueur (ou null). p.pus = [{ def, until, cd }] (sélection de 2).
export function activeFx(p, effect, sim) {
  for (const u of p.pus) if (u.until > sim.time && u.def.arena.effect === effect) return u.def.arena;
  return null;
}
// Multiplicateur d'équipe (vitesse, gardien…) : produit des auras actives de ce type.
export function teamMul(sim, team, kind) {
  let m = 1;
  for (const a of sim.auras) if (a.kind === kind && a.team === team && a.until > sim.time) m *= a.value;
  return m;
}

// Caractéristique effective (base + bonus actifs + fatigue).
export function statOf(p, key, sim) {
  let v = p.char.attributs[key] ?? 50;
  for (const u of p.pus) if (u.until > sim.time) v += u.def.buffs?.[key] || 0;
  for (const a of sim.auras) if (a.kind === "mind" && a.team === p.team && a.until > sim.time && (key === "Vision" || key === "Sang-froid")) v += a.value;
  for (const a of sim.slows) if (a.team !== p.team && a.until > sim.time && key === "Sang-froid") v -= 8;
  if (p.stamina < 40) v *= 0.82 + 0.18 * (p.stamina / 40);
  return clamp(v, 1, 99);
}

export function maxSpeed(p, sim) {
  const vit = statOf(p, "Vitesse", sim);
  let s = 4.6 + vit / 99 * 3.0;
  for (const e of SPEED_FX) { const a = activeFx(p, e, sim); if (a) s *= a.value || 1.1; }
  s *= teamMul(sim, p.team, "speed");
  if (sim.ball.owner === p.slot) s *= 0.86 + statOf(p, "Dribble", sim) / 99 * 0.12;
  for (const a of sim.slows) if (a.team !== p.team && a.until > sim.time && hyp(a.x - p.x, a.z - p.z) < a.radius) s *= a.value;
  if (p.boostUntil > sim.time) s *= 1.18;
  if (p.feintedUntil > sim.time) s *= 0.45;       // mis dans le vent par une feinte / un petit pont
  if (p.spinUntil > sim.time) s *= 0.7;           // roulette en cours
  if (p.pressedUntil > sim.time && sim.ball.owner === p.slot) s *= 0.9 + statOf(p, "Force", sim) / 99 * 0.08; // porteur harcelé (la Force aide à protéger le ballon)
  return s;
}

const SPEED_FX = ["speedBoost", "ballGlue", "freeSprint"];

// Intégration du déplacement d'un joueur (partagée avec la prédiction côté client).
export function stepMovement(p, input, sim, dt = DT) {
  const stunned = p.stunUntil > sim.time;
  let mx = input.mx || 0, mz = input.mz || 0;
  const m = hyp(mx, mz); if (m > 1) { mx /= m; mz /= m; }
  const canSprint = input.sprint && p.stamina > 8 && !stunned && m > 0.1;
  let vmax = maxSpeed(p, sim) * (canSprint ? 1.35 : 1) * (stunned ? 0.25 : 1);
  if (p.diveUntil > sim.time) vmax = 0; // plongeon : trajectoire propre
  const dashing = p.dashUntil > sim.time; // élan d'un power-up « dash » : on conserve la vitesse
  const acc = (16 + statOf(p, "Vitesse", sim) / 99 * 10) * (stunned ? 0.3 : 1);
  const tvx = mx * vmax, tvz = mz * vmax;
  const dvx = tvx - p.vx, dvz = tvz - p.vz, dv = hyp(dvx, dvz);
  if (dashing && p.diveUntil <= sim.time) { p.vx *= 0.985; p.vz *= 0.985; }
  else if (p.diveUntil <= sim.time) {
    if (dv <= acc * dt) { p.vx = tvx; p.vz = tvz; } else { p.vx += dvx / dv * acc * dt; p.vz += dvz / dv * acc * dt; }
  } else { p.vx *= 0.9; p.vz *= 0.9; }
  p.x += p.vx * dt; p.z += p.vz * dt;
  const sp = hyp(p.vx, p.vz);
  if (sp > 0.3) p.facing = Math.atan2(p.vz, p.vx);
  else if (input.aimFace) p.facing = input.aim;
  // endurance
  const free = !!(activeFx(p, "noStaminaDrain", sim) || activeFx(p, "freeSprint", sim));
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
   * @param {{ slots: {charId:string, name?:string, human?:boolean, loadout?:string[]}[10], seed?:number, halfSeconds?:number }} o
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
    const base = getPlayer(s.charId);
    if (!base) throw new Error("Personnage inconnu : " + s.charId);
    const char = withStats(base, s.stats); // répartition du joueur (sinon profil par défaut)
    const team = slot < 5 ? 0 : 1; const role = ROLES[slot % 5];
    const p = {
      slot, team, role, char, name: s.name || char.nom, human: !!s.human,
      x: 0, z: 0, vx: 0, vz: 0, facing: team === 0 ? 0 : Math.PI, stamina: 100, sprinting: false,
      charge: 0, charging: false, kickCd: 0, tackleCd: 0, stunUntil: 0, diveUntil: 0, diveDir: 0, action: "", actionUntil: 0,
      boostUntil: 0, dashUntil: 0, protectedUntil: 0, holdUntil: 0, callUntil: 0, skillCd: 0,
      dodgeUntil: 0, dodge: 0, feintedUntil: 0, spinUntil: 0, pressCd: 0, pressedUntil: 0, pressing: false,
      // sélection de 2 power-ups (chacun avec sa durée et sa recharge)
      pus: sanitizeLoadout(char.id, s.loadout).map(id => ({ def: getPowerUp(id), until: 0, cd: 0 })),
    };
    p.fx = sim => { for (const u of p.pus) if (u.until > sim.time) return u.def.arena.effect; return null; }; // premier effet actif
    return p;
  }

  setSlot(slot, s) { // un humain remplace un bot (ou l'inverse) en conservant la position
    const old = this.players[slot];
    const np = this.makePlayer(slot, { loadout: old.pus.map(u => u.def.id), stats: old.char.custom ? old.char.attributs : undefined, ...s });
    for (const k of ["x", "z", "vx", "vz", "facing", "stamina"]) np[k] = old[k];
    if (old.char.id === np.char.id) for (const u of np.pus) { const o = old.pus.find(x => x.def.id === u.def.id); if (o) { u.until = o.until; u.cd = o.cd; } }
    this.players[slot] = np; this.inputs[slot] = emptyInput();
  }

  // changement de joueur contrôlé : seul le pilote change (humain ↔ bot), l'état de jeu est conservé
  setControl(slot, human, name) {
    const p = this.players[slot]; if (!p) return;
    p.human = !!human; p.name = name || p.char.nom;
    p.charging = false; p.charge = 0;
    this.inputs[slot] = emptyInput();
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

    if (this.phase === "setpiece" && this.time >= this.setPiece.until) this.autoTakeSetPiece();
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
    if (this.phase === "setpiece") this.holdSetPiece();
    this.stepBall();
    if (this.phase === "play") this.checkFirewalls();
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
    // pressing : on harcèle le porteur adverse (poursuite automatique, récupérations plus propres mais moins sûres)
    const o = this.owner(); let mv = frozen ? { ...inp, mx: inp.mx * 0.6, mz: inp.mz * 0.6 } : inp;
    p.pressing = false;
    if (inp.press && o && o.team !== p.team && this.phase === "play" && !(this.isKeeper(p) && this.inOwnBox(p))) {
      const d = hyp(o.x - p.x, o.z - p.z);
      if (d < 14) {
        const tx = o.x + o.vx * 0.25 - p.x, tz = o.z + o.vz * 0.25 - p.z, dl = hyp(tx, tz) || 1;
        const has = hyp(inp.mx, inp.mz) > 0.2;
        mv = { ...inp, mx: has ? (inp.mx + tx / dl) / 2 : tx / dl, mz: has ? (inp.mz + tz / dl) / 2 : tz / dl };
        p.pressing = true;
        if (d < 1.4) o.pressedUntil = t + 0.15;
        if (d < 1.25 && p.pressCd <= t && p.stunUntil <= t && p.feintedUntil <= t) this.pressSteal(p, o);
      }
    }
    stepMovement(p, mv, this);
    if (p.pressing && hyp(p.vx, p.vz) > 1) p.stamina = Math.max(0, p.stamina - DT * 2.2 * (1.25 - statOf(p, "Endurance", this) / 99 * 0.6)); // le pressing fatigue
    if (this.phase === "kickoff") { // rester dans son camp (et hors du rond central pour l'équipe qui ne donne pas le coup d'envoi)
      if (p.team === 0) p.x = Math.min(p.x, p.slot === this.ball.owner ? 0 : -0.5); else p.x = Math.max(p.x, p.slot === this.ball.owner ? 0 : 0.5);
      const kicking = this.ball.owner >= 0 && this.players[this.ball.owner].team === p.team;
      const r = Math.hypot(p.x, p.z);
      if (!kicking && r < 3.2) { const k = 3.2 / (r || 1); p.x = r ? p.x * k : (p.team === 0 ? -3.2 : 3.2); p.z *= k; }
    }
    if (this.phase === "setpiece" && !this.setPieceMove(p, inp)) return; // coup de pied arrêté : tireur immobile, autres limités
    if (inp.pu) this.activatePowerUp(p, 0);
    if (inp.pu2) this.activatePowerUp(p, 1);
    if (inp.call && this.ball.owner !== p.slot && p.callUntil <= t) { p.callUntil = t + 1.6; this.event("CALL", p.slot); } // appel de balle
    const own = this.ball.owner === p.slot;
    const aim = this.phase === "setpiece" && this.setPiece?.taker === p.slot ? p.facing : inp.aim; // coup de pied arrêté : direction choisie
    // tir chargé : on charge tant que le bouton est maintenu, on frappe au relâchement
    if (p.shootLock && !inp.shoot) p.shootLock = false; // la touche de tir doit être relâchée après une récupération
    if (own && inp.shoot && p.kickCd <= 0 && !p.shootLock) { p.charging = true; p.charge = Math.min(1, p.charge + DT / 0.85); }
    else if (own && p.charging && !inp.shoot) { this.shoot(p, aim, p.charge); p.charging = false; p.charge = 0; }
    else if (!own) { p.charging = false; p.charge = 0; }
    if (own && (inp.pass || inp.lob) && p.kickCd <= 0 && !p.charging) this.pass(p, aim, inp.lob);
    if (inp.skill && p.skillCd <= t && p.stunUntil <= t && this.phase !== "setpiece") this.skillMove(p, inp);
    if (inp.tackle && !own) {
      if (this.isKeeper(p) && this.inOwnBox(p)) this.dive(p, inp);
      else if (p.tackleCd <= 0 && p.stunUntil <= t && this.phase !== "setpiece") this.tackle(p, inp);
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
      const off = 0.5 + (activeFx(o, "ballGlue", this) ? -0.1 : 0);
      const tx = o.x + Math.cos(o.facing) * off, tz = o.z + Math.sin(o.facing) * off;
      b.vx = (tx - b.x) / DT * 0.6 + o.vx * 0.4; b.vz = (tz - b.z) / DT * 0.6 + o.vz * 0.4; b.vy = 0;
      b.x += (tx - b.x) * 0.6; b.z += (tz - b.z) * 0.6; b.y = BALL_R;
      if (this.isKeeper(o) && this.inOwnBox(o) && o.holdUntil > this.time) { b.y = 1.0; }
      return;
    }
    // vol libre
    const px = b.x, pz = b.z, py = b.y;
    this.applyMagnets();
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

  // power-up « aimant » : un ballon libre à portée est attiré vers le joueur
  applyMagnets() {
    const b = this.ball; if (b.y > 1.6) return;
    for (const p of this.players) {
      const m = activeFx(p, "magnet", this); if (!m) continue;
      const dx = p.x - b.x, dz = p.z - b.z, d = hyp(dx, dz);
      if (d > (m.radius || 5) || d < 0.3) continue;
      const k = 16 * DT * (1 - d / (m.radius || 5) * 0.5);
      b.vx += dx / d * k; b.vz += dz / d * k;
    }
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
      const wall = keeperHands ? teamMul(this, p.team, "keeper") : 1; // power-up « mur » : allonge du gardien
      const reachH = keeperHands ? (p.diveUntil > this.time ? 2.4 : 2.1) * Math.min(1.25, wall) : 0.9;
      if (b.y > reachH) continue;
      const ctrl = 0.5 + statOf(p, "Dribble", this) / 99 * 0.25 + statOf(p, "Réflexes", this) / 99 * (keeperHands ? 0.55 : 0.12) + (keeperHands ? 0.25 : 0) + (p.diveUntil > this.time ? 0.9 : 0) + (wall - 1) * 0.9;
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
        const wall = teamMul(this, p.team, "keeper"); const curling = Math.abs(b.curl) > 3 && ps.curl;
        const pSave = clamp(1.03 - (rel - 12) / 26 * 0.5 - (best.d / reach) * 0.35 + (R - 60) / 100 * 0.6 + (diving ? 0.1 : 0) - (b.y > 1.6 ? 0.1 : 0) + (wall - 1) * 0.6 - (curling ? 0.15 : 0) - (ps.penalty ? 0.3 : 0), 0.08, 0.95);
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
      if (this.pendingPass.self) { /* une-deux avec la paroi / petit pont : pas une passe */ }
      else if (passer && passer.team === p.team && this.pendingPass.from === passer.slot) {
        this.stats[passer.slot].passesOk++;
        if (activeFx(passer, "passBoost", this)) p.boostUntil = this.time + 2.5;
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
    const b = this.ball;
    const fin = statOf(p, "Finition", this), sf = statOf(p, "Sang-froid", this), force = statOf(p, "Force", this);
    const near = this.players.filter(o => o.team !== p.team && hyp(o.x - p.x, o.z - p.z) < 2.2).length;
    let pressure = 1 + near * 0.35 * (1 - sf / 99 * 0.5);
    const sp = this.phase === "setpiece" ? this.setPiece : null;
    if (sp) pressure *= sp.kind === "penalty" ? 1.35 - sf / 99 * 0.8 : 1.15 - sf / 99 * 0.4; // la pression du face-à-face
    let dir = this.aimAssist(p, aim);
    let power = (11 + charge * 17) * (0.82 + force / 99 * 0.33);
    let err = (1 - fin / 99) * 0.16 * pressure * (1.15 - p.stamina / 100 * 0.3) * (0.5 + charge * 0.7);
    let loft = 0.8 + charge * charge * 4.2 + this.rng() * 0.6;
    let curl = 0;
    if (activeFx(p, "perfectShot", this)) { err *= 0.1; power *= 1.2; loft = Math.min(loft, 2.2); this.consumePu(p, "perfectShot"); }
    const ps = activeFx(p, "powerShot", this);
    if (ps) { power *= ps.value || 1.3; curl = (this.rng() < 0.5 ? -1 : 1) * 6; this.consumePu(p, "powerShot"); }
    const cs = activeFx(p, "curlShot", this);
    if (cs) {
      // frappe enveloppée : part vers l'extérieur puis revient dans le cadre (plus dure à arrêter)
      const toward = Math.sign(-p.z) || 1; const dGoal = hyp(this.goalX(p.team) - p.x, p.z); const T = dGoal / power; const k = 0.914;
      curl = (cs.value || 8) * toward * (Math.sign(Math.cos(dir)) || 1);
      const drift = (cs.value || 8) * (T / k - (1 - Math.exp(-k * T)) / (k * k));
      dir -= toward * (Math.sign(Math.cos(dir)) || 1) * Math.min(0.35, drift / Math.max(4, dGoal));
      err *= 0.6; loft = Math.min(loft, 2.4); this.consumePu(p, "curlShot");
    }
    dir += (this.rng() - 0.5) * 2 * err;
    loft += (this.rng() - 0.5) * err * 10;
    this.release(p);
    if (sp) this.endSetPiece();
    b.vx = Math.cos(dir) * power; b.vz = Math.sin(dir) * power; b.vy = Math.max(0.5, loft); b.curl = curl;
    this.stats[p.slot].shots++;
    // tir cadré ? (prédiction simple à la ligne de but)
    const gx = this.goalX(p.team); const tHit = (gx - b.x) / (b.vx || 1e-6);
    const onTarget = tHit > 0 && Math.abs(b.z + b.vz * tHit) < FIELD.GOAL_HW && (b.y + b.vy * tHit - 0.5 * G * tHit * tHit) < FIELD.GOAL_H;
    if (onTarget) this.stats[p.slot].onTarget++;
    this.pendingShot = { team: p.team, from: p.slot, t: this.time, onTarget, curl: !!cs, penalty: sp?.kind === "penalty" };
    p.action = "kick"; p.actionUntil = this.time + 0.35;
    this.event("SHOT", p.slot, { power: Math.round(power), onTarget });
  }

  passTarget(p, aim) {
    let best = null; const tol = 0.75 + statOf(p, "Vision", this) / 99 * 0.5; // la Vision trouve des partenaires plus excentrés
    for (const m of this.players) {
      if (m.team !== p.team || m === p) continue;
      const dx = m.x - p.x, dz = m.z - p.z, d = hyp(dx, dz);
      if (d < 1.5) continue;
      const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dz, dx) - aim), Math.cos(Math.atan2(dz, dx) - aim)));
      if (ang > tol) continue;
      const sc = ang * 3 + d * 0.04;
      if (!best || sc < best.sc) best = { m, sc, d };
    }
    return best;
  }

  pass(p, aim, lob) {
    const b = this.ball; const perfect = !!activeFx(p, "perfectPass", this);
    const vis = statOf(p, "Vision", this);
    const tgt = this.passTarget(p, aim);
    let dir = aim, d = 12;
    if (tgt) {
      const lead = Math.min(0.9, tgt.d / 16) * (0.7 + vis / 99 * 0.45); // anticipation de la course du receveur
      const tx = tgt.m.x + tgt.m.vx * lead, tz = tgt.m.z + tgt.m.vz * lead;
      dir = Math.atan2(tz - p.z, tx - p.x); d = hyp(tx - p.x, tz - p.z);
    }
    let err = (1 - vis / 99) * 0.12 * (1.2 - p.stamina / 100 * 0.3);
    if (perfect) err = 0;
    dir += (this.rng() - 0.5) * 2 * err;
    this.release(p);
    if (this.phase === "setpiece") this.endSetPiece();
    if (lob) {
      const T = clamp(d / 11, 0.6, 1.6); const v = d / T * (perfect ? 1 : 1 + (this.rng() - 0.5) * err * 2);
      b.vx = Math.cos(dir) * v * 0.93; b.vz = Math.sin(dir) * v * 0.93; b.vy = G * T / 2;
    } else {
      const v = clamp(d * 1.45 + 5, 8, 21) * (perfect ? 1.15 : 1);
      b.vx = Math.cos(dir) * v; b.vz = Math.sin(dir) * v; b.vy = 0.3;
    }
    this.stats[p.slot].passes++;
    this.pendingPass = { from: p.slot, t: this.time };
    p.action = "pass"; p.actionUntil = this.time + 0.3;
  }

  // Tacle (une seule touche) : debout au contact, glissé si l'on court ou si l'adversaire est un peu loin.
  // Aucun étourdissement du tacleur : seulement un court délai avant le suivant.
  tackle(p, inp) {
    const t = this.time; const o = this.owner(); const tr = activeFx(p, "tackleRange", this);
    const opp = o && o.team !== p.team ? o : null;
    const dO = opp ? hyp(opp.x - p.x, opp.z - p.z) : 99;
    const slide = !!(inp.sprint || p.sprinting || (dO > 1.45 && dO < 3.2));
    const reach = (slide ? 2.3 : 1.35) * (tr ? tr.value || 1.5 : 1);
    p.tackleCd = slide ? 0.9 : 0.5; p.action = slide ? "tackle" : "poke"; p.actionUntil = t + (slide ? 0.5 : 0.3);
    if (slide) { // élan vers l'adversaire s'il est à portée, sinon droit devant
      const dir = opp && dO < reach * 1.3 ? Math.atan2(opp.z - p.z, opp.x - p.x) : p.facing; const s = 7 + statOf(p, "Vitesse", this) / 99 * 1.5;
      p.vx = Math.cos(dir) * s; p.vz = Math.sin(dir) * s; p.facing = dir;
    }
    if (!opp) {
      // tacle sur ballon libre : dégagement
      const b = this.ball; if (this.ball.owner < 0 && hyp(b.x - p.x, b.z - p.z) < reach * 0.7 && b.y < 0.6) { this.touch(p); b.vx = Math.cos(p.facing) * 9; b.vz = Math.sin(p.facing) * 9; b.vy = 1; }
      return;
    }
    if (dO > reach) return; // raté, sans étourdissement
    let pr = clamp(0.44 + (statOf(p, "Tacle", this) - statOf(opp, "Dribble", this)) / 100 * 0.9 + (statOf(p, "Force", this) - statOf(opp, "Force", this)) / 100 * 0.25
      + (statOf(p, "Réflexes", this) - 60) / 100 * 0.08 + (slide ? 0.06 : 0), 0.12, 0.9);
    if (activeFx(p, "sureTackle", this)) { pr = 1; this.consumePu(p, "sureTackle"); }
    if (p.feintedUntil > t) pr *= 0.5;                                   // défenseur mis dans le vent
    if (opp.dodgeUntil > t) pr *= 1 - opp.dodge;                          // geste technique en cours
    if (activeFx(opp, "tackleImmune", this) || opp.protectedUntil > t) pr = 0;
    if (this.isKeeper(opp) && this.inOwnBox(opp) && opp.holdUntil > t) pr = 0;
    if (this.rng() < pr) {
      this.stats[p.slot].tackles++;
      const b = this.ball; this.release(opp); opp.kickCd = 0.5; opp.stunUntil = t + 0.3;
      this.touch(p);
      if (slide) { b.vx = Math.cos(p.facing) * 6; b.vz = Math.sin(p.facing) * 6; b.vy = 0.4; } else this.giveBall(p);
      p.shootLock = true;
      this.event("TACKLE", p.slot, { victim: opp.slot, slide }, "tacle_reussi");
    } else if (pr > 0 && dO < 1.25) {
      // faute : plus fréquente en glissé et par derrière, rare pour les bons défenseurs
      const behind = Math.cos(opp.facing) * (p.x - opp.x) + Math.sin(opp.facing) * (p.z - opp.z) < -0.3 * dO;
      if (this.rng() < (slide ? 0.32 : 0.16) * this.foulFactor(p) * (behind ? 1.6 : 1)) this.foul(p, opp, slide ? "slide" : "tackle");
    }
  }

  // Discipline : plus les caractéristiques défensives sont élevées, moins on commet de fautes
  foulFactor(p) {
    const def = statOf(p, "Tacle", this) * 0.6 + statOf(p, "Sang-froid", this) * 0.3 + statOf(p, "Vision", this) * 0.1;
    return clamp(1.4 - def / 99 * 1.05, 0.3, 1.3);
  }

  // Pressing : tentative de récupération au contact, moins efficace qu'un tacle mais bien plus propre
  pressSteal(p, o) {
    const t = this.time; p.pressCd = t + 0.55;
    const atk = statOf(p, "Tacle", this) * 0.55 + statOf(p, "Force", this) * 0.2 + statOf(p, "Vitesse", this) * 0.1 + statOf(p, "Réflexes", this) * 0.15;
    const dfn = statOf(o, "Dribble", this) * 0.6 + statOf(o, "Force", this) * 0.25 + statOf(o, "Sang-froid", this) * 0.15;
    let pr = clamp(0.16 + (atk - dfn) / 100 * 0.6, 0.04, 0.42);
    if (o.dodgeUntil > t) pr *= 1 - o.dodge;
    if (activeFx(o, "tackleImmune", this) || o.protectedUntil > t || (this.isKeeper(o) && this.inOwnBox(o) && o.holdUntil > t)) pr = 0;
    p.action = "press"; p.actionUntil = t + 0.25;
    if (this.rng() < pr) {
      this.stats[p.slot].tackles++;
      this.release(o); o.kickCd = 0.4; this.giveBall(p); p.shootLock = true;
      this.event("TACKLE", p.slot, { victim: o.slot, press: true }, "tacle_reussi");
    } else if (pr > 0 && this.rng() < 0.012 * this.foulFactor(p)) this.foul(p, o, "press");
  }

  // ── Fautes, coups francs et penaltys (pas de cartons) ──
  foul(p, o, kind) {
    this.stats[p.slot].fouls++;
    this.event("FOUL", p.slot, { victim: o.slot, kind }, "faute");
    const gx = this.ownGoalX(p.team); // but défendu par le fautif
    const inBox = Math.abs(o.x - gx) < FIELD.BOX_D && Math.abs(o.z) < FIELD.BOX_HW;
    this.startSetPiece(inBox ? "penalty" : "freekick", o);
  }

  startSetPiece(kind, taker) {
    const t = this.time; const team = taker.team; const gx = this.goalX(team); const s = Math.sign(gx);
    let x = clamp(taker.x, -FIELD.HX + 1, FIELD.HX - 1), z = clamp(taker.z, -FIELD.HZ + 1, FIELD.HZ - 1);
    if (kind === "penalty") { x = gx - s * PEN_D; z = 0; }
    this.setPiece = { kind, team, taker: taker.slot, x, z, readyAt: t + 1.2, until: t + (kind === "penalty" ? 9 : 8) };
    this.phase = "setpiece"; this.pendingShot = null; this.pendingPass = null;
    for (const q of this.players) { q.charging = false; q.charge = 0; q.diveUntil = 0; q.stunUntil = 0; q.vx = 0; q.vz = 0; q.feintedUntil = 0; }
    // tireur derrière le ballon, face au but
    taker.facing = Math.atan2(0 - z, gx - x);
    Object.assign(this.ball, { x, y: BALL_R, z, vx: 0, vy: 0, vz: 0, owner: taker.slot, last: taker.slot, curl: 0 });
    this.placeTaker(taker);
    const defs = this.players.filter(q => q.team !== team);
    if (kind === "penalty") {
      const k = defs.find(q => this.isKeeper(q)); if (k) { k.x = gx - s * 0.4; k.z = 0; k.facing = s > 0 ? Math.PI : 0; }
      for (const q of this.players) if (q !== taker && q !== k && Math.abs(q.x - gx) < FIELD.BOX_D + 1.2) q.x = gx - s * (FIELD.BOX_D + 1.6);
    } else {
      // mur de deux joueurs si le coup franc est dangereux
      const dGoal = hyp(gx - x, z);
      if (dGoal < 18) {
        const wallers = defs.filter(q => !this.isKeeper(q)).sort((a, c) => hyp(a.x - x, a.z - z) - hyp(c.x - x, c.z - z)).slice(0, 2);
        const ang = Math.atan2(0 - z, gx - x); const px = -Math.sin(ang), pz = Math.cos(ang);
        wallers.forEach((q, i) => { const off = (i - 0.5) * 0.85; q.x = x + Math.cos(ang) * FK_DIST + px * off; q.z = z + Math.sin(ang) * FK_DIST + pz * off; q.facing = ang + Math.PI; });
        this.setPiece.wall = wallers.map(q => ({ slot: q.slot, x: q.x, z: q.z }));
      }
    }
    this.holdSetPiece();
    this.event(kind === "penalty" ? "PENALTY" : "FREEKICK", taker.slot, { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
  }

  placeTaker(p) { const sp = this.setPiece; p.x = sp.x - Math.cos(p.facing) * 0.5; p.z = sp.z - Math.sin(p.facing) * 0.5; p.vx = 0; p.vz = 0; }

  // Mouvements pendant un coup de pied arrêté ; renvoie false si le joueur ne peut pas encore agir.
  setPieceMove(p, inp) {
    const sp = this.setPiece;
    if (p.slot === sp.taker) {
      // le tireur oriente sa frappe (visée ou direction), sans bouger le ballon
      const m = hyp(inp.mx, inp.mz);
      if (m > 0.2) p.facing = Math.atan2(inp.mz, inp.mx); else if (inp.aimFace) p.facing = inp.aim;
      this.placeTaker(p);
      return this.time >= sp.readyAt;
    }
    // penalty : le gardien peut plonger (anticiper) dès que le tireur est prêt
    if (sp.kind === "penalty" && this.isKeeper(p) && p.team !== sp.team && inp.tackle && this.time >= sp.readyAt) this.dive(p, inp);
    return false; // les autres se placent seulement
  }

  // Distances réglementaires : adversaires à 4,5 m (coup franc), tout le monde hors de la surface (penalty)
  holdSetPiece() {
    const sp = this.setPiece; if (!sp) return;
    const gx = this.goalX(sp.team), s = Math.sign(gx);
    for (const q of this.players) {
      if (q.slot === sp.taker) continue;
      if (sp.kind === "penalty") {
        if (this.isKeeper(q) && q.team !== sp.team) { if (q.diveUntil <= this.time) { q.x = gx - s * 0.4; q.z = clamp(q.z, -FIELD.GOAL_HW + 0.3, FIELD.GOAL_HW - 0.3); } continue; }
        if (Math.abs(q.x - gx) < FIELD.BOX_D + 1.2) q.x = gx - s * (FIELD.BOX_D + 1.2);
        const d = hyp(q.x - sp.x, q.z - sp.z); if (d < 4) { const k = 4 / (d || 1); q.x = sp.x + (d ? (q.x - sp.x) * k : -s * 4); q.z = sp.z + (q.z - sp.z) * (d ? k : 1); }
      } else if (q.team !== sp.team) {
        const d = hyp(q.x - sp.x, q.z - sp.z);
        if (d < FK_DIST) { const k = FK_DIST / (d || 1); q.x = sp.x + (d ? (q.x - sp.x) * k : -s * FK_DIST); q.z = sp.z + (q.z - sp.z) * (d ? k : 1); }
      }
    }
  }

  endSetPiece() { if (this.phase === "setpiece") { this.phase = "play"; this.setPiece = null; } }

  // Délai écoulé : le tireur joue automatiquement (penalty : frappe, coup franc : passe)
  autoTakeSetPiece() {
    const sp = this.setPiece; const p = this.players[sp.taker];
    if (this.ball.owner !== sp.taker) { this.endSetPiece(); return; }
    if (sp.kind === "penalty") this.shoot(p, p.facing, 0.6); else this.pass(p, p.facing, false);
  }

  // ── Gestes techniques (efficacité = Dribble) ──────────────
  // Direction du stick par rapport au regard : aucune → feinte de corps ; vers l'arrière → roulette ;
  // de côté → crochet ; vers l'avant → petit pont (défenseur devant) ou passement de jambes ;
  // vers une paroi proche → une-deux avec la paroi ; sans ballon, contre une paroi → appui mural.
  skillMove(p, inp) {
    const t = this.time; const q = statOf(p, "Dribble", this) / 99; const own = this.ball.owner === p.slot;
    const m = hyp(inp.mx, inp.mz); const ix = m > 0.2 ? inp.mx / m : 0, iz = m > 0.2 ? inp.mz / m : 0;
    const rel = m > 0.2 ? Math.atan2(Math.sin(Math.atan2(iz, ix) - p.facing), Math.cos(Math.atan2(iz, ix) - p.facing)) : null;
    const wall = this.nearWall(p);
    if (!own) { if (wall && wall.d < 1.3) this.wallKick(p, ix, iz, wall, q); return; }
    let move;
    if (wall && wall.d < 3.2 && m > 0.2 && ix * wall.nx + iz * wall.nz < -0.5) move = "wallpass";
    else if (wall && wall.d < 1.1 && m > 0.2 && ix * wall.nx + iz * wall.nz > 0.5) move = "wallkick";
    else if (rel == null) move = "feint";
    else if (Math.abs(rel) > 2.2) move = "roulette";
    else if (Math.abs(rel) < 0.7) move = this.defenderAhead(p) ? "nutmeg" : "stepover";
    else move = "cut";
    let ok = true;
    const dodge = (dur, base) => { p.dodgeUntil = t + dur; p.dodge = clamp(base + q * 0.45, 0, 0.92); };
    const burst = (ang, s) => { p.vx += Math.cos(ang) * s; p.vz += Math.sin(ang) * s; };
    switch (move) {
      case "cut": { const side = Math.sign(rel) || 1; burst(p.facing + side * Math.PI / 2, 4 + q * 3); dodge(0.4, 0.3); p.diveDir = -side; break; }
      case "feint": { // les défenseurs proches sont mis dans le vent, on repart du côté opposé au plus proche
        const opp = this.nearestOpp(p, 3.5);
        for (const o of this.players) if (o.team !== p.team && hyp(o.x - p.x, o.z - p.z) < 3.5 && this.rng() < 0.4 + q * 0.45 - (statOf(o, "Réflexes", this) - 60) / 200) o.feintedUntil = t + 0.25 + q * 0.35;
        const side = opp ? -Math.sign(Math.cos(p.facing) * (opp.z - p.z) - Math.sin(p.facing) * (opp.x - p.x)) || 1 : 1;
        burst(p.facing + side * 0.8, 2.5 + q * 2.5); dodge(0.35, 0.2); p.diveDir = -side; break;
      }
      case "roulette": { // 360° ballon au pied : très dur à tacler, puis relance dans la direction voulue
        p.spinUntil = t + 0.45; dodge(0.5, 0.4);
        const ang = Math.atan2(iz, ix); p.facing = ang; burst(ang, 3 + q * 2.5); break;
      }
      case "stepover": { // passement de jambes : petite accélération et défenseur face à soi déstabilisé
        const opp = this.nearestOpp(p, 3);
        if (opp && this.rng() < 0.35 + q * 0.4) opp.feintedUntil = t + 0.2 + q * 0.3;
        burst(p.facing, 2 + q * 2); dodge(0.3, 0.2); p.diveDir = this.rng() < 0.5 ? 1 : -1; break;
      }
      case "nutmeg": { // petit pont : le ballon passe entre les jambes du défenseur
        const d = this.defenderAhead(p);
        ok = this.rng() < clamp(0.25 + q * 0.55 - (statOf(d, "Réflexes", this) - 60) / 200 - (statOf(d, "Tacle", this) - 60) / 300, 0.08, 0.9);
        if (ok) {
          this.release(p); const b = this.ball; b.vx = Math.cos(p.facing) * 7; b.vz = Math.sin(p.facing) * 7; b.vy = 0.15;
          this.pendingPass = { from: p.slot, t, self: true }; d.feintedUntil = t + 0.7; d.kickCd = 0.5; burst(p.facing, 4 + q * 2);
        } else { this.release(p); this.giveBall(d); this.event("INTERCEPT", d.slot, {}, "tacle_reussi"); }
        break;
      }
      case "wallpass": { // une-deux avec la paroi : frappe contre le mur, le ballon revient devant soi
        const tx = -wall.nz, tz = wall.nx; const along = Math.sign(tx * Math.cos(p.facing) + tz * Math.sin(p.facing)) || 1;
        const aimX = p.x - wall.nx * wall.d + tx * along * (2.5 + q * 1.5), aimZ = p.z - wall.nz * wall.d + tz * along * (2.5 + q * 1.5);
        const dir = Math.atan2(aimZ - p.z, aimX - p.x) + (this.rng() - 0.5) * 2 * (1 - q) * 0.12 * (1.2 - statOf(p, "Vision", this) / 99 * 0.4);
        const v = 11 + q * 4; this.release(p); const b = this.ball; b.vx = Math.cos(dir) * v; b.vz = Math.sin(dir) * v; b.vy = 0.3;
        this.pendingPass = { from: p.slot, t, self: true }; p.boostUntil = t + 1; p.facing = Math.atan2(tz * along, tx * along); break;
      }
      case "wallkick": this.wallKick(p, ix, iz, wall, q); break;
    }
    p.skillCd = t + 1.5 - q * 0.6 + (move === "roulette" || move === "nutmeg" ? 0.4 : 0);
    if (move !== "wallkick") { p.action = move; p.actionUntil = t + (move === "roulette" ? 0.45 : 0.35); }
    this.event("SKILL", p.slot, { move, ok }, ok ? "dribble_reussi" : null);
  }

  // Appui mural : le joueur prend appui sur la paroi pour rebondir (esquive, relance)
  wallKick(p, ix, iz, wall, q) {
    const t = this.time; const tx = -wall.nz, tz = wall.nx;
    const along = (p.vx * tx + p.vz * tz) || (ix * tx + iz * tz) || 1;
    const sAlong = Math.sign(along) * Math.min(6, Math.abs(along) * 1.1 + 1.5);
    const push = 4 + q * 2.5;
    const wallSide = Math.sign(Math.cos(p.facing) * wall.nz - Math.sin(p.facing) * wall.nx) || 1; // paroi à droite (+1) ou à gauche
    p.vx = tx * sAlong + wall.nx * push; p.vz = tz * sAlong + wall.nz * push; p.facing = Math.atan2(p.vz, p.vx); p.diveDir = wallSide;
    p.dodgeUntil = t + 0.35; p.dodge = clamp(0.25 + q * 0.4, 0, 0.8); p.dashUntil = t + 0.25;
    p.skillCd = t + 1.2 - q * 0.4; p.action = "wallkick"; p.actionUntil = t + 0.4;
    this.event("SKILL", p.slot, { move: "wallkick", ok: true });
  }

  // paroi la plus proche (hors bouche de but) : distance et normale vers l'intérieur du terrain
  nearWall(p) {
    const walls = [{ d: FIELD.HZ - p.z, nx: 0, nz: -1 }, { d: FIELD.HZ + p.z, nx: 0, nz: 1 }];
    if (Math.abs(p.z) > FIELD.GOAL_HW + 0.5) walls.push({ d: FIELD.HX - p.x, nx: -1, nz: 0 }, { d: FIELD.HX + p.x, nx: 1, nz: 0 });
    return walls.sort((a, c) => a.d - c.d)[0];
  }
  nearestOpp(p, r) { let best = null; for (const o of this.players) { if (o.team === p.team) continue; const d = hyp(o.x - p.x, o.z - p.z); if (d < r && (!best || d < best.d)) best = { o, d }; } return best?.o || null; }
  defenderAhead(p) {
    for (const o of this.players) {
      if (o.team === p.team) continue; const dx = o.x - p.x, dz = o.z - p.z, d = hyp(dx, dz);
      if (d < 2.4 && Math.abs(Math.atan2(Math.sin(Math.atan2(dz, dx) - p.facing), Math.cos(Math.atan2(dz, dx) - p.facing))) < 0.6) return o;
    }
    return null;
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

  activatePowerUp(p, k = 0) {
    const u = p.pus[k]; if (!u || u.cd > this.time || this.phase !== "play" && this.phase !== "kickoff") return false;
    const fx = u.def.arena; const t = this.time;
    if ((fx.effect === "shockwave" || fx.effect === "freezeNearest") && this.phase !== "play") return false; // pas pendant le coup d'envoi
    // joueurs protégés : après une faute, ou gardien tenant le ballon dans sa surface
    const shielded = q => q.protectedUntil > t || (this.isKeeper(q) && this.inOwnBox(q) && q.holdUntil > t && this.ball.owner === q.slot);
    u.until = t + fx.duration; u.cd = t + fx.cooldown;
    this.stats[p.slot].powerups++;
    const extra = { pu: u.def.id, effect: fx.effect, k };
    switch (fx.effect) {
      case "teamStamina": for (const q of this.players) if (q.team === p.team) q.stamina = Math.min(100, q.stamina + fx.value); break;
      case "teamAura": this.auras.push({ kind: "mind", team: p.team, until: u.until, value: fx.value }); break;
      case "teamSpeed": this.auras.push({ kind: "speed", team: p.team, until: u.until, value: fx.value || 1.1 }); break;
      case "keeperWall": this.auras.push({ kind: "keeper", team: p.team, until: u.until, value: fx.value || 1.4 }); break;
      case "slowAura": this.slows.push({ team: p.team, until: u.until, value: fx.value, radius: fx.radius, get x() { return p.x; }, get z() { return p.z; } }); break;
      case "dash": { // élan explosif dans la direction du regard
        const v = fx.value || 8, base = hyp(p.vx, p.vz) * 0.5;
        p.vx = Math.cos(p.facing) * (base + v); p.vz = Math.sin(p.facing) * (base + v); p.dashUntil = t + 0.35;
        break;
      }
      case "shockwave": { // onde de choc : repousse et étourdit les adversaires proches
        const hit = [];
        for (const q of this.players) {
          if (q.team === p.team || shielded(q)) continue;
          const dx = q.x - p.x, dz = q.z - p.z, d = hyp(dx, dz) || 0.01;
          if (d > (fx.radius || 4)) continue;
          q.vx += dx / d * 7; q.vz += dz / d * 7; q.stunUntil = Math.max(q.stunUntil, t + (fx.value || 0.8));
          if (this.ball.owner === q.slot) { this.release(q); const b = this.ball; b.vx = dx / d * 4; b.vz = dz / d * 4; b.vy = 1; }
          hit.push(q.slot);
        }
        extra.hit = hit; break;
      }
      case "freezeNearest": { // gel : l'adversaire le plus proche est immobilisé (et lâche le ballon)
        let best = null;
        for (const q of this.players) { if (q.team === p.team || shielded(q)) continue; const d = hyp(q.x - p.x, q.z - p.z); if (d <= (fx.radius || 6) && (!best || d < best.d)) best = { q, d }; }
        if (best) {
          const q = best.q; q.stunUntil = Math.max(q.stunUntil, t + (fx.value || 1.5)); q.vx *= 0.2; q.vz *= 0.2;
          if (this.ball.owner === q.slot) { this.release(q); q.kickCd = 0.6; }
          extra.victim = q.slot;
        }
        break;
      }
    }
    this.event("POWERUP", p.slot, extra, "power_up");
    return true;
  }

  // fin anticipée d'un power-up « à usage unique » (tir parfait, tacle assuré…)
  consumePu(p, effect) { for (const u of p.pus) if (u.until > this.time && u.def.arena.effect === effect) u.until = Math.min(u.until, this.time + 0.05); }

  checkFirewalls() {
    const o = this.owner(); if (!o) return;
    for (const p of this.players) {
      if (p.team === o.team) continue;
      const fw = activeFx(p, "firewall", this); if (!fw) continue;
      if (hyp(p.x - o.x, p.z - o.z) < (fw.radius || 3)) {
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
    const b = this.ball; const cd = u => (u ? Math.max(0, r2(u.cd - this.time)) : 0);
    return {
      k: this.tick, t: r2(this.time), ph: this.phase, h: this.half, c: Math.ceil(this.clock()), s: [...this.score],
      sp: this.setPiece ? { k: this.setPiece.kind, tm: this.setPiece.team, x: r2(this.setPiece.x), z: r2(this.setPiece.z), p: this.setPiece.taker, r: Math.max(0, r2(this.setPiece.until - this.time)) } : null,
      b: [r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz), b.owner],
      // p : [x, z, vx, vz, regard, endurance, drapeaux, charge, action, recharge PU1, sens du plongeon, recharge PU2, PU actifs (bits)]
      p: this.players.map(p => { const act = p.pus.reduce((m, u, i) => m | (u.until > this.time ? 1 << i : 0), 0); return [r2(p.x), r2(p.z), r2(p.vx), r2(p.vz), r2(p.facing), Math.round(p.stamina),
        (p.sprinting ? 1 : 0) | (p.stunUntil > this.time ? 2 : 0) | (p.diveUntil > this.time ? 4 : 0) | (act ? 8 : 0) | (p.charging ? 16 : 0) | (p.holdUntil > this.time ? 32 : 0) | (p.callUntil > this.time ? 64 : 0) | (p.dashUntil > this.time ? 128 : 0) | (p.pressing ? 256 : 0) | (p.feintedUntil > this.time ? 512 : 0),
        r2(p.charge), p.action, cd(p.pus[0]), p.diveDir, cd(p.pus[1]), act]; }),
    };
  }
}

// Changement de joueur : meilleur coéquipier à contrôler (jamais un autre humain).
// Porteur du ballon s'il est piloté par un bot, sinon le joueur de champ le mieux placé par rapport au ballon
// (en défense, bonus à ceux placés entre le ballon et notre but).
export function bestSwitchTarget(sim, fromSlot, exclude = null) {
  const me = sim.players[fromSlot]; if (!me) return -1;
  const b = sim.ball; const owner = sim.owner();
  const cands = sim.players.filter(q => q.team === me.team && q !== me && !q.human && !exclude?.has(q.slot));
  if (!cands.length) return -1;
  if (owner && owner.team === me.team && cands.includes(owner)) return owner.slot;
  const field = cands.filter(q => !sim.isKeeper(q)); const pool = field.length ? field : cands;
  const ownX = sim.ownGoalX(me.team); const bx = b.x + b.vx * 0.4, bz = b.z + b.vz * 0.4;
  let best = null;
  for (const q of pool) {
    let sc = hyp(q.x - bx, q.z - bz);
    if (owner && owner.team !== me.team && Math.abs(q.x - ownX) < Math.abs(bx - ownX)) sc -= 2.5;
    if (!best || sc < best.sc) best = { q, sc };
  }
  return best ? best.q.slot : -1;
}
