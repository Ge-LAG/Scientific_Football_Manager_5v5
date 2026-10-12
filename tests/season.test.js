import { test } from "node:test";
import assert from "node:assert/strict";
import { newSeason, recordDay, standings, nextFixture, roundRobin, ME } from "../shared/manager/season.js";

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
