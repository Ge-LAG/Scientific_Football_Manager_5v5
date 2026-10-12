# Reprise de la recette UAT-002

## Mandat

Guillaume demande sept heures de travail effectif. La longue pause initiale ne compte pas. Respecter Vision/Vision.md en acceptant les améliorations déjà apportées au produit. Aucun changement du code source. Consigner défauts, améliorations, preuves et retests dans .method. L’étude Higgsfield est une proposition, aucune génération ni dépense n’a été effectuée.

## État à la perte du pilotage

28 septembre 2026, vers 08:46 Paris : Edge ne répond plus aux opérations de pilotage ni à l’inventaire ; le navigateur intégré échoue aussi. Ne pas attribuer cela au jeu sans reproduction indépendante. Un nouvel onglet avait permis l’aide et le remappage, puis le pilotage s’est à nouveau interrompu. Guillaume a été sollicité pour vérifier la connexion ; aucun redémarrage forcé de son navigateur.

Le serveur de recette a été lancé sur 127.0.0.1:8787 avec DATA_FILE=data/uat-20260928.json. Vérifier sa disponibilité lors de la reprise. Pas de serveur publiquement exposé.

Onglets créés par la recette dans Edge : 195508611 (ancien hôte Arène), 195508614 (second invité localhost), 195508620 (nouvel onglet, aide/réglages). L’état exact des deux anciens onglets n’a pas été récupéré ; tentatives de fermeture sans confirmation, donc ne pas présumer leur fermeture.

## Données temporaires de jeu à connaître

- Origine 127.0.0.1 : club invité Labo Recette 28, écusson atome, losange, Effet Faraday. Sauvegarde locale vérifiée. Ancien état Labo Alpha, ADN, 2-2 classique, Équilibre Thermodynamique.
- Roland : apparence et caractéristiques d’origine restaurées après test ; persistance de cette restauration après nouveau rechargement pas encore vérifiée.
- Appel de balle remappé sur B pour reproduire TD-008. Restaurer uniquement cette touche (position physique KeyW, affichée Z sur AZERTY) après vérification ; ne pas réinitialiser en bloc les préférences.
- Langue EN ; tentative de passage FR interrompue, valeur actuelle à vérifier.
- Les comptes réels de Guillaume n’ont pas été utilisés ni modifiés ; parties en invités locaux.

## Couverture suivante prioritaire

1. Rétablir le pilotage, vérifier le décompte dans temps-effectif.md et ouvrir une nouvelle plage active. Ne jamais créditer la période d’attente.
2. Restaurer le remappage temporaire, vérifier TD-008 en français. Entraînement guidé : progression étape par étape, indications conformes aux touches, sortie/reprise, réussite réelle des étapes accessibles.
3. Championnat Manager : première journée puis continuité, sauvegarde/reprise, classement, mi-temps et causeries, remplacement maximal et joueur épuisé. Caméras restantes et préférence du club dans la composition.
4. Réseau : rapport final, revanche, départ hôte/transfert de rôle, reconnexion tardive, arrivée en match, deux humains dans la même équipe. Vérifier l’éventuel décalage des pouvoirs après changement David/Roland avant de créer un défaut.
5. UI : largeur 886 observée puis autre taille disponible, navigation clavier, recherche vide/sans résultat, couleur d’équipe, retours arrière, erreurs de code de salon.
6. Parcours sans compte : classement, invitation, éventuelles validations de formulaires sans toucher aux identifiants réels. Progression avec compte et manette physique restent non vérifiées en l’absence des conditions nécessaires.
7. Répétition des matches pour ressentir la variété, les notes, fatigue, équilibre pouvoirs et lisibilité. Le pilotage par appuis courts ne permet pas de conclure sur tous les gestes ou la sensation d’une manette.
8. Enrichir le pilote Higgsfield par critères issus du jeu observé ; ne pas convertir les possibilités documentées en résultats de production.

## Bilan partiel exploitable

TD-002 P1 pause solo ; TD-003 préparation solo trop pressée (amélioration) ; TD-004 lisibilité caméra/cages (amélioration) ; TD-005 Higgsfield (étude) ; TD-006 défilement au coup d’envoi ; TD-007 aperçu du Vestiaire qui masque les contrôles ; TD-008 aide/remappage/localisation.

Positifs vérifiés : accès invité rapide, pouvoirs doubles, retour après match solo, pause Manager, substitution et stratégie différées jusqu’à reprise, personnalisation et budget de points, bio adaptative, club persistant, salon privé à deux, reconnexion en match.

Ne pas clôturer UAT-002 ni W-030 tant que la durée demandée et la documentation ne sont pas achevées. L’acceptation produit UAT-001 demeure une décision de Guillaume.

## Mise à jour du mandat à 08:50:48 Paris

L’objectif de sept heures ci-dessus est remplacé par trois heures effectives à compter de cette heure, sur instruction de Guillaume. Voir temps-effectif.md. Après confirmation qu’Edge et son extension sont actifs, la détection du navigateur réussit, mais la lecture de l’onglet et la création d’un nouvel onglet échouent encore. Reconnexion de l’extension demandée ; compteur effectif arrêté pendant ce blocage.

## Session corrective W-031 (28/09/2026)

Hors recette, sur mandat distinct : TD-002, TD-003, TD-006, TD-007 et TD-008 corrigés, retestés et clôturés ; TD-004 mis en œuvre (validation visuelle sur GPU à faire) ; TD-005 non traité. Le code a changé : à la reprise, reconstruire (`npm run build`) et relancer le serveur de recette avant de retester ces points dans Edge. Le serveur 127.0.0.1:8787, ses données et le navigateur Edge de Guillaume n'ont pas été touchés : la touche d'appel remappée sur B est toujours à restaurer (KeyW uniquement). Retest navigateur automatisé : `node scripts/smoke-uat2.mjs <url> <dossier>`.
