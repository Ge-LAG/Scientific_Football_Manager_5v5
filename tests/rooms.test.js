// Salles de jeu (sans réseau) : draft automatique, clubs, championnat, reconnexion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ManagerRoom, DRAFT_ORDER } from "../shared/rooms/managerRoom.js";

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
