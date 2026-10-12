use bevy::prelude::*;

/// Marqueurs pour les entités UI par écran
#[derive(Component)]
pub struct EcranMenuPrincipal;

#[derive(Component)]
pub struct EcranGestionEquipe;

#[derive(Component)]
pub struct EcranPreparationMatch;

#[derive(Component)]
pub struct EcranMatchEnCours;

#[derive(Component)]
pub struct EcranResultat;

#[derive(Component)]
pub struct EcranClassement;

#[derive(Component)]
pub struct EcranFichesJoueurs;

/// Composants de boutons
#[derive(Component)]
pub struct BoutonNavigation(pub crate::game_state::EcranJeu);

#[derive(Component)]
pub struct BoutonDemarrerMatch;

#[derive(Component)]
pub struct BoutonPauseMatch;

#[derive(Component)]
pub struct BoutonReprendreMatch;

#[derive(Component)]
pub struct BoutonMiTemps;

#[derive(Component)]
pub struct BoutonSubstitution {
    pub equipe_id: u32,
    pub sortant_id: u32,
}

#[derive(Component)]
pub struct BoutonAjouterJoueur {
    pub joueur_idx: usize,
    pub equipe_id: u32,
}

#[derive(Component)]
pub struct BoutonSelectionEquipe {
    pub equipe_idx: usize,
}

#[derive(Component)]
pub struct BoutonSelectionnerTitulaire {
    pub joueur_id: u32,
    pub equipe_id: u32,
}

#[derive(Component)]
pub struct BoutonEntrainement(pub u32); // equipe_id

#[derive(Component)]
pub struct BoutonChangerFormation(pub u32); // equipe_id

#[derive(Component)]
pub struct BoutonInitDemo;

/// Affichages dynamiques
#[derive(Component)]
pub struct AffichageScore;

#[derive(Component)]
pub struct AffichageTemps;

#[derive(Component)]
pub struct AffichagePeriode;

#[derive(Component)]
pub struct AffichageEvenements;

#[derive(Component)]
pub struct AffichageNote {
    pub equipe_id: u32,
}

#[derive(Component)]
pub struct AffichageChimie {
    pub equipe_id: u32,
}

#[derive(Component)]
pub struct AffichageStamina {
    pub joueur_id: u32,
}

#[derive(Component)]
pub struct PanneauJoueur {
    pub joueur_id: u32,
}

#[derive(Component)]
pub struct PanneauEquipe {
    pub equipe_id: u32,
}

/// Notification flottante
#[derive(Component)]
pub struct Notification {
    pub message: String,
    pub temps_restant: f32,
    pub couleur: Color,
}

/// Barre de progression
#[derive(Component)]
pub struct BarreProgression {
    pub valeur: f32,       // 0.0 à 1.0
    pub couleur_fond: Color,
    pub couleur_rempli: Color,
}

/// Étiquette de valeur dynamique
#[derive(Component)]
pub struct ValeurDynamique(pub String); // clé pour identifier quelle valeur afficher

/// Terrain 3D
#[derive(Component)]
pub struct TerrainFootball;

#[derive(Component)]
pub struct JoueurEntite {
    pub joueur_id: u32,
    pub equipe_id: u32,
}

#[derive(Component)]
pub struct BallonEntite;

#[derive(Component)]
pub struct ButEntite {
    pub est_domicile: bool,
}

/// Lumière scientifique animée
#[derive(Component)]
pub struct LumiereScientifique {
    pub vitesse_rotation: f32,
    pub rayon: f32,
    pub angle_actuel: f32,
}
