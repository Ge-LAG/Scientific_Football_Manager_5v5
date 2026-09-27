// Accès unifié au contenu du jeu (données d'origine + enrichissements + traductions).
import { ROSTER, POWER_UPS } from "./roster.js";
import { EXTRA, ARENA_EFFECTS, domainColor } from "./enrichment.js";
import { NARRATION_DOMAINE_FR, NARRATION_DEFAULT_FR } from "./narration.fr.js";
import { NARRATION_DOMAINE_EN, NARRATION_DEFAULT_EN } from "./narration.en.js";
import { ROSTER_EN, DOMAINS_EN, POSTES_EN, PROFILS_EN, POWER_UPS_EN, ATTRS_EN, TYPES_EN } from "./roster.en.js";
import { POWER_UPS_EXTRA } from "./powerups.extra.js";
import { scaledProfile, cleanStats, STAT_KEYS } from "./stats.js";

export { ROSTER, POWER_UPS };

export const ATTRS = ["Finition", "Tacle", "Dribble", "Endurance", "Force", "Vitesse", "Vision", "Sang-froid"];
export const ALL_ATTRS = [...ATTRS, "Réflexes"];

// Catalogue complet des power-ups : les 16 d'origine (inchangés) + 3 nouveaux par scientifique.
export const ALL_POWER_UPS = [
  ...POWER_UPS.map(pu => Object.freeze({ ...pu, arena: ARENA_EFFECTS[pu.id], original: true })),
  ...POWER_UPS_EXTRA.map(pu => Object.freeze({ ...pu, original: false })),
];
export const POWER_UP_BY_ID = Object.fromEntries(ALL_POWER_UPS.map(u => [u.id, u]));
export const getPowerUp = id => (typeof id === "string" && POWER_UP_BY_ID[id]) || null;
export const LOADOUT_SIZE = 2; // power-ups emportés dans un match

// Joueur « complet » : données d'origine + Réflexes + identité visuelle + power-ups.
// attributs = profil PAR DÉFAUT (forme d'origine ramenée au budget commun, identique pour tous) ;
// baseAttributs = valeurs d'origine du prototype (référence, non jouées).
export const PLAYERS = ROSTER.map(p => {
  const x = EXTRA[p.id];
  const pus = ALL_POWER_UPS.filter(u => u.joueur === p.id); // celui d'origine en premier
  const base = { ...p.attributs, "Réflexes": x.reflexes };
  return Object.freeze({
    ...p,
    baseAttributs: Object.freeze(base),
    attributs: Object.freeze(scaledProfile(base)),
    numero: x.numero, taille: x.taille, look: x.look,
    color: domainColor(p.domaine),
    powerUp: pus[0] || null,          // power-up d'origine (compatibilité)
    powerUps: Object.freeze(pus),     // les 4 power-ups du scientifique
  });
});
export const PLAYER_BY_ID = Object.fromEntries(PLAYERS.map(p => [p.id, p]));
export const getPlayer = id => PLAYER_BY_ID[id] || null;

// ── Caractéristiques réparties par le joueur ─────────────────
export const defaultStats = charId => ({ ...(getPlayer(charId)?.attributs || {}) });
// Répartition d'un client → répartition valide (sinon profil par défaut du scientifique).
export function sanitizeStats(charId, obj) { return cleanStats(obj) || defaultStats(charId); }
// Table { charId: répartition } d'un client : seules les répartitions valides sont conservées.
export function sanitizeStatsMap(obj) {
  const out = Object.create(null);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const p of PLAYERS) if (Object.hasOwn(obj, p.id)) { const s = cleanStats(obj[p.id]); if (s) out[p.id] = s; }
  return out;
}
// Scientifique joué avec une répartition donnée (même identité, caractéristiques remplacées).
export function withStats(player, stats) {
  if (!player) return player;
  const s = cleanStats(stats);
  return s ? Object.freeze({ ...player, attributs: Object.freeze(s), custom: true }) : player;
}
export { STAT_KEYS };

// Sélection de 2 power-ups pour un match : identifiants valides et propres au scientifique, sinon défaut.
export function defaultLoadout(charId) { return (getPlayer(charId)?.powerUps || []).slice(0, LOADOUT_SIZE).map(u => u.id); }
export function sanitizeLoadout(charId, ids) {
  const p = getPlayer(charId); if (!p) return [];
  const own = new Set(p.powerUps.map(u => u.id));
  const out = [];
  if (Array.isArray(ids)) for (const id of ids.slice(0, 8)) if (typeof id === "string" && own.has(id) && !out.includes(id) && out.length < LOADOUT_SIZE) out.push(id);
  for (const id of defaultLoadout(charId)) if (out.length < LOADOUT_SIZE && !out.includes(id)) out.push(id);
  return out;
}
// Table { charId: [id, id] } fournie par un client : nettoyée (clés et valeurs).
export function sanitizeLoadouts(obj) {
  const out = Object.create(null);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const p of PLAYERS) if (Object.hasOwn(obj, p.id)) out[p.id] = sanitizeLoadout(p.id, obj[p.id]);
  return out;
}

// Aptitude de gardien (utilisée par l'IA de composition et l'affichage).
export const keeperRating = p => Math.round(p.attributs["Réflexes"] * 0.6 + p.attributs["Sang-froid"] * 0.25 + p.attributs.Force * 0.15);

// Rôle générique déduit du poste d'origine.
export function roleOf(p) {
  const s = (p.poste || "").toLowerCase();
  if (s.includes("gardien")) return "gk";
  if (s.includes("attaquant") || s.includes("ailier") || s.includes("offensif")) return "att";
  if (s.includes("défenseur") || s.includes("défensif")) return "def";
  return "mid";
}

// ── Textes localisés ─────────────────────────────────────────
export function pText(p, lang) {
  if (lang !== "en") return { domaine: p.domaine, poste: p.poste, slogan: p.slogan, profil: p.profil, traits: p.traits, bio: p.bio };
  const e = ROSTER_EN[p.id] || {};
  return { domaine: DOMAINS_EN[p.domaine] || p.domaine, poste: e.poste || POSTES_EN[p.poste] || p.poste, slogan: e.slogan || p.slogan,
    profil: e.profil || PROFILS_EN[p.profil] || p.profil, traits: e.traits || p.traits, bio: e.bio || p.bio };
}
export const domainName = (d, lang) => (lang === "en" ? DOMAINS_EN[d] || d : d);
export const attrName = (a, lang) => (lang === "en" ? ATTRS_EN[a] || a : a);
export const typeName = (t, lang) => (lang === "en" ? TYPES_EN[t] || t : t);
export function puText(pu, lang) {
  const e = lang === "en" ? POWER_UPS_EN[pu.id] || pu.en || {} : {};
  const a = pu.arena || ARENA_EFFECTS[pu.id] || {};
  return { nom: e.nom || pu.nom, effets: e.effets || pu.effets, arena: lang === "en" ? a.en : a.fr };
}

// ── Narration par clé (le serveur émet des clés, chaque client affiche dans sa langue) ──
const NARR = { fr: [NARRATION_DOMAINE_FR, NARRATION_DEFAULT_FR], en: [NARRATION_DOMAINE_EN, NARRATION_DEFAULT_EN] };

// Choisit une ligne de narration ; renvoie une clé stable {c, d, i}.
export function narrKey(cat, domaine, rand) {
  const pool = domaine && NARRATION_DOMAINE_FR[domaine]?.[cat];
  if (pool && pool.length) return { c: cat, d: domaine, i: Math.floor(rand() * pool.length) };
  const def = NARRATION_DEFAULT_FR[cat] || [];
  return { c: cat, d: null, i: Math.floor(rand() * Math.max(1, def.length)) };
}

export function narrText(key, vars, lang) {
  if (!key) return "";
  const [dom, def] = NARR[lang === "en" ? "en" : "fr"];
  const line = (key.d ? dom[key.d]?.[key.c]?.[key.i] : null) ?? def[key.c]?.[key.i % (def[key.c]?.length || 1)] ?? "";
  return Object.entries(vars || {}).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), line);
}

// ── Formations (reprises du prototype) ──────────────────────
export const FORMATIONS = {
  "2-2":   { label: { fr: "2-2 — Classique", en: "2-2 — Classic" },     roles: ["gk", "def", "def", "mid", "att"], positions: [{ x: 8, y: 50 }, { x: 25, y: 25 }, { x: 25, y: 75 }, { x: 55, y: 50 }, { x: 80, y: 50 }] },
  "1-2-1": { label: { fr: "1-2-1 — Losange", en: "1-2-1 — Diamond" },  roles: ["gk", "def", "mid", "mid", "att"], positions: [{ x: 8, y: 50 }, { x: 30, y: 50 }, { x: 50, y: 25 }, { x: 50, y: 75 }, { x: 78, y: 50 }] },
  "2-1-1": { label: { fr: "2-1-1 — Muraille", en: "2-1-1 — Rampart" },  roles: ["gk", "def", "def", "mid", "att"], positions: [{ x: 8, y: 50 }, { x: 25, y: 30 }, { x: 25, y: 70 }, { x: 50, y: 50 }, { x: 78, y: 50 }] },
  "1-1-2": { label: { fr: "1-1-2 — Offensif", en: "1-1-2 — Attacking" }, roles: ["gk", "def", "mid", "att", "att"], positions: [{ x: 8, y: 50 }, { x: 28, y: 50 }, { x: 48, y: 50 }, { x: 65, y: 25 }, { x: 75, y: 75 }] },
};

// ── Stratégies (noms, descriptions et effets repris du prototype) ──
export const STRATEGIES = [
  { id: "equilibre",  icon: "⚖️", nom: { fr: "Équilibre Thermodynamique", en: "Thermodynamic Equilibrium" }, desc: { fr: "Jeu équilibré, aucun risque. Comme un système à l'état stationnaire.", en: "Balanced play, no risk. Like a system in steady state." }, modifiers: {}, speedMod: 1.0, pressRange: 25, shootBias: 0, drain: 1.0 },
  { id: "pressing",   icon: "🔬", nom: { fr: "Pression Osmotique", en: "Osmotic Pressure" }, desc: { fr: "Pressing intense ! Les joueurs migrent vers le ballon comme des molécules sous gradient de concentration.", en: "Intense pressing! Players migrate towards the ball like molecules along a concentration gradient." }, modifiers: { Tacle: 6, Endurance: -4 }, speedMod: 1.15, pressRange: 40, shootBias: 0, drain: 2.0 },
  { id: "counter",    icon: "⚡", nom: { fr: "Réaction en Chaîne", en: "Chain Reaction" }, desc: { fr: "Défense compacte puis contre-attaque fulgurante. L'énergie est stockée puis libérée d'un coup.", en: "Compact defence then a lightning counter. Energy stored, then released all at once." }, modifiers: { Vitesse: 5, "Sang-froid": 4, Dribble: -4 }, speedMod: 0.9, pressRange: 18, shootBias: 5, drain: 1.0 },
  { id: "possession", icon: "🧬", nom: { fr: "Réplication d'ADN", en: "DNA Replication" }, desc: { fr: "Conservation du ballon obsessionnelle. Passes courtes et précises comme une polymérase qui ne lâche jamais le brin.", en: "Obsessive ball retention. Short, precise passes like a polymerase that never lets go of the strand." }, modifiers: { Vision: 8, Dribble: 4, Vitesse: -6 }, speedMod: 0.85, pressRange: 20, shootBias: -5, drain: 0.9 },
  { id: "attack",     icon: "☢️", nom: { fr: "Fission Nucléaire", en: "Nuclear Fission" }, desc: { fr: "Attaque totale ! On fissionne la défense adverse. Risque de meltdown défensif.", en: "All-out attack! Split the opposing defence. Risk of defensive meltdown." }, modifiers: { Finition: 8, Vitesse: 4, Tacle: -8, "Sang-froid": -4 }, speedMod: 1.1, pressRange: 35, shootBias: 10, drain: 1.3 },
  { id: "park_bus",   icon: "🛡️", nom: { fr: "Effet Faraday", en: "Faraday Effect" }, desc: { fr: "Cage défensive impénétrable. Comme un blindage électromagnétique, rien ne rentre.", en: "Impenetrable defensive cage. Like electromagnetic shielding, nothing gets in." }, modifiers: { Tacle: 8, "Sang-froid": 6, Finition: -8, Dribble: -4 }, speedMod: 0.8, pressRange: 15, shootBias: -8, drain: 0.7 },
];
export const STRATEGY_BY_ID = Object.fromEntries(STRATEGIES.map(s => [s.id, s]));

// Causeries de mi-temps : un choix par équipe, effet sur toute la seconde période.
export const TEAM_TALKS = [
  { id: "brainstorm", icon: "💡", nom: { fr: "Brainstorming", en: "Brainstorming" }, desc: { fr: "On réfléchit ensemble : +3 Vision, +2 Sang-froid.", en: "Think it through together: +3 Vision, +2 Composure." }, mods: { Vision: 3, "Sang-froid": 2 } },
  { id: "deadline", icon: "⏰", nom: { fr: "Deadline", en: "Deadline" }, desc: { fr: "Il faut rendre le projet ce soir : +3 Vitesse, +2 Finition, mais on s'épuise plus vite.", en: "The project is due tonight: +3 Speed, +2 Finishing, but you tire faster." }, mods: { Vitesse: 3, Finition: 2 }, drain: 1.15 },
  { id: "peer_review", icon: "🧐", nom: { fr: "Revue par les pairs", en: "Peer Review" }, desc: { fr: "Rigueur défensive : +3 Tacle, +2 Force, moins de fautes.", en: "Defensive rigour: +3 Tackling, +2 Strength, fewer fouls." }, mods: { Tacle: 3, Force: 2 }, fouls: 0.6 },
  { id: "coffee", icon: "☕", nom: { fr: "Pause café", en: "Coffee Break" }, desc: { fr: "Tout le monde récupère 12 % d'endurance.", en: "Everyone recovers 12% stamina." }, mods: {}, stamina: 12 },
];
export const TEAM_TALK_BY_ID = Object.fromEntries(TEAM_TALKS.map(t => [t.id, t]));

// Couleurs de club proposées.
export const CLUB_COLORS = ["#00F0FF", "#FF00E5", "#B8FF00", "#FF3366", "#8B5CF6", "#FFD700", "#FF8C00", "#39FF14", "#F0F0F0", "#3B82F6"];
export const CREST_ICONS = ["🧬", "⚛️", "🔬", "🧪", "💻", "📐", "🛡️", "⚡", "🌱", "📈", "🧠", "🚀"];
// Récompenses cosmétiques débloquées par le grade académique (index dans GRADES).
export const CREST_UNLOCKS = [{ icon: "🔭", grade: 1 }, { icon: "🧲", grade: 1 }, { icon: "🦠", grade: 2 }, { icon: "🛰️", grade: 2 }, { icon: "🏆", grade: 3 }, { icon: "🌌", grade: 4 }, { icon: "👑", grade: 5 }, { icon: "🎓", grade: 6 }];
export const COLOR_UNLOCKS = [{ color: "#00FFA3", grade: 1 }, { color: "#FF6B35", grade: 2 }, { color: "#E0E0FF", grade: 3 }, { color: "#FFB3F0", grade: 4 }, { color: "#C0A060", grade: 6 }];

// Sécurité : tables consultées avec des clés fournies par les clients → sans prototype
// (« constructor », « __proto__ »… ne résolvent plus vers Object).
for (const t of [PLAYER_BY_ID, FORMATIONS, STRATEGY_BY_ID, TEAM_TALK_BY_ID, POWER_UP_BY_ID]) Object.setPrototypeOf(t, null);
