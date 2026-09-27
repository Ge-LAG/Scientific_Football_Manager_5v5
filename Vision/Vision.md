# Vision produit — Lab League · Scientific Football Manager 5v5

> Document de vision rédigé du point de vue Product Owner, sans jargon technique.
> Il s'appuie sur le prototype existant (`app.jsx`) et fixe le cap du jeu en ligne.

---

## 1. En une phrase

**Lab League est un jeu de football à 5 contre 5, jouable dans le navigateur, où des scientifiques
transforment leur domaine d'expertise en super-pouvoirs sur le terrain — et où l'on peut, au choix,
diriger son équipe comme un entraîneur ou incarner soi-même un joueur.**

## 2. Ce que le prototype nous apprend

Le prototype `app.jsx` a posé l'âme du jeu. On garde tout ce qui fait son identité :

- **16 consultants scientifiques** (Roland, Loïc, David, Thibault, Henry, Romain, Théo, Franck,
  Aurélien, Lucien, Joffrey, Yacine, Djilani, Médéric, Guillaume, Patrice), chacun avec son domaine
  (Informatique, Chimie, Cybersécurité, Agroalimentaire, Business…), son poste, son slogan, sa
  biographie pleine d'humour et **8 caractéristiques** (Finition, Tacle, Dribble, Endurance, Force,
  Vitesse, Vision, Sang-froid).
- **Un power-up par scientifique**, directement tiré de son métier : « Hotfix de Production »,
  « Édition d'ADN », « Pare-feu Total », « Board Call »… Ils boostent certaines qualités et en
  affaiblissent d'autres : chaque pouvoir a un prix.
- **Des stratégies d'équipe au nom scientifique** : Équilibre Thermodynamique, Pression Osmotique,
  Réaction en Chaîne, Réplication d'ADN, Fission Nucléaire, Effet Faraday.
- **Un commentateur qui parle la langue de chaque domaine** : un but de l'informaticien est un
  « commit validé », celui du chimiste une « réaction exothermique ».
- **Une ambiance néon « labo futuriste »** : fond sombre, couleurs cyan / magenta / citron vert,
  cartes en verre dépoli.

Ce que le prototype ne permettait pas encore : jouer réellement **en ligne** (il ne fonctionnait
qu'entre deux onglets du même ordinateur), **prendre le contrôle d'un joueur**, garder une trace de
sa progression, ni jouer quand on est seul face à peu d'adversaires humains.

## 3. La promesse : un jeu « 2 en 1 »

### Mode 1 — Le Labo Tactique (Manager, 1 contre 1)

*Pour les stratèges.* Je crée mon club (nom, couleurs, écusson), je recrute mes 5 titulaires et
mes remplaçants parmi les 16 scientifiques, je choisis ma formation et ma stratégie. Pendant le
match, que je regarde se dérouler en direct, je réagis : je change de stratégie, je déclenche les
power-ups au bon moment, je fais entrer un remplaçant frais quand un joueur s'épuise.

- **En ligne contre un autre manager** : chacun choisit ses joueurs lors d'une *draft* (tour par
  tour, un scientifique ne peut appartenir qu'à une seule équipe), puis le match se joue en direct.
- **Contre un manager virtuel** si personne n'est disponible, avec trois niveaux : *Stagiaire*,
  *Chercheur*, *Prix Nobel*.
- **Un vrai rapport d'après-match** : score, statistiques, notes des joueurs, homme du match,
  conseils du coach, temps forts.
- **Regarder son match en 3D comme à la télé** : je bascule de la vue tactique au stade 3D et je
  choisis ma caméra — réalisateur automatique, latérale, tribune, derrière le but, sur le ballon,
  sur un joueur précis, ou caméra libre que je pilote moi-même.

### Mode 2 — L'Arène (Action, 5 contre 5 à la troisième personne)

*Pour les joueurs.* J'incarne **un** scientifique et je le dirige moi-même, caméra derrière
l'épaule, dans une arène futuriste fermée par des parois vitrées (le ballon rebondit dessus, le jeu
ne s'arrête jamais). Je cours, je sprinte, je passe, je tire, je tacle — et j'active le power-up de
mon personnage au moment décisif.

- **Jusqu'à 10 humains** dans un même match ; **les places vides sont tenues par des joueurs
  virtuels** qui s'effacent dès qu'un humain rejoint la partie.
- Les caractéristiques comptent vraiment : Médéric est une fusée, Franck frappe comme un canon mais
  court lentement, Djilani est un mur, Patrice voit tout le terrain.
- Parties courtes (2 × 3 minutes par défaut) pour enchaîner les matchs entre amis.
- **Prise en main naturelle au clavier** : je me déplace avec les flèches (main droite) et toutes
  les actions tombent sous la main gauche (passe, tir, lob, crochet, changer de joueur, power-ups,
  sprint au pouce). AZERTY ou QWERTY : je choisis dans les réglages, et je peux réaffecter chaque
  touche. La souris et la **manette USB** restent possibles.
- **Des gestes techniques** (roulette, feinte de corps, crochet, petit pont, une-deux avec la paroi,
  appui sur la paroi) dont la réussite dépend du dribble ; **en défense**, un tacle (sans
  étourdissement) et un pressing plus sûr mais moins efficace ; les fautes donnent **coups francs et
  penaltys**, sans cartons (dans les deux modes).
- **Changer de joueur en cours de match** quand mon équipe n'est pas complète en humains : je prends
  le contrôle du coéquipier le mieux placé (jamais celui d'un autre humain), à la demande ou
  automatiquement quand je fais une passe.

### Dans les deux modes

- **4 power-ups par scientifique**, tous liés à son domaine (celui du prototype + 3 nouveaux) :
  avant chaque match, je choisis **les 2** que chacun emporte. De quoi varier les plans de jeu.
- **Mes scientifiques, mon style** : dans le *Vestiaire*, je personnalise leur apparence comme dans
  un jeu de rôle — morphologie, coiffure (dont quatre mulets : moderne, rasé sur les côtés,
  permanenté années 80, classique), barbe, lunettes, couvre-chef, tenue (footballeur, scientifique,
  rockstar, médiéval, Renaissance, futuriste, décalé, marrant) et accessoires. **Tout le monde voit
  mon style en ligne**, et la couleur de l'équipe reste toujours lisible.
- **Un rendu de jeu « premium »** : style cartoon néon soigné, lumières et effets, animations
  fluides (course, frappe, tacle glissé, plongeon, célébrations), qualité qui s'adapte à l'ordinateur.
- **Mes scientifiques, mes réglages** : je répartis librement les points de caractéristiques de
  chacun (même budget pour tous) ; leur biographie, leur **archétype** (Buteur, Meneur de jeu,
  Muraille…) et leur **poste idéal** s'adaptent automatiquement. Chaque caractéristique a un effet
  réel sur le jeu (vitesse, tirs, passes, tacles, gestes techniques, arrêts…).
- **Jouer tout de suite, même seul** : les joueurs virtuels comblent toujours les places vides.
- **Salons privés avec un code à partager** pour jouer entre amis, ou **partie rapide** pour être
  placé automatiquement.
- **Français et anglais**, le français par défaut.

## 4. Pour qui ?

| Profil | Ce qu'il cherche | Ce que Lab League lui offre |
| --- | --- | --- |
| Le collègue scientifique | Se reconnaître, rire des clins d'œil à son métier | Des personnages et commentaires issus de son domaine |
| Le fan de jeux de gestion | Réfléchir, optimiser, battre un rival | Mode Manager, draft, stratégies, synergies |
| Le joueur « manette en main » | De l'action rapide entre amis | Mode Arène 5v5 en ligne à la 3ᵉ personne |
| Le joueur occasionnel | Jouer 5 minutes sans contrainte | Parties rapides, bots, aucune installation |

## 5. Compte joueur : simple et respectueux

- On crée un compte avec **un pseudo et un mot de passe. Rien d'autre** : ni adresse e-mail, ni nom
  réel, ni date de naissance. Aucune donnée personnelle.
- On peut **jouer en invité** contre les bots sans compte ; le compte sert à jouer en ligne et à
  garder sa progression.
- Le joueur peut **supprimer son compte** à tout moment.

## 6. Progression et rejouabilité

- **Grade académique** qui monte avec l'expérience : Stagiaire → Doctorant → Post-doc →
  Maître de conférences → Professeur → Directeur de recherche → Prix Nobel.
- **Classement** des managers (points gagnés ou perdus contre d'autres humains) et des joueurs de
  l'Arène (victoires, buts, passes décisives).
- **Publications** (succès à débloquer) : « Premier article publié » (premier but), « Revue par les
  pairs » (10 victoires), « Facteur d'impact » (triplé)…
- **Championnat du Labo** : une saison solo de 5 journées contre des clubs virtuels de plus en plus forts,
  avec classement et titre à conquérir.
- **Récompenses de club** : écussons et couleurs supplémentaires débloqués en montant en grade.
- **Synergies de labo** : associer des scientifiques de domaines proches (deux informaticiens,
  deux « bancaires », la famille chimie…) donne de petits bonus d'équipe — une raison de plus
  d'expérimenter des compositions.

## 7. Ce qui ne change pas (engagement PO)

1. Les 16 personnages, leurs noms, postes, slogans, biographies et domaines.
2. Leurs caractéristiques d'origine servent de **profil de départ** : depuis la vague 6, **c'est le
   joueur qui répartit les points** de chaque scientifique (même budget pour tous, aucun n'est
   « meilleur » qu'un autre) ; seuls leurs power-ups les distinguent. La biographie s'adapte à la
   répartition choisie (celle d'origine est conservée pour le profil d'origine).
3. Le principe : **des footballeurs scientifiques qui utilisent des power-ups liés à leur domaine
   d'étude**.
4. L'humour et l'univers « labo néon ».

## 8. Critères de réussite

- Un nouveau venu lance une partie (contre des bots) **en moins d'une minute** après l'arrivée sur
  le site, sans compte.
- Deux amis sur deux ordinateurs différents jouent ensemble **via un simple code de salon**.
- Un match de l'Arène reste **fluide** sur un ordinateur portable ordinaire.
- Chaque scientifique se **ressent différemment** manette en main.
- Le jeu fonctionne **dans le navigateur**, sans installation, et s'héberge sur une offre de type
  Hostinger Cloud.

## 9. Hors périmètre pour cette version

- Application mobile native (le jeu reste jouable dans un navigateur récent).
- Achats, monnaie, publicité.
- Tournois programmés, ligues saisonnières, chat vocal (pistes pour la suite).

## 10. Pistes pour la suite

- Tournois et championnats saisonniers entre clubs.
- Nouveaux scientifiques et nouveaux domaines (astrophysique, neurosciences…).
- Mode spectateur avec commentaires en direct, rediffusions des plus beaux buts.
- Contrôles tactiles optimisés pour tablette.
