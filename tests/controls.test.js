// Contrôles : touches affichées = touches actives, préréglages sans conflit, libellés selon la disposition.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, EDGE_ACTIONS, KEY_PRESETS, PAD_DEFAULT, resolveBindings, conflicts, codeLabel, DEFAULT_CONTROLS } from "../src/three/controls.js";
import fr from "../src/i18n/fr.js";

test("chaque préréglage couvre toutes les actions, sans touche en double", () => {
  for (const [name, preset] of Object.entries(KEY_PRESETS)) {
    const b = resolveBindings({ preset: name });
    for (const a of ACTIONS) assert.ok(b.keys[a].length >= 1, `${name}: ${a} sans touche`);
    assert.equal(conflicts(b.keys).size, 0, `${name}: conflits ${[...conflicts(b.keys)]}`);
    // la table inverse (utilisée par la saisie en jeu) renvoie exactement l'action affichée
    for (const a of ACTIONS) for (const code of preset[a]) assert.ok(b.keyToActions.get(code).includes(a), `${name}: ${code} → ${a}`);
  }
});

test("réaffectation : la touche affichée est celle qui déclenche l'action", () => {
  const b = resolveBindings({ ...DEFAULT_CONTROLS, keys: { ...KEY_PRESETS.arrows, pass: ["KeyG"], tackle: ["KeyB", "KeyN"] } });
  assert.deepEqual(b.keyToActions.get("KeyG"), ["pass"]);
  assert.equal(b.keyToActions.has("KeyS"), false, "l'ancienne touche ne fait plus rien");
  assert.deepEqual(b.keys.tackle, ["KeyB", "KeyN"]);
  // valeurs hostiles ignorées
  const h = resolveBindings({ keys: { pass: [42, null, "KeyH"] }, pad: { pass: [-1, 99, 2.5, 3] } });
  assert.deepEqual(h.keys.pass, ["KeyH"]); assert.deepEqual(h.pad.pass, [3]);
});

test("libellés AZERTY / QWERTY / QWERTZ des positions physiques", () => {
  const az = c => codeLabel(c, "azerty", "fr"), qw = c => codeLabel(c, "qwerty", "fr"), qz = c => codeLabel(c, "qwertz", "fr");
  assert.deepEqual(["KeyQ", "KeyW", "KeyA", "KeyZ", "KeyS", "KeyD"].map(az), ["A", "Z", "Q", "W", "S", "D"]);
  assert.deepEqual(["KeyQ", "KeyW", "KeyA", "KeyZ"].map(qw), ["Q", "W", "A", "Z"]);
  assert.deepEqual(["KeyY", "KeyZ"].map(qz), ["Z", "Y"]);
  assert.equal(az("Space"), "Espace"); assert.equal(codeLabel("Space", "qwerty", "en"), "Space");
  assert.equal(az("ArrowUp"), "↑");
});

test("pressing maintenu (pas une action ponctuelle) ; plus de tacle glissé séparé ; manette complète", () => {
  assert.ok(ACTIONS.includes("press") && !EDGE_ACTIONS.includes("press"));
  assert.ok(!ACTIONS.includes("slide"));
  for (const a of ACTIONS) if (!["up", "down", "left", "right"].includes(a)) assert.ok(PAD_DEFAULT[a]?.length >= 1, "manette : " + a);
  for (const a of ACTIONS) assert.ok(fr["controls." + a], "libellé : " + a);
});
