// Localisation : parité FR/EN, clés utilisées présentes, paramètres identiques, français par défaut.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fr from "../src/i18n/fr.js";
import en from "../src/i18n/en.js";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const files = dir => readdirSync(dir).flatMap(f => { const p = path.join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.jsx?$/.test(f) ? [p] : []; });
const code = files(SRC).filter(f => !f.includes(`${path.sep}i18n${path.sep}`)).map(f => readFileSync(f, "utf8")).join("\n");

test("mêmes clés en français et en anglais", () => {
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
});

test("mêmes paramètres nommés dans les deux langues", () => {
  const params = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
  for (const k of Object.keys(fr)) assert.equal(params(en[k]), params(fr[k]), k);
});

test("toutes les clés statiques utilisées dans le code existent", () => {
  const used = new Set([...code.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)].map(m => m[1]));
  for (const m of code.matchAll(/\bt\(\s*[^")`][^)]{0,160}/g)) for (const k of m[0].matchAll(/"([a-z]+\.[a-zA-Z0-9_.]+)"/g)) used.add(k[1]);
  const missing = [...used].filter(k => !k.endsWith(".") && !(k in fr));
  assert.deepEqual(missing, []);
});

test("familles de clés dynamiques complètes", () => {
  const families = {
    "role.": ["gk", "def", "mid", "att"], "phase.": ["lobby", "draft", "setup", "playing", "ended"], "report.result.": ["W", "D", "L"], "settings.q.": ["low", "medium", "high"],
    "report.s.": ["possession", "xg", "shots", "onTarget", "passes", "tackles", "saves", "fouls", "cards", "powerups", "subs"],
    "controls.": ["move", "camera", "sprint", "shoot", "pass", "lob", "tackle", "power", "cam", "menu"],
    "evtype.": ["GOAL", "MISS", "SAVE", "TACKLE", "INTERCEPT", "FOUL", "YELLOW", "RED", "DRIBBLE", "PASS", "POWERUP", "SUB", "STRATEGY", "POST", "PENALTY", "BLOCK", "HALFTIME", "SECOND_HALF", "END", "RETURN", "FIREWALL", "SHOT"],
    "error.": ["PSEUDO_INVALID", "PSEUDO_RESERVED", "PSEUDO_TAKEN", "PASSWORD_INVALID", "BAD_CREDENTIALS", "NOT_FOUND", "RATE_LIMITED", "NETWORK", "UNAUTHORIZED", "BAD_INPUT", "BAD_JSON", "SERVER_ERROR", "ROOM_NOT_FOUND", "BAD_MODE", "SERVER_FULL", "BAD_LINEUP", "PAYLOAD_TOO_LARGE", "METHOD_NOT_ALLOWED"],
  };
  for (const [prefix, ids] of Object.entries(families)) for (const id of ids) assert.ok(fr[prefix + id], prefix + id);
  for (const k of ["move", "camera", "sprint", "shoot", "pass", "lob", "tackle", "power", "cam", "menu"]) assert.ok(fr[`controls.${k}.kb`], k);
  for (const i of [1, 2, 3, 4]) { assert.ok(fr[`help.q${i}`] && fr[`help.a${i}`] && fr[`home.f${i}.title`] && fr[`home.f${i}.desc`]); }
  for (const i of [1, 2, 3, 4, 5]) assert.ok(fr[`help.manager.s${i}`] && fr[`help.arena.s${i}`]);
});

test("le français est la langue par défaut (aucune détection du navigateur)", () => {
  const src = readFileSync(path.join(SRC, "i18n", "index.jsx"), "utf8");
  assert.match(src, /: "fr"/);
  assert.doesNotMatch(src, /navigator\.language/);
});
