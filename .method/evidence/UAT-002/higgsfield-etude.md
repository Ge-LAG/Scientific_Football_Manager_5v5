# Higgsfield — pistes de production pour Lab League

Demande de Guillaume pendant UAT-002. Recherche documentaire du 28 septembre 2026, sans achat, génération, téléversement de références ni changement de code. Les capacités annoncées ci-dessous ne constituent pas une évaluation de qualité par écoute ou par import dans le jeu.

## Recommandation de pilote

Produire ultérieurement un petit lot représentatif : trois scientifiques de morphologies différentes, une arène, douze commentaires FR et leur version EN, six bruitages et une introduction facultative. Conserver le style cartoon néon et l'humour scientifique. Comparer à l'existant avant de généraliser aux seize personnages et aux soixante-quatre pouvoirs.

| Domaine | Possibilité documentée | Proposition pour le jeu | Validation avant intégration |
|---|---|---|---|
| Portraits et direction artistique | Génération/édition d'images avec références | Planches cohérentes des scientifiques, portraits, pictogrammes de pouvoirs et décors | Reconnaissance des 16 personnages ; silhouette et couleurs d'équipe lisibles ; éviter les détails qui deviennent du bruit en match |
| Assets 3D | 3D Jutsu annonce import/export GLB ; catalogue officiel : Meshy Multi-Image to 3D | Tester des accessoires ou éléments de stade, puis un avatar pilote | Maillage, UV, textures, échelle, squelette, animations, variantes de tenue, collisions et coût de rendu à contrôler ; un GLB exporté n'est pas automatiquement prêt pour le jeu |
| Voix de commentateurs | TTS, voix multiples, FR/EN, réglage d'émotion/prononciation, export WAV/MP3 | Banque de phrases courtes, 2 commentateurs complémentaires, variantes d'intensité, prononciation des noms | Écoute réelle ; intelligibilité pendant les effets ; absence de chevauchement ; variété sur 5 matchs ; sous-titres et volumes séparés |
| Bruitages et ambiance | Catalogue officiel : Seed Audio, Mirelo Text to Audio et Sonilo Music | Frappes, parois, tacles, public, sons distinctifs par domaine, boucle musicale de menu | Latence, boucles sans rupture, mixage, fatigue auditive, associations son/action reconnaissables |
| Vidéos | Génération vidéo et audio, Cinema Studio | Introduction désactivable, présentation des scientifiques, bande-annonce | Ne pas retarder le premier match ; chargement différé ; transitions courtes et sautables |

## Architecture recommandée (proposition)

Générer et valider les assets en amont, les optimiser puis les distribuer comme fichiers statiques versionnés. Éviter une génération payante dans la boucle d'un match : coûts, indisponibilité réseau et latence seraient contraires au lancement immédiat et au solo hors ligne. Garder les collisions, commandes, animations interactives et règles dans le moteur existant. Les vidéos peuvent guider la direction artistique, mais elles ne remplacent pas une animation squelettique interactive.

Pour les voix, déclencher des clips par événement, priorité (but > arrêt > ambiance), délai minimal et anti-répétition. Prévoir un repli si le clip manque, et ne pas charger toute la banque avant de jouer. Pour la personnalisation, le portrait doit rester cohérent avec l'apparence réellement choisie ; une image fixe ne doit pas promettre un visage ou une tenue absents du terrain.

## Coût et droits : points à établir pendant le pilote

Pas de budget inventé : relever le tarif affiché par le modèle choisi, le nombre d'essais et la proportion d'assets retenus. Mesure utile : coût par asset accepté = dépenses totales / assets réellement acceptés. Ajouter le temps de nettoyage, rigging, localisation et intégration. Les crédits de l'interface et la facturation API doivent être examinés séparément. Aucun abonnement recommandé avant le pilote.

Higgsfield indique autoriser les usages commerciaux de ses sorties, sans garantir leur exclusivité ; cela ne remplace pas la vérification des droits sur les références et les modèles utilisés. Préférer des voix originales du catalogue pour le pilote. Toute imitation d'une personne identifiable nécessite les droits et l'accord correspondants. Cette session n'envoie aucune photo ni voix des consultants.

## Incertitudes à résoudre

Les pages officielles ne sont pas totalement alignées : le guide Audio décrit surtout la parole et indique l'absence de générateur SFX/musique autonome, alors que le catalogue technique officiel énumère Seed Audio, Mirelo et Sonilo. Vérifier l'accès réel dans le compte, le modèle disponible et son tarif avant toute production. Même prudence pour la qualité du rigging et la compatibilité GLB : capacités annoncées, import non testé ici.

## Sources officielles consultées

- [TTS, FR/EN et exports audio](https://higgsfield.ai/text-to-speech)
- [Guide Audio et ses limites annoncées](https://higgsfield.ai/blog/higgsfield-audio)
- [Catalogue technique officiel : images, 3D et audio](https://github.com/higgsfield-ai/skills/blob/main/higgsfield-generate/references/model-catalog.md)
- [3D Jutsu : export GLB et scènes](https://higgsfield.ai/blog/higgsfield-3d-jutsu)
- [Génération d'images](https://higgsfield.ai/ai-image)
- [Cinema Studio](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-cinema-studio)
- [Tarification API](https://open.higgsfield.ai/pricing)
- [Propriété et usage commercial des sorties](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially)
