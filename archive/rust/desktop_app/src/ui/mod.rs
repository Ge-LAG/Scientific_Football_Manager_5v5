pub mod styles;
pub mod components;
pub mod menu_principal;
pub mod gestion_equipe;
pub mod preparation_match;
pub mod match_en_cours;
pub mod resultat_match;
pub mod classement;
pub mod fiches_joueurs;

use bevy::prelude::*;
use menu_principal::MenuPrincipalPlugin;
use gestion_equipe::GestionEquipePlugin;
use preparation_match::PreparationMatchPlugin;
use match_en_cours::MatchEnCoursPlugin;
use resultat_match::ResultatMatchPlugin;
use classement::ClassementPlugin;
use fiches_joueurs::FichesJoueursPlugin;

/// Plugin regroupant toute l'interface utilisateur
pub struct UIPlugin;

impl Plugin for UIPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins((
            MenuPrincipalPlugin,
            GestionEquipePlugin,
            PreparationMatchPlugin,
            MatchEnCoursPlugin,
            ResultatMatchPlugin,
            ClassementPlugin,
            FichesJoueursPlugin,
        ));
    }
}
