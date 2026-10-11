// W-032 : les trois scripts de test navigateur partagent un même facteur d'attente SMOKE_SLOW
// (défaut 1) qui multiplie waitFor et les attentes explicites — même verdict sur machine lente.
// Vérifie aussi la commande npm run smoke:uat2 et le workflow GitHub manuel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FILES = ["scripts/smoke-browser.mjs", "scripts/smoke-online.mjs", "scripts/smoke-uat2.mjs"];
const src = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");

for (const f of FILES) {
  test(`${f} : un seul facteur SMOKE_SLOW appliqué à waitFor et aux attentes explicites`, () => {
    const s = src(f);
    assert.match(s, /process\.env\.SMOKE_SLOW/, "facteur lu depuis l'environnement");
    assert.match(s, /process\.env\.SMOKE_URL/, "adresse du serveur de test possible via SMOKE_URL");
    assert.equal((s.match(/const SLOW =/g) || []).length, 1, "un seul facteur SLOW");
    assert.match(s, /const waitMs = ms => ms \* SLOW/, "conversion unique délai → délai multiplié");
    // une seule fonction d'attente partagée par script, dont le plafond passe par waitMs
    const defs = s.match(/waitFor\s*[:=]\s*async/g) || [];
    assert.equal(defs.length, 1, "une seule définition de waitFor");
    assert.match(s, /Date\.now\(\) - t0 < waitMs\(ms\)/, "le délai de waitFor est multiplié par le facteur");
    // attentes explicites : sleep passe par le même facteur ; sleep et tick sont les seules
    // promesses setTimeout côté Node (tick = cadence de sondage, volontairement non multipliée)
    assert.match(s, /const sleep = ms => new Promise\(r => setTimeout\(r, waitMs\(ms\)\)\)/, "sleep multiplié");
    assert.equal((s.match(/new Promise\(r => setTimeout/g) || []).length, 2, "seuls sleep et tick encapsulent setTimeout");
    // chargement de page : attendu jusqu'à 60 s × facteur
    assert.match(s, /PAGELOAD = 60000/, "base de 60 s pour les chargements de page");
    assert.match(s, /waitFor\([^;]*PAGELOAD|ms = PAGELOAD/, "au moins une attente de chargement de page utilise PAGELOAD");
  });
}

test("smoke-uat2.mjs : l'attente de stabilisation de caméra (settle) passe par le facteur", () => {
  assert.match(src("scripts/smoke-uat2.mjs"), /Date\.now\(\) - t0 < waitMs\(90000\)/);
});

test("package.json : npm run smoke, smoke:online et smoke:uat2 existent", () => {
  const scripts = JSON.parse(src("package.json")).scripts;
  for (const name of ["smoke", "smoke:online", "smoke:uat2"]) {
    assert.ok(scripts[name], name + " absent");
    assert.match(scripts[name], /scripts\/smoke-\w+\.mjs/, name + " n'appelle pas le bon script");
  }
});

test(".github/workflows/smoke.yml : déclenchement manuel, build, serveur dédié, captures", () => {
  const y = src(".github/workflows/smoke.yml");
  assert.match(y, /workflow_dispatch/, "déclenchement manuel uniquement");
  assert.doesNotMatch(y, /^\s*push:/m, "pas de déclenchement automatique sur push");
  assert.match(y, /npm run build/, "build du client");
  assert.match(y, /PORT=8791/, "serveur de test sur un port dédié");
  assert.match(y, /DATA_FILE=/, "fichier de données temporaire, pas le data/ réel");
  assert.match(y, /smoke-browser\.mjs/, "parcours mono-joueur");
  assert.match(y, /smoke-uat2\.mjs[^\n]*td002,td003,td006,td007,td008/, "retest UAT-002 hors TD-004");
  assert.doesNotMatch(y, /smoke-uat2\.mjs[^\n]*td004/, "TD-004 exclu (validation visuelle de Guillaume)");
  assert.match(y, /upload-artifact/, "captures publiées en artefact");
});
