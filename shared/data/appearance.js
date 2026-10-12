// Apparence personnalisable des avatars 3D (isomorphe : serveur, éditeur, rendu).
// Aucune dépendance au DOM : utilisé pour la validation serveur et l'éditeur.
import { EXTRA } from "./enrichment.js";
import { PLAYER_BY_ID } from "./content.js";

const deepFreeze = o => {
  for (const v of Object.values(o)) if (v && typeof v === "object") deepFreeze(v);
  return Object.freeze(o);
};

export const APPEARANCE_OPTIONS = deepFreeze({
  build: ["slim", "normal", "athletic", "stocky"],
  // visage (morphologie adulte) : forme, yeux, sourcils, nez
  faceShape: ["oval", "square", "round", "long", "diamond", "heart", "chiseled", "triangle"],
  eyeShape: ["almond", "round", "narrow", "hooded", "deep_set", "droopy", "upturned", "monolid", "wide_set", "close_set", "intense"],
  brows: ["straight", "thick", "bushy", "arched", "angled", "thin", "scarred", "heavy"],
  nose: ["straight", "broad", "aquiline", "button", "boxer", "roman", "pointed"],
  // coiffures classées de la plus courte à la plus longue (les mulets sont des coupes comme les autres)
  hairStyle: [
    "bald", "grey_side", "buzz", "fade", "mohawk", "short", "spiky", "side", "slick", "messy", "mullet_shaved",
    "pompadour", "curly", "mullet_modern", "bowl", "afro", "mullet_classic", "mullet_perm", "bun", "ponytail",
    "long", "dreads",
  ],
  facialHair: ["none", "stubble", "beard", "full_beard", "goatee", "moustache", "handlebar", "sideburns"],
  glasses: ["none", "round", "square", "goggles", "sunglasses", "visor", "monocle"],
  headwear: ["none", "cap", "headband", "beanie", "headset", "antenna", "hood", "knight_helmet", "crown", "wizard_hat", "laurel", "top_hat"],
  outfit: ["footballer", "scientist", "rockstar", "medieval", "renaissance", "futuristic", "quirky", "funny"],
  accessory: ["none", "tie", "bowtie", "stethoscope", "scarf", "necklace", "cape", "guitar", "ruff"],
  eyes: ["normal", "happy", "determined", "sleepy"],
  palettes: {
    // naturels puis fantaisie
    hair: ["#16110d", "#3b2a1a", "#6b4423", "#9a5a2c", "#c9a36b", "#ead08a", "#d9562b", "#b0b0b0", "#f2f2f2",
      "#b8ff00", "#ff00e5", "#00f0ff", "#8b5cf6", "#3b82f6"],
    outfit: ["#f0f0f0", "#1d2130", "#00f0ff", "#ff00e5", "#b8ff00", "#ff3366", "#8b5cf6", "#ffd700", "#ff8c00",
      "#39ff14", "#3b82f6", "#c8843f", "#7a1f2b"],
    eye: ["#4a3222", "#7a5a2a", "#2f6fb0", "#3f7a4a", "#6a7480", "#1a1a1a", "#8b5cf6", "#00c8d8"],
    shoe: ["#15151d", "#f2f2f2", "#6b4423", "#c62828", "#ffd700", "#00f0ff", "#ff00e5", "#b8ff00"],
    // teint : nombre continu (0 = très clair, 1 = très foncé)
    skin: { min: 0, max: 1, step: 0.05 },
  },
});

// Champs de l'objet apparence (ordre stable pour l'éditeur)
export const APPEARANCE_FIELDS = Object.freeze([
  "build", "skin", "faceShape", "hairStyle", "hairColor", "facialHair", "facialHairColor", "eyes", "eyeShape", "eyeColor",
  "brows", "nose", "glasses", "headwear", "outfit", "outfitColor", "accessory", "shoeColor",
]);
const ENUM_FIELDS = Object.freeze({
  build: "build", faceShape: "faceShape", hairStyle: "hairStyle", facialHair: "facialHair", eyes: "eyes", eyeShape: "eyeShape",
  brows: "brows", nose: "nose", glasses: "glasses", headwear: "headwear", outfit: "outfit", accessory: "accessory",
});
const COLOR_FIELDS = Object.freeze(["hairColor", "facialHairColor", "eyeColor", "outfitColor", "shoeColor"]);
const HEX = /^#[0-9a-fA-F]{6}$/;

const L = (fr, en) => ({ fr, en });
export const APPEARANCE_LABELS = deepFreeze({
  fields: {
    build: L("Morphologie", "Build"), skin: L("Teint", "Skin tone"), faceShape: L("Forme du visage", "Face shape"),
    hairStyle: L("Coiffure", "Hairstyle"),
    hairColor: L("Couleur des cheveux", "Hair colour"), facialHair: L("Pilosité faciale", "Facial hair"),
    facialHairColor: L("Couleur de la barbe", "Facial hair colour"), eyes: L("Regard (expression)", "Eye expression"),
    eyeShape: L("Forme des yeux", "Eye shape"), eyeColor: L("Couleur des yeux", "Eye colour"),
    brows: L("Sourcils", "Eyebrows"), nose: L("Nez", "Nose"), glasses: L("Lunettes", "Glasses"), headwear: L("Couvre-chef", "Headwear"),
    outfit: L("Tenue", "Outfit"), outfitColor: L("Couleur de la tenue", "Outfit colour"), accessory: L("Accessoire", "Accessory"),
    shoeColor: L("Couleur des chaussures", "Shoe colour"),
  },
  build: {
    slim: L("Mince", "Slim"), normal: L("Normale", "Regular"), athletic: L("Athlétique", "Athletic"), stocky: L("Trapue", "Stocky"),
  },
  faceShape: {
    oval: L("Ovale", "Oval"), square: L("Carré", "Square"), round: L("Rond", "Round"), long: L("Allongé", "Long"),
    diamond: L("Diamant (pommettes larges)", "Diamond (wide cheekbones)"), heart: L("Cœur (menton fin)", "Heart (narrow chin)"),
    chiseled: L("Ciselé (rectangle)", "Chiselled (rectangle)"), triangle: L("Triangle (mâchoire large)", "Triangle (wide jaw)"),
  },
  eyeShape: {
    almond: L("En amande", "Almond"), round: L("Ronds", "Round"), narrow: L("Étroits", "Narrow"),
    hooded: L("Paupière lourde", "Hooded"), deep_set: L("Enfoncés", "Deep-set"), droopy: L("Tombants", "Downturned"),
    upturned: L("Relevés", "Upturned"), monolid: L("Sans pli (monolid)", "Monolid"), wide_set: L("Écartés", "Wide-set"),
    close_set: L("Rapprochés", "Close-set"), intense: L("Perçants", "Intense"),
  },
  brows: {
    straight: L("Droits", "Straight"), thick: L("Épais", "Thick"), bushy: L("Broussailleux", "Bushy"), arched: L("Arqués", "Arched"),
    angled: L("Anguleux", "Angled"), thin: L("Fins", "Thin"), scarred: L("Balafré (fendu)", "Scarred (split)"),
    heavy: L("Lourds et bas", "Heavy & low"),
  },
  nose: {
    straight: L("Droit", "Straight"), broad: L("Large", "Broad"), aquiline: L("Aquilin", "Aquiline"), button: L("Retroussé", "Button"),
    boxer: L("De boxeur (cassé)", "Boxer (broken)"), roman: L("Romain (bosse)", "Roman (hump)"), pointed: L("Pointu", "Pointed"),
  },
  hairStyle: {
    bald: L("Chauve", "Bald"), buzz: L("Coupe rase", "Buzz cut"), short: L("Courts", "Short"),
    side: L("Raie sur le côté", "Side part"), slick: L("Plaqués en arrière", "Slicked back"), spiky: L("Hérissés", "Spiky"),
    curly: L("Bouclés", "Curly"), afro: L("Afro", "Afro"), messy: L("En bataille", "Messy"), long: L("Longs", "Long"),
    ponytail: L("Queue-de-cheval", "Ponytail"), bun: L("Chignon", "Bun"), mohawk: L("Crête iroquoise", "Mohawk"),
    fade: L("Dégradé", "Fade"), pompadour: L("Banane (pompadour)", "Pompadour"), dreads: L("Dreadlocks", "Dreadlocks"),
    bowl: L("Coupe au bol (médiévale)", "Medieval bowl cut"), mullet_modern: L("Mulet moderne", "Modern mullet"),
    mullet_shaved: L("Mulet rasé sur les côtés", "Shaved-sides mullet"),
    mullet_perm: L("Mulet permanenté (années 80)", "80s perm mullet"), mullet_classic: L("Mulet classique", "Classic mullet"),
    grey_side: L("Professeur (tempes grises)", "Professor (grey sides)"),
  },
  facialHair: {
    none: L("Aucune", "None"), stubble: L("Barbe de trois jours", "Stubble"), beard: L("Barbe courte", "Short beard"),
    full_beard: L("Barbe fournie", "Full beard"), goatee: L("Bouc", "Goatee"), moustache: L("Moustache", "Moustache"),
    handlebar: L("Moustache en guidon", "Handlebar moustache"), sideburns: L("Rouflaquettes", "Sideburns"),
  },
  glasses: {
    none: L("Aucune", "None"), round: L("Rondes", "Round"), square: L("Carrées", "Square"), goggles: L("Lunettes de labo", "Lab goggles"),
    sunglasses: L("Lunettes de soleil", "Sunglasses"), visor: L("Visière futuriste", "Futuristic visor"), monocle: L("Monocle", "Monocle"),
  },
  headwear: {
    none: L("Aucun", "None"), cap: L("Casquette", "Cap"), headband: L("Bandeau", "Headband"), beanie: L("Bonnet", "Beanie"),
    headset: L("Casque audio", "Headset"), antenna: L("Antennes", "Antennae"), hood: L("Capuche", "Hood"),
    knight_helmet: L("Heaume de chevalier", "Knight helmet"), crown: L("Couronne", "Crown"),
    wizard_hat: L("Chapeau de magicien", "Wizard hat"), laurel: L("Couronne de laurier", "Laurel wreath"), top_hat: L("Haut-de-forme", "Top hat"),
  },
  outfit: {
    footballer: L("Footballeur", "Footballer"), scientist: L("Scientifique", "Scientist"), rockstar: L("Rockstar", "Rock star"),
    medieval: L("Médiéval", "Medieval"), renaissance: L("Renaissance", "Renaissance"), futuristic: L("Futuriste", "Futuristic"),
    quirky: L("Décalé", "Quirky"), funny: L("Marrant (mascotte rat de labo)", "Funny (lab-rat mascot)"),
  },
  accessory: {
    none: L("Aucun", "None"), tie: L("Cravate", "Tie"), bowtie: L("Nœud papillon", "Bow tie"), stethoscope: L("Stéthoscope", "Stethoscope"),
    scarf: L("Écharpe", "Scarf"), necklace: L("Collier", "Necklace"), cape: L("Cape", "Cape"), guitar: L("Guitare", "Guitar"),
    ruff: L("Fraise (col plissé)", "Ruff collar"),
  },
  eyes: {
    normal: L("Normal", "Normal"), happy: L("Joyeux", "Happy"), determined: L("Déterminé", "Determined"), sleepy: L("Endormi", "Sleepy"),
  },
});

// ── Valeurs par défaut ──────────────────────────────────────
const GENERIC = Object.freeze({
  build: "normal", skin: 0.3, faceShape: "oval", hairStyle: "short", hairColor: "#3b2a1a", facialHair: "none", facialHairColor: "#3b2a1a",
  eyes: "normal", eyeShape: "almond", eyeColor: "#4a3222", brows: "straight", nose: "straight", glasses: "none", headwear: "none",
  outfit: "footballer", outfitColor: "#00f0ff", accessory: "none", shoeColor: "#15151d",
});
// Visages par défaut des 16 personnages [forme, yeux, sourcils, nez] : tous différents, chaque option utilisée
const FACE_PRESETS = Object.freeze({
  roland: ["square", "hooded", "thick", "broad"], loic: ["heart", "upturned", "arched", "pointed"],
  david: ["round", "almond", "bushy", "button"], thibault: ["oval", "narrow", "straight", "straight"],
  henry: ["chiseled", "deep_set", "heavy", "roman"], romain: ["long", "droopy", "angled", "aquiline"],
  theo: ["diamond", "round", "thin", "button"], franck: ["square", "intense", "scarred", "boxer"],
  aurelien: ["long", "wide_set", "arched", "roman"], lucien: ["triangle", "monolid", "straight", "pointed"],
  joffrey: ["heart", "close_set", "thin", "straight"], yacine: ["chiseled", "almond", "angled", "aquiline"],
  djilani: ["triangle", "deep_set", "heavy", "broad"], mederic: ["diamond", "intense", "bushy", "pointed"],
  guillaume: ["round", "droopy", "thick", "boxer"], patrice: ["oval", "hooded", "bushy", "roman"],
});
// anciennes valeurs de look.hair -> coiffure
const HAIR_MAP = Object.freeze({
  short: "short", spiky: "spiky", curly: "curly", side: "side", buzz: "buzz", messy: "messy", bald: "bald",
  long: "long", slick: "slick", fade: "fade", mohawk: "mohawk", cap: "short", grey: "grey_side",
});
const HEADWEAR_ACC = Object.freeze({ headset: "headset", antenna: "antenna", hood: "hood", cap: "cap" });
const ACC_MAP = Object.freeze({ stethoscope: "stethoscope", tie: "tie", bowtie: "bowtie" });

const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const hexOk = v => typeof v === "string" && v.length === 7 && HEX.test(v);
const strHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

export function defaultAppearance(charId) {
  const id = typeof charId === "string" && charId.length <= 64 ? charId : "";
  const x = id && own(EXTRA, id) ? EXTRA[id] : null;
  const a = { ...GENERIC };
  if (!x) return a;
  const look = x.look || {};
  const p = own(PLAYER_BY_ID, id) ? PLAYER_BY_ID[id] : null;
  if (hexOk(p?.color)) a.outfitColor = p.color.toLowerCase();
  if (typeof look.skin === "number" && Number.isFinite(look.skin)) a.skin = Math.min(1, Math.max(0, look.skin));
  if (own(HAIR_MAP, look.hair)) a.hairStyle = HAIR_MAP[look.hair];
  if (look.hair === "cap") a.headwear = "cap";
  if (hexOk(look.hairColor)) a.hairColor = a.facialHairColor = look.hairColor.toLowerCase();
  if (look.beard) a.facialHair = "beard";
  if (look.glasses) a.glasses = "round";
  const acc = look.accessory;
  if (acc === "labcoat") a.outfit = "scientist";
  else if (acc === "goggles") a.glasses = "goggles";
  else if (own(HEADWEAR_ACC, acc)) a.headwear = HEADWEAR_ACC[acc];
  else if (own(ACC_MAP, acc)) a.accessory = ACC_MAP[acc];
  // couleur des yeux déterministe (teints foncés : yeux foncés)
  const eyes = APPEARANCE_OPTIONS.palettes.eye;
  a.eyeColor = a.skin >= 0.45 ? (strHash(id) & 1 ? eyes[0] : eyes[5]) : eyes[strHash(id) % 4];
  // visage : preset du personnage, sinon dérivé de l'identifiant et du look (barbu -> mâchoire marquée)
  const O = APPEARANCE_OPTIONS, preset = own(FACE_PRESETS, id) ? FACE_PRESETS[id] : null;
  if (preset) [a.faceShape, a.eyeShape, a.brows, a.nose] = preset;
  else {
    const h = strHash("face:" + id), pick = (list, k) => list[(h >>> k) % list.length];
    a.faceShape = look.beard ? pick(["square", "chiseled", "triangle", "oval"], 3) : pick(O.faceShape, 3);
    a.eyeShape = pick(O.eyeShape, 7); a.brows = pick(O.brows, 11); a.nose = pick(O.nose, 15);
  }
  return a;
}

// Valide un champ ; renvoie undefined si invalide
function cleanField(f, v) {
  if (f === "skin") return typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000 : undefined;
  if (own(ENUM_FIELDS, f)) return typeof v === "string" && v.length <= 32 && APPEARANCE_OPTIONS[ENUM_FIELDS[f]].includes(v) ? v : undefined;
  if (COLOR_FIELDS.includes(f)) return hexOk(v) ? v.toLowerCase() : undefined;
  return undefined;
}

// Renvoie une apparence complète et valide ; ne lève jamais d'exception (entrées hostiles).
export function sanitizeAppearance(obj, charId) {
  let def;
  try { def = defaultAppearance(charId); } catch { def = { ...GENERIC }; }
  const out = {};
  let isObj = false;
  try { isObj = obj !== null && typeof obj === "object" && !Array.isArray(obj); } catch { isObj = false; }
  for (const f of APPEARANCE_FIELDS) {
    let v;
    if (isObj) {
      try { v = Object.hasOwn(obj, f) ? obj[f] : undefined; } catch { v = undefined; }
    }
    let c;
    try { c = cleanField(f, v); } catch { c = undefined; }
    out[f] = c === undefined ? def[f] : c;
  }
  return out;
}

// Vrai si l'objet est déjà une apparence strictement valide (mêmes clés, valeurs valides)
export function isValidAppearance(obj) {
  try {
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return false;
    const keys = Object.keys(obj);
    if (keys.length !== APPEARANCE_FIELDS.length) return false;
    return APPEARANCE_FIELDS.every(f => Object.hasOwn(obj, f) && cleanField(f, obj[f]) === obj[f]);
  } catch { return false; }
}
