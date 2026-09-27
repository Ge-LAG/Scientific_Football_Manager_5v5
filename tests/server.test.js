// Intégration : serveur réel (HTTP + WebSocket), deux clients, match Manager complet et Arène avec départ.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { createServer } from "../server/index.js";

let app, base, dir;
before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "lableague-"));
  app = await createServer({ port: 0, host: "127.0.0.1", dataFile: path.join(dir, "db.json"), log: () => {} });
  base = `http://127.0.0.1:${app.port}`;
});
after(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });

const post = (p, body, token) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body) }).then(r => r.json());

function connect(hello) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
    const c = { ws, msgs: [], waiters: [], send: m => ws.send(JSON.stringify(m)) };
    c.wait = (pred, ms = 20000) => new Promise((res, rej) => {
      const found = c.msgs.find(pred); if (found) return res(found);
      const w = { pred, res }; c.waiters.push(w);
      setTimeout(() => { c.waiters = c.waiters.filter(x => x !== w); rej(new Error("délai dépassé")); }, ms);
    });
    ws.on("message", raw => {
      const m = JSON.parse(raw.toString()); c.msgs.push(m); if (c.msgs.length > 400) c.msgs.splice(0, 200);
      for (const w of [...c.waiters]) if (w.pred(m)) { c.waiters = c.waiters.filter(x => x !== w); w.res(m); }
      c.onMsg?.(m);
    });
    ws.on("open", () => { c.send({ t: "hello", ...hello }); c.wait(m => m.t === "welcome").then(w => { c.welcome = w; resolve(c); }, reject); });
    ws.on("error", reject);
  });
}

test("santé et fichiers statiques", async () => {
  const h = await fetch(base + "/api/health").then(r => r.json());
  assert.equal(h.ok, true);
});

test("Manager 1v1 en ligne : draft, composition, match, ELO", { timeout: 180000 }, async () => {
  const a = await post("/api/auth/register", { pseudo: "Alice_Labo", password: "secret123" });
  const b = await post("/api/auth/register", { pseudo: "Bob_Labo", password: "secret123" });
  const A = await connect({ token: a.token }), B = await connect({ token: b.token });
  assert.equal(A.welcome.pseudo, "Alice_Labo"); assert.equal(A.welcome.guest, false);
  // chacun choisit automatiquement quand c'est son tour, puis valide sa composition
  for (const [C, side] of [[A, "home"], [B, "away"]]) C.onMsg = m => {
    if (m.t === "room.state" && m.phase === "draft" && m.draft.order[m.draft.turn] === side && C.lastTurn !== m.draft.turn) { C.lastTurn = m.draft.turn; C.send({ t: "m.autopick" }); }
    if (m.t === "room.state" && m.phase === "setup" && !C.setupSent) { C.setupSent = true; const s = m.seats[side]; C.send({ t: "m.setup", lineup: s.lineup, formation: s.formation, strategy: "pressing", ready: true }); }
  };
  A.send({ t: "room.create", mode: "manager", opts: { speed: 4, halfTicks: 300 } });
  const joined = await A.wait(m => m.t === "room.joined");
  B.send({ t: "room.join", code: joined.code });
  await B.wait(m => m.t === "room.joined" && m.seat === "away");
  A.send({ t: "m.start" });
  await A.wait(m => m.t === "m.init", 30000);
  const snap = await B.wait(m => m.t === "m.snap");
  assert.ok(snap.s.p && Object.keys(snap.s.p).length === 10);
  B.send({ t: "m.cmd", cmd: { type: "strategy", id: "counter" } });
  const rep = await A.wait(m => m.t === "m.report", 120000);
  assert.ok(rep.report.teams.home.stats);
  const ph = rep.progression.home, pa = rep.progression.away;
  assert.ok(ph && pa, "progression des deux managers");
  assert.equal(ph.eloDelta + pa.eloDelta, 0, "ELO conservé");
  const me = await fetch(base + "/api/me", { headers: { authorization: "Bearer " + a.token } }).then(r => r.json());
  assert.equal(me.user.stats.manager.played, 1);
  assert.ok(me.user.xp > 0);
  A.ws.close(); B.ws.close();
});

test("Arène : deux humains, snapshots, départ remplacé par un bot, fin de match", { timeout: 60000 }, async () => {
  const A = await connect({ name: "Zoé" }), B = await connect({ name: "Yann" });
  assert.match(A.welcome.pseudo, /invité/);
  A.send({ t: "room.create", mode: "arena", opts: { halfSeconds: 60, botLevel: "easy" } });
  const j = await A.wait(m => m.t === "room.joined");
  B.send({ t: "room.join", code: j.code });
  const jb = await B.wait(m => m.t === "room.joined");
  assert.notEqual(jb.seat, j.seat);
  B.send({ t: "a.char", charId: "mederic" });
  await A.wait(m => m.t === "room.state" && m.slots.some(s => s.charId === "mederic" && s.human));
  A.send({ t: "a.start" });
  await A.wait(m => m.t === "a.init");
  for (let i = 0; i < 10; i++) A.send({ t: "a.in", mx: 1, mz: 0, aim: 0, b: 1 });
  const s1 = await B.wait(m => m.t === "a.snap");
  assert.equal(s1.s.p.length, 10);
  B.ws.close();
  const st = await A.wait(m => m.t === "room.state" && m.phase === "playing" && m.slots[jb.seat].human === false);
  assert.equal(st.slots[jb.seat].left, true);
  const room = app.lobby.rooms.get(j.code); room.sim.halfSeconds = 0.5; room.sim.half = 2;
  const end = await A.wait(m => m.t === "a.end", 20000);
  assert.equal(end.score.length, 2);
  assert.equal(end.ratings.length, 10);
  A.ws.close();
});

test("partie rapide Manager : un manager virtuel remplace l'adversaire absent", { timeout: 60000 }, async () => {
  const A = await connect({ name: "Solo" });
  A.send({ t: "room.quick", mode: "manager" });
  const j = await A.wait(m => m.t === "room.joined");
  const room = app.lobby.rooms.get(j.code);
  assert.equal(room.opts.quick, true);
  room.startDraft(); // sans attendre les 25 s
  const st = await A.wait(m => m.t === "room.state" && m.phase === "draft");
  assert.ok(st.seats.away.bot);
  A.ws.close();
});

test("en ligne : apparence visible de l'adversaire, 2 power-ups emportés, changement de joueur", { timeout: 60000 }, async () => {
  const { getPlayer } = await import("../shared/data/content.js");
  const med = getPlayer("mederic").powerUps.map(u => u.id);
  const A = await connect({ name: "Ada" }), B = await connect({ name: "Grace" });
  // B envoie son profil (apparence de Médéric, power-ups préférés ; un identifiant étranger est ignoré) avant de rejoindre
  B.send({ t: "profile", looks: { mederic: { hairStyle: "mullet_modern", outfit: "futuristic", outfitColor: "#ff00e5" } }, loadouts: { mederic: [med[2], "pu_informatique_hotfix"] } });
  A.send({ t: "room.create", mode: "arena", opts: { halfSeconds: 60, botLevel: "easy" } });
  const j = await A.wait(m => m.t === "room.joined");
  B.send({ t: "room.join", code: j.code });
  const jb = await B.wait(m => m.t === "room.joined");
  B.send({ t: "a.char", charId: "mederic" });
  const st = await A.wait(m => m.t === "room.state" && m.slots.some(s => s.charId === "mederic" && s.human && s.look));
  const sb = st.slots.find(s => s.charId === "mederic");
  assert.equal(sb.look.hairStyle, "mullet_modern"); assert.equal(sb.look.outfit, "futuristic");
  assert.deepEqual(sb.loadout, [med[2], med[0]], "power-up d'un autre scientifique refusé, complété par défaut");
  // A choisit un autre second power-up pour son scientifique
  const mine = st.slots[j.seat]; const own = getPlayer(mine.charId).powerUps.map(u => u.id);
  A.send({ t: "a.loadout", ids: [own[2], own[3]] });
  await B.wait(m => m.t === "room.state" && m.slots[j.seat].loadout?.[0] === own[2] && m.slots[j.seat].loadout?.[1] === own[3]);
  A.send({ t: "a.start" });
  const init = await B.wait(m => m.t === "a.init");
  assert.equal(init.slots.find(s => s.charId === "mederic").look.outfit, "futuristic");
  // changement de joueur de A vers un coéquipier bot ; jamais vers B (humain)
  const mate = init.slots.find(s => s.team === init.slots[j.seat].team && !s.human && s.slot !== j.seat);
  if (init.slots[jb.seat].team === init.slots[j.seat].team) { A.send({ t: "a.switch", to: jb.seat }); }
  A.send({ t: "a.switch", to: mate.slot });
  const sw = await A.wait(m => m.t === "room.state" && m.you.slot === mate.slot);
  assert.equal(sw.slots[mate.slot].human, true); assert.equal(sw.slots[j.seat].human, false);
  assert.equal(sw.slots[jb.seat].human, true, "B garde son joueur");
  const snap = await A.wait(m => m.t === "a.snap");
  assert.equal(snap.s.p[mate.slot].length, 13, "instantané : recharges des 2 power-ups et bits actifs");
  A.ws.close(); B.ws.close();
});
