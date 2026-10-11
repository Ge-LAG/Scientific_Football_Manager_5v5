// Salles de jeu (sans réseau) : draft automatique, clubs, championnat, reconnexion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ManagerRoom, DRAFT_ORDER } from "../shared/rooms/managerRoom.js";
import { ArenaRoom } from "../shared/rooms/arenaRoom.js";

const client = (id, extra = {}) => { const msgs = []; return { id, pseudo: id, guestId: "g" + id.padEnd(8, "0"), send: m => msgs.push(m), msgs, ...extra }; };
const last = (c, t) => [...c.msgs].reverse().find(m => m.t === t);
const until = async (pred, ms = 15000) => { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error("délai"); await new Promise(r => setTimeout(r, 20)); } };

test("draft en serpentin : 16 choix alternés A, B, B, A…", () => {
  assert.equal(DRAFT_ORDER.length, 16);
  assert.deepEqual(DRAFT_ORDER.slice(0, 6), ["home", "away", "away", "home", "home", "away"]);
  assert.equal(DRAFT_ORDER.filter(s => s === "home").length, 8);
});

test("deux clubs identiques sont différenciés ; draft automatique complète", async () => {
  const room = new ManagerRoom({ code: "T1", opts: {} });
  const a = client("alice"), b = client("bruno");
  room.join(a); room.join(b);
  room.handle("alice", { t: "m.start" });
  const st = last(a, "room.state");
  assert.equal(st.phase, "draft");
  assert.notEqual(st.seats.home.club.colors[0].toLowerCase(), st.seats.away.club.colors[0].toLowerCase());
  assert.notEqual(st.seats.home.club.name, st.seats.away.club.name);
  room.handle("alice", { t: "m.autodraft" }); room.handle("bruno", { t: "m.autodraft" });
  await until(() => room.phase === "setup");
  assert.equal(room.seats.home.picks.length, 8); assert.equal(room.seats.away.picks.length, 8);
  room.close();
});

test("championnat : le bot prend l'identité du club adverse ; reconnexion : instantané renvoyé", async () => {
  const room = new ManagerRoom({ code: "T2", opts: { bot: "stagiaire", autostart: true, speed: 4, halfTicks: 300, season: { id: 7, day: 2 }, botClub: { name: "Nobel Galácticos", crest: "🏆", colors: ["#FF3366", "#101018"] } } });
  const a = client("solo");
  room.join(a);
  await until(() => room.phase === "draft");
  assert.equal(room.seats.away.club.name, "Nobel Galácticos");
  assert.deepEqual(room.opts.season, { id: 7, day: 2 });
  room.handle("solo", { t: "m.autodraft" });
  await until(() => room.phase === "setup");
  room.handle("solo", { t: "m.setup", lineup: room.seats.home.lineup, formation: "2-2", strategy: "attack", ready: true });
  await until(() => room.phase === "playing");
  room.leave("solo");
  assert.ok(room.bots.home, "un bot reprend la main");
  const back = client("solo2", { guestId: a.guestId });
  room.join(back);
  assert.ok(!room.bots.home, "le joueur reprend la main");
  assert.ok(back.msgs.some(m => m.t === "m.init") && back.msgs.some(m => m.t === "m.snap"), "init + instantané renvoyés");
  room.close();
});

// ── W-034 : scénarios réseau ────────────────────────────────

test("départ de l'hôte au salon : le suivant devient hôte et peut lancer (Arène et Manager)", async () => {
  // Arène : deux humains, l'hôte part, l'autre lance le match
  const ar = new ArenaRoom({ code: "RA", opts: {} });
  ar.join(client("cap")); ar.join(client("mate"));
  ar.leave("cap");
  assert.equal(ar.hostId, "mate");
  assert.equal(last(client0(ar, "mate"), "room.state").you.host, true, "l'état diffusé annonce le nouvel hôte");
  ar.handle("mate", { t: "a.start" });
  assert.equal(ar.phase, "playing");
  ar.close();

  // Manager : l'hôte (siège « home ») part, le joueur « away » restant lance la partie
  const mr = new ManagerRoom({ code: "RM", opts: {} });
  mr.join(client("coach")); mr.join(client("coach2"));
  mr.leave("coach");
  assert.equal(mr.hostId, "coach2");
  mr.handle("coach2", { t: "m.start" });
  assert.equal(mr.phase, "draft", "le siège vide est pris par un bot et le draft démarre");
  assert.ok(mr.seats.home.bot, "un bot occupe le siège home libéré");
  mr.close();
});

test("Arène : arrivée en cours de match — bot de l'équipe la moins pourvue remplacé, init puis instantanés", async () => {
  const room = new ArenaRoom({ code: "RJ", opts: {} });
  const a = client("a1"), b = client("b1"), c = client("late");
  room.join(a); room.join(b); room.handle("a1", { t: "a.start" });
  assert.equal(room.phase, "playing");
  const bTeam = room.slots[room.members.get("b1").seat].team;
  room.leave("b1"); // son équipe n'a plus d'humain
  room.join(c);
  const seat = room.members.get("late").seat;
  assert.equal(room.slots[seat].team, bTeam, "l'équipe la moins pourvue en humains");
  assert.equal(room.slots[seat].memberId, "late");
  assert.equal(room.sim.players[seat].human, true, "le joueur est sous contrôle humain (le bot est remplacé)");
  const iInit = c.msgs.findIndex(m => m.t === "a.init");
  assert.ok(iInit >= 0, "l'état initial est renvoyé");
  await until(() => c.msgs.some((m, i) => i > iInit && m.t === "a.snap"), 5000);
  assert.ok(c.msgs.findIndex(m => m.t === "a.snap") > iInit, "les instantanés suivent l'init");
  room.close();
});

test("Arène : à deux humains dans la même équipe, le changement de joueur épargne l'autre humain", async () => {
  const room = new ArenaRoom({ code: "SW", opts: {} });
  const a = client("a1"), b = client("b1");
  room.join(a); room.join(b);
  room.handle("b1", { t: "a.slot", slot: 3 }); // b rejoint l'équipe de a (places 0-4)
  const aSeat = room.members.get("a1").seat, bSeat = room.members.get("b1").seat;
  assert.equal(room.slots[aSeat].team, room.slots[bSeat].team, "même équipe");
  room.handle("a1", { t: "a.start" });
  assert.equal(room.phase, "playing");

  // changement manuel vers la place de l'autre humain : refusé dans les deux sens
  room.handle("a1", { t: "a.switch", to: bSeat });
  assert.equal(room.members.get("a1").seat, aSeat, "a ne prend pas la place de b");
  room.handle("b1", { t: "a.switch", to: aSeat });
  assert.equal(room.members.get("b1").seat, bSeat, "b ne prend pas la place de a");

  // changement automatique : toujours un coéquipier bot, jamais l'autre humain
  room.handle("a1", { t: "a.switch", to: "auto" });
  const aNew = room.members.get("a1").seat;
  assert.notEqual(aNew, aSeat, "a a changé de joueur");
  assert.notEqual(aNew, bSeat, "a n'a pas pris le joueur de b");
  assert.equal(room.slots[bSeat].memberId, "b1", "b garde son joueur");
  room.handle("b1", { t: "a.switch", to: "auto" });
  const bNew = room.members.get("b1").seat;
  assert.notEqual(bNew, room.members.get("a1").seat, "b n'a pas pris le joueur de a");
  assert.equal(room.slots[aNew].memberId, "a1", "a garde son joueur");
  room.close();
});

test("Manager : abandon en plein match — bot en relève, résultat enregistré comme abandon, sans erreur", async () => {
  let captured = null;
  const room = new ManagerRoom({ code: "AB", opts: {}, lobby: { onResults: async es => (captured = es, es.map(e => ({ userId: e.userId }))), scheduleClose() {}, closeRoom() {} } });
  const a = client("stay", { userId: "u-stay" }), b = client("quitter", { userId: "u-quit" });
  room.join(a); room.join(b); room.handle("stay", { t: "m.start" });
  room.handle("stay", { t: "m.autodraft" }); room.handle("quitter", { t: "m.autodraft" });
  await until(() => room.phase === "setup", 20000);
  for (const [id, side] of [["stay", "home"], ["quitter", "away"]]) { const s = room.seats[side]; room.handle(id, { t: "m.setup", lineup: s.lineup, formation: s.formation, strategy: "equilibre", ready: true }); }
  await until(() => room.phase === "playing", 5000);
  room.leave("quitter");
  assert.ok(room.bots.away, "un bot reprend la main côté away");
  assert.equal(room.seats.away.left, true, "la place est marquée « parti »");
  // fin de match accélérée : le chrono atteint la fin, le bot joue jusque-là sans erreur
  room.engine.time = room.engine.maxTime; room.engine.phase = "play"; room.engine.phaseTimer = 0;
  await until(() => captured !== null, 15000);
  assert.ok(last(a, "m.report"), "le rapport est diffusé");
  assert.equal(captured.find(e => e.userId === "u-quit").entry.abandoned, true, "résultat « abandon » pour le partant");
  assert.equal(captured.find(e => e.userId === "u-stay").entry.abandoned, false, "pas d'abandon pour le joueur resté");
  room.close();
});

// membre → client factice (pour lire l'état qui lui est diffusé)
function client0(room, id) { return room.members.get(id).client; }
