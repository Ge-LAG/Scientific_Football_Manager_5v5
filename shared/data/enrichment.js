// Enrichissements Lab League v3 — s'ajoutent aux données d'origine (roster.js) sans les modifier.
//  - Réflexes : aptitude au poste de gardien (9e caractéristique, enrichissement autorisé par le PO).
//  - numero / taille / look : identité visuelle des avatars 3D.
//  - arena : effet spécifique du power-up dans l'Arène (en plus des bonus/malus d'origine).

export const EXTRA = {
  roland:    { reflexes: 58, numero: 4,  taille: 1.88, look: { skin: 0.35, hair: "short",  hairColor: "#3b2a1a", glasses: true,  beard: true,  accessory: "headset" } },
  loic:      { reflexes: 40, numero: 9,  taille: 1.78, look: { skin: 0.25, hair: "spiky",  hairColor: "#c9a36b", glasses: false, beard: false, accessory: "goggles" } },
  david:     { reflexes: 44, numero: 7,  taille: 1.75, look: { skin: 0.55, hair: "curly",  hairColor: "#1d1410", glasses: false, beard: false, accessory: "labcoat" } },
  thibault:  { reflexes: 55, numero: 8,  taille: 1.80, look: { skin: 0.3,  hair: "side",   hairColor: "#5a3a22", glasses: true,  beard: false, accessory: "goggles" } },
  henry:     { reflexes: 66, numero: 5,  taille: 1.92, look: { skin: 0.2,  hair: "buzz",   hairColor: "#8a6a4a", glasses: false, beard: true,  accessory: "headset" } },
  romain:    { reflexes: 60, numero: 14, taille: 1.95, look: { skin: 0.4,  hair: "short",  hairColor: "#2a1c12", glasses: false, beard: false, accessory: "antenna" } },
  theo:      { reflexes: 50, numero: 6,  taille: 1.79, look: { skin: 0.3,  hair: "messy",  hairColor: "#4a3020", glasses: true,  beard: false, accessory: "none" } },
  franck:    { reflexes: 48, numero: 10, taille: 1.83, look: { skin: 0.45, hair: "bald",   hairColor: "#000000", glasses: false, beard: true,  accessory: "stethoscope" } },
  aurelien:  { reflexes: 52, numero: 11, taille: 1.76, look: { skin: 0.25, hair: "long",   hairColor: "#7a4a2a", glasses: true,  beard: true,  accessory: "labcoat" } },
  lucien:    { reflexes: 60, numero: 3,  taille: 1.86, look: { skin: 0.35, hair: "short",  hairColor: "#1a1a1a", glasses: false, beard: false, accessory: "headset" } },
  joffrey:   { reflexes: 46, numero: 21, taille: 1.74, look: { skin: 0.3,  hair: "slick",  hairColor: "#3a2616", glasses: false, beard: false, accessory: "tie" } },
  yacine:    { reflexes: 50, numero: 19, taille: 1.81, look: { skin: 0.6,  hair: "fade",   hairColor: "#120c08", glasses: false, beard: true,  accessory: "bowtie" } },
  djilani:   { reflexes: 86, numero: 1,  taille: 1.90, look: { skin: 0.65, hair: "buzz",   hairColor: "#0e0a06", glasses: false, beard: true,  accessory: "hood" } },
  mederic:   { reflexes: 42, numero: 17, taille: 1.77, look: { skin: 0.3,  hair: "mohawk", hairColor: "#b8ff00", glasses: false, beard: false, accessory: "tie" } },
  guillaume: { reflexes: 54, numero: 12, taille: 1.80, look: { skin: 0.35, hair: "cap",    hairColor: "#4a3020", glasses: false, beard: true,  accessory: "cap" } },
  patrice:   { reflexes: 64, numero: 2,  taille: 1.84, look: { skin: 0.28, hair: "grey",   hairColor: "#b0b0b0", glasses: true,  beard: false, accessory: "tie" } },
};

// Effets Arène par power-up (durée et recharge en secondes de jeu).
// Les bonus/malus d'origine (buffs) s'appliquent toujours en plus de l'effet.
export const ARENA_EFFECTS = {
  pu_informatique_hotfix:        { effect: "tackleImmune",   duration: 8,  cooldown: 45, fr: "Patch appliqué : impossible de te prendre le ballon.", en: "Patch applied: nobody can steal the ball from you." },
  pu_informatique_stackoverflow: { effect: "tackleRange",    duration: 7,  cooldown: 50, value: 1.6, fr: "La pile déborde : portée de tacle ×1,6.", en: "Stack overflows: tackle reach ×1.6." },
  pu_informatique_loadbalancer:  { effect: "perfectPass",    duration: 9,  cooldown: 48, fr: "Passes parfaitement réparties : précision maximale et ballon plus rapide.", en: "Perfectly balanced passes: maximum accuracy, faster ball." },
  pu_physique_meca_vecteur:      { effect: "perfectShot",    duration: 6,  cooldown: 50, fr: "Prochain tir : trajectoire vectorielle parfaite, puissance +20 %.", en: "Next shot: perfect vector trajectory, +20% power." },
  pu_bio_chimie_adn:             { effect: "ballGlue",       duration: 8,  cooldown: 42, value: 1.15, fr: "Ballon collé au pied et vitesse +15 %.", en: "Ball glued to your feet and +15% speed." },
  pu_physique_chimie_plasma:     { effect: "noStaminaDrain", duration: 10, cooldown: 48, fr: "État stable : aucune fatigue pendant l'effet.", en: "Stable state: no fatigue while active." },
  pu_mathematiques_proof:        { effect: "sureTackle",     duration: 7,  cooldown: 40, fr: "CQFD : ton prochain tacle réussit à coup sûr.", en: "QED: your next tackle is guaranteed to succeed." },
  pu_bio_medecine_triage:        { effect: "teamStamina",    duration: 10, cooldown: 55, value: 25, fr: "Toute l'équipe récupère 25 % d'endurance.", en: "The whole team recovers 25% stamina." },
  pu_chimie_catalyse:            { effect: "slowAura",       duration: 8,  cooldown: 46, value: 0.75, radius: 9, fr: "Les adversaires proches (9 m) sont ralentis de 25 %.", en: "Nearby opponents (9 m) are slowed by 25%." },
  pu_electronique_overclock:     { effect: "speedBoost",     duration: 6,  cooldown: 44, value: 1.25, fr: "Overclock : vitesse +25 %.", en: "Overclock: +25% speed." },
  pu_math_bancaire_arbitrage:    { effect: "passBoost",      duration: 9,  cooldown: 52, value: 1.3, fr: "Chaque passe réussie donne un sprint gratuit au receveur.", en: "Every completed pass gives the receiver a free sprint." },
  pu_subventions_goldenfile:     { effect: "powerShot",      duration: 6,  cooldown: 60, value: 1.35, fr: "Prochain tir : puissance ×1,35, effet enroulé.", en: "Next shot: ×1.35 power with curl." },
  pu_cyber_firewall:             { effect: "firewall",       duration: 8,  cooldown: 50, radius: 3.2, fr: "Accès refusé : tout porteur adverse qui entre dans ton pare-feu (3 m) perd le ballon.", en: "Access denied: any opponent carrier entering your firewall (3 m) loses the ball." },
  pu_elec_bancaire_liquidite:    { effect: "freeSprint",     duration: 8,  cooldown: 58, value: 1.1, fr: "Sprint illimité sans fatigue, vitesse +10 %.", en: "Unlimited sprint without fatigue, +10% speed." },
  pu_agro_geo_terrain:           { effect: "freeSprint",     duration: 10, cooldown: 47, value: 1.08, fr: "Pressing intensif : sprint sans fatigue, vitesse +8 %.", en: "High press: fatigue-free sprint, +8% speed." },
  pu_business_boardcall:         { effect: "teamAura",       duration: 9,  cooldown: 65, value: 6, fr: "Réunion du conseil : toute l'équipe gagne +6 en Vision et Sang-froid.", en: "Board meeting: the whole team gains +6 Vision and Composure." },
};

// Synergies de labo : bonus d'équipe quand plusieurs domaines proches sont alignés (titulaires).
export const SYNERGIES = [
  { id: "reseau",   match: ["Informatique", "Cybersécurité"],            min: 2, bonus: { Vision: 3, "Sang-froid": 2 }, fr: "Réseau Distribué",        en: "Distributed Network" },
  { id: "carbone",  match: ["Chimie"],                                  min: 2, bonus: { Dribble: 3, Endurance: 2 },  fr: "Chaîne Carbonée",         en: "Carbon Chain" },
  { id: "marche",   match: ["Bancaire", "Business"],                   min: 2, bonus: { Vision: 3, Finition: 3 },    fr: "Marché Haussier",         en: "Bull Market" },
  { id: "physique", match: ["Physique"],                                min: 2, bonus: { Force: 3, Finition: 2 },     fr: "Laboratoire de Physique", en: "Physics Lab" },
  { id: "circuit",  match: ["Electronique"],                            min: 2, bonus: { Vitesse: 4 },                fr: "Circuit Imprimé",         en: "Printed Circuit" },
  { id: "vivant",   match: ["Biologie", "Médecine", "Agroalimentaire"], min: 2, bonus: { Endurance: 4 },              fr: "Sciences du Vivant",      en: "Life Sciences" },
  { id: "maths",    match: ["Mathématiques"],                           min: 2, bonus: { Tacle: 3, Vision: 2 },       fr: "Rigueur Mathématique",    en: "Mathematical Rigour" },
];
// Bonus « pluridisciplinaire » : 5 titulaires aux domaines tous différents.
export const PLURI = { id: "pluri", bonus: { Finition: 1, Tacle: 1, Dribble: 1, Endurance: 1, Force: 1, Vitesse: 1, Vision: 1, "Sang-froid": 1 }, fr: "Équipe Pluridisciplinaire", en: "Interdisciplinary Team" };

export function activeSynergies(players) {
  const res = [];
  for (const s of SYNERGIES) {
    const n = players.filter(p => s.match.some(m => p.domaine.includes(m))).length;
    if (n >= s.min) res.push(s);
  }
  if (players.length >= 5 && new Set(players.map(p => p.domaine)).size === players.length) res.push(PLURI);
  return res;
}

export function synergyBonus(players) {
  const total = {};
  for (const s of activeSynergies(players)) for (const [k, v] of Object.entries(s.bonus)) total[k] = (total[k] || 0) + v;
  return total;
}

// Couleurs de domaine (reprises du prototype).
export const DOMAIN_COLORS = {
  "Informatique": "#00F0FF", "Physique et Mécanique": "#FF6B35", "Biologie et Chimie": "#B8FF00",
  "Physique et Chimie": "#8B5CF6", "Electronique": "#00CCFF", "Mathématiques": "#FFD700",
  "Biologie et Médecine": "#66FF66", "Chimie": "#FF00E5", "Mathématiques et Bancaire": "#FFD700",
  "Aides directes, Subventions": "#FF3366", "Cybersécurité": "#39FF14", "Electronique et Bancaire": "#9D4EDD",
  "Agroalimentaire": "#C8843F", "Business": "#FF8C00",
};
export const domainColor = d => DOMAIN_COLORS[d] || "#00F0FF";

for (const t of [EXTRA, ARENA_EFFECTS, DOMAIN_COLORS]) Object.setPrototypeOf(t, null); // sécurité : clés externes
