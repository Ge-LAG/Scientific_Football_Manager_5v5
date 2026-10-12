// Vague 6 : tacle unique sans étourdissement, pressing, fautes → coups francs / penaltys (sans cartons),
// gestes techniques (Dribble), impact de chaque caractéristique, répartition libre des points.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ArenaSim, statOf, maxSpeed, FIELD, PEN_D } from "../shared/action/sim.js";
import { ManagerEngine } from "../shared/manager/engine.js";
import { STAT_KEYS, STAT_BUDGET, STAT_MIN, STAT_MAX, isValidStats, fitToBudget } from "../shared/data/stats.js";
import { PLAYERS, getPlayer, sanitizeStats, sanitizeStatsMap, defaultStats, withStats } from "../shared/data/content.js";

const IDS = ["djilani", "lucien", "thibault", "joffrey", "loic", "patrice", "roland", "theo", "aurelien", "mederic"];
const newSim = (over = {}, seed = 3) => new ArenaSim({ slots: IDS.map((c, i) => ({ charId: c, stats: over[i] })), seed, halfSeconds: 60 });
// répartition : une caractéristique poussée (ou abaissée), le reste équilibré au budget
const build = (key, v) => { const rest = (STAT_BUDGET - v) / (STAT_KEYS.length - 1); const vals = STAT_KEYS.map(k => (k === key ? v : rest)); const f = fitToBudget(vals); return Object.fromEntries(STAT_KEYS.map((k, i) => [k, f[i]])); };
const hi = k => build(k, 92), lo = k => build(k, 30);

test("répartition libre : budget commun, bornes, profils par défaut valides, entrées hostiles refusées", () => {
  for (const p of PLAYERS) assert.ok(isValidStats(p.attributs), p.id);
  assert.ok(isValidStats(hi("Vitesse")) && isValidStats(lo("Finition")));
  const bad = [null, [], "x", { ...hi("Force"), Force: 99 }, { ...hi("Force"), Tacle: 1.5 }, { ...hi("Force"), Tacle: "65" }, Object.fromEntries(STAT_KEYS.map(k => [k, STAT_MAX]))];
  for (const b of bad) assert.deepEqual(sanitizeStats("loic", b), defaultStats("loic"));
  // clés supplémentaires hostiles ignorées
  const hostile = JSON.parse(JSON.stringify(hi("Force")).replace("{", '{"__proto__":{"x":1},"constructor":1,'));
  assert.deepEqual(Object.keys(sanitizeStats("loic", hostile)), [...STAT_KEYS]);
  const m = sanitizeStatsMap({ loic: hi("Vitesse"), constructor: hi("Vitesse"), roland: { Finition: 99 } });
  assert.deepEqual(Object.keys(m), ["loic"]);
  const p = withStats(getPlayer("loic"), hi("Vitesse"));
  assert.equal(p.attributs.Vitesse, 92); assert.equal(p.nom, "Loïc");
  assert.ok(STAT_MIN >= 1 && STAT_MAX <= 99);
});

test("chaque caractéristique a un impact mesurable dans l'Arène", () => {
  const slotOf = 4; // Loïc (attaquant, équipe 0)
  // on ne fait varier QUE la caractéristique étudiée (les autres restent au profil par défaut)
  const one = (s, slot, key, v) => { const p = s.players[slot]; p.char = { ...p.char, attributs: { ...p.char.attributs, [key]: v } }; return s; };
  const lo = key => ({ key, v: 30 }), hi = key => ({ key, v: 92 });
  const newSim = (over = {}, seed = 3) => { const s = new ArenaSim({ slots: IDS.map(c => ({ charId: c })), seed, halfSeconds: 60 }); for (const [slot, o] of Object.entries(over)) if (o) one(s, +slot, o.key, o.v); return s; };
  const measure = (key, fn) => { const a = fn(newSim({ [slotOf]: lo(key) })), b = fn(newSim({ [slotOf]: hi(key) })); return [a, b]; };
  // Vitesse → vitesse de course
  let [a, b] = measure("Vitesse", s => maxSpeed(s.players[slotOf], s)); assert.ok(b > a * 1.1, `Vitesse ${a} → ${b}`);
  // Endurance → endurance restante après 4 s de sprint
  [a, b] = measure("Endurance", s => { s.phase = "play"; const p = s.players[slotOf]; s.ball.owner = -1; for (let i = 0; i < 120; i++) { s.setInput(slotOf, { mx: i % 60 < 30 ? 1 : -1, mz: 0, sprint: true }); s.step(); } return p.stamina; });
  assert.ok(b > a + 3, `Endurance ${a} → ${b}`);
  // Force → puissance de frappe ; Finition → précision (dispersion) ; Sang-froid → précision sous pression
  const shots = (key, over, n = 60, near = false) => { let pw = 0, dev = 0; for (let i = 0; i < n; i++) { const s = newSim({ [slotOf]: over }, 50 + i); s.phase = "play"; const p = s.players[slotOf]; p.x = 8; p.z = 0; p.facing = 0; s.ball.owner = slotOf; if (near) { s.players[6].x = 9; s.players[6].z = 0.5; s.players[7].x = 9; s.players[7].z = -0.8; } s.shoot(p, 0, 0.6); pw += Math.hypot(s.ball.vx, s.ball.vz); dev += Math.abs(Math.atan2(s.ball.vz, s.ball.vx) - s.aimAssist(p, 0) * 0); } return { pw: pw / n, dev: dev / n }; };
  assert.ok(shots("Force", hi("Force")).pw > shots("Force", lo("Force")).pw * 1.1, "Force → puissance");
  assert.ok(shots("Finition", hi("Finition")).dev < shots("Finition", lo("Finition")).dev * 0.8, "Finition → précision");
  assert.ok(shots("Sang-froid", hi("Sang-froid"), 60, true).dev < shots("Sang-froid", lo("Sang-froid"), 60, true).dev, "Sang-froid → précision sous pression");
  // Vision → précision des passes
  const passErr = over => { let e = 0; for (let i = 0; i < 80; i++) { const s = newSim({ [slotOf]: over }, 90 + i); s.phase = "play"; const p = s.players[slotOf]; p.x = 0; p.z = 0; s.ball.owner = slotOf; for (const q of s.players) if (q !== p) { q.x = -15; q.z = q.slot - 5; } s.players[3].x = 10; s.players[3].z = 0; s.pass(p, 0, false); e += Math.abs(Math.atan2(s.ball.vz, s.ball.vx)); } return e; };
  assert.ok(passErr(hi("Vision")) < passErr(lo("Vision")) * 0.7, "Vision → précision des passes");
  // Tacle → réussite des tacles ; Dribble → résistance aux tacles
  const duel = (defOver, attOver) => { let won = 0; for (let i = 0; i < 150; i++) { const s = newSim({ 6: defOver, [slotOf]: attOver }, 200 + i); s.phase = "play"; const att = s.players[slotOf], d = s.players[6]; att.x = 0; att.z = 0; d.x = 1; d.z = 0; s.ball.owner = slotOf; s.tackle(d, {}); if (s.ball.owner === 6) won++; } return won; };
  assert.ok(duel(hi("Tacle"), undefined) > duel(lo("Tacle"), undefined) * 1.3, "Tacle → réussite");
  assert.ok(duel(undefined, hi("Dribble")) < duel(undefined, lo("Dribble")) * 0.8, "Dribble → résistance");
  // Réflexes → contrôle du ballon (portée de prise de balle) et arrêts du gardien
  // ballon posé à mi-chemin entre les portées de contrôle « Réflexes 30 » et « Réflexes 92 »
  const r = 0.5 + getPlayer("loic").attributs.Dribble / 99 * 0.25 + 61 / 99 * 0.12;
  const ctrl = over => { let got = 0; for (let i = 0; i < 40; i++) { const s = newSim({ [slotOf]: over }, 400 + i); s.phase = "play"; const p = s.players[slotOf]; for (const q of s.players) if (q !== p) { q.x = -18; q.z = q.slot - 5; } p.x = 0; p.z = 0; p.vx = 0; p.vz = 0; Object.assign(s.ball, { owner: -1, x: -r, y: 0.11, z: 0, vx: 1, vy: 0, vz: 0 }); s.touchBall(); if (s.ball.owner === slotOf) got++; } return got; };
  assert.ok(ctrl(hi("Réflexes")) > ctrl(lo("Réflexes")), "Réflexes → premier contrôle");
});

test("tacle : une seule touche, aucun étourdissement du tacleur, même raté", () => {
  const s = newSim(); s.phase = "play";
  const att = s.players[4], d = s.players[6]; att.x = 0; att.z = 0; d.x = 2.6; d.z = 0; s.ball.owner = 4;
  s.tackle(d, { sprint: true }); // glissé hors de portée
  assert.ok(d.stunUntil <= s.time, "pas d'étourdissement");
  assert.ok(d.tackleCd > 0 && d.tackleCd < 1, "court délai seulement");
});

test("pressing : récupérations moins sûres que le tacle mais beaucoup moins de fautes", () => {
  let tWon = 0, tFouls = 0, pWon = 0, pFouls = 0;
  for (let i = 0; i < 400; i++) {
    const s = newSim({}, 1000 + i); s.phase = "play"; const att = s.players[4], d = s.players[6];
    att.x = 0; att.z = 0; att.facing = 0; d.x = 1; d.z = 0; s.ball.owner = 4;
    s.tackle(d, {}); if (s.ball.owner === 6) tWon++; if (s.phase === "setpiece") tFouls++;
    const s2 = newSim({}, 1000 + i); s2.phase = "play"; const a2 = s2.players[4], d2 = s2.players[6];
    a2.x = 0; a2.z = 0; a2.facing = 0; d2.x = 1; d2.z = 0; s2.ball.owner = 4;
    s2.pressSteal(d2, a2); if (s2.ball.owner === 6) pWon++; if (s2.phase === "setpiece") pFouls++;
  }
  assert.ok(pWon < tWon, `pressing ${pWon} < tacle ${tWon}`);
  assert.ok(pFouls < tFouls * 0.5, `fautes : pressing ${pFouls} / tacle ${tFouls}`);
  // les bons défenseurs commettent moins de fautes
  const s = newSim({ 6: hi("Tacle"), 7: lo("Tacle") });
  assert.ok(s.foulFactor(s.players[6]) < s.foulFactor(s.players[7]) * 0.7);
  // le pressing poursuit automatiquement le porteur
  const s3 = newSim(); s3.phase = "play"; const car = s3.players[4], pr = s3.players[6]; car.x = 0; car.z = 0; pr.x = 6; pr.z = 3; s3.ball.owner = 4;
  const d0 = Math.hypot(car.x - pr.x, car.z - pr.z);
  for (let i = 0; i < 20; i++) { s3.setInput(6, { press: true }); s3.setInput(4, {}); s3.step(); }
  assert.ok(Math.hypot(car.x - pr.x, car.z - pr.z) < d0 - 2, "le presseur se rapproche seul");
});

test("faute hors surface : coup franc (distance 4,5 m, mur, chrono arrêté) puis reprise du jeu", () => {
  const s = newSim(); s.phase = "play";
  const v = s.players[4], f = s.players[6]; v.x = 5; v.z = 3; f.x = 5.8; f.z = 3; s.ball.owner = 4;
  s.foul(f, v, "tackle");
  assert.equal(s.phase, "setpiece"); assert.equal(s.setPiece.kind, "freekick");
  assert.equal(s.ball.owner, 4);
  for (const q of s.players) if (q.team === 1) assert.ok(Math.hypot(q.x - s.setPiece.x, q.z - s.setPiece.z) >= 4.49, "distance réglementaire");
  const clock = s.playClock;
  for (let i = 0; i < 20; i++) s.step();
  assert.equal(s.playClock, clock, "chrono arrêté pendant la mise en place");
  assert.ok(s.events.some(e => e.type === "FREEKICK"));
  assert.ok(!s.events.some(e => e.type === "YELLOW" || e.type === "RED"), "pas de cartons");
  // le tireur frappe (après le temps de mise en place) : le jeu reprend
  for (let i = 0; i < 40; i++) { s.setInput(4, { shoot: true }); s.step(); }
  s.setInput(4, {}); s.step();
  assert.equal(s.phase, "play");
});

test("faute dans la surface : penalty (gardien sur sa ligne, autres hors de la surface) ; délai dépassé : tir automatique", () => {
  const s = newSim(); s.phase = "play";
  const v = s.players[4], f = s.players[6]; v.x = 16; v.z = 1; f.x = 16.5; f.z = 1; s.ball.owner = 4;
  s.foul(f, v, "slide");
  assert.equal(s.setPiece.kind, "penalty");
  assert.ok(Math.abs(s.ball.x - (FIELD.HX - PEN_D)) < 0.01 && s.ball.z === 0);
  const k = s.players[5]; assert.ok(Math.abs(k.x - (FIELD.HX - 0.4)) < 0.01);
  for (const q of s.players) if (q !== v && q !== k) assert.ok(Math.abs(q.x - FIELD.HX) >= FIELD.BOX_D + 1.1, "hors de la surface : " + q.slot);
  for (let i = 0; i < 30 * 10 && s.phase === "setpiece"; i++) s.step();
  assert.equal(s.phase === "setpiece", false, "tir automatique");
  assert.ok(s.stats[4].shots >= 1);
});

test("gestes techniques : roulette, petit pont, une-deux avec la paroi, appui mural ; efficacité selon le Dribble", () => {
  // roulette (stick vers l'arrière) : rotation, esquive élevée
  let s = newSim({ 4: hi("Dribble") }); s.phase = "play"; let p = s.players[4]; p.x = 0; p.z = 0; p.facing = 0; s.ball.owner = 4;
  s.skillMove(p, { mx: -1, mz: 0 });
  assert.ok(p.spinUntil > s.time && p.dodge > 0.7, "roulette");
  // petit pont : plus souvent réussi avec un bon Dribble
  const nut = over => { let ok = 0; for (let i = 0; i < 200; i++) { const s2 = newSim({ 4: over }, 2000 + i); s2.phase = "play"; const a = s2.players[4], d = s2.players[6]; a.x = 0; a.z = 0; a.facing = 0; d.x = 1.6; d.z = 0; s2.ball.owner = 4; s2.skillMove(a, { mx: 1, mz: 0 }); if (s2.events.at(-1).move === "nutmeg" && s2.events.at(-1).ok) ok++; } return ok; };
  assert.ok(nut(hi("Dribble")) > nut(lo("Dribble")) * 1.4, "petit pont");
  // une-deux avec la paroi : ballon envoyé vers le mur latéral proche
  s = newSim(); s.phase = "play"; p = s.players[4]; p.x = 0; p.z = FIELD.HZ - 2; p.facing = 0; s.ball.owner = 4;
  s.skillMove(p, { mx: 0, mz: 1 });
  assert.equal(s.ball.owner, -1); assert.ok(s.ball.vz > 0 && s.ball.vx > 0, "vers la paroi, en avant");
  // appui mural sans ballon : on repart vers l'intérieur du terrain
  s = newSim(); s.phase = "play"; p = s.players[3]; p.x = 0; p.z = FIELD.HZ - 0.6; p.vx = 4; p.vz = 2; s.ball.owner = 4;
  s.skillMove(p, { mx: 0, mz: 1 });
  assert.ok(p.vz < -3, "rebond sur la paroi"); assert.equal(s.events.at(-1).move, "wallkick");
  // feinte de corps : défenseurs proches mis dans le vent (plus souvent avec un bon Dribble)
  const feint = over => { let n = 0; for (let i = 0; i < 150; i++) { const s2 = newSim({ 4: over }, 3000 + i); s2.phase = "play"; const a = s2.players[4], d = s2.players[6]; a.x = 0; a.z = 0; d.x = 1.8; d.z = 0.4; s2.ball.owner = 4; s2.skillMove(a, {}); if (d.feintedUntil > s2.time) n++; } return n; };
  assert.ok(feint(hi("Dribble")) > feint(lo("Dribble")) * 1.3, "feinte de corps");
});

test("Manager : fautes, coups francs et penaltys sans aucun carton ; les bons défenseurs font moins de fautes", () => {
  const A = { lineup: ["djilani", "lucien", "thibault", "joffrey", "loic"], bench: [] };
  const B = { lineup: ["patrice", "roland", "theo", "aurelien", "mederic"], bench: [] };
  let fouls = 0, cards = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const e = new ManagerEngine({ home: A, away: B, seed, halfTicks: 600, halftimeTicks: 10 });
    while (e.tick());
    fouls += e.events.filter(x => x.type === "FOUL").length; cards += e.events.filter(x => x.type === "YELLOW" || x.type === "RED").length;
  }
  assert.ok(fouls > 0, "des fautes"); assert.equal(cards, 0, "aucun carton");
  // répartition personnalisée prise en compte par le moteur
  const e = new ManagerEngine({ home: { ...A, stats: { loic: hi("Vitesse") } }, away: B, seed: 1, halfTicks: 300 });
  assert.equal(e.pl.loic.p.attributs.Vitesse, 92);
  assert.ok(e.attr("loic", "Vitesse") > 85);
});

test("salles : la répartition du joueur est utilisée pour SON scientifique, les bots gardent le profil par défaut", async () => {
  const { ArenaRoom } = await import("../shared/rooms/arenaRoom.js");
  const room = new ArenaRoom({ code: "ST", opts: {} });
  const c = { id: "zed", pseudo: "zed", guestId: "gzed00000", send() {}, statAlloc: { loic: hi("Vitesse") }, looks: {}, loadouts: {} };
  room.join(c); room.handle("zed", { t: "a.char", charId: "loic" });
  const s = room.slots[room.members.get("zed").seat];
  assert.equal(s.stats.Vitesse, 92);
  room.handle("zed", { t: "a.start" });
  const p = room.sim.players[s.slot];
  assert.equal(p.char.attributs.Vitesse, 92);
  const bot = room.sim.players.find(q => !q.human);
  assert.deepEqual(bot.char.attributs, getPlayer(bot.char.id).attributs);
  assert.equal(statOf(p, "Vitesse", room.sim), 92);
  room.close();
});
