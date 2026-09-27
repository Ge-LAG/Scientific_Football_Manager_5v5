// Apparence des avatars : valeurs par défaut, validation des entrées hostiles, libellés fr/en.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPEARANCE_OPTIONS, APPEARANCE_FIELDS, APPEARANCE_LABELS, defaultAppearance, sanitizeAppearance, isValidAppearance,
} from "../shared/data/appearance.js";
import { PLAYERS } from "../shared/data/content.js";
import { EXTRA } from "../shared/data/enrichment.js";

const HEX = /^#[0-9a-f]{6}$/;
const ENUMS = { build: "build", hairStyle: "hairStyle", facialHair: "facialHair", eyes: "eyes", glasses: "glasses", headwear: "headwear", outfit: "outfit", accessory: "accessory" };
const COLORS = ["hairColor", "facialHairColor", "eyeColor", "outfitColor", "shoeColor"];

function assertValid(a, ctx = "") {
  assert.deepEqual(Object.keys(a).sort(), [...APPEARANCE_FIELDS].sort(), ctx);
  for (const [f, opt] of Object.entries(ENUMS)) assert.ok(APPEARANCE_OPTIONS[opt].includes(a[f]), `${ctx} ${f}=${a[f]}`);
  for (const f of COLORS) assert.match(a[f], HEX, `${ctx} ${f}`);
  assert.ok(typeof a.skin === "number" && a.skin >= 0 && a.skin <= 1, `${ctx} skin`);
  assert.ok(isValidAppearance(a), ctx);
}

test("listes d'options conformes au cahier des charges", () => {
  assert.equal(APPEARANCE_OPTIONS.hairStyle.length, 22);
  assert.equal(APPEARANCE_OPTIONS.facialHair.length, 8);
  assert.equal(APPEARANCE_OPTIONS.glasses.length, 7);
  assert.equal(APPEARANCE_OPTIONS.headwear.length, 12);
  assert.equal(APPEARANCE_OPTIONS.outfit.length, 8);
  assert.equal(APPEARANCE_OPTIONS.accessory.length, 9);
  assert.equal(APPEARANCE_OPTIONS.eyes.length, 4);
  assert.equal(APPEARANCE_OPTIONS.build.length, 4);
  for (const m of ["mullet_modern", "mullet_shaved", "mullet_perm", "mullet_classic", "bowl", "grey_side"]) assert.ok(APPEARANCE_OPTIONS.hairStyle.includes(m));
  assert.ok(APPEARANCE_OPTIONS.palettes.hair.length >= 10 && APPEARANCE_OPTIONS.palettes.outfit.length >= 10);
  for (const c of [...APPEARANCE_OPTIONS.palettes.hair, ...APPEARANCE_OPTIONS.palettes.outfit]) assert.match(c, HEX);
  assert.ok(Object.isFrozen(APPEARANCE_OPTIONS) && Object.isFrozen(APPEARANCE_OPTIONS.hairStyle));
});

test("apparence par défaut valide pour les 16 personnages et dérivée du look", () => {
  assert.equal(PLAYERS.length, 16);
  for (const p of PLAYERS) {
    const a = defaultAppearance(p.id);
    assertValid(a, p.id);
    const look = EXTRA[p.id].look;
    assert.equal(a.build, "normal");
    assert.equal(a.eyes, "normal");
    assert.equal(a.skin, look.skin);
    assert.equal(a.hairColor, look.hairColor.toLowerCase());
    assert.equal(a.outfit, look.accessory === "labcoat" ? "scientist" : "footballer", p.id);
    if (look.beard) assert.equal(a.facialHair, "beard");
  }
  const by = id => defaultAppearance(id);
  assert.equal(by("patrice").hairStyle, "grey_side");
  assert.equal(by("guillaume").hairStyle, "short");
  assert.equal(by("guillaume").headwear, "cap");
  assert.equal(by("loic").glasses, "goggles");
  assert.equal(by("roland").headwear, "headset");
  assert.equal(by("romain").headwear, "antenna");
  assert.equal(by("djilani").headwear, "hood");
  assert.equal(by("franck").accessory, "stethoscope");
  assert.equal(by("yacine").accessory, "bowtie");
  assert.equal(by("joffrey").accessory, "tie");
  assert.equal(by("theo").glasses, "round");
  assert.equal(by("david").outfit, "scientist");
  // personnage inconnu : apparence générique valide
  assertValid(defaultAppearance("inconnu"));
  assertValid(defaultAppearance("__proto__"));
  assertValid(defaultAppearance(undefined));
});

test("sanitizeAppearance conserve une apparence valide", () => {
  const a = {
    build: "stocky", skin: 0.8, hairStyle: "mullet_perm", hairColor: "#FF00E5", facialHair: "handlebar", facialHairColor: "#123456",
    eyes: "sleepy", eyeColor: "#00c8d8", glasses: "monocle", headwear: "top_hat", outfit: "renaissance", outfitColor: "#ffd700",
    accessory: "ruff", shoeColor: "#6b4423",
  };
  const s = sanitizeAppearance(a, "roland");
  assert.deepEqual(s, { ...a, hairColor: "#ff00e5" });
  assertValid(s);
  // champ par champ : les valeurs invalides retombent sur le défaut du personnage
  const d = defaultAppearance("roland");
  const m = sanitizeAppearance({ hairStyle: "mullet_shaved", outfit: "pirate", skin: 7, hairColor: "red" }, "roland");
  assert.equal(m.hairStyle, "mullet_shaved");
  assert.equal(m.outfit, d.outfit);
  assert.equal(m.skin, 1);
  assert.equal(m.hairColor, d.hairColor);
});

test("sanitizeAppearance résiste aux entrées hostiles", () => {
  const def = defaultAppearance("djilani");
  const hostile = [
    null, undefined, 42, "hairStyle", [], ["afro"], true, () => {}, Symbol("x"),
    JSON.parse('{"__proto__": {"hairStyle": "afro"}, "constructor": {"prototype": {"x": 1}}}'),
    { hairStyle: "toString" }, { hairStyle: "__proto__" }, { hairStyle: "constructor" }, { outfit: "hasOwnProperty" },
    { hairStyle: "x".repeat(1e6) }, { hairColor: "#fff" }, { hairColor: "#ggghhh" }, { hairColor: "#00ff00 " },
    { hairColor: "#" + "a".repeat(1e5) }, { skin: NaN }, { skin: Infinity }, { skin: "0.5" }, { skin: -3 },
    { build: ["normal"] }, { build: { toString: () => "normal" } }, { eyes: new String("happy") },
    Object.create({ hairStyle: "afro" }),
    new Proxy({}, { get() { throw new Error("piège"); }, has() { throw new Error("piège"); }, getOwnPropertyDescriptor() { throw new Error("piège"); } }),
    { get hairStyle() { throw new Error("getter"); } },
  ];
  for (const h of hostile) {
    let s;
    assert.doesNotThrow(() => { s = sanitizeAppearance(h, "djilani"); });
    assertValid(s, String(typeof h));
  }
  assert.deepEqual(sanitizeAppearance(null, "djilani"), def);
  assert.equal(sanitizeAppearance(Object.create({ hairStyle: "afro" }), "djilani").hairStyle, def.hairStyle, "propriétés héritées ignorées");
  assert.equal(sanitizeAppearance({ skin: -3 }, "djilani").skin, 0);
  // clés inconnues supprimées, pas de pollution de prototype
  const s = sanitizeAppearance({ evil: 1, __proto__: { polluted: true }, hairStyle: "afro" }, "djilani");
  assert.equal(Object.keys(s).length, APPEARANCE_FIELDS.length);
  assert.equal(s.evil, undefined);
  assert.equal({}.polluted, undefined);
  // identifiants de personnage hostiles
  for (const id of [null, 12, {}, "__proto__", "constructor", "x".repeat(1e5)]) assert.doesNotThrow(() => assertValid(sanitizeAppearance({}, id)));
});

test("chaque option et chaque champ ont un libellé fr/en", () => {
  const ok = l => l && typeof l.fr === "string" && l.fr.length > 0 && typeof l.en === "string" && l.en.length > 0;
  for (const f of APPEARANCE_FIELDS) assert.ok(ok(APPEARANCE_LABELS.fields[f]), `champ ${f}`);
  for (const k of Object.keys(APPEARANCE_OPTIONS)) {
    if (k === "palettes") continue;
    for (const v of APPEARANCE_OPTIONS[k]) assert.ok(ok(APPEARANCE_LABELS[k]?.[v]), `${k}.${v}`);
    assert.equal(Object.keys(APPEARANCE_LABELS[k]).length, APPEARANCE_OPTIONS[k].length, `pas de libellé orphelin (${k})`);
  }
  assert.deepEqual(APPEARANCE_LABELS.hairStyle.mullet_perm, { fr: "Mulet permanenté (années 80)", en: "80s perm mullet" });
});
