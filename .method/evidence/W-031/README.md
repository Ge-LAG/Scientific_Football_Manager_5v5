# Preuves W-031 — correctifs issus de la recette UAT-002

Candidat : lab-league-v3 : 25a2547 + correctifs W-031 (arbre de travail non commité, 28/09/2026). Environnement : Windows 11 ; Node 26 ; npm test ; Chrome sans interface (rendu logiciel SwiftShader) ; serveur local 127.0.0.1:8791, données de test jetables.

- `resultats-uat2.txt` : sortie de `node scripts/smoke-uat2.mjs http://localhost:8791 <dossier> all` (retest navigateur TD-002, TD-003, TD-004, TD-006, TD-007, TD-008) ; l'étape TD-002 a été rejouée seule (`… td002`) après allongement d'un délai d'attente du script, voir la dernière ligne du fichier.
- `npm-test.txt` : `npm test` (134/134 réussis).
- `smoke-browser.txt`, `smoke-online.txt` : non-régression (parcours mono-navigateur ; deux navigateurs isolés en ligne).

Captures (JPEG, rendu logiciel sans GPU, 1–2 images/s : fluidité et rendu exact à confirmer sur carte graphique) :

- `td002-fr-pause-31s.jpg` — Pause solo FR après 31 s
- `td002-en-pause.jpg` — Pause solo EN
- `td002-fr-pause-but.jpg` — Pause avec ballon sur la ligne
- `td003-fr-sans-limite.jpg` — Composition solo sans limite (FR)
- `td003-en-no-limit.jpg` — Composition solo sans limite (EN)
- `td006-fr-886x620.jpg` — Coup d'envoi recadré 886×620
- `td006-en-1366x768.jpg` — Coup d'envoi recadré 1366×768 (EN)
- `td006-fr-390x844.jpg` — Coup d'envoi recadré mobile
- `td007-en-886x620-avant.jpg` — Témoin : ancienne règle CSS réinjectée
- `td007-en-886x620.jpg` — Vestiaire 886×620 corrigé (EN)
- `td007-fr-390x844.jpg` — Vestiaire mobile
- `td008-en-remap-b.jpg` — FAQ EN après réaffectation sur B
- `td008-fr-azerty.jpg` — FAQ FR AZERTY
- `td008-en-synergies.jpg` — Synergies traduites (EN)
- `td008-en-aide-match.jpg` — Aide en match EN, appel sur B
- `td004-low-886x620-far-but-propre.jpg` — Caméra éloignée, son but dans le dos (basse)
- `td004-medium-886x620-near-paroi.jpg` — Caméra proche le long d'une paroi (moyenne)
- `td004-high-886x620-far-but-adverse.jpg` — Caméra éloignée face au but adverse (haute)
- `td004-high-886x620-near-coin.jpg` — Caméra proche dans un coin (haute)
- `td004-medium-1366x768-far-but-propre.jpg` — Caméra éloignée, son but dans le dos (moyenne, 1366×768)
- `on-08-arene-menu-A.png` — En ligne à deux humains : menu « le match continue » (A)
- `diag-0-base.jpg` — Diagnostic : voile de bloom en vue plongeante (avant bloom adaptatif)
- `diag-4-sans-bloom.jpg` — Diagnostic : même vue sans bloom
- `diag-0-base-adaptatif.jpg` — Même vue avec le bloom adaptatif
