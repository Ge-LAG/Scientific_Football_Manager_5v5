// W-035 : vote « Revanche » — câblage client/serveur (messages a.rematch / m.rematch,
// état rematch diffusé, bouton visible uniquement en ligne) et traductions FR/EN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fr from "../src/i18n/fr.js";
import en from "../src/i18n/en.js";
import { ArenaRoom } from "../shared/rooms/arenaRoom.js";
import { ManagerRoom } from "../shared/rooms/managerRoom.js";

const arenaGame = readFileSync(new URL("../src/pages/arena/ArenaGame.jsx", import.meta.url), "utf8");
const report = readFileSync(new URL("../src/pages/manager/ReportView.jsx", import.meta.url), "utf8");
const rematch = readFileSync(new URL("../src/ui/Rematch.jsx", import.meta.url), "utf8");

// comportement (et non texte du code) : l'audit du sprint 7 a montré qu'un test par motif de source casse au moindre remaniement
const client = (id, extra = {}) => { const msgs = []; return { id, pseudo: id, guestId: "g" + id.padEnd(8, "0"), send: m => msgs.push(m), msgs, ...extra }; };
const last = (c, t) => [...c.msgs].reverse().find(m => m.t === t);
const fakeLobby = () => ({ created: [], clients: new Map(), createRoom(mode, opts) { const r = { code: "NEW" + this.created.length, mode, opts }; this.created.push(r); return r; }, enter() {}, scheduleClose() {}, closeRoom() {} });

test("serveur : a.rematch / m.rematch → une voix par identité, en fin de match seulement, une seule salle, état diffusé", () => {
  for (const [Room, t] of [[ArenaRoom, "a.rematch"], [ManagerRoom, "m.rematch"]]) {
    const lobby = fakeLobby(); const room = new Room({ code: "R1", opts: {}, lobby });
    const a = client("a1"), b = client("b1");
    room.join(a); room.join(b);
    room.handle("a1", { t }); assert.equal(room.rematch.votes.size, 0, `${t} : vote ignoré hors phase de fin`);
    room.phase = "ended";
    room.handle("a1", { t }); room.handle("a1", { t });
    assert.equal(room.rematch.votes.size, 1, `${t} : une voix par identité`);
    assert.equal(lobby.created.length, 0, `${t} : pas de salle tant que tous n'ont pas voté`);
    assert.equal(last(b, "room.state").rematch.votes, 1, `${t} : compteur diffusé aux autres`);
    room.handle("b1", { t }); room.handle("b1", { t });
    assert.equal(lobby.created.length, 1, `${t} : une seule salle de revanche`);
    assert.equal(last(a, "room.state").rematch.code, "NEW0", `${t} : code diffusé`);
    room.close();
  }
  // délai de la revanche : 15 s après le premier vote (décision de Guillaume du 12/10), annoncé en FR/EN
  assert.equal(new ArenaRoom({ code: "D1", opts: {} }).rematchDelayMs, 15000);
  assert.equal(new ManagerRoom({ code: "D2", opts: {} }).rematchDelayMs, 15000);
  assert.match(fr["rematch.hint"], /15 s/); assert.match(en["rematch.hint"], /15 s/);
});

test("client : bouton visible uniquement en ligne, vote et jonction par code", () => {
  assert.match(arenaGame, /game\.joined\?\.kind === "online" \? room\.rematch : null/, "pas de revanche en solo local (Arène)");
  assert.match(arenaGame, /game\.send\(\{ t: "a\.rematch" \}\)/);
  assert.match(report, /game\.joined\?\.kind === "online"/, "revanche en ligne seulement (Manager)");
  assert.match(report, /game\.send\(\{ t: "m\.rematch" \}\)/);
  assert.match(rematch, /onJoin\(rematch\.code\)/, "les non-votants rejoignent par le code affiché");
  assert.match(rematch, /disabled=\{rematch\.you\}/, "un votant ne revote pas");
});

test("traductions FR/EN des libellés de revanche", () => {
  for (const k of ["rematch.vote", "rematch.voted", "rematch.count", "rematch.ready", "rematch.join", "rematch.hint"]) {
    assert.ok(fr[k], `fr.${k} manquant`); assert.ok(en[k], `en.${k} manquant`);
  }
  assert.equal(fr["rematch.vote"], "Revanche"); assert.equal(en["rematch.vote"], "Rematch");
  assert.match(fr["rematch.ready"], /\{code\}/); assert.match(en["rematch.ready"], /\{code\}/);
});
