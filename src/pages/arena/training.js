// Entraînement guidé v2 (W-039) — détection PURE des objectifs à partir des événements
// de la simulation. Aucun DOM : testable directement avec des événements synthétiques.
//
// Quatre modules :
//   bases     — les objectifs d'origine (inchangés : control/sprint détectés via le HUD)
//   skills    — réussir chacun des 7 gestes techniques (événement SKILL par move)
//   setpieces — coup franc cadré, penalty marqué, penalty arrêté en gardien
//   defense   — récupération par tacle, par pressing, sans faute
export const MODULES = {
  bases: ["control", "sprint", "skill", "pass", "shoot", "tackle", "power", "switch", "score"],
  skills: ["cut", "feint", "roulette", "stepover", "nutmeg", "wallpass", "wallkick"],
  setpieces: ["fk_frame", "pen_score", "pen_save"],
  defense: ["tackle", "press", "nofoul"],
};
export const MODULE_IDS = Object.keys(MODULES);

// Contexte de suivi : situation arrêtée en cours et faute commise par le joueur.
export const newCtx = () => ({ sp: null, fouled: false });

// ev : événement de la sim ; ms : mon slot ; teamOf : slot → équipe (0/1).
// ctx est muté ; renvoie les objectifs nouvellement atteints (ids du module).
export function track(module, ev, ms, teamOf, ctx) {
  const done = [];
  const mine = ev.slot === ms;
  const hit = k => { if (!done.includes(k)) done.push(k); };
  if (ev.type === "FOUL" && mine) ctx.fouled = true;

  if (module === "skills") {
    if (ev.type === "SKILL" && mine && ev.ok !== false && ev.move) hit(ev.move);
    return done;
  }

  if (module === "setpieces") {
    if (ev.type === "FREEKICK" || ev.type === "PENALTY") {
      ctx.sp = { kind: ev.type === "PENALTY" ? "penalty" : "freekick", forTeam: teamOf(ev.slot), taker: ev.slot };
      return done;
    }
    const sp = ctx.sp; if (!sp) return done;
    const myTeam = teamOf(ms);
    if (ev.type === "GOAL") { if (sp.kind === "penalty" && sp.forTeam === myTeam && sp.taker === ms) hit("pen_score"); ctx.sp = null; }
    else if (ev.type === "SHOT" && mine && ev.onTarget && sp.kind === "freekick" && sp.taker === ms) hit("fk_frame");
    else if (ev.type === "SAVE" && mine && sp.kind === "penalty" && sp.forTeam !== myTeam) hit("pen_save");
    return done;
  }

  if (module === "defense") {
    if (ev.type === "TACKLE" && mine) { hit(ev.press ? "press" : "tackle"); if (!ctx.fouled) hit("nofoul"); }
    if (ev.type === "INTERCEPT" && mine && !ctx.fouled) hit("nofoul");
    return done;
  }

  // module « bases » : les objectifs détectés par événement (le reste passe par le HUD)
  if (mine) ({ MY_PASS: "pass", SHOT: "shoot", TACKLE: "tackle", POWERUP: "power", GOAL: "score", SKILL: "skill" })[ev.type] && hit(({ MY_PASS: "pass", SHOT: "shoot", TACKLE: "tackle", POWERUP: "power", GOAL: "score", SKILL: "skill" })[ev.type]);
  return done;
}

// Persistance locale par module (ll.training) — côté client uniquement.
const KEY = "ll.training";
export function loadTraining(module) {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}")?.[module] || {}; } catch { return {}; }
}
export function saveTraining(module, goals) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    all[module] = goals; localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* stockage indisponible */ }
}
