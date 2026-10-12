// Tests des défis du jour (W-038) : génération déterministe, évaluation, série.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generate, evaluate, dailyFor, applyMatch, streakOf, prevDay, DOMAINS } from "../shared/challenges.js";

const arenaWin = over => ({ mode: "arena", win: true, mvp: false, goals: 0, assists: 0, saves: 0, tackles: 0, powerups: 0, domaines: ["Informatique"], scorerDomaines: [], ...over });
const managerWin = over => ({ mode: "manager", win: true, goalsFor: 3, onTarget: 6, possession: 60, strategy: "pressing", bot: "chercheur", domaines: ["Informatique", "Physique et Chimie", "Biologie et Médecine"], scorerDomaines: ["Physique et Chimie"], ...over });

test("même date ⇒ mêmes trois défis, un par mode", () => {
  const a = generate("2026-10-12"), b = generate("2026-10-12");
  assert.deepEqual(a, b);
  assert.deepEqual(a.map(d => d.mode), ["arena", "manager", "science"]);
  assert.ok(a.every(d => d.id.startsWith("2026-10-12:")));
});

test("dates différentes ⇒ défis variés sur 7 jours", () => {
  const kinds = new Set(), payloads = new Set();
  for (let i = 1; i <= 7; i++) {
    const defs = generate(`2026-10-${String(i).padStart(2, "0")}`);
    defs.forEach(d => { kinds.add(d.kind); payloads.add(JSON.stringify(d)); });
  }
  assert.ok(kinds.size >= 6, `seulement ${kinds.size} kinds sur 7 jours`);
  assert.ok(payloads.size >= 12, `seulement ${payloads.size} défis distincts sur 21`);
});

test("évaluation Arène : buts, arrêts, victoire, MVP", () => {
  const defs = generate("2026-10-12");
  const g = { id: "x", mode: "arena", kind: "a_goals", n: 2 };
  assert.equal(evaluate(g, arenaWin({ goals: 2 })), 2);
  assert.equal(evaluate(g, arenaWin({ goals: 5 })), 5);
  assert.equal(evaluate(g, managerWin()), 0); // mauvais mode : ignoré
  assert.equal(evaluate({ kind: "a_win", n: 1 }, arenaWin()), 1);
  assert.equal(evaluate({ kind: "a_win", n: 1 }, arenaWin({ win: false })), 0);
  assert.equal(evaluate({ kind: "a_mvp", n: 1 }, arenaWin({ mvp: true })), 1);
  assert.equal(evaluate({ kind: "a_saves", n: 3 }, arenaWin({ saves: 4 })), 4);
  assert.equal(evaluate({ kind: "a_tackles", n: 3 }, arenaWin({ tackles: 2 })), 2);
  assert.equal(evaluate({ kind: "a_assists", n: 1 }, arenaWin({ assists: 1 })), 1);
  assert.equal(evaluate({ kind: "a_powerups", n: 2 }, arenaWin({ powerups: 3 })), 3);
  assert.ok(defs[0].kind.startsWith("a_"));
});

test("évaluation Manager : victoire, buts, possession, stratégie, bot", () => {
  assert.equal(evaluate({ kind: "m_win", n: 1 }, managerWin()), 1);
  assert.equal(evaluate({ kind: "m_win", n: 1 }, managerWin({ win: false })), 0);
  assert.equal(evaluate({ kind: "m_goals", n: 3 }, managerWin()), 3);
  assert.equal(evaluate({ kind: "m_shots", n: 5 }, managerWin()), 6);
  assert.equal(evaluate({ kind: "m_possession", n: 55 }, managerWin()), 55);
  assert.equal(evaluate({ kind: "m_possession", n: 55 }, managerWin({ possession: 40 })), 40);
  assert.equal(evaluate({ kind: "m_strategy_win", n: 1, strategy: "pressing" }, managerWin()), 1);
  assert.equal(evaluate({ kind: "m_strategy_win", n: 1, strategy: "counter" }, managerWin()), 0);
  assert.equal(evaluate({ kind: "m_beat_bot", n: 1, level: "chercheur" }, managerWin()), 1);
  assert.equal(evaluate({ kind: "m_beat_bot", n: 1, level: "nobel" }, managerWin()), 0);
  assert.equal(evaluate({ kind: "m_beat_bot", n: 1, level: "chercheur" }, managerWin({ bot: null })), 0); // en ligne : pas de bot
});

test("défis scientifiques : domaine aligné, but par domaine, 3 domaines", () => {
  const phys = { kind: "sci_domain_match", n: 1, domaine: "Physique" };
  assert.equal(evaluate(phys, arenaWin({ domaines: ["Physique et Mécanique"] })), 1); // fragment couvert
  assert.equal(evaluate(phys, managerWin()), 1);
  assert.equal(evaluate(phys, arenaWin({ domaines: ["Informatique"] })), 0);
  const score = { kind: "sci_domain_score", n: 1, domaine: "Biologie" };
  assert.equal(evaluate(score, managerWin({ scorerDomaines: ["Biologie et Médecine"] })), 1);
  assert.equal(evaluate(score, arenaWin({ scorerDomaines: ["Informatique"] })), 0);
  const trio = { kind: "sci_domains3_win", n: 1 };
  assert.equal(evaluate(trio, managerWin()), 1); // Informatique + Physique/Chimie + Biologie/Médecine = 5 mots
  assert.equal(evaluate(trio, managerWin({ domaines: ["Informatique", "Informatique"] })), 0); // un seul domaine
  assert.equal(evaluate(trio, arenaWin()), 0); // non mesurable en Arène
  assert.ok(DOMAINS.every(d => typeof d === "string" && d.length > 2));
});

test("applyMatch : progression cumulée et cochage", () => {
  const st = dailyFor("2026-10-12", null);
  const def = st.defs[0];
  const fake = { ...def, kind: "a_goals", n: 3 };
  st.defs[0] = fake;
  let s = applyMatch(st, arenaWin({ goals: 1 }));
  assert.deepEqual(s.progress[fake.id], { n: 1, done: false });
  s = applyMatch(s, arenaWin({ goals: 2 }));
  assert.deepEqual(s.progress[fake.id], { n: 2, done: false }); // max cumulatif
  s = applyMatch(s, arenaWin({ goals: 4 }));
  assert.deepEqual(s.progress[fake.id], { n: 3, done: true }); // plafonné à l'objectif
  const again = applyMatch(s, arenaWin({ goals: 4 }));
  assert.equal(again, s); // idempotent : même état renvoyé
});

test("série : jour réussi enchaîne, jour manqué remet à zéro", () => {
  const winDay = st => { const s = { ...st, defs: [{ id: st.date + ":a", mode: "arena", kind: "a_win", n: 1 }] }; return applyMatch(s, arenaWin()); };
  let st = winDay(dailyFor("2026-10-10", null));
  assert.equal(streakOf(st, "2026-10-10"), 1);
  st = winDay(dailyFor("2026-10-11", st));
  assert.equal(streakOf(st, "2026-10-11"), 2);
  st = dailyFor("2026-10-12", st); // jour sans défi réussi (encore jouable)
  assert.equal(streakOf(st, "2026-10-12"), 2); // la série de la veille est encore affichée
  st = winDay(st);
  assert.equal(streakOf(st, "2026-10-12"), 3);
  st = dailyFor("2026-10-14", st); // trou d'un jour
  assert.equal(streakOf(st, "2026-10-14"), 0); // série terminée
  st = winDay(st);
  assert.equal(streakOf(st, "2026-10-14"), 1); // nouvelle série
});

test("prevDay : veille avec changement de mois et d'année", () => {
  assert.equal(prevDay("2026-10-12"), "2026-10-11");
  assert.equal(prevDay("2026-03-01"), "2026-02-28");
  assert.equal(prevDay("2026-01-01"), "2025-12-31");
});
