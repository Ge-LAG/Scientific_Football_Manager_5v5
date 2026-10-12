// W-033 (AC-004) : bouton tactile ☰ du menu de l'Arène — câblage sur le même point
// d'entrée qu'Échap (setMenu), traductions FR/EN, zone tactile ≥ 44×44 px.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fr from "../src/i18n/fr.js";
import en from "../src/i18n/en.js";

const jsx = readFileSync(new URL("../src/pages/arena/ArenaGame.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("bouton ☰ : rendu tactile, aria-label traduit, ouverture par setMenu(true) comme Échap", () => {
  assert.match(jsx, /className="touch-menu"[^>]*aria-label=\{t\("touch\.menu"\)\}/, "bouton .touch-menu avec aria-label traduit");
  assert.match(jsx, /onMenu=\{\(\) => viewRef\.current\?\.setMenu\(true\)\}/, "le bouton appelle setMenu(true) — même point d'entrée que la touche menu (Échap)");
  assert.equal(fr["touch.menu"], "Ouvrir le menu");
  assert.equal(en["touch.menu"], "Open menu");
});

test("libellés du menu inchangés (« Menu — le match continue » en ligne)", () => {
  assert.equal(fr["arena.menuLive"], "Menu — le match continue");
  assert.equal(en["arena.menuLive"], "Menu — the match goes on");
  assert.equal(fr["arena.resume"], "Reprendre");
});

test("zone tactile du bouton ☰ ≥ 44×44 px", () => {
  const m = css.match(/\.touch-menu\s*\{([^}]*)\}/);
  assert.ok(m, ".touch-menu absent de styles.css");
  for (const dim of ["width", "height"]) {
    const px = +((m[1].match(new RegExp(dim + ":\\s*(\\d+)px")) || [])[1] || 0);
    assert.ok(px >= 44, `${dim} = ${px}px < 44px`);
  }
});
