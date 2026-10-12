// Profil textuel d'un scientifique selon SA répartition de points (budget commun, voir stats.js) :
//  - forces / faiblesses (ordre total déterministe),
//  - affinité par poste (gk / def / mid / att) et poste idéal,
//  - archétype footballistique (remplace la note globale, qui n'a plus de sens à budget égal),
//  - bio adaptée : bio d'origine si la répartition reste proche du profil par défaut, sinon bio générée
//    (même ton que les originales, vocabulaire du domaine scientifique, déterministe).
// Isomorphe (serveur + client), sans dépendance. Les fonctions de content.js ne sont utilisées
// qu'à l'appel (jamais au chargement) : un import circulaire éventuel reste donc sans danger.
import { STAT_KEYS, STAT_BUDGET, STAT_MIN, STAT_MAX } from "./stats.js";
import { pText, getPlayer } from "./content.js";
import { makeRng } from "../rng.js";

const KEY_INDEX = Object.freeze(Object.fromEntries(STAT_KEYS.map((k, i) => [k, i])));
const REFLEX = "Réflexes";
const OUTFIELD_KEYS = Object.freeze(STAT_KEYS.filter(k => k !== REFLEX));
const MID_VALUE = Math.round(STAT_BUDGET / STAT_KEYS.length); // 68 : valeur « neutre » d'une stat absente

// Répartition lue avec précaution : 9 nombres finis (valeur de repli sinon), jamais d'exception.
function readStats(stats, fallback) {
  const out = {};
  for (const k of STAT_KEYS) {
    const v = stats && typeof stats === "object" ? Number(stats[k]) : NaN;
    const f = fallback && typeof fallback === "object" ? Number(fallback[k]) : NaN;
    out[k] = Number.isFinite(v) ? v : Number.isFinite(f) ? f : MID_VALUE;
  }
  return out;
}

// Ordre total des stats : valeur décroissante, égalités départagées par l'ordre de STAT_KEYS.
// Les forces sont la tête de cet ordre, les faiblesses sa queue : une stat n'est jamais les deux à la fois.
function rankedKeys(s, keys = STAT_KEYS) {
  return [...keys].sort((a, b) => s[b] - s[a] || KEY_INDEX[a] - KEY_INDEX[b]);
}

const clampN = (n, dflt, max) => (Number.isInteger(n) && n >= 0 ? Math.min(n, max) : dflt);

// Forces : les n meilleures stats (Réflexes comprises : des Réflexes élevés = aptitude de gardien).
export function strengthsOf(stats, n = 3) {
  return rankedKeys(readStats(stats)).slice(0, clampN(n, 3, STAT_KEYS.length));
}

// ── Affinité par poste ───────────────────────────────────────
// Chaque ligne regroupe plusieurs profils de joueur ; l'affinité d'un poste est celle de son meilleur
// profil (moyenne pondérée des stats clés). Pondérations réglées pour que le profil par défaut des
// 16 scientifiques retrouve son poste d'origine et que les répartitions typées (buteur, muraille,
// meneur, gardien…) tombent au bon endroit ; voir tests/profileText.test.js.
export const ROLES = Object.freeze(["gk", "def", "mid", "att"]);
const ROLE_TIE_ORDER = Object.freeze({ mid: 0, def: 1, att: 2, gk: 3 }); // égalité parfaite (profil plat) → milieu

export const ROLE_PROFILES = Object.freeze({
  gk: Object.freeze([
    Object.freeze({ id: "gardien", w: Object.freeze({ "Réflexes": 0.6, "Sang-froid": 0.25, Force: 0.15 }) }),
  ]),
  def: Object.freeze([
    Object.freeze({ id: "stoppeur", w: Object.freeze({ Tacle: 0.45, Force: 0.25, "Sang-froid": 0.2, Endurance: 0.1 }) }),
    Object.freeze({ id: "libero", w: Object.freeze({ Tacle: 0.4, Dribble: 0.2, Vision: 0.2, Vitesse: 0.2 }) }),
  ]),
  mid: Object.freeze([
    Object.freeze({ id: "relayeur", w: Object.freeze({ Endurance: 0.5, Tacle: 0.2, Dribble: 0.15, Vision: 0.15 }) }),
    Object.freeze({ id: "meneur", w: Object.freeze({ Vision: 0.45, Dribble: 0.4, Endurance: 0.15 }) }),
  ]),
  att: Object.freeze([
    Object.freeze({ id: "buteur", w: Object.freeze({ Finition: 0.65, "Sang-froid": 0.2, Force: 0.15 }) }),
    Object.freeze({ id: "ailier", w: Object.freeze({ Vitesse: 0.45, Dribble: 0.35, Finition: 0.2 }) }),
  ]),
});

// Meilleur score atteignable par un profil avec le budget commun (répartition gloutonne : on remplit
// d'abord les stats les plus pondérées jusqu'au maximum, les autres restent au minimum).
function bestReachable(w) {
  const weights = STAT_KEYS.map(k => w[k] || 0).sort((a, b) => b - a);
  let rest = STAT_BUDGET - STAT_KEYS.length * STAT_MIN, total = 0;
  for (const x of weights) { const add = Math.max(0, Math.min(rest, STAT_MAX - STAT_MIN)); total += x * (STAT_MIN + add); rest -= add; }
  return total;
}
const PROFILE_TABLE = ROLES.flatMap(role => ROLE_PROFILES[role].map(p => {
  const keys = Object.keys(p.w), sum = keys.reduce((a, k) => a + p.w[k], 0);
  const w = Object.fromEntries(keys.map(k => [k, p.w[k] / sum]));
  return { role, keys, w, best: bestReachable(w) };
}));

// Affinité brute (non arrondie) de chaque poste, en % : 0 = stats clés au minimum, 100 = idéal du poste.
function rawFits(s) {
  const fit = { gk: -Infinity, def: -Infinity, mid: -Infinity, att: -Infinity };
  for (const p of PROFILE_TABLE) {
    let v = 0; for (const k of p.keys) v += p.w[k] * s[k];
    const pct = (100 * (v - STAT_MIN)) / (p.best - STAT_MIN);
    if (pct > fit[p.role]) fit[p.role] = pct;
  }
  return fit;
}

function sortedRoles(s) {
  const fit = rawFits(s);
  return [...ROLES].sort((a, b) => fit[b] - fit[a] || ROLE_TIE_ORDER[a] - ROLE_TIE_ORDER[b]).map(role => ({ role, raw: fit[role] }));
}

// [{ role, pct }] trié par affinité décroissante ; pct entier entre 0 et 100.
export function roleFit(stats) {
  return sortedRoles(readStats(stats)).map(({ role, raw }) => ({ role, pct: Math.max(0, Math.min(100, Math.round(raw))) }));
}
export const idealRole = stats => sortedRoles(readStats(stats))[0].role;

// Faiblesses : les n moins bonnes stats. Des Réflexes modestes sont normaux pour un joueur de champ :
// ils ne comptent comme faiblesse que pour un profil orienté gardien (poste idéal = gk).
export function weaknessesOf(stats, n = 2) {
  const s = readStats(stats);
  const keys = sortedRoles(s)[0].role === "gk" ? STAT_KEYS : OUTFIELD_KEYS;
  return rankedKeys(s, keys).reverse().slice(0, clampN(n, 2, keys.length));
}

// ── Postes : libellés ────────────────────────────────────────
export const ROLE_LABELS = Object.freeze({
  gk: Object.freeze({ fr: "Gardien", en: "Goalkeeper" }),
  def: Object.freeze({ fr: "Défenseur", en: "Defender" }),
  mid: Object.freeze({ fr: "Milieu", en: "Midfielder" }),
  att: Object.freeze({ fr: "Attaquant", en: "Forward" }),
});
export const roleLabel = (role, lang) => ROLE_LABELS[role]?.[lang === "en" ? "en" : "fr"] || role;
// Formes utilisées dans les bios : nom commun et complément de lieu.
const ROLE_TEXT = {
  fr: { gk: { name: "gardien", loc: "dans les cages" }, def: { name: "défenseur", loc: "en défense" }, mid: { name: "milieu", loc: "au milieu" }, att: { name: "attaquant", loc: "en attaque" } },
  en: { gk: { name: "goalkeeper", loc: "in goal" }, def: { name: "defender", loc: "in defence" }, mid: { name: "midfielder", loc: "in midfield" }, att: { name: "forward", loc: "up front" } },
};

// ── Archétypes ───────────────────────────────────────────────
// Libellé principal = archétype footballistique clair ; alias = clin d'œil scientifique (ligne secondaire).
// role = poste naturel ; roles = postes idéaux avec lesquels l'archétype reste cohérent à l'affichage.
const A = (id, icon, roles, fr, en, alias, desc) => Object.freeze({ id, icon, role: roles[0], roles: Object.freeze(roles), fr, en, alias: Object.freeze(alias), desc: Object.freeze(desc) });
export const ARCHETYPES = Object.freeze([
  A("gardien", "🧤", ["gk"], "Gardien", "Goalkeeper", { fr: "Détecteur de particules", en: "Particle Detector" },
    { fr: "Des réflexes au sommet : sa place est dans les cages, où rien ne lui échappe.", en: "Top-of-the-range reflexes: he belongs in goal, where nothing gets past him." }),
  A("gardien_volant", "🥅", ["gk"], "Gardien volant", "Sweeper Keeper", { fr: "Électron libre des cages", en: "Free Electron in Goal" },
    { fr: "Des réflexes de gardien et des pieds de joueur de champ : il relance, sort de sa surface et participe au jeu.", en: "A keeper's reflexes with an outfield player's feet: he distributes, leaves his box and joins in the play." }),
  A("muraille", "🧱", ["def"], "Muraille", "Stopper", { fr: "Matériau réfractaire", en: "Refractory Material" },
    { fr: "Tacle, puissance et sang-froid : les attaquants préfèrent le contourner plutôt que l'affronter.", en: "Tackling, power and composure: attackers would rather go round him than through him." }),
  A("colosse", "🏋️", ["def", "mid", "att"], "Colosse", "Colossus", { fr: "Presse hydraulique", en: "Hydraulic Press" },
    { fr: "La force brute avant tout : il gagne ses duels et protège le ballon comme un coffre-fort.", en: "Brute strength above all: he wins his duels and shields the ball like a safe." }),
  A("sentinelle", "🛡️", ["def", "mid"], "Sentinelle", "Anchor", { fr: "Anticorps", en: "Antibody" },
    { fr: "Tacle et lecture du jeu : il coupe les lignes de passe avant même qu'elles existent.", en: "Tackling plus reading of the game: he cuts passing lanes before they even exist." }),
  A("libero", "🧭", ["def", "mid"], "Libéro", "Libero", { fr: "Électron délocalisé", en: "Delocalised Electron" },
    { fr: "Un défenseur qui sait ressortir balle au pied : il récupère, élimine et relance.", en: "A defender who can carry the ball out: he wins it, beats a man and restarts play." }),
  A("recuperateur", "⛏️", ["mid", "def"], "Récupérateur", "Ball-Winner", { fr: "Enzyme digestive", en: "Digestive Enzyme" },
    { fr: "Tacle et endurance : il ratisse le milieu de terrain du coup d'envoi au coup de sifflet final.", en: "Tackling and stamina: he sweeps up in midfield from kick-off to the final whistle." }),
  A("presseur", "🐺", ["mid", "def", "att"], "Presseur", "Pressing Machine", { fr: "Mouvement perpétuel", en: "Perpetual Motion" },
    { fr: "Vitesse et endurance : il harcèle le porteur du ballon jusqu'à ce qu'il craque.", en: "Speed and stamina: he hounds the ball carrier until something gives." }),
  A("box_to_box", "🔋", ["mid"], "Box-to-box", "Box-to-Box", { fr: "Pile à combustible", en: "Fuel Cell" },
    { fr: "Un moteur endurant et complet qui couvre tout le terrain, d'une surface à l'autre.", en: "A tireless, well-rounded engine who covers the whole pitch, from one box to the other." }),
  A("meneur", "🎼", ["mid", "att"], "Meneur de jeu", "Playmaker", { fr: "Chef d'orchestre quantique", en: "Quantum Conductor" },
    { fr: "Vision et technique : chaque ballon passe par lui et en ressort plus dangereux.", en: "Vision and technique: every ball goes through him and comes out more dangerous." }),
  A("metronome", "⏱️", ["mid", "att", "def"], "Métronome", "Metronome", { fr: "Horloge atomique", en: "Atomic Clock" },
    { fr: "Vision et sang-froid : il dicte le tempo sans jamais perdre le ballon.", en: "Vision and composure: he sets the tempo without ever losing the ball." }),
  A("dribbleur", "🌀", ["att", "mid"], "Dribbleur", "Dribbler", { fr: "Mouvement brownien", en: "Brownian Motion" },
    { fr: "Dribble et vitesse : il élimine en un contre un et fait tourner les défenses en bourrique.", en: "Dribbling and speed: he beats his man one-on-one and runs defences ragged." }),
  A("sprinteur", "⚡", ["att"], "Sprinteur", "Speedster", { fr: "Accélérateur de particules", en: "Particle Accelerator" },
    { fr: "La vitesse comme arme principale : un appel dans la profondeur et il est déjà parti.", en: "Speed as the main weapon: one run in behind and he's already gone." }),
  A("buteur", "🎯", ["att"], "Buteur", "Finisher", { fr: "Tête chercheuse", en: "Homing Missile" },
    { fr: "Finition et sang-froid : face au gardien, il ne tremble jamais.", en: "Finishing and composure: one-on-one with the keeper, he never flinches." }),
  A("renard", "🦊", ["att"], "Renard des surfaces", "Poacher", { fr: "Effet tunnel", en: "Quantum Tunnelling" },
    { fr: "Finition et vitesse : il surgit au bon endroit une fraction de seconde avant tout le monde.", en: "Finishing and speed: he pops up in the right place a split second before anyone else." }),
  A("pivot", "🦏", ["att"], "Pivot", "Target Man", { fr: "Masse critique", en: "Critical Mass" },
    { fr: "Force et finition : dos au but, il fixe la défense et conclut au contact.", en: "Strength and finishing: back to goal, he pins the defence and finishes through contact." }),
  A("polyvalent", "⚖️", ["mid", "def", "att"], "Polyvalent", "All-Rounder", { fr: "Cellule souche", en: "Stem Cell" },
    { fr: "Aucune faiblesse marquée : comme une cellule souche, il s'adapte à tous les postes.", en: "No marked weakness: like a stem cell, he adapts to any position." }),
]);
// Table sans prototype (clés éventuellement externes : « constructor », « __proto__ »… ne résolvent rien).
export const ARCHETYPE_BY_ID = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(ARCHETYPES.map(a => [a.id, a]))));
export const archetypeLabel = (a, lang) => (a ? a[lang === "en" ? "en" : "fr"] : "");

// Signatures : moyenne pondérée des stats qui définissent l'archétype (la plus haute l'emporte ;
// égalité → ordre de ARCHETYPES). « Polyvalent » relève d'une règle de forme (profil plat).
const ARCHETYPE_SIGNATURES = Object.freeze({
  gardien: { "Réflexes": 0.7, "Sang-froid": 0.15, Force: 0.15 },
  gardien_volant: { "Réflexes": 0.6, Dribble: 0.2, Vision: 0.2 },
  muraille: { Tacle: 0.35, Force: 0.35, "Sang-froid": 0.3 },
  colosse: { Force: 0.6, Endurance: 0.25, Vitesse: 0.15 },
  sentinelle: { Tacle: 0.45, Vision: 0.4, "Sang-froid": 0.15 },
  libero: { Tacle: 0.4, Dribble: 0.35, Vision: 0.25 },
  recuperateur: { Tacle: 0.4, Endurance: 0.35, Vitesse: 0.25 },
  presseur: { Endurance: 0.4, Vitesse: 0.4, Tacle: 0.2 },
  box_to_box: { Endurance: 0.55, Force: 0.15, Vision: 0.15, Dribble: 0.15 },
  meneur: { Vision: 0.5, Dribble: 0.35, Finition: 0.15 },
  metronome: { Vision: 0.45, "Sang-froid": 0.4, Endurance: 0.15 },
  dribbleur: { Dribble: 0.55, Vitesse: 0.45 },
  sprinteur: { Vitesse: 0.7, Endurance: 0.15, Dribble: 0.15 },
  buteur: { Finition: 0.55, "Sang-froid": 0.45 },
  renard: { Finition: 0.55, Vitesse: 0.45 },
  pivot: { Force: 0.5, Finition: 0.5 },
});
const KEEPER_ARCHETYPES = new Set(["gardien", "gardien_volant"]);
export const FLAT_SPREAD = 14; // écart max-min (joueur de champ) en dessous duquel le profil est « Polyvalent »

// Choix : poste idéal d'abord (cohérence archétype / poste affichés côte à côte), puis forme de la répartition.
//  - poste idéal gardien → Gardien ou Gardien volant ;
//  - joueur de champ au profil plat → Polyvalent ;
//  - sinon, meilleure signature parmi les archétypes compatibles avec le poste idéal.
export function archetypeOf(stats) {
  const s = readStats(stats);
  const role = sortedRoles(s)[0].role;
  const score = a => { const sig = ARCHETYPE_SIGNATURES[a.id]; let v = 0; for (const k in sig) v += sig[k] * s[k]; return v; };
  const pick = list => { let best = null, bestScore = -Infinity; for (const a of list) { const v = score(a); if (v > bestScore + 1e-9) { best = a; bestScore = v; } } return best; };
  if (role === "gk") return pick(ARCHETYPES.filter(a => KEEPER_ARCHETYPES.has(a.id)));
  let hi = -Infinity, lo = Infinity;
  for (const k of OUTFIELD_KEYS) { if (s[k] > hi) hi = s[k]; if (s[k] < lo) lo = s[k]; }
  if (hi - lo <= FLAT_SPREAD) return ARCHETYPE_BY_ID.polyvalent;
  const outfield = ARCHETYPES.filter(a => ARCHETYPE_SIGNATURES[a.id] && !KEEPER_ARCHETYPES.has(a.id));
  return pick(outfield.filter(a => a.roles.includes(role))) || pick(outfield);
}

// ── Outils de langue ─────────────────────────────────────────
const VOWEL_FR = /^[aeiouyàâäéèêëîïôöùûüœæh]/i;
const LANG_TOOLS = {
  fr: {
    // « de » + groupe nominal : du / de la / de l' / des / d'
    de: np => (/^le /i.test(np) ? "du " + np.slice(3) : /^les /i.test(np) ? "des " + np.slice(4) : /^(la |l')/i.test(np) ? "de " + np : VOWEL_FR.test(np) ? "d'" + np : "de " + np),
    que: np => (VOWEL_FR.test(np) ? "qu'" + np : "que " + np),
    a: np => (/^le /i.test(np) ? "au " + np.slice(3) : /^les /i.test(np) ? "aux " + np.slice(4) : "à " + np),
  },
  en: {
    a: w => (/^[aeiou]/i.test(w) ? "an " : "a ") + w,
  },
};
const lcFirst = s => s.charAt(0).toLowerCase() + s.slice(1);
const ucFirst = s => s.charAt(0).toUpperCase() + s.slice(1);

// Remplit un modèle : {nom}, {de:img}, {que:img}, {a:title}, {lc:report}… Une variable inconnue reste
// visible telle quelle (les tests détectent ainsi toute fuite de marqueur).
export function fillTemplate(tpl, vars, lang) { return fill(String(tpl), vars || {}, lang === "en" ? "en" : "fr"); }
function fill(tpl, vars, lang) {
  const tools = LANG_TOOLS[lang];
  return tpl.replace(/\{(?:(\w+):)?([\w-]+)\}/g, (m, fn, key) => {
    const v = vars[key];
    if (typeof v !== "string") return m;
    if (!fn) return v;
    if (fn === "lc") return lcFirst(v);
    return Object.hasOwn(tools, fn) ? tools[fn](v) : m;
  });
}

// ── Vocabulaire par domaine scientifique ─────────────────────
// title : métier (FR sans article, EN sans article) · habit : « comme il … » / « the way he … »
// lab : lieu de travail (groupe nominal défini) · report : intitulé du verdict final.
// img[stat].pos / .neg : images « un / une … » (FR) et « a / an … » (EN), écrites pour s'insérer dans
// les trois tournures des modèles : « la précision d'… », « aussi … qu'… », « comme … ».
const L = (fr, en) => Object.freeze({ fr, en });
const deepFreeze = o => { for (const v of Object.values(o)) if (v && typeof v === "object") deepFreeze(v); return Object.freeze(o); };
const I = (posFr, posEn, negFr, negEn) => Object.freeze({ pos: L(posFr, posEn), neg: L(negFr, negEn) });

export const DOMAIN_VOCAB = deepFreeze(Object.assign(Object.create(null), {
  "Informatique": {
    title: L("informaticien", "computer scientist"),
    habit: L("débogue du code en production", "debugs code in production"),
    lab: L("le service informatique", "the IT department"),
    report: L("Rapport de compilation", "Build report"),
    img: {
      Finition: I("une requête SQL bien indexée", "a well-indexed SQL query", "un script lancé sans tests", "a script run without tests"),
      Tacle: I("un proxy d'entreprise", "a corporate proxy", "un wifi public sans mot de passe", "an open public wifi network"),
      Dribble: I("un bug intermittent", "an intermittent bug", "un mainframe des années 70", "a 1970s mainframe"),
      Endurance: I("un processus démon", "a daemon process", "une batterie de portable à 3 %", "a laptop battery at 3%"),
      Force: I("un serveur rack 42U", "a 42U server rack", "une clé USB premier prix", "a bargain-bin USB stick"),
      Vitesse: I("une requête en cache", "a cached request", "une mise à jour Windows", "a Windows update"),
      Vision: I("un algorithme de routage", "a routing algorithm", "une fenêtre de terminal pleine de logs", "a terminal window flooded with logs"),
      "Sang-froid": I("une tâche cron", "a cron job", "un stagiaire qui a les droits root", "an intern with root access"),
      "Réflexes": I("un cache L1", "an L1 cache", "une connexion 56k", "a 56k modem"),
    },
  },
  "Physique et Mécanique": {
    title: L("physicien", "physicist"),
    habit: L("calcule une trajectoire balistique", "calculates a ballistic trajectory"),
    lab: L("la soufflerie", "the wind tunnel"),
    report: L("Résultat expérimental", "Experimental result"),
    img: {
      Finition: I("un rayon laser", "a laser beam", "un boulet de canon par grand vent", "a cannonball in a gale"),
      Tacle: I("un butoir de fin de voie", "a railway buffer stop", "un joint de culasse fatigué", "a worn-out head gasket"),
      Dribble: I("une bille sur un plan sans frottement", "a ball bearing on a frictionless plane", "une enclume", "an anvil"),
      Endurance: I("un mouvement perpétuel", "a perpetual motion machine", "une toupie en fin de course", "a spinning top on its last wobble"),
      Force: I("un marteau-pilon", "a steam hammer", "un pont en spaghettis", "a spaghetti bridge"),
      Vitesse: I("un électron dans un accélérateur", "an electron in a particle accelerator", "une expérience de la goutte de poix", "a pitch-drop experiment"),
      Vision: I("un logiciel de balistique", "a ballistics program", "un pare-brise embué", "a fogged-up windscreen"),
      "Sang-froid": I("un gyroscope", "a gyroscope", "une cocotte-minute sans soupape", "a pressure cooker with no safety valve"),
      "Réflexes": I("un ressort comprimé", "a compressed spring", "un paquebot qui tente un demi-tour", "an ocean liner attempting a U-turn"),
    },
  },
  "Biologie et Chimie": {
    title: L("biochimiste", "biochemist"),
    habit: L("séquence un génome", "sequences a genome"),
    lab: L("le laboratoire de biochimie", "the biochemistry lab"),
    report: L("Analyse ADN", "DNA analysis"),
    img: {
      Finition: I("une enzyme sur son substrat", "an enzyme on its substrate", "une mutation aléatoire", "a random mutation"),
      Tacle: I("une membrane cellulaire", "a cell membrane", "une cellule sans membrane", "a cell with no membrane"),
      Dribble: I("un virus qui mute", "a mutating virus", "une protéine dénaturée", "a denatured protein"),
      Endurance: I("une mitochondrie sous caféine", "a mitochondrion on caffeine", "une réaction exothermique", "an exothermic reaction"),
      Force: I("une carapace de tortue", "a tortoise shell", "une bulle de savon", "a soap bubble"),
      Vitesse: I("une réaction catalysée", "a catalysed reaction", "une fermentation lente", "a slow fermentation"),
      Vision: I("un microscope électronique", "an electron microscope", "une lame de microscope sale", "a dirty microscope slide"),
      "Sang-froid": I("une solution tampon", "a buffer solution", "un morceau de sodium jeté dans l'eau", "a lump of sodium dropped in water"),
      "Réflexes": I("une plante carnivore", "a Venus flytrap", "une huître", "an oyster"),
    },
  },
  "Physique et Chimie": {
    title: L("physico-chimiste", "physical chemist"),
    habit: L("équilibre une équation de réaction", "balances a chemical equation"),
    lab: L("le labo de physique-chimie", "the physical chemistry lab"),
    report: L("Bilan de la réaction", "Reaction report"),
    img: {
      Finition: I("un titrage au goutte-à-goutte", "a drop-by-drop titration", "un électron dans son nuage de probabilité", "an electron in its probability cloud"),
      Tacle: I("une cage de Faraday", "a Faraday cage", "une membrane semi-perméable", "a semi-permeable membrane"),
      Dribble: I("une molécule en mouvement brownien", "a molecule in Brownian motion", "un solide cristallin", "a crystalline solid"),
      Endurance: I("une pile à combustible", "a fuel cell", "une allumette", "a struck match"),
      Force: I("un bloc de plomb", "a block of lead", "une feuille d'aluminium", "a sheet of tin foil"),
      Vitesse: I("un photon", "a photon", "une molécule qui diffuse dans un solide", "a molecule diffusing through a solid"),
      Vision: I("un spectromètre", "a spectrometer", "un verre dépoli", "a pane of frosted glass"),
      "Sang-froid": I("un gaz noble", "a noble gas", "un isotope instable", "an unstable isotope"),
      "Réflexes": I("un photodétecteur", "a photodetector", "un thermomètre à mercure", "a mercury thermometer"),
    },
  },
  "Mathématiques": {
    title: L("mathématicien", "mathematician"),
    habit: L("démontre un théorème", "proves a theorem"),
    lab: L("l'amphithéâtre", "the lecture theatre"),
    report: L("CQFD", "QED"),
    img: {
      Finition: I("une démonstration par récurrence", "a proof by induction", "une marche aléatoire", "a random walk"),
      Tacle: I("une borne supérieure", "an upper bound", "une démonstration pleine de trous", "a proof full of holes"),
      Dribble: I("une courbe fractale", "a fractal curve", "une matrice identité", "an identity matrix"),
      Endurance: I("une suite divergente", "a divergent series", "une suite qui converge vers zéro", "a sequence converging to zero"),
      Force: I("un axiome", "an axiom", "une conjecture non démontrée", "an unproven conjecture"),
      Vitesse: I("une courbe exponentielle", "an exponential curve", "une courbe logarithmique", "a logarithmic curve"),
      Vision: I("un arbre de décision", "a decision tree", "un tableau noir mal effacé", "a badly wiped blackboard"),
      "Sang-froid": I("une constante", "a constant", "une division par zéro", "a division by zero"),
      "Réflexes": I("une calculatrice scientifique", "a scientific calculator", "une intégrale calculée à la main", "an integral worked out by hand"),
    },
  },
  "Electronique": {
    title: L("électronicien", "electronics engineer"),
    habit: L("soude un circuit imprimé", "solders a circuit board"),
    lab: L("l'atelier d'électronique", "the electronics workshop"),
    report: L("Mesure à l'oscilloscope", "Oscilloscope reading"),
    img: {
      Finition: I("un signal parfaitement calibré", "a perfectly calibrated signal", "un signal parasite", "a stray signal"),
      Tacle: I("une diode montée en inverse", "a reverse-biased diode", "une gaine isolante percée", "a split insulating sleeve"),
      Dribble: I("un courant alternatif", "an alternating current", "un transformateur de 300 kilos", "a 300-kilo transformer"),
      Endurance: I("une batterie lithium-ion toute neuve", "a brand-new lithium-ion battery", "une pile bouton", "a button cell"),
      Force: I("un pylône haute tension", "a high-voltage pylon", "une soudure à froid", "a cold solder joint"),
      Vitesse: I("un électron dans un supraconducteur", "an electron in a superconductor", "un condensateur en charge lente", "a slowly charging capacitor"),
      Vision: I("un radar", "a radar", "un écran cathodique brouillé", "a fuzzy CRT screen"),
      "Sang-froid": I("un régulateur de tension", "a voltage regulator", "un ampli qui part en larsen", "an amp caught in a feedback loop"),
      "Réflexes": I("un transistor en commutation", "a switching transistor", "un fer à souder qui chauffe encore", "a soldering iron still warming up"),
    },
  },
  "Biologie et Médecine": {
    title: L("médecin-chercheur", "physician-scientist"),
    habit: L("opère à cœur ouvert", "performs open-heart surgery"),
    lab: L("le bloc opératoire", "the operating theatre"),
    report: L("Diagnostic", "Diagnosis"),
    img: {
      Finition: I("une injection intramusculaire", "an intramuscular injection", "une prise de sang faite par un stagiaire", "a blood test taken by an intern"),
      Tacle: I("un système immunitaire en pleine forme", "an immune system in peak condition", "un masque chirurgical troué", "a surgical mask full of holes"),
      Dribble: I("un globule blanc", "a white blood cell", "un patient plâtré des pieds à la tête", "a patient in a full-body cast"),
      Endurance: I("un cœur de marathonien", "a marathon runner's heart", "un interne après 36 heures de garde", "a junior doctor after a 36-hour shift"),
      Force: I("un appareil d'IRM", "an MRI scanner", "un pansement mal collé", "a badly stuck plaster"),
      Vitesse: I("un influx nerveux", "a nerve impulse", "une salle d'attente aux urgences", "an A&E waiting room"),
      Vision: I("un diagnosticien chevronné", "a seasoned diagnostician", "une radio floue", "a blurry X-ray"),
      "Sang-froid": I("un chirurgien en pleine opération", "a surgeon mid-operation", "un hypocondriaque en pleine crise", "a hypochondriac in full panic"),
      "Réflexes": I("un urgentiste", "an emergency doctor", "un patient sous anesthésie générale", "a patient under general anaesthetic"),
    },
  },
  "Chimie": {
    title: L("chimiste", "chemist"),
    habit: L("dose un réactif au microgramme près", "measures out a reagent to the microgram"),
    lab: L("la hotte aspirante", "the fume hood"),
    report: L("Résultat de l'analyse", "Lab analysis"),
    img: {
      Finition: I("une pipette graduée", "a graduated pipette", "une projection de réactif", "a reagent splash"),
      Tacle: I("un filtre à charbon actif", "an activated carbon filter", "un papier filtre déchiré", "a torn filter paper"),
      Dribble: I("un ion en solution", "an ion in solution", "un polymère réticulé", "a cross-linked polymer"),
      Endurance: I("une réaction en chaîne auto-entretenue", "a self-sustaining chain reaction", "un bec Bunsen sans gaz", "a Bunsen burner with no gas"),
      Force: I("un alliage de tungstène", "a tungsten alloy", "une éprouvette en verre fin", "a thin glass test tube"),
      Vitesse: I("une réaction explosive", "an explosive reaction", "une réaction endothermique", "an endothermic reaction"),
      Vision: I("un chromatographe", "a chromatograph", "une fiole de solution trouble", "a flask of cloudy solution"),
      "Sang-froid": I("un catalyseur", "a catalyst", "un flacon de nitroglycérine", "a flask of nitroglycerine"),
      "Réflexes": I("un indicateur coloré", "a colour indicator", "un gaz inerte", "an inert gas"),
    },
  },
  "Mathématiques et Bancaire": {
    title: L("analyste quantitatif", "quant analyst"),
    habit: L("gère un portefeuille d'actions", "manages a stock portfolio"),
    lab: L("la salle des marchés", "the trading floor"),
    report: L("Note de l'agence de notation", "Credit rating"),
    img: {
      Finition: I("un algorithme de trading haute fréquence", "a high-frequency trading algorithm", "une prévision de marché", "a market forecast"),
      Tacle: I("un coffre-fort suisse", "a Swiss bank vault", "un paradis fiscal", "a tax haven"),
      Dribble: I("un produit dérivé exotique", "an exotic derivative", "un prêt immobilier sur trente ans", "a thirty-year mortgage"),
      Endurance: I("un placement à intérêts composés", "a compound-interest investment", "un budget de fin de mois", "a pay packet at the end of the month"),
      Force: I("une banque trop grosse pour faire faillite", "a too-big-to-fail bank", "une start-up sans trésorerie", "a start-up with no cash flow"),
      Vitesse: I("un krach boursier", "a stock market crash", "un chèque envoyé par la poste", "a cheque sent by post"),
      Vision: I("un modèle de Black-Scholes", "a Black-Scholes model", "un bilan comptable maquillé", "a cooked balance sheet"),
      "Sang-froid": I("une obligation d'État", "a government bond", "une cryptomonnaie en pleine tempête", "a cryptocurrency in a storm"),
      "Réflexes": I("un ordre stop-loss", "a stop-loss order", "un conseiller bancaire en congé", "a bank adviser on holiday"),
    },
  },
  "Aides directes, Subventions": {
    title: L("chasseur de subventions", "grant hunter"),
    habit: L("monte un dossier de subvention", "puts together a grant application"),
    lab: L("le guichet des subventions", "the grants office"),
    report: L("Avis de la commission", "Committee's decision"),
    img: {
      Finition: I("un dossier de subvention bouclé à la virgule près", "a grant application checked down to the last comma", "un formulaire rempli à la dernière minute", "a form filled in at the last minute"),
      Tacle: I("un comité de sélection", "a selection committee", "un appel à projets sans critères", "a call for proposals with no criteria"),
      Dribble: I("une dérogation", "a special exemption", "une circulaire administrative", "an administrative circular"),
      Endurance: I("une procédure administrative", "an administrative procedure", "une enveloppe budgétaire en fin d'exercice", "a budget envelope at the end of the financial year"),
      Force: I("un dossier béton", "a cast-iron application", "un budget prévisionnel optimiste", "an optimistic budget forecast"),
      Vitesse: I("une subvention d'urgence", "an emergency grant", "un versement de subvention", "a grant payment"),
      Vision: I("un rapporteur de commission", "a committee rapporteur", "un formulaire Cerfa", "a twelve-page government form"),
      "Sang-froid": I("un fonctionnaire à l'approche de la retraite", "a civil servant nearing retirement", "un porteur de projet la veille de la date limite", "an applicant the night before the deadline"),
      "Réflexes": I("un instructeur qui repère une pièce manquante", "a caseworker spotting a missing document", "un accusé de réception", "an acknowledgement of receipt"),
    },
  },
  "Cybersécurité": {
    title: L("expert en cybersécurité", "cybersecurity expert"),
    habit: L("audite un réseau", "audits a network"),
    lab: L("le centre des opérations de sécurité", "the security operations centre"),
    report: L("Rapport d'audit", "Audit report"),
    img: {
      Finition: I("un exploit zero-day", "a zero-day exploit", "un spam envoyé au hasard", "a randomly sent spam email"),
      Tacle: I("un pare-feu en mode paranoïaque", "a firewall in paranoid mode", "un port grand ouvert", "a wide-open port"),
      Dribble: I("un malware polymorphe", "a polymorphic virus", "une politique de sécurité de 400 pages", "a 400-page security policy"),
      Endurance: I("un scan de ports qui tourne toute la nuit", "a port scan running all night", "un jeton de session", "a session token"),
      Force: I("un chiffrement AES-256", "an AES-256 cipher", "un mot de passe de quatre caractères", "a four-character password"),
      Vitesse: I("une attaque DDoS", "a DDoS attack", "un correctif de sécurité en attente de validation", "a security patch awaiting approval"),
      Vision: I("un système de détection d'intrusion", "an intrusion detection system", "une caméra de surveillance débranchée", "an unplugged CCTV camera"),
      "Sang-froid": I("un honeypot", "a honeypot", "un utilisateur qui clique sur tous les liens", "a user who clicks on every link"),
      "Réflexes": I("un antivirus en temps réel", "a real-time antivirus", "une alerte de sécurité lue trois semaines plus tard", "a security alert read three weeks later"),
    },
  },
  "Electronique et Bancaire": {
    title: L("électronicien-banquier", "electronics engineer turned banker"),
    habit: L("câble un terminal de paiement", "wires up a payment terminal"),
    lab: L("le data center de la banque", "the bank's data centre"),
    report: L("Bilan trimestriel", "Quarterly report"),
    img: {
      Finition: I("un compteur de billets", "a banknote counter", "un distributeur de billets en panne", "a broken cash machine"),
      Tacle: I("une porte de coffre à verrou électronique", "a vault door with an electronic lock", "une carte bancaire sans code PIN", "a bank card with no PIN"),
      Dribble: I("une transaction à haute fréquence", "a high-frequency transaction", "un coffre-fort sur roulettes", "a safe on castors"),
      Endurance: I("une alimentation sans interruption", "an uninterruptible power supply", "un condensateur qui se décharge d'un coup", "a capacitor discharging all at once"),
      Force: I("un fourgon blindé", "an armoured cash van", "une pièce en chocolat", "a chocolate coin"),
      Vitesse: I("un paiement sans contact", "a contactless payment", "un virement du vendredi soir", "a bank transfer sent on a Friday night"),
      Vision: I("un oscilloscope branché sur la Bourse", "an oscilloscope wired to the stock exchange", "un relevé de compte illisible", "an illegible bank statement"),
      "Sang-froid": I("un circuit stabilisé", "a stabilised circuit", "une action cotée un jour de krach", "a share price on crash day"),
      "Réflexes": I("un disjoncteur différentiel", "a residual-current circuit breaker", "un distributeur qui cherche la connexion", "a cash machine searching for a connection"),
    },
  },
  "Agroalimentaire": {
    title: L("ingénieur agroalimentaire", "food engineer"),
    habit: L("optimise une ligne d'embouteillage", "optimises a bottling line"),
    lab: L("la conserverie", "the cannery"),
    report: L("Étiquette nutritionnelle", "Nutrition label"),
    img: {
      Finition: I("une doseuse industrielle", "an industrial dosing machine", "un jet de ketchup", "a squirt of ketchup"),
      Tacle: I("un contrôle qualité impitoyable", "a ruthless quality control check", "une passoire", "a colander"),
      Dribble: I("une anguille", "an eel", "un camion frigorifique", "a refrigerated lorry"),
      Endurance: I("une ligne de production en trois-huit", "a production line running 24/7", "une glace au soleil", "an ice cream in the sun"),
      Force: I("une meule de comté", "a wheel of Comté cheese", "un flan mal pris", "a wobbly custard tart"),
      Vitesse: I("un bouchon de champagne", "a champagne cork", "un camembert en cours d'affinage", "a camembert still ripening"),
      Vision: I("un trieur optique", "an optical sorting machine", "un bocal de cornichons embué", "a steamed-up jar of gherkins"),
      "Sang-froid": I("une chambre froide", "a cold store", "une soupe au lait", "a pan of milk boiling over"),
      "Réflexes": I("un détecteur de corps étrangers", "a foreign-body detector", "un escargot", "a snail"),
    },
  },
  "Business": {
    title: L("homme d'affaires", "businessman"),
    habit: L("préside un conseil d'administration", "chairs a board meeting"),
    lab: L("la salle du conseil", "the boardroom"),
    report: L("Note de synthèse", "Executive summary"),
    img: {
      Finition: I("un contrat bien négocié", "a well-negotiated contract", "un séminaire de team building", "a team-building seminar"),
      Tacle: I("un service juridique", "a legal department", "un open space sans badge", "an open-plan office with no badge access"),
      Dribble: I("un lobbyiste", "a lobbyist", "un organigramme à douze niveaux", "a twelve-layer org chart"),
      Endurance: I("une réunion qui aurait pu être un mail", "a meeting that could have been an email", "une trésorerie de fin de trimestre", "a cash pile at the end of the quarter"),
      Force: I("une multinationale", "a multinational", "un business plan griffonné sur une serviette", "a business plan scribbled on a napkin"),
      Vitesse: I("une rumeur de rachat", "a takeover rumour", "une validation hiérarchique", "a sign-off from upper management"),
      Vision: I("un directeur de la stratégie", "a chief strategy officer", "une présentation PowerPoint de 80 diapositives", "an 80-slide PowerPoint deck"),
      "Sang-froid": I("un PDG face aux actionnaires", "a CEO facing the shareholders", "un stagiaire qui présente au comité exécutif", "an intern presenting to the executive committee"),
      "Réflexes": I("un community manager face à un bad buzz", "a social media manager facing a PR storm", "un comité de direction", "a board of directors"),
    },
  },
  // Domaine inconnu (données futures) : vocabulaire scientifique générique.
  "*": {
    title: L("scientifique", "scientist"),
    habit: L("mène une expérience", "runs an experiment"),
    lab: L("le laboratoire", "the lab"),
    report: L("Compte rendu d'expérience", "Lab report"),
    img: {
      Finition: I("un rayon laser", "a laser beam", "une expérience sans protocole", "an experiment with no protocol"),
      Tacle: I("un sas de confinement", "a containment airlock", "une passoire", "a colander"),
      Dribble: I("un électron libre", "a free electron", "un réfrigérateur de laboratoire", "a lab fridge"),
      Endurance: I("un mouvement perpétuel", "a perpetual motion machine", "une pile usagée", "a used battery"),
      Force: I("un bloc de granit", "a block of granite", "une lamelle de verre", "a glass slide"),
      Vitesse: I("un photon", "a photon", "une tortue de laboratoire", "a lab tortoise"),
      Vision: I("un télescope spatial", "a space telescope", "une paire de lunettes de protection embuées", "a fogged-up pair of safety goggles"),
      "Sang-froid": I("un gaz noble", "a noble gas", "une réaction en chaîne", "a chain reaction"),
      "Réflexes": I("un capteur ultrasensible", "an ultra-sensitive sensor", "un ordinateur des années 80", "a 1980s computer"),
    },
  },
}));
const vocabOf = domaine => (typeof domaine === "string" && DOMAIN_VOCAB[domaine]) || DOMAIN_VOCAB["*"];

// ── Modèles de phrases ───────────────────────────────────────
// Forces et faiblesses : 3 tournures par stat, dans le même ordre partout
// (0 = « la <qualité> d'… », 1 = « aussi <adjectif> qu'… », 2 = « comme … ») ; une bio emploie
// les trois tournures une seule fois chacune, pour que les phrases ne se ressemblent pas.
export const BIO_TEMPLATES = deepFreeze({
  fr: {
    openers: [
      "{nom} joue au football comme il {habit}.",
      "Tout droit sorti {de:lab}, {nom} aborde le football avec la rigueur d'un vrai {title}.",
      "Pour {nom}, {title} de son état, le terrain n'est qu'une extension {de:lab}.",
      "Nouveau réglage, même obsession : {nom} aborde chaque match comme il {habit}.",
      "{nom} a troqué {lab} contre un terrain de foot, mais il reste un {title} dans l'âme.",
    ],
    connectors: ["En prime, ", "Cerise sur le gâteau, ", "Qui plus est, ", "Mieux encore, "],
    strengths: {
      Finition: [
        "Devant le but, il a la précision {de:img} : chaque frappe trouve le cadre.",
        "Ses tirs sont aussi fiables {que:img}, et les gardiens adverses en font des cauchemars.",
        "Dans la surface, sa finition fonctionne comme {img} : une occasion, un but.",
      ],
      Tacle: [
        "En défense, il a l'efficacité {de:img} : aucun attaquant ne passe sans autorisation.",
        "Défensivement, il est aussi infranchissable {que:img}.",
        "Chaque attaquant qui s'approche est stoppé net, comme par {img}.",
      ],
      Dribble: [
        "Balle au pied, il a l'agilité {de:img} et laisse les défenseurs plantés sur place.",
        "En un contre un, il est aussi insaisissable {que:img}.",
        "Il se faufile entre les défenseurs comme {img}.",
      ],
      Endurance: [
        "Il tient tout le match avec l'endurance {de:img}, sans jamais baisser de régime.",
        "Côté caisse, il est aussi infatigable {que:img}.",
        "À la dernière minute, il carbure encore comme {img}.",
      ],
      Force: [
        "Physiquement, il a la densité {de:img} : impossible de le bouger.",
        "Dans les duels, il est aussi solide {que:img}.",
        "Au contact, ses adversaires rebondissent sur lui comme sur {img}.",
      ],
      Vitesse: [
        "Sa pointe de vitesse a quelque chose {de:img} : on le voit partir, jamais arriver.",
        "Sur un contre, il est plus rapide {que:img}.",
        "Une fois lancé, il file comme {img} et personne ne le rattrape.",
      ],
      Vision: [
        "Sa lecture du jeu a la clairvoyance {de:img} : il voit les espaces avant qu'ils s'ouvrent.",
        "Pour trouver la passe décisive, il est aussi visionnaire {que:img}.",
        "Il lit le jeu comme {img} : toujours trois passes d'avance.",
      ],
      "Sang-froid": [
        "Même à la dernière seconde, il garde le calme {de:img}.",
        "Sous pression, il reste aussi imperturbable {que:img}.",
        "Face au but, il reste de marbre, comme {img}.",
      ],
      "Réflexes": [
        "Sur sa ligne, il a les réflexes {de:img} : dans les cages, il est chez lui.",
        "Ses réflexes sont aussi vifs {que:img} : dans les cages, il arrête même les tirs pas encore frappés.",
        "Face à un tir à bout portant, il réagit comme {img}.",
      ],
    },
    // Réflexes élevés chez un joueur de champ (poste idéal ≠ gardien) : aptitude de dépanneur dans les cages.
    reflexOutfield: [
      "Sur sa ligne, il a les réflexes {de:img} : le gardien de secours idéal si le titulaire se blesse.",
      "Ses réflexes sont aussi vifs {que:img} : de quoi dépanner dans les cages en cas de coup dur.",
      "Face à un tir à bout portant, il réagit comme {img}, au point que le gardien titulaire s'inquiète pour sa place.",
    ],
    weaknesses: {
      Finition: [
        "Par contre, devant le but, il a la précision {de:img}.",
        "Son talon d'Achille ? Face au gardien, il est à peu près aussi fiable {que:img}.",
        "En revanche, ses frappes partent un peu comme {img} : dans toutes les directions sauf la bonne.",
      ],
      Tacle: [
        "Par contre, ses tacles ont l'efficacité {de:img}.",
        "Son point faible ? En défense, il est à peu près aussi étanche {que:img}.",
        "En revanche, il filtre les attaquants comme {img} : c'est-à-dire pas du tout.",
      ],
      Dribble: [
        "Par contre, balle au pied, il a l'agilité {de:img}.",
        "Son talon d'Achille ? Ses dribbles sont à peu près aussi souples {que:img}.",
        "En revanche, dès qu'il tente un crochet, il se déplace comme {img}.",
      ],
      Endurance: [
        "Par contre, il a l'autonomie {de:img} : au bout de dix minutes, il est à plat.",
        "Seul bémol : il est à peu près aussi endurant {que:img}.",
        "En revanche, passé le premier quart d'heure, il décline comme {img}.",
      ],
      Force: [
        "Par contre, au contact, il a la solidité {de:img}.",
        "Son point faible ? Dans les duels, il est à peu près aussi costaud {que:img}.",
        "En revanche, au premier coup d'épaule, il cède comme {img}.",
      ],
      Vitesse: [
        "Par contre, sur un sprint, il a la vitesse {de:img}.",
        "Seul bémol : il est à peu près aussi rapide {que:img}.",
        "En revanche, sa pointe de vitesse rappelle {img}.",
      ],
      Vision: [
        "Par contre, pour lire le jeu, il a la clairvoyance {de:img}.",
        "Son talon d'Achille ? Sa vision du jeu est à peu près aussi limpide {que:img}.",
        "En revanche, il voit le jeu comme à travers {img}.",
      ],
      "Sang-froid": [
        "Par contre, sous pression, il a le calme {de:img}.",
        "Seul bémol : dès que ça chauffe, il devient à peu près aussi stable {que:img}.",
        "En revanche, dans les moments chauds, il s'emballe comme {img}.",
      ],
      "Réflexes": [
        "Par contre, dans les cages, il a la réactivité {de:img}.",
        "Son point faible ? Sur sa ligne, ses réflexes sont à peu près aussi vifs {que:img}.",
        "En revanche, face à un tir, il réagit comme {img} : avec un temps de retard.",
      ],
    },
    closers: [
      "{report} : profil « {arch} », à aligner {loc}.",
      "{report} : un profil « {arch} », taillé pour jouer {loc}.",
      "{report} : profil « {arch} » confirmé, et c'est {loc} qu'il sera le plus utile.",
      "{report}, verdict définitif : profil « {arch} », avec un poste idéal {de:role}.",
      "Le comité scientifique l'a classé « {arch} » : c'est {loc} qu'il donnera sa pleine mesure.",
    ],
  },
  en: {
    openers: [
      "{nom} plays football the way he {habit}.",
      "Straight out of {lab}, {nom} approaches football with the rigour of a true {title}.",
      "For {nom}, {a:title} by trade, the pitch is just an extension of {lab}.",
      "New settings, same obsession: {nom} approaches every match the way he {habit}.",
      "{nom} has swapped {lab} for a football pitch, but he's still {a:title} at heart.",
    ],
    connectors: ["On top of that, ", "As a bonus, ", "What's more, ", "Better still, "],
    strengths: {
      Finition: [
        "In front of goal he has the accuracy of {img}: every shot hits the target.",
        "His shots are as reliable as {img}, and opposing keepers have nightmares about them.",
        "In the box, his finishing works like {img}: one chance, one goal.",
      ],
      Tacle: [
        "In defence he has the efficiency of {img}: no attacker gets through without clearance.",
        "Defensively, he's as impassable as {img}.",
        "Every attacker who comes near is stopped dead, as if by {img}.",
      ],
      Dribble: [
        "With the ball at his feet he has the agility of {img}, leaving defenders rooted to the spot.",
        "One-on-one, he's as elusive as {img}.",
        "He weaves between defenders like {img}.",
      ],
      Endurance: [
        "He lasts the whole match with the endurance of {img}, never once dropping the pace.",
        "Stamina-wise, he's as tireless as {img}.",
        "In the final minute he's still running like {img}.",
      ],
      Force: [
        "Physically he has the density of {img}: impossible to knock off the ball.",
        "In duels he's as solid as {img}.",
        "Opponents bounce off him as if off {img}.",
      ],
      Vitesse: [
        "His top speed has something of {img} about it: you see him leave, never arrive.",
        "On the counter-attack he's faster than {img}.",
        "Once he's off, he flies like {img} and nobody catches him.",
      ],
      Vision: [
        "His reading of the game has the foresight of {img}: he sees gaps before they open.",
        "When it comes to finding the killer pass, he's as far-sighted as {img}.",
        "He reads the game like {img}: always three passes ahead.",
      ],
      "Sang-froid": [
        "Even in the final second he keeps the calm of {img}.",
        "Under pressure he stays as unflappable as {img}.",
        "In front of goal he stays ice-cool, like {img}.",
      ],
      "Réflexes": [
        "On his line he has the reflexes of {img}: in goal, he's right at home.",
        "His reflexes are as sharp as {img}: in goal he stops shots that haven't even been struck yet.",
        "Faced with a point-blank shot, he reacts like {img}.",
      ],
    },
    reflexOutfield: [
      "On his line he has the reflexes of {img}: the ideal stand-in keeper if the regular one gets injured.",
      "His reflexes are as sharp as {img}: handy cover in goal if things go wrong.",
      "Faced with a point-blank shot, he reacts like {img}, so much so that the first-choice keeper fears for his place.",
    ],
    weaknesses: {
      Finition: [
        "In front of goal, however, he has the accuracy of {img}.",
        "His Achilles heel? Facing the keeper, he's about as reliable as {img}.",
        "On the other hand, his shots fly off like {img}: in every direction except the right one.",
      ],
      Tacle: [
        "His tackles, however, have the efficiency of {img}.",
        "His weak spot? In defence he's about as watertight as {img}.",
        "On the other hand, he filters attackers like {img}: in other words, not at all.",
      ],
      Dribble: [
        "With the ball at his feet, however, he has the agility of {img}.",
        "His Achilles heel? His dribbling is about as supple as {img}.",
        "On the other hand, whenever he tries a step-over he moves like {img}.",
      ],
      Endurance: [
        "He does, however, have the battery life of {img}: after ten minutes he's running on empty.",
        "The one catch: he's about as tireless as {img}.",
        "On the other hand, after the first quarter of an hour he fades like {img}.",
      ],
      Force: [
        "In physical contact, however, he has the sturdiness of {img}.",
        "His weak spot? In duels he's about as robust as {img}.",
        "On the other hand, at the first shoulder barge he gives way like {img}.",
      ],
      Vitesse: [
        "In a sprint, however, he has the speed of {img}.",
        "The one catch: he's about as quick as {img}.",
        "On the other hand, his top speed is reminiscent of {img}.",
      ],
      Vision: [
        "When it comes to reading the game, however, he has the foresight of {img}.",
        "His Achilles heel? His vision is about as clear as {img}.",
        "On the other hand, he sees the game as if through {img}.",
      ],
      "Sang-froid": [
        "Under pressure, however, he has the calm of {img}.",
        "The one catch: as soon as things heat up, he's about as stable as {img}.",
        "On the other hand, in tense moments he gets carried away like {img}.",
      ],
      "Réflexes": [
        "In goal, however, he has the reaction time of {img}.",
        "His weak spot? On his line, his reflexes are about as sharp as {img}.",
        "On the other hand, faced with a shot he reacts like {img}: one beat too late.",
      ],
    },
    closers: [
      "{report}: {a:arch} profile, best deployed {loc}.",
      "{report}: {a:arch} profile, tailor-made to play {loc}.",
      "{report}: {arch} profile confirmed, and he'll be most useful {loc}.",
      "{report}, final verdict: {a:arch} profile, ideally deployed as {a:role}.",
      "The scientific committee has filed him under “{arch}”: {loc} is where he'll give his best.",
    ],
  },
});

// ── Composition de la bio ────────────────────────────────────
// Graine stable (FNV-1a 32 bits) : identité du scientifique + répartition exacte. La même graine sert
// aux deux langues : la version anglaise suit la même trame que la française.
function seedOf(id, s) {
  const str = `${id || "?"}|${STAT_KEYS.map(k => s[k]).join(",")}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// Profil par défaut du scientifique (toujours celui du catalogue : le joueur reçu peut porter des stats perso).
function defaultProfileOf(player) {
  return (player?.id && getPlayer(player.id)?.attributs) || player?.attributs || null;
}

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// « Proche du profil par défaut » : mêmes 2 meilleures stats ET mêmes 2 plus faibles (ensembles).
export function isCloseToDefault(player, stats) {
  const def = defaultProfileOf(player);
  if (!def) return false;
  const s = readStats(stats, def);
  return sameSet(strengthsOf(s, 2), strengthsOf(def, 2)) && sameSet(weaknessesOf(s, 2), weaknessesOf(def, 2));
}

export function composeBio(player, stats, lang = "fr") {
  if (!player || typeof player !== "object") return "";
  const lg = lang === "en" ? "en" : "fr";
  const def = defaultProfileOf(player);
  const s = readStats(stats ?? player.attributs, def);
  if (def && isCloseToDefault(player, s)) return pText(player, lg).bio;

  const T = BIO_TEMPLATES[lg];
  const voc = vocabOf(player.domaine);
  const rng = makeRng(seedOf(player.id, s));
  const [s1, s2] = strengthsOf(s, 2);
  const [w1] = weaknessesOf(s, 1);
  const role = idealRole(s);
  const arch = archetypeOf(s);

  // Tirages dans un ordre fixe (déterminisme) ; les trois tournures sont réparties sans doublon.
  const opener = T.openers[rng.int(T.openers.length)];
  const p1 = rng.int(3);
  const p2 = (p1 + 1 + rng.int(2)) % 3;
  const pw = 3 - p1 - p2;
  const connector = T.connectors[rng.int(T.connectors.length)];
  const closer = T.closers[rng.int(T.closers.length)];

  const base = {
    nom: player.nom || "",
    title: voc.title[lg], habit: voc.habit[lg], lab: voc.lab[lg], report: voc.report[lg],
    arch: arch[lg], role: ROLE_TEXT[lg][role].name, loc: ROLE_TEXT[lg][role].loc,
  };
  const line = (tpl, stat, kind) => fill(tpl, { ...base, img: voc.img[stat][kind][lg] }, lg);
  const strengthTpl = (stat, p) => (stat === REFLEX && role !== "gk" ? T.reflexOutfield : T.strengths[stat])[p];
  const sentences = [
    fill(opener, base, lg),
    line(strengthTpl(s1, p1), s1, "pos"),
    connector + lcFirst(line(strengthTpl(s2, p2), s2, "pos")),
    line(T.weaknesses[w1][pw], w1, "neg"),
    fill(closer, base, lg),
  ];
  return sentences.map(ucFirst).join(" ");
}

// Tout le profil d'un coup (fiche joueur, draft, vestiaire).
export function profileText(player, stats, lang = "fr") {
  const s = readStats(stats ?? player?.attributs, defaultProfileOf(player));
  return {
    archetype: archetypeOf(s),
    roles: roleFit(s),
    forces: strengthsOf(s),
    faiblesses: weaknessesOf(s),
    bio: composeBio(player, s, lang),
  };
}

