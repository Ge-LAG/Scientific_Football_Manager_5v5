import { test } from "node:test";
import assert from "node:assert/strict";
import { newSeason, recordDay, standings, nextFixture, roundRobin, endSeason, seasonOutcome, migrateSeason, levelOf, DIVISIONS, ME } from "../shared/manager/season.js";

test("calendrier : chaque club affronte chaque autre exactement une fois", () => {
  const ids = ["a", "b", "c", "d", "e", "f"]; const days = roundRobin(ids); const seen = new Set();
  assert.equal(days.length, 5);
  for (const d of days) { assert.equal(d.length, 3); assert.equal(new Set(d.flat()).size, 6); for (const [x, y] of d) seen.add([x, y].sort().join("-")); }
  assert.equal(seen.size, 15);
});

test("saison : adversaires du plus faible au plus fort, points et classement", () => {
  let s = newSeason(42);
  const first = nextFixture(s).opponent;
  assert.ok(["stagiaires", "apprentis"].includes(first));
  s = recordDay(s, 3, 1);
  assert.equal(s.table[ME].pts, 3); assert.equal(s.table[ME].gf, 3); assert.equal(s.results.length, 3);
  for (let i = 1; i < 5; i++) s = recordDay(s, 1, 1);
  assert.ok(s.done); assert.equal(nextFixture(s), null);
  assert.equal(s.table[ME].p, 5); assert.equal(s.table[ME].pts, 3 + 4);
  const total = standings(s).reduce((n, r) => n + r.p, 0); assert.equal(total, 30);
});

// joue une saison complète avec des buts fixes pour le joueur
const playSeason = (s, gf, ga) => { while (!s.done) s = recordDay(s, gf, ga); return s; };

test("carrière : trois divisions de six clubs, difficulté croissante (A1)", () => {
  assert.equal(DIVISIONS.length, 3);
  assert.deepEqual(DIVISIONS.map(d => d.level), ["stagiaire", "chercheur", "nobel"]);
  const ids = new Set();
  for (const d of DIVISIONS) {
    assert.equal(d.clubs.length, 5);
    assert.ok(d.name.fr && d.name.en);
    for (const c of d.clubs) { assert.ok(c.name.fr && c.name.en && c.crest && /^#[0-9a-fA-F]{6}$/.test(c.colors[0])); assert.ok(!ids.has(c.id)); ids.add(c.id); }
    // 6 lignes au classement : le joueur + 5 clubs virtuels, tous affrontés dans la saison
    const s = newSeason(11, DIVISIONS.indexOf(d));
    assert.equal(Object.keys(s.table).length, 6);
    assert.deepEqual(new Set(s.days.flat(2).filter(x => x !== ME)), new Set(d.clubs.map(c => c.id)));
    assert.equal(levelOf(s), d.level);
  }
});

test("fin de saison : 2 montées, 1 descente (aucune en Paillasse), trophée de l'Institut (A2)", () => {
  // champion en Paillasse : titre + montée
  let s = playSeason(newSeason(42, 0), 5, 0);
  let o = seasonOutcome(s);
  assert.equal(o.rank, 1); assert.ok(o.champion && o.promoted && !o.relegated && !o.trophy);
  assert.equal(o.nextDivision, 1);
  assert.equal(s.career.seasons, 1); assert.equal(s.career.titles, 1); assert.equal(s.career.promotions, 1);
  assert.equal(s.career.history[0].division, 0); assert.equal(s.career.history[0].rank, 1);

  // champion en Laboratoire : montée en Institut
  s = playSeason(newSeason(42, 1), 5, 0);
  o = seasonOutcome(s);
  assert.ok(o.champion && o.promoted); assert.equal(o.nextDivision, 2);

  // champion de l'Institut : trophée, on reste au sommet
  s = playSeason(newSeason(42, 2), 5, 0);
  o = seasonOutcome(s);
  assert.ok(o.champion && o.trophy && !o.promoted); assert.equal(o.nextDivision, 2);
  assert.equal(s.career.trophies, 1);

  // dernier en Laboratoire : descente en Paillasse
  s = playSeason(newSeason(42, 1), 0, 5);
  o = seasonOutcome(s);
  assert.equal(o.rank, 6); assert.ok(o.relegated && !o.promoted); assert.equal(o.nextDivision, 0);
  assert.equal(s.career.relegations, 1);

  // dernier en Paillasse : pas de descente
  s = playSeason(newSeason(42, 0), 0, 5);
  o = seasonOutcome(s);
  assert.equal(o.rank, 6); assert.ok(!o.relegated); assert.equal(o.nextDivision, 0);
});

test("saison suivante enchaînée automatiquement : division obtenue, palmarès conservé (A3)", () => {
  const s = playSeason(newSeason(42, 0), 5, 0);
  const next = endSeason(s, 99);
  assert.equal(next.division, 1); assert.equal(next.day, 0); assert.ok(!next.done);
  assert.equal(next.career, s.career); // palmarès transmis à la saison suivante
  assert.equal(standings(next).every(r => r.p === 0), true);
  assert.ok(nextFixture(next)); // calendrier de Laboratoire prêt
  // une saison non terminée n'enchaîne pas
  const mid = recordDay(newSeason(42, 0), 1, 0);
  assert.equal(endSeason(mid), mid);
  // carrière sur plusieurs saisons : compteurs cumulés
  const s3 = playSeason(endSeason(playSeason(newSeason(42, 0), 5, 0), 99), 0, 5); // montée puis lanterne rouge
  assert.equal(s3.career.seasons, 2); assert.equal(s3.career.titles, 1);
  assert.equal(s3.career.promotions, 1); assert.equal(s3.career.relegations, 1);
  assert.equal(s3.career.history.length, 2);
});

test("migration d'une saison existante sans perte (A4)", () => {
  // objet réel produit par newSeason()/recordDay(), au format d'avant (sans division ni palmarès)
  let old = newSeason(7); old = recordDay(old, 2, 0); old = recordDay(old, 1, 1);
  delete old.division; delete old.career;
  const m = migrateSeason(JSON.parse(JSON.stringify(old)));
  assert.equal(m.id, old.id); assert.equal(m.day, 2); assert.equal(m.division, 0);
  assert.deepEqual(m.results, old.results); assert.deepEqual(m.table, old.table);
  assert.equal(m.career.seasons, 0); assert.ok(Array.isArray(m.career.history));
  // la saison migrée se poursuit normalement et le palmarès se remplit à la fin
  let cont = m; while (!cont.done) cont = recordDay(cont, 4, 0);
  const o = seasonOutcome(cont);
  assert.equal(cont.career.seasons, 1); assert.equal(o.rank, 1); assert.equal(cont.career.titles, 1);
  // saison ancienne déjà terminée : palmarès complété une fois à la migration
  let oldDone = playSeason(newSeason(8), 5, 0); delete oldDone.division; delete oldDone.career;
  const md = migrateSeason(oldDone);
  assert.equal(md.career.seasons, 1); assert.equal(md.career.titles, 1); assert.equal(md.career.history.length, 1);
  // entrées invalides : pas de saison reprise
  assert.equal(migrateSeason(null), null); assert.equal(migrateSeason({}), null); assert.equal(migrateSeason("x"), null);
});
