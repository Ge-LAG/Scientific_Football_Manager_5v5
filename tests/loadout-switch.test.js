// Sélection de 2 power-ups, nouveaux effets de l'Arène, changement de joueur, profil (apparences).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ArenaSim, statOf, maxSpeed, activeFx, bestSwitchTarget } from "../shared/action/sim.js";
import { ArenaRoom } from "../shared/rooms/arenaRoom.js";
import { ManagerEngine } from "../shared/manager/engine.js";
import { Lobby } from "../shared/lobby.js";
import { PLAYERS, getPlayer, sanitizeLoadout, defaultLoadout, LOADOUT_SIZE } from "../shared/data/content.js";
import { sanitizeLooks } from "../shared/profile.js";

const IDS = ["djilani", "lucien", "thibault", "joffrey", "loic", "patrice", "roland", "theo", "aurelien", "mederic"];
const newSim = (loadouts = {}) => new ArenaSim({ slots: IDS.map(c => ({ charId: c, loadout: loadouts[c] })), seed: 3, halfSeconds: 60 });
const puOf = (charId, effect) => getPlayer(charId).powerUps.find(u => u.arena.effect === effect)?.id;
const client = (id, extra = {}) => { const msgs = []; return { id, pseudo: id, guestId: "g" + id.padEnd(8, "0"), send: m => msgs.push(m), msgs, ...extra }; };
const last = (c, t) => [...c.msgs].reverse().find(m => m.t === t);

test("4 power-ups par scientifique ; sélection de 2 nettoyée", () => {
  for (const p of PLAYERS) {
    assert.equal(p.powerUps.length, 4, p.id);
    assert.equal(p.powerUps[0], p.powerUp, "le power-up d'origine reste le premier");
    assert.equal(defaultLoadout(p.id).length, LOADOUT_SIZE);
  }
  const own = getPlayer("loic").powerUps.map(u => u.id);
  assert.deepEqual(sanitizeLoadout("loic", [own[3], own[2]]), [own[3], own[2]]);
  assert.deepEqual(sanitizeLoadout("loic", [own[2], own[2], "pu_cyber_firewall", "__proto__"]), [own[2], own[0]], "doublons et power-ups d'un autre refusés");
  assert.deepEqual(sanitizeLoadout("loic", "n'importe quoi"), defaultLoadout("loic"));
  assert.deepEqual(sanitizeLoadout("constructor", [own[0]]), []);
});

test("Arène : 2 power-ups indépendants (touches PU1 / PU2), recharges séparées", () => {
  const own = getPlayer("loic").powerUps.map(u => u.id);
  const sim = newSim({ loic: [own[0], own[2]] }); sim.phase = "play";
  const l = sim.players[4];
  assert.deepEqual(l.pus.map(u => u.def.id), [own[0], own[2]]);
  sim.setInput(4, { pu2: true }); sim.step();
  assert.ok(l.pus[1].until > sim.time && l.pus[0].until <= sim.time, "seul PU2 est actif");
  assert.ok(sim.activatePowerUp(l, 0), "PU1 reste disponible");
  assert.equal(sim.activatePowerUp(l, 1), false, "PU2 en recharge");
  const snap = sim.snapshot().p[4];
  assert.equal(snap[12], 3, "bits des PU actifs");
  assert.ok(snap[9] > 0 && snap[11] > 0, "recharges des deux PU");
  const ev = sim.events.filter(e => e.type === "POWERUP" && e.slot === 4);
  assert.deepEqual(ev.map(e => e.k), [1, 0]);
});

test("nouveaux effets : élan, onde de choc, gel, aimant, vitesse d'équipe, mur du gardien, frappe enveloppée", () => {
  // élan (dash)
  let sim = newSim({ loic: [puOf("loic", "dash"), getPlayer("loic").powerUp.id] }); sim.phase = "play";
  let l = sim.players[4]; l.facing = 0; l.vx = 0; l.vz = 0;
  assert.ok(sim.activatePowerUp(l, 0)); assert.ok(l.vx > 7, "impulsion vers l'avant");
  sim.step(); assert.ok(l.vx > 6, "élan conservé");

  // onde de choc : les adversaires proches sont repoussés, étourdis, et le porteur perd le ballon
  const ctrlz = puOf("roland", "shockwave");
  sim = newSim({ roland: [ctrlz] }); sim.phase = "play";
  const r = sim.players[6], victim = sim.players[1];
  r.x = 0; r.z = 0; victim.x = 1.5; victim.z = 0; sim.ball.owner = 1;
  assert.ok(sim.activatePowerUp(r, 0));
  assert.ok(victim.stunUntil > sim.time && victim.vx > 3 && sim.ball.owner === -1);

  // gel : l'adversaire le plus proche est immobilisé
  sim = newSim({ theo: [puOf("theo", "freezeNearest")] }); sim.phase = "play";
  const th = sim.players[7]; th.x = 0; th.z = 0;
  for (const p of sim.players) if (p.team === 0) { p.x = -15; p.z = p.slot; }
  sim.players[2].x = 2; sim.players[2].z = 1;
  assert.ok(sim.activatePowerUp(th, 0));
  assert.ok(sim.players[2].stunUntil > sim.time + 1);
  assert.equal(sim.events.at(-1).victim, 2);

  // aimant : un ballon libre proche est attiré
  sim = newSim({ aurelien: [puOf("aurelien", "magnet")] }); sim.phase = "play";
  const au = sim.players[8]; au.x = 5; au.z = 0;
  for (const p of sim.players) if (p !== au) { p.x = -18; p.z = p.slot - 5; }
  Object.assign(sim.ball, { owner: -1, x: 1, y: 0.11, z: 0, vx: 0, vy: 0, vz: 0 });
  assert.ok(sim.activatePowerUp(au, 0));
  for (let i = 0; i < 15; i++) { sim.setInput(8, {}); sim.step(); }
  assert.ok(sim.ball.x > 1.5 || sim.ball.owner === 8, "le ballon se rapproche");

  // vitesse d'équipe
  sim = newSim({ lucien: [puOf("lucien", "teamSpeed")] }); sim.phase = "play"; sim.ball.owner = -1;
  const mate = sim.players[2]; const s0 = maxSpeed(mate, sim);
  assert.ok(sim.activatePowerUp(sim.players[1], 0));
  assert.ok(maxSpeed(mate, sim) > s0 * 1.05, "coéquipier plus rapide");
  assert.equal(maxSpeed(sim.players[7], sim), maxSpeed(sim.players[7], { ...sim, auras: [] }), "adversaires inchangés");

  // mur du gardien : aura « keeper » de l'équipe
  sim = newSim({ djilani: [puOf("djilani", "keeperWall")] }); sim.phase = "play";
  assert.ok(sim.activatePowerUp(sim.players[0], 0));
  assert.ok(sim.auras.some(a => a.kind === "keeper" && a.team === 0 && a.value > 1.3));

  // frappe enveloppée : effet appliqué au ballon, puis power-up consommé
  sim = newSim({ loic: [puOf("loic", "curlShot")] }); sim.phase = "play";
  l = sim.players[4]; l.x = 8; l.z = 6; sim.ball.owner = 4;
  assert.ok(sim.activatePowerUp(l, 0));
  sim.shoot(l, 0, 0.5);
  assert.ok(Math.abs(sim.ball.curl) > 5, "ballon brossé");
  assert.equal(activeFx(l, "curlShot", { time: sim.time + 0.1 }), null, "consommé après le tir");
});

test("bonus de caractéristiques : somme des power-ups actifs", () => {
  const own = getPlayer("franck").powerUps;
  const sim = newSim({}); sim.phase = "play";
  sim.setSlot(3, { charId: "franck", loadout: [own[0].id, own[1].id] });
  const f = sim.players[3]; const k = "Finition";
  const base = statOf(f, k, sim);
  sim.activatePowerUp(f, 0); sim.activatePowerUp(f, 1);
  const expected = Math.min(99, Math.max(1, base + (own[0].buffs[k] || 0) + (own[1].buffs[k] || 0)));
  assert.equal(statOf(f, k, sim), expected);
});

test("changement de joueur : vers un coéquipier bot uniquement ; actions créditées au pilote du moment", async () => {
  let entries = null;
  const lobby = { onResults: async e => { entries = e; return []; }, closeRoom() {}, scheduleClose() {} };
  const room = new ArenaRoom({ code: "SW", opts: { halfSeconds: 60 }, lobby });
  const a = client("ana", { userId: "u-ana" }), b = client("ben", { userId: "u-ben" }), c = client("cid");
  room.join(a); room.handle("ana", { t: "a.slot", slot: 3 });
  room.join(b); room.handle("ben", { t: "a.slot", slot: 2 });
  room.join(c); room.handle("cid", { t: "a.slot", slot: 1 });
  room.handle("ana", { t: "a.start" });
  try {
  assert.deepEqual([1, 2, 3].map(i => room.slots[i].memberId), ["cid", "ben", "ana"]);
  assert.equal(room.phase, "playing");
  const sim = room.sim; const ana = room.slots[3].identity;
  // vers un humain, l'équipe adverse, une clé hostile ou un nombre décimal : refusé
  for (const to of [2, 7, "__proto__", 1.5]) assert.equal(room.switchTo("ana", to), false, String(to));
  // place d'un coéquipier déconnecté : réservée pour son retour (ni manuel ni automatique)
  room.leave("cid");
  assert.equal(room.switchTo("ana", 1), false, "place réservée");
  // Ana marque avec le n°3 : crédité
  sim.ball.owner = 3; room.trackTouches(); room.accountEvents([{ type: "SHOT", slot: 3 }, { type: "GOAL", slot: 3, assist: -1 }]);
  // un bot (n°4) tire ; Ana prend le contrôle du n°4 pendant que le ballon vole : le but n'est pas pour elle
  sim.ball.owner = 4; room.trackTouches(); room.accountEvents([{ type: "SHOT", slot: 4 }]); sim.ball.owner = -1; sim.ball.last = 4;
  assert.equal(room.switchTo("ana", 4), true);
  assert.equal(room.members.get("ana").seat, 4);
  assert.ok(sim.players[4].human && !sim.players[3].human, "le pilote change, pas le personnage");
  assert.equal(last(a, "room.state").you.slot, 4);
  room.trackTouches(); room.accountEvents([{ type: "GOAL", slot: 4, assist: -1 }]);
  assert.equal(room.acc[ana].goals, 1, "but d'un tir de bot : non attribué");
  assert.equal(room.acc[ana].shots, 1);
  assert.equal(room.switchTo("ana", 0), false, "délai minimal entre deux changements");
  // Ana tire elle-même avec le n°4 : crédité
  sim.ball.owner = 4; room.trackTouches(); room.accountEvents([{ type: "SHOT", slot: 4 }, { type: "GOAL", slot: 4, assist: 3 }]);
  assert.equal(room.acc[ana].goals, 2);
  assert.equal(room.acc[ana].assists, 1, "passe décisive du n°3 quand Ana le pilotait");
  // fin : pas d'homme du match « volé » en prenant un bot très performant
  sim.stats[4].goals = 6; sim.stats[5].saves = 0;
  await room.end();
  const e = entries.find(x => x.userId === "u-ana").entry;
  assert.equal(e.goals, 2); assert.equal(e.mvp, false);
  assert.equal(e.charId, room.slots[4].pick, "personnage choisi en salle");
  } finally { room.close(); }
});

test("changement automatique : porteur bot, sinon joueur de champ le mieux placé", () => {
  const sim = newSim(); sim.phase = "play";
  sim.players[4].human = true;
  sim.ball.owner = 2; assert.equal(bestSwitchTarget(sim, 4), 2);
  sim.ball.owner = -1; Object.assign(sim.ball, { x: -5, z: 5, vx: 0, vz: 0 });
  sim.players[3].x = -5; sim.players[3].z = 4.5; sim.players[2].x = 10; sim.players[1].x = 12;
  assert.equal(bestSwitchTarget(sim, 4), 3);
  for (const p of sim.players) if (p.team === 0) p.human = true;
  assert.equal(bestSwitchTarget(sim, 4), -1, "équipe entièrement humaine : pas de changement");
});

test("Manager : 2 power-ups par joueur, recharge par power-up", () => {
  const A = { lineup: ["djilani", "lucien", "thibault", "joffrey", "loic"], bench: [] };
  const B = { lineup: ["patrice", "roland", "theo", "aurelien", "mederic"], bench: [] };
  const own = getPlayer("loic").powerUps.map(u => u.id);
  A.loadouts = { loic: [own[1], own[3]] };
  const e = new ManagerEngine({ home: A, away: B, seed: 2, halfTicks: 300, halftimeTicks: 10 });
  assert.deepEqual(e.pl.loic.pus.map(u => u.id), [own[1], own[3]]);
  assert.equal(e.activatePowerUp("home", "loic", own[0]), true);
  assert.equal(e.activePU.at(-1).puId, own[1], "hors sélection → premier power-up emporté");
  assert.equal(e.activatePowerUp("home", "loic", own[3]), true, "l'autre power-up reste disponible");
  assert.equal(e.activatePowerUp("home", "loic", own[3]), false, "recharge");
  assert.equal(e.activatePowerUp("away", "loic", own[3]), false, "joueur adverse");
  assert.ok(e.snapshot().cd[own[3]] > e.time);
  while (e.tick());
  assert.equal(e.phase, "ended");
});

test("profil : apparences et sélections nettoyées, transmises aux salles", () => {
  const looks = sanitizeLooks({ loic: { hairStyle: "mullet_perm", outfit: "rockstar", hairColor: "javascript:alert(1)" }, constructor: {}, __proto__: { x: 1 } });
  assert.deepEqual(Object.keys(looks), ["loic"]);
  assert.equal(looks.loic.hairStyle, "mullet_perm");
  assert.match(looks.loic.hairColor, /^#[0-9a-fA-F]{6}$/);
  const lobby = new Lobby(); const c = client("zoe"); lobby.connect(c);
  const own = getPlayer("loic").powerUps.map(u => u.id);
  lobby.handle("zoe", { t: "profile", looks: { loic: { hairStyle: "mullet_shaved", outfit: "medieval" } }, loadouts: { loic: [own[2], own[3]], hacker: ["x"] } });
  lobby.handle("zoe", { t: "room.create", mode: "arena", opts: {} });
  const room = [...lobby.rooms.values()][0];
  const s = room.slots[room.members.get("zoe").seat];
  lobby.handle("zoe", { t: "a.char", charId: "loic" });
  assert.equal(s.charId, "loic");
  assert.equal(s.look.hairStyle, "mullet_shaved");
  assert.deepEqual(s.loadout, [own[2], own[3]]);
  const st = last(c, "room.state"); assert.equal(st.slots[s.slot].look.outfit, "medieval");
  lobby.handle("zoe", { t: "a.loadout", ids: [own[1]] });
  assert.deepEqual(s.loadout, [own[1], own[0]]);
  lobby.shutdown();
});

test("onde de choc et gel : interdits au coup d'envoi ; gardien qui tient le ballon protégé", () => {
  const ctrlz = getPlayer("roland").powerUps.find(u => u.arena.effect === "shockwave").id;
  const sim = newSim({ roland: [ctrlz] }); // phase « kickoff »
  const r = sim.players[6];
  assert.equal(sim.activatePowerUp(r, 0), false, "pas pendant le coup d'envoi");
  sim.phase = "play";
  const gk = sim.players[0]; r.x = gk.x + 1; r.z = gk.z;
  sim.ball.owner = 0; gk.holdUntil = sim.time + 5;
  for (const q of sim.players) if (q.team === 0 && q !== gk) { q.x = 15; q.z = q.slot; }
  assert.ok(sim.activatePowerUp(r, 0));
  assert.equal(sim.ball.owner, 0, "le gardien garde le ballon");
  assert.ok(gk.stunUntil <= sim.time, "gardien non étourdi");
});
