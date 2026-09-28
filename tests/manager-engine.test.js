import { test } from "node:test";
import assert from "node:assert/strict";
import { ManagerEngine, simulateMatch, MATCHUP } from "../shared/manager/engine.js";
import { BotManager, buildBotSquad, autoLineup, bestResponse } from "../shared/manager/ai.js";
import { STRATEGIES, PLAYERS } from "../shared/data/content.js";
import { makeRng } from "../shared/rng.js";

const A = { name: "Alpha", lineup: ["djilani", "lucien", "thibault", "joffrey", "loic"], bench: ["mederic", "guillaume", "henry"], formation: "2-2", strategy: "equilibre" };
const B = { name: "Beta", lineup: ["patrice", "roland", "theo", "aurelien", "yacine"], bench: ["romain", "franck", "david"], formation: "2-2", strategy: "equilibre" };
const H = 400; // mi-temps courtes pour des tests rapides

test("déterminisme : même graine + mêmes commandes ⇒ même match", () => {
  const run = () => {
    const e = new ManagerEngine({ home: A, away: B, seed: 42, halfTicks: H });
    let i = 0;
    while (e.tick()) if (++i === 150) e.command("home", { type: "powerup", pid: "loic" });
    return e;
  };
  const a = run(), b = run();
  assert.deepEqual(a.report().teams, b.report().teams);
  assert.deepEqual(a.events.map(e => e.type + e.t), b.events.map(e => e.type + e.t));
});

test("match complet : deux mi-temps, fin, notes et homme du match", () => {
  const e = simulateMatch({ home: A, away: B, halfTicks: H }, { seed: 7 });
  assert.equal(e.phase, "ended");
  assert.ok(e.events.some(x => x.type === "HALFTIME"));
  const r = e.report();
  assert.ok(r.players.every(p => p.rating >= 3 && p.rating <= 10));
  assert.ok(r.mvp);
  assert.equal(r.teams.home.stats.possession + r.teams.away.stats.possession, 100);
});

test("une équipe bien construite gagne nettement plus souvent et le score reste réaliste", () => {
  // bien construite : vrai gardien, défenseurs, créateur, finisseur ; mal construite : postes à contre-emploi
  const strong = { name: "S", lineup: ["djilani", "lucien", "henry", "joffrey", "loic"], bench: [], formation: "2-2", strategy: "equilibre" };
  const weak = { name: "W", lineup: ["mederic", "yacine", "franck", "roland", "henry"].map(x => (x === "henry" ? "patrice" : x)), bench: [], formation: "2-2", strategy: "equilibre" };
  let sw = 0, ww = 0, goals = 0; const N = 30;
  for (let i = 0; i < N; i++) {
    const swap = i % 2;
    const r = simulateMatch({ home: swap ? weak : strong, away: swap ? strong : weak }, { seed: 100 + i }).report();
    const s = swap ? r.teams.away.score : r.teams.home.score, w = swap ? r.teams.home.score : r.teams.away.score;
    if (s > w) sw++; else if (w > s) ww++;
    goals += s + w;
  }
  assert.ok(sw > ww * 1.5, `fort ${sw} / faible ${ww}`);
  const avg = goals / N;
  assert.ok(avg >= 2 && avg <= 9, `moyenne ${avg}`);
});

test("les stratégies d'origine et les 16 power-ups agissent sur la simulation", () => {
  const e = new ManagerEngine({ home: A, away: B, seed: 1, halfTicks: H });
  e.tick();
  const before = e.attr("theo", "Tacle");
  e.command("away", { type: "strategy", id: "pressing" }); e.tick();
  assert.equal(e.attr("theo", "Tacle"), Math.min(99, before + 6));
  for (const p of PLAYERS) {
    const home = { ...A, lineup: [p.id, ...A.lineup.filter(x => x !== p.id)].slice(0, 5), bench: [] };
    const away = { ...B, lineup: [...B.lineup, "david", "franck"].filter(x => !home.lineup.includes(x)).slice(0, 5), bench: [] };
    const eng = new ManagerEngine({ home, away, seed: 2, halfTicks: H });
    eng.tick();
    const k = Object.keys(p.powerUp.buffs)[0];
    const v0 = eng.attr(p.id, k);
    assert.ok(eng.activatePowerUp("home", p.id), p.id);
    assert.equal(eng.attr(p.id, k), Math.max(1, Math.min(99, v0 + p.powerUp.buffs[k])), p.id);
    assert.equal(eng.activatePowerUp("home", p.id), false, "cooldown " + p.id);
  }
  assert.equal(Object.keys(MATCHUP).length, STRATEGIES.length);
});

test("remplacements : limite de 3, joueur entrant frais", () => {
  const e = new ManagerEngine({ home: A, away: B, seed: 3, halfTicks: H });
  for (let i = 0; i < 100; i++) e.tick();
  assert.ok(e.substitute("home", "loic", "mederic"));
  assert.equal(e.pl.mederic.onPitch, true);
  assert.equal(e.pl.loic.onPitch, false);
  assert.equal(e.pl.mederic.stamina, 100);
  assert.ok(e.substitute("home", "joffrey", "guillaume"));
  assert.ok(e.substitute("home", "lucien", "henry"));
  assert.equal(e.teams.home.subsLeft, 0);
  assert.equal(e.substitute("home", "thibault", "loic"), false);
});

test("manager virtuel : commandes valides et Prix Nobel > Stagiaire", () => {
  let nobel = 0, intern = 0;
  for (let i = 0; i < 14; i++) {
    const rng = makeRng(500 + i);
    const n = buildBotSquad(rng, [], "nobel");
    const s = buildBotSquad(rng, [...n.lineup, ...n.bench], "stagiaire");
    const swap = i % 2;
    const home = { name: "H", ...(swap ? s : n) }, away = { name: "A", ...(swap ? n : s) };
    const e = new ManagerEngine({ home, away, seed: 900 + i, halfTicks: 600 });
    const bots = { home: new BotManager("home", swap ? "stagiaire" : "nobel", rng), away: new BotManager("away", swap ? "nobel" : "stagiaire", rng) };
    while (e.tick()) for (const side of ["home", "away"]) for (const c of bots[side].think(e)) assert.ok(e.applyCommand({ side, ...c }), JSON.stringify(c));
    const nScore = swap ? e.teams.away.score : e.teams.home.score, sScore = swap ? e.teams.home.score : e.teams.away.score;
    if (nScore > sScore) nobel++; else if (sScore > nScore) intern++;
  }
  assert.ok(nobel > intern, `Nobel ${nobel} / Stagiaire ${intern}`);
});

test("composition automatique et meilleure réponse tactique", () => {
  const { lineup, bench } = autoLineup(["loic", "djilani", "theo", "david", "patrice", "joffrey", "mederic"], "2-2");
  assert.equal(lineup[0], "djilani");
  assert.equal(lineup.length, 5);
  assert.equal(bench.length, 2);
  assert.equal(bestResponse("attack"), "park_bus");
});

test("causerie de mi-temps : seulement à la mi-temps, une fois, effets appliqués", () => {
  const e = new ManagerEngine({ home: A, away: B, seed: 4, halfTicks: 200, halftimeTicks: 30 });
  assert.equal(e.applyCommand({ side: "home", type: "talk", id: "brainstorm" }), false, "refusée en première période");
  while (e.phase !== "halftime") e.tick();
  const v = e.attr("thibault", "Vision");
  const st = e.pl.loic.stamina;
  assert.ok(e.applyCommand({ side: "home", type: "talk", id: "brainstorm" }));
  assert.equal(e.attr("thibault", "Vision"), Math.min(99, v + 3));
  assert.equal(e.applyCommand({ side: "home", type: "talk", id: "coffee" }), false, "une seule causerie");
  assert.ok(e.applyCommand({ side: "away", type: "talk", id: "coffee" }));
  assert.ok(e.pl.yacine.stamina >= Math.min(100, st) - 20);
  assert.ok(e.events.some(x => x.type === "TALK"));
});
