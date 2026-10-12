// Fidélité des données : personnages, stats, descriptions et power-ups identiques au prototype app.jsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROSTER, POWER_UPS, PLAYERS, pText, puText, narrText, narrKey } from "../shared/data/content.js";
import { STAT_BUDGET } from "../shared/data/stats.js";
import { NARRATION_DOMAINE_FR } from "../shared/data/narration.fr.js";
import { NARRATION_DOMAINE_EN } from "../shared/data/narration.en.js";
import { EXTRA, ARENA_EFFECTS, activeSynergies } from "../shared/data/enrichment.js";
import { makeRng } from "../shared/rng.js";

const src = readFileSync(new URL("../archive/prototype-react/app.jsx", import.meta.url), "utf8");
const block = name => {
  const head = `const ${name} = `;
  const s = src.indexOf(head + "[");
  const e = src.indexOf("\n];", s);
  return Function(`return ${src.slice(s + head.length, e + 2)}`)();
};

test("les 16 personnages sont repris à l'identique du prototype", () => {
  assert.equal(ROSTER.length, 16);
  assert.deepEqual(ROSTER, block("ROSTER"));
});

test("les 16 power-ups sont repris à l'identique du prototype", () => {
  assert.deepEqual(POWER_UPS, block("POWER_UPS"));
});

test("chaque joueur a un power-up, des Réflexes et un effet Arène", () => {
  for (const p of PLAYERS) {
    const orig = ROSTER.find(r => r.id === p.id);
    assert.ok(EXTRA[p.id], p.id);
    assert.ok(p.powerUp && ARENA_EFFECTS[p.powerUp.id], p.id);
    assert.ok(p.attributs["Réflexes"] >= 1 && p.attributs["Réflexes"] <= 99);
    // valeurs d'origine conservées comme référence ; le profil joué est ramené au budget commun
    for (const k of Object.keys(orig.attributs)) assert.equal(p.baseAttributs[k], orig.attributs[k]);
    assert.equal(Object.values(p.attributs).reduce((s, v) => s + v, 0), STAT_BUDGET, p.id);
  }
  assert.equal(new Set(PLAYERS.map(p => p.numero)).size, 16, "numéros uniques");
});

test("traductions anglaises complètes et placeholders conservés", () => {
  for (const p of PLAYERS) {
    const en = pText(p, "en");
    assert.ok(en.bio && en.bio !== p.bio, p.id);
    assert.equal(en.traits.length, p.traits.length);
  }
  for (const pu of POWER_UPS) assert.ok(puText(pu, "en").nom && puText(pu, "en").arena);
  for (const [d, cats] of Object.entries(NARRATION_DOMAINE_FR))
    for (const [c, lines] of Object.entries(cats)) assert.equal(NARRATION_DOMAINE_EN[d][c].length, lines.length, `${d}/${c}`);
});

test("narration par clé : même ligne dans les deux langues", () => {
  const rng = makeRng(3);
  const k = narrKey("but_marque", "Informatique", rng);
  assert.match(narrText(k, { joueur: "Roland" }, "fr"), /Roland/);
  assert.match(narrText(k, { joueur: "Roland" }, "en"), /Roland/);
  assert.ok(narrText(narrKey("arret", "Informatique", rng), {}, "en").length > 5, "repli sur la narration générique");
});

test("synergies de labo", () => {
  const pick = ids => ids.map(id => PLAYERS.find(p => p.id === id));
  assert.ok(activeSynergies(pick(["roland", "henry", "lucien", "djilani", "patrice"])).some(s => s.id === "reseau"));
  assert.ok(activeSynergies(pick(["loic", "david", "theo", "patrice", "guillaume"])).some(s => s.id === "pluri"));
});
