// Profil textuel adapté à la répartition libre des points : forces / faiblesses, affinité par poste,
// archétype, bio d'origine ou générée (déterministe, FR + EN, vocabulaire du domaine scientifique).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYERS, pText, withStats } from "../shared/data/content.js";
import { STAT_KEYS, STAT_BUDGET, STAT_MIN, STAT_MAX, fitToBudget, isValidStats } from "../shared/data/stats.js";
import { makeRng } from "../shared/rng.js";
import {
  strengthsOf, weaknessesOf, roleFit, idealRole, ROLES, ROLE_LABELS, ARCHETYPES, ARCHETYPE_BY_ID, archetypeOf,
  composeBio, profileText, isCloseToDefault, DOMAIN_VOCAB, BIO_TEMPLATES, fillTemplate,
} from "../shared/data/profileText.js";

const toStats = arr => Object.fromEntries(STAT_KEYS.map((k, i) => [k, arr[i]]));
// Répartition « typée » : stats boostées, le reste bas, ramenée au budget exact.
const shaped = (boost, low = 45) => toStats(fitToBudget(STAT_KEYS.map(k => boost[k] ?? low)));

// Répartitions aléatoires valides (entiers, bornes, total exact) de formes variées.
function randomStats(rng) {
  if (rng() < 0.5) {
    const g = 0.3 + rng() * 3.7;
    return toStats(fitToBudget(STAT_KEYS.map(() => STAT_MIN + (STAT_MAX - STAT_MIN) * Math.pow(rng(), g))));
  }
  const v = STAT_KEYS.map(() => STAT_MIN);
  let rest = STAT_BUDGET - STAT_MIN * STAT_KEYS.length;
  while (rest > 0) {
    const i = rng.int(STAT_KEYS.length);
    const add = Math.min(rest, STAT_MAX - v[i], 1 + rng.int(40));
    v[i] += add; rest -= add;
  }
  return toStats(v);
}

const posteRoles = poste => {
  const s = poste.toLowerCase(), out = [];
  if (s.includes("gardien")) out.push("gk");
  if (s.includes("défenseur")) out.push("def");
  if (s.includes("milieu")) out.push("mid");
  if (s.includes("attaquant") || s.includes("ailier")) out.push("att");
  if (s.includes("ailier")) out.push("mid");            // en 5 contre 5, l'ailier est un rôle hybride (milieu offensif)
  if (s.includes("milieu défensif")) out.push("def");   // poste hybride : les deux lectures sont justes
  if (s.includes("milieu offensif")) out.push("att");
  return out;
};

// Lieux au masculin / pluriel : « de le … » / « à le … » doivent être contractés (du / au / des / aux).
const LABS_FR = Object.values(DOMAIN_VOCAB).map(v => v.lab.fr).filter(l => /^les? /.test(l));

// Contrôles de qualité d'une phrase ou d'un texte généré.
function assertCleanSentence(txt, lang, ctx) {
  assert.ok(typeof txt === "string" && txt.length > 10, `${ctx} : phrase vide`);
  for (const bad of ["{", "}", "undefined", "NaN", "null", "[object"]) assert.ok(!txt.includes(bad), `${ctx} : « ${bad} » dans « ${txt} »`);
  assert.ok(!/ {2}|\s[,.]|\.\.|d' |qu' /.test(txt), `${ctx} : ponctuation/espaces : ${txt}`);
  assert.ok(/^[A-ZÀ-Ý]/.test(txt), `${ctx} : majuscule initiale`);
  assert.ok(/[.!]$/.test(txt), `${ctx} : ponctuation finale`);
  if (lang === "fr") {
    assert.ok(!/(?<!\p{L})(de|que) [aeiouéèêàâîôû]/iu.test(txt), `${ctx} : élision manquante : ${txt}`);
    for (const lab of LABS_FR) assert.ok(!txt.includes("de " + lab) && !txt.includes("à " + lab), `${ctx} : contraction manquante (${lab})`);
    assert.ok(!/[“”]/.test(txt), `${ctx} : guillemets anglais en FR`);
  } else {
    assert.ok(!/(?<!\p{L})a [aeioAEIO]/u.test(txt), `${ctx} : « a » devant voyelle : ${txt}`);
    assert.ok(!/«|»/.test(txt), `${ctx} : guillemets français en EN`);
  }
}
function assertCleanText(txt, lang, ctx) {
  assert.ok(typeof txt === "string" && txt.length > 60, `${ctx} : bio vide ou trop courte`);
  assertCleanSentence(txt, lang, ctx);
  const sentences = txt.split(/[.!?](?:\s|$)/).filter(x => x.trim());
  assert.ok(sentences.length >= 3 && sentences.length <= 6, `${ctx} : ${sentences.length} phrases`);
}

// ── Forces / faiblesses ──────────────────────────────────────
test("forces et faiblesses : ordre déterministe, égalités départagées par STAT_KEYS, jamais en double", () => {
  const flat = toStats(STAT_KEYS.map(() => STAT_BUDGET / STAT_KEYS.length));
  assert.deepEqual(strengthsOf(flat), STAT_KEYS.slice(0, 3));
  const w = weaknessesOf(flat);
  assert.equal(w.length, 2);
  for (const k of w) assert.ok(!strengthsOf(flat).includes(k), "une stat ne peut être force et faiblesse");
  const s = shaped({ Finition: 95, Vitesse: 90, Vision: 30, Tacle: 28 });
  assert.deepEqual(strengthsOf(s, 2), ["Finition", "Vitesse"]);
  assert.deepEqual(new Set(weaknessesOf(s, 2)), new Set(["Tacle", "Vision"]));
  assert.equal(strengthsOf(s, 1).length, 1);
  assert.equal(strengthsOf(s, 9).length, 9);
  const rng = makeRng(11);
  for (let i = 0; i < 300; i++) {
    const r = randomStats(rng);
    const f = strengthsOf(r, 3), fb = weaknessesOf(r, 2);
    for (const k of fb) assert.ok(!f.includes(k));
    for (let j = 1; j < f.length; j++) assert.ok(r[f[j - 1]] >= r[f[j]]);
  }
});

test("Réflexes : aptitude de gardien en force, jamais « faiblesse » d'un joueur de champ", () => {
  const striker = shaped({ Finition: 95, Vitesse: 92, "Réflexes": 25 }, 62);
  assert.notEqual(idealRole(striker), "gk");
  assert.ok(!weaknessesOf(striker, 3).includes("Réflexes"));
  const keeper = shaped({ "Réflexes": 95, "Sang-froid": 90, Force: 85, Finition: 25 }, 55);
  assert.equal(idealRole(keeper), "gk");
  assert.equal(strengthsOf(keeper, 1)[0], "Réflexes");
  // profil de gardien : les 9 stats sont candidates aux faiblesses ; joueur de champ : 8 (Réflexes exclus)
  assert.equal(weaknessesOf(keeper, 9).length, 9);
  assert.equal(weaknessesOf(striker, 9).length, 8);
  for (const p of PLAYERS) assert.ok(!weaknessesOf(p.attributs, 2).includes("Réflexes") || idealRole(p.attributs) === "gk", p.id);
});

// ── Affinité par poste ───────────────────────────────────────
test("roleFit : 4 postes, pourcentages entiers 0-100 triés, 100 = répartition idéale du poste", () => {
  const rng = makeRng(5);
  for (let i = 0; i < 300; i++) {
    const s = randomStats(rng);
    const r = roleFit(s);
    assert.deepEqual(r.map(x => x.role).sort(), [...ROLES].sort());
    for (const x of r) assert.ok(Number.isInteger(x.pct) && x.pct >= 0 && x.pct <= 100);
    for (let j = 1; j < r.length; j++) assert.ok(r[j - 1].pct >= r[j].pct);
    assert.equal(idealRole(s), r[0].role);
  }
  const idealKeeper = toStats(fitToBudget(STAT_KEYS.map(k => (["Réflexes", "Sang-froid", "Force"].includes(k) ? STAT_MAX : 50))));
  assert.equal(roleFit(idealKeeper)[0].role, "gk");
  assert.equal(roleFit(idealKeeper)[0].pct, 100);
  for (const r of ROLES) assert.ok(ROLE_LABELS[r].fr && ROLE_LABELS[r].en);
});

test("le meilleur poste du profil par défaut correspond au poste d'origine (16 scientifiques)", () => {
  for (const p of PLAYERS) {
    const best = roleFit(p.attributs)[0].role;
    assert.ok(posteRoles(p.poste).includes(best), `${p.id} (${p.poste}) → ${best}`);
  }
  // postes simples : correspondance exacte
  const exact = { roland: "def", henry: "def", lucien: "def", patrice: "def", thibault: "mid", romain: "mid",
    loic: "att", david: "att", franck: "att", yacine: "att", mederic: "att" };
  for (const [id, role] of Object.entries(exact)) assert.equal(idealRole(PLAYERS.find(p => p.id === id).attributs), role, id);
});

test("répartitions typées : le poste idéal tombe au bon endroit", () => {
  const cases = [
    [{ "Réflexes": 95, "Sang-froid": 85 }, "gk"], [{ Tacle: 95, Force: 92 }, "def"], [{ Tacle: 92, Dribble: 88 }, "def"],
    [{ Endurance: 95, Tacle: 85, Dribble: 80 }, "mid"], [{ Vision: 95, Dribble: 92 }, "mid"], [{ Endurance: 95 }, "mid"],
    [{ Finition: 95, "Sang-froid": 88 }, "att"], [{ Finition: 95, Vitesse: 88 }, "att"], [{ Dribble: 95, Vitesse: 90 }, "att"],
    [{ Vitesse: 95 }, "att"], [{ Force: 95, Finition: 88 }, "att"],
  ];
  for (const [boost, role] of cases) assert.equal(idealRole(shaped(boost, 55)), role, JSON.stringify(boost));
});

// ── Archétypes ───────────────────────────────────────────────
test("archétypes : au moins 12, complets, identifiants uniques", () => {
  assert.ok(ARCHETYPES.length >= 12);
  assert.equal(new Set(ARCHETYPES.map(a => a.id)).size, ARCHETYPES.length);
  for (const a of ARCHETYPES) {
    assert.ok(a.id && a.icon && a.fr && a.en && a.desc?.fr && a.desc?.en && a.alias?.fr && a.alias?.en, a.id);
    assert.ok(Array.isArray(a.roles) && a.roles.every(r => ROLES.includes(r)), a.id);
    assert.equal(ARCHETYPE_BY_ID[a.id], a);
  }
  assert.equal(ARCHETYPE_BY_ID.constructor, undefined, "table sans prototype");
});

test("archetypeOf et roleFit sont déterministes, ne modifient pas l'entrée, et restent cohérents entre eux", () => {
  const rng = makeRng(42);
  const seen = new Set();
  for (let i = 0; i < 1500; i++) {
    const s = randomStats(rng), copy = { ...s };
    const a1 = archetypeOf(s), a2 = archetypeOf({ ...s });
    assert.equal(a1, a2);
    assert.deepEqual(roleFit(s), roleFit({ ...s }));
    assert.deepEqual(s, copy);
    assert.ok(a1.roles.includes(idealRole(s)), `${a1.id} incohérent avec ${idealRole(s)}`);
    seen.add(a1.id);
  }
  assert.ok(seen.size >= 12, `variété des archétypes : ${[...seen].join(", ")}`);
});

test("archétypes typés : la forme de la répartition donne l'archétype attendu", () => {
  const cases = [
    [{ "Réflexes": 95, "Sang-froid": 88 }, "gardien"], [{ "Réflexes": 95, Dribble: 88 }, "gardien_volant"],
    [{ Tacle: 95, Force: 90 }, "muraille"], [{ Tacle: 95, Vision: 88 }, "sentinelle"], [{ Tacle: 92, Dribble: 88 }, "libero"],
    [{ Tacle: 90, Endurance: 95 }, "recuperateur"], [{ Endurance: 95, Vitesse: 88 }, "presseur"], [{ Endurance: 95 }, "box_to_box"],
    [{ Vision: 95, Dribble: 88 }, "meneur"], [{ Vision: 95, "Sang-froid": 88 }, "metronome"], [{ Dribble: 95, Vitesse: 88 }, "dribbleur"],
    [{ Vitesse: 95 }, "sprinteur"], [{ Finition: 95, "Sang-froid": 88 }, "buteur"], [{ Finition: 95, Vitesse: 88 }, "renard"],
    [{ Force: 95, Finition: 88 }, "pivot"], [{ Force: 95 }, "colosse"],
  ];
  for (const [boost, id] of cases) assert.equal(archetypeOf(shaped(boost, 55)).id, id, JSON.stringify(boost));
  assert.equal(archetypeOf(toStats(fitToBudget(STAT_KEYS.map(k => (k === "Réflexes" ? 40 : 72))))).id, "polyvalent");
  assert.equal(archetypeOf(PLAYERS.find(p => p.id === "thibault").attributs).id, "polyvalent");
});

// ── Bios ─────────────────────────────────────────────────────
test("profil par défaut : les 16 bios d'origine sont rendues telles quelles (FR et EN)", () => {
  for (const p of PLAYERS) {
    assert.equal(composeBio(p, p.attributs, "fr"), p.bio, p.id);
    assert.equal(composeBio(p, p.attributs, "en"), pText(p, "en").bio, p.id);
    assert.equal(composeBio(p, undefined, "fr"), p.bio, p.id);
    assert.ok(isCloseToDefault(p, p.attributs));
    assert.equal(profileText(p, p.attributs, "en").bio, pText(p, "en").bio);
  }
});

test("règle « proche du défaut » : mêmes 2 forces et mêmes 2 faiblesses → bio d'origine, sinon bio générée", () => {
  const same = (x, y) => x.length === y.length && x.every(k => y.includes(k));
  let exercised = 0;
  for (const p of PLAYERS) {
    const d = p.attributs;
    // échange de deux stats du milieu du classement qui laisse les 2 forces et les 2 faiblesses inchangées
    const middle = strengthsOf(d, 9).filter(k => !strengthsOf(d, 2).includes(k) && !weaknessesOf(d, 2).includes(k));
    let done = false;
    for (let i = 0; i < middle.length && !done; i++) {
      for (let j = i + 1; j < middle.length && !done; j++) {
        const [a, b] = [middle[i], middle[j]];
        if (d[a] === d[b]) continue;
        const swapped = { ...d, [a]: d[b], [b]: d[a] };
        if (!same(strengthsOf(swapped, 2), strengthsOf(d, 2)) || !same(weaknessesOf(swapped, 2), weaknessesOf(d, 2))) continue;
        assert.ok(isValidStats(swapped));
        assert.ok(isCloseToDefault(p, swapped), p.id);
        assert.equal(composeBio(p, swapped, "fr"), p.bio, p.id);
        assert.equal(composeBio(p, swapped, "en"), pText(p, "en").bio, p.id);
        done = true; exercised++;
      }
    }
    // forces changées → bio générée
    const other = shaped(d.Finition > 70 ? { Tacle: 95, Force: 92 } : { Finition: 95, Vitesse: 92 });
    assert.ok(!isCloseToDefault(p, other), p.id);
    assert.notEqual(composeBio(p, other, "fr"), p.bio, p.id);
  }
  assert.ok(exercised >= 12, `échanges testés : ${exercised}`);
});

test("200 répartitions aléatoires par scientifique : bios FR/EN propres, nommées, sans marqueur résiduel", () => {
  const rng = makeRng(2024);
  for (const p of PLAYERS) {
    const fr = new Set();
    for (let i = 0; i < 200; i++) {
      const s = randomStats(rng);
      assert.ok(isValidStats(s), JSON.stringify(s));
      const close = isCloseToDefault(p, s);
      for (const lang of ["fr", "en"]) {
        const bio = composeBio(p, s, lang);
        if (close) assert.equal(bio, pText(p, lang).bio);          // bio d'origine, reprise telle quelle
        else assertCleanText(bio, lang, `${p.id}/${lang}/${JSON.stringify(s)}`);
        assert.ok(bio.length > 60);
        assert.ok(bio.includes(p.nom), `${p.id} : nom absent`);
        if (lang === "fr") fr.add(bio);
      }
    }
    assert.ok(fr.size >= 150, `${p.id} : seulement ${fr.size} bios distinctes sur 200`);
  }
});

test("bios générées : vocabulaire du domaine, archétype et poste idéal en conclusion", () => {
  const rng = makeRng(77);
  for (const p of PLAYERS) {
    const voc = DOMAIN_VOCAB[p.domaine];
    assert.ok(voc, `vocabulaire manquant pour ${p.domaine}`);
    for (let i = 0; i < 30; i++) {
      const s = randomStats(rng);
      if (isCloseToDefault(p, s)) continue;
      const t = profileText(p, s, "fr");
      const imgs = Object.values(voc.img).flatMap(x => [x.pos.fr, x.neg.fr]);
      const hits = imgs.filter(x => t.bio.includes(x)).length;
      assert.ok(hits >= 3, `${p.id} : ${hits} images du domaine dans « ${t.bio} »`);
      assert.ok(t.bio.includes(`« ${t.archetype.fr} »`), `${p.id} : archétype absent`);
      const en = composeBio(p, s, "en");
      assert.ok(en.includes(t.archetype.en), `${p.id} : archetype missing (EN)`);
    }
  }
});

test("bios différentes pour des répartitions très différentes", () => {
  const configs = [
    { Finition: 95, Vitesse: 95, Dribble: 90 }, { Tacle: 95, Force: 95, "Sang-froid": 90 },
    { "Réflexes": 95, "Sang-froid": 92, Force: 88 }, { Vision: 95, Endurance: 95, Dribble: 88 },
  ].map(b => shaped(b, 40));
  for (const p of PLAYERS) {
    for (const lang of ["fr", "en"]) {
      const bios = configs.map(s => composeBio(p, s, lang));
      assert.equal(new Set(bios).size, bios.length, `${p.id}/${lang}`);
    }
    assert.equal(new Set(configs.map(s => archetypeOf(s).id)).size, configs.length);
  }
});

test("déterminisme et robustesse de composeBio / profileText", () => {
  const rng = makeRng(9);
  for (const p of PLAYERS) {
    const s = randomStats(rng);
    assert.equal(composeBio(p, s, "fr"), composeBio(p, { ...s }, "fr"));
    // un scientifique « personnalisé » (withStats) garde sa bio d'origine comme référence du profil par défaut
    assert.equal(composeBio(withStats(p, s), s, "fr"), composeBio(p, s, "fr"));
    assert.equal(composeBio(withStats(p, p.attributs), p.attributs, "en"), pText(p, "en").bio);
    const t = profileText(p, s, "en");
    assert.deepEqual(Object.keys(t).sort(), ["archetype", "bio", "faiblesses", "forces", "roles"]);
    assert.equal(t.forces.length, 3); assert.equal(t.faiblesses.length, 2);
  }
  const p = PLAYERS[0];
  for (const bad of [null, undefined, {}, "x", 42, [], { Finition: "abc" }]) {
    assert.doesNotThrow(() => composeBio(p, bad, "fr"));
    assert.doesNotThrow(() => archetypeOf(bad));
    assert.doesNotThrow(() => roleFit(bad));
  }
  assert.equal(composeBio(p, null, "fr"), p.bio, "répartition absente → profil par défaut");
  assert.equal(composeBio(null, {}, "fr"), "");
  const unknown = { ...p, id: "inconnu", domaine: "Astrophysique", attributs: undefined };
  assertCleanText(composeBio(unknown, shaped({ Vitesse: 95 }), "fr"), "fr", "domaine inconnu");
});

test("banque de textes : chaque modèle × chaque image de domaine produit une phrase propre", () => {
  for (const lang of ["fr", "en"]) {
    const T = BIO_TEMPLATES[lang];
    assert.ok(T.openers.length >= 4 && T.closers.length >= 4 && T.connectors.length >= 4);
    for (const k of STAT_KEYS) {
      assert.ok(T.strengths[k].length >= 3, `${lang}/${k} forces`);
      assert.ok(T.weaknesses[k].length >= 2, `${lang}/${k} faiblesses`);
    }
  }
  for (const [dom, voc] of Object.entries(DOMAIN_VOCAB)) {
    const count = 4 + Object.values(voc.img).length * 2;
    assert.ok(count >= 8, dom);
    for (const k of STAT_KEYS) assert.ok(voc.img[k]?.pos?.fr && voc.img[k]?.pos?.en && voc.img[k]?.neg?.fr && voc.img[k]?.neg?.en, `${dom}/${k}`);
  }
  // Instanciation exhaustive : chaque modèle × chaque image de chaque domaine (y compris le domaine de repli).
  let n = 0;
  for (const lang of ["fr", "en"]) {
    const T = BIO_TEMPLATES[lang];
    for (const [dom, voc] of Object.entries(DOMAIN_VOCAB)) {
      const base = { nom: "Aurélien", title: voc.title[lang], habit: voc.habit[lang], lab: voc.lab[lang], report: voc.report[lang] };
      for (const tpl of T.openers) { assertCleanSentence(fillTemplate(tpl, base, lang), lang, `${dom}/opener`); n++; }
      for (const a of ARCHETYPES) {
        for (const role of ROLES) {
          const rt = { fr: { gk: ["gardien", "dans les cages"], def: ["défenseur", "en défense"], mid: ["milieu", "au milieu"], att: ["attaquant", "en attaque"] },
            en: { gk: ["goalkeeper", "in goal"], def: ["defender", "in defence"], mid: ["midfielder", "in midfield"], att: ["forward", "up front"] } }[lang][role];
          for (const tpl of T.closers) { assertCleanSentence(fillTemplate(tpl, { ...base, arch: a[lang], role: rt[0], loc: rt[1] }, lang), lang, `${dom}/closer`); n++; }
        }
      }
      for (const k of STAT_KEYS) {
        const pos = [...T.strengths[k], ...(k === "Réflexes" ? T.reflexOutfield : [])];
        for (const tpl of pos) {
          const txt = fillTemplate(tpl, { ...base, img: voc.img[k].pos[lang] }, lang);
          assertCleanSentence(txt, lang, `${dom}/${k}+`);
          for (const c of T.connectors) assertCleanSentence(c + txt.charAt(0).toLowerCase() + txt.slice(1), lang, `${dom}/${k}+/connecteur`);
          n++;
        }
        for (const tpl of T.weaknesses[k]) { assertCleanSentence(fillTemplate(tpl, { ...base, img: voc.img[k].neg[lang] }, lang), lang, `${dom}/${k}-`); n++; }
      }
    }
  }
  assert.ok(n > 1500, `${n} instanciations`);
  // Et à travers de vraies bios : chaque stat en force dominante puis en faiblesse, pour chaque scientifique.
  const rng = makeRng(123);
  for (const p of PLAYERS) {
    for (const k of STAT_KEYS) {
      for (let i = 0; i < 12; i++) {
        const others = STAT_KEYS.filter(x => x !== k);
        const second = others[rng.int(others.length)];
        const s = shaped({ [k]: 95, [second]: 88 + rng.int(5) }, 50 + rng.int(10));
        const low = shaped({ [k]: 25, "Réflexes": k === "Réflexes" ? 25 : 60 }, 70 + rng.int(8));
        for (const st of [s, low]) {
          if (isCloseToDefault(p, st)) continue;
          for (const lang of ["fr", "en"]) assertCleanText(composeBio(p, st, lang), lang, `${p.id}/${k}/${lang}`);
        }
      }
    }
  }
});

test("performance : 1000 bios générées en moins de 2,5 s (≈ 0,1 s sur machine au calme)", () => {
  const rng = makeRng(3);
  const jobs = Array.from({ length: 1000 }, (_, i) => [PLAYERS[i % PLAYERS.length], randomStats(rng), i % 2 ? "en" : "fr"]);
  composeBio(...jobs[0]); // échauffement
  const t0 = performance.now();
  for (const [p, s, lang] of jobs) composeBio(p, s, lang);
  const ms = performance.now() - t0;
  assert.ok(ms < 2500, `${ms.toFixed(1)} ms`);
});
