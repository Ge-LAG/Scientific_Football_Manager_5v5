// Manager virtuel (bot) — trois niveaux : Stagiaire, Chercheur, Prix Nobel.
import { PLAYERS, getPlayer, keeperRating, FORMATIONS, STRATEGIES } from "../data/content.js";
import { synergyBonus } from "../data/enrichment.js";
import { matchupFactor } from "./engine.js";

export const DIFFICULTIES = {
  stagiaire: { fr: "Stagiaire", en: "Intern", think: 60, puChance: 0.12, subStamina: 0, adapt: false, counterPick: false },
  chercheur: { fr: "Chercheur", en: "Researcher", think: 30, puChance: 0.3, subStamina: 32, adapt: true, counterPick: false },
  nobel:     { fr: "Prix Nobel", en: "Nobel Laureate", think: 15, puChance: 0.85, subStamina: 45, adapt: true, counterPick: true },
};

const A = (p, k) => p.attributs[k];
export const ROLE_SCORE = {
  gk: p => keeperRating(p),
  def: p => A(p, "Tacle") * 0.4 + A(p, "Force") * 0.2 + A(p, "Sang-froid") * 0.2 + A(p, "Vision") * 0.1 + A(p, "Endurance") * 0.1,
  mid: p => A(p, "Vision") * 0.3 + A(p, "Dribble") * 0.2 + A(p, "Endurance") * 0.2 + A(p, "Tacle") * 0.15 + A(p, "Finition") * 0.15,
  att: p => A(p, "Finition") * 0.45 + A(p, "Dribble") * 0.2 + A(p, "Vitesse") * 0.2 + A(p, "Sang-froid") * 0.15,
};

// Ordonne 5 titulaires selon les rôles de la formation (gardien en premier) ; le reste va au banc.
export function autoLineup(ids, formation = "2-2") {
  const roles = FORMATIONS[formation]?.roles || FORMATIONS["2-2"].roles;
  const pool = ids.map(getPlayer).filter(Boolean);
  const lineup = [];
  for (const role of roles) {
    const best = pool.filter(p => !lineup.includes(p.id)).sort((a, b) => ROLE_SCORE[role](b) - ROLE_SCORE[role](a))[0];
    if (best) lineup.push(best.id);
  }
  return { lineup, bench: pool.map(p => p.id).filter(id => !lineup.includes(id)).slice(0, 3) };
}

// Valeur d'une équipe (sert au bot pour choisir ses recrues).
export function teamValue(ids, formation = "2-2") {
  const { lineup } = autoLineup(ids, formation);
  const roles = FORMATIONS[formation].roles;
  const players = lineup.map(getPlayer);
  const syn = Object.values(synergyBonus(players)).reduce((a, b) => a + b, 0);
  return players.reduce((s, p, i) => s + ROLE_SCORE[roles[i]](p), 0) + syn * 4;
}

// Choix d'une recrue pendant une draft (ou d'une équipe complète contre un humain).
export function pickForDraft(myIds, availableIds, difficulty, rng) {
  if (difficulty === "stagiaire") return rng.pick(availableIds);
  let best = null;
  for (const id of availableIds) {
    const v = teamValue([...myIds, id]) + (difficulty === "chercheur" ? rng() * 30 : rng() * 6);
    if (!best || v > best.v) best = { id, v };
  }
  return best.id;
}

export function buildBotSquad(rng, excludeIds = [], difficulty = "chercheur", size = 8) {
  let avail = PLAYERS.map(p => p.id).filter(id => !excludeIds.includes(id));
  const mine = [];
  while (mine.length < size && avail.length) { const id = pickForDraft(mine, avail, difficulty, rng); mine.push(id); avail = avail.filter(x => x !== id); }
  const formation = difficulty === "stagiaire" ? rng.pick(Object.keys(FORMATIONS)) : Object.keys(FORMATIONS).map(f => ({ f, v: teamValue(mine, f) })).sort((a, b) => b.v - a.v)[0].f;
  const { lineup, bench } = autoLineup(mine, formation);
  const strategy = difficulty === "stagiaire" ? rng.pick(STRATEGIES).id : "equilibre";
  return { lineup, bench, formation, strategy };
}

// Meilleure réponse tactique à la stratégie adverse (Prix Nobel).
export function bestResponse(oppStrategy) {
  return STRATEGIES.map(s => ({ id: s.id, v: matchupFactor(s.id, oppStrategy) / matchupFactor(oppStrategy, s.id) })).sort((a, b) => b.v - a.v)[0].id;
}

export class BotManager {
  constructor(side, difficulty = "chercheur", rng) {
    this.side = side; this.level = DIFFICULTIES[difficulty] ? difficulty : "chercheur"; this.cfg = DIFFICULTIES[this.level]; this.rng = rng;
    this.next = 20 + Math.floor(rng() * 20);
  }

  // Renvoie des commandes à passer au moteur (appelé à chaque tick, agit périodiquement).
  think(eng) {
    // causerie de mi-temps selon le score et la fatigue
    if (eng.phase === "halftime" && !eng.teams[this.side].talk) {
      const me0 = eng.teams[this.side], op0 = eng.teams[eng.opp(this.side)];
      const tired = eng.onPitch(this.side).reduce((s, id) => s + eng.pl[id].stamina, 0) / 5 < 60;
      const id = this.level === "stagiaire" ? this.rng.pick(["brainstorm", "deadline", "peer_review", "coffee"]) : tired ? "coffee" : me0.score < op0.score ? "deadline" : me0.score > op0.score ? "peer_review" : "brainstorm";
      return [{ type: "talk", id }];
    }
    if (eng.phase === "ended" || eng.time < this.next) return [];
    this.next = eng.time + this.cfg.think + Math.floor(this.rng() * this.cfg.think);
    const out = []; const me = eng.teams[this.side]; const opp = eng.teams[eng.opp(this.side)];
    const diff = me.score - opp.score; const late = eng.time > eng.maxTime * 0.7;

    // 1) Stratégie
    if (this.cfg.adapt) {
      let want = me.strategy.id;
      if (this.cfg.counterPick && this.rng() < 0.5) want = bestResponse(opp.strategy.id);
      if (diff < 0 && late) want = diff <= -2 ? "attack" : this.cfg.counterPick ? bestResponse(opp.strategy.id) : "attack";
      else if (diff > 0 && late) want = opp.strategy.id === "attack" ? "counter" : "park_bus";
      else if (!this.cfg.counterPick && this.rng() < 0.1) want = this.rng.pick(STRATEGIES).id;
      if (want !== me.strategy.id) out.push({ type: "strategy", id: want });
    } else if (this.rng() < 0.04) out.push({ type: "strategy", id: this.rng.pick(STRATEGIES).id });

    // 2) Power-ups : déclenchés quand ils servent (ballon dans la bonne zone) pour les meilleurs niveaux
    const ball = eng.ball; const attackingThird = this.side === "home" ? ball.x > 62 : ball.x < 38; const defThird = this.side === "home" ? ball.x < 38 : ball.x > 62;
    pus: for (const id of eng.onPitch(this.side)) {
      if (eng.activePU.some(a => a.pid === id)) continue;
      for (const pu of eng.pl[id].pus || []) {
        if ((eng.cooldowns[pu.id] || 0) > eng.time) continue;
        const useful = this.level === "stagiaire" || (pu.type === "attaque" && attackingThird) || (pu.type === "défense" && defThird) || pu.type === "contrôle" || (pu.type === "mental" && (pu.healStamina ? eng.onPitch(this.side).some(x => eng.pl[x].stamina < 55) : true));
        if (useful && this.rng() < this.cfg.puChance) { out.push({ type: "powerup", pid: id, pu: pu.id }); break pus; }
      }
    }

    // 3) Remplacements : le plus fatigué sort pour un profil similaire
    if (this.cfg.subStamina > 0 && me.subsLeft > 0 && me.bench.length && eng.phase === "play") {
      const tired = eng.onPitch(this.side).filter(id => id !== eng.keeperOf(this.side)).map(id => eng.pl[id]).sort((a, b) => a.stamina - b.stamina)[0];
      if (tired && tired.stamina < this.cfg.subStamina) {
        const role = FORMATIONS[me.formation].roles[tired.slot] || "mid";
        const inId = me.bench.map(getPlayer).sort((a, b) => ROLE_SCORE[role](b) - ROLE_SCORE[role](a))[0].id;
        out.push({ type: "sub", out: tired.id, in: inId });
      }
    }
    return out;
  }
}

Object.setPrototypeOf(DIFFICULTIES, null); // sécurité : clés externes
