# Preuves D-001 — caméra traversante d'origine (arbitrage du PO sur TD-004)

Candidat : lab-league-v3 : cd223fd + retour à la caméra d'origine (D-001), arbre de travail non commité, 28/09/2026. Environnement : Windows 11 ; Node 26 ; npm test ; Chrome sans interface (rendu logiciel SwiftShader) ; serveur local 127.0.0.1:8791, données de test jetables.

- `resultats-td004.txt` : `node scripts/smoke-uat2.mjs http://localhost:8791 <dossier> td004`.
- `npm-test.txt` : `npm test` (134/134).

Captures (rendu logiciel sans GPU, 1–2 i/s) :

- `td004-low-886x620-far-but-propre.jpg` — Caméra éloignée, son but dans le dos : caméra derrière le but, vitre et filet estompés (basse)
- `td004-medium-886x620-near-but-propre.jpg` — Caméra proche, son but dans le dos (moyenne)
- `td004-high-886x620-far-but-propre.jpg` — Caméra éloignée, son but dans le dos (haute)
- `td004-high-886x620-far-but-adverse.jpg` — Caméra éloignée face au but adverse (haute)
- `td004-medium-886x620-near-paroi.jpg` — Caméra proche le long d'une paroi (moyenne)
- `td004-high-886x620-far-coin.jpg` — Caméra éloignée dans un coin (haute)
- `td004-medium-1366x768-far-but-propre.jpg` — Caméra éloignée, son but dans le dos (moyenne, 1366×768)
