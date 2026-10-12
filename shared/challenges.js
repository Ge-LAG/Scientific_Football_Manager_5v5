// Défis du jour (W-038) — fonctions PURES : mêmes données d'entrée ⇒ mêmes sorties.
// Trois défis déterministes par date locale (un Arène, un Manager, un « scientifique »),
// progression évaluée à partir des résultats de fin de match et série de jours consécutifs.
import { makeRng } from "./rng.js";

// Domaines bien couverts par le roster (un mot couvre « X et Y » : « Physique » couvre
// « Physique et Mécanique » et « Physique et Chimie ») et tous traduits en anglais.
export const DOMAINS = ["Physique", "Chimie", "Biologie", "Informatique", "Mathématiques"];

// Objectifs mesurables avec les données de fin de match uniquement
// (Arène : message « a.end » — score et stats du slot ; Manager : rapport « m.report »).
const ARENA_KINDS = ["a_goals", "a_assists", "a_saves", "a_tackles", "a_powerups", "a_win", "a_mvp"];
const MANAGER_KINDS = ["m_win", "m_goals", "m_shots", "m_possession", "m_strategy_win", "m_beat_bot"];
const SCIENCE_KINDS = ["sci_domain_match", "sci_domain_score", "sci_domains3_win"];

// n : valeur à atteindre ; [lo, hi] = plage tirée au sort ; strategy/level = paramètre tiré au sort.
const PARAMS = {
  a_goals: { n: [2, 3] }, a_assists: { n: [1, 2] }, a_saves: { n: [3, 5] }, a_tackles: { n: [3, 5] },
  a_powerups: { n: [2, 4] }, a_win: { n: 1 }, a_mvp: { n: 1 },
  m_win: { n: 1 }, m_goals: { n: [2, 4] }, m_shots: { n: [4, 7] }, m_possession: { n: 55 },
  m_strategy_win: { n: 1 }, m_beat_bot: { n: 1 },
  sci_domain_match: { n: 1 }, sci_domain_score: { n: 1 }, sci_domains3_win: { n: 1 },
};
const STRATEGY_IDS = ["equilibre", "pressing", "counter", "possession", "attack", "park_bus"];
const BOT_LEVELS = ["chercheur", "nobel"]; // bot Manager à battre (stagiaire : trop facile)

// Hachage de chaîne (FNV-1a) — graine stable à partir de la date.
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// Veille d'une date locale « AAAA-MM-JJ » (chaîne UTC sûre pour les changements de mois/an).
export function prevDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

// Trois défis du jour : identiques pour tous les joueurs à date égale.
export function generate(dateStr) {
  const rng = makeRng(hash(`defis-${dateStr}`));
  const target = kind => { const n = PARAMS[kind].n; return Array.isArray(n) ? rng.int(n[1] - n[0] + 1) + n[0] : n; };
  const arena = { id: `${dateStr}:a`, mode: "arena", kind: rng.pick(ARENA_KINDS) };
  const manager = { id: `${dateStr}:m`, mode: "manager", kind: rng.pick(MANAGER_KINDS) };
  const science = { id: `${dateStr}:s`, mode: "science", kind: rng.pick(SCIENCE_KINDS), domaine: rng.pick(DOMAINS) };
  arena.n = target(arena.kind); manager.n = target(manager.kind);
  if (manager.kind === "m_strategy_win") manager.strategy = rng.pick(STRATEGY_IDS);
  if (manager.kind === "m_beat_bot") manager.level = rng.pick(BOT_LEVELS);
  return [arena, manager, science];
}

// Progression d'un défi à partir d'un résultat de match normalisé :
//   Arène   : { mode:"arena", win, mvp, goals, assists, saves, tackles, powerups, domaines, scorerDomaines }
//   Manager : { mode:"manager", win, goalsFor, onTarget, possession, strategy, bot, domaines, scorerDomaines }
// `domaines` = domaines des scientifiques alignés (slot Arène ou titulaires Manager) ;
// `scorerDomaines` = domaines des buteurs du camp du joueur. Retourne le score atteint (0..n).
export function evaluate(def, m) {
  if (!def || !m) return 0;
  const arena = m.mode === "arena", mgr = m.mode === "manager";
  const hasDomain = list => (list || []).some(d => d && d.includes(def.domaine));
  switch (def.kind) {
    case "a_goals": return arena ? m.goals | 0 : 0;
    case "a_assists": return arena ? m.assists | 0 : 0;
    case "a_saves": return arena ? m.saves | 0 : 0;
    case "a_tackles": return arena ? m.tackles | 0 : 0;
    case "a_powerups": return arena ? m.powerups | 0 : 0;
    case "a_win": return arena && m.win ? 1 : 0;
    case "a_mvp": return arena && m.mvp ? 1 : 0;
    case "m_win": return mgr && m.win ? 1 : 0;
    case "m_goals": return mgr ? m.goalsFor | 0 : 0;
    case "m_shots": return mgr ? m.onTarget | 0 : 0;
    case "m_possession": return mgr ? Math.min(def.n, m.possession | 0) : 0;
    case "m_strategy_win": return mgr && m.win && m.strategy === def.strategy ? 1 : 0;
    case "m_beat_bot": return mgr && m.win && m.bot === def.level ? 1 : 0;
    case "sci_domain_match": return hasDomain(m.domaines) ? 1 : 0;
    case "sci_domain_score": return hasDomain(m.scorerDomaines) ? 1 : 0;
    case "sci_domains3_win": return mgr && m.win && new Set((m.domaines || []).flatMap(d => d.split(" et "))).size >= 3 ? 1 : 0;
  }
  return 0;
}

// État du jour, reconduit ou nouvel état portant la série.
export function dailyFor(dateStr, prev) {
  if (prev?.date === dateStr && Array.isArray(prev.defs) && prev.defs.length === 3) return prev;
  return { v: 1, date: dateStr, defs: generate(dateStr), progress: {}, streak: prev?.streak || { count: 0, last: null } };
}

// Applique un résultat de match à l'état du jour : progression plafonnée à l'objectif,
// série incrémentée une fois par jour au premier défi réussi (remise à 1 après un trou).
export function applyMatch(st, match) {
  if (!st || !Array.isArray(st.defs)) return st;
  const progress = { ...st.progress };
  let streak = st.streak || { count: 0, last: null }, changed = false;
  for (const def of st.defs) {
    const target = def.n || 1;
    const prev = progress[def.id] || { n: 0, done: false };
    const n = Math.min(target, Math.max(prev.n, evaluate(def, match)));
    const done = n >= target;
    if (n === prev.n && done === prev.done) continue;
    progress[def.id] = { n, done }; changed = true;
    if (done && !prev.done && streak.last !== st.date) {
      streak = { count: streak.last === prevDay(st.date) ? streak.count + 1 : 1, last: st.date };
    }
  }
  return changed ? { ...st, progress, streak } : st;
}

// Série affichable : jours consécutifs avec au moins un défi réussi, encore active aujourd'hui.
export function streakOf(st, today) {
  const k = st?.streak;
  if (!k?.last) return 0;
  return (k.last === today || k.last === prevDay(today)) ? k.count : 0;
}
