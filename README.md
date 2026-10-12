# ⚽🧬 Lab League — Scientific Football Manager 5v5

Jeu de football **5 contre 5 de scientifiques**, jouable **en ligne dans le navigateur**, « 2 en 1 » :

- **🧪 Le Labo Tactique (Manager 1v1)** — draft en serpentin des 16 scientifiques, composition, formation,
  stratégie, puis match en direct (vue tactique 2D ou **vue Stade 3D**) : power-ups, remplacements, matrice tactique,
  synergies de domaine, rapport complet. Contre un autre manager en ligne ou un manager virtuel (3 niveaux).
- **🏟️ L'Arène (Action 5v5 à la 3ᵉ personne)** — incarnez un scientifique dans une arène vitrée en 3D (Three.js) :
  sprint, tir chargé, passes, lobs, tacles glissés, plongeons du gardien, power-up de domaine. Jusqu'à 10 humains,
  **bots de complément**, entrée/sortie en cours de match.

Points forts : matrice tactique pierre-feuille-ciseaux entre les 6 stratégies scientifiques, synergies de domaine,
causerie de mi-temps, courbe xG, vue Stade 3D du match Manager ; dans l'Arène, ralenti automatique des buts,
appel de balle (vos coéquipiers bots vous servent), crochet, mini-carte, entraînement guidé ; commentaire vocal
des buts, grades académiques, ELO, 18 « publications » (succès), récompenses cosmétiques de club.

**Nouveautés (vague premium)** :

- **64 power-ups** (4 par scientifique, liés à son domaine : celui du prototype + 3 nouveaux, 7 nouveaux effets d'Arène) ;
  **2 emportés par match**, choisis avant le coup d'envoi (Manager et Arène).
- **Vestiaire** : apparence détaillée façon RPG de chaque scientifique (morphologie, 22 coiffures dont 4 mulets, pilosité,
  lunettes, couvre-chefs, 8 styles de tenue, accessoires, couleurs libres), enregistrée sur le compte et **visible de tous en ligne**.
- **Caméras du match Manager en 3D** : réalisateur automatique, latérale, tribune, frontale, ballon, joueur suivi, caméra libre, plein écran.
- **Contrôles** : flèches (main droite) + actions sous la main gauche, disposition AZERTY / QWERTY / QWERTZ (détection
  automatique), réaffectation clavier et manette, souris optionnelle, manette USB (vibrations).
- **Changement de joueur** en cours de match vers un coéquipier piloté par un bot (manuel ou automatique).
- **Rendu premium** : post-traitements (bloom, anticrénelage, occlusion ambiante, étalonnage), qualité adaptative,
  avatars cel-shading animés (machine à états, transitions, célébrations), stade vivant ; compteur F3 et banc d'essai `#/bench`.

**Vague 6 (gameplay et personnalisation)** :

- **Caractéristiques libres** : même budget de 612 points pour chaque scientifique (25 à 95 par caractéristique),
  réparti par le joueur dans le Vestiaire (préréglages par poste) ; profil par défaut = forme d'origine ramenée au budget ;
  **archétype + poste idéal** à la place de la note « overall » ; **biographies adaptatives** (FR/EN, selon forces,
  faiblesses et domaine scientifique ; bio d'origine pour le profil d'origine).
- **Gestes techniques** (Geste + direction) : crochet, feinte de corps, roulette, passement de jambes, petit pont,
  une-deux avec la paroi, appui mural — réussite selon le Dribble.
- **Défense** : un seul tacle, sans étourdissement ; pressing maintenu ; fautes selon les caractéristiques défensives,
  **coups francs et penaltys**, aucun carton (Arène et Manager). Chaque caractéristique a un effet mesurable (tests).
- **Visages** : formes de visage, d'yeux, sourcils, nez ; têtes adultes ; coiffures réalistes (mulets dans la liste).

### Commandes par défaut (schéma « flèches + main gauche »)

| Action | Clavier (position physique, libellé AZERTY / QWERTY) | Manette |
| --- | --- | --- |
| Se déplacer | Flèches | Stick gauche |
| Sprint (maintenir) | Espace (pouce) / Maj | RT |
| Tir (maintenir = charger) · adversaire au ballon : tacle | D | B |
| Passe · adversaire au ballon (maintenir) : pressing | S | A |
| Lob | Q / A | X |
| Geste technique (+ direction : feinte, roulette, crochet, petit pont, une-deux ou appui sur la paroi) | F | Y |
| Tacle (touche dédiée) · Pressing (maintenir) | X · W / Z | → · ← |
| Changer de joueur | A / Q | LB |
| Appel de balle | Z / W | R3 |
| Power-up 1 / 2 | E / R | RB / LT |
| Caméra · Tableau · Menu | C · Tab · Échap | View · ↓ · Menu |

Schéma « clavier + souris » (ZQSD / WASD, souris pour la caméra) disponible dans les réglages ; toutes les commandes sont réaffectables.

**Menu (Échap)** : en solo contre les bots, le match est réellement suspendu (chrono, bots, recharges) jusqu'à « Reprendre » ;
en ligne avec d'autres humains, il continue et le menu le signale. **Manager contre un bot** : composition sans limite de
temps (départ sur « Prêt, coup d'envoi ! ») ; en ligne, 60 s. Réglage **Effets réduits** (Réglages et menu de l'Arène) :
ni secousses, ni flashs plein écran, ni lignes de vitesse (activé d'office si le système demande de réduire les animations).

Les **16 personnages**, leurs caractéristiques, postes, slogans, biographies et power-ups sont repris à l'identique
du prototype (`archive/prototype-react/app.jsx`) — vérifié par test automatique — et enrichis (Réflexes de gardien,
apparence 3D, effets Arène, synergies). Interface **français / anglais** (français par défaut). Comptes **sans donnée
personnelle** : pseudo + mot de passe.

Vision produit : [`Vision/Vision.md`](Vision/Vision.md) · Suivi de projet (Méthode V6) : [`.method/index.html`](.method/index.html)

## Démarrage rapide

```bash
npm install
npm run dev        # serveur (8787) + client Vite (5173) → http://localhost:5173
```

Production locale :

```bash
npm run build
npm start          # http://localhost:8787 (site + API + WebSocket)
```

Tests (données, i18n, moteurs, IA, comptes, progression, API, serveur temps réel) :

```bash
npm test
```

Tests de bout en bout dans un vrai navigateur (Chrome ou Edge sans interface, serveur lancé avec `npm start`) :

```bash
node scripts/smoke-browser.mjs http://localhost:8787 smoke-out
node scripts/smoke-online.mjs http://localhost:8787 smoke-out
```

## Architecture

```
shared/             code isomorphe (serveur ET navigateur)
  data/             personnages, power-ups (64), caractéristiques (budget), textes de profil (bios adaptatives,
                    archétypes), apparences, narration FR/EN, enrichissements, formations, stratégies
  profile.js        apparences et sélections de power-ups d'un joueur (nettoyées)
  manager/          moteur de match Manager v3 (déterministe) + manager virtuel
  action/           simulation physique de l'Arène (30 Hz) + bots
  rooms/            salles Manager / Arène (draft, composition, match, entrée en cours de partie)
  lobby.js          salles, codes, partie rapide
  progression.js    XP, grades académiques, ELO, publications (succès)
server/             Node.js : HTTP statique + API REST + WebSocket (ws), comptes (scrypt), persistance JSON
src/                client React 19 + Vite
  pages/            accueil, scientifiques, power-ups, club, compte, profil, classement, aide, réglages, Manager, Arène
  render2d/         vue tactique canvas
  three/            vue 3D : stade, avatars procéduraux animés, ballon, effets, caméras (cameraRig), contrôles
                    (controls + input), pipeline de rendu et qualité adaptative (render/), adaptateur Manager → 3D
  audio/            sons synthétisés (WebAudio)
  i18n/             catalogues FR / EN
tests/              node:test
deploy/             guide Hostinger
archive/            ancien code Rust (desktop/mobile) et prototype React, conservés pour référence
```

Le **solo contre les bots** exécute le même code de salle directement dans le navigateur : il fonctionne même sans
serveur. En ligne, le serveur fait autorité (anti-triche) ; le client interpole les instantanés et prédit le
déplacement du joueur local.

## Déploiement

Voir [`deploy/HOSTINGER.md`](deploy/HOSTINGER.md) (Hostinger Cloud Node.js ou VPS + PM2 + Nginx).
