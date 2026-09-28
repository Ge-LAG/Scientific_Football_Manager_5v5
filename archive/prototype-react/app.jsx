import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════
// SCIENTIFIQ FOOTBALL MANAGER 5v5 — Complete Application
// Style: Neon Glassmorphism "Lab League" — UI 100% Français
// ═══════════════════════════════════════════════════════════════

// ─── DATA: ROSTER DES 16 JOUEURS ─────────────────────────────
const ROSTER = [
  { id:"roland", nom:"Roland", domaine:"Informatique", poste:"Défenseur", slogan:"Le mur de code", profil:"Spécialiste", tier:3, traits:["Pivot physique","Mur défensif"], bio:"Ancien debuggeur de systèmes critiques, Roland applique la même philosophie sur le terrain : rien ne passe. Son corps est un firewall en chair et en os. Par contre, lui demander de marquer un but, c'est comme lui demander de coder en Comic Sans MS — ça n'arrivera pas.", attributs:{Finition:52,Tacle:78,Dribble:50,Endurance:70,Force:86,Vitesse:62,Vision:62,"Sang-froid":82}, forces:["Force","Sang-froid"], faiblesses:["Dribble","Finition"] },
  { id:"loic", nom:"Loïc", domaine:"Physique et Mécanique", poste:"Attaquant", slogan:"Le sniper mécanique", profil:"Spécialiste", tier:2, traits:["Renard des surfaces","Finisseur"], bio:"Loïc a calculé l'angle parfait de pénétration du ballon dans les filets. Trajectoire parabolique, effet Magnus, résistance de l'air — tout est optimisé. Seul problème : quand il faut défendre, il prétend que la mécanique des fluides ne s'applique pas au recul.", attributs:{Finition:90,Tacle:46,Dribble:70,Endurance:80,Force:58,Vitesse:74,Vision:68,"Sang-froid":76}, forces:["Finition","Endurance"], faiblesses:["Tacle","Force"] },
  { id:"david", nom:"David", domaine:"Biologie et Chimie", poste:"Ailier", slogan:"L'électron libre", profil:"High risk-high reward", tier:1, traits:["Dribbleur","Électron libre"], bio:"David dribble comme une enzyme découpe un substrat : avec une précision chirurgicale et une vitesse que personne ne voit venir. Il mute de direction toutes les 0.3 secondes. Son seul souci ? Comme une réaction exothermique, il brûle toute son énergie d'un coup et finit en sueur au bout de 10 minutes.", attributs:{Finition:78,Tacle:50,Dribble:92,Endurance:62,Force:56,Vitesse:84,Vision:76,"Sang-froid":78}, forces:["Dribble","Vitesse"], faiblesses:["Tacle","Force"] },
  { id:"thibault", nom:"Thibault", domaine:"Physique et Chimie", poste:"Milieu", slogan:"L'équilibre parfait", profil:"Équilibré", tier:1, traits:["Polyvalent","Technique"], bio:"Mi-physicien, mi-chimiste, 100% polyvalent. Thibault est le joueur dont le profil de stats ressemble à un cercle parfait sur le radar. Il excelle dans l'art du juste milieu — comme un pH de 7. Certains disent qu'il est trop sage, les connaisseurs savent que c'est la solution tampon de l'équipe.", attributs:{Finition:76,Tacle:74,Dribble:78,Endurance:72,Force:66,Vitesse:70,Vision:74,"Sang-froid":72}, forces:["Dribble","Finition"], faiblesses:["Force","Vitesse"] },
  { id:"henry", nom:"Henry", domaine:"Informatique", poste:"Défenseur", slogan:"La tour de contrôle", profil:"Spécialiste", tier:3, traits:["Mur défensif","Jeu de tête"], bio:"Henry, c'est le serveur rack 42U de la défense : imposant, fiable, et toujours en ligne. Ses headers sont aussi précis que ses requêtes SQL. Il tourne pendant 90 minutes sans jamais crash. Par contre, si le ballon arrive à ses pieds dans la surface adverse, c'est l'écran bleu garanti.", attributs:{Finition:48,Tacle:84,Dribble:46,Endurance:88,Force:68,Vitesse:54,Vision:66,"Sang-froid":86}, forces:["Endurance","Sang-froid"], faiblesses:["Dribble","Finition"] },
  { id:"romain", nom:"Romain", domaine:"Electronique", poste:"Milieu", slogan:"Le relayeur aérien", profil:"Équilibré", tier:3, traits:["Jeu de tête","Endurant"], bio:"Tel un signal radio bien calibré, Romain transmet le ballon avec régularité sur toute la bande passante du terrain. Grand comme une antenne relais et endurant comme une batterie lithium, il domine les duels aériens. Le seul endroit où il capte mal ? En défense, où ses plaquages ressemblent à un branchement en court-circuit.", attributs:{Finition:66,Tacle:58,Dribble:64,Endurance:78,Force:76,Vitesse:60,Vision:70,"Sang-froid":74}, forces:["Endurance","Force"], faiblesses:["Tacle","Vitesse"] },
  { id:"theo", nom:"Théo", domaine:"Mathématiques", poste:"Milieu défensif", slogan:"Le récupérateur calculé", profil:"Spécialiste", tier:3, traits:["Récupérateur","Agressif"], bio:"Théo récupère des ballons comme il résout des équations : avec acharnement et sans élégance. Sa méthode ? La force brute. Si la solution optimale n'existe pas, il tacle. Le théorème de Théo : « Pour tout attaquant A, il existe un tacle T tel que A se retrouve au sol. » Corollaire : l'arbitre siffle souvent.", attributs:{Finition:52,Tacle:82,Dribble:48,Endurance:88,Force:66,Vitesse:74,Vision:60,"Sang-froid":76}, forces:["Endurance","Tacle"], faiblesses:["Dribble","Finition"] },
  { id:"franck", nom:"Franck", domaine:"Biologie et Médecine", poste:"Attaquant", slogan:"Le canon à distance", profil:"Spécialiste", tier:1, traits:["Frappe puissante","Technique"], bio:"Franck a étudié l'anatomie du tir parfait : appui sur le pied d'ancrage, rotation du bassin, transfert d'énergie cinétique vers le ballon. Résultat : des frappes qui nécessitent un certificat médical pour le gardien. Il court comme un médecin de garde à 4h du mat' — pas vite — mais quand il tire, c'est l'arrêt cardiaque assuré.", attributs:{Finition:88,Tacle:60,Dribble:76,Endurance:78,Force:76,Vitesse:48,Vision:74,"Sang-froid":76}, forces:["Finition","Endurance"], faiblesses:["Vitesse","Tacle"] },
  { id:"aurelien", nom:"Aurélien", domaine:"Chimie", poste:"Ailier", slogan:"L'ailier toxique", profil:"Spécialiste", tier:3, traits:["Provocateur","Stratège"], bio:"Aurélien est un catalyseur humain : il ne fait pas grand-chose physiquement, mais sa simple présence accélère toutes les réactions sur le terrain. Expert en provocation moléculaire, il déstabilise les défenses adverses avec un sourire et un mot bien placé. Lent comme une réaction endothermique, mais sa vision du jeu est de l'or pur.", attributs:{Finition:66,Tacle:74,Dribble:66,Endurance:66,Force:68,Vitesse:52,Vision:80,"Sang-froid":78}, forces:["Vision","Sang-froid"], faiblesses:["Vitesse","Endurance"] },
  { id:"lucien", nom:"Lucien", domaine:"Informatique", poste:"Défenseur", slogan:"Le serveur distribué", profil:"Spécialiste", tier:3, traits:["Distributeur","Mur défensif"], bio:"Lucien fonctionne en architecture distribuée : il couvre sa zone, dispatch les ballons proprement, et ne plante jamais. Comme un bon load balancer, il répartit la charge entre ses coéquipiers avec une vision impeccable. Ne lui demandez pas d'attaquer par contre — ce n'est pas dans son cahier des charges et il a fermé le ticket.", attributs:{Finition:52,Tacle:86,Dribble:54,Endurance:70,Force:84,Vitesse:58,Vision:78,"Sang-froid":70}, forces:["Tacle","Force"], faiblesses:["Dribble","Finition"] },
  { id:"joffrey", nom:"Joffrey", domaine:"Mathématiques et Bancaire", poste:"Milieu offensif", slogan:"Le playmaker rentable", profil:"High risk-high reward", tier:2, traits:["Playmaker","Finisseur"], bio:"Joffrey optimise chaque passe comme un portefeuille d'investissement : rendement maximum, risque calculé. Son cerveau tourne en O(n log n) pour trouver la meilleure ouverture. Créatif et technique, il transforme chaque possession en opportunité de marché. Son point faible ? Physiquement, c'est un stagiaire face à un rugbyman, et sous pression il peut faire un krach.", attributs:{Finition:80,Tacle:60,Dribble:78,Endurance:76,Force:52,Vitesse:66,Vision:84,"Sang-froid":64}, forces:["Vision","Finition"], faiblesses:["Force","Sang-froid"] },
  { id:"yacine", nom:"Yacine", domaine:"Aides directes, Subventions", poste:"Attaquant", slogan:"Le showman clutch", profil:"High risk-high reward", tier:3, traits:["Showman","Reprises de volée"], bio:"Yacine traite chaque match comme un dossier de subvention : il monte un projet spectaculaire, le défend avec panache, et décroche le financement — pardon, le but — au dernier moment. Ses reprises de volée sont classées monument historique. Il court au rythme d'un dossier administratif, mais quand le ballon arrive, c'est le jackpot.", attributs:{Finition:84,Tacle:66,Dribble:70,Endurance:68,Force:72,Vitesse:48,Vision:72,"Sang-froid":72}, forces:["Finition","Vision"], faiblesses:["Vitesse","Tacle"] },
  { id:"djilani", nom:"Djilani", domaine:"Cybersécurité", poste:"Défenseur / Gardien", slogan:"Le pare-feu humain", profil:"Spécialiste", tier:3, traits:["Mur défensif","Gardien hybride"], bio:"Djilani protège les buts comme il protège un réseau : RIEN ne passe sans autorisation. Chaque attaquant est traité comme une menace potentielle et neutralisé avec un tacle à 90 de précision. Il peut même passer gardien — un vrai honeypot humain. En revanche, en attaque, il a autant de créativité qu'un mot de passe « 123456 ».", attributs:{Finition:42,Tacle:90,Dribble:44,Endurance:72,Force:86,Vitesse:56,Vision:64,"Sang-froid":90}, forces:["Tacle","Sang-froid"], faiblesses:["Finition","Dribble"] },
  { id:"mederic", nom:"Médéric", domaine:"Electronique et Bancaire", poste:"Ailier", slogan:"La dynamite imprévisible", profil:"High risk-high reward", tier:2, traits:["Sprinteur","Dynamiteur"], bio:"Médéric est un condensateur humain : il accumule l'énergie et la libère d'un coup dans un sprint dévastateur à 90 de vitesse. Ses dribbles sont aussi créatifs qu'un circuit imprimé custom. Le hic ? Son sang-froid est coté en bourse — et c'est un jour de krach permanent. Quand ça passe, c'est le génie ; quand ça casse, c'est le court-circuit.", attributs:{Finition:74,Tacle:58,Dribble:82,Endurance:72,Force:62,Vitesse:90,Vision:74,"Sang-froid":48}, forces:["Vitesse","Dribble"], faiblesses:["Sang-froid","Tacle"] },
  { id:"guillaume", nom:"Guillaume", domaine:"Agroalimentaire", poste:"Milieu défensif", slogan:"Le chasseur de ballons", profil:"Spécialiste", tier:2, traits:["Chasseur","Endurant"], bio:"Guillaume arpente le terrain comme il arpente les lignes de production : sans relâche, à fond, et avec un contrôle qualité impitoyable sur chaque ballon. Avec 88 de vitesse et 86 d'endurance, il presse l'adversaire comme on presse des agrumes — jusqu'à la dernière goutte d'énergie. Par contre, pour la finition et la vision, c'est la date de péremption qui est dépassée.", attributs:{Finition:52,Tacle:80,Dribble:66,Endurance:86,Force:68,Vitesse:88,Vision:50,"Sang-froid":70}, forces:["Vitesse","Endurance"], faiblesses:["Vision","Finition"] },
  { id:"patrice", nom:"Patrice", domaine:"Business", poste:"Défenseur", slogan:"Le cerveau du fond", profil:"Spécialiste", tier:3, traits:["Stratège","Placement"], bio:"Patrice gère la défense comme un conseil d'administration : avec autorité, vision stratégique et zéro sprint. Sa vision du jeu à 90 lui permet de lire les attaques adverses comme un bilan comptable. Il est toujours au bon endroit, non pas parce qu'il court vite — avec 44 de vitesse il est classé « mobilier » — mais parce qu'il sait exactement où se placer. Le CEO de l'arrière-garde.", attributs:{Finition:56,Tacle:80,Dribble:52,Endurance:68,Force:68,Vitesse:44,Vision:90,"Sang-froid":82}, forces:["Vision","Sang-froid"], faiblesses:["Vitesse","Dribble"] },
];

// ─── DATA: POWER-UPS ─────────────────────────────────────────
const POWER_UPS = [
  { id:"pu_informatique_hotfix", domaine:"Informatique", joueur:"roland", nom:"Hotfix de Production", cooldown:450, duree:40, type:"contrôle", effets:"+10 Vision, +8 Sang-froid", buffs:{Vision:10,"Sang-froid":8,Vitesse:-6} },
  { id:"pu_informatique_stackoverflow", domaine:"Informatique", joueur:"henry", nom:"Stack Overflow", cooldown:500, duree:35, type:"défense", effets:"+12 Tacle, +10 Endurance", buffs:{Tacle:12,Endurance:10,Vision:-10} },
  { id:"pu_informatique_loadbalancer", domaine:"Informatique", joueur:"lucien", nom:"Load Balancer", cooldown:480, duree:45, type:"contrôle", effets:"+12 Vision, +6 Tacle", buffs:{Vision:12,Tacle:6,Vitesse:-8} },
  { id:"pu_physique_meca_vecteur", domaine:"Physique et Mécanique", joueur:"loic", nom:"Tir Vectoriel", cooldown:500, duree:30, type:"attaque", effets:"+12 Finition, +6 Force", buffs:{Finition:12,Force:6,Tacle:-10} },
  { id:"pu_bio_chimie_adn", domaine:"Biologie et Chimie", joueur:"david", nom:"Édition d'ADN", cooldown:420, duree:40, type:"attaque", effets:"+14 Dribble, +8 Vitesse", buffs:{Dribble:14,Vitesse:8,Endurance:-10} },
  { id:"pu_physique_chimie_plasma", domaine:"Physique et Chimie", joueur:"thibault", nom:"Stabilité Plasma", cooldown:480, duree:40, type:"contrôle", effets:"+8 Dribble, +8 Tacle, +8 Sang-froid", buffs:{Dribble:8,Tacle:8,"Sang-froid":8} },
  { id:"pu_mathematiques_proof", domaine:"Mathématiques", joueur:"theo", nom:"Preuve par l'Absurde", cooldown:400, duree:35, type:"défense", effets:"+10 Tacle, +6 Endurance", buffs:{Tacle:10,Endurance:6} },
  { id:"pu_bio_medecine_triage", domaine:"Biologie et Médecine", joueur:"franck", nom:"Protocole de Triage", cooldown:550, duree:50, type:"mental", effets:"+8 Sang-froid, récup endurance", buffs:{"Sang-froid":8,Finition:6}, healStamina:25 },
  { id:"pu_chimie_catalyse", domaine:"Chimie", joueur:"aurelien", nom:"Catalyse Sociale", cooldown:460, duree:40, type:"mental", effets:"+10 Vision, provocation", buffs:{Vision:10,Tacle:6}, debuffOpponents:{"Sang-froid":-8} },
  { id:"pu_electronique_overclock", domaine:"Electronique", joueur:"romain", nom:"Overclock Contrôlé", cooldown:440, duree:35, type:"attaque", effets:"+12 Vitesse, +6 Dribble", buffs:{Vitesse:12,Dribble:6,Tacle:-8} },
  { id:"pu_math_bancaire_arbitrage", domaine:"Mathématiques et Bancaire", joueur:"joffrey", nom:"Arbitrage d'Opportunité", cooldown:520, duree:40, type:"contrôle", effets:"+12 Vision, +6 Finition", buffs:{Vision:12,Finition:6,Force:-8} },
  { id:"pu_subventions_goldenfile", domaine:"Aides directes, Subventions", joueur:"yacine", nom:"Dossier Béton", cooldown:600, duree:35, type:"attaque", effets:"+12 Sang-froid, +8 Finition", buffs:{"Sang-froid":12,Finition:8,Vitesse:-10} },
  { id:"pu_cyber_firewall", domaine:"Cybersécurité", joueur:"djilani", nom:"Pare-feu Total", cooldown:500, duree:40, type:"défense", effets:"+12 Tacle, +10 Force", buffs:{Tacle:12,Force:10,Finition:-12} },
  { id:"pu_elec_bancaire_liquidite", domaine:"Electronique et Bancaire", joueur:"mederic", nom:"Injection de Liquidité", cooldown:580, duree:40, type:"attaque", effets:"+10 Vitesse, +8 Dribble", buffs:{Vitesse:10,Dribble:8,"Sang-froid":-10} },
  { id:"pu_agro_geo_terrain", domaine:"Agroalimentaire", joueur:"guillaume", nom:"Extrusion Intensive", cooldown:470, duree:50, type:"défense", effets:"+8 Vitesse, +10 Endurance", buffs:{Vitesse:8,Endurance:10,Vision:-6} },
  { id:"pu_business_boardcall", domaine:"Business", joueur:"patrice", nom:"Board Call", cooldown:650, duree:45, type:"contrôle", effets:"+12 Vision, +8 Tacle", buffs:{Vision:12,Tacle:8,Vitesse:-8} },
];

// ─── DATA: MOTEUR NARRATIF PAR DOMAINE ──────────────────────
const NARRATION_DOMAINE = {
  "Informatique": {
    but_marque: [
      "BUUUT ! {joueur} force l'écriture sur le disque dur des filets ! Commit validé !",
      "Kernel panic dans la surface ! {joueur} compile un but en temps réel !",
      "{joueur} exécute un fork() parfait et envoie le ballon dans un thread parallèle : les filets !",
      "SELECT * FROM goals WHERE shooter = '{joueur}' → 1 row returned ! BUUUT !",
    ],
    tir_rate: [
      "Erreur de segmentation ! {joueur} a tenté d'accéder à une zone mémoire interdite !",
      "Le code de {joueur} ne compile pas ! Frappe complètement dévissée !",
      "404 : cadre introuvable ! {joueur} a visé une URL qui n'existe pas !",
    ],
    tacle_reussi: [
      "Pare-feu activé ! {joueur} bloque l'intrusion avec autorité !",
      "{joueur} déploie un patch de sécurité d'urgence ! L'attaquant est neutralisé !",
      "sudo rm -rf attaque ! {joueur} supprime tout sans demander la permission !",
    ],
    dribble_reussi: [
      "{joueur} contourne le firewall adverse avec un exploit zero-day !",
      "Buffer overflow ! {joueur} déborde par la gauche et plante le défenseur !",
    ],
    passe_decisive: [
      "Passe en fibre optique ! {joueur} transmet le paquet à la vitesse de la lumière !",
      "TCP handshake parfait entre {joueur} et son receveur ! Connexion établie !",
    ],
    faute: [
      "Débordement de tampon ! {joueur} franchit la limite du règlement !",
      "Stack overflow de {joueur} ! Trop d'agressivité dans la pile d'appels !",
    ],
  },
  "Physique et Mécanique": {
    but_marque: [
      "BUUUT ! {joueur} applique le principe fondamental de la dynamique : F = m × accélération dans les filets !",
      "Énergie cinétique maximale ! {joueur} transforme le potentiel en but avec un rendement de 100% !",
      "Le vecteur vitesse de la frappe de {joueur} pointait droit dans la lucarne ! Imparable !",
    ],
    tir_rate: [
      "{joueur} a surestimé le coefficient de friction ! Le ballon s'envole en orbite !",
      "Erreur d'angle de tir ! {joueur} a oublié la composante de gravité dans son calcul !",
    ],
    tacle_reussi: [
      "{joueur} applique le 3e principe de Newton : chaque action a une réaction ! Tacle parfait !",
      "Choc élastique ! {joueur} récupère toute l'énergie cinétique du duel !",
    ],
    dribble_reussi: [
      "{joueur} exploite le moment d'inertie du défenseur pour le contourner !",
      "Mouvement pendulaire de {joueur} ! Le défenseur oscille dans le mauvais sens !",
    ],
    passe_decisive: [
      "{joueur} calcule la trajectoire balistique parfaite ! Passe millimétrée !",
      "Transfert d'énergie optimal de {joueur} vers son coéquipier !",
    ],
    faute: [
      "Force excessive ! {joueur} a dépassé le seuil de résistance mécanique du règlement !",
    ],
  },
  "Biologie et Chimie": {
    but_marque: [
      "BUUUT ! {joueur} crée une liaison covalente irréversible avec les filets !",
      "Mutation majeure du score ! {joueur} est le catalyseur de cette réaction en chaîne !",
      "{joueur} a synthétisé le but parfait ! La formule chimique est limpide !",
    ],
    tir_rate: [
      "Réaction endothermique ratée ! {joueur} n'a pas atteint l'énergie d'activation !",
      "Le substrat de {joueur} n'a pas trouvé le site actif du but ! Frappe à côté !",
    ],
    tacle_reussi: [
      "Anticorps activé ! {joueur} neutralise l'intrus avec un tacle immunitaire parfait !",
      "{joueur} agit comme un inhibiteur compétitif : il bloque le site actif de l'attaquant !",
    ],
    dribble_reussi: [
      "{joueur} mute de direction comme un virus qui échappe aux anticorps !",
      "Osmose inverse ! {joueur} traverse la membrane défensive sans résistance !",
    ],
    passe_decisive: [
      "Symbiose parfaite ! {joueur} nourrit son coéquipier d'un caviar cellulaire !",
      "{joueur} active la transduction du signal : passe reçue, action déclenchée !",
    ],
    faute: [
      "Réaction inflammatoire ! {joueur} déclenche une cascade immunitaire non contrôlée !",
    ],
  },
  "Physique et Chimie": {
    but_marque: [
      "BUUUT ! {joueur} brise la symétrie du score avec une précision quantique !",
      "{joueur} déclenche une fusion froide dans les filets ! Quel missile thermonucléaire !",
      "Réaction exothermique dans la surface ! {joueur} libère toute l'énergie dans le but !",
    ],
    tir_rate: [
      "L'asymptote de {joueur} ! La trajectoire se rapproche du but mais ne rentre jamais !",
      "{joueur} a mal dosé la stœchiométrie de sa frappe ! Trop de puissance, pas assez de direction !",
    ],
    tacle_reussi: [
      "{joueur} stabilise la réaction adverse avec un tacle issu du tableau périodique !",
      "Neutralisation acido-basique ! {joueur} équilibre le pH du milieu de terrain !",
    ],
    dribble_reussi: [
      "{joueur} navigue entre les états de la matière : solide en défense, liquide en attaque !",
      "Effet tunnel quantique ! {joueur} passe à travers le défenseur !",
    ],
    passe_decisive: [
      "Transfert d'électrons parfait ! {joueur} crédite son partenaire d'une énergie pure !",
    ],
    faute: [
      "Réaction explosive non maîtrisée ! {joueur} a provoqué une détonation interdite !",
    ],
  },
  "Mathématiques": {
    but_marque: [
      "BUUUT ! {joueur} résout l'équation du score avec une solution élégante !",
      "CQFD ! {joueur} démontre par l'exemple que le ballon rentre dans les filets !",
      "{joueur} trouve la racine du problème : il fallait tirer ! Théorème du but validé !",
    ],
    tir_rate: [
      "Division par zéro ! {joueur} tente l'impossible et le résultat est indéfini !",
      "{joueur} a convergé vers le mauvais résultat ! La suite ne tend pas vers le but !",
    ],
    tacle_reussi: [
      "{joueur} factorise l'attaque adverse ! Tout est réduit à sa plus simple expression !",
      "Théorème de l'interception démontré par {joueur} ! La preuve est irréfutable !",
    ],
    dribble_reussi: [
      "{joueur} décrit une courbe de Bézier autour du défenseur !",
      "Transformation de Fourier ! {joueur} change de fréquence et passe à côté du défenseur !",
    ],
    passe_decisive: [
      "{joueur} optimise le chemin le plus court entre deux points ! Passe algorithmique !",
    ],
    faute: [
      "Erreur d'arrondi fatale ! {joueur} a mal calibré l'intensité de son intervention !",
    ],
  },
  "Electronique": {
    but_marque: [
      "BUUUT ! {joueur} fait sauter les plombs de la cage adverse ! Surcharge de tension !",
      "Signal reçu 5 sur 5 ! {joueur} convertit l'analogique en but numérique !",
      "Court-circuit dans la défense ! {joueur} envoie la décharge dans les filets !",
    ],
    tir_rate: [
      "Interférence destructive ! Le signal de {joueur} est brouillé devant le but !",
      "{joueur} a envoyé un signal parasite ! Le ballon ne trouve pas le récepteur !",
    ],
    tacle_reussi: [
      "C'est un court-circuit propre ! {joueur} coupe le courant adverse !",
      "{joueur} débranche l'attaquant du circuit ! Tacle haute tension !",
    ],
    dribble_reussi: [
      "{joueur} module sa fréquence et passe à travers le filtre défensif !",
      "Signal alternatif de {joueur} ! Il change de polarité et efface le défenseur !",
    ],
    passe_decisive: [
      "{joueur} transmet sur la bonne fréquence ! Réception parfaite du partenaire !",
    ],
    faute: [
      "Surtension ! {joueur} a grillé le fusible du règlement !",
    ],
  },
  "Biologie et Médecine": {
    but_marque: [
      "BUUUT ! Le diagnostic est sans appel : {joueur} a fracturé la défense adverse !",
      "Injection létale de {joueur} dans les filets ! Le gardien est sous anesthésie !",
      "{joueur} prescrit un but ! Posologie : une frappe, résultat immédiat !",
    ],
    tir_rate: [
      "Hémorragie de points ! {joueur} rate l'immanquable ! Pronostic vital engagé !",
      "Le traitement de {joueur} n'a pas fonctionné ! Le tir est hors cible, le patient survit !",
    ],
    tacle_reussi: [
      "Intervention chirurgicale ! {joueur} ampute l'adversaire de son ballon !",
      "{joueur} isole le virus attaquant avec une quarantaine de tacle !",
    ],
    dribble_reussi: [
      "{joueur} contourne les défenses immunitaires comme un virus à ARN mutant !",
      "Effet placebo sur le défenseur ! {joueur} fait croire qu'il va à gauche et passe à droite !",
    ],
    passe_decisive: [
      "Transfusion réussie ! {joueur} injecte le ballon dans les veines de son coéquipier !",
    ],
    faute: [
      "Erreur médicale ! {joueur} a prescrit un tacle beaucoup trop agressif !",
    ],
  },
  "Chimie": {
    but_marque: [
      "BUUUT ! {joueur} provoque une réaction en chaîne et tout explose dans la surface !",
      "Précipitation immédiate ! {joueur} catalyse le score en sa faveur !",
    ],
    tir_rate: [
      "Solution diluée ! {joueur} manque de concentration devant le but !",
      "{joueur} a raté la titration ! Le dosage de la frappe est complètement faux !",
    ],
    tacle_reussi: [
      "{joueur} neutralise l'acide attaquant avec un tacle basique ! pH = 7 !",
      "Réaction de neutralisation ! {joueur} précipite l'attaque adverse !",
    ],
    dribble_reussi: [
      "{joueur} est en solution aqueuse ! Il glisse entre les défenseurs comme un solvant !",
    ],
    passe_decisive: [
      "Catalyse assistée ! {joueur} accélère la réaction vers le but avec une passe parfaite !",
    ],
    faute: [
      "Explosion non contrôlée ! {joueur} a mélangé les mauvais réactifs dans son tacle !",
    ],
  },
  "Cybersécurité": {
    but_marque: [
      "BUUUT ! {joueur} pénètre le système adverse avec une attaque brute force !",
      "Brèche dans le firewall ! {joueur} injecte le ballon directement dans les filets !",
    ],
    tir_rate: [
      "Accès refusé ! La frappe de {joueur} est interceptée par le WAF adverse !",
      "{joueur} a lancé un exploit, mais le système est patché ! Tir à côté !",
    ],
    tacle_reussi: [
      "{joueur} déploie un IDS en temps réel ! Intrusion détectée et bloquée !",
      "Zero trust ! {joueur} ne fait confiance à aucun attaquant et tacle tout ce qui bouge !",
    ],
    dribble_reussi: [
      "{joueur} utilise un VPN et change d'adresse IP ! Le défenseur ne sait plus où il est !",
    ],
    passe_decisive: [
      "Tunnel SSH établi ! {joueur} fait transiter le ballon de manière sécurisée !",
    ],
    faute: [
      "Attaque DDoS ! {joueur} submerge l'adversaire avec trop de force ! Carton !",
    ],
  },
  "Mathématiques et Bancaire": {
    but_marque: [
      "BUUUT ! {joueur} maximise son ROI avec un tir à haute valeur ajoutée !",
      "Arbitrage parfait ! {joueur} achète bas et vend haut : ça fait 1-0 !",
      "{joueur} liquide l'actif adverse avec un but à rendement exceptionnel !",
    ],
    tir_rate: [
      "C'est une perte sèche ! {joueur} a dilapidé son capital devant le but !",
      "Le portefeuille de {joueur} est dans le rouge ! Investissement raté devant la cage !",
    ],
    tacle_reussi: [
      "{joueur} applique un stop-loss sur l'attaquant ! Les pertes sont limitées !",
      "Audit en cours ! {joueur} contrôle l'attaquant et lui retire ses actifs !",
    ],
    dribble_reussi: [
      "{joueur} diversifie ses mouvements comme un portefeuille bien géré !",
    ],
    passe_decisive: [
      "Virement instantané ! {joueur} crédite son partenaire d'un caviar sans commission !",
    ],
    faute: [
      "Fraude détectée ! {joueur} a utilisé des méthodes non réglementaires !",
    ],
  },
  "Aides directes, Subventions": {
    but_marque: [
      "BUUUT ! {joueur} décroche la subvention ultime : un but en pleine lucarne !",
      "Dossier validé ! {joueur} a rempli toutes les cases et empoche le financement : BUUUT !",
      "{joueur} transforme l'aide directe en but direct ! Taux de conversion 100% !",
    ],
    tir_rate: [
      "Dossier incomplet ! La frappe de {joueur} est rejetée par la commission !",
      "{joueur} a dépassé le délai de dépôt ! Le tir arrive trop tard, hors cadre !",
    ],
    tacle_reussi: [
      "{joueur} oppose un refus administratif catégorique à l'attaquant ! Dossier classé !",
    ],
    dribble_reussi: [
      "{joueur} contourne la bureaucratie défensive avec un dossier annexe !",
    ],
    passe_decisive: [
      "{joueur} redistribue les fonds avec une passe de subvention millimétrée !",
    ],
    faute: [
      "Détournement de fonds ! {joueur} y est allé trop fort, l'arbitre intervient !",
    ],
  },
  "Electronique et Bancaire": {
    but_marque: [
      "BUUUT ! {joueur} effectue un virement express dans les filets ! Transaction validée !",
      "Surcharge du circuit bancaire ! {joueur} fait sauter la banque adverse avec un but explosif !",
    ],
    tir_rate: [
      "Transaction refusée ! La frappe de {joueur} n'a pas été autorisée !",
      "{joueur} a envoyé le ballon sur un compte offshore ! Complètement hors cadre !",
    ],
    tacle_reussi: [
      "{joueur} gèle les actifs de l'attaquant ! Opposition sur compte immédiate !",
    ],
    dribble_reussi: [
      "{joueur} effectue un virement rapide de direction ! Le défenseur est débité !",
    ],
    passe_decisive: [
      "Paiement instantané de {joueur} ! Le ballon est transféré sans frais !",
    ],
    faute: [
      "Opération frauduleuse ! {joueur} a forcé la transaction ! L'arbitre annule tout !",
    ],
  },
  "Agroalimentaire": {
    but_marque: [
      "BUUUT ! {joueur} presse la défense comme un agrume et en extrait le jus : un but !",
      "Produit fini ! {joueur} transforme la matière première en but de qualité supérieure !",
      "Label rouge ! {joueur} livre un but artisanal d'exception dans les filets !",
    ],
    tir_rate: [
      "Date de péremption dépassée ! La frappe de {joueur} est avariée, à côté !",
      "Contrôle qualité négatif ! Le tir de {joueur} ne respecte pas les normes !",
    ],
    tacle_reussi: [
      "{joueur} retire le produit défectueux du rayon ! Tacle de rappel immédiat !",
      "{joueur} applique la chaîne du froid sur l'attaquant : gelé sur place !",
    ],
    dribble_reussi: [
      "{joueur} se faufile dans les rayons adverses comme un produit en promotion !",
    ],
    passe_decisive: [
      "Livraison express de {joueur} ! Passe en circuit court, directement au consommateur !",
    ],
    faute: [
      "Rappel produit ! {joueur} a dépassé les doses autorisées dans son intervention !",
    ],
  },
  "Business": {
    but_marque: [
      "BUUUT ! {joueur} conclut le deal du siècle avec une frappe de PDG !",
      "Board meeting terminé ! {joueur} vote OUI pour un but à l'unanimité !",
      "{joueur} signe le contrat dans les filets ! Closing réussi, champagne !",
    ],
    tir_rate: [
      "Le pitch de {joueur} n'a pas convaincu les investisseurs ! Tir hors cible !",
      "Due diligence ratée ! {joueur} a mal évalué l'opportunité devant le but !",
    ],
    tacle_reussi: [
      "{joueur} pose un véto stratégique ! L'attaquant est renvoyé en salle d'attente !",
      "OPA hostile de {joueur} ! Il prend le contrôle du ballon sans négocier !",
    ],
    dribble_reussi: [
      "{joueur} pivote son business model et contourne le défenseur !",
    ],
    passe_decisive: [
      "{joueur} délègue avec brio ! Le ballon est transmis au bon département !",
    ],
    faute: [
      "Clause abusive ! {joueur} a dépassé les termes du contrat ! L'arbitre sanctionne !",
    ],
  },
};

// Fallback générique si domaine non trouvé
const NARRATION_DEFAULT = {
  but_marque: ["BUUUT ! {joueur} fait trembler les filets !", "{joueur} marque ! Quel but superbe !"],
  tir_rate: ["{joueur} tire à côté ! C'était pourtant jouable !", "Raté ! {joueur} ne trouve pas le cadre !"],
  tacle_reussi: ["Intervention parfaite de {joueur} !", "{joueur} récupère le ballon proprement !"],
  dribble_reussi: ["{joueur} élimine son vis-à-vis avec classe !", "Quel dribble de {joueur} !"],
  passe_decisive: ["Passe décisive de {joueur} ! Quelle vision !", "{joueur} sert son partenaire sur un plateau !"],
  faute: ["{joueur} y va trop fort ! L'arbitre siffle !", "Faute de {joueur} ! Coup franc !"],
  arret: ["Arrêt phénoménal du gardien ! La muraille tient !", "Quel réflexe ! Le gardien repousse le danger !"],
  power_up: ["ALERTE ! {joueur} active {pu} ! Les paramètres changent !", "{joueur} déchaîne {pu} ! Boost activé !"],
};

function pickNarration(cat, vars = {}, domaine = null) {
  const pool = domaine && NARRATION_DOMAINE[domaine] && NARRATION_DOMAINE[domaine][cat]
    ? NARRATION_DOMAINE[domaine][cat]
    : NARRATION_DEFAULT[cat];
  if (!pool || pool.length === 0) return "";
  const t = pool[Math.floor(Math.random() * pool.length)];
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), t);
}

// ─── FORMATIONS ──────────────────────────────────────────────
const FORMATIONS = {
  "2-2": { label: "2-2 — Classique", roles: ["Gardien", "Défenseur", "Défenseur", "Milieu", "Attaquant"], positions: [{x:8,y:50},{x:25,y:25},{x:25,y:75},{x:55,y:50},{x:80,y:50}] },
  "1-2-1": { label: "1-2-1 — Losange", roles: ["Gardien", "Défenseur", "Milieu", "Milieu", "Attaquant"], positions: [{x:8,y:50},{x:30,y:50},{x:50,y:25},{x:50,y:75},{x:78,y:50}] },
  "2-1-1": { label: "2-1-1 — Muraille", roles: ["Gardien", "Défenseur", "Défenseur", "Milieu", "Attaquant"], positions: [{x:8,y:50},{x:25,y:30},{x:25,y:70},{x:50,y:50},{x:78,y:50}] },
  "1-1-2": { label: "1-1-2 — Offensif", roles: ["Gardien", "Défenseur", "Milieu", "Ailier", "Attaquant"], positions: [{x:8,y:50},{x:28,y:50},{x:48,y:50},{x:65,y:25},{x:75,y:75}] },
};

// ─── STRATÉGIES D'ÉQUIPE ────────────────────────────────────
const STRATEGIES = [
  { id: "equilibre", nom: "⚖️ Équilibre Thermodynamique", desc: "Jeu équilibré, aucun risque. Comme un système à l'état stationnaire.", modifiers: {}, speedMod: 1.0, pressRange: 25, shootBias: 0 },
  { id: "pressing", nom: "🔬 Pression Osmotique", desc: "Pressing intense ! Les joueurs migrent vers le ballon comme des molécules sous gradient de concentration.", modifiers: { Tacle: 6, Endurance: -4 }, speedMod: 1.15, pressRange: 40, shootBias: 0 },
  { id: "counter", nom: "⚡ Réaction en Chaîne", desc: "Défense compacte puis contre-attaque fulgurante. L'énergie est stockée puis libérée d'un coup.", modifiers: { Vitesse: 5, "Sang-froid": 4, Dribble: -4 }, speedMod: 0.9, pressRange: 18, shootBias: 5 },
  { id: "possession", nom: "🧬 Réplication d'ADN", desc: "Conservation du ballon obsessionnelle. Passes courtes et précises comme une polymérase qui ne lâche jamais le brin.", modifiers: { Vision: 8, Dribble: 4, Vitesse: -6 }, speedMod: 0.85, pressRange: 20, shootBias: -5 },
  { id: "attack", nom: "☢️ Fission Nucléaire", desc: "Attaque totale ! On fissionne la défense adverse. Risque de meltdown défensif.", modifiers: { Finition: 8, Vitesse: 4, Tacle: -8, "Sang-froid": -4 }, speedMod: 1.1, pressRange: 35, shootBias: 10 },
  { id: "park_bus", nom: "🛡️ Effet Faraday", desc: "Cage défensive impénétrable. Comme un blindage électromagnétique, rien ne rentre.", modifiers: { Tacle: 8, "Sang-froid": 6, Finition: -8, Dribble: -4 }, speedMod: 0.8, pressRange: 15, shootBias: -8 },
];

// ─── SIMULATION ENGINE v2 — Réaliste avec positions continues ──
class SimpleMatchEngine {
  constructor(homeTeam, awayTeam, homeFormation, awayFormation, homeStrategy, awayStrategy) {
    this.home = { players: homeTeam, score: 0, formation: homeFormation };
    this.away = { players: awayTeam, score: 0, formation: awayFormation };
    this.homeStrategy = homeStrategy || STRATEGIES[0];
    this.awayStrategy = awayStrategy || STRATEGIES[0];
    this.events = [];
    this.time = 0;
    this.maxTime = 1800;
    this.powerUpCooldowns = {};
    this.activePowerUps = [];
    this.staminas = {};

    // Field: 100 x 60 (width x height), goals at x=0 and x=100
    this.ball = { x: 50, y: 30 };
    this.ballOwner = null;
    this.ballTarget = null;
    this.ballSpeed = 0;
    this.passReceiver = null;
    this.shotData = null;
    this.phase = "kickoff"; // kickoff, play, passing, shooting, goal_celebration, foul_pause
    this.phaseTimer = 0;
    this.possession = "home";
    this.lastEvent = 0;

    this.players = {};
    this.homePositions = {};
    this.awayPositions = {};
    this.playerTargets = {};

    const homeForm = FORMATIONS[homeFormation] || FORMATIONS["2-2"];
    const awayForm = FORMATIONS[awayFormation] || FORMATIONS["2-2"];

    homeTeam.forEach((p, i) => {
      const fp = homeForm.positions[i] || { x: 50, y: 50 };
      const bx = 2 + fp.x * 0.46;
      const by = 5 + fp.y * 0.50;
      this.players[p.id] = { x: bx, y: by, team: "home", speed: (p.attributs.Vitesse || 60) / 99 * 0.70 + 0.16 };
      this.homePositions[p.id] = { x: bx, y: by };
      this.playerTargets[p.id] = { x: bx, y: by };
      this.staminas[p.id] = 100;
    });

    awayTeam.forEach((p, i) => {
      const fp = awayForm.positions[i] || { x: 50, y: 50 };
      const bx = 98 - fp.x * 0.46;
      const by = 5 + fp.y * 0.50;
      this.players[p.id] = { x: bx, y: by, team: "away", speed: (p.attributs.Vitesse || 60) / 99 * 0.70 + 0.16 };
      this.awayPositions[p.id] = { x: bx, y: by };
      this.playerTargets[p.id] = { x: bx, y: by };
      this.staminas[p.id] = 100;
    });

    const homeMid = homeTeam.find(p => { const pos = this.players[p.id]; return pos && pos.x > 15 && pos.x < 40; }) || homeTeam[Math.floor(homeTeam.length / 2)];
    this.ballOwner = homeMid.id;
    this.ball.x = this.players[homeMid.id].x;
    this.ball.y = this.players[homeMid.id].y;
  }

  getAllPlayers() { return [...this.home.players, ...this.away.players]; }
  getPlayer(id) { return this.getAllPlayers().find(p => p.id === id); }
  getTeamOf(id) { return this.players[id]?.team || "home"; }
  getTeamPlayers(team) { return team === "home" ? this.home.players : this.away.players; }
  getOpponentTeam(team) { return team === "home" ? "away" : "home"; }
  getDomaine(player) { return player.domaine || null; }

  getAttr(player, attr) {
    let val = player.attributs[attr] || 50;
    for (const pu of this.activePowerUps) {
      if (pu.playerId === player.id && pu.expiresAt > this.time && pu.buffs) {
        val += (pu.buffs[attr] || 0);
      }
    }
    // Strategy modifiers
    if (this.homeStrategy && this.home.players.find(p => p.id === player.id)) {
      val += (this.homeStrategy.modifiers?.[attr] || 0);
    }
    if (this.awayStrategy && this.away.players.find(p => p.id === player.id)) {
      val += (this.awayStrategy.modifiers?.[attr] || 0);
    }
    const stam = this.staminas[player.id] || 100;
    if (stam < 50) val *= 0.85 + 0.15 * (stam / 50);
    return Math.min(99, Math.max(1, val));
  }

  dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }
  moveToward(pos, target, speed) { const d = this.dist(pos, target); if (d < speed) return { x: target.x, y: target.y }; const r = speed / d; return { x: pos.x + (target.x - pos.x) * r, y: pos.y + (target.y - pos.y) * r }; }
  clampField(p) { return { x: Math.max(1, Math.min(99, p.x)), y: Math.max(1, Math.min(59, p.y)) }; }

  findPassTarget(playerId) {
    const team = this.getTeamOf(playerId); const teammates = this.getTeamPlayers(team).filter(p => p.id !== playerId);
    const myPos = this.players[playerId]; const fwd = team === "home" ? 1 : -1;
    let best = null, bestScore = -Infinity;
    for (const t of teammates) { const tp = this.players[t.id]; const dx = (tp.x - myPos.x) * fwd; const d = this.dist(myPos, tp); const score = dx * 0.5 - d * 0.3 + Math.random() * 8; if (score > bestScore) { bestScore = score; best = t; } }
    return best;
  }

  findNearestOpponent(pos, team) {
    const opps = this.getTeamPlayers(this.getOpponentTeam(team));
    let nearest = null, minD = Infinity;
    for (const o of opps) { const d = this.dist(pos, this.players[o.id]); if (d < minD) { minD = d; nearest = o; } }
    return { player: nearest, dist: minD };
  }

  simulateTick() {
    if (this.time >= this.maxTime) return false;
    this.time += 1;
    this.activePowerUps = this.activePowerUps.filter(pu => pu.expiresAt > this.time);
    for (const id of Object.keys(this.staminas)) {
      const team = this.players[id]?.team;
      const strat = this.getStrategyOf(team);
      const drainMod = strat?.id === "pressing" ? 1.6 : strat?.id === "attack" ? 1.3 : strat?.id === "park_bus" ? 0.7 : 1.0;
      this.staminas[id] = Math.max(0, this.staminas[id] - (0.016 + Math.random() * 0.006) * drainMod);
    }

    if (this.phase === "goal_celebration" || this.phase === "foul_pause" || this.phase === "kickoff") {
      this.phaseTimer--;
      if (this.phaseTimer <= 0) { this.phase = "play"; } else { return true; }
    }

    // Move players
    this.updatePlayerTargets();
    for (const p of this.getAllPlayers()) {
      const pos = this.players[p.id]; const tgt = this.playerTargets[p.id];
      const stamF = (this.staminas[p.id] || 100) / 100;
      const strat = this.getStrategyOf(pos.team);
      const spdMod = strat?.speedMod || 1.0;
      const spd = pos.speed * stamF * spdMod;
      const np = this.moveToward(pos, tgt, spd); const cl = this.clampField(np);
      pos.x = cl.x; pos.y = cl.y;
    }

    // Ball physics
    if (this.ballOwner) {
      const op = this.players[this.ballOwner]; this.ball.x = op.x; this.ball.y = op.y;
      this.looseBallTimer = 0;
    } else if (this.ballTarget) {
      const d = this.dist(this.ball, this.ballTarget);
      if (d < 1.5) { this.onBallArrived(); }
      else { const spd = this.ballSpeed || 2.4; const np = this.moveToward(this.ball, this.ballTarget, spd); this.ball.x = np.x; this.ball.y = np.y; this.checkInterceptions(); }
      // Safety: if ball has been traveling too long, force arrival
      this.looseBallTimer = (this.looseBallTimer || 0) + 1;
      if (this.looseBallTimer > 60) { this.ballTarget = null; this.passReceiver = null; this.shotData = null; this.phase = "play"; this.looseBallTimer = 0; }
    } else {
      // Loose ball — everyone eligible should rush toward it
      this.looseBallTimer = (this.looseBallTimer || 0) + 1;
      this.pickUpLooseBall();
      // Force nearby players to target ball
      if (!this.ballOwner) {
        for (const p of this.getAllPlayers()) {
          const d = this.dist(this.players[p.id], this.ball);
          const teamPlayers = this.getTeamPlayers(this.players[p.id].team);
          const isKeeper = teamPlayers[0] && teamPlayers[0].id === p.id;
          if (!isKeeper && d < 30) {
            this.playerTargets[p.id] = { x: this.ball.x, y: this.ball.y };
          }
        }
      }
    }

    // Decisions
    if (this.ballOwner && this.phase === "play" && this.time - this.lastEvent >= 4) { this.makeDecision(); }
    return true;
  }

  // Classify player role: 'attack', 'mid', 'defense' based on poste
  getRole(player) {
    const p = (player.poste || "").toLowerCase();
    if (p.includes("attaquant") || p.includes("ailier") || p.includes("offensif")) return "attack";
    if (p.includes("défenseur") || p.includes("gardien") || p.includes("défensif")) return "defense";
    return "mid";
  }

  // Assign Y lanes to non-keeper players so they spread across the pitch
  // Returns a fixed Y lane (0-60) for each player based on their index
  getLane(teamPlayers, idx) {
    // 4 outfield players (idx 1-4): spread across 4 lanes
    const lanes = [12, 24, 36, 48]; // well separated
    const outfieldIdx = idx - 1; // 0-3
    return lanes[Math.max(0, Math.min(3, outfieldIdx))] || 30;
  }

  updatePlayerTargets() {
    const ownerTeam = this.ballOwner ? this.getTeamOf(this.ballOwner) : this.possession;
    const ballX = this.ball.x; const ballY = this.ball.y;

    for (const p of this.getAllPlayers()) {
      const pos = this.players[p.id]; const isHome = pos.team === "home";
      const basePos = isHome ? this.homePositions[p.id] : this.awayPositions[p.id];
      if (!basePos) continue;
      const teamPlayers = this.getTeamPlayers(pos.team);
      const idx = teamPlayers.indexOf(p);
      const isKeeper = idx === 0;
      const attackGoalX = isHome ? 97 : 3;
      const ownGoalX = isHome ? 3 : 97;
      const fwdSign = isHome ? 1 : -1;
      const role = this.getRole(p);
      const myLane = this.getLane(teamPlayers, idx);
      const strat = this.getStrategyOf(pos.team);
      const stratId = strat?.id || "equilibre";
      const myTeamHasBall = pos.team === ownerTeam;
      let target;

      // ═══ BALL CARRIER: always runs forward (all strategies) ═══
      if (p.id === this.ballOwner) {
        if (isKeeper && stratId !== "possession" && stratId !== "attack") {
          // Keeper with ball in normal strategies: pass immediately (handled in makeDecision)
          target = { x: pos.x + fwdSign * 2, y: 30 };
        } else {
          target = { x: attackGoalX, y: myLane + (Math.random() - 0.5) * 4 };
        }
        this.playerTargets[p.id] = this.clampField(target);
        continue;
      }

      // ═══ STRATEGY-SPECIFIC POSITIONING ═══
      switch (stratId) {

        // ── PRESSING (Pression Osmotique): man-mark opponents ──
        case "pressing": {
          if (isKeeper) {
            const keepX = isHome ? 6 : 94; // slightly advanced keeper
            target = { x: keepX, y: Math.max(18, Math.min(42, 30 + (ballY - 30) * 0.5)) };
          } else {
            // Each outfield player marks the corresponding opponent
            const oppTeam = this.getTeamPlayers(this.getOpponentTeam(pos.team));
            const myOpp = oppTeam[idx] || oppTeam[oppTeam.length - 1]; // match by index
            const oppPos = this.players[myOpp.id];
            if (myTeamHasBall) {
              // Attacking: stay close to opponent but push forward
              target = { x: oppPos.x + fwdSign * 3, y: oppPos.y + (Math.random() - 0.5) * 4 };
            } else {
              // Defending: stick tight to opponent, try to intercept
              target = { x: oppPos.x + (Math.random() - 0.5) * 2, y: oppPos.y + (Math.random() - 0.5) * 2 };
            }
          }
          break;
        }

        // ── COUNTER (Réaction en Chaîne): park deep, one attacker waits high ──
        case "counter": {
          if (isKeeper) {
            target = { x: isHome ? 4 : 96, y: Math.max(18, Math.min(42, 30 + (ballY - 30) * 0.4)) };
          } else if (myTeamHasBall) {
            if (role === "attack" || idx === 4) {
              // THE attacker: sprint far ahead toward goal, wait for long ball
              target = { x: isHome ? Math.max(ballX + 15, 70) : Math.min(ballX - 15, 30), y: myLane + (Math.random() - 0.5) * 8 };
            } else {
              // Everyone else: stay deep near own goal
              const defX = isHome ? Math.min(30, basePos.x + 5) : Math.max(70, basePos.x - 5);
              target = { x: defX, y: myLane + (Math.random() - 0.5) * 4 };
            }
          } else {
            // Defending: everyone deep near own goal
            const wallX = isHome ? Math.min(25, basePos.x) : Math.max(75, basePos.x);
            target = { x: wallX, y: myLane + (ballY - myLane) * 0.2 };
            // Closest player presses
            const bp = this.ballOwner ? this.players[this.ballOwner] : this.ball;
            const nonKeepers = teamPlayers.filter((_, i) => i !== 0);
            const closest = nonKeepers.reduce((b, t) => { const d = this.dist(this.players[t.id], bp); return (!b || d < b.d) ? { id: t.id, d } : b; }, null);
            if (closest && closest.id === p.id && closest.d < 20) target = { x: bp.x, y: bp.y };
          }
          break;
        }

        // ── POSSESSION (Réplication d'ADN): short passes, everyone advances together, keeper sweeper ──
        case "possession": {
          if (isKeeper) {
            // SWEEPER KEEPER: comes out of box, plays as extra outfield player
            const keepX = isHome ? Math.min(ballX - 8, 30) : Math.max(ballX + 8, 70);
            target = { x: isHome ? Math.max(8, keepX) : Math.min(92, keepX), y: 30 + (ballY - 30) * 0.4 };
          } else if (myTeamHasBall) {
            // Everyone forms a tight cluster around ball, progressing slowly
            const clusterX = ballX + fwdSign * (3 + idx * 4);
            const clusterY = ballY + (myLane - 30) * 0.4;
            target = { x: isHome ? Math.min(90, clusterX) : Math.max(10, clusterX), y: clusterY };
          } else {
            // Defending: stay compact around ball, don't spread
            const bp = this.ballOwner ? this.players[this.ballOwner] : this.ball;
            const compactX = (bp.x + ownGoalX) / 2;
            target = { x: compactX + (idx - 2) * 5, y: bp.y + (myLane - 30) * 0.3 };
          }
          break;
        }

        // ── ATTACK (Fission Nucléaire): everyone attacks, keeper at halfway ──
        case "attack": {
          if (isKeeper) {
            // ADVENTUROUS KEEPER: pushes to halfway line!
            const advX = isHome ? Math.min(ballX - 5, 45) : Math.max(ballX + 5, 55);
            target = { x: isHome ? Math.max(10, advX) : Math.min(90, advX), y: 30 + (ballY - 30) * 0.3 };
          } else if (myTeamHasBall) {
            // EVERYONE pushes into opponent half, flood the box
            const pushX = ballX + fwdSign * (8 + idx * 6);
            const tx = isHome ? Math.min(94, Math.max(40, pushX)) : Math.max(6, Math.min(60, pushX));
            target = { x: tx, y: myLane + (Math.random() - 0.5) * 6 };
          } else {
            // Even defending: stay high, press aggressively
            const bp = this.ballOwner ? this.players[this.ballOwner] : this.ball;
            target = { x: bp.x + fwdSign * (idx * 3), y: bp.y + (myLane - 30) * 0.3 };
          }
          break;
        }

        // ── PARK BUS (Effet Faraday): everyone defends, even attackers ──
        case "park_bus": {
          if (isKeeper) {
            target = { x: isHome ? 3 : 97, y: Math.max(18, Math.min(42, 30 + (ballY - 30) * 0.5)) };
          } else if (myTeamHasBall) {
            if (p.id === this.ballOwner) break; // already handled above
            // Everyone stays in own half, very conservative
            const safeX = isHome ? Math.min(40, basePos.x + fwdSign * 5) : Math.max(60, basePos.x + fwdSign * 5);
            target = { x: safeX, y: myLane + (Math.random() - 0.5) * 4 };
          } else {
            // WALL: everyone forms a defensive wall near own goal
            const wallX = isHome ? 12 + idx * 4 : 88 - idx * 4;
            target = { x: wallX, y: myLane + (ballY - myLane) * 0.25 };
            // Closest presses
            const bp = this.ballOwner ? this.players[this.ballOwner] : this.ball;
            const d = this.dist(pos, bp);
            if (d < 12) target = { x: bp.x, y: bp.y };
          }
          break;
        }

        // ── DEFAULT (Équilibre Thermodynamique): balanced ──
        default: {
          if (isKeeper) {
            const keepBaseX = isHome ? 4 : 96;
            const boxMinX = isHome ? 0 : 82; const boxMaxX = isHome ? 18 : 100;
            const ballInBox = ballX >= boxMinX && ballX <= boxMaxX && ballY >= 12 && ballY <= 48;
            if (ballInBox && !this.ballOwner) { target = { x: ballX, y: ballY }; }
            else if (ballInBox && this.ballOwner && this.getTeamOf(this.ballOwner) !== pos.team) {
              target = { x: this.players[this.ballOwner].x, y: this.players[this.ballOwner].y };
            } else {
              const advanceX = Math.abs(ballX - ownGoalX) < 30 ? keepBaseX + fwdSign * 3 : keepBaseX;
              target = { x: isHome ? Math.min(14, advanceX) : Math.max(86, advanceX), y: Math.max(18, Math.min(42, 30 + (ballY - 30) * 0.5)) };
            }
          } else if (myTeamHasBall) {
            if (role === "attack") {
              const runX = ballX + fwdSign * (12 + idx * 5);
              target = { x: isHome ? Math.min(92, Math.max(ballX + 3, runX)) : Math.max(8, Math.min(ballX - 3, runX)), y: myLane + (Math.random() - 0.5) * 5 };
            } else if (role === "mid") {
              const supportX = ballX + fwdSign * (3 + idx * 3);
              target = { x: isHome ? Math.min(85, supportX) : Math.max(15, supportX), y: myLane + (Math.random() - 0.5) * 5 };
            } else {
              const safeX = ballX - fwdSign * (8 + idx * 4);
              target = { x: isHome ? Math.max(10, safeX) : Math.min(90, safeX), y: myLane + (Math.random() - 0.5) * 5 };
            }
          } else {
            const bp = this.ballOwner ? this.players[this.ballOwner] : this.ball;
            const toBall = this.dist(pos, bp);
            const oppTeamP = this.getTeamPlayers(this.getOpponentTeam(pos.team));
            const lurkers = oppTeamP.filter(opp => Math.abs(this.players[opp.id].x - ownGoalX) < 30 && opp.id !== this.ballOwner);
            const nonKeepers = teamPlayers.filter((_, i) => i !== 0);
            const closest = nonKeepers.reduce((b, t) => { const d = this.dist(this.players[t.id], bp); return (!b || d < b.d) ? { id: t.id, d } : b; }, null);
            if (role === "defense" && lurkers.length > 0) {
              const myL = lurkers.reduce((b, l) => { const d = this.dist(pos, this.players[l.id]); return (!b || d < b.d) ? { id: l.id, d, pos: this.players[l.id] } : b; }, null);
              target = myL ? { x: (myL.pos.x + ownGoalX) / 2, y: myL.pos.y } : { x: isHome ? 15 : 85, y: myLane };
            } else if (closest && closest.id === p.id && toBall < 25) {
              target = { x: bp.x, y: bp.y };
            } else {
              const holdX = (bp.x * 0.3 + ownGoalX * 0.7);
              target = { x: isHome ? Math.max(8, holdX) : Math.min(92, holdX), y: myLane + (bp.y - myLane) * 0.15 };
            }
          }
          break;
        }
      }

      this.playerTargets[p.id] = this.clampField(target);
    }

    this.applySeparation();
  }

  applySeparation() {
    const MIN_DIST = 6; // minimum distance between any two same-team players
    const PUSH = 3;
    for (const team of ["home", "away"]) {
      const players = this.getTeamPlayers(team);
      for (let i = 0; i < players.length; i++) {
        const tA = this.playerTargets[players[i].id];
        if (!tA) continue;
        for (let j = i + 1; j < players.length; j++) {
          const tB = this.playerTargets[players[j].id];
          if (!tB) continue;
          const dx = tA.x - tB.x; const dy = tA.y - tB.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < MIN_DIST && d > 0.1) {
            const pushX = (dx / d) * PUSH; const pushY = (dy / d) * PUSH;
            tA.x += pushX; tA.y += pushY;
            tB.x -= pushX; tB.y -= pushY;
            // Re-clamp
            const cA = this.clampField(tA); tA.x = cA.x; tA.y = cA.y;
            const cB = this.clampField(tB); tB.x = cB.x; tB.y = cB.y;
          }
        }
      }
    }
  }

  makeDecision() {
    const owner = this.getPlayer(this.ballOwner); if (!owner) return;
    const op = this.players[this.ballOwner]; const team = this.getTeamOf(this.ballOwner);
    const isHome = team === "home";
    const goalX = isHome ? 99 : 1; const goalY = 30;
    const distGoal = this.dist(op, { x: goalX, y: goalY });
    const isKeeper = this.getTeamPlayers(team)[0]?.id === owner.id;
    const strat = this.getStrategyOf(team);
    const stratId = strat?.id || "equilibre";

    // Keeper with ball
    if (isKeeper) {
      if (stratId === "possession") {
        // Sweeper keeper can dribble a bit before passing
        if (distGoal < 40) { this.attemptPass(owner); }
        else { this.lastEvent = this.time; } // advance
      } else {
        this.attemptPass(owner);
      }
      return;
    }

    // Find nearest non-keeper opponent
    const oppTeamPlayers = this.getTeamPlayers(this.getOpponentTeam(team));
    let nearestFieldOpp = null, nearestFieldDist = Infinity;
    for (let i = 1; i < oppTeamPlayers.length; i++) {
      const d = this.dist(op, this.players[oppTeamPlayers[i].id]);
      if (d < nearestFieldDist) { nearestFieldDist = d; nearestFieldOpp = oppTeamPlayers[i]; }
    }

    // Always shoot if very close to goal
    if (distGoal < 20) { this.attemptShot(owner); return; }
    if (distGoal < 30 && nearestFieldDist > 8) {
      if (distGoal < 25) { this.attemptShot(owner); } else { this.lastEvent = this.time; }
      return;
    }

    // Duel if close
    if (nearestFieldOpp && nearestFieldDist < 3.5 && distGoal > 20) {
      this.resolveDuel(owner, nearestFieldOpp); return;
    }
    if (nearestFieldOpp && nearestFieldDist < 3.5 && distGoal <= 20) {
      this.attemptShot(owner); return;
    }

    const roll = Math.random() * 100;
    const role = this.getRole(owner);
    const shootBias = strat?.shootBias || 0;

    // ── STRATEGY-SPECIFIC DECISIONS ──
    switch (stratId) {
      case "possession": {
        // ALWAYS PASS: 80% pass, 10% dribble, 10% advance. Shoot only if < 25.
        if (distGoal < 25 && roll < 30) { this.attemptShot(owner); }
        else if (roll < 80) { this.attemptPass(owner); }
        else if (this.getAttr(owner, "Dribble") > 55 && roll < 90) { if (nearestFieldOpp) this.attemptDribble(owner, nearestFieldOpp); else this.attemptPass(owner); }
        else { this.lastEvent = this.time; }
        break;
      }
      case "attack": {
        // AGGRESSIVE: shoot from anywhere if reasonable, everyone tries
        if (distGoal < 40 && roll < 55 + shootBias) { this.attemptShot(owner); }
        else if (distGoal < 55 && role === "attack" && roll < 50) { this.attemptShot(owner); }
        else if (roll < 70) { this.attemptPass(owner); }
        else { this.lastEvent = this.time; }
        break;
      }
      case "counter": {
        // LONG BALLS: if in own half, launch forward to attacker. If attacker, sprint and shoot.
        const inOwnHalf = isHome ? op.x < 50 : op.x > 50;
        if (role === "attack" && distGoal < 35) { this.attemptShot(owner); }
        else if (inOwnHalf && roll < 70) { this.attemptPass(owner); } // long ball forward
        else if (!inOwnHalf && roll < 50) { this.attemptShot(owner); }
        else { this.attemptPass(owner); }
        break;
      }
      case "park_bus": {
        // CLEAR THE BALL: pass backward or long clearance, very conservative shooting
        if (distGoal < 20) { this.attemptShot(owner); }
        else if (roll < 75) { this.attemptPass(owner); }
        else { this.lastEvent = this.time; } // hold
        break;
      }
      case "pressing": {
        // Aggressive passing under pressure, quick transitions
        if (distGoal < 28 && roll < 50) { this.attemptShot(owner); }
        else if (nearestFieldDist < 5) { this.attemptPass(owner); } // quick release
        else if (roll < 55) { this.attemptPass(owner); }
        else { this.lastEvent = this.time; }
        break;
      }
      default: {
        // BALANCED
        const shootChance = (role === "attack" ? 65 : 45) + shootBias;
        if (distGoal < 30 && roll < shootChance) { this.attemptShot(owner); }
        else if (distGoal < 50 && nearestFieldDist < 7) {
          if (this.getAttr(owner, "Dribble") > 60 && roll < 35) { if (nearestFieldOpp) this.attemptDribble(owner, nearestFieldOpp); else this.attemptPass(owner); }
          else { this.attemptPass(owner); }
        } else if (roll < 45) { this.attemptPass(owner); }
        else { this.lastEvent = this.time; }
        break;
      }
    }
  }

  attemptPass(passer) {
    const target = this.findPassTarget(passer.id); if (!target) return;
    this.lastEvent = this.time;
    const passSkill = this.getAttr(passer, "Vision"); const tp = this.players[target.id];
    if (Math.random() * 100 < passSkill * 0.75) {
      this.ballOwner = null; this.ballTarget = { x: tp.x + (Math.random() - 0.5) * 3, y: tp.y + (Math.random() - 0.5) * 3 };
      this.ballSpeed = 2.8 + Math.random() * 1.0; this.passReceiver = target.id; this.phase = "passing";
      this.events.push({ time: this.time, type: "PASS", player: passer.nom, to: target.nom, team: this.getTeamOf(passer.id), narration: pickNarration("passe_decisive", { joueur: passer.nom }, this.getDomaine(passer)) });
    } else {
      this.ballOwner = null; this.ballTarget = { x: tp.x + (Math.random() - 0.5) * 15, y: tp.y + (Math.random() - 0.5) * 10 };
      this.ballSpeed = 2.4; this.passReceiver = null; this.possession = this.getOpponentTeam(this.getTeamOf(passer.id));
    }
  }

  attemptShot(shooter) {
    this.lastEvent = this.time; const team = this.getTeamOf(shooter.id);
    const goalX = team === "home" ? 99.5 : 0.5; const goalY = 30 + (Math.random() - 0.5) * 12;
    const shotSkill = this.getAttr(shooter, "Finition"); const composure = this.getAttr(shooter, "Sang-froid");
    const accuracy = (shotSkill * 0.7 + composure * 0.3) / 100;
    this.ballOwner = null;
    if (Math.random() < accuracy * 0.85) {
      this.ballTarget = { x: goalX, y: goalY }; this.ballSpeed = 3.2 + Math.random() * 1.2;
      this.shotData = { shooter, team, onTarget: true }; this.phase = "shooting";
    } else {
      this.ballTarget = { x: goalX, y: goalY + (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 10) };
      this.ballSpeed = 3.2; this.shotData = null; this.phase = "play";
      this.events.push({ time: this.time, type: "MISS", player: shooter.nom, team, narration: pickNarration("tir_rate", { joueur: shooter.nom }, this.getDomaine(shooter)) });
    }
  }

  attemptDribble(dribbler, defender) {
    this.lastEvent = this.time;
    if (Math.random() * 100 < this.getAttr(dribbler, "Dribble") * 0.55) {
      this.events.push({ time: this.time, type: "DRIBBLE", player: dribbler.nom, team: this.getTeamOf(dribbler.id), narration: pickNarration("dribble_reussi", { joueur: dribbler.nom }, this.getDomaine(dribbler)) });
      const pos = this.players[dribbler.id]; const fwd = this.getTeamOf(dribbler.id) === "home" ? 5 : -5;
      pos.x = Math.max(2, Math.min(98, pos.x + fwd));
    } else { this.resolveDuel(dribbler, defender); }
  }

  resolveDuel(attacker, defender) {
    this.lastEvent = this.time;
    if (Math.random() * 100 < this.getAttr(defender, "Tacle") * 0.55) {
      if (Math.random() < 0.2) {
        this.events.push({ time: this.time, type: "FOUL", player: defender.nom, team: this.getTeamOf(defender.id), narration: pickNarration("faute", { joueur: defender.nom }, this.getDomaine(defender)) });
        this.phase = "foul_pause"; this.phaseTimer = 15;
      } else {
        this.events.push({ time: this.time, type: "TACKLE", player: defender.nom, team: this.getTeamOf(defender.id), narration: pickNarration("tacle_reussi", { joueur: defender.nom }, this.getDomaine(defender)) });
        this.ballOwner = defender.id; this.possession = this.getTeamOf(defender.id);
        this.ball.x = this.players[defender.id].x; this.ball.y = this.players[defender.id].y;
      }
    }
  }

  onBallArrived() {
    if (this.phase === "shooting" && this.shotData) {
      const { shooter, team } = this.shotData;
      if (Math.random() * 100 < this.getAttr(shooter, "Finition") * 0.4) {
        (team === "home" ? this.home : this.away).score++;
        this.events.push({ time: this.time, type: "GOAL", player: shooter.nom, team, narration: pickNarration("but_marque", { joueur: shooter.nom }, this.getDomaine(shooter)) });
        const lp = [...this.events].reverse().find(e => e.type === "PASS" && e.team === team && e.time > this.time - 30);
        if (lp) this.events.push({ time: this.time, type: "ASSIST", player: lp.player, team, narration: pickNarration("passe_decisive", { joueur: lp.player }, null) });

        // Reset ALL players to initial positions
        this.resetPositions();

        // Kickoff: conceding team gets the ball at center
        this.phase = "goal_celebration"; this.phaseTimer = 30;
        this.ball.x = 50; this.ball.y = 30;
        this.possession = this.getOpponentTeam(team);
        const kickTeam = this.getTeamPlayers(this.possession);
        const mid = kickTeam[Math.floor(kickTeam.length / 2)];
        this.ballOwner = mid.id; this.ballTarget = null; this.shotData = null;
        // Move kickoff player to center
        this.players[mid.id].x = 50; this.players[mid.id].y = 30;
      } else {
        this.events.push({ time: this.time, type: "SAVE", player: shooter.nom, team, narration: pickNarration("arret", {}, this.getDomaine(shooter)) });
        const oppT = this.getOpponentTeam(team); const keeper = this.getTeamPlayers(oppT)[0];
        this.ballOwner = keeper.id; this.ball.x = this.players[keeper.id].x; this.ball.y = this.players[keeper.id].y;
        this.possession = oppT; this.phase = "play";
      }
      this.shotData = null;
    } else if (this.passReceiver) {
      this.ballOwner = this.passReceiver; this.ball.x = this.players[this.passReceiver].x; this.ball.y = this.players[this.passReceiver].y;
      this.passReceiver = null; this.phase = "play";
    } else { this.phase = "play"; this.pickUpLooseBall(); }
    this.ballTarget = null;
  }

  // Reset all players to their formation starting positions
  resetPositions() {
    for (const p of this.home.players) {
      const base = this.homePositions[p.id];
      if (base) { this.players[p.id].x = base.x; this.players[p.id].y = base.y; this.playerTargets[p.id] = { x: base.x, y: base.y }; }
    }
    for (const p of this.away.players) {
      const base = this.awayPositions[p.id];
      if (base) { this.players[p.id].x = base.x; this.players[p.id].y = base.y; this.playerTargets[p.id] = { x: base.x, y: base.y }; }
    }
  }

  checkInterceptions() {
    const opps = this.getTeamPlayers(this.getOpponentTeam(this.possession));
    for (const opp of opps) {
      const d = this.dist(this.players[opp.id], this.ball);
      if (d < 3 && Math.random() < this.getAttr(opp, "Tacle") * 0.004) {
        this.ballOwner = opp.id; this.ballTarget = null; this.passReceiver = null; this.shotData = null;
        this.possession = this.getTeamOf(opp.id); this.phase = "play";
        this.ball.x = this.players[opp.id].x; this.ball.y = this.players[opp.id].y;
        this.events.push({ time: this.time, type: "TACKLE", player: opp.nom, team: this.getTeamOf(opp.id), narration: pickNarration("tacle_reussi", { joueur: opp.nom }, this.getDomaine(opp)) });
        break;
      }
    }
  }

  pickUpLooseBall() {
    let nearest = null, minD = Infinity;
    for (const p of this.getAllPlayers()) {
      const d = this.dist(this.players[p.id], this.ball);
      if (d < minD) { minD = d; nearest = p; }
    }
    if (nearest && minD < 8) {
      // Someone is close enough to pick up
      this.ballOwner = nearest.id;
      this.possession = this.getTeamOf(nearest.id);
      this.ball.x = this.players[nearest.id].x;
      this.ball.y = this.players[nearest.id].y;
    } else {
      // Ball is loose and nobody is close — nudge ball toward center to prevent stuck
      this.ball.x += (50 - this.ball.x) * 0.02;
      this.ball.y += (30 - this.ball.y) * 0.02;
    }
  }

  activatePowerUp(playerId, powerUp) {
    if (this.powerUpCooldowns[playerId + powerUp.id] && this.powerUpCooldowns[playerId + powerUp.id] > this.time) return false;
    const player = this.getAllPlayers().find(p => p.id === playerId); if (!player) return false;
    const team = this.home.players.find(p => p.id === playerId) ? "home" : "away";

    // Apply per-attribute buffs
    this.activePowerUps.push({
      playerId, powerUpId: powerUp.id,
      expiresAt: this.time + powerUp.duree,
      buffs: powerUp.buffs || {},
    });
    this.powerUpCooldowns[playerId + powerUp.id] = this.time + powerUp.cooldown;

    // Heal stamina if applicable
    if (powerUp.healStamina) {
      const teammates = this.getTeamPlayers(team);
      for (const t of teammates) {
        this.staminas[t.id] = Math.min(100, (this.staminas[t.id] || 50) + powerUp.healStamina);
      }
    }

    // Debuff opponents if applicable
    if (powerUp.debuffOpponents) {
      const oppTeam = this.getOpponentTeam(team);
      const opps = this.getTeamPlayers(oppTeam);
      for (const opp of opps) {
        this.activePowerUps.push({
          playerId: opp.id, powerUpId: powerUp.id + "_debuff",
          expiresAt: this.time + powerUp.duree,
          buffs: powerUp.debuffOpponents,
        });
      }
    }

    this.events.push({ time: this.time, type: "POWERUP", player: player.nom, team, narration: pickNarration("power_up", { joueur: player.nom, pu: powerUp.nom }) });
    return true;
  }

  setStrategy(team, strategy) {
    if (team === "home") this.homeStrategy = strategy;
    else this.awayStrategy = strategy;
  }

  getStrategyOf(team) {
    return team === "home" ? this.homeStrategy : this.awayStrategy;
  }

  getState() {
    const positions = {};
    for (const [id, pos] of Object.entries(this.players)) { positions[id] = { x: pos.x, y: pos.y, team: pos.team }; }
    return {
      time: this.time, maxTime: this.maxTime,
      homeScore: this.home.score, awayScore: this.away.score,
      possession: this.possession, events: [...this.events],
      positions, ball: { x: this.ball.x, y: this.ball.y },
      ballOwner: this.ballOwner, ballTarget: this.ballTarget,
      staminas: { ...this.staminas }, activePowerUps: [...this.activePowerUps],
      isFinished: this.time >= this.maxTime, phase: this.phase,
      powerUpCooldowns: { ...this.powerUpCooldowns },
      homeStrategy: this.homeStrategy, awayStrategy: this.awayStrategy,
    };
  }
}

// ─── STYLES ──────────────────────────────────────────────────
const colors = {
  bg: "#050508", bgCard: "#0F0F1A", bgPanel: "#0A0A12", bgSurface: "#1A1A2E",
  cyan: "#00F0FF", magenta: "#FF00E5", lime: "#B8FF00", coral: "#FF3366",
  violet: "#8B5CF6", gold: "#FFD700", white: "#F0F0F0", muted: "#6B7280",
};

const glass = {
  background: "rgba(16, 24, 56, 0.65)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(0, 240, 255, 0.15)",
  borderRadius: "16px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
};

const glassElevated = {
  ...glass,
  background: "rgba(16, 24, 56, 0.8)",
  border: "1px solid rgba(0, 240, 255, 0.35)",
  boxShadow: "0 12px 48px rgba(0, 240, 255, 0.12), 0 8px 32px rgba(0,0,0,0.5)",
};

// ─── COMPONENTS ──────────────────────────────────────────────

function GlassCard({ children, style, onClick, elevated, className = "" }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={className}
      style={{
        ...(elevated || hov ? glassElevated : glass),
        padding: "16px",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        transform: hov ? "translateY(-4px)" : "none",
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatBar({ label, value, max = 99, color = colors.cyan }) {
  const pct = (value / max) * 100;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: colors.muted, marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color, fontFamily: "'Chakra Petch', monospace", fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 3,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          boxShadow: `0 0 8px ${color}66`,
          transition: "width 0.6s ease-out",
        }} />
      </div>
    </div>
  );
}

function RadarChart({ player, size = 180 }) {
  const attrs = ["Finition", "Tacle", "Dribble", "Endurance", "Force", "Vitesse", "Vision", "Sang-froid"];
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const angleStep = (2 * Math.PI) / attrs.length;

  const points = attrs.map((attr, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const val = (player.attributs[attr] || 50) / 99;
    return { x: cx + r * val * Math.cos(angle), y: cy + r * val * Math.sin(angle) };
  });

  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid */}
      {gridLevels.map((lev, li) => (
        <polygon key={li}
          points={attrs.map((_, i) => {
            const a = i * angleStep - Math.PI / 2;
            return `${cx + r * lev * Math.cos(a)},${cy + r * lev * Math.sin(a)}`;
          }).join(" ")}
          fill="none" stroke="rgba(0,240,255,0.1)" strokeWidth="1"
        />
      ))}
      {/* Axes */}
      {attrs.map((attr, i) => {
        const a = i * angleStep - Math.PI / 2;
        return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} stroke="rgba(0,240,255,0.15)" strokeWidth="1" />;
      })}
      {/* Data polygon */}
      <polygon
        points={points.map(p => `${p.x},${p.y}`).join(" ")}
        fill="rgba(0,240,255,0.15)" stroke={colors.cyan} strokeWidth="2"
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={colors.cyan} />
      ))}
      {/* Labels */}
      {attrs.map((attr, i) => {
        const a = i * angleStep - Math.PI / 2;
        const lx = cx + (r + 18) * Math.cos(a);
        const ly = cy + (r + 18) * Math.sin(a);
        const short = attr === "Sang-froid" ? "S-F" : attr === "Endurance" ? "End" : attr === "Finition" ? "Fin" : attr === "Vitesse" ? "Vit" : attr.substring(0, 3);
        return <text key={i} x={lx} y={ly} fill={colors.muted} fontSize="9" textAnchor="middle" dominantBaseline="middle">{short}</text>;
      })}
    </svg>
  );
}

function PlayerCard({ player, onClick, selected, compact }) {
  const avgStat = Math.round(Object.values(player.attributs).reduce((a, b) => a + b, 0) / 8);
  const domainColor = getDomainColor(player.domaine);

  if (compact) {
    return (
      <GlassCard onClick={onClick} elevated={selected} style={{
        padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
        borderColor: selected ? domainColor : undefined,
        borderWidth: selected ? 2 : 1,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          background: `linear-gradient(135deg, ${domainColor}33, ${domainColor}11)`,
          border: `2px solid ${domainColor}`,
          fontSize: 14, fontWeight: 700, color: domainColor,
        }}>
          {player.nom[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: colors.white, fontSize: 14 }}>{player.nom}</div>
          <div style={{ fontSize: 11, color: colors.muted }}>{player.poste}</div>
        </div>
        <div style={{ fontFamily: "'Chakra Petch', monospace", fontSize: 20, fontWeight: 700, color: domainColor }}>{avgStat}</div>
      </GlassCard>
    );
  }

  return (
    <GlassCard onClick={onClick} elevated={selected} style={{
      width: 200, padding: "16px", textAlign: "center",
      borderColor: selected ? domainColor : undefined,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: "50%", margin: "0 auto 10px",
        background: `linear-gradient(135deg, ${domainColor}44, ${domainColor}11)`,
        border: `3px solid ${domainColor}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24, fontWeight: 800, color: domainColor,
        boxShadow: `0 0 20px ${domainColor}33`,
      }}>
        {player.nom[0]}{player.nom[1]}
      </div>
      <div style={{ fontWeight: 800, fontSize: 16, color: colors.white, fontFamily: "'Rajdhani', sans-serif" }}>{player.nom}</div>
      <div style={{ fontSize: 11, color: domainColor, marginBottom: 4 }}>{player.domaine}</div>
      <div style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>{player.poste} • {player.slogan}</div>
      <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap", marginBottom: 8 }}>
        {player.traits.map(t => (
          <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: `${domainColor}22`, color: domainColor, border: `1px solid ${domainColor}44` }}>{t}</span>
        ))}
      </div>
      <div style={{
        fontFamily: "'Chakra Petch', monospace", fontSize: 28, fontWeight: 700, color: domainColor,
        textShadow: `0 0 20px ${domainColor}66`,
      }}>{avgStat}</div>
      <div style={{ fontSize: 10, color: colors.muted }}>Note globale</div>
    </GlassCard>
  );
}

function getDomainColor(domaine) {
  const map = {
    "Informatique": colors.cyan,
    "Physique et Mécanique": "#FF6B35",
    "Biologie et Chimie": colors.lime,
    "Physique et Chimie": colors.violet,
    "Electronique": "#00CCFF",
    "Mathématiques": colors.gold,
    "Biologie et Médecine": "#66FF66",
    "Chimie": colors.magenta,
    "Mathématiques et Bancaire": "#FFD700",
    "Aides directes, Subventions": colors.coral,
    "Cybersécurité": "#39FF14",
    "Electronique et Bancaire": "#9D4EDD",
    "Agroalimentaire": "#8B4513",
    "Business": "#FF8C00",
  };
  return map[domaine] || colors.cyan;
}

function getTypeColor(type) {
  return { attaque: colors.coral, défense: colors.cyan, contrôle: colors.violet, mental: colors.lime }[type] || colors.cyan;
}

// ─── PAGES ───────────────────────────────────────────────────

function DashboardPage({ setPage, selectedTeam }) {
  const teamAvg = selectedTeam.length > 0
    ? Math.round(selectedTeam.reduce((sum, p) => sum + Object.values(p.attributs).reduce((a, b) => a + b, 0) / 8, 0) / selectedTeam.length)
    : 0;

  return (
    <div style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "'Orbitron', monospace", fontSize: 36, fontWeight: 800, color: colors.cyan, textTransform: "uppercase", marginBottom: 8, textShadow: `0 0 30px ${colors.cyan}44` }}>
        TABLEAU DE BORD
      </h1>
      <p style={{ color: colors.muted, marginBottom: 32, fontSize: 14 }}>Bienvenue, Manager. Votre labo est prêt.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginBottom: 32 }}>
        <GlassCard>
          <div style={{ fontSize: 12, color: colors.cyan, fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: 2 }}>Équipe active</div>
          <div style={{ fontFamily: "'Chakra Petch', monospace", fontSize: 48, fontWeight: 700, color: colors.white }}>
            {selectedTeam.length}<span style={{ fontSize: 20, color: colors.muted }}>/5</span>
          </div>
          <div style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>
            {selectedTeam.length === 5 ? "✅ Équipe complète" : "⚠️ Sélectionne tes 5 titulaires"}
          </div>
          {selectedTeam.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <StatBar label="Note moyenne" value={teamAvg} color={colors.lime} />
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <div style={{ fontSize: 12, color: colors.magenta, fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: 2 }}>Power-Ups</div>
          <div style={{ fontFamily: "'Chakra Petch', monospace", fontSize: 48, fontWeight: 700, color: colors.white }}>
            {selectedTeam.length > 0 ? selectedTeam.length : 0}
          </div>
          <div style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>
            Power-ups disponibles par domaine
          </div>
        </GlassCard>

        <GlassCard>
          <div style={{ fontSize: 12, color: colors.lime, fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: 2 }}>Roster</div>
          <div style={{ fontFamily: "'Chakra Petch', monospace", fontSize: 48, fontWeight: 700, color: colors.white }}>16</div>
          <div style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>Consultants scientifiques prêts au combat</div>
        </GlassCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <GlassCard onClick={() => setPage("composition")} style={{ cursor: "pointer", textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚽</div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 700, color: colors.cyan }}>COMPOSER L'ÉQUIPE</div>
          <div style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>Choisis tes 5 titulaires et ta formation</div>
        </GlassCard>

        <GlassCard onClick={() => selectedTeam.length === 5 && setPage("match")} style={{ cursor: selectedTeam.length === 5 ? "pointer" : "not-allowed", textAlign: "center", padding: 32, opacity: selectedTeam.length === 5 ? 1 : 0.5 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏟️</div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 700, color: colors.magenta }}>MATCH VS IA</div>
          <div style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>
            {selectedTeam.length === 5 ? "Ton équipe est prête !" : "Il faut 5 joueurs pour commencer"}
          </div>
        </GlassCard>

        <GlassCard onClick={() => setPage("lobby")} elevated style={{ cursor: "pointer", textAlign: "center", padding: 32, border: `1px solid ${colors.magenta}33` }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌐</div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 700, color: colors.magenta }}>MULTIJOUEUR</div>
          <div style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>Affronte un ami en ligne ou regarde un match</div>
        </GlassCard>
      </div>
    </div>
  );
}

function RosterPage({ setPage, selectedTeam, setSelectedPlayer }) {
  const [filter, setFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("Tous");

  const domains = ["Tous", ...new Set(ROSTER.map(p => p.domaine))];
  const filtered = ROSTER.filter(p => {
    const matchName = p.nom.toLowerCase().includes(filter.toLowerCase());
    const matchDomain = domainFilter === "Tous" || p.domaine === domainFilter;
    return matchName && matchDomain;
  });

  return (
    <div style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "'Orbitron', monospace", fontSize: 28, fontWeight: 800, color: colors.cyan, marginBottom: 24, textTransform: "uppercase" }}>
        ROSTER — 16 CONSULTANTS
      </h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <input
          placeholder="🔍 Rechercher un joueur..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            ...glass, padding: "10px 16px", color: colors.white, fontSize: 14,
            outline: "none", width: 260, fontFamily: "inherit",
          }}
        />
        <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)}
          style={{ ...glass, padding: "10px 16px", color: colors.white, fontSize: 13, outline: "none", fontFamily: "inherit" }}>
          {domains.map(d => <option key={d} value={d} style={{ background: colors.bgCard }}>{d}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
        {filtered.map(player => (
          <PlayerCard key={player.id} player={player}
            selected={selectedTeam.some(p => p.id === player.id)}
            onClick={() => setSelectedPlayer(player)}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerDetailPage({ player, selectedTeam, togglePlayer, setPage }) {
  if (!player) return null;
  const dc = getDomainColor(player.domaine);
  const pu = POWER_UPS.find(p => p.joueur === player.id) || POWER_UPS.find(p => p.domaine === player.domaine);
  const isSelected = selectedTeam.some(p => p.id === player.id);
  const avgStat = Math.round(Object.values(player.attributs).reduce((a, b) => a + b, 0) / 8);

  return (
    <div style={{ padding: "24px", maxWidth: 900, margin: "0 auto" }}>
      <button onClick={() => setPage("roster")} style={{ background: "none", border: "none", color: colors.cyan, cursor: "pointer", fontSize: 14, marginBottom: 16 }}>
        ← Retour au roster
      </button>

      <GlassCard elevated style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 100, height: 100, borderRadius: "50%", margin: "0 auto 12px",
              background: `linear-gradient(135deg, ${dc}44, ${dc}11)`,
              border: `4px solid ${dc}`, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, fontWeight: 800, color: dc, boxShadow: `0 0 30px ${dc}44`,
            }}>
              {player.nom[0]}{player.nom[1]}
            </div>
            <div style={{ fontFamily: "'Chakra Petch', monospace", fontSize: 42, fontWeight: 700, color: dc, textShadow: `0 0 20px ${dc}66` }}>{avgStat}</div>
            <div style={{ fontSize: 11, color: colors.muted }}>Note globale</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h2 style={{ fontFamily: "'Orbitron', monospace", fontSize: 28, fontWeight: 800, color: colors.white, margin: "0 0 4px" }}>{player.nom}</h2>
            </div>
            <div style={{ color: dc, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{player.domaine}</div>
            <div style={{ color: colors.muted, fontSize: 13, marginBottom: 12 }}>{player.poste} — « {player.slogan} »</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {player.traits.map(t => (
                <span key={t} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${dc}22`, color: dc, border: `1px solid ${dc}44` }}>{t}</span>
              ))}
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${colors.violet}22`, color: colors.violet, border: `1px solid ${colors.violet}44` }}>{player.profil}</span>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: colors.lime, fontWeight: 700, marginBottom: 4 }}>⬆ FORCES</div>
                {player.forces.map(f => <div key={f} style={{ fontSize: 13, color: colors.white }}>{f}: {player.attributs[f]}</div>)}
              </div>
              <div>
                <div style={{ fontSize: 11, color: colors.coral, fontWeight: 700, marginBottom: 4 }}>⬇ FAIBLESSES</div>
                {player.faiblesses.map(f => <div key={f} style={{ fontSize: 13, color: colors.white }}>{f}: {player.attributs[f]}</div>)}
              </div>
            </div>
            {player.bio && (
              <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: `${dc}08`, border: `1px solid ${dc}22`, lineHeight: 1.7 }}>
                <div style={{ fontSize: 11, color: dc, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>📋 Dossier du consultant</div>
                <div style={{ fontSize: 13, color: colors.muted, fontStyle: "italic" }}>{player.bio}</div>
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        <GlassCard>
          <div style={{ fontSize: 12, color: colors.cyan, fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: 2 }}>Statistiques</div>
          {Object.entries(player.attributs).map(([key, val]) => (
            <StatBar key={key} label={key} value={val} color={val >= 80 ? colors.lime : val >= 65 ? colors.cyan : colors.coral} />
          ))}
        </GlassCard>
        <div>
          <GlassCard style={{ marginBottom: 16, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: colors.cyan, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>Radar</div>
            <RadarChart player={player} size={200} />
          </GlassCard>
          {pu && (
            <GlassCard>
              <div style={{ fontSize: 12, color: colors.magenta, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>Power-Up de domaine</div>
              <div style={{ fontWeight: 700, color: colors.white, fontSize: 16, marginBottom: 4 }}>{pu.nom}</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: `${getTypeColor(pu.type)}22`, color: getTypeColor(pu.type) }}>{pu.type}</span>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "rgba(255,255,255,0.05)", color: colors.muted }}>{pu.duree}s</span>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "rgba(255,255,255,0.05)", color: colors.muted }}>CD: {pu.cooldown}s</span>
              </div>
              <div style={{ fontSize: 12, color: colors.lime, marginBottom: 4 }}>✦ {pu.effets}</div>
              {pu.contrepartie !== "Aucune" && <div style={{ fontSize: 12, color: colors.coral }}>⚠ {pu.contrepartie}</div>}
            </GlassCard>
          )}
        </div>
      </div>

      <button onClick={() => togglePlayer(player)} style={{
        width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: "pointer",
        fontFamily: "'Rajdhani', sans-serif", fontSize: 16, fontWeight: 700,
        background: isSelected ? `linear-gradient(135deg, ${colors.coral}, #FF1155)` : `linear-gradient(135deg, ${colors.cyan}, #00AAFF)`,
        color: colors.white, textTransform: "uppercase", letterSpacing: 1,
      }}>
        {isSelected ? "Retirer de l'équipe" : selectedTeam.length >= 5 ? "Équipe complète (5/5)" : "Ajouter à l'équipe"}
      </button>
    </div>
  );
}

function CompositionPage({ selectedTeam, setSelectedTeam, formation, setFormation, setPage }) {
  const removePlayer = (id) => setSelectedTeam(prev => prev.filter(p => p.id !== id));
  const bench = ROSTER.filter(p => !selectedTeam.some(s => s.id === p.id));

  return (
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "'Orbitron', monospace", fontSize: 28, fontWeight: 800, color: colors.cyan, marginBottom: 24, textTransform: "uppercase" }}>
        COMPOSITION D'ÉQUIPE
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
        {/* Terrain */}
        <GlassCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.white }}>Formation</div>
            <select value={formation} onChange={e => setFormation(e.target.value)}
              style={{ ...glass, padding: "6px 12px", color: colors.white, fontSize: 12, outline: "none", fontFamily: "inherit" }}>
              {Object.entries(FORMATIONS).map(([k, f]) => (
                <option key={k} value={k} style={{ background: colors.bgCard }}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Pitch visualization */}
          <div style={{
            position: "relative", width: "100%", paddingBottom: "60%",
            background: "linear-gradient(180deg, #0a3d0a 0%, #0d4d0d 50%, #0a3d0a 100%)",
            borderRadius: 12, overflow: "hidden", border: "2px solid rgba(255,255,255,0.15)",
          }}>
            {/* Pitch markings */}
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.3)" }} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 60, height: 60, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)" }} />
            <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(255,255,255,0.2)" }} />

            {/* Players */}
            {FORMATIONS[formation]?.positions.map((pos, i) => {
              const player = selectedTeam[i];
              const dc = player ? getDomainColor(player.domaine) : "rgba(255,255,255,0.3)";
              return (
                <div key={i} style={{
                  position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`,
                  transform: "translate(-50%, -50%)", textAlign: "center",
                  transition: "all 0.5s ease",
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: player ? `radial-gradient(circle, ${dc}66, ${dc}22)` : "rgba(255,255,255,0.1)",
                    border: `2px solid ${dc}`, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700, color: player ? colors.white : colors.muted,
                    boxShadow: player ? `0 0 15px ${dc}44` : "none",
                  }}>
                    {player ? player.nom.substring(0, 2) : "?"}
                  </div>
                  <div style={{ fontSize: 10, color: colors.white, marginTop: 2, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
                    {player ? player.nom : FORMATIONS[formation].roles[i]}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedTeam.length === 5 && (
            <button onClick={() => setPage("match")} style={{
              width: "100%", padding: 14, marginTop: 16, borderRadius: 12, border: "none", cursor: "pointer",
              fontFamily: "'Rajdhani', sans-serif", fontSize: 16, fontWeight: 700,
              background: `linear-gradient(135deg, ${colors.magenta}, ${colors.violet})`,
              color: colors.white, textTransform: "uppercase", letterSpacing: 1,
              boxShadow: `0 0 20px ${colors.magenta}44`,
            }}>
              🏟️ LANCER LE MATCH
            </button>
          )}
        </GlassCard>

        {/* Squad Selection */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.white, marginBottom: 12 }}>
            Titulaires ({selectedTeam.length}/5)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {selectedTeam.map(p => (
              <GlassCard key={p.id} style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${getDomainColor(p.domaine)}33`, border: `2px solid ${getDomainColor(p.domaine)}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: getDomainColor(p.domaine) }}>{p.nom[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.white }}>{p.nom}</div>
                  <div style={{ fontSize: 10, color: colors.muted }}>{p.poste}</div>
                </div>
                <button onClick={() => removePlayer(p.id)} style={{ background: "none", border: "none", color: colors.coral, cursor: "pointer", fontSize: 16 }}>✕</button>
              </GlassCard>
            ))}
            {Array.from({ length: 5 - selectedTeam.length }).map((_, i) => (
              <div key={i} style={{ ...glass, padding: "12px", textAlign: "center", color: colors.muted, fontSize: 12, opacity: 0.5 }}>
                Slot vide
              </div>
            ))}
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: colors.white, marginBottom: 12 }}>Banc ({bench.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
            {bench.map(p => (
              <PlayerCard key={p.id} player={p} compact
                onClick={() => selectedTeam.length < 5 && setSelectedTeam(prev => [...prev, p])}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchPage({ selectedTeam, formation, setPage, setLastMatchReport }) {
  const [engine, setEngine] = useState(null);
  const [matchState, setMatchState] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [eventLog, setEventLog] = useState([]);
  const [activeStrategy, setActiveStrategy] = useState(STRATEGIES[0]);
  const intervalRef = useRef(null);
  const logRef = useRef(null);

  // Generate AI opponent
  const aiTeam = useMemo(() => {
    const available = ROSTER.filter(p => !selectedTeam.some(s => s.id === p.id));
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 5);
  }, [selectedTeam]);

  useEffect(() => {
    const eng = new SimpleMatchEngine(selectedTeam, aiTeam, formation, "2-2", activeStrategy, STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)]);
    setEngine(eng);
    setMatchState(eng.getState());
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const startMatch = () => {
    if (!engine) return;
    setIsRunning(true);
    intervalRef.current = setInterval(() => {
      const running = engine.simulateTick();
      const state = engine.getState();
      setMatchState(state);
      if (state.events.length > eventLog.length) {
        setEventLog([...state.events]);
      }
      if (!running || state.isFinished) {
        clearInterval(intervalRef.current);
        setIsRunning(false);
        // Generate report
        setLastMatchReport({
          homeScore: state.homeScore,
          awayScore: state.awayScore,
          events: state.events,
          homeTeam: selectedTeam,
          awayTeam: aiTeam,
          staminas: state.staminas,
        });
      }
    }, Math.max(20, 100 / speed));
  };

  const pauseMatch = () => {
    clearInterval(intervalRef.current);
    setIsRunning(false);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [eventLog]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (!matchState) return <div style={{ padding: 24, color: colors.white }}>Chargement...</div>;

  return (
    <div style={{ padding: "16px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Score bar */}
      <GlassCard elevated style={{ marginBottom: 16, padding: "16px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 12, color: colors.cyan, fontWeight: 700, marginBottom: 4 }}>MON ÉQUIPE</div>
            <div style={{ fontFamily: "'Chakra Petch', monospace", fontSize: 48, fontWeight: 700, color: colors.white }}>
              {matchState.homeScore}
            </div>
          </div>
          <div style={{ textAlign: "center", padding: "0 32px" }}>
            {matchState.isFinished ? (
              <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, color: colors.coral, fontWeight: 700 }}>TERMINÉ</div>
            ) : isRunning ? (
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: colors.coral, margin: "0 auto 4px", animation: "pulse 1s infinite" }} />
            ) : null}
            <div style={{ fontFamily: "'Chakra Petch', monospace", fontSize: 24, color: colors.cyan }}>
              {formatTime(matchState.time)}
            </div>
            <div style={{ fontSize: 11, color: colors.muted }}>/ {formatTime(matchState.maxTime)}</div>
          </div>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 12, color: colors.magenta, fontWeight: 700, marginBottom: 4 }}>ADVERSAIRE</div>
            <div style={{ fontFamily: "'Chakra Petch', monospace", fontSize: 48, fontWeight: 700, color: colors.white }}>
              {matchState.awayScore}
            </div>
          </div>
        </div>
      </GlassCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 350px", gap: 16 }}>
        {/* Pitch */}
        <div>
          <GlassCard style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
            <div style={{
              position: "relative", width: "100%", paddingBottom: "36%",
              background: "#0a3d0a", borderRadius: 8, overflow: "hidden",
            }}>
              {/* Grass stripes */}
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} style={{ position: "absolute", left: `${i * 10}%`, top: 0, width: "10%", height: "100%", background: i % 2 === 0 ? "rgba(0,0,0,0.06)" : "transparent" }} />
              ))}
              {/* Border */}
              <div style={{ position: "absolute", top: "3%", left: "2%", right: "2%", bottom: "3%", border: "2px solid rgba(255,255,255,0.35)", borderRadius: 2 }} />
              {/* Center line */}
              <div style={{ position: "absolute", top: "3%", bottom: "3%", left: "50%", width: 2, background: "rgba(255,255,255,0.3)", transform: "translateX(-50%)" }} />
              {/* Center circle */}
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "12%", paddingBottom: "12%", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.25)" }} />
              {/* Center spot */}
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.5)" }} />

              {/* Left penalty area */}
              <div style={{ position: "absolute", top: "20%", left: "2%", width: "14%", height: "60%", border: "2px solid rgba(255,255,255,0.25)", borderLeft: "none" }} />
              {/* Left goal area (small box) */}
              <div style={{ position: "absolute", top: "33%", left: "2%", width: "6%", height: "34%", border: "2px solid rgba(255,255,255,0.20)", borderLeft: "none" }} />
              {/* Left penalty spot */}
              <div style={{ position: "absolute", top: "50%", left: "12%", transform: "translate(-50%,-50%)", width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.4)" }} />

              {/* Right penalty area */}
              <div style={{ position: "absolute", top: "20%", right: "2%", width: "14%", height: "60%", border: "2px solid rgba(255,255,255,0.25)", borderRight: "none" }} />
              {/* Right goal area (small box) */}
              <div style={{ position: "absolute", top: "33%", right: "2%", width: "6%", height: "34%", border: "2px solid rgba(255,255,255,0.20)", borderRight: "none" }} />
              {/* Right penalty spot */}
              <div style={{ position: "absolute", top: "50%", right: "12%", transform: "translate(50%,-50%)", width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.4)" }} />

              {/* LEFT GOAL (home attacks →, so this is away's goal area) */}
              <div style={{ position: "absolute", top: "37%", left: 0, width: "2.2%", height: "26%", background: "rgba(255,255,255,0.08)", borderRight: "3px solid rgba(255,255,255,0.6)", borderTop: "3px solid rgba(255,255,255,0.5)", borderBottom: "3px solid rgba(255,255,255,0.5)" }}>
                {/* Goal net pattern */}
                <div style={{ width: "100%", height: "100%", backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.08) 3px, rgba(255,255,255,0.08) 4px), repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.08) 3px, rgba(255,255,255,0.08) 4px)" }} />
              </div>

              {/* RIGHT GOAL */}
              <div style={{ position: "absolute", top: "37%", right: 0, width: "2.2%", height: "26%", background: "rgba(255,255,255,0.08)", borderLeft: "3px solid rgba(255,255,255,0.6)", borderTop: "3px solid rgba(255,255,255,0.5)", borderBottom: "3px solid rgba(255,255,255,0.5)" }}>
                <div style={{ width: "100%", height: "100%", backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.08) 3px, rgba(255,255,255,0.08) 4px), repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.08) 3px, rgba(255,255,255,0.08) 4px)" }} />
              </div>

              {/* Ball — with trail effect */}
              {matchState.ball && (
                <div style={{
                  position: "absolute",
                  left: `${2 + matchState.ball.x * 0.96}%`,
                  top: `${3 + matchState.ball.y / 60 * 94}%`,
                  transform: "translate(-50%,-50%)",
                  width: matchState.phase === "shooting" ? 12 : 9,
                  height: matchState.phase === "shooting" ? 12 : 9,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, #ffffff, #cccccc)",
                  boxShadow: matchState.phase === "shooting"
                    ? `0 0 16px ${colors.gold}, 0 0 30px ${colors.gold}66`
                    : matchState.phase === "passing"
                    ? `0 0 10px ${colors.cyan}88`
                    : `0 0 6px rgba(255,255,255,0.5)`,
                  transition: "left 0.09s linear, top 0.09s linear",
                  zIndex: 50,
                }} />
              )}

              {/* Pass trajectory line */}
              {matchState.ballTarget && !matchState.ballOwner && (
                <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 40 }}>
                  <line
                    x1={`${2 + matchState.ball.x * 0.96}%`}
                    y1={`${3 + matchState.ball.y / 60 * 94}%`}
                    x2={`${2 + matchState.ballTarget.x * 0.96}%`}
                    y2={`${3 + matchState.ballTarget.y / 60 * 94}%`}
                    stroke={matchState.phase === "shooting" ? colors.gold + "44" : colors.cyan + "22"}
                    strokeWidth={matchState.phase === "shooting" ? 2 : 1}
                    strokeDasharray="4,4"
                  />
                </svg>
              )}

              {/* Home players (cyan) */}
              {selectedTeam.map((p) => {
                const pos = matchState.positions?.[p.id] || { x: 25, y: 30 };
                const stam = matchState.staminas?.[p.id] || 100;
                const dc = getDomainColor(p.domaine);
                const hasBall = matchState.ballOwner === p.id;
                const hasPU = matchState.activePowerUps?.some(pu => pu.playerId === p.id);
                return (
                  <div key={p.id} style={{
                    position: "absolute",
                    left: `${2 + pos.x * 0.96}%`,
                    top: `${3 + pos.y / 60 * 94}%`,
                    transform: "translate(-50%,-50%)",
                    textAlign: "center",
                    transition: "left 0.09s linear, top 0.09s linear",
                    zIndex: hasBall ? 45 : 30,
                  }}>
                    {hasBall && <div style={{ position: "absolute", top: -3, left: "50%", transform: "translateX(-50%)", width: 36, height: 36, borderRadius: "50%", border: `2px solid ${colors.cyan}`, opacity: 0.4, animation: "pulse 1s infinite" }} />}
                    <div style={{
                      width: hasBall ? 30 : 26, height: hasBall ? 30 : 26, borderRadius: "50%",
                      background: `radial-gradient(circle, ${dc}aa, ${dc}55)`,
                      border: `2px solid ${hasBall ? colors.white : dc}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 700, color: colors.white,
                      boxShadow: hasPU ? `0 0 18px ${colors.magenta}, 0 0 35px ${colors.magenta}44` : hasBall ? `0 0 12px ${dc}88` : `0 0 4px ${dc}44`,
                      transition: "width 0.2s, height 0.2s",
                    }}>
                      {p.nom.substring(0, 2)}
                    </div>
                    <div style={{ fontSize: 7, color: colors.white, marginTop: 1, textShadow: "0 1px 3px black", fontWeight: 600, whiteSpace: "nowrap" }}>{p.nom}</div>
                    <div style={{ width: 22, height: 2, margin: "1px auto", background: "rgba(0,0,0,0.6)", borderRadius: 1 }}>
                      <div style={{ height: "100%", width: `${stam}%`, background: stam > 50 ? colors.lime : stam > 25 ? colors.gold : colors.coral, borderRadius: 1, transition: "width 1s" }} />
                    </div>
                  </div>
                );
              })}

              {/* Away players (coral/red) */}
              {aiTeam.map((p) => {
                const pos = matchState.positions?.[p.id] || { x: 75, y: 30 };
                const stam = matchState.staminas?.[p.id] || 100;
                const hasBall = matchState.ballOwner === p.id;
                const hasPU = matchState.activePowerUps?.some(pu => pu.playerId === p.id);
                return (
                  <div key={p.id} style={{
                    position: "absolute",
                    left: `${2 + pos.x * 0.96}%`,
                    top: `${3 + pos.y / 60 * 94}%`,
                    transform: "translate(-50%,-50%)",
                    textAlign: "center",
                    transition: "left 0.09s linear, top 0.09s linear",
                    zIndex: hasBall ? 45 : 30,
                  }}>
                    {hasBall && <div style={{ position: "absolute", top: -3, left: "50%", transform: "translateX(-50%)", width: 34, height: 34, borderRadius: "50%", border: `2px solid ${colors.coral}`, opacity: 0.4, animation: "pulse 1s infinite" }} />}
                    <div style={{
                      width: hasBall ? 28 : 24, height: hasBall ? 28 : 24, borderRadius: "50%",
                      background: `radial-gradient(circle, ${colors.coral}aa, ${colors.coral}55)`,
                      border: `2px solid ${hasBall ? colors.white : colors.coral}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 8, fontWeight: 700, color: colors.white,
                      boxShadow: hasPU ? `0 0 18px ${colors.magenta}` : hasBall ? `0 0 12px ${colors.coral}88` : "none",
                      transition: "width 0.2s, height 0.2s",
                    }}>
                      {p.nom.substring(0, 2)}
                    </div>
                    <div style={{ fontSize: 7, color: colors.white, marginTop: 1, textShadow: "0 1px 3px black", fontWeight: 600, whiteSpace: "nowrap" }}>{p.nom}</div>
                    <div style={{ width: 22, height: 2, margin: "1px auto", background: "rgba(0,0,0,0.6)", borderRadius: 1 }}>
                      <div style={{ height: "100%", width: `${stam}%`, background: stam > 50 ? colors.lime : stam > 25 ? colors.gold : colors.coral, borderRadius: 1, transition: "width 1s" }} />
                    </div>
                  </div>
                );
              })}

              {/* Phase indicator */}
              {matchState.phase === "goal_celebration" && (
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 60, textAlign: "center", animation: "pulse 0.5s infinite" }}>
                  <div style={{ fontSize: 48 }}>⚽</div>
                  <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 24, fontWeight: 800, color: colors.lime, textShadow: `0 0 30px ${colors.lime}` }}>BUUUT !</div>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Controls */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {!matchState.isFinished && (
              <>
                {!isRunning ? (
                  <button onClick={startMatch} style={{
                    flex: 1, padding: 12, borderRadius: 10, border: "none", cursor: "pointer",
                    background: `linear-gradient(135deg, ${colors.lime}, #88FF00)`,
                    color: colors.bg, fontWeight: 700, fontSize: 14,
                  }}>
                    ▶ {matchState.time === 0 ? "COUP D'ENVOI" : "REPRENDRE"}
                  </button>
                ) : (
                  <button onClick={pauseMatch} style={{
                    flex: 1, padding: 12, borderRadius: 10, border: "none", cursor: "pointer",
                    background: `linear-gradient(135deg, ${colors.gold}, #FFA500)`,
                    color: colors.bg, fontWeight: 700, fontSize: 14,
                  }}>
                    ⏸ PAUSE TACTIQUE
                  </button>
                )}
                <button onClick={() => setSpeed(s => s >= 4 ? 1 : s * 2)} style={{
                  padding: "12px 20px", borderRadius: 10, border: `1px solid ${colors.cyan}44`,
                  background: "rgba(0,240,255,0.1)", color: colors.cyan, fontWeight: 700, cursor: "pointer", fontSize: 13,
                }}>
                  x{speed}
                </button>
              </>
            )}
            {matchState.isFinished && (
              <button onClick={() => setPage("rapport")} style={{
                flex: 1, padding: 14, borderRadius: 10, border: "none", cursor: "pointer",
                background: `linear-gradient(135deg, ${colors.magenta}, ${colors.violet})`,
                color: colors.white, fontWeight: 700, fontSize: 16, textTransform: "uppercase",
              }}>
                📊 VOIR LE RAPPORT
              </button>
            )}
          </div>

          {/* Strategy + Power-ups during match (always visible, not just pause) */}
          {!matchState.isFinished && (
            <GlassCard style={{ marginBottom: 16 }}>
              {/* Strategy Selector */}
              <div style={{ fontSize: 12, color: colors.gold, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>🧪 Stratégie d'équipe</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {STRATEGIES.map(s => {
                  const isActive = activeStrategy.id === s.id;
                  return (
                    <button key={s.id} onClick={() => {
                      setActiveStrategy(s);
                      if (engine) { engine.setStrategy("home", s); setMatchState(engine.getState()); }
                    }} title={s.desc} style={{
                      padding: "6px 10px", borderRadius: 8, border: `1px solid ${isActive ? colors.gold : colors.muted}44`,
                      background: isActive ? `${colors.gold}22` : "rgba(255,255,255,0.03)",
                      color: isActive ? colors.gold : colors.muted,
                      cursor: "pointer", fontSize: 10, fontWeight: 600,
                      boxShadow: isActive ? `0 0 8px ${colors.gold}33` : "none",
                      transition: "all 0.2s",
                    }}>
                      {s.nom}
                    </button>
                  );
                })}
              </div>
              {activeStrategy && (
                <div style={{ fontSize: 10, color: colors.muted, marginBottom: 12, fontStyle: "italic", lineHeight: 1.4 }}>
                  {activeStrategy.desc}
                  {Object.keys(activeStrategy.modifiers).length > 0 && (
                    <span style={{ color: colors.cyan }}> • Bonus: {Object.entries(activeStrategy.modifiers).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(", ")}</span>
                  )}
                </div>
              )}

              {/* Power-Ups (usable in real-time) */}
              <div style={{ fontSize: 12, color: colors.magenta, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>⚡ Power-Ups</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {selectedTeam.map(p => {
                  const pu = POWER_UPS.find(x => x.joueur === p.id) || POWER_UPS.find(x => x.domaine === p.domaine);
                  if (!pu) return null;
                  const cdKey = p.id + pu.id;
                  const cdEnd = matchState.powerUpCooldowns?.[cdKey] || 0;
                  const ready = cdEnd <= matchState.time;
                  const cdRemaining = ready ? 0 : cdEnd - matchState.time;
                  const isActive = matchState.activePowerUps?.some(a => a.playerId === p.id && a.expiresAt > matchState.time);
                  const dc = getDomainColor(p.domaine);
                  return (
                    <button key={p.id} disabled={!ready || isActive} onClick={() => {
                      if (engine && ready && !isActive) {
                        engine.activatePowerUp(p.id, pu);
                        setMatchState(engine.getState());
                        setEventLog([...engine.getState().events]);
                      }
                    }} title={`${pu.effets}\nCooldown: ${pu.cooldown} ticks`} style={{
                      padding: "6px 10px", borderRadius: 8, fontSize: 10, fontWeight: 600,
                      border: `1px solid ${isActive ? colors.lime : ready ? dc : colors.muted}44`,
                      background: isActive ? `${colors.lime}22` : ready ? `${dc}15` : "rgba(255,255,255,0.03)",
                      color: isActive ? colors.lime : ready ? dc : colors.muted,
                      cursor: ready && !isActive ? "pointer" : "default",
                      opacity: ready || isActive ? 1 : 0.5,
                      position: "relative", overflow: "hidden",
                      boxShadow: isActive ? `0 0 10px ${colors.lime}44` : "none",
                    }}>
                      {isActive ? "✨" : "⚡"} {p.nom}: {pu.nom}
                      {!ready && !isActive && <span style={{ fontSize: 9, marginLeft: 4, color: colors.coral }}>({cdRemaining})</span>}
                      {isActive && <span style={{ fontSize: 9, marginLeft: 4 }}>ACTIF</span>}
                    </button>
                  );
                })}
              </div>
            </GlassCard>
          )}
        </div>

        {/* Event Log */}
        <GlassCard style={{ maxHeight: 600, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 12, color: colors.cyan, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>
            FIL DU MATCH
          </div>
          <div ref={logRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {eventLog.length === 0 && (
              <div style={{ color: colors.muted, fontSize: 12, textAlign: "center", padding: 20 }}>
                En attente du coup d'envoi...
              </div>
            )}
            {eventLog.map((ev, i) => {
              const typeColors = {
                GOAL: colors.lime, MISS: colors.coral, SAVE: colors.cyan,
                TACKLE: colors.violet, FOUL: colors.coral, DRIBBLE: colors.magenta,
                PASS: colors.muted, POWERUP: colors.gold, ASSIST: colors.lime,
              };
              return (
                <div key={i} style={{
                  padding: "8px 10px", borderRadius: 8,
                  background: ev.type === "GOAL" ? `${colors.lime}15` : "rgba(255,255,255,0.03)",
                  borderLeft: `3px solid ${typeColors[ev.type] || colors.muted}`,
                  fontSize: 12,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, color: typeColors[ev.type] || colors.muted, fontSize: 10, textTransform: "uppercase" }}>
                      {ev.type}
                    </span>
                    <span style={{ color: colors.muted, fontSize: 10, fontFamily: "monospace" }}>{formatTime(ev.time)}</span>
                  </div>
                  <div style={{ color: colors.white, lineHeight: 1.4 }}>{ev.narration || `${ev.player} — ${ev.type}`}</div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function RapportPage({ report, setPage }) {
  if (!report) return (
    <div style={{ padding: 24, textAlign: "center", color: colors.muted }}>
      <p>Aucun rapport disponible. Joue un match d'abord !</p>
      <button onClick={() => setPage("dashboard")} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 8, background: colors.cyan, color: colors.bg, border: "none", cursor: "pointer", fontWeight: 700 }}>
        Retour au tableau de bord
      </button>
    </div>
  );

  const goals = report.events.filter(e => e.type === "GOAL");
  const shots = report.events.filter(e => ["GOAL", "MISS", "SAVE"].includes(e.type));
  const tackles = report.events.filter(e => e.type === "TACKLE");
  const fouls = report.events.filter(e => e.type === "FOUL");
  const powerups = report.events.filter(e => e.type === "POWERUP");
  const dribbles = report.events.filter(e => e.type === "DRIBBLE");

  const homeGoals = goals.filter(e => e.team === "home").length;
  const awayGoals = goals.filter(e => e.team === "away").length;
  const result = homeGoals > awayGoals ? "VICTOIRE" : homeGoals < awayGoals ? "DÉFAITE" : "MATCH NUL";
  const resultColor = homeGoals > awayGoals ? colors.lime : homeGoals < awayGoals ? colors.coral : colors.gold;

  // Generate narrative summary
  const generateSummary = () => {
    let text = "";
    if (result === "VICTOIRE") {
      text += `Victoire éclatante ${homeGoals}-${awayGoals} ! Notre équipe de scientifiques a démontré une supériorité technique indiscutable. `;
    } else if (result === "DÉFAITE") {
      text += `Défaite ${homeGoals}-${awayGoals}. L'expérience n'a pas produit les résultats escomptés aujourd'hui. `;
    } else {
      text += `Match nul ${homeGoals}-${awayGoals}. Un équilibre thermodynamique parfait entre les deux équipes. `;
    }

    if (goals.length > 0) {
      const scorers = goals.filter(e => e.team === "home").map(e => e.player);
      if (scorers.length > 0) text += `Nos buteurs : ${[...new Set(scorers)].join(", ")}. `;
    }

    if (powerups.length > 0) {
      text += `${powerups.length} power-up(s) activé(s) pendant le match, modifiant le cours de l'expérience. `;
    }

    if (fouls.length > 3) {
      text += `Match tendu avec ${fouls.length} fautes sifflées. L'agressivité moléculaire était palpable. `;
    }

    return text;
  };

  // Coaching tips
  const tips = [];
  report.homeTeam.forEach(p => {
    const stam = report.staminas[p.id];
    if (stam < 40) tips.push(`⚠️ ${p.nom} est en fatigue critique (${Math.round(stam)}%). Envisage une rotation.`);
  });
  if (shots.filter(e => e.team === "home" && e.type === "MISS").length > 3) {
    tips.push("📊 Trop de tirs ratés. Associe un joueur avec haute Vision (Patrice, Joffrey) pour mieux créer.");
  }
  if (fouls.filter(e => e.team === "home").length > 2) {
    tips.push("🟨 Attention aux fautes ! Réduis le pressing ou remplace les joueurs agressifs en fin de match.");
  }
  if (tips.length === 0) tips.push("✅ Performance solide ! Continue avec cette composition.");

  return (
    <div style={{ padding: "24px", maxWidth: 1000, margin: "0 auto" }}>
      <button onClick={() => setPage("dashboard")} style={{ background: "none", border: "none", color: colors.cyan, cursor: "pointer", fontSize: 14, marginBottom: 16 }}>
        ← Retour au tableau de bord
      </button>

      <h1 style={{ fontFamily: "'Orbitron', monospace", fontSize: 28, fontWeight: 800, color: colors.cyan, marginBottom: 24, textTransform: "uppercase" }}>
        RAPPORT D'APRÈS-MATCH
      </h1>

      {/* Score Header */}
      <GlassCard elevated style={{ textAlign: "center", marginBottom: 24, padding: 32 }}>
        <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 16, fontWeight: 700, color: resultColor, marginBottom: 8, letterSpacing: 4 }}>{result}</div>
        <div style={{ fontFamily: "'Chakra Petch', monospace", fontSize: 56, fontWeight: 700, color: colors.white }}>
          {report.homeScore} <span style={{ color: colors.muted, fontSize: 32 }}>-</span> {report.awayScore}
        </div>
      </GlassCard>

      {/* 4 Blocks */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Narrative Summary */}
        <GlassCard>
          <div style={{ fontSize: 12, color: colors.cyan, fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: 2 }}>📝 Résumé narratif</div>
          <p style={{ color: colors.white, fontSize: 14, lineHeight: 1.7 }}>{generateSummary()}</p>
        </GlassCard>

        {/* Stats */}
        <GlassCard>
          <div style={{ fontSize: 12, color: colors.magenta, fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: 2 }}>📊 Statistiques</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              ["Tirs", shots.filter(e => e.team === "home").length, shots.filter(e => e.team === "away").length],
              ["Tirs cadrés", shots.filter(e => e.team === "home" && e.type !== "MISS").length, shots.filter(e => e.team === "away" && e.type !== "MISS").length],
              ["Tacles", tackles.filter(e => e.team === "home").length, tackles.filter(e => e.team === "away").length],
              ["Fautes", fouls.filter(e => e.team === "home").length, fouls.filter(e => e.team === "away").length],
              ["Dribbles", dribbles.filter(e => e.team === "home").length, dribbles.filter(e => e.team === "away").length],
              ["Power-ups", powerups.filter(e => e.team === "home").length, powerups.filter(e => e.team === "away").length],
            ].map(([label, h, a]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ color: colors.cyan, fontFamily: "monospace", fontSize: 13 }}>{h}</span>
                <span style={{ color: colors.muted, fontSize: 12 }}>{label}</span>
                <span style={{ color: colors.magenta, fontFamily: "monospace", fontSize: 13 }}>{a}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Timeline */}
        <GlassCard>
          <div style={{ fontSize: 12, color: colors.lime, fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: 2 }}>⏱️ Temps forts</div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {goals.concat(powerups).sort((a, b) => a.time - b.time).map((ev, i) => {
              const min = Math.floor(ev.time / 60);
              return (
                <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <span style={{ color: colors.muted, fontSize: 11, fontFamily: "monospace", minWidth: 30 }}>{min}'</span>
                  <span style={{ color: ev.type === "GOAL" ? colors.lime : colors.gold, fontSize: 11 }}>
                    {ev.type === "GOAL" ? "⚽" : "⚡"} {ev.player} {ev.type === "GOAL" ? "marque !" : "active son power-up"}
                  </span>
                </div>
              );
            })}
          </div>
        </GlassCard>

        {/* Coaching Tips */}
        <GlassCard>
          <div style={{ fontSize: 12, color: colors.gold, fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: 2 }}>🧠 Conseils du coach</div>
          {tips.map((tip, i) => (
            <div key={i} style={{ color: colors.white, fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>{tip}</div>
          ))}
        </GlassCard>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={() => setPage("composition")} style={{
          flex: 1, padding: 14, borderRadius: 10, border: "none", cursor: "pointer",
          background: `linear-gradient(135deg, ${colors.cyan}, #00AAFF)`,
          color: colors.bg, fontWeight: 700, fontSize: 14,
        }}>
          🔄 REJOUER
        </button>
        <button onClick={() => {
          const text = `Scientifiq Football Manager 5v5\n${result} ${report.homeScore}-${report.awayScore}\n${generateSummary()}`;
          navigator.clipboard?.writeText(text);
        }} style={{
          padding: "14px 24px", borderRadius: 10, border: `1px solid ${colors.cyan}44`,
          background: "rgba(0,240,255,0.1)", color: colors.cyan, fontWeight: 700, cursor: "pointer", fontSize: 14,
        }}>
          📋 Copier
        </button>
      </div>
    </div>
  );
}

function PowerUpsPage() {
  const [selectedDomain, setSelectedDomain] = useState(null);

  return (
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "'Orbitron', monospace", fontSize: 28, fontWeight: 800, color: colors.cyan, marginBottom: 24, textTransform: "uppercase" }}>
        BIBLIOTHÈQUE DE POWER-UPS
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
        {POWER_UPS.map(pu => {
          const tc = getTypeColor(pu.type);
          const dc = getDomainColor(pu.domaine);
          return (
            <GlassCard key={pu.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: colors.white }}>{pu.nom}</div>
                  <div style={{ fontSize: 11, color: dc }}>{pu.domaine}</div>
                </div>
                <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: `${tc}22`, color: tc, border: `1px solid ${tc}44`, fontWeight: 600 }}>
                  {pu.type.toUpperCase()}
                </span>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: colors.muted }}>⏱ <span style={{ color: colors.cyan }}>{pu.duree}s</span></div>
                <div style={{ fontSize: 11, color: colors.muted }}>🔄 <span style={{ color: colors.gold }}>{pu.cooldown}s</span></div>
              </div>
              <div style={{ fontSize: 12, color: colors.lime, marginBottom: 6, lineHeight: 1.5 }}>✦ {pu.effets}</div>
              {pu.contrepartie !== "Aucune" && (
                <div style={{ fontSize: 12, color: colors.coral, lineHeight: 1.5 }}>⚠ {pu.contrepartie}</div>
              )}
              {/* Joueur associé */}
              <div style={{ marginTop: 10, display: "flex", gap: 4, alignItems: "center" }}>
                {(() => { const p = ROSTER.find(r => r.id === pu.joueur); return p ? (
                  <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 12, background: `${dc}15`, color: dc, border: `1px solid ${dc}33` }}>
                    👤 {p.nom}
                  </span>
                ) : null; })()}
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODULE MULTIJOUEUR — BroadcastChannel (2 onglets même navigateur)
// Pour tester: ouvrir 2 onglets, créer un salon dans l'un, rejoindre dans l'autre
// ═══════════════════════════════════════════════════════════════

function generateRoomCode() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

function useMultiplayer(roomCode) {
  const chRef = useRef(null);
  const [msgs, setMsgs] = useState([]);
  const myIdRef = useRef(Math.random().toString(36).substring(2, 8));
  useEffect(() => {
    if (!roomCode) return;
    const ch = new BroadcastChannel(`labLeague_${roomCode}`);
    chRef.current = ch;
    ch.onmessage = (ev) => { if (ev.data.sid !== myIdRef.current) setMsgs(p => [...p, ev.data]); };
    return () => ch.close();
  }, [roomCode]);
  const send = useCallback((type, payload) => {
    chRef.current?.postMessage({ type, payload, sid: myIdRef.current, ts: Date.now() });
  }, []);
  return { send, msgs, myId: myIdRef.current };
}

// ─── LOBBY ───
function LobbyPage({ setPage, setMultiState }) {
  const [mode, setMode] = useState(null);
  const [pseudo, setPseudo] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [role, setRole] = useState("player");
  const [error, setError] = useState("");
  const create = () => { if (!pseudo.trim()) { setError("Choisis un pseudo !"); return; } const code = generateRoomCode(); setMultiState({ roomCode: code, pseudo: pseudo.trim(), role: "host", phase: "waiting" }); setPage("multiWaiting"); };
  const join = () => { if (!pseudo.trim()) { setError("Choisis un pseudo !"); return; } if (roomInput.length !== 4) { setError("Code = 4 lettres"); return; } setMultiState({ roomCode: roomInput.toUpperCase(), pseudo: pseudo.trim(), role: role === "spectator" ? "spectator" : "guest", phase: "joining" }); setPage("multiWaiting"); };
  const inputStyle = { width: "100%", padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: `1px solid ${colors.cyan}33`, color: colors.white, fontSize: 16, fontFamily: "'Rajdhani', sans-serif", outline: "none" };
  const btnBack = { width: "100%", marginTop: 8, padding: 10, borderRadius: 10, border: `1px solid ${colors.muted}33`, background: "transparent", color: colors.muted, cursor: "pointer", fontSize: 13 };
  return (
    <div style={{ padding: "24px", maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "'Orbitron', monospace", fontSize: 28, fontWeight: 800, color: colors.magenta, textTransform: "uppercase", marginBottom: 8, textShadow: `0 0 30px ${colors.magenta}44` }}>🌐 MODE MULTIJOUEUR</h1>
      <p style={{ color: colors.muted, marginBottom: 32, fontSize: 14 }}>Affronte un autre manager ou regarde en direct. Pour tester : ouvre un 2e onglet du même navigateur !</p>
      <GlassCard style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: colors.cyan, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>TON PSEUDO</div>
        <input value={pseudo} onChange={e => { setPseudo(e.target.value); setError(""); }} placeholder="Ex: DjilaniLeMur" maxLength={20} style={inputStyle} />
      </GlassCard>
      {error && <div style={{ color: colors.coral, fontSize: 13, marginBottom: 16, padding: "8px 12px", background: `${colors.coral}15`, borderRadius: 8, border: `1px solid ${colors.coral}33` }}>⚠️ {error}</div>}
      {!mode && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <GlassCard onClick={() => setMode("create")} elevated style={{ cursor: "pointer", textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏟️</div>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 18, fontWeight: 700, color: colors.cyan }}>CRÉER UN SALON</div>
            <div style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>Invite un ami à te rejoindre</div>
          </GlassCard>
          <GlassCard onClick={() => setMode("join")} elevated style={{ cursor: "pointer", textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 18, fontWeight: 700, color: colors.magenta }}>REJOINDRE</div>
            <div style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>Avec un code salon</div>
          </GlassCard>
        </div>
      )}
      {mode === "create" && (
        <GlassCard elevated>
          <div style={{ fontSize: 12, color: colors.cyan, fontWeight: 700, marginBottom: 16, textTransform: "uppercase", letterSpacing: 2 }}>CRÉER UN SALON</div>
          <p style={{ color: colors.muted, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>Un code à 4 lettres sera généré. Partage-le à ton adversaire, ou ouvre un 2e onglet pour tester.</p>
          <button onClick={create} style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${colors.cyan}, #00AAD4)`, color: colors.bg, fontWeight: 700, fontSize: 16 }}>⚡ CRÉER LE SALON</button>
          <button onClick={() => setMode(null)} style={btnBack}>← Retour</button>
        </GlassCard>
      )}
      {mode === "join" && (
        <GlassCard elevated>
          <div style={{ fontSize: 12, color: colors.magenta, fontWeight: 700, marginBottom: 16, textTransform: "uppercase", letterSpacing: 2 }}>REJOINDRE UN SALON</div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: colors.muted, marginBottom: 6 }}>Code du salon</div>
            <input value={roomInput} onChange={e => { setRoomInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, "")); setError(""); }} placeholder="XXXX" maxLength={4} style={{ ...inputStyle, fontSize: 28, fontFamily: "'Orbitron', monospace", textAlign: "center", letterSpacing: 12, border: `1px solid ${colors.magenta}33` }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>Rôle</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ v: "player", l: "🎮 Joueur", c: colors.cyan }, { v: "spectator", l: "👁️ Spectateur", c: colors.violet }].map(r => (
                <button key={r.v} onClick={() => setRole(r.v)} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${role === r.v ? r.c : colors.muted}44`, background: role === r.v ? `${r.c}15` : "transparent", color: role === r.v ? r.c : colors.muted, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>{r.l}</button>
              ))}
            </div>
          </div>
          <button onClick={join} style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${colors.magenta}, #CC00B8)`, color: colors.white, fontWeight: 700, fontSize: 16 }}>🔗 REJOINDRE</button>
          <button onClick={() => setMode(null)} style={btnBack}>← Retour</button>
        </GlassCard>
      )}
    </div>
  );
}

// ─── WAITING ROOM ───
function WaitingRoomPage({ multiState, setMultiState, setPage }) {
  const { send, msgs, myId } = useMultiplayer(multiState.roomCode);
  const [players, setPlayers] = useState([{ id: myId, pseudo: multiState.pseudo, role: multiState.role }]);
  const [copied, setCopied] = useState(false);
  const announced = useRef(false);
  useEffect(() => { if (!announced.current) { send("JOIN", { pseudo: multiState.pseudo, role: multiState.role }); announced.current = true; } }, []);
  useEffect(() => {
    const m = msgs[msgs.length - 1]; if (!m) return;
    if (m.type === "JOIN") {
      setPlayers(prev => { if (prev.some(p => p.id === m.sid)) return prev; send("JOIN_ACK", { pseudo: multiState.pseudo, role: multiState.role, pl: prev.map(p => ({ id: p.id, pseudo: p.pseudo, role: p.role })) }); return [...prev, { id: m.sid, pseudo: m.payload.pseudo, role: m.payload.role }]; });
    }
    if (m.type === "JOIN_ACK") {
      setPlayers(prev => { let u = [...prev]; if (!u.some(p => p.id === m.sid)) u.push({ id: m.sid, pseudo: m.payload.pseudo, role: m.payload.role }); (m.payload.pl || []).forEach(rp => { if (!u.some(p => p.id === rp.id) && rp.id !== myId) u.push(rp); }); return u; });
    }
    if (m.type === "START_DRAFT") { setMultiState(prev => ({ ...prev, phase: "draft" })); setPage("multiDraft"); }
  }, [msgs]);
  const ap = players.filter(p => p.role === "host" || p.role === "guest");
  const sp = players.filter(p => p.role === "spectator");
  const canStart = multiState.role === "host" && ap.length >= 2;
  const startDraft = () => { send("START_DRAFT", {}); setMultiState(prev => ({ ...prev, phase: "draft" })); setPage("multiDraft"); };
  const copyCode = () => { navigator.clipboard?.writeText(multiState.roomCode); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div style={{ padding: "24px", maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "'Orbitron', monospace", fontSize: 24, fontWeight: 800, color: colors.cyan, textTransform: "uppercase", marginBottom: 24 }}>SALON DE MATCH</h1>
      <GlassCard elevated style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: colors.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>Code du salon</div>
        <div onClick={copyCode} style={{ fontFamily: "'Orbitron', monospace", fontSize: 56, fontWeight: 800, color: colors.cyan, letterSpacing: 16, cursor: "pointer", textShadow: `0 0 40px ${colors.cyan}66` }}>{multiState.roomCode}</div>
        <div style={{ fontSize: 12, color: copied ? colors.lime : colors.muted, marginTop: 8 }}>{copied ? "✅ Copié !" : "Clique pour copier — partage ce code"}</div>
      </GlassCard>
      <GlassCard style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: colors.lime, fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: 2 }}>🎮 JOUEURS ({ap.length}/2)</div>
        {ap.map((p, i) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, marginBottom: 6, background: p.id === myId ? `${colors.cyan}15` : `${colors.magenta}15`, border: `1px solid ${p.id === myId ? colors.cyan : colors.magenta}33` }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${i === 0 ? colors.cyan : colors.magenta}22`, border: `2px solid ${i === 0 ? colors.cyan : colors.magenta}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: i === 0 ? colors.cyan : colors.magenta }}>J{i + 1}</div>
            <div><div style={{ fontWeight: 700, color: colors.white, fontSize: 14 }}>{p.pseudo} {p.id === myId && <span style={{ fontSize: 10, color: colors.muted }}>(toi)</span>}</div><div style={{ fontSize: 11, color: p.role === "host" ? colors.gold : colors.cyan }}>{p.role === "host" ? "👑 Hôte" : "🎮 Invité"}</div></div>
          </div>
        ))}
        {ap.length < 2 && <div style={{ padding: "16px", textAlign: "center", border: `2px dashed ${colors.muted}33`, borderRadius: 8, marginTop: 8 }}><div style={{ animation: "pulse 2s infinite", color: colors.muted, fontSize: 13 }}>⏳ En attente d'un adversaire...</div></div>}
      </GlassCard>
      {sp.length > 0 && <GlassCard style={{ marginBottom: 20 }}><div style={{ fontSize: 12, color: colors.violet, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>👁️ SPECTATEURS ({sp.length})</div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{sp.map(s => <span key={s.id} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 20, background: `${colors.violet}15`, color: colors.violet, border: `1px solid ${colors.violet}33` }}>{s.pseudo}</span>)}</div></GlassCard>}
      {canStart && <button onClick={startDraft} style={{ width: "100%", padding: 16, borderRadius: 12, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${colors.lime}, #88FF00)`, color: colors.bg, fontWeight: 700, fontSize: 18, fontFamily: "'Rajdhani', sans-serif", textTransform: "uppercase" }}>⚡ LANCER LA DRAFT</button>}
      {multiState.role === "spectator" && <div style={{ textAlign: "center", padding: 16, color: colors.violet, fontSize: 14 }}>👁️ Tu es spectateur — en attente du lancement</div>}
      <button onClick={() => { setPage("dashboard"); setMultiState(null); }} style={{ width: "100%", marginTop: 12, padding: 10, borderRadius: 10, border: `1px solid ${colors.muted}33`, background: "transparent", color: colors.muted, cursor: "pointer", fontSize: 13 }}>← Quitter le salon</button>
    </div>
  );
}

// ─── DRAFT ───
function DraftPage({ multiState, setMultiState, setPage }) {
  const { send, msgs, myId } = useMultiplayer(multiState.roomCode);
  const isHost = multiState.role === "host";
  const isSp = multiState.role === "spectator";
  const [phase, setPhase] = useState("formation");
  const [myForm, setMyForm] = useState(null);
  const [oppForm, setOppForm] = useState(null);
  const [myPicks, setMyPicks] = useState([]);
  const [oppPicks, setOppPicks] = useState([]);
  const [turn, setTurn] = useState("host");
  const [myFormOk, setMyFormOk] = useState(false);
  const [oppFormOk, setOppFormOk] = useState(false);
  const allPicked = [...myPicks, ...oppPicks];
  const avail = ROSTER.filter(p => !allPicked.includes(p.id));
  const isMyTurn = !isSp && ((isHost && turn === "host") || (!isHost && turn === "guest"));

  useEffect(() => {
    const m = msgs[msgs.length - 1]; if (!m) return;
    if (m.type === "FORM_PICK") { setOppForm(m.payload.f); setOppFormOk(true); if (myFormOk) setPhase("picking"); }
    if (m.type === "PLAYER_PICK") { setOppPicks(prev => [...prev, m.payload.pid]); setTurn(m.payload.next); }
    if (m.type === "DRAFT_DONE") setPhase("ready");
    if (m.type === "GO_MATCH") {
      setMultiState(prev => ({ ...prev, phase: "match", myTeam: myPicks.map(id => ROSTER.find(p => p.id === id)), oppTeam: oppPicks.map(id => ROSTER.find(p => p.id === id)), myForm, oppForm: oppForm || "2-2" }));
      setPage("multiMatch");
    }
  }, [msgs]);

  const confirmForm = (f) => { setMyForm(f); setMyFormOk(true); send("FORM_PICK", { f }); if (oppFormOk) setPhase("picking"); };
  const pick = (pid) => {
    if (!isMyTurn || phase !== "picking") return;
    const np = [...myPicks, pid]; setMyPicks(np);
    const next = turn === "host" ? "guest" : "host";
    send("PLAYER_PICK", { pid, next }); setTurn(next);
    if (np.length + oppPicks.length >= 10) { setPhase("ready"); send("DRAFT_DONE", {}); }
  };
  const goMatch = () => {
    send("GO_MATCH", {});
    setMultiState(prev => ({ ...prev, phase: "match", myTeam: myPicks.map(id => ROSTER.find(p => p.id === id)), oppTeam: oppPicks.map(id => ROSTER.find(p => p.id === id)), myForm, oppForm: oppForm || "2-2" }));
    setPage("multiMatch");
  };

  const PickSlots = ({ picks, color, label }) => (
    <div>
      <div style={{ fontSize: 12, color, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>{label} ({picks.length}/5)</div>
      {picks.map(id => { const p = ROSTER.find(r => r.id === id); return p ? <div key={id} style={{ padding: "8px 10px", marginBottom: 4, borderRadius: 8, background: `${color}10`, border: `1px solid ${color}33`, fontSize: 12, color: colors.white }}><span style={{ fontWeight: 700 }}>{p.nom}</span> <span style={{ fontSize: 10, color: colors.muted }}>{p.poste}</span></div> : null; })}
      {Array.from({ length: 5 - picks.length }).map((_, i) => <div key={i} style={{ padding: "8px 10px", marginBottom: 4, borderRadius: 8, border: `1px dashed ${colors.muted}22`, color: colors.muted, fontSize: 11, textAlign: "center" }}>—</div>)}
    </div>
  );

  return (
    <div style={{ padding: "24px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Orbitron', monospace", fontSize: 24, fontWeight: 800, color: colors.gold, textTransform: "uppercase" }}>DRAFT</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: colors.muted, fontFamily: "'Orbitron', monospace" }}>{multiState.roomCode}</span>
          <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 20, background: phase === "formation" ? `${colors.gold}22` : phase === "picking" ? `${colors.cyan}22` : `${colors.lime}22`, color: phase === "formation" ? colors.gold : phase === "picking" ? colors.cyan : colors.lime, fontWeight: 700 }}>
            {phase === "formation" ? "📋 FORMATIONS" : phase === "picking" ? "🎯 PICKS" : "✅ PRÊT"}
          </span>
        </div>
      </div>

      {phase === "formation" && !isSp && (
        <GlassCard elevated style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, color: colors.gold, fontWeight: 700, marginBottom: 16, textTransform: "uppercase" }}>Choisis ta formation</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {Object.entries(FORMATIONS).map(([k, f]) => (
              <button key={k} onClick={() => !myFormOk && confirmForm(k)} disabled={myFormOk}
                style={{ padding: 16, borderRadius: 10, cursor: myFormOk ? "default" : "pointer", border: `2px solid ${myForm === k ? colors.cyan : colors.muted}44`, background: myForm === k ? `${colors.cyan}15` : "rgba(255,255,255,0.03)", color: myForm === k ? colors.cyan : colors.white, textAlign: "center", fontSize: 14, fontWeight: 600, opacity: myFormOk && myForm !== k ? 0.3 : 1 }}>{f.label}</button>
            ))}
          </div>
          {myFormOk && !oppFormOk && <div style={{ marginTop: 16, textAlign: "center", color: colors.muted, fontSize: 13, animation: "pulse 2s infinite" }}>⏳ En attente du choix adverse...</div>}
        </GlassCard>
      )}
      {phase === "formation" && isSp && <GlassCard style={{ marginBottom: 24, textAlign: "center", padding: 32 }}><div style={{ color: colors.violet, animation: "pulse 2s infinite" }}>👁️ Les joueurs choisissent leurs formations...</div></GlassCard>}

      {phase === "picking" && (
        <>
          <GlassCard style={{ marginBottom: 16, textAlign: "center", padding: "12px 20px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif", color: isMyTurn ? colors.lime : colors.gold, animation: isMyTurn ? "glow 1.5s infinite" : "none" }}>
              {isSp ? `🎯 Tour de ${turn === "host" ? "J1" : "J2"}` : isMyTurn ? "🎯 C'EST TON TOUR — Choisis un joueur !" : "⏳ L'adversaire choisit..."}
            </div>
            <div style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>Pick {allPicked.length + 1}/10</div>
          </GlassCard>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 16 }}>
            <PickSlots picks={myPicks} color={colors.cyan} label={isSp ? "J1" : "MON ÉQUIPE"} />
            <div>
              <div style={{ fontSize: 12, color: colors.gold, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>DISPONIBLES ({avail.length})</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxHeight: 500, overflowY: "auto" }}>
                {avail.map(p => { const dc = getDomainColor(p.domaine); const avg = Math.round(Object.values(p.attributs).reduce((a, b) => a + b, 0) / 8); return (
                  <div key={p.id} onClick={() => isMyTurn && pick(p.id)} style={{ padding: "10px", borderRadius: 8, cursor: isMyTurn ? "pointer" : "default", background: isMyTurn ? `${dc}10` : "rgba(255,255,255,0.02)", border: `1px solid ${isMyTurn ? dc : colors.muted}33`, opacity: isMyTurn ? 1 : 0.5, transition: "all 0.2s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div><div style={{ fontWeight: 700, fontSize: 13, color: colors.white }}>{p.nom}</div><div style={{ fontSize: 10, color: dc }}>{p.poste}</div></div>
                      <div style={{ fontFamily: "'Chakra Petch', monospace", fontSize: 18, fontWeight: 700, color: dc }}>{avg}</div>
                    </div>
                  </div>
                ); })}
              </div>
            </div>
            <PickSlots picks={oppPicks} color={colors.magenta} label={isSp ? "J2" : "ADVERSAIRE"} />
          </div>
        </>
      )}

      {phase === "ready" && (
        <GlassCard elevated style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏟️</div>
          <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 22, fontWeight: 800, color: colors.lime, marginBottom: 8 }}>DRAFT TERMINÉE !</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24, textAlign: "left" }}>
            <div>
              <div style={{ fontSize: 12, color: colors.cyan, fontWeight: 700, marginBottom: 8 }}>{isSp ? "J1" : "MON ÉQUIPE"} — {myForm}</div>
              {myPicks.map(id => { const p = ROSTER.find(r => r.id === id); return p ? <div key={id} style={{ fontSize: 13, color: colors.white, marginBottom: 4 }}>• {p.nom} <span style={{ color: colors.muted }}>({p.poste})</span></div> : null; })}
            </div>
            <div>
              <div style={{ fontSize: 12, color: colors.magenta, fontWeight: 700, marginBottom: 8 }}>{isSp ? "J2" : "ADVERSAIRE"} — {oppForm || "?"}</div>
              {oppPicks.map(id => { const p = ROSTER.find(r => r.id === id); return p ? <div key={id} style={{ fontSize: 13, color: colors.white, marginBottom: 4 }}>• {p.nom} <span style={{ color: colors.muted }}>({p.poste})</span></div> : null; })}
            </div>
          </div>
          {isHost && <button onClick={goMatch} style={{ padding: "16px 48px", borderRadius: 12, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${colors.lime}, #88FF00)`, color: colors.bg, fontWeight: 700, fontSize: 18, textTransform: "uppercase" }}>⚽ COUP D'ENVOI !</button>}
          {!isHost && !isSp && <div style={{ color: colors.muted, animation: "pulse 2s infinite" }}>⏳ L'hôte lance le match...</div>}
          {isSp && <div style={{ color: colors.violet, animation: "pulse 2s infinite" }}>👁️ En attente du coup d'envoi...</div>}
        </GlassCard>
      )}
    </div>
  );
}

// ─── MULTI MATCH ───
function MultiMatchPage({ multiState, setPage, setLastMatchReport }) {
  const { send, msgs } = useMultiplayer(multiState.roomCode);
  const isHost = multiState.role === "host";
  const isSp = multiState.role === "spectator";
  const [engine, setEngine] = useState(null);
  const [ms, setMs] = useState(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [elog, setElog] = useState([]);
  const iRef = useRef(null);
  const logRef = useRef(null);

  const myTeam = multiState.myTeam || [];
  const oppTeam = multiState.oppTeam || [];
  const homeTeam = isHost ? myTeam : oppTeam;
  const awayTeam = isHost ? oppTeam : myTeam;

  useEffect(() => {
    if (isHost && homeTeam.length && awayTeam.length) {
      const e = new SimpleMatchEngine(homeTeam, awayTeam, multiState.myForm || "2-2", multiState.oppForm || "2-2");
      setEngine(e); setMs(e.getState());
    }
    return () => { if (iRef.current) clearInterval(iRef.current); };
  }, []);

  const doStart = () => {
    if (!engine || !isHost) return;
    setRunning(true); send("M_START", {});
    iRef.current = setInterval(() => {
      const ok = engine.simulateTick(); const st = engine.getState();
      setMs(st); setElog([...st.events]);
      send("M_TICK", st);
      if (!ok || st.isFinished) {
        clearInterval(iRef.current); setRunning(false); send("M_END", st);
        setLastMatchReport({ homeScore: st.homeScore, awayScore: st.awayScore, events: st.events, homeTeam, awayTeam, staminas: st.staminas });
      }
    }, Math.max(20, 100 / speed));
  };
  const doPause = () => { clearInterval(iRef.current); setRunning(false); send("M_PAUSE", {}); };

  useEffect(() => {
    const m = msgs[msgs.length - 1]; if (!m) return;
    if (m.type === "M_TICK" && !isHost) { setMs(m.payload); setElog(m.payload?.events || []); }
    if (m.type === "M_END" && !isHost) { const s = m.payload; setMs(s); setRunning(false); setLastMatchReport({ homeScore: s.homeScore, awayScore: s.awayScore, events: s.events || elog, homeTeam, awayTeam, staminas: s.staminas }); }
    if (m.type === "PU_ACT" && isHost && engine) { const pu = POWER_UPS.find(x => x.id === m.payload.puId); if (pu) { engine.activatePowerUp(m.payload.pid, pu); setMs(engine.getState()); setElog([...engine.getState().events]); } }
    if (m.type === "M_START" && !isHost) setRunning(true);
    if (m.type === "M_PAUSE") setRunning(false);
  }, [msgs]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [elog]);
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const actPU = (pid, pu) => { if (isHost) { engine.activatePowerUp(pid, pu); setMs(engine.getState()); setElog([...engine.getState().events]); } else if (!isSp) { send("PU_ACT", { pid, puId: pu.id }); } };

  if (!ms) return <div style={{ padding: 24, textAlign: "center", color: colors.muted, animation: "pulse 2s infinite", fontSize: 16 }}>⏳ {isHost ? "Chargement..." : "En attente du coup d'envoi..."}</div>;

  const puTeam = isSp ? [] : myTeam;
  const typeColors = { GOAL: colors.lime, MISS: colors.coral, SAVE: colors.cyan, TACKLE: colors.violet, FOUL: colors.coral, DRIBBLE: colors.magenta, PASS: colors.muted, POWERUP: colors.gold };

  return (
    <div style={{ padding: "16px", maxWidth: 1400, margin: "0 auto" }}>
      <GlassCard elevated style={{ marginBottom: 16, padding: "16px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 12, color: colors.cyan, fontWeight: 700, marginBottom: 4 }}>{isHost ? "MON ÉQUIPE" : isSp ? "J1" : "ADVERSAIRE"}</div>
            <div style={{ fontFamily: "'Chakra Petch', monospace", fontSize: 48, fontWeight: 700, color: colors.white }}>{ms.homeScore}</div>
          </div>
          <div style={{ textAlign: "center", padding: "0 32px" }}>
            {isSp && <div style={{ fontSize: 10, color: colors.violet, marginBottom: 4 }}>👁️ SPECTATEUR</div>}
            {ms.isFinished ? <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 14, color: colors.coral, fontWeight: 700 }}>TERMINÉ</div> : running ? <div style={{ width: 12, height: 12, borderRadius: "50%", background: colors.coral, margin: "0 auto 4px", animation: "pulse 1s infinite" }} /> : null}
            <div style={{ fontFamily: "'Chakra Petch', monospace", fontSize: 24, color: colors.cyan }}>{fmt(ms.time)}</div>
            <div style={{ fontSize: 11, color: colors.muted }}>/ {fmt(ms.maxTime)}</div>
          </div>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 12, color: colors.magenta, fontWeight: 700, marginBottom: 4 }}>{isHost ? "ADVERSAIRE" : isSp ? "J2" : "MON ÉQUIPE"}</div>
            <div style={{ fontFamily: "'Chakra Petch', monospace", fontSize: 48, fontWeight: 700, color: colors.white }}>{ms.awayScore}</div>
          </div>
        </div>
      </GlassCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 350px", gap: 16 }}>
        <div>
          <GlassCard style={{ marginBottom: 16 }}>
            <div style={{ position: "relative", width: "100%", paddingBottom: "55%", background: "linear-gradient(180deg, #0a3d0a, #0d4d0d, #0a3d0a)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(255,255,255,0.2)" }} />
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 50, height: 50, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)" }} />
              <div style={{ position: "absolute", left: `${ms.possession === "home" ? 55 + Math.random() * 20 : 25 + Math.random() * 20}%`, top: `${40 + Math.random() * 20}%`, transform: "translate(-50%,-50%)", width: 10, height: 10, borderRadius: "50%", background: colors.white, boxShadow: `0 0 10px ${colors.white}88`, transition: "all 0.3s" }} />
              {homeTeam.map((p, i) => { const pos = ms.positions?.[p.id] || { x: 20 + i * 15, y: 30 + i * 10 }; const stam = ms.staminas?.[p.id] || 100; const dc = getDomainColor(p.domaine); const hasPU = (ms.activePowerUps || []).some(x => x.playerId === p.id); return (
                <div key={p.id} style={{ position: "absolute", left: `${Math.min(48, pos.x)}%`, top: `${pos.y}%`, transform: "translate(-50%,-50%)", textAlign: "center", transition: "all 0.5s ease" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: `radial-gradient(circle, ${dc}88, ${dc}44)`, border: `2px solid ${dc}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: colors.white, boxShadow: hasPU ? `0 0 20px ${colors.magenta}` : `0 0 8px ${dc}44`, animation: hasPU ? "pulse 0.5s infinite" : "none" }}>{p.nom.substring(0, 2)}</div>
                  <div style={{ fontSize: 8, color: colors.white, marginTop: 1, textShadow: "0 1px 2px black" }}>{p.nom}</div>
                  <div style={{ width: 24, height: 2, margin: "1px auto", background: "rgba(0,0,0,0.5)", borderRadius: 1 }}><div style={{ height: "100%", width: `${stam}%`, background: stam > 50 ? colors.lime : colors.coral, borderRadius: 1 }} /></div>
                </div>); })}
              {awayTeam.map((p, i) => { const pos = ms.positions?.[p.id] || { x: 60 + i * 8, y: 20 + i * 15 }; return (
                <div key={p.id} style={{ position: "absolute", left: `${Math.max(52, pos.x)}%`, top: `${pos.y}%`, transform: "translate(-50%,-50%)", textAlign: "center", transition: "all 0.5s ease" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,51,102,0.6), rgba(255,51,102,0.2))", border: `2px solid ${colors.coral}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: colors.white }}>{p.nom.substring(0, 2)}</div>
                  <div style={{ fontSize: 8, color: colors.white, marginTop: 1, textShadow: "0 1px 2px black" }}>{p.nom}</div>
                </div>); })}
            </div>
          </GlassCard>

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {!ms.isFinished && isHost && (<>
              {!running ? <button onClick={doStart} style={{ flex: 1, padding: 12, borderRadius: 10, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${colors.lime}, #88FF00)`, color: colors.bg, fontWeight: 700, fontSize: 14 }}>▶ {ms.time === 0 ? "COUP D'ENVOI" : "REPRENDRE"}</button>
              : <button onClick={doPause} style={{ flex: 1, padding: 12, borderRadius: 10, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${colors.gold}, #FFA500)`, color: colors.bg, fontWeight: 700, fontSize: 14 }}>⏸ PAUSE</button>}
              <button onClick={() => setSpeed(s => s >= 4 ? 1 : s * 2)} style={{ padding: "12px 20px", borderRadius: 10, border: `1px solid ${colors.cyan}44`, background: "rgba(0,240,255,0.1)", color: colors.cyan, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>x{speed}</button>
            </>)}
            {ms.isFinished && <button onClick={() => setPage("rapport")} style={{ flex: 1, padding: 14, borderRadius: 10, border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${colors.magenta}, ${colors.violet})`, color: colors.white, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>📊 VOIR LE RAPPORT</button>}
          </div>

          {!ms.isFinished && !running && ms.time > 0 && !isSp && puTeam.length > 0 && (
            <GlassCard style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: colors.magenta, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>⚡ Tes Power-Ups</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {puTeam.map(p => { const pu = POWER_UPS.find(x => x.joueur === p.id) || POWER_UPS.find(x => x.domaine === p.domaine); if (!pu) return null; const ready = isHost ? (!engine?.powerUpCooldowns[p.id + pu.id] || engine.powerUpCooldowns[p.id + pu.id] <= ms.time) : true; return (
                  <button key={p.id} disabled={!ready} onClick={() => actPU(p.id, pu)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${ready ? getDomainColor(p.domaine) : colors.muted}44`, background: ready ? `${getDomainColor(p.domaine)}15` : "rgba(255,255,255,0.03)", color: ready ? getDomainColor(p.domaine) : colors.muted, cursor: ready ? "pointer" : "default", fontSize: 11, fontWeight: 600, opacity: ready ? 1 : 0.4 }}>⚡ {p.nom}: {pu.nom}</button>
                ); })}
              </div>
            </GlassCard>
          )}
        </div>

        <GlassCard style={{ maxHeight: 600, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 12, color: colors.cyan, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>FIL DU MATCH</div>
          <div ref={logRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {elog.length === 0 && <div style={{ color: colors.muted, fontSize: 12, textAlign: "center", padding: 20 }}>En attente du coup d'envoi...</div>}
            {elog.map((ev, i) => (
              <div key={i} style={{ padding: "8px 10px", borderRadius: 8, background: ev.type === "GOAL" ? `${colors.lime}15` : "rgba(255,255,255,0.03)", borderLeft: `3px solid ${typeColors[ev.type] || colors.muted}`, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, color: typeColors[ev.type] || colors.muted, fontSize: 10, textTransform: "uppercase" }}>{ev.type}</span>
                  <span style={{ color: colors.muted, fontSize: 10, fontFamily: "monospace" }}>{fmt(ev.time)}</span>
                </div>
                <div style={{ color: colors.white, lineHeight: 1.4 }}>{ev.narration || `${ev.player} — ${ev.type}`}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [selectedTeam, setSelectedTeam] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [formation, setFormation] = useState("2-2");
  const [lastMatchReport, setLastMatchReport] = useState(null);
  const [multiState, setMultiState] = useState(null);

  const togglePlayer = (player) => {
    setSelectedTeam(prev => {
      if (prev.some(p => p.id === player.id)) return prev.filter(p => p.id !== player.id);
      if (prev.length >= 5) return prev;
      return [...prev, player];
    });
  };

  const handleSelectPlayer = (player) => {
    setSelectedPlayer(player);
    setPage("playerDetail");
  };

  const navItems = [
    { id: "dashboard", label: "Tableau de bord", icon: "🏠" },
    { id: "roster", label: "Roster", icon: "👥" },
    { id: "composition", label: "Composition", icon: "⚽" },
    { id: "powerups", label: "Power-Ups", icon: "⚡" },
    { id: "lobby", label: "Multijoueur", icon: "🌐" },
  ];
  if (page === "match") navItems.push({ id: "match", label: "Match en cours", icon: "🏟️" });
  if (lastMatchReport) navItems.push({ id: "rapport", label: "Rapport", icon: "📊" });

  const isMultiPage = ["lobby", "multiWaiting", "multiDraft", "multiMatch"].includes(page);

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(135deg, ${colors.bg} 0%, ${colors.bgPanel} 50%, ${colors.bg} 100%)`,
      color: colors.white,
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      {/* Global styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;800&family=Rajdhani:wght@400;600;700&family=Chakra+Petch:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${colors.cyan}44; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${colors.cyan}88; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes glow { 0%,100%{box-shadow:0 0 10px ${colors.cyan}44} 50%{box-shadow:0 0 25px ${colors.cyan}88} }
        ::selection { background: ${colors.cyan}44; color: white; }
        body { overflow-x: hidden; }
      `}</style>

      {/* Header */}
      <header style={{
        ...glass, borderRadius: 0, padding: "0 24px", height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
        borderTop: "none", borderLeft: "none", borderRight: "none",
        borderBottom: `1px solid ${colors.cyan}22`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>🧬</span>
          <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 18, fontWeight: 800, color: colors.cyan, letterSpacing: 2 }}>
            LAB LEAGUE
          </span>
        </div>
        <nav style={{ display: "flex", gap: 4 }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                background: (page === item.id || (isMultiPage && item.id === "lobby") || (page === "playerDetail" && item.id === "roster"))
                  ? `${item.id === "lobby" ? colors.magenta : item.id === "match" ? colors.coral : colors.cyan}22` : "transparent",
                color: (page === item.id || (isMultiPage && item.id === "lobby") || (page === "playerDetail" && item.id === "roster"))
                  ? (item.id === "lobby" ? colors.magenta : item.id === "match" ? colors.coral : colors.cyan) : colors.muted,
                fontWeight: 600, fontSize: 13, fontFamily: "'Rajdhani', sans-serif",
                transition: "all 0.2s",
              }}>
              <span style={{ marginRight: 6 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {multiState && <div style={{ fontSize: 11, color: colors.magenta, fontFamily: "'Orbitron', monospace" }}>🌐 {multiState.roomCode}</div>}
          <div style={{ fontSize: 11, color: colors.muted }}>
            Équipe: <span style={{ color: selectedTeam.length === 5 ? colors.lime : colors.coral, fontWeight: 700 }}>{selectedTeam.length}/5</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ minHeight: "calc(100vh - 64px)" }}>
        {page === "dashboard" && <DashboardPage setPage={setPage} selectedTeam={selectedTeam} />}
        {page === "roster" && <RosterPage setPage={setPage} selectedTeam={selectedTeam} setSelectedPlayer={handleSelectPlayer} />}
        {page === "playerDetail" && <PlayerDetailPage player={selectedPlayer} selectedTeam={selectedTeam} togglePlayer={togglePlayer} setPage={setPage} />}
        {page === "composition" && <CompositionPage selectedTeam={selectedTeam} setSelectedTeam={setSelectedTeam} formation={formation} setFormation={setFormation} setPage={setPage} />}
        {page === "match" && <MatchPage selectedTeam={selectedTeam} formation={formation} setPage={setPage} setLastMatchReport={setLastMatchReport} />}
        {page === "rapport" && <RapportPage report={lastMatchReport} setPage={setPage} />}
        {page === "powerups" && <PowerUpsPage />}
        {page === "lobby" && <LobbyPage setPage={setPage} setMultiState={setMultiState} />}
        {page === "multiWaiting" && multiState && <WaitingRoomPage multiState={multiState} setMultiState={setMultiState} setPage={setPage} />}
        {page === "multiDraft" && multiState && <DraftPage multiState={multiState} setMultiState={setMultiState} setPage={setPage} />}
        {page === "multiMatch" && multiState && <MultiMatchPage multiState={multiState} setPage={setPage} setLastMatchReport={setLastMatchReport} />}
      </main>

      {/* Footer */}
      <footer style={{
        padding: "12px 24px", textAlign: "center",
        borderTop: `1px solid rgba(255,255,255,0.05)`,
        fontSize: 11, color: colors.muted,
      }}>
        Scientifiq Football Manager 5v5 — Lab League v2.0 — Where Science Meets Football
      </footer>
    </div>
  );
}
