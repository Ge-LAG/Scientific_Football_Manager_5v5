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
  data/             personnages, power-ups, narration FR/EN, enrichissements, formations, stratégies
  manager/          moteur de match Manager v3 (déterministe) + manager virtuel
  action/           simulation physique de l'Arène (30 Hz) + bots
  rooms/            salles Manager / Arène (draft, composition, match, entrée en cours de partie)
  lobby.js          salles, codes, partie rapide
  progression.js    XP, grades académiques, ELO, publications (succès)
server/             Node.js : HTTP statique + API REST + WebSocket (ws), comptes (scrypt), persistance JSON
src/                client React 19 + Vite
  pages/            accueil, scientifiques, power-ups, club, compte, profil, classement, aide, réglages, Manager, Arène
  render2d/         vue tactique canvas
  three/            vue 3D (stade, avatars procéduraux, ballon, effets), contrôles, adaptateur Manager → 3D
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
