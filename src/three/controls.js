// Contrôles de l'Arène : préréglages de touches (positions physiques KeyboardEvent.code), libellés selon la
// disposition du clavier (AZERTY / QWERTY / QWERTZ, détection automatique), manette, réaffectation.

// Actions affectables (ordre d'affichage dans les réglages).
export const ACTIONS = ["up", "down", "left", "right", "sprint", "shoot", "pass", "lob", "skill", "tackle", "slide", "switch", "call", "pu1", "pu2", "cam", "board", "menu"];
export const MOVE_ACTIONS = ["up", "down", "left", "right"];
// Actions ponctuelles (front montant) ; les autres sont maintenues (déplacement, sprint, tir chargé, tableau).
export const EDGE_ACTIONS = ["pass", "lob", "skill", "tackle", "slide", "switch", "call", "pu1", "pu2", "cam", "menu"];

// Préréglages clavier. « arrows » : déplacement aux flèches (main droite), actions sous la main gauche posée
// sur la rangée de repos (auriculaire → index : lob, passe, tir, crochet), rangée du haut pour les actions
// « méta » (changer de joueur, appel, power-ups), pouce sur Espace pour le sprint maintenu.
export const KEY_PRESETS = {
  arrows: {
    up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"],
    sprint: ["Space", "ShiftLeft"], shoot: ["KeyD"], pass: ["KeyS"], lob: ["KeyA"], skill: ["KeyF"],
    tackle: ["KeyX"], slide: ["KeyZ"], switch: ["KeyQ"], call: ["KeyW"], pu1: ["KeyE"], pu2: ["KeyR"],
    cam: ["KeyC"], board: ["Tab"], menu: ["Escape"],
  },
  // clavier + souris (style tir à la 3e personne) : ZQSD / WASD, souris pour la caméra et la visée
  wasd: {
    up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"],
    sprint: ["ShiftLeft"], shoot: ["Space"], pass: ["KeyE"], lob: ["KeyF"], skill: ["KeyQ"],
    tackle: ["KeyC", "ControlLeft"], slide: ["KeyV"], switch: ["KeyX"], call: ["KeyZ"], pu1: ["KeyR"], pu2: ["KeyT"],
    cam: ["KeyB"], board: ["Tab"], menu: ["Escape"],
  },
};

// Manette (mapping « standard » de l'API Gamepad, noms Xbox) : A passe, B tir, X lob, Y crochet,
// LB changer de joueur, RB / LT power-ups, RT sprint, R3 appel, Select caméra, Start menu.
export const PAD_DEFAULT = {
  sprint: [7], shoot: [1], pass: [0], lob: [2], skill: [3, 10], tackle: [], slide: [], switch: [4], call: [11, 12],
  pu1: [5], pu2: [6], cam: [8], board: [13], menu: [9],
};
export const PAD_BUTTONS = 17;
const PAD_NAMES = {
  xbox: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "L3", "R3", "↑", "↓", "←", "→", "Xbox"],
  ps: ["✕", "○", "□", "△", "L1", "R1", "L2", "R2", "Share", "Options", "L3", "R3", "↑", "↓", "←", "→", "PS"],
};
export const padLabel = (i, style = "xbox") => (PAD_NAMES[style] || PAD_NAMES.xbox)[i] ?? "#" + i;

export const DEFAULT_CONTROLS = {
  preset: "arrows",    // arrows | wasd
  layout: "auto",      // auto | azerty | qwerty | qwertz (libellés des touches)
  keys: null,          // réaffectations personnalisées { action: [codes] } (null = préréglage)
  pad: null,           // réaffectations manette { action: [boutons] }
  padStyle: "xbox",    // xbox | ps (libellés)
  contextKeys: true,   // sans le ballon : Passe = tacle, Tir = tacle glissé
  mouseCamera: null,   // null = selon le préréglage (activé pour « wasd »)
  autoSwitch: "off",   // off | pass (suivre le ballon après une passe) | assist (+ défense)
  vibration: true,
};

export function controlsOf(settings) { return { ...DEFAULT_CONTROLS, ...(settings?.controls || {}) }; }

// Tables effectives : touche → actions, action → touches, action → boutons de manette.
export function resolveBindings(controls) {
  const c = { ...DEFAULT_CONTROLS, ...(controls || {}) };
  const preset = KEY_PRESETS[c.preset] || KEY_PRESETS.arrows;
  const keys = {}, pad = {};
  for (const a of ACTIONS) {
    const k = c.keys?.[a]; keys[a] = Array.isArray(k) ? k.filter(x => typeof x === "string").slice(0, 3) : [...(preset[a] || [])];
    const b = c.pad?.[a]; pad[a] = Array.isArray(b) ? b.filter(x => Number.isInteger(x) && x >= 0 && x < PAD_BUTTONS).slice(0, 3) : [...(PAD_DEFAULT[a] || [])];
  }
  const keyToActions = new Map();
  for (const a of ACTIONS) for (const code of keys[a]) { if (!keyToActions.has(code)) keyToActions.set(code, []); keyToActions.get(code).push(a); }
  const mouseCamera = c.mouseCamera ?? c.preset === "wasd";
  return { keys, pad, keyToActions, mouseCamera, contextKeys: c.contextKeys, autoSwitch: c.autoSwitch, vibration: c.vibration, padStyle: c.padStyle, preset: c.preset };
}

// Conflits : touches affectées à plusieurs actions (hors combinaisons voulues du préréglage).
export function conflicts(keys) {
  const seen = new Map(), out = new Set();
  for (const a of ACTIONS) for (const k of keys[a] || []) { if (seen.has(k) && seen.get(k) !== a) { out.add(k); } else seen.set(k, a); }
  return out;
}

// ── Libellés des touches selon la disposition ───────────────────────
const SPECIAL = {
  fr: { Space: "Espace", ShiftLeft: "Maj G", ShiftRight: "Maj D", ControlLeft: "Ctrl G", ControlRight: "Ctrl D", AltLeft: "Alt", Tab: "Tab", Escape: "Échap", Enter: "Entrée", Backspace: "Retour", CapsLock: "Verr. Maj" },
  en: { Space: "Space", ShiftLeft: "L-Shift", ShiftRight: "R-Shift", ControlLeft: "L-Ctrl", ControlRight: "R-Ctrl", AltLeft: "Alt", Tab: "Tab", Escape: "Esc", Enter: "Enter", Backspace: "Backspace", CapsLock: "Caps" },
};
const ARROWS = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
// différences par rapport au QWERTY (positions physiques → caractère gravé)
const LAYOUTS = {
  qwerty: {},
  azerty: { KeyQ: "A", KeyA: "Q", KeyW: "Z", KeyZ: "W", KeyM: ",", Semicolon: "M", Comma: ";", Period: ":", Slash: "!", Digit1: "&", Digit2: "é", Digit3: "\"", Digit4: "'", Digit5: "(", BracketLeft: "^", Quote: "ù", Backquote: "²" },
  qwertz: { KeyY: "Z", KeyZ: "Y", Semicolon: "Ö", Quote: "Ä", BracketLeft: "Ü", Minus: "ß" },
};
let layoutMap = null; // disposition réelle fournie par le navigateur (Keyboard API, Chrome/Edge)

// Détection : Keyboard API si disponible, sinon langue du navigateur.
export async function detectLayout() {
  if (typeof navigator === "undefined") return "qwerty";
  try {
    const m = await navigator.keyboard?.getLayoutMap?.();
    if (m && m.size) {
      layoutMap = m;
      const q = m.get("KeyQ"), y = m.get("KeyY");
      return q === "a" ? "azerty" : y === "z" ? "qwertz" : "qwerty";
    }
  } catch { /* API indisponible (Firefox, Safari, iframe) */ }
  const lang = (navigator.language || "").toLowerCase();
  if (/^fr(-(fr|be|lu|mc))?$/.test(lang)) return "azerty";
  if (/^de|^fr-ch|^cs|^sk|^hu|^sl|^hr/.test(lang)) return "qwertz";
  return "qwerty";
}

export function codeLabel(code, layout = "qwerty", lang = "fr") {
  if (!code) return "—";
  if (ARROWS[code]) return ARROWS[code];
  const sp = (SPECIAL[lang] || SPECIAL.fr)[code]; if (sp) return sp;
  if (layout === "auto" && layoutMap?.get(code)) return layoutMap.get(code).toUpperCase();
  const L = LAYOUTS[layout === "auto" ? guessedLayout : layout] || {};
  if (L[code]) return L[code].toUpperCase();
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Pav " + code.slice(6);
  if (code.startsWith("F") && /^F\d+$/.test(code)) return code;
  return code.replace(/(Left|Right)$/, "");
}
let guessedLayout = "qwerty";
detectLayout().then(l => { guessedLayout = l; }).catch(() => {});
export const effectiveLayout = layout => (layout === "auto" ? guessedLayout : layout);
