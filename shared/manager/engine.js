// ═══════════════════════════════════════════════════════════════
// Moteur de match Manager v3 — Lab League
// Héritier du SimpleMatchEngine du prototype (positions continues, stratégies
// scientifiques, power-ups de domaine) avec : déterminisme (graine), gardiens
// réels (Réflexes), modèle xG, deux mi-temps, remplacements, fautes, cartons,
// penalties, synergies de labo, statistiques et notes individuelles.
// Terrain 100 × 60 ; « home » défend x=0 et attaque x=100.
// ═══════════════════════════════════════════════════════════════
import { makeRng } from "../rng.js";
import { getPlayer, getPowerUp, sanitizeLoadout, withStats, keeperRating, roleOf, narrKey, FORMATIONS, STRATEGY_BY_ID, STRATEGIES, TEAM_TALK_BY_ID } from "../data/content.js";
import { synergyBonus, activeSynergies } from "../data/enrichment.js";

export const TICKS_PER_SEC = 10;
export const DEFAULT_HALF_TICKS = 1200;           // 20 minutes de jeu par mi-temps
export const TICKS_PER_MIN = 60;                  // horloge affichée : 1 minute = 60 ticks
const GOAL_Y = 30, GOAL_HALF = 6;                 // cage : y ∈ [24, 36]
const PU_DURATION_SCALE = 2;                      // durée d'origine × 2 (match plus long que le prototype)
const MAX_SUBS = 3;
const EXCLUSION_TICKS = 120;                      // exclusion temporaire (2 minutes de jeu)

// Matrice tactique : multiplicateur de danger (xG) de la stratégie attaquante face à la stratégie adverse.
// Cycle lisible : Faraday > Fission > Réplication > Faraday ; Réaction en chaîne punit les blocs hauts ;
// Pression osmotique étouffe la possession et l'équilibre.
export const MATCHUP = {
  attack:     { park_bus: 0.6, possession: 1.2 },
  possession: { park_bus: 1.4, pressing: 0.85, equilibre: 1.15 },
  park_bus:   { attack: 1.35, equilibre: 1.2 },
  counter:    { attack: 1.45, pressing: 1.7, park_bus: 0.8, equilibre: 1.3 },
  pressing:   { possession: 1.1, counter: 0.7, park_bus: 0.75 },
  equilibre:  { park_bus: 0.65 },
}
export const matchupFactor = (a, d) => MATCHUP[a]?.[d] ?? 1;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const newStats = () => ({ goals: 0, assists: 0, shots: 0, onTarget: 0, xg: 0, passes: 0, passesOk: 0, tackles: 0, interceptions: 0, dribbles: 0, saves: 0, conceded: 0, fouls: 0, yellow: 0, red: 0, powerups: 0, minutes: 0 });

export class ManagerEngine {
  /**
   * @param {{home: TeamSetup, away: TeamSetup, seed?: number, halfTicks?: number, halftimeTicks?: number}} o
   * TeamSetup = { name, colors, crest, lineup: string[5] (0 = gardien), bench: string[], formation, strategy, loadouts?: { id: [puId, puId] }, stats?: { id: répartition } }
   */
  constructor(o) {
    this.rng = makeRng(o.seed ?? 1);
    this.halfTicks = o.halfTicks || DEFAULT_HALF_TICKS;
    this.maxTime = this.halfTicks * 2;
    this.halftimeTicks = o.halftimeTicks ?? 60;
    this.time = 0; this.half = 1; this.phase = "kickoff"; this.phaseTimer = 20;
    this.events = []; this.queue = []; this.xgTimeline = [];
    this.pl = Object.create(null); this.activePU = []; this.cooldowns = Object.create(null);
    this.possTicks = { home: 0, away: 0 };
    this.teams = {};
    for (const side of ["home", "away"]) {
      const s = o[side];
      const lineup = s.lineup.slice(0, 5);
      this.teams[side] = {
        side, name: s.name || (side === "home" ? "Domicile" : "Extérieur"), colors: s.colors || ["#00F0FF", "#0A0A12"], crest: s.crest || "🧬",
        lineup, bench: (s.bench || []).filter(id => !lineup.includes(id)).slice(0, 3), used: [],
        formation: FORMATIONS[s.formation] ? s.formation : "2-2", strategy: STRATEGY_BY_ID[s.strategy] || STRATEGIES[0],
        score: 0, subsLeft: MAX_SUBS, excluded: [], pending: 0, synergy: {}, synergies: [],
        stats: { shots: 0, onTarget: 0, xg: 0, passes: 0, passesOk: 0, tackles: 0, fouls: 0, yellow: 0, red: 0, saves: 0, powerups: 0, subs: 0, corners: 0 },
      };
      for (const id of [...lineup, ...this.teams[side].bench]) {
        const p = withStats(getPlayer(id), s.stats?.[id]); if (!p) throw new Error("Joueur inconnu : " + id); // répartition du manager
        const pus = sanitizeLoadout(id, s.loadouts?.[id]).map(getPowerUp); // 2 power-ups emportés
        this.pl[id] = { id, p, side, pus, x: 50, y: 30, tx: 50, ty: 30, bx: 50, by: 30, stamina: 100, onPitch: lineup.includes(id), yellow: 0, red: false, stats: newStats(), rating: 6 };
      }
      this.refreshSynergy(side);
      this.placeFormation(side);
    }
    this.ball = { x: 50, y: 30, owner: null, target: null, speed: 0, kind: null, receiver: null, shot: null, travel: 0 };
    this.lastEvent = 0; this.lastPass = null; this.possession = "home";
    this.kickoff("home");
  }

  // ── Accès ─────────────────────────────────────────────────
  onPitch(side) { return this.teams[side].lineup.filter(id => this.pl[id] && this.pl[id].onPitch); }
  keeperOf(side) { const id = this.teams[side].lineup[0]; return this.pl[id]?.onPitch ? id : this.onPitch(side)[0]; }
  opp(side) { return side === "home" ? "away" : "home"; }
  goalX(side) { return side === "home" ? 100 : 0; }          // but attaqué
  ownGoalX(side) { return side === "home" ? 0 : 100; }
  fwd(side) { return side === "home" ? 1 : -1; }

  refreshSynergy(side) {
    const t = this.teams[side];
    const players = t.lineup.map(getPlayer).filter(Boolean);
    t.synergy = synergyBonus(players);
    t.synergies = activeSynergies(players).map(s => s.id);
  }

  attr(id, a) {
    const e = this.pl[id]; if (!e) return 50;
    const t = this.teams[e.side];
    let v = e.p.attributs[a] ?? 50;
    v += t.strategy.modifiers?.[a] || 0;
    v += t.synergy[a] || 0;
    if (t.talk) v += t.talk.mods[a] || 0;
    for (const pu of this.activePU) if (pu.pid === id && pu.until > this.time) v += pu.buffs[a] || 0;
    if (e.stamina < 70) v *= 0.75 + 0.25 * (e.stamina / 70);
    return clamp(v, 1, 99);
  }

  // ── Placement ─────────────────────────────────────────────
  placeFormation(side) {
    const t = this.teams[side]; const f = FORMATIONS[t.formation];
    t.lineup.forEach((id, i) => {
      const fp = f.positions[i] || { x: 50, y: 50 };
      const bx = side === "home" ? 2 + fp.x * 0.46 : 98 - fp.x * 0.46;
      const by = 5 + fp.y * 0.5;
      const e = this.pl[id]; if (!e) return;
      e.bx = bx; e.by = by; e.slot = i;
    });
  }

  resetPositions() {
    for (const e of Object.values(this.pl)) if (e.onPitch) { e.x = e.bx; e.y = e.by; e.tx = e.bx; e.ty = e.by; }
  }

  kickoff(side) {
    this.resetPositions();
    const ids = this.onPitch(side).filter(id => id !== this.keeperOf(side));
    const striker = ids.reduce((b, id) => (!b || this.pl[id].slot > this.pl[b].slot ? id : b), null) || this.keeperOf(side);
    const e = this.pl[striker]; e.x = 50 - this.fwd(side) * 1.5; e.y = 30;
    Object.assign(this.ball, { x: e.x, y: e.y, owner: striker, target: null, kind: null, receiver: null, shot: null });
    this.possession = side; this.lastEvent = this.time;
  }

  // ── Commandes (appliquées au début du tick suivant ⇒ rejouables) ──
  command(side, cmd) { if (this.queue.length < 64) this.queue.push({ side, ...cmd }); } // file bornée (pause, abus)

  applyCommand(c) {
    const t = this.teams[c.side]; if (!t || this.phase === "ended") return false;
    switch (c.type) {
      case "strategy": { const s = STRATEGY_BY_ID[c.id]; if (!s) return false; t.strategy = s; this.event("STRATEGY", c.side, null, null, { strat: s.id }); return true; }
      case "formation": { if (!FORMATIONS[c.id]) return false; t.formation = c.id; this.placeFormation(c.side); return true; }
      case "powerup": return this.activatePowerUp(c.side, c.pid, c.pu);
      case "sub": return this.substitute(c.side, c.out, c.in);
      case "talk": { // causerie : uniquement à la mi-temps, une fois
        const talk = TEAM_TALK_BY_ID[c.id]; if (!talk || this.phase !== "halftime" || t.talk) return false;
        t.talk = talk;
        if (talk.stamina) for (const id of this.onPitch(c.side)) this.pl[id].stamina = Math.min(100, this.pl[id].stamina + talk.stamina);
        this.event("TALK", c.side, null, null, { talk: talk.id }); return true;
      }
      default: return false;
    }
  }

  // puId : l'un des 2 power-ups emportés (le premier par défaut) ; recharge propre à chaque power-up
  activatePowerUp(side, pid, puId) {
    const e = this.pl[pid];
    if (!e || e.side !== side || !e.onPitch) return false;
    const pu = (puId && e.pus.find(u => u.id === puId)) || e.pus[0]; if (!pu) return false;
    if ((this.cooldowns[pu.id] || 0) > this.time) return false;
    if (this.activePU.some(a => a.puId === pu.id && a.until > this.time)) return false;
    const until = this.time + pu.duree * PU_DURATION_SCALE;
    this.activePU.push({ pid, puId: pu.id, until, buffs: pu.buffs || {}, side });
    this.cooldowns[pu.id] = this.time + pu.cooldown;
    if (pu.healStamina) for (const id of this.onPitch(side)) this.pl[id].stamina = Math.min(100, this.pl[id].stamina + pu.healStamina);
    if (pu.debuffOpponents) for (const id of this.onPitch(this.opp(side))) this.activePU.push({ pid: id, puId: pu.id + "_debuff", until, buffs: pu.debuffOpponents, side: this.opp(side), debuff: true });
    e.stats.powerups++; this.teams[side].stats.powerups++;
    this.event("POWERUP", side, pid, null, { pu: pu.id }, "power_up");
    return true;
  }

  substitute(side, outId, inId) {
    const t = this.teams[side]; const o = this.pl[outId]; const i = this.pl[inId];
    if (!o || !i || o.side !== side || i.side !== side || !o.onPitch || o.red || !t.bench.includes(inId) || t.subsLeft <= 0) return false;
    if (this.ball.owner === outId) { this.ball.owner = null; }
    const slot = t.lineup.indexOf(outId);
    t.lineup[slot] = inId; t.bench = t.bench.filter(id => id !== inId); t.used.push(outId);
    o.onPitch = false; i.onPitch = true; i.x = o.x; i.y = o.y; i.stamina = 100;
    t.subsLeft--; t.stats.subs++;
    this.placeFormation(side); this.refreshSynergy(side);
    this.event("SUB", side, inId, outId);
    return true;
  }

  // ── Événements ────────────────────────────────────────────
  event(type, side, pid, pid2 = null, extra = {}, narrCat = null) {
    const e = pid ? this.pl[pid] : null;
    const ev = { t: this.time, type, side, pid, pid2, ...extra };
    if (narrCat) ev.n = narrKey(narrCat, e?.p.domaine || null, this.rng);
    this.events.push(ev);
    return ev;
  }

  // ── Boucle ────────────────────────────────────────────────
  tick() {
    if (this.phase === "ended") return false;
    while (this.queue.length) this.applyCommand(this.queue.shift());

    if (this.phase === "halftime") {
      if (--this.phaseTimer <= 0) { this.phase = "kickoff"; this.phaseTimer = 20; this.half = 2; this.kickoff("away"); this.event("SECOND_HALF", null, null); }
      return true;
    }

    this.time++;
    this.activePU = this.activePU.filter(a => a.until > this.time);
    this.updateStamina();
    this.updateExclusions();
    if (this.ball.owner) this.possTicks[this.pl[this.ball.owner].side]++;
    else this.possTicks[this.possession]++;

    if (this.time === this.halfTicks) { this.phase = "halftime"; this.phaseTimer = this.halftimeTicks; this.event("HALFTIME", null, null); for (const e of Object.values(this.pl)) e.stamina = Math.min(100, e.stamina + 18); return true; }
    if (this.time >= this.maxTime) { this.finish(); return false; }

    if (this.phase !== "play") {
      if (--this.phaseTimer > 0) { this.moveAll(0.5); return true; }
      if (this.phase === "penalty") { this.resolvePenalty(); return true; }
      this.phase = "play";
      if (this.freeKickShot && this.ball.owner === this.freeKickShot && this.rng() < 0.5) { const fk = this.freeKickShot; this.freeKickShot = null; this.shoot(fk, "freekick"); return true; }
      this.freeKickShot = null;
    }

    this.updateTargets();
    this.moveAll(1);
    this.updateBall();
    if (this.ball.owner && this.phase === "play" && this.time - this.lastEvent >= 4) this.decide();
    else if (this.ball.owner && this.phase === "play") this.checkPressure();
    return true;
  }

  updateStamina() {
    for (const side of ["home", "away"]) {
      const s = this.teams[side].strategy;
      for (const id of this.onPitch(side)) {
        const e = this.pl[id];
        const endu = e.p.attributs.Endurance;
        const keeper = id === this.keeperOf(side) ? 0.4 : 1;
        const noDrain = this.activePU.some(a => a.pid === id && a.buffs.Endurance > 0 && a.until > this.time) ? 0.6 : 1;
        e.stamina = Math.max(0, e.stamina - (0.016 + this.rng() * 0.005) * s.drain * (this.teams[side].talk?.drain || 1) * (1.3 - endu / 100 * 0.6) * keeper * noDrain);
        e.stats.minutes += 1 / TICKS_PER_MIN;
      }
    }
  }

  updateExclusions() {
    for (const side of ["home", "away"]) {
      const t = this.teams[side];
      for (const ex of t.excluded) {
        if (!ex.done && this.time >= ex.until) {
          ex.done = true;
          const back = t.bench[0];
          if (back) { // retour à 5 avec un remplaçant (ne consomme pas de changement)
            const slot = t.lineup.indexOf(ex.id);
            t.lineup[slot] = back; t.bench.shift(); const b = this.pl[back]; b.onPitch = true; b.x = side === "home" ? 30 : 70; b.y = 2;
            this.placeFormation(side); this.refreshSynergy(side); this.event("RETURN", side, back, ex.id);
          }
        }
      }
    }
  }

  // ── Placement dynamique (repris du prototype, stratégie par stratégie) ──
  lane(idx) { return [12, 24, 36, 48][clamp(idx - 1, 0, 3)] || 30; }

  updateTargets() {
    const ownerSide = this.ball.owner ? this.pl[this.ball.owner].side : this.possession;
    const bx = this.ball.x, by = this.ball.y;
    for (const side of ["home", "away"]) {
      const ids = this.onPitch(side);
      const t = this.teams[side]; const st = t.strategy.id; const f = this.fwd(side);
      const own = this.ownGoalX(side), att = this.goalX(side);
      const hasBall = ownerSide === side;
      const keeper = this.keeperOf(side);
      const bp = this.ball.owner ? this.pl[this.ball.owner] : this.ball;
      const field = ids.filter(id => id !== keeper);
      const loose = !this.ball.owner && (this.ball.kind === "loose" || !this.ball.target);
      const byDist = field.map(id => ({ id, d: dist(this.pl[id], bp) })).sort((a, b) => a.d - b.d);
      const closest = byDist[0] || null; const second = byDist[1] || null;
      this._second = second;
      for (const id of ids) {
        const e = this.pl[id]; const idx = e.slot; const role = FORMATIONS[t.formation].roles[idx] || roleOf(e.p);
        const myLane = this.lane(idx);
        let tg;
        if (id === this.ball.owner) {
          tg = id === keeper ? { x: e.x + f * 2, y: 30 } : { x: att, y: myLane * 0.5 + 15 + (this.rng() - 0.5) * 4 };
        } else if (id === keeper) {
          tg = this.keeperTarget(side, st, bx, by);
        } else if (this.ball.kind === "pass" && this.ball.receiver === id && this.ball.target) {
          tg = { x: this.ball.target.x, y: this.ball.target.y }; // le receveur vient au ballon
        } else if (loose && closest?.id === id && dist(e, this.ball) < 30) {
          tg = { x: bx, y: by }; // ballon libre : le plus proche de chaque équipe fonce
        } else {
          tg = this.fieldTarget(side, st, id, role, idx, myLane, hasBall, bp, closest, own, att, f);
        }
        e.tx = clamp(tg.x, 1, 99); e.ty = clamp(tg.y, 1, 59);
      }
      // séparation minimale entre coéquipiers
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const A = this.pl[ids[i]], B = this.pl[ids[j]];
        const dx = A.tx - B.tx, dy = A.ty - B.ty, d = Math.hypot(dx, dy);
        if (d < 6 && d > 0.1) { const px = dx / d * 2.5, py = dy / d * 2.5; A.tx = clamp(A.tx + px, 1, 99); A.ty = clamp(A.ty + py, 1, 59); B.tx = clamp(B.tx - px, 1, 99); B.ty = clamp(B.ty - py, 1, 59); }
      }
    }
  }

  keeperTarget(side, st, bx, by) {
    const isHome = side === "home"; const own = this.ownGoalX(side);
    const oppHas = this.ball.owner && this.pl[this.ball.owner].side !== side;
    if (st === "possession" && !oppHas) { const k = isHome ? Math.min(bx - 10, 26) : Math.max(bx + 10, 74); return { x: isHome ? Math.max(6, k) : Math.min(94, k), y: 30 + (by - 30) * 0.4 }; }
    if (st === "attack" && !oppHas) { const k = isHome ? Math.min(bx - 8, 38) : Math.max(bx + 8, 62); return { x: isHome ? Math.max(8, k) : Math.min(92, k), y: 30 + (by - 30) * 0.3 }; }
    const inBox = Math.abs(bx - own) < 16 && by > 14 && by < 46;
    if (inBox && !this.ball.owner && this.ball.kind !== "shot") return { x: bx, y: by };
    const adv = Math.abs(bx - own) < 30 ? 3.5 : 2;
    return { x: own + (isHome ? adv : -adv), y: clamp(30 + (by - 30) * 0.45, GOAL_Y - GOAL_HALF + 1, GOAL_Y + GOAL_HALF - 1) };
  }

  fieldTarget(side, st, id, role, idx, myLane, hasBall, bp, closest, own, att, f) {
    const e = this.pl[id]; const bx = this.ball.x, by = this.ball.y; const r = this.rng;
    const isHome = side === "home";
    const oppSide = this.opp(side);
    switch (st) {
      case "pressing": {
        const opps = this.onPitch(oppSide); const mark = this.pl[opps[idx] || opps[opps.length - 1]];
        if (hasBall) return { x: mark.x + f * 4, y: mark.y + (r() - 0.5) * 6 };
        if (closest?.id === id) return { x: bp.x, y: bp.y };
        const tight = clamp(e.stamina / 70, 0.3, 1); // le marquage se relâche avec la fatigue
        return { x: (mark.x - f * 1.5) * tight + e.bx * (1 - tight), y: mark.y * tight + myLane * (1 - tight) };
      }
      case "counter": {
        if (hasBall) {
          if (role === "att") return { x: isHome ? Math.max(bx + 15, 70) : Math.min(bx - 15, 30), y: myLane + (r() - 0.5) * 8 };
          return { x: isHome ? Math.min(34, e.bx + 8) : Math.max(66, e.bx - 8), y: myLane };
        }
        if (closest?.id === id && closest.d < 20) return { x: bp.x, y: bp.y };
        if (this._second?.id === id && Math.abs(bp.x - own) < 35) return { x: bp.x + (own - bp.x) * 0.3, y: bp.y };
        return { x: isHome ? Math.min(24, e.bx) : Math.max(76, e.bx), y: myLane + (by - myLane) * 0.25 };
      }
      case "possession": {
        if (hasBall) { const cx = bx + f * (4 + idx * 4); return { x: isHome ? Math.min(90, cx) : Math.max(10, cx), y: by + (myLane - 30) * 0.55 }; }
        if (closest?.id === id && closest.d < 22) return { x: bp.x, y: bp.y };
        if (this._second?.id === id) return { x: bp.x + (own - bp.x) * 0.3, y: bp.y };
        return { x: (bp.x + own) / 2 + (idx - 2) * 4, y: bp.y + (myLane - 30) * 0.35 };
      }
      case "attack": {
        if (hasBall) { const px = bx + f * (8 + idx * 5); return { x: isHome ? clamp(px, 40, 94) : clamp(px, 6, 60), y: myLane + (r() - 0.5) * 6 }; }
        if (closest?.id === id) return { x: bp.x, y: bp.y };
        return { x: bp.x + f * (idx * 3 - 4), y: bp.y + (myLane - 30) * 0.35 };
      }
      case "park_bus": {
        if (role === "att") return { x: isHome ? Math.max(52, bx + 10) : Math.min(48, bx - 10), y: 30 + (by - 30) * 0.5 }; // point d'appui
        if (hasBall) return { x: isHome ? Math.min(40, e.bx + 6) : Math.max(60, e.bx - 6), y: myLane };
        if (closest?.id === id && closest.d < 8) return { x: bp.x, y: bp.y };
        const depth = 7 + idx * 2.2; // bloc compact à l'entrée de la surface
        return { x: own + f * depth, y: 30 + (myLane - 30) * 0.45 + (by - 30) * 0.3 };
      }
      default: {
        if (hasBall) {
          if (role === "att") { const rx = bx + f * (12 + idx * 3); return { x: isHome ? clamp(rx, bx + 3, 92) : clamp(rx, 8, bx - 3), y: myLane + (r() - 0.5) * 5 }; }
          if (role === "mid") { const sx = bx + f * (3 + idx * 2); return { x: isHome ? Math.min(84, sx) : Math.max(16, sx), y: myLane + (r() - 0.5) * 5 }; }
          const dx = bx - f * (10 + idx * 3); return { x: isHome ? Math.max(12, dx) : Math.min(88, dx), y: myLane };
        }
        if (closest?.id === id && closest.d < 26) return { x: bp.x, y: bp.y };
        if (this._second?.id === id && this._second.d < 30) return { x: bp.x + (own - bp.x) * 0.3, y: bp.y + (30 - bp.y) * 0.3 }; // couverture
        if (role === "def" && Math.abs(bp.x - own) < 35 && dist(e, bp) < 16) return { x: bp.x + (own - bp.x) * 0.15, y: bp.y }; // le défenseur sort dans sa zone
        if (role === "def") {
          const lurk = this.onPitch(oppSide).map(o => this.pl[o]).filter(o => Math.abs(o.x - own) < 32 && o.id !== this.ball.owner)
            .reduce((b, o) => { const d = dist(e, o); return !b || d < b.d ? { o, d } : b; }, null);
          if (lurk) return { x: (lurk.o.x + own) / 2, y: lurk.o.y };
        }
        const hx = bp.x * 0.35 + own * 0.65;
        return { x: isHome ? Math.max(8, hx + idx * 2) : Math.min(92, hx - idx * 2), y: myLane + (bp.y - myLane) * 0.2 };
      }
    }
  }

  moveAll(factor) {
    for (const side of ["home", "away"]) {
      const sm = this.teams[side].strategy.speedMod || 1;
      for (const id of this.onPitch(side)) {
        const e = this.pl[id];
        const spd = ((this.attr(id, "Vitesse") / 99) * 0.62 + 0.18) * (0.55 + 0.45 * e.stamina / 100) * sm * factor * (id === this.ball.owner ? 0.85 + this.attr(id, "Dribble") / 99 * 0.15 : 1);
        const d = Math.hypot(e.tx - e.x, e.ty - e.y);
        if (d <= spd) { e.x = e.tx; e.y = e.ty; } else { e.x += (e.tx - e.x) / d * spd; e.y += (e.ty - e.y) / d * spd; }
      }
    }
  }

  // ── Ballon ────────────────────────────────────────────────
  updateBall() {
    const b = this.ball;
    if (b.owner) { const o = this.pl[b.owner]; b.x = o.x + this.fwd(o.side) * 0.8; b.y = o.y; b.travel = 0; return; }
    if (b.target) {
      const d = Math.hypot(b.target.x - b.x, b.target.y - b.y);
      if (d <= b.speed) { b.x = b.target.x; b.y = b.target.y; this.onArrive(); }
      else { b.x += (b.target.x - b.x) / d * b.speed; b.y += (b.target.y - b.y) / d * b.speed; if (b.kind === "pass" || b.kind === "loose") this.checkInterception(); }
      if (++b.travel > 70) { b.target = null; b.kind = "loose"; }
      return;
    }
    // ballon libre : ralentit, le plus proche le récupère
    let best = null;
    for (const e of Object.values(this.pl)) if (e.onPitch) { const d = dist(e, b); if (!best || d < best.d) best = { e, d }; }
    if (best && best.d < 2.2) this.gainBall(best.e.id);
    else if (++b.travel > 120) { b.x += (50 - b.x) * 0.05; b.y += (30 - b.y) * 0.05; }
  }

  gainBall(id) {
    const e = this.pl[id]; const b = this.ball;
    Object.assign(b, { owner: id, target: null, kind: null, receiver: null, shot: null, travel: 0 });
    if (this.possession !== e.side) this.lastPass = null;
    this.possession = e.side; this.lastEvent = this.time - 2;
  }

  checkInterception() {
    const b = this.ball; const passer = b.from ? this.pl[b.from] : null; const side = passer ? passer.side : this.possession;
    for (const id of this.onPitch(this.opp(side))) {
      const e = this.pl[id];
      if (dist(e, b) < 2.4 && this.rng() < (this.attr(id, "Tacle") * 0.0028 + this.attr(id, "Vision") * 0.001) * (1.5 - (b.quality ?? 0.5))) {
        e.stats.interceptions++; this.teams[e.side].stats.tackles++;
        this.gainBall(id);
        this.event("INTERCEPT", e.side, id, null, {}, "tacle_reussi");
        return;
      }
    }
  }

  onArrive() {
    const b = this.ball;
    if (b.kind === "shot" && b.shot) return this.resolveShot();
    if (b.kind === "pass" && b.receiver && this.pl[b.receiver].onPitch) {
      const r = this.pl[b.receiver];
      if (dist(r, b) < 4) { this.gainBall(b.receiver); return; }
    }
    b.target = null; b.kind = "loose"; b.travel = 0;
  }

  // ── Décisions du porteur ─────────────────────────────────
  nearestOpp(id) {
    const e = this.pl[id]; let best = null;
    for (const o of this.onPitch(this.opp(e.side))) { if (o === this.keeperOf(this.opp(e.side))) continue; const d = dist(e, this.pl[o]); if (!best || d < best.d) best = { id: o, d }; }
    return best || { id: null, d: 99 };
  }

  checkPressure() {
    // un défenseur au contact peut tenter un tacle même entre deux décisions
    const id = this.ball.owner; const n = this.nearestOpp(id);
    if (n.id && n.d < 2.2 && this.rng() < 0.07) this.duel(id, n.id);
  }

  decide() {
    const id = this.ball.owner; const e = this.pl[id]; const side = e.side; const st = this.teams[side].strategy;
    const gx = this.goalX(side); const dGoal = Math.hypot(gx - e.x, GOAL_Y - e.y);
    const r = this.rng(); const role = roleOf(e.p); const n = this.nearestOpp(id);
    if (id === this.keeperOf(side)) {
      if (st.id === "possession" && dGoal > 45 && r < 0.4) { this.lastEvent = this.time; return; }
      return this.pass(id, st.id === "counter" ? "long" : "short");
    }
    if (n.id && n.d < 3 && dGoal > 22) return r < 0.35 + this.attr(id, "Dribble") / 250 ? this.dribble(id, n.id) : this.pass(id, "short");
    const bias = (st.shootBias || 0) / 100;
    if (dGoal < 14) return this.shoot(id);
    if (dGoal < 26 && r < 0.42 + bias + (role === "att" ? 0.18 : 0) + (n.d > 8 ? 0.15 : 0)) return this.shoot(id);
    if (dGoal < 38 && r < 0.06 + bias + (this.attr(id, "Finition") > 84 ? 0.08 : 0)) return this.shoot(id);
    // porteur le plus avancé avec de l'espace devant : il conduit (clé des contres et du point d'appui)
    const mostAdvanced = this.onPitch(side).every(m => m === id || (this.pl[m].x - e.x) * this.fwd(side) < 2);
    if (mostAdvanced && n.d > 5 && (st.id === "counter" || st.id === "park_bus" || role === "att") && r < 0.75) { this.lastEvent = this.time - 2; return; }
    switch (st.id) {
      case "possession": return r < 0.78 ? this.pass(id, "short") : r < 0.9 && n.id ? this.dribble(id, n.id) : void (this.lastEvent = this.time);
      case "counter": return (side === "home" ? e.x < 50 : e.x > 50) && r < 0.75 ? this.pass(id, "long") : r < 0.6 ? this.pass(id, "short") : void (this.lastEvent = this.time);
      case "park_bus": return r < 0.7 ? this.pass(id, "long") : void (this.lastEvent = this.time);
      case "attack": return r < 0.55 ? this.pass(id, "short") : n.id && r < 0.75 ? this.dribble(id, n.id) : void (this.lastEvent = this.time);
      case "pressing": return r < 0.6 ? this.pass(id, "short") : void (this.lastEvent = this.time);
      default: return r < 0.5 ? this.pass(id, "short") : n.id && n.d < 7 && r < 0.65 ? this.dribble(id, n.id) : void (this.lastEvent = this.time);
    }
  }

  pass(id, style) {
    const e = this.pl[id]; const side = e.side; const f = this.fwd(side);
    const mates = this.onPitch(side).filter(m => m !== id);
    let best = null;
    for (const m of mates) {
      const t = this.pl[m];
      const prog = (t.x - e.x) * f; const d = dist(e, t);
      const open = Math.min(12, ...this.onPitch(this.opp(side)).map(o => dist(this.pl[o], t)));
      let sc = prog * (style === "long" ? 0.9 : 0.45) - d * (style === "long" ? 0.05 : 0.3) + open * 0.9 + this.rng() * (14 - this.attr(id, "Vision") / 10);
      if (m === this.keeperOf(side)) sc -= 12;
      if (!best || sc > best.sc) best = { m, sc };
    }
    this.lastEvent = this.time;
    if (!best) return;
    const t = this.pl[best.m]; const d = dist(e, t);
    const pressure = this.nearestOpp(id).d < 4 ? 0.12 : 0;
    const perfect = this.activePU.some(a => a.pid === id && (a.buffs.Vision || 0) >= 10 && a.until > this.time);
    const pOk = clamp(0.58 + this.attr(id, "Vision") / 100 * 0.38 - pressure - d / 100 * 0.35 + (perfect ? 0.08 : 0), 0.3, 0.97);
    e.stats.passes++; this.teams[side].stats.passes++;
    const b = this.ball; b.owner = null; b.from = id; b.travel = 0;
    if (this.rng() < pOk) {
      const lead = style === "long" ? 3 * this.fwd(side) : 0;
      b.target = { x: clamp(t.x + lead + (this.rng() - 0.5) * 2, 1, 99), y: clamp(t.y + (this.rng() - 0.5) * 2, 1, 59) };
      b.speed = style === "long" ? 3.6 : 2.9; b.kind = "pass"; b.receiver = best.m; b.quality = pOk;
      e.stats.passesOk++; this.teams[side].stats.passesOk++;
      this.lastPass = { from: id, t: this.time, side };
      if (d > 30 || this.rng() < 0.12) this.event("PASS", side, id, best.m, {}, "passe_decisive");
    } else {
      b.target = { x: clamp(t.x + (this.rng() - 0.5) * 16, 1, 99), y: clamp(t.y + (this.rng() - 0.5) * 12, 1, 59) };
      b.speed = 2.6; b.kind = "loose"; b.receiver = null; b.quality = 0.3;
    }
  }

  dribble(id, defId) {
    const e = this.pl[id]; this.lastEvent = this.time;
    const glue = this.activePU.some(a => a.pid === id && (a.buffs.Dribble || 0) >= 8 && a.until > this.time);
    const p = clamp(0.42 + (this.attr(id, "Dribble") - this.attr(defId, "Tacle")) / 100 * 0.9 + (this.attr(id, "Vitesse") - this.attr(defId, "Vitesse")) / 100 * 0.25 + (glue ? 0.1 : 0), 0.12, 0.88);
    if (this.rng() < p) {
      e.stats.dribbles++;
      e.x = clamp(e.x + this.fwd(e.side) * 5, 2, 98); e.y = clamp(e.y + (this.rng() - 0.5) * 6, 2, 58);
      if (this.rng() < 0.35) this.event("DRIBBLE", e.side, id, defId, {}, "dribble_reussi");
    } else this.duel(id, defId, true);
  }

  duel(att, def, afterDribble = false) {
    this.lastEvent = this.time;
    const A = this.pl[att], D = this.pl[def];
    const pTackle = clamp(0.38 + (this.attr(def, "Tacle") - this.attr(att, "Dribble")) / 100 * 0.8 + (this.attr(def, "Force") - this.attr(att, "Force")) / 100 * 0.3 + (afterDribble ? 0.15 : 0), 0.1, 0.85);
    if (this.rng() > pTackle) return;
    const st = this.teams[D.side].strategy.id;
    // discipline : plus les caractéristiques défensives sont élevées, moins le défenseur commet de fautes
    const discipline = clamp(1.4 - (this.attr(def, "Tacle") * 0.6 + this.attr(def, "Sang-froid") * 0.3 + this.attr(def, "Vision") * 0.1) / 99 * 1.05, 0.3, 1.3);
    const pFoul = (0.1 + (st === "pressing" ? 0.1 : 0) + (st === "park_bus" ? 0.03 : 0)) * discipline * (this.teams[D.side].talk?.fouls || 1);
    if (this.rng() < pFoul) return this.foul(def, att);
    D.stats.tackles++; this.teams[D.side].stats.tackles++;
    this.gainBall(def);
    if (this.rng() < 0.45) this.event("TACKLE", D.side, def, att, {}, "tacle_reussi");
  }

  foul(def, victim) {
    const D = this.pl[def], V = this.pl[victim]; const t = this.teams[D.side];
    D.stats.fouls++; t.stats.fouls++;
    this.event("FOUL", D.side, def, victim, {}, "faute");
    // pas de cartons : la faute donne un coup franc, ou un penalty dans la surface
    const inBox = Math.abs(V.x - this.ownGoalX(D.side)) < 14 && V.y > 12 && V.y < 48;
    this.gainBall(victim);
    if (inBox) { this.phase = "penalty"; this.phaseTimer = 25; this.penaltySide = V.side; this.event("PENALTY", V.side, victim); return; }
    this.phase = "foul"; this.phaseTimer = 12;
    const dGoal = Math.abs(this.goalX(V.side) - V.x);
    this.freeKickShot = dGoal < 30 ? victim : null;
  }


  // ── Tirs ──────────────────────────────────────────────────
  shoot(id, kind = "open") {
    const e = this.pl[id]; const side = e.side; const gx = this.goalX(side); this.lastEvent = this.time;
    const d = Math.hypot(gx - e.x, GOAL_Y - e.y) * 0.4;                 // en mètres (1 unité = 0,4 m)
    const angle = Math.abs(Math.atan2(Math.abs(GOAL_Y - e.y), Math.abs(gx - e.x)));
    const n = this.nearestOpp(id);
    const pressure = n.d < 3 ? 0.7 : n.d < 6 ? 0.85 : 1;
    const perfect = this.activePU.some(a => a.pid === id && (a.buffs.Finition || 0) >= 8 && a.until > this.time);
    const blockers = this.blockersFor(e, gx);
    if (kind === "open" && blockers > 0 && this.rng() < 0.3 * blockers) {
      e.stats.shots++; this.teams[side].stats.shots++; this.lastEvent = this.time;
      const f = this.fwd(side);
      Object.assign(this.ball, { owner: null, target: { x: clamp(e.x + f * (3 + this.rng() * 5), 2, 98), y: clamp(e.y + (this.rng() - 0.5) * 16, 2, 58) }, speed: 2.2, kind: "loose", receiver: null, travel: 0, shot: null, quality: 0.3 });
      this.event("BLOCK", this.opp(side), null, id);
      return;
    }
    let xg = clamp(0.55 * Math.exp(-Math.max(0, d - 2) / 8.5) * Math.cos(angle) ** 1.3 * pressure, 0.02, 0.7);
    if (kind === "freekick") xg = 0.1;
    const skill = (this.attr(id, "Finition") * 0.7 + this.attr(id, "Sang-froid") * 0.3) / 100;
    const iso = (kind === "open" && blockers === 0 ? 1.25 : Math.pow(0.7, blockers)) * matchupFactor(this.teams[side].strategy.id, this.teams[this.opp(side)].strategy.id);
    xg = clamp(xg * (0.6 + skill * 0.75) * (perfect ? 1.15 : 1) * iso, 0.01, 0.85);
    const pOnTarget = clamp(0.3 + skill * 0.45 * pressure + (perfect ? 0.1 : 0) - blockers * 0.05, 0.2, 0.9);
    e.stats.shots++; e.stats.xg += xg; const T = this.teams[side].stats; T.shots++; T.xg += xg;
    this.xgTimeline.push([this.time, side === "home" ? 0 : 1, Math.round(xg * 100) / 100]);
    const on = this.rng() < pOnTarget;
    const ty = on ? GOAL_Y + (this.rng() - 0.5) * GOAL_HALF * 1.7 : GOAL_Y + (this.rng() < 0.5 ? -1 : 1) * (GOAL_HALF + 1 + this.rng() * 8);
    Object.assign(this.ball, { owner: null, target: { x: gx, y: ty }, speed: 4 + this.attr(id, "Force") / 99 * 1.8, kind: "shot", receiver: null, travel: 0, from: id, shot: { id, side, on, xg, pGoal: on ? clamp(xg / pOnTarget, 0.05, 0.95) : 0, kind } });
    if (on) { e.stats.onTarget++; T.onTarget++; }
  }

  // défenseurs de champ situés dans le triangle tireur → poteaux
  blockersFor(e, gx) {
    let n = 0; const k = this.keeperOf(this.opp(e.side));
    for (const id of this.onPitch(this.opp(e.side))) {
      if (id === k) continue; const o = this.pl[id];
      const tx = (o.x - e.x) / (gx - e.x); if (tx <= 0.05 || tx >= 1) continue;
      const half = GOAL_HALF + 2 + (Math.abs(e.y - GOAL_Y) * (1 - tx)) * 0.15;
      const cy = e.y + (GOAL_Y - e.y) * tx; const w = half * tx + 1.2;
      if (Math.abs(o.y - cy) < w) n++;
    }
    return n;
  }

  resolveShot() {
    const s = this.ball.shot; const side = s.side; const e = this.pl[s.id];
    const keeper = this.keeperOf(this.opp(side)); const K = keeper ? this.pl[keeper] : null;
    this.ball.shot = null; this.ball.target = null;
    if (!s.on) {
      if (this.rng() < 0.12) this.event("POST", side, s.id);
      else this.event("MISS", side, s.id, null, {}, "tir_rate");
      if (K) this.gainBall(keeper); else this.ball.kind = "loose";
      return;
    }
    const ref = K ? this.attr(keeper, "Réflexes") * 0.75 + this.attr(keeper, "Sang-froid") * 0.25 : 20;
    const keeperOut = K ? Math.abs(K.x - this.ownGoalX(K.side)) > 12 : true;
    const pGoal = clamp(s.pGoal * (1.55 - ref / 100 * 0.8) * (keeperOut ? 1.35 : 1), 0.04, 0.96);
    if (this.rng() < pGoal) return this.goal(side, s.id, s.kind);
    // arrêt : captée ou repoussée
    K.stats.saves++; this.teams[K.side].stats.saves++;
    this.event("SAVE", K.side, keeper, s.id, {}, "arret");
    if (this.rng() < 0.55) this.gainBall(keeper);
    else { const f = this.fwd(K.side); Object.assign(this.ball, { target: { x: clamp(K.x + f * (6 + this.rng() * 8), 2, 98), y: clamp(K.y + (this.rng() - 0.5) * 24, 2, 58) }, speed: 2.4, kind: "loose", travel: 0 }); }
  }

  goal(side, scorer, kind = "open") {
    const t = this.teams[side]; t.score++;
    const S = this.pl[scorer]; S.stats.goals++;
    const k = this.keeperOf(this.opp(side)); if (k) this.pl[k].stats.conceded++;
    const assist = this.lastPass && this.lastPass.side === side && this.lastPass.from !== scorer && this.time - this.lastPass.t < 60 ? this.lastPass.from : null;
    if (assist) this.pl[assist].stats.assists++;
    this.event("GOAL", side, scorer, assist, { score: [this.teams.home.score, this.teams.away.score], kind }, "but_marque");
    this.phase = "goal"; this.phaseTimer = 30; this.lastPass = null;
    this.kickoff(this.opp(side));
  }

  resolvePenalty() {
    const side = this.penaltySide; const ids = this.onPitch(side);
    const shooter = ids.reduce((b, id) => (!b || this.attr(id, "Finition") + this.attr(id, "Sang-froid") > this.attr(b, "Finition") + this.attr(b, "Sang-froid") ? id : b), null);
    const keeper = this.keeperOf(this.opp(side));
    const S = this.pl[shooter]; S.stats.shots++; S.stats.onTarget++; S.stats.xg += 0.7; this.xgTimeline.push([this.time, side === "home" ? 0 : 1, 0.7]); this.teams[side].stats.shots++; this.teams[side].stats.onTarget++; this.teams[side].stats.xg += 0.7;
    const p = clamp(0.7 + (this.attr(shooter, "Finition") + this.attr(shooter, "Sang-froid") - 150) / 200 * 0.4 - (keeper ? (this.attr(keeper, "Réflexes") - 55) / 100 * 0.35 : -0.2), 0.45, 0.93);
    this.phase = "play";
    if (this.rng() < p) { this.goal(side, shooter, "penalty"); }
    else { if (keeper) { this.pl[keeper].stats.saves++; this.teams[this.opp(side)].stats.saves++; this.event("SAVE", this.opp(side), keeper, shooter, { penalty: true }, "arret"); this.gainBall(keeper); } }
  }

  // ── Fin de match ─────────────────────────────────────────
  finish() {
    this.phase = "ended";
    const h = this.teams.home.score, a = this.teams.away.score;
    for (const e of Object.values(this.pl)) {
      if (e.stats.minutes <= 0) continue;
      const s = e.stats; const res = e.side === "home" ? Math.sign(h - a) : Math.sign(a - h);
      const isK = this.teams[e.side].lineup[0] === e.id;
      let r = 6 + s.goals * 1.0 + s.assists * 0.6 + s.onTarget * 0.12 + s.passesOk * 0.015 + (s.tackles + s.interceptions) * 0.15 + s.dribbles * 0.1 + s.saves * (isK ? 0.3 : 0) - s.conceded * (isK ? 0.22 : 0) - s.fouls * 0.1 - s.yellow * 0.3 - s.red * 1.5 + res * 0.4 + s.powerups * 0.05;
      if (isK && (e.side === "home" ? a : h) === 0) r += 0.6;
      e.rating = Math.round(clamp(r, 3, 10) * 10) / 10;
    }
    this.event("END", null, null, null, { score: [h, a] });
  }

  mvp() {
    return Object.values(this.pl).filter(e => e.stats.minutes > 0).sort((x, y) => y.rating - x.rating || y.stats.goals - x.stats.goals)[0]?.id || null;
  }

  // ── Vues ──────────────────────────────────────────────────
  clock() { return Math.floor(this.time / TICKS_PER_MIN); }

  snapshot() {
    const p = {};
    for (const e of Object.values(this.pl)) if (e.onPitch) p[e.id] = [Math.round(e.x * 10) / 10, Math.round(e.y * 10) / 10, Math.round(e.stamina)];
    return {
      t: this.time, max: this.maxTime, half: this.half, phase: this.phase,
      score: [this.teams.home.score, this.teams.away.score],
      ball: { x: Math.round(this.ball.x * 10) / 10, y: Math.round(this.ball.y * 10) / 10, o: this.ball.owner, k: this.ball.kind, tx: this.ball.target?.x, ty: this.ball.target?.y },
      p, pu: this.activePU.filter(a => !a.debuff).map(a => ({ pid: a.pid, id: a.puId, until: a.until })), debuff: this.activePU.filter(a => a.debuff).map(a => a.pid),
      cd: { ...this.cooldowns },
      poss: this.possessionPct(),
      live: ["home", "away"].map(s => { const st = this.teams[s].stats; return [st.shots, st.onTarget, Math.round(st.xg * 10) / 10]; }),
      teams: Object.fromEntries(["home", "away"].map(s => { const t = this.teams[s]; return [s, { talk: t.talk?.id || null, lineup: [...t.lineup], bench: [...t.bench], strategy: t.strategy.id, formation: t.formation, subsLeft: t.subsLeft, synergies: t.synergies, cards: Object.fromEntries(Object.values(this.pl).filter(e => e.side === s && (e.yellow || e.red)).map(e => [e.id, e.red ? "R" : "Y"])) }]; })),
    };
  }

  possessionPct() { const tot = this.possTicks.home + this.possTicks.away || 1; const h = Math.round(this.possTicks.home / tot * 100); return [h, 100 - h]; }

  report() {
    const teams = {};
    for (const s of ["home", "away"]) {
      const t = this.teams[s];
      teams[s] = { name: t.name, colors: t.colors, crest: t.crest, score: t.score, formation: t.formation, strategy: t.strategy.id, synergies: t.synergies, stats: { ...t.stats, xg: Math.round(t.stats.xg * 100) / 100 } };
    }
    const players = Object.values(this.pl).filter(e => e.stats.minutes > 0).map(e => ({ id: e.id, side: e.side, rating: e.rating, stamina: Math.round(e.stamina), stats: { ...e.stats, xg: Math.round(e.stats.xg * 100) / 100, minutes: Math.round(e.stats.minutes) } }));
    const [ph, pa] = this.possessionPct();
    teams.home.stats.possession = ph; teams.away.stats.possession = pa;
    return { teams, players, mvp: this.mvp(), events: this.events.filter(e => e.type !== "PASS" || e.n), duration: this.time, xgTimeline: this.xgTimeline };
  }
}

// Aide : simuler un match complet sans rendu (tests, bots).
export function simulateMatch(setup, { seed = 1, onTick } = {}) {
  const eng = new ManagerEngine({ ...setup, seed });
  let guard = 0;
  while (eng.tick() && guard++ < 20000) onTick?.(eng);
  return eng;
}
