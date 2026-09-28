// IA des joueurs virtuels de l'Arène : produit les mêmes entrées qu'un humain (déplacement, sprint, tir, passe, tacle, power-up).
import { FIELD, statOf, emptyInput } from "./sim.js";

const hyp = Math.hypot;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const BOT_LEVELS = {
  training: { fr: "Entraînement", en: "Training", react: 0.5, effort: 0.55, tackleEager: 0.08, shootRange: 8, passSmart: 0.3, puUse: 0, keeperReact: 0.75 },
  easy:   { fr: "Facile", en: "Easy",     react: 0.32, effort: 0.8,  tackleEager: 0.3,  shootRange: 11, passSmart: 0.4, puUse: 0.2, keeperReact: 0.55 },
  normal: { fr: "Normal", en: "Normal",   react: 0.16, effort: 0.92, tackleEager: 0.55, shootRange: 13, passSmart: 0.75, puUse: 0.5, keeperReact: 0.3 },
  hard:   { fr: "Expert", en: "Expert",   react: 0.06, effort: 1,    tackleEager: 0.85, shootRange: 15, passSmart: 1,   puUse: 0.85, keeperReact: 0.16 },
};

export class ArenaBrain {
  constructor(sim, level = "normal") { this.sim = sim; this.cfg = BOT_LEVELS[level] || BOT_LEVELS.normal; this.mem = {}; }

  forget(slot) { delete this.mem[slot]; } // changement de pilote : mémoire remise à zéro

  mem_(slot) { return this.mem[slot] || (this.mem[slot] = { shootHold: 0, nextThink: 0, target: null, lastInput: emptyInput(), passWait: 0 }); }

  // Calcule les entrées de tous les joueurs non humains.
  update() {
    const sim = this.sim;
    for (const p of sim.players) {
      if (p.human) {
        // gardien humain inactif : placement automatique (toute commande du joueur reprend la main)
        const hi = sim.inputs[p.slot];
        if (sim.isKeeper(p) && sim.ball.owner !== p.slot && !hi.mx && !hi.mz && !hi.tackle && !hi.press && !hi.pass && !hi.shoot) {
          const auto = this.think(p); sim.setInput(p.slot, { ...hi, mx: auto.mx, mz: auto.mz, sprint: auto.sprint });
        }
        continue;
      }
      const m = this.mem_(p.slot);
      // temps de réaction : entre deux décisions, le bot garde sa trajectoire (sans répéter les actions ponctuelles)
      if (sim.time < m.nextThink && !m.shootHold && sim.ball.owner !== p.slot) { sim.setInput(p.slot, { ...m.lastInput, pass: false, lob: false, tackle: false, skill: false, pu: false, pu2: false }); continue; }
      const inp = this.think(p);
      if (!sim.isKeeper(p)) { inp.mx *= this.cfg.effort; inp.mz *= this.cfg.effort; if (this.cfg.effort < 1 && p.stamina < 60) inp.sprint = false; }
      m.lastInput = inp; m.nextThink = sim.time + this.cfg.react * (0.6 + sim.rng() * 0.8);
      sim.setInput(p.slot, inp);
    }
  }

  think(p) {
    const sim = this.sim, b = sim.ball, m = this.mem_(p.slot);
    const inp = emptyInput();
    if (sim.phase === "goal" || sim.phase === "halftime" || sim.phase === "ended") return inp;
    if (sim.phase === "setpiece") return this.setPiece(p, inp);
    const owner = sim.owner();
    const gx = sim.goalX(p.team), ownX = sim.ownGoalX(p.team), f = Math.sign(gx);
    const mates = sim.players.filter(q => q.team === p.team && q !== p);
    const opps = sim.players.filter(q => q.team !== p.team);

    // tir en cours de chargement
    if (m.shootHold > 0 && owner === p) { m.shootHold--; inp.shoot = m.shootHold > 0; inp.aim = m.aim; this.steer(inp, p, p.x + Math.cos(m.aim) * 3, p.z + Math.sin(m.aim) * 3, false); return inp; }
    m.shootHold = 0;

    // power-up : dans les situations utiles
    if (sim.phase === "play" && this.sim.rng() < this.cfg.puUse * 0.02) {
      const attacking = owner && owner.team === p.team; const nearGoal = hyp(gx - p.x, p.z) < 18;
      const dOwner = owner ? hyp(owner.x - p.x, owner.z - p.z) : 99; const dBall = hyp(b.x - p.x, b.z - p.z);
      const oppNear = r => opps.some(q => hyp(q.x - p.x, q.z - p.z) < r);
      const useful = fx => ({ perfectShot: owner === p && nearGoal, powerShot: owner === p && nearGoal, curlShot: owner === p && nearGoal, ballGlue: owner === p, speedBoost: true, freeSprint: true,
        tackleRange: owner && !attacking, sureTackle: owner && !attacking && dOwner < 4, firewall: owner && !attacking && dOwner < 6,
        slowAura: owner && !attacking, tackleImmune: owner === p, perfectPass: attacking, passBoost: attacking, noStaminaDrain: p.stamina < 60,
        teamStamina: mates.some(q => q.stamina < 50), teamAura: attacking, teamSpeed: true, dash: owner === p || (!owner && dBall < 8),
        shockwave: oppNear(3.5), freezeNearest: owner && !attacking && dOwner < 6, magnet: !owner && dBall < 6,
        keeperWall: owner && !attacking && hyp(ownX - b.x, b.z) < 14 })[fx];
      const k = p.pus.findIndex(u => u.cd <= sim.time && u.until <= sim.time && useful(u.def.arena.effect));
      if (k === 0) inp.pu = true; else if (k === 1) inp.pu2 = true;
    }

    if (sim.isKeeper(p)) return this.keeper(p, inp, owner, gx, ownX, f, mates, opps);

    // ── J'ai le ballon ──
    if (owner === p) return this.withBall(p, inp, gx, f, mates, opps);

    // ── Ballon libre : le mieux placé de chaque équipe y va ──
    if (!owner) {
      const t = this.interceptPoint(p);
      const chaser = sim.players.filter(q => q.team === p.team && !sim.isKeeper(q)).map(q => ({ q, d: hyp(q.x - b.x, q.z - b.z) })).sort((a, c) => a.d - c.d)[0];
      if (chaser && chaser.q === p) { this.steer(inp, p, t.x, t.z, true); inp.aim = Math.atan2(t.z - p.z, t.x - p.x); return inp; }
      return this.support(p, inp, f, gx, ownX, b, true);
    }

    // ── Un coéquipier a le ballon : se démarquer ──
    if (owner.team === p.team) return this.support(p, inp, f, gx, ownX, owner, false);

    // ── L'adversaire a le ballon : presser / couvrir / marquer ──
    const field = sim.players.filter(q => q.team === p.team && !sim.isKeeper(q));
    const ranked = field.map(q => ({ q, d: hyp(q.x - owner.x, q.z - owner.z) })).sort((a, c) => a.d - c.d);
    const d = hyp(owner.x - p.x, owner.z - p.z);
    if (ranked[0].q === p) {
      // se placer côté but, harceler (pressing) au contact, tacler quand l'occasion est bonne
      const gl = Math.hypot(ownX - owner.x, owner.z) || 1;
      const tx = owner.x + (ownX - owner.x) / gl * 0.7, tz = owner.z - owner.z / gl * 0.7;
      this.steer(inp, p, tx, tz, d > 3);
      inp.aim = Math.atan2(owner.z - p.z, owner.x - p.x);
      if (d < 3) inp.press = true;
      // un bon tacleur tente sa chance de face ; de dos, on préfère le pressing (moins de fautes)
      const facing = Math.cos(owner.facing) * (p.x - owner.x) + Math.sin(owner.facing) * (p.z - owner.z) > 0;
      const eager = this.cfg.tackleEager * (0.5 + statOf(p, "Tacle", sim) / 99) * (facing ? 1 : 0.35);
      if (d < 1.3 && p.tackleCd <= 0 && this.sim.rng() < eager * (0.12 + this.cfg.react * 1.8)) inp.tackle = true;
      else if (d < 2.4 && d > 1.5 && p.sprinting && p.tackleCd <= 0 && this.sim.rng() < eager * 0.04) { inp.tackle = true; inp.sprint = true; }
      return inp;
    }
    if (ranked[1]?.q === p) { // couverture entre porteur et but
      this.steer(inp, p, owner.x + (ownX - owner.x) * 0.35, owner.z * 0.6, true); return inp;
    }
    // marquage de l'adversaire le plus dangereux dans ma zone
    const base = sim.basePos(p);
    const threat = opps.filter(o => o !== owner && !sim.isKeeper(o)).map(o => ({ o, d: hyp(o.x - (base.x + (owner.x - base.x) * 0.3), o.z - base.z) })).sort((a, c) => a.d - c.d)[0];
    if (threat) { const o = threat.o; this.steer(inp, p, o.x + (ownX - o.x) * 0.18, o.z + (0 - o.z) * 0.1, hyp(o.x - p.x, o.z - p.z) > 5); }
    else this.steer(inp, p, base.x, base.z, false);
    return inp;
  }

  withBall(p, inp, gx, f, mates, opps) {
    const sim = this.sim, m = this.mem_(p.slot);
    const dGoal = hyp(gx - p.x, p.z);
    const nearOpp = opps.filter(o => !sim.isKeeper(o)).map(o => ({ o, d: hyp(o.x - p.x, o.z - p.z) })).sort((a, c) => a.d - c.d)[0];
    const pressure = nearOpp ? nearOpp.d : 99;
    const keeper = opps.find(o => sim.isKeeper(o));
    // appel de balle d'un coéquipier humain : on le sert si la ligne de passe est jouable
    const caller = mates.find(q => q.human && q.callUntil > sim.time && !sim.isKeeper(q));
    if (caller && m.passWait === 0 && hyp(caller.x - p.x, caller.z - p.z) > 2.5) {
      const clear = this.laneClear(p, caller, opps);
      if (clear || this.sim.rng() < 0.5) { inp.aim = Math.atan2(caller.z - p.z, caller.x - p.x); inp.pass = true; inp.lob = !clear; m.passWait = 12; caller.callUntil = 0; return inp; }
    }
    // tir
    const angleOk = Math.abs(p.z) < 9 || dGoal < 8;
    const range = this.cfg.shootRange + (statOf(p, "Finition", sim) - 70) / 10;
    if (dGoal < range && angleOk && (pressure > 1.8 || dGoal < 8 || this.sim.rng() < 0.3)) {
      const side = keeper && keeper.z > 0 ? -1 : 1; // opposé au gardien
      const tz = side * (FIELD.GOAL_HW - 0.5 - this.sim.rng() * 0.8);
      m.aim = Math.atan2(tz - p.z, gx - p.x);
      m.shootHold = Math.round(clamp(4 + dGoal * 0.9 + (this.sim.rng() - 0.5) * 4, 3, 20));
      inp.shoot = true; inp.aim = m.aim; return inp;
    }
    // passe si pressé ou si un partenaire est bien mieux placé
    const options = mates.filter(q => !sim.isKeeper(q)).map(q => {
      const prog = (q.x - p.x) * f; const open = Math.min(...opps.map(o => hyp(o.x - q.x, o.z - q.z)));
      const lane = this.laneClear(p, q, opps);
      return { q, v: prog * 0.4 + open * 1.2 + (lane ? 3 : -6) - hyp(q.x - p.x, q.z - p.z) * 0.12 + (hyp(gx - q.x, q.z) < dGoal - 4 ? 3 : 0) };
    }).sort((a, c) => c.v - a.v);
    const best = options[0];
    m.passWait = Math.max(0, m.passWait - 1);
    if (best && m.passWait === 0 && ((pressure < 2.3 && best.v > 1) || (best.v > 8 && this.sim.rng() < this.cfg.passSmart * 0.12))) {
      inp.aim = Math.atan2(best.q.z - p.z, best.q.x - p.x);
      inp.pass = true; inp.lob = !this.laneClear(p, best.q, opps) && this.sim.rng() < 0.6;
      m.passWait = 10;
      return inp;
    }
    // gestes techniques quand un défenseur arrive au contact (plus fréquents pour les bons dribbleurs)
    const dr = statOf(p, "Dribble", sim);
    if (nearOpp && nearOpp.d < 2 && p.skillCd <= sim.time && this.sim.rng() < this.cfg.passSmart * 0.12 * (0.3 + dr / 99)) {
      const wall = sim.nearWall(p); const r = this.sim.rng();
      const ahead = sim.defenderAhead(p);
      inp.skill = true; inp.aim = p.facing;
      if (wall.d < 2.5 && r < 0.35) { inp.mx = -wall.nx; inp.mz = -wall.nz; }                       // une-deux avec la paroi
      else if (ahead && dr > 72 && r < 0.6) { inp.mx = Math.cos(p.facing); inp.mz = Math.sin(p.facing); } // petit pont
      else if (r < 0.7) { inp.mx = 0; inp.mz = 0; }                                                  // feinte de corps
      else if (r < 0.85) { inp.mx = -Math.cos(p.facing); inp.mz = -Math.sin(p.facing); }             // roulette
      else { const s = r < 0.93 ? 1 : -1; inp.mx = -Math.sin(p.facing) * s; inp.mz = Math.cos(p.facing) * s; } // crochet
      return inp;
    }
    // conduite vers le but en évitant le défenseur le plus proche
    let tx = gx - f * 4, tz = p.z * 0.6;
    if (nearOpp && nearOpp.d < 4) { const side = p.z > nearOpp.o.z ? 1 : -1; tz = clamp(p.z + side * 4, -9, 9); tx = p.x + f * 4; }
    this.steer(inp, p, tx, tz, pressure < 5 || p.stamina > 60);
    inp.aim = Math.atan2(0 - p.z, gx - p.x);
    return inp;
  }

  // coups de pied arrêtés : le tireur frappe ou passe, les autres se replacent (distances imposées par la simulation)
  setPiece(p, inp) {
    const sim = this.sim, sp = sim.setPiece, m = this.mem_(p.slot);
    const gx = sim.goalX(p.team), f = Math.sign(gx), ownX = sim.ownGoalX(p.team);
    if (sp.taker === p.slot) {
      if (m.shootHold > 0) { // frappe en cours de chargement
        m.shootHold--; inp.shoot = m.shootHold > 0; inp.aim = m.aim; inp.aimFace = true; inp.mx = Math.cos(m.aim) * 0.3; inp.mz = Math.sin(m.aim) * 0.3; return inp;
      }
      if (!m.spAt || m.spAt < sp.readyAt - 2) m.spAt = sp.readyAt + 0.4 + sim.rng() * 1.2;
      const keeper = sim.players.find(q => q.team !== p.team && sim.isKeeper(q));
      const dGoal = hyp(gx - p.x, p.z);
      const shoot = sp.kind === "penalty" || (dGoal < 19 && Math.abs(p.z) < 9 && statOf(p, "Finition", sim) > 55);
      if (shoot) {
        if (m.spAim == null) { const side = keeper && keeper.z > 0.2 ? -1 : keeper && keeper.z < -0.2 ? 1 : (sim.rng() < 0.5 ? -1 : 1); m.spAim = Math.atan2(side * (FIELD.GOAL_HW - 0.45 - sim.rng() * 0.7) - p.z, gx - p.x); }
        inp.aim = m.spAim; inp.aimFace = true; inp.mx = Math.cos(m.spAim) * 0.3; inp.mz = Math.sin(m.spAim) * 0.3;
        if (sim.time >= m.spAt) { m.aim = m.spAim; m.shootHold = Math.round(sp.kind === "penalty" ? 12 + sim.rng() * 6 : 14 + dGoal * 0.5); inp.shoot = true; m.spAim = null; m.spAt = 0; }
      } else if (sim.time >= m.spAt) {
        const best = sim.players.filter(q => q.team === p.team && q !== p && !sim.isKeeper(q)).sort((a, c) => (c.x - a.x) * f - (hyp(c.x - p.x, c.z - p.z) - hyp(a.x - p.x, a.z - p.z)) * 0.2)[0];
        if (best) { inp.aim = Math.atan2(best.z - p.z, best.x - p.x); inp.aimFace = true; inp.mx = Math.cos(inp.aim) * 0.3; inp.mz = Math.sin(inp.aim) * 0.3; inp.pass = true; }
        m.spAt = 0;
      }
      return inp;
    }
    if (sim.isKeeper(p)) { this.steer(inp, p, ownX - Math.sign(ownX) * 0.6, 0, false); return inp; }
    const w = sp.wall?.find(x => x.slot === p.slot); if (w) { this.steer(inp, p, w.x, w.z, false); return inp; } // tenir le mur
    const base = sim.basePos(p);
    if (p.team === sp.team) this.steer(inp, p, clamp(sp.x + f * (4 + (p.slot % 5) * 1.5), -17, 17), base.z * 0.8, false);
    else this.steer(inp, p, (sp.x + ownX) / 2 + (base.x - ownX) * 0.1, base.z * 0.7, false);
    return inp;
  }

  support(p, inp, f, gx, ownX, ref, loose) {
    const sim = this.sim; const base = sim.basePos(p);
    const role = p.role; const bx = ref.x;
    let tx, tz;
    if (role === "att") { tx = clamp(bx + f * 8, -16, 16); tz = base.z + (p.slot % 2 ? 4 : -4) * (loose ? 0.5 : 1); }
    else if (role === "mid") { tx = clamp(bx + f * 3, -15, 15); tz = base.z * 1.3; }
    else { tx = clamp(bx - f * 8, ownX === -20 ? -16 : 3, ownX === -20 ? -3 : 16); tz = ref.z * 0.4; }
    // s'écarter des coéquipiers trop proches
    for (const q of sim.players) if (q.team === p.team && q !== p) { const d = hyp(q.x - tx, q.z - tz); if (d < 4) { tz += (tz >= q.z ? 1 : -1) * (4 - d); } }
    this.steer(inp, p, tx, clamp(tz, -10.5, 10.5), hyp(tx - p.x, tz - p.z) > 7);
    inp.aim = Math.atan2(ref.z - p.z, ref.x - p.x);
    return inp;
  }

  keeper(p, inp, owner, gx, ownX, f, mates, opps) {
    const sim = this.sim, b = sim.ball, m = this.mem_(p.slot);
    const fIn = -Math.sign(ownX); // direction vers le terrain
    if (owner === p) {
      // relance après un court instant
      if (!m.holdT) m.holdT = sim.time;
      if (sim.time - m.holdT > 1.1) {
        const target = mates.filter(q => !sim.isKeeper(q)).map(q => ({ q, open: Math.min(...opps.map(o => hyp(o.x - q.x, o.z - q.z))) })).sort((a, c) => c.open - a.open)[0];
        if (target) { inp.aim = Math.atan2(target.q.z - p.z, target.q.x - p.x); inp.pass = true; inp.lob = hyp(target.q.x - p.x, target.q.z - p.z) > 14; }
        m.holdT = 0;
      }
      this.steer(inp, p, ownX + fIn * 2, 0, false);
      return inp;
    }
    m.holdT = 0;
    // plongeon si un tir arrive
    const vx = b.vx, sp = hyp(b.vx, b.vz);
    if (!owner && sp > 7 && Math.sign(vx) === Math.sign(ownX) && p.diveUntil <= sim.time) {
      const t = (ownX - b.x) / vx;
      if (t > 0 && t < 1.2) {
        const zAt = b.z + b.vz * t; const yAt = b.y + b.vy * t - 4.9 * t * t;
        if (Math.abs(zAt) < FIELD.GOAL_HW + 0.6 && yAt < FIELD.GOAL_H + 0.4) {
          const lat = zAt - p.z;
          if (t < 0.55 - this.cfg.keeperReact * 0.5 + statOf(p, "Réflexes", sim) / 99 * 0.3 && Math.abs(lat) > 0.6) { inp.tackle = true; inp.mz = Math.sign(lat); return inp; }
          this.steer(inp, p, ownX + fIn * 0.8, clamp(zAt, -2.2, 2.2), true); return inp;
        }
      }
    }
    // sortie sur ballon libre dans la surface
    const inBox = Math.abs(b.x - ownX) < FIELD.BOX_D && Math.abs(b.z) < FIELD.BOX_HW;
    if (!owner && inBox && sp < 9) { this.steer(inp, p, b.x, b.z, true); return inp; }
    if (owner && owner.team !== p.team && inBox && hyp(owner.x - p.x, owner.z - p.z) < 3.5) { this.steer(inp, p, owner.x, owner.z, true); if (hyp(owner.x - p.x, owner.z - p.z) < 1.3) inp.tackle = true; return inp; }
    // placement sur la bissectrice ballon-but
    const ref = owner || b;
    const ang = Math.atan2(ref.z, ref.x - ownX);
    const depth = clamp(1.1 + Math.abs(ref.x - ownX) * 0.04, 1, 2.2);
    this.steer(inp, p, ownX + Math.cos(ang) * depth, clamp(Math.sin(ang) * depth * 1.6, -2.2, 2.2), false);
    inp.aim = Math.atan2(ref.z - p.z, ref.x - p.x); inp.aimFace = true;
    return inp;
  }

  laneClear(p, q, opps) {
    const dx = q.x - p.x, dz = q.z - p.z, L = hyp(dx, dz) || 1;
    for (const o of opps) {
      const t = ((o.x - p.x) * dx + (o.z - p.z) * dz) / (L * L);
      if (t < 0.05 || t > 0.95) continue;
      const cx = p.x + dx * t, cz = p.z + dz * t;
      if (hyp(o.x - cx, o.z - cz) < 1.1) return false;
    }
    return true;
  }

  interceptPoint(p) {
    const b = this.sim.ball; const sp = Math.max(4, hyp(p.vx, p.vz) + 3);
    const t = clamp(hyp(b.x - p.x, b.z - p.z) / sp, 0, 1.2);
    return { x: clamp(b.x + b.vx * t * 0.6, -19.5, 19.5), z: clamp(b.z + b.vz * t * 0.6, -11.5, 11.5) };
  }

  steer(inp, p, tx, tz, sprint) {
    const dx = tx - p.x, dz = tz - p.z, d = hyp(dx, dz);
    if (d < 0.25) { inp.mx = 0; inp.mz = 0; return; }
    const s = Math.min(1, d / 1.5);
    inp.mx = dx / d * s; inp.mz = dz / d * s;
    inp.sprint = !!sprint && p.stamina > 30 && d > 2;
  }
}

Object.setPrototypeOf(BOT_LEVELS, null); // sécurité : clés externes
