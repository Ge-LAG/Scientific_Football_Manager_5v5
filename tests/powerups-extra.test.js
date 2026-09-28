// Power-ups additionnels : 3 par joueur, schéma identique aux originaux + effet Arène + anglais.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROSTER, POWER_UPS } from "../shared/data/roster.js";
import { ARENA_EFFECTS } from "../shared/data/enrichment.js";
import { ATTRS_EN } from "../shared/data/roster.en.js";
import { POWER_UPS_EXTRA } from "../shared/data/powerups.extra.js";

const ATTRS = ["Finition", "Tacle", "Dribble", "Endurance", "Force", "Vitesse", "Vision", "Sang-froid"];
const TYPES = ["attaque", "défense", "contrôle", "mental"];
// Plages [min, max] des paramètres requis par type d'effet Arène (absent = pas de paramètre requis).
const ARENA_KINDS = {
  tackleImmune: {}, perfectPass: {}, perfectShot: {}, noStaminaDrain: {}, sureTackle: {},
  tackleRange: { value: [1.4, 1.7] },
  ballGlue: { value: [1.1, 1.15] },
  teamStamina: { value: [15, 30] },
  slowAura: { value: [0.7, 0.85], radius: [6, 10] },
  speedBoost: { value: [1.15, 1.3] },
  passBoost: { value: [1.2, 1.4] },
  powerShot: { value: [1.25, 1.4] },
  firewall: { radius: [2.5, 3.5] },
  freeSprint: { value: [1.05, 1.12] },
  teamAura: { value: [4, 8] },
  // Nouveaux effets (implémentation côté sim à la charge de l'intégrateur).
  dash: { value: [7, 10] },
  shockwave: { value: [0.6, 1.2], radius: [3, 5] },
  magnet: { radius: [4, 7] },
  freezeNearest: { value: [1, 2], radius: [5, 8] },
  curlShot: { value: [6, 12] },
  teamSpeed: { value: [1.08, 1.15] },
  keeperWall: { value: [1.3, 1.6] },
};
const NEW_KINDS = ["dash", "shockwave", "magnet", "freezeNearest", "curlShot", "teamSpeed", "keeperWall"];
const inRange = (v, [lo, hi]) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const isInt = v => Number.isInteger(v);

test("48 power-ups additionnels, exactement 3 par joueur du ROSTER", () => {
  assert.equal(POWER_UPS_EXTRA.length, 48);
  for (const p of ROSTER) {
    assert.equal(POWER_UPS_EXTRA.filter(pu => pu.joueur === p.id).length, 3, `3 power-ups pour ${p.id}`);
  }
  const ids = new Set(ROSTER.map(p => p.id));
  for (const pu of POWER_UPS_EXTRA) assert.ok(ids.has(pu.joueur), `joueur inconnu : ${pu.joueur}`);
});

test("ids uniques, bien formés et sans collision avec les originaux", () => {
  const seen = new Set(POWER_UPS.map(pu => pu.id));
  for (const pu of POWER_UPS_EXTRA) {
    assert.match(pu.id, /^pu_[a-z0-9_]+$/, pu.id);
    assert.ok(!seen.has(pu.id), `id en double ou en collision : ${pu.id}`);
    assert.equal(ARENA_EFFECTS[pu.id], undefined, `collision avec ARENA_EFFECTS : ${pu.id}`);
    seen.add(pu.id);
  }
  const noms = POWER_UPS_EXTRA.map(pu => pu.nom).concat(POWER_UPS.map(pu => pu.nom));
  assert.equal(new Set(noms).size, noms.length, "noms FR uniques");
  const nomsEn = POWER_UPS_EXTRA.map(pu => pu.en.nom);
  assert.equal(new Set(nomsEn).size, nomsEn.length, "noms EN uniques");
});

test("domaine identique à celui du joueur, type valide", () => {
  for (const pu of POWER_UPS_EXTRA) {
    const p = ROSTER.find(r => r.id === pu.joueur);
    assert.equal(pu.domaine, p.domaine, pu.id);
    assert.ok(TYPES.includes(pu.type), `${pu.id} type ${pu.type}`);
  }
});

test("paramètres Manager : cooldown, durée, buffs, soin et malus adverses dans les plages", () => {
  let debuffs = 0;
  for (const pu of POWER_UPS_EXTRA) {
    assert.ok(isInt(pu.cooldown) && inRange(pu.cooldown, [380, 650]), `${pu.id} cooldown`);
    assert.ok(isInt(pu.duree) && inRange(pu.duree, [25, 55]), `${pu.id} duree`);
    assert.equal(typeof pu.effets, "string"); assert.ok(pu.effets.trim().length > 0, `${pu.id} effets`);
    const entries = Object.entries(pu.buffs);
    assert.ok(entries.length >= 2, `${pu.id} au moins 2 buffs`);
    let pos = 0; let neg = 0;
    for (const [k, v] of entries) {
      assert.ok(ATTRS.includes(k), `${pu.id} attribut ${k}`);
      assert.ok(isInt(v) && v !== 0, `${pu.id} ${k}=${v}`);
      if (v > 0) { pos += v; assert.ok(v <= 14, `${pu.id} ${k} bonus trop fort`); } else { neg++; assert.ok(v >= -12 && v <= -4, `${pu.id} ${k} malus`); }
    }
    assert.ok(pos >= 14 && pos <= 22, `${pu.id} total bonus ${pos}`);
    assert.ok(neg <= 1, `${pu.id} au plus un malus`);
    // Sans malus : il faut une contrepartie (malus adverse / soin compensé par un bonus plus faible).
    if (neg === 0) assert.ok(pu.debuffOpponents || pu.healStamina, `${pu.id} sans contrepartie`);
    if (pu.healStamina !== undefined) assert.ok(isInt(pu.healStamina) && inRange(pu.healStamina, [10, 25]), `${pu.id} healStamina`);
    if (pu.debuffOpponents !== undefined) {
      debuffs++;
      for (const [k, v] of Object.entries(pu.debuffOpponents)) {
        assert.ok(ATTRS.includes(k), `${pu.id} debuff ${k}`);
        assert.ok(isInt(v) && v >= -8 && v <= -4, `${pu.id} debuff ${k}=${v}`);
      }
    }
    // Chaque bonus positif figure dans le résumé FR et EN.
    for (const [k, v] of entries) if (v > 0) {
      assert.ok(pu.effets.includes(`+${v} ${k}`), `${pu.id} effets FR mentionne +${v} ${k}`);
      assert.ok(pu.en.effets.includes(`+${v} ${ATTRS_EN[k]}`), `${pu.id} effets EN mentionne +${v} ${ATTRS_EN[k]}`);
    }
  }
  assert.ok(debuffs <= 6, `malus adverses rares (${debuffs})`);
});

test("effet Arène : type autorisé, durée, recharge et paramètres dans les plages, textes FR/EN", () => {
  for (const pu of POWER_UPS_EXTRA) {
    const a = pu.arena;
    assert.ok(a && typeof a === "object", `${pu.id} arena`);
    const spec = ARENA_KINDS[a.effect];
    assert.ok(spec, `${pu.id} effet inconnu ${a.effect}`);
    assert.ok(inRange(a.duration, [5, 12]), `${pu.id} arena.duration`);
    assert.ok(inRange(a.cooldown, [38, 70]), `${pu.id} arena.cooldown`);
    for (const key of ["value", "radius"]) {
      if (spec[key]) assert.ok(inRange(a[key], spec[key]), `${pu.id} arena.${key}=${a[key]} hors ${spec[key]}`);
      else if (a[key] !== undefined) assert.ok(typeof a[key] === "number" && a[key] > 0, `${pu.id} arena.${key}`);
    }
    for (const lang of ["fr", "en"]) assert.ok(typeof a[lang] === "string" && a[lang].trim().length > 10, `${pu.id} arena.${lang}`);
  }
});

test("traduction anglaise présente (nom + effets)", () => {
  for (const pu of POWER_UPS_EXTRA) {
    assert.ok(pu.en && typeof pu.en.nom === "string" && pu.en.nom.trim().length > 0, `${pu.id} en.nom`);
    assert.ok(typeof pu.en.effets === "string" && pu.en.effets.trim().length > 0, `${pu.id} en.effets`);
  }
});

test("variété : nouveaux effets Arène ~1/3, rôles variés, 4 effets distincts par joueur", () => {
  const nNew = POWER_UPS_EXTRA.filter(pu => NEW_KINDS.includes(pu.arena.effect)).length;
  assert.ok(nNew >= 12 && nNew <= 22, `nouveaux effets : ${nNew}`);
  for (const k of NEW_KINDS) assert.ok(POWER_UPS_EXTRA.some(pu => pu.arena.effect === k), `effet ${k} utilisé`);
  for (const t of TYPES) assert.ok(POWER_UPS_EXTRA.filter(pu => pu.type === t).length >= 6, `type ${t} représenté`);
  for (const p of ROSTER) {
    const orig = POWER_UPS.find(pu => pu.joueur === p.id);
    const kinds = [ARENA_EFFECTS[orig.id].effect, ...POWER_UPS_EXTRA.filter(pu => pu.joueur === p.id).map(pu => pu.arena.effect)];
    assert.equal(new Set(kinds).size, 4, `${p.id} : 4 effets Arène distincts (${kinds})`);
  }
});

test("équilibrage : aucun nouveau power-up ne domine strictement un original de même effet Arène", () => {
  const net = pu => Object.values(pu.buffs).reduce((s, v) => s + v, 0) + (pu.healStamina || 0) / 2;
  for (const pu of POWER_UPS_EXTRA) {
    for (const o of POWER_UPS) {
      const oa = ARENA_EFFECTS[o.id];
      if (oa.effect !== pu.arena.effect) continue;
      const better = (x, y, higherIsBetter) => (higherIsBetter ? x >= y : x <= y);
      const dominates = net(pu) >= net(o) && pu.cooldown <= o.cooldown && pu.duree >= o.duree
        && pu.arena.duration >= oa.duration && pu.arena.cooldown <= oa.cooldown
        && (oa.value === undefined || pu.arena.value === undefined || better(pu.arena.value, oa.value, oa.effect !== "slowAura"))
        && (oa.radius === undefined || pu.arena.radius === undefined || pu.arena.radius >= oa.radius);
      assert.ok(!dominates, `${pu.id} domine strictement ${o.id}`);
    }
  }
});
