// Non-régression sécurité : entrées hostiles venant des clients.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Lobby } from "../shared/lobby.js";
import { ManagerEngine } from "../shared/manager/engine.js";
import { getPlayer, FORMATIONS, STRATEGY_BY_ID } from "../shared/data/content.js";
import { openDb } from "../server/db.js";
import { createAuth } from "../server/auth.js";

const client = id => { const msgs = []; return { id, pseudo: id, guestId: "g" + id.padEnd(8, "0"), send: m => msgs.push(m), msgs }; };

test("mode de salle « constructor » refusé, rien ne plante à la déconnexion", () => {
  const lobby = new Lobby(); const c = client("x"); lobby.connect(c);
  for (const mode of ["constructor", "__proto__", "toString"]) {
    lobby.handle("x", { t: "room.create", mode }); c.lastCreate = 0;
    lobby.clients.get("x").lastCreate = 0;
    lobby.handle("x", { t: "room.quick", mode }); lobby.clients.get("x").lastCreate = 0;
  }
  assert.equal(lobby.rooms.size, 0);
  assert.ok(c.msgs.every(m => m.t === "error"));
  assert.doesNotThrow(() => lobby.publicRooms());
  assert.doesNotThrow(() => lobby.disconnect("x"));
  lobby.shutdown();
});

test("place « __proto__ » dans l'Arène : ignorée, Array.prototype intact", () => {
  const lobby = new Lobby(); const c = client("y"); lobby.connect(c);
  lobby.handle("y", { t: "room.create", mode: "arena", opts: {} });
  for (const slot of ["__proto__", "constructor", -1, 99, 1.5, "3"]) lobby.handle("y", { t: "a.slot", slot });
  assert.equal(Object.keys(Array.prototype).length, 0);
  assert.equal([].memberId, undefined);
  lobby.handle("y", { t: "a.char", charId: "constructor" });
  lobby.shutdown();
});

test("tables de contenu sans prototype ; commandes hostiles sans effet", () => {
  assert.equal(getPlayer("constructor"), null);
  assert.equal(FORMATIONS.constructor, undefined);
  assert.equal(STRATEGY_BY_ID.__proto__, undefined);
  const A = { lineup: ["djilani", "lucien", "thibault", "joffrey", "loic"], bench: [] };
  const B = { lineup: ["patrice", "roland", "theo", "aurelien", "yacine"], bench: [] };
  const e = new ManagerEngine({ home: A, away: B, seed: 1, halfTicks: 200, halftimeTicks: 20 });
  for (const cmd of [{ type: "strategy", id: "constructor" }, { type: "formation", id: "__proto__" }, { type: "powerup", pid: "constructor" }, { type: "sub", out: "constructor", in: "__proto__" }])
    assert.equal(e.applyCommand({ side: "home", ...cmd }), false);
  while (e.phase !== "halftime") e.tick();
  assert.equal(e.applyCommand({ side: "home", type: "talk", id: "constructor" }), false);
  for (let i = 0; i < 100; i++) e.command("home", { type: "strategy", id: "attack" });
  assert.ok(e.queue.length <= 64, "file de commandes bornée");
  while (e.tick());
  assert.equal(e.phase, "ended");
});

test("changement de mot de passe : les sessions existantes sont révocables", async () => {
  const db = await openDb(":memory:"); const auth = createAuth(db);
  const { token, user } = await auth.register("Curie", "radium123");
  assert.ok(db.getSession(token));
  await auth.changePassword(user.id, "radium123", "polonium456");
  db.deleteUserSessions(user.id);
  assert.equal(db.getSession(token), null);
  await db.close();
});
