// W-035 : vote « Revanche » — câblage client/serveur (messages a.rematch / m.rematch,
// état rematch diffusé, bouton visible uniquement en ligne) et traductions FR/EN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fr from "../src/i18n/fr.js";
import en from "../src/i18n/en.js";

const arena = readFileSync(new URL("../shared/rooms/arenaRoom.js", import.meta.url), "utf8");
const manager = readFileSync(new URL("../shared/rooms/managerRoom.js", import.meta.url), "utf8");
const base = readFileSync(new URL("../shared/rooms/base.js", import.meta.url), "utf8");
const arenaGame = readFileSync(new URL("../src/pages/arena/ArenaGame.jsx", import.meta.url), "utf8");
const report = readFileSync(new URL("../src/pages/manager/ReportView.jsx", import.meta.url), "utf8");
const rematch = readFileSync(new URL("../src/ui/Rematch.jsx", import.meta.url), "utf8");

test("serveur : a.rematch / m.rematch câblés sur le vote commun, état rematch diffusé", () => {
  assert.match(arena, /case "a\.rematch": this\.voteRematch\(clientId\)/);
  assert.match(manager, /case "m\.rematch": this\.voteRematch\(clientId\)/);
  assert.match(base, /this\.rematch\.votes\.add\(BaseRoom\.identity\(m\.client\)\)/, "une voix par identité");
  assert.match(base, /this\.phase !== "ended"/, "vote ignoré hors phase de fin");
  assert.match(base, /if \(this\.rematch\.code \|\| !this\.lobby\) return/, "une seule salle de revanche");
  assert.match(arena, /rematch: this\.rematchState\(clientId\)/, "état rematch dans stateFor (Arène)");
  assert.match(manager, /rematch: this\.rematchState\(clientId\)/, "état rematch dans stateFor (Manager)");
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
