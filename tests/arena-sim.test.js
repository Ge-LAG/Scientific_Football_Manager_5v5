import { test } from "node:test";
import assert from "node:assert/strict";
import { ArenaSim, statOf, FIELD } from "../shared/action/sim.js";
import { ArenaBrain } from "../shared/action/bot.js";

const IDS = ["djilani", "lucien", "thibault", "joffrey", "loic", "patrice", "roland", "theo", "aurelien", "mederic"];
const newSim = (o = {}) => new ArenaSim({ slots: IDS.map(c => ({ charId: c })), seed: 5, halfSeconds: 60, ...o });
const runUntil = (sim, pred, max = 300) => { for (let i = 0; i < max && !pred(); i++) sim.step(); };

test("un tir puissant et cadré compte un but ; le ballon rebondit sur les parois", () => {
  const sim = newSim(); sim.phase = "play";
  const loic = sim.players[4]; const keeper = sim.players[5];
  keeper.x = 10; keeper.z = 10;                       // gardien hors de sa cage
  for (const p of sim.players) if (p !== loic && p !== keeper) { p.x = -15; p.z = p.slot - 5; }
  loic.x = 12; loic.z = 0; loic.facing = 0; sim.ball.owner = loic.slot;
  sim.shoot(loic, 0, 0.3);
  runUntil(sim, () => sim.score[0] > 0, 90);
  assert.equal(sim.score[0], 1);
  assert.ok(sim.events.some(e => e.type === "GOAL" && e.slot === 4));

  const s2 = newSim(); s2.phase = "play"; s2.ball.owner = -1;
  Object.assign(s2.ball, { x: 0, y: 0.11, z: 10, vx: 0, vy: 0, vz: 12 });
  for (const p of s2.players) { p.x = -18; p.z = -10; }
  runUntil(s2, () => s2.ball.vz < 0, 30);
  assert.ok(s2.ball.vz < 0 && s2.ball.z <= FIELD.HZ, "rebond sur la paroi latérale");
});

test("Médéric (Vitesse 90) distance Patrice (Vitesse 44) sur 20 m", () => {
  const sim = newSim(); sim.phase = "play"; sim.ball.owner = -1; sim.ball.x = 0; sim.ball.z = 11;
  const m = sim.players[9], p = sim.players[5];
  m.x = -10; m.z = 3; p.x = -10; p.z = -3;
  let tm = null, tp = null;
  for (let i = 0; i < 200 && (tm === null || tp === null); i++) {
    sim.setInput(9, { mx: 1, mz: 0, sprint: true }); sim.setInput(5, { mx: 1, mz: 0, sprint: true });
    for (let s = 0; s < 10; s++) if (s !== 9 && s !== 5) sim.setInput(s, {});
    sim.step();
    if (tm === null && m.x >= 10) tm = sim.time;
    if (tp === null && p.x >= 10) tp = sim.time;
  }
  assert.ok(tm !== null && tp !== null);
  assert.ok(tm < tp - 0.3, `Médéric ${tm?.toFixed(2)} s / Patrice ${tp?.toFixed(2)} s`);
});

test("power-up : bonus, effet d'équipe et temps de recharge", () => {
  const sim = newSim(); sim.phase = "play";
  const franck = { charId: "franck" };
  sim.setSlot(3, franck);
  const f = sim.players[3];
  for (const p of sim.players) if (p.team === 0) p.stamina = 40;
  const fin = statOf(f, "Finition", sim);
  assert.ok(sim.activatePowerUp(f));
  assert.ok(statOf(f, "Finition", sim) > fin, "bonus de Finition");
  assert.ok(sim.players.filter(p => p.team === 0).every(p => p.stamina >= 60), "Protocole de Triage : endurance d'équipe");
  assert.equal(sim.activatePowerUp(f), false, "recharge");
  assert.ok(sim.events.some(e => e.type === "POWERUP" && e.pu === f.char.powerUp.id));
});

test("tacle : un gros tacleur prend plus souvent le ballon à un mauvais dribbleur", () => {
  const rate = (tackler, carrier) => {
    let won = 0;
    for (let i = 0; i < 120; i++) {
      const sim = new ArenaSim({ slots: IDS.map((c, k) => ({ charId: k === 1 ? tackler : k === 6 ? carrier : c })), seed: 100 + i, halfSeconds: 60 });
      sim.phase = "play";
      const t = sim.players[1], c = sim.players[6];
      c.x = 0; c.z = 0; t.x = -1; t.z = 0; t.facing = 0; sim.ball.owner = c.slot;
      sim.tackle(t, { sprint: false });
      if (sim.ball.owner === t.slot) won++;
    }
    return won;
  };
  const strong = rate("djilani", "patrice"); // Tacle 90 vs Dribble 52
  const weak = rate("loic", "david");        // Tacle 46 vs Dribble 92
  assert.ok(strong > weak + 25, `${strong} vs ${weak}`);
});

test("match complet de bots : des buts, pas de blocage, fin propre", () => {
  const sim = newSim({ halfSeconds: 90, seed: 11 }); const brain = new ArenaBrain(sim, "normal");
  let last = 0, key = "", stall = 0;
  while (true) {
    brain.update();
    if (!sim.step()) break;
    const k = sim.ball.owner + ":" + Math.round(sim.ball.x) + ":" + Math.round(sim.ball.z);
    if (k !== key) { key = k; last = sim.time; }
    if (sim.phase === "play" && sim.time - last > 10) { stall++; last = sim.time; }
  }
  assert.equal(sim.phase, "ended");
  assert.ok(sim.score[0] + sim.score[1] >= 1, "au moins un but");
  assert.equal(stall, 0);
  assert.ok(sim.events.some(e => e.type === "HALFTIME"));
  const snap = sim.snapshot();
  assert.equal(snap.p.length, 10);
  assert.ok(Number.isFinite(snap.b[0]));
});

test("un humain remplace un bot en conservant sa position", () => {
  const sim = newSim(); for (let i = 0; i < 60; i++) sim.step();
  const before = { x: sim.players[2].x, z: sim.players[2].z };
  sim.setSlot(2, { charId: "thibault", name: "Guillaume_L", human: true });
  assert.equal(sim.players[2].human, true);
  assert.equal(sim.players[2].name, "Guillaume_L");
  assert.deepEqual({ x: sim.players[2].x, z: sim.players[2].z }, before);
});

test("entrées humaines : tir chargé au relâchement, passe au front de bouton", () => {
  const sim = new ArenaSim({ slots: IDS.map((c, i) => ({ charId: c, human: i === 4 })), seed: 9, halfSeconds: 60 });
  sim.phase = "play";
  const me = sim.players[4]; sim.ball.owner = 4; me.x = 5; me.z = 0;
  for (let i = 0; i < 12; i++) { sim.setInput(4, { shoot: true, aim: 0 }); sim.step(); }
  assert.ok(me.charge > 0.3, "charge en cours");
  assert.equal(sim.ball.owner, 4);
  sim.setInput(4, { shoot: false, aim: 0 }); sim.step();
  assert.equal(sim.ball.owner, -1, "le ballon part au relâchement");
  assert.equal(sim.stats[4].shots, 1);

  const s2 = new ArenaSim({ slots: IDS.map((c, i) => ({ charId: c, human: i === 2 })), seed: 9, halfSeconds: 60 });
  s2.phase = "play"; const p = s2.players[2]; s2.ball.owner = 2; p.x = -5; p.z = -4;
  const mate = s2.players[3]; mate.x = -5; mate.z = 4;
  s2.setInput(2, { pass: true, aim: Math.PI / 2 }); s2.step();
  assert.equal(s2.stats[2].passes, 1);
  for (let i = 0; i < 40 && s2.ball.owner !== 3; i++) { s2.setInput(2, {}); s2.step(); }
  assert.equal(s2.ball.owner, 3, "le coéquipier visé reçoit la passe");
});

test("salle Arène : un front de bouton reçu entre deux ticks n'est pas perdu", async () => {
  const { ArenaRoom, BTN } = await import("../shared/rooms/arenaRoom.js");
  const room = new ArenaRoom({ code: "TEST1", opts: { halfSeconds: 60 } });
  const sent = [];
  const client = { id: "c1", pseudo: "Testeur", guestId: "g1234567", send: m => sent.push(m) };
  const slot = room.join(client);
  room.onInput(slot, { mx: 0, mz: 0, aim: 0, b: BTN.pass });
  room.onInput(slot, { mx: 1, mz: 0, aim: 0, b: 0 }); // le relâchement arrive avant le tick
  assert.ok(room.inputs[slot].edge & BTN.pass);
  room.close();
});

test("geste technique (feinte de corps) : tacles bien plus difficiles pendant l'esquive", () => {
  let won = 0, wonSkill = 0;
  for (let i = 0; i < 80; i++) {
    for (const skill of [false, true]) {
      const sim = new ArenaSim({ slots: IDS.map((c, k) => ({ charId: k === 6 ? "david" : c, human: k === 6 })), seed: 300 + i, halfSeconds: 60 });
      sim.phase = "play";
      const d = sim.players[6], t = sim.players[1];
      d.x = 0; d.z = 0; d.facing = 0; t.x = 1; t.z = 0; sim.ball.owner = 6;
      if (skill) { sim.setInput(6, { skill: true }); sim.step(); assert.ok(d.dodgeUntil > sim.time); }
      sim.tackle(t, {});
      if (sim.ball.owner === 1) { if (skill) wonSkill++; else won++; }
    }
  }
  assert.ok(wonSkill < won * 0.6, `sans crochet ${won}, avec crochet ${wonSkill}`);
});

test("appel de balle : le bot porteur sert le coéquipier humain qui appelle", async () => {
  const { ArenaBrain } = await import("../shared/action/bot.js");
  let served = 0;
  for (let i = 0; i < 10; i++) {
    const sim = new ArenaSim({ slots: IDS.map((c, k) => ({ charId: c, human: k === 3 })), seed: 700 + i, halfSeconds: 60 });
    const brain = new ArenaBrain(sim, "normal"); sim.phase = "play";
    const carrier = sim.players[2], me = sim.players[3];
    carrier.x = -8; carrier.z = -3; me.x = -4; me.z = 3; sim.ball.owner = 2;
    for (const p of sim.players) if (p.team === 1) { p.x = 15; p.z = p.slot - 7; }
    sim.setInput(3, { call: true }); sim.step();
    for (let t = 0; t < 60 && sim.ball.owner !== 3; t++) { brain.update(); sim.setInput(3, {}); sim.step(); }
    if (sim.ball.owner === 3) served++;
  }
  assert.ok(served >= 7, `servi ${served}/10`);
});

test("gardien humain inactif : placement automatique vers sa cage", async () => {
  const { ArenaBrain } = await import("../shared/action/bot.js");
  const sim = new ArenaSim({ slots: IDS.map((c, k) => ({ charId: c, human: k === 0 })), seed: 5, halfSeconds: 60 });
  const brain = new ArenaBrain(sim, "normal"); sim.phase = "play";
  const gk = sim.players[0]; gk.x = -8; gk.z = 6; sim.ball.owner = 9;
  for (let i = 0; i < 90; i++) { sim.setInput(0, {}); brain.update(); sim.step(); }
  assert.ok(gk.x < -15 && Math.abs(gk.z) < 3, `gardien en ${gk.x.toFixed(1)}, ${gk.z.toFixed(1)}`);
});
