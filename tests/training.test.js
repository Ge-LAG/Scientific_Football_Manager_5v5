// Entraînement guidé v2 : détection des objectifs depuis les événements de la sim,
// et message « a.drill » validé côté serveur (salle d'entraînement seulement).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ArenaRoom } from "../shared/rooms/arenaRoom.js";
import { MODULES, MODULE_IDS, newCtx, track } from "../src/pages/arena/training.js";

const client = (id, extra = {}) => { const msgs = []; return { id, pseudo: id, guestId: "g" + id.padEnd(8, "0"), send: m => msgs.push(m), msgs, ...extra }; };
const teamOf = slots => s => slots[s] ?? -1;
const HOME = teamOf([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]); // places 0-4 : équipe 0 ; 5-9 : équipe 1

test("quatre modules sélectionnables, « bases » inchangé", () => {
  assert.deepEqual(MODULE_IDS, ["bases", "skills", "setpieces", "defense"]);
  assert.deepEqual(MODULES.bases, ["control", "sprint", "skill", "pass", "shoot", "tackle", "power", "switch", "score"]);
  assert.equal(MODULES.skills.length, 7);
});

test("gestes : chacun des 7 gestes réussi est coché, un geste raté ne compte pas", () => {
  const ctx = newCtx(); const out = [];
  for (const move of MODULES.skills) out.push(...track("skills", { type: "SKILL", slot: 2, move, ok: true }, 2, HOME, ctx));
  assert.deepEqual(out.sort(), [...MODULES.skills].sort());
  assert.deepEqual(track("skills", { type: "SKILL", slot: 2, move: "nutmeg", ok: false }, 2, HOME, ctx), [], "nutmeg raté : pas d'objectif");
  assert.deepEqual(track("skills", { type: "SKILL", slot: 7, move: "roulette", ok: true }, 2, HOME, ctx), [], "le geste d'un bot ne compte pas");
});

test("coups arrêtés : coup franc cadré, penalty marqué, penalty arrêté en gardien", () => {
  // coup franc pour moi → mon tir cadré
  const ctx = newCtx();
  track("setpieces", { type: "FREEKICK", slot: 2 }, 2, HOME, ctx);
  assert.deepEqual(track("setpieces", { type: "SHOT", slot: 2, onTarget: true }, 2, HOME, ctx), ["fk_frame"]);
  // un tir non cadré ne suffit pas
  const ctx2 = newCtx();
  track("setpieces", { type: "FREEKICK", slot: 2 }, 2, HOME, ctx2);
  assert.deepEqual(track("setpieces", { type: "SHOT", slot: 2, onTarget: false }, 2, HOME, ctx2), []);
  // penalty pour moi → but
  const ctx3 = newCtx();
  track("setpieces", { type: "PENALTY", slot: 2 }, 2, HOME, ctx3);
  assert.deepEqual(track("setpieces", { type: "GOAL", slot: 2, team: 0, score: [1, 0] }, 2, HOME, ctx3), ["pen_score"]);
  // penalty contre moi → arrêt en gardien
  const ctx4 = newCtx();
  track("setpieces", { type: "PENALTY", slot: 6 }, 0, HOME, ctx4); // l'adversaire (équipe 1) tire
  assert.deepEqual(track("setpieces", { type: "SAVE", slot: 0, catch: true }, 0, HOME, ctx4), ["pen_save"]);
});

test("défense : récupération par tacle, par pressing, sans faute", () => {
  const ctx = newCtx();
  assert.deepEqual(track("defense", { type: "TACKLE", slot: 3, victim: 7 }, 3, HOME, ctx).sort(), ["nofoul", "tackle"]);
  assert.deepEqual(track("defense", { type: "TACKLE", slot: 3, victim: 7, press: true }, 3, HOME, ctx).sort(), ["nofoul", "press"], "le pressing qui vole le ballon est une récupération propre");
  // interception propre = récupération sans faute ; après une faute, plus de « nofoul »
  const ctx2 = newCtx();
  assert.deepEqual(track("defense", { type: "INTERCEPT", slot: 3 }, 3, HOME, ctx2), ["nofoul"]);
  const ctx3 = newCtx();
  track("defense", { type: "FOUL", slot: 3, victim: 7 }, 3, HOME, ctx3);
  assert.deepEqual(track("defense", { type: "TACKLE", slot: 3, victim: 7 }, 3, HOME, ctx3), ["tackle"], "faute commise : « nofoul » reste fermé");
});

test("« a.drill » est refusé hors salle d'entraînement", () => {
  const room = new ArenaRoom({ code: "DR", opts: {} });
  const a = client("p1"); room.join(a); room.handle("p1", { t: "a.start" });
  assert.equal(room.phase, "playing");
  room.handle("p1", { t: "a.drill", kind: "freekick" });
  assert.notEqual(room.sim.phase, "setpiece", "pas de situation arrêtée hors entraînement");
  room.handle("p1", { t: "a.drill", kind: "penalty" });
  assert.ok(!room.sim.setPiece);
  room.close();
});

test("« a.drill » en salle d'entraînement : coup franc pour soi, penalty contre soi", () => {
  const room = new ArenaRoom({ code: "DT", opts: { training: true, module: "setpieces" } });
  const a = client("p1"); room.join(a); room.handle("p1", { t: "a.start" });
  const ms = room.members.get("p1").seat;
  // kind invalide : ignoré
  room.handle("p1", { t: "a.drill", kind: "corner" });
  assert.notEqual(room.sim.phase, "setpiece");
  // coup franc : c'est moi le tireur
  room.handle("p1", { t: "a.drill", kind: "freekick" });
  assert.equal(room.sim.phase, "setpiece"); assert.equal(room.sim.setPiece.kind, "freekick"); assert.equal(room.sim.setPiece.taker, ms);
  room.sim.endSetPiece();
  // penalty contre moi : un adversaire non gardien tire, je peux défendre
  room.handle("p1", { t: "a.drill", kind: "penalty", for: "against" });
  assert.equal(room.sim.setPiece.kind, "penalty");
  const taker = room.sim.players[room.sim.setPiece.taker];
  assert.equal(taker.team, room.sim.players[ms].team === 0 ? 1 : 0, "le tireur est adverse");
  assert.equal(room.sim.isKeeper(taker), false);
  room.close();
});
